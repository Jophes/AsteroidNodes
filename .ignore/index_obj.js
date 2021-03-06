var express = require('express');
var app = express();
var server = require('http').createServer(app);
var io = require('socket.io')(server);
const port = process.env.PORT || 8080;

var constants = require('./constants.js');
var controllers = require('./objects.js');

var ClientVars = controllers.client;
var Bot = controllers.bot;

var lastPlayerId = 1, freePlayerIds = [];
var lastObjectId = 1, freeObjectIds = [];

function GeneratePlayerId() {
    if (freePlayerIds.length > 0) {
        return freePlayerIds.pop();
    }
    else {
        return lastPlayerId++;
    }
}

function GenerateObjectId() {
    if (freeObjectIds.length > 0) {
        return freeObjectIds.pop();
    }
    else {
        return lastObjectId++;
    }
}

function GetTime() {
    var time = new Date();
    var secs = (time.getSeconds() + time.getMilliseconds() * 0.001).toFixed(3)
    var seconds = (secs.length < 6 ? '0' : '') + secs;
    var minutes = (time.getMinutes().toString().length < 2 ? '0' : '') + time.getMinutes();
    var hours = (time.getHours().toString().length < 2 ? '0' : '') + time.getHours();
    return '' + hours + ':' + minutes + ':' + seconds + ' -';
}

//  --------------------
// -- Global functions --
//  --------------------

function FixAng(val) {
    val = val % constants.pi2;
    if (val > Math.PI) { val -= constants.pi2; }
    else if (val < -Math.PI) { val += constants.pi2; }
    return val;
}

function DeltaAng(value, target) {
    var diff = FixAng(target) - FixAng(value);
    var absDiff = Math.abs(diff);
    var sign = (diff == 0 ? 1 : (diff / absDiff)) * -1;
    return FixAng((constants.pi2 - absDiff) * sign);
}

function Clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function InBounds(value, min, max) {
    return (value <= max && value >= min);
}

function OutOfBounds(value, min, max) {
    return (value > max || value < min);
}

/*function Lerp(value, target, fraction) {
    return value + (target - value) * fraction;
}*/

function Magnitude(vec) {
    return Math.sqrt(Math.pow(vec.x, 2) + Math.pow(vec.y, 2));
}

function Distance(vec1, vec2) {
    return Magnitude({x: vec1.x - vec2.x, y: vec1.y - vec2.y });
}

// Upper case vec2, lower case single floats
// S = start, E = end, C = circle, r = radius
function RayCastCircle(S, E, C, r) {
    var D = {x: E.x - S.x, y: E.y - S.y}, m = D.y / D.x;
    var a = 1 + Math.pow(m, 2), b = 2 * (m * (S.y - m * S.x - C.y) - C.x);
    var c = Math.pow(C.x, 2) + Math.pow(C.y, 2) - Math.pow(r, 2) + m * S.x * (m * S.x + 2 * C.y) - S.y * (2 * C.y + S.y);
    var discrim = Math.pow(b, 2) - 4 * a * c, returnData = [];
    for (let i = 0; i < (discrim > 0 ? 2 : (discrim == 0 ? 1 : 0)); i++) {
        var P = {x: (-b + Math.sqrt(discrim) * (1 - 2 * i)) / (2 * a), y: null};
        P.y = m * P.x - m * S.x + S.y;
        if (P.x >= S.x && P.y >= S.y && P.x <= E.x && P.y <= E.y) {
            returnData.push(P);
        }
    }
    return returnData;
}

//console.log(RayCastCircle({x: 3 + 4, y: 2}, {x: 6 + 4, y: 4}, {x: 4, y: 3}, 3));

// Listen for connections
function HandleServerStartup() {
    console.log(GetTime() + ' [SERVER] Server listening on port %d', port);
}
server.listen(port, HandleServerStartup);

// -- Express routing --
function AppLog(msg, req) {
    console.log(GetTime() + ' [APP] ' + msg + ' {' + req.ip + ':' + req.client.remotePort + '}');
}

function LogRequests(req, res, next) {
    //AppLog('Recieved ' + req.method + ' request for "' + req.url + '" from', req);
    next();
}

const servePages = ['/index.html','/resources/cheese.ico','/resources/main.js','/resources/styles.css'];
var renameTable = {'/': '/index.html'};
for(var i in servePages) {
    renameTable[servePages[i]] = servePages[i];
}

function HandleHomeGetRequest(req, res, next) {
    if (req.method == 'GET' && renameTable.hasOwnProperty(req.url))
    {
        var reqUrl = renameTable[req.url];
        //AppLog('Serving "' + reqUrl + '" to', req);
        var options = {
            root: __dirname + '/public/',
            dotfiles: 'deny',
            headers: {
                'x-timestamp': Date.now(),
                'x-sent': true
            }
        };

        var fileName = reqUrl;
        res.sendFile(fileName, options, function (err) {
            if (err) {
                next(err);
            } else {
                AppLog('Served "' + reqUrl + '" to', req);
            }
        });
    }
    else
    {
        AppLog('Recieved invalid request for ' + req.url + ' from', req);
        next();
    }
}

app.use(LogRequests);
app.use(HandleHomeGetRequest);

// Object constructors-
function GameObject() {
    var self = this;

    this.oId = GenerateObjectId();


    this.obj = { 
        type: constants.OBJECT_TYPE.OBJECT,
        pos: { x: 0, y: 0 },
        vel: { x: 0, y: 0 }
    }

    Object.defineProperty(self, 'pos', {
        get: function() {
            return self.obj.pos;
        },
        set: function(value) {
            self.obj.pos = value;
        }
    });
    Object.defineProperty(self, 'type', {
        get: function() {
            return self.obj.type;
        },
        set: function(value) {
            self.obj.type = value;
        }
    });

    this.tick = function(realDeltaTime) {
        self.obj.pos.x += self.obj.vel.x * realDeltaTime;
        self.obj.pos.y += self.obj.vel.y * realDeltaTime;
    }

    this.postTick = function() {
    }

    this.collateData = function() {
        return self.obj;
    }

    this.destroy = function() {
        freeObjectIds.unshift(self.oId);
        self.oId = null;
    }
}

function Projectile() {
    GameObject.call(this);

    var self = this;

    this.obj.pOwn = null;

    this.life = constants.svSettings.projectile.lifetime;

    this.type = constants.OBJECT_TYPE.PROJECTILE;

    this.objTick = this.tick;
    this.tick = function(realDeltaTime) {
        self.objTick(realDeltaTime);
        self.life -= realDeltaTime;
    }

    this.calcCollision = function(pos, radius) {
        var data = {hit: false, pos: null, distance: null, time: null};
        var hitPositions = RayCastCircle(self.pos, {x: self.pos.x + self.obj.vel.x, y: self.pos.y + self.obj.vel.y}, pos, radius);
        for (let i = 0; i < hitPositions.length; i++) {
            var dist = Distance(self.pos, hitPositions[i])
            if (data.distance < dist || !data.hit) {
                data.hit = true;
                data.pos = hitPositions[i];
                data.distance = dist;
                data.time = data.distance / Magnitude(self.obj.vel);
            }
        }
        return data;
    }

    this.checkCollisions = function() {
        for (const i in clients) {
            if (clients.hasOwnProperty(i)) {
                if (clients[i].isActive() && clients[i].pId != self.obj.pOwn && Distance(self.pos, clients[i].ship.pos) <= 14) {
                    self.life = 0;
                    clients[i].kill(clients[self.obj.pOwn].nickname);
                    break;
                }
            }
        }
        for (const i in gameObjects) {
            if (gameObjects.hasOwnProperty(i)) {
                if (gameObjects[i].type == constants.OBJECT_TYPE.ASTEROID && Distance(self.pos, gameObjects[i].obj.pos) <= gameObjects[i].collisionRad) {
                    self.life = 0;
                    gameObjects[i].respawn();
                    break;
                }
            }
        }
        /*for (const i in clients) {
            if (clients.hasOwnProperty(i)) {
                if (clients[i].pId != self.obj.pOwn) {
                    var hitData = self.calcCollision(clients[i].ship.pos, 14);
                    if (hitData.hit)
                    {
                        self.life = 0;
                        break;
                    }
                }
            }
        }
        for (const i in gameObjects) {
            if (gameObjects.hasOwnProperty(i)) {
                if (gameObjects[i].type == OBJECT_TYPE.ASTEROID) {
                    var hitData = self.calcCollision(gameObjects[i].pos, gameObjects[i].collisionRad);
                    if (hitData.hit)
                    {
                        self.life = 0;
                        gameObjects[i].respawn();
                        break;
                    }
                }
            }
        }*/
    }

    this.postTick = function() {
        self.checkCollisions();
    }
}

function Asteroid() {
    GameObject.call(this);

    var self = this;

    this.generateVisData = function() {
        self.obj.ang = constants.pi2 * Math.random();
        var velMag = (46 + Math.random() * 72);
        self.obj.vel = {x: Math.sin(self.obj.ang) * velMag, y: Math.cos(self.obj.ang) * velMag};
        self.obj.angVel = (Math.random() - 0.5) * 1.5;
    
        self.visData = {points: 6 + Math.floor(Math.random() * 12), rads: []};
        self.collisionRad = 8 + self.visData.points * 2.5; 
        for (var i = 0; i < self.visData.points; i++) {
            self.visData.rads[i] = self.collisionRad + (Math.random() - 0.5) * (6 + (self.visData.points - 6) * 2.5);
        }
        this.outerRad = this.collisionRad + (6 + (this.visData.points - 6) * 2.5) * 0.5 + 2;
    }
    this.generateVisData();

    this.type = constants.OBJECT_TYPE.ASTEROID;

    this.respawn = function() {
        this.generateVisData();
        var ang = FixAng(Math.atan2(self.obj.vel.x, self.obj.vel.y));
        if (InBounds(ang, Math.PI * -0.25, Math.PI * 0.25)) {
            self.obj.pos.x = (Math.random() * 2 - 1) * constants.shSettings.grid.center.x;
            self.obj.pos.y = constants.shSettings.grid.center.y - self.outerRad + 2;
        }
        else if (InBounds(ang, Math.PI * 0.25, Math.PI * 0.75)) {
            self.obj.pos.x = constants.shSettings.grid.center.x - self.outerRad + 2;
            self.obj.pos.y = (Math.random() * 2 - 1) * constants.shSettings.grid.center.x;
        }
        else if (ang > Math.PI * 0.75 || ang < Math.PI * -0.75) {
            self.obj.pos.x = (Math.random() * 2 - 1) * constants.shSettings.grid.center.x;
            self.obj.pos.y = -constants.shSettings.grid.center.y + self.outerRad - 2;
        }
        else if (InBounds(ang, Math.PI * -0.75, Math.PI * -0.25)) {
            self.obj.pos.x = -constants.shSettings.grid.center.x + self.outerRad - 2;
            self.obj.pos.y = (Math.random() * 2 - 1) * constants.shSettings.grid.center.y;
        }
        
        /*self.obj.pos.x = (Math.random() * 2 - 1) * shSettings.grid.center.x;
        self.obj.pos.y = (Math.random() * 2 - 1) * shSettings.grid.center.y;*/
    }

    this.outOfBounds = function() {
        return OutOfBounds(self.obj.pos.x, constants.shSettings.grid.center.x - self.outerRad, self.outerRad - constants.shSettings.grid.center.x) || OutOfBounds(self.obj.pos.y, constants.shSettings.grid.center.y - self.outerRad, self.outerRad - constants.shSettings.grid.center.y);
    }

    this.objTick = this.tick;
    this.tick = function(realDeltaTime) {
        self.objTick(realDeltaTime);
        self.obj.ang += self.obj.angVel * realDeltaTime;
    }

    this.collateData = function() {
        return {type: self.type, obj: self.obj, vis: self.visData};
    }
}

// -- Socket IO --
var clients = {};
var gameObjects = {};

for (var i = 0; i < 16; i++) {
    var asteroid = new Asteroid();
    asteroid.obj.pos.x = (Math.random() * 2 - 1) * constants.sh.grid.center.x;
    asteroid.obj.pos.y = (Math.random() * 2 - 1) * constants.sh.grid.center.y;
    gameObjects[asteroid.oId] = asteroid;
}/*
for (var i = 0; i < 1; i++) {
    var asteroid = new Asteroid();
    asteroid.obj.pos.x = 0;
    asteroid.obj.pos.y = 128;
    gameObjects[asteroid.oId] = asteroid;
}*/
for (let i = 0; i < 32; i++) {
    var newBot = new Bot();
    clients[newBot.pId] = newBot;
}

function systemLog(message, tag = '') {
    if (tag != '') { tag = '<' + tag + '> '; }
    console.log(GetTime() + ' [SYSTEM] ' + tag + message);
};

function broadcastSysMsg(msg) {
    var sendData = {message: msg};
    for (var key in clients) {
        if (clients.hasOwnProperty(key) && !clients[key].bot) {
            clients[key].socket.emit('system_message', sendData);
        }
    }
    systemLog(msg, 'GAME')
}

function broadcastExcluded(msg, excludedId) {
    var sendData = {message: msg};
    for (var key in clients) {
        if (clients.hasOwnProperty(key) && !clients[key].bot && key != excludedId) {
            clients[key].socket.emit('system_message', sendData);
        }
    }
    systemLog(msg, 'GAME')
}

function broadcastMessage(sender, msg) {
    var sendData = {senderNick: sender.nickname, message: msg};
    for (var key in clients) {
        if (clients.hasOwnProperty(key) && !clients[key].bot) {
            clients[key].socket.emit('chat_message', sendData);
        }
    }
}

var lastUpdateTime = process.hrtime();
var syncTimer = 0;
function Tick() {
    var currentSysTime = process.hrtime();
    var realDeltaTimeMS = (currentSysTime[0] - lastUpdateTime[0]) * 1000 + (currentSysTime[1] - lastUpdateTime[1]) / 1000000;
    var realDeltaTime = realDeltaTimeMS / 1000;
    if (realDeltaTimeMS > constants.deltaTime * 1350) {
        //systemLog('Warning, Heavy load detected, Tick time: ' + realDeltaTimeMS + 'ms Threshold: ' + deltaTime * 1350 + 'ms Optimal: ' + deltaTime * 1000 + 'ms');
    }
    lastUpdateTime = currentSysTime;

    // Perform updates on player positions based on their inputs
    for (var i in clients) {
        if (clients.hasOwnProperty(i)) {
            clients[i].tick(realDeltaTime);
        }
    }

    // Update gameObject positions
    for (const i in gameObjects) {
        if (gameObjects.hasOwnProperty(i)) {
            gameObjects[i].tick(realDeltaTime);
            switch (gameObjects[i].type) {
                case constants.OBJECT_TYPE.ASTEROID:
                    // Update asteroid positions, spawn new ones if needed
                    if (gameObjects[i].outOfBounds()) {
                        gameObjects[i].respawn();
                    }
                    break;
                default:
                    break;
            }
        }
    }

    // Post tick for projectiles, check if they're colliding with any players or asteroids and take action
    for (const i in gameObjects) {
        if (gameObjects.hasOwnProperty(i)) {
            gameObjects[i].postTick();
            switch (gameObjects[i].type) {
                case constants.OBJECT_TYPE.PROJECTILE:
                    if (gameObjects[i].life <= 0) {
                        gameObjects[i].destroy();
                        delete gameObjects[i];
                    }
                    break;
                default:
                    break;
            }
        }
    }

    // Compile previous information to data packet to be sent to players to replicate
    syncTimer += realDeltaTime;
    if (syncTimer >= constants.syncTime) {
        syncTimer -= constants.syncTime;
        
        var plyData = {};
        for (var i in clients) {
            if (clients.hasOwnProperty(i)) {
                if (clients[i].isActive()) {
                    plyData[clients[i].pId] = clients[i].collateDroneData();
                }
            }
        }

        var objData = {};
        for (var i in gameObjects) {
            if (gameObjects.hasOwnProperty(i)) {
                if (gameObjects[i]) {
                    objData[gameObjects[i].oId] = gameObjects[i].collateData();
                }
            }
        }

        for (var i in clients) {
            if (clients.hasOwnProperty(i)) {
                if (clients[i].isActive()) {
                    var tmp = plyData[clients[i].pId];
                    delete plyData[clients[i].pId];
                    clients[i].updatePlayer({user: clients[i].collateHostData(), plys: plyData, objs: objData});
                    plyData[clients[i].pId] = tmp;
                }
            }
        }
    }
}
setInterval(Tick, constants.sh.tickInterval);


// Client object constructor
function ClientVars(sck) {
    var self = this;
    this.bot = false;
    this.alive = false;
    this.health = 0;
    if (sck == null) {
        this.bot = true;
    }
    this.pId = GeneratePlayerId();
    this.ship = {
        tarAng: 0,
        thrust: 0,
        pos: {x: 0, y: 0},
        vel: {x: 0, y: 0},
        ang: 0,
        fireTimer: constants.svSettings.projectile.fireRate,
        fireReady: false
    };
    this.ship.pos.x = (Math.random() * 2 - 1) * constants.shSettings.grid.center.x;
    this.ship.pos.y = (Math.random() * 2 - 1) * constants.shSettings.grid.center.y;
    this.sent = {
        fireReady: false
    }
    this.socket = sck;
    this.loggedIn = false;

    // Create log method 
    this.log = function(message, tag = '') {
        if (tag != '') { tag = '<' + tag + '> '; }
        console.log(GetTime() + ' [SOCKET.IO] ' + tag + message + (!self.bot ? ' {' + this.socket.request.connection.remoteAddress + ':' + this.socket.request.connection.remotePort + '}' : '{BOT}'));
    };

    this.respawn = function() {
        self.health = 0;
        self.alive = true;
    }

    this.isActive = function() {
        return self.alive && self.loggedIn;
    }
    
    this.kill = function(killerNick) {
        self.alive = false;
        self.loggedIn = false;

        broadcastExcluded(self.nickname + ' was killed by ' + killerNick, self.pId);

        if (!self.bot) {
            self.socket.emit('update_death', { killer: killerNick });
        }

        for (const i in gameObjects) {
            if (gameObjects.hasOwnProperty(i)) {
                if (gameObjects[i].type == constants.OBJECT_TYPE.PROJECTILE && gameObjects[i].obj.pOwn == self.pId) {
                    gameObjects[i].destroy();
                    delete gameObjects[i];
                }
            }
        }

        delete self.nickname;
    }

    // Disconnect method
    this.disconnect = function() {
        delete clients[self.pId];
        self.destroy();
        self.log('Client ' + (self.loggedIn ? ('"' + self.nickname + '" ') : '') + 'has disconnected');
    };

    // Init settings
    this.initSettings = function() {
        self.socket.emit('settings_init', { settings: constants.shSettings });
    }

    // -- LOGIN --
    this.nickname = null;
    this.loginAttempt = function(data) {
        if (!self.bot && !self.loggedIn) {
            var loginResponse = constants.responses.login.error, loginSuccess = false;
            if (data.nick.length < constants.svSettings.login.minNickLength) {
                loginResponse = constants.responses.login.tooShort;
            }
            else if (data.nick.length > constants.svSettings.login.maxNickLength) {
                loginResponse = constants.responses.login.tooLong;
            }
            else if (!data.nick.match(constants.svSettings.login.whitelistedCharacters)) {
                loginResponse = constants.responses.login.illegalChars;
            }
            else {
                var nicknameInuse = false;
                for (var key in clients) {
                    if (clients.hasOwnProperty(key)) {
                        var nickname = clients[key].nickname;
                        if (nickname !== null && nickname == data.nick) {
                            nicknameInuse = true;
                            break;
                        }
                    }
                }
                if (nicknameInuse) {
                    loginResponse = constants.responses.login.alreadyActive;
                }
                else {
                    loginResponse = constants.responses.login.success;
                    loginSuccess = true;
                }
            }
            if (loginSuccess) {
                self.loggedIn = true;
                self.alive = true;
                self.nickname = data.nick;
                self.log('Client sucessfully logged in with nickname: "' + data.nick + '"');
            }
            else {
                self.log('Client failed logging in with nickname: "' + data.nick + '" due to: "' + loginResponse + '"');
            }
            self.socket.emit('login_response', { successful: loginSuccess, msg: loginResponse });
            if (self.loggedIn) {
                broadcastSysMsg('"' + data.nick + '" has joined.'); 
            }
        }
        else {
            self.log('Ignoring login request for client already logged in', 'WARNING');
        }
    }

    // -- CHAT --
    var lastMessageTime = Date.now() - constants.shSettings.chatSpamTime;
    // Chat message recieved
    this.chatRecieved = function(data) {
        if (!self.bot && self.isActive()) {
            if (lastMessageTime + constants.shSettings.chatSpamTime <= Date.now()) {
                self.log(data.message, 'CHAT');
                broadcastMessage(self, data.message);
            }
            else {
                self.log('SUPRESSED: "' + data.message + '"', 'CHAT');
            }
            lastMessageTime = Date.now();
        }
        else {
            self.log('Ignoring chat message from client not logged in', 'WARNING')
        }
    };

    // -- Game Updates --
    this.tick = function(realDeltaTime) {
        if (self.ship.fireTimer > 0) {
            self.ship.fireTimer -= realDeltaTime;            
        }
        else if (self.ship.fireTimer <= 0 && !self.ship.fireReady) {
            self.ship.fireReady = true;
        }
        
        var angDiff = DeltaAng(self.ship.ang, self.ship.tarAng);
        if (angDiff > 1) { angDiff = 1; }
        else if (angDiff < -1) { angDiff = -1; }

        self.ship.vel.x *= 0.875;
        self.ship.vel.y *= 0.875;

        self.ship.ang += angDiff * 7.5 * self.ship.thrust * realDeltaTime;

        self.ship.vel.x -= Math.sin(self.ship.ang) * self.ship.thrust * realDeltaTime * 1500;
        self.ship.vel.y -= Math.cos(self.ship.ang) * self.ship.thrust * realDeltaTime * 1500;

        if ((self.ship.pos.x < constants.shSettings.grid.center.x && self.ship.vel.x < 0) || (self.ship.pos.x > -constants.shSettings.grid.center.x && self.ship.vel.x > 0)) { 
            self.ship.vel.x = 0; 
        }
        if ((self.ship.pos.y < constants.shSettings.grid.center.y && self.ship.vel.y < 0) || (self.ship.pos.y > -constants.shSettings.grid.center.y && self.ship.vel.y > 0)) {
            self.ship.vel.y = 0; 
        }
        
        self.ship.pos.x += self.ship.vel.x * realDeltaTime;
        self.ship.pos.y += self.ship.vel.y * realDeltaTime;
        
        self.ship.pos.x = Clamp(self.ship.pos.x, constants.shSettings.grid.center.x, -constants.shSettings.grid.center.x);
        self.ship.pos.y = Clamp(self.ship.pos.y, constants.shSettings.grid.center.y, -constants.shSettings.grid.center.y);
    }

    this.collateHostData = function() {
        var returnObj = { pos: self.ship.pos, vel: self.ship.vel, ang: self.ship.ang };
        if (self.sent.fireReady != self.ship.fireReady) {
            self.sent.fireReady = self.ship.fireReady;
            returnObj.fireReady = self.ship.fireReady;
        }
        return returnObj;
    }

    this.collateDroneData = function() { 
        return { tarAng: self.ship.tarAng, thrust: self.ship.thrust, pos: self.ship.pos, vel: self.ship.vel, ang: self.ship.ang, pId: self.pId };
    }

    this.fireProjectile = function() {
        var firedProjectile = new Projectile();
        firedProjectile.obj.pOwn = self.pId;
        firedProjectile.obj.pos.x = self.ship.pos.x;
        firedProjectile.obj.pos.y = self.ship.pos.y;
        firedProjectile.obj.vel = { x: Math.sin(Math.PI + self.ship.ang) * 1024, y: Math.cos(Math.PI + self.ship.ang) * 1024 };
        gameObjects[firedProjectile.oId] = firedProjectile;
    }

    this.playerUpdate = function(data) {
        if (!self.bot && self.isActive()) {
            // Recieve client information about their input velocities and maybe camera position
            self.ship.tarAng = data.tarAng;
            self.ship.thrust = data.thrust;
            if (data.hasOwnProperty('fire') && self.ship.fireReady) {
                self.ship.fireTimer = constants.svSettings.projectile.fireRate;
                self.ship.fireReady = false;
                // Fire a projectile
                self.fireProjectile();
            }
        }
    }

    this.updatePlayer = function(data) {
        if (!self.bot && self.isActive()) {
            // Send the client all new object positions, new object information, new player positions, etc.
            self.socket.emit('update_player', data);
        }
    }

    this.destroy = function() {
        freePlayerIds.unshift(self.pId);
        self.pId = null;
    }

    if (!self.bot) {
        this.socket.on('disconnect', self.disconnect);
        this.initSettings();
        this.socket.on('login_attempt', self.loginAttempt);
        this.socket.on('chat_message', self.chatRecieved);
        this.socket.on('player_update', this.playerUpdate);
    }
}


function Bot() {
    ClientVars.call(this);

    var self = this;

    this.loggedIn = true;
    this.alive = true;
    this.nickname = 'Bot ' + self.pId;

    self.clTick = this.tick;
    this.tick = function(realDeltaTime) {
        if (self.alive) {
            if (self.ship.fireReady) {
                self.ship.fireTimer = constants.svSettings.projectile.fireRate;
                self.ship.fireReady = false;
                self.fireProjectile();
            }
    
            var dist = null, target = null;
            for (const i in gameObjects) {
                if (gameObjects.hasOwnProperty(i)) {
                    if (gameObjects[i].type == constants.OBJECT_TYPE.ASTEROID) {
                        var tmpDist = Distance(self.ship.pos, gameObjects[i].pos) * (0.8 + Math.random() * 0.4);
                        if (dist == null || tmpDist < dist) {
                            dist = tmpDist;
                            target = { x: gameObjects[i].pos.x - self.ship.pos.x, y: gameObjects[i].pos.y - self.ship.pos.y };;
                        }
                    }
                }
            }
            //for (const i in plys) {
            //    if (plys.hasOwnProperty(i)) {
            //        var tmpDist = Distance(self.ship.pos, plys[i].pos);
            //        if (dist == null || (plyTarget == false && tmpDist * 0.25 < dist) || tmpDist < dist) {
            //            dist = tmpDist;
            //            plyTarget = true;
            //            diff = { x: plys[i].pos.x - self.ship.pos.x, y: plys[i].pos.y - self.ship.pos.y };;
            //       }
            //    }
           // }
            
            if (target != null) {
                self.ship.thrust = (Magnitude(target) - constants.influenceZones.deadzoneRad) / constants.influenceZones.influenceRad;
                if (self.ship.thrust > 1) { self.ship.thrust = 1; }
                else if (self.ship.thrust < 0) { self.ship.thrust = 0; }
                if (self.ship.thrust <= 0.001) {
                    self.ship.thrust = 0;
                }
                self.ship.tarAng = Math.atan2(target.x, target.y) + Math.PI;
                if (self.ship.tarAng > Math.PI) { self.ship.tarAng -= constants.pi2; }
                else if (self.ship.tarAng < -Math.PI) { self.ship.tarAng += constants.pi2; }
            }
            else {
                self.ship.thruster.thrust = 0;
            }
    
            self.clTick(realDeltaTime);
        }
    }

    delete self.disconnect;
    delete self.loginAttempt;
    delete self.initSettings;
    delete self.loginAttempt;
    delete self.chatRecieved;
    delete self.playerUpdate;
}

// Client connection handler
function ClientConnected(socket) {
    // Create a new client object
    var cl = new ClientVars(socket)
    cl.log('Client has connected');
    clients[cl.pId] = cl;
}

io.on('connection', ClientConnected)