var express = require('express');
var app = express();
var server = require('http').createServer(app);
var io = require('socket.io')(server);
const port = process.env.PORT || 8080;

const pi2 = Math.PI * 2;
// ---- CONFIG VARS ----
const shSettings = { 
    chatSpamTime: 250, // time that must elapse between each chat message in milliseconds
    tickRate: 60, // 40 updates per second
    tickInterval: (1000 / 60),
    syncRate: 30,
    syncInterval: (1000 / 30),
    grid: {
        cell: {width: 96, height: 96},
        count: {width: 24, height: 24},
        center: {x: 0, y: 0},
        pos: {x: 0, y: 0},
        offset: {x: 0, y: 0},
        cutoffs: {
            offsets: {x: 0, y: 0},
            sizes: {width: 0, height: 0}
        }
    }
};
shSettings.grid.center = {
    x: shSettings.grid.cell.width * shSettings.grid.count.width * -0.5, 
    y: shSettings.grid.cell.height * shSettings.grid.count.height * -0.5
};

const syncTime = shSettings.syncInterval / 1000;
const deltaTime = shSettings.tickInterval / 1000;

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

const svSettings = { 
    login: {
        minNickLength: 2, // Minimum number of characters in a nickname
        maxNickLength: 16, // Maximum number of characters in a nickname
        whitelistedCharacters: /^[0-9a-zA-Z]*$/ // Legal characters in a nickname /^[a-zA-Z0-9- ]*$/
    },
    projectile: {
        lifetime: 2.5,
        firerate: 0.75
    }
};
// ---- CONFIG END -----

const responses = {
    login: { 
        success: 'Successfully logged in.', 
        alreadyActive: 'Nickname is already active', 
        tooShort: 'Nickname is too short', 
        tooLong: 'Nickname is too long',
        illegalChars: 'Nickname contains illegal characters', 
        error: 'Unknown Error' 
    }
};

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
    val = val % pi2;
    if (val > Math.PI) { val -= pi2; }
    else if (val < -Math.PI) { val += pi2; }
    return val;
}

function DeltaAng(value, target) {
    var diff = FixAng(target) - FixAng(value);
    var absDiff = Math.abs(diff);
    var sign = (diff == 0 ? 1 : (diff / absDiff)) * -1;
    return FixAng((pi2 - absDiff) * sign);
}

function Clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

/*function InBounds(value, min, max) {
    return (value <= max && value >= min);
}

function OutOfBounds(value, min, max) {
    return (value > max || value < min);
}

function Lerp(value, target, fraction) {
    return value + (target - value) * fraction;
}*/

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
        pos: { x: 0, y: 0 },
        vel: { x: 0, y: 0 }
    }

    this.tick = function(realDeltaTime) {
        self.obj.pos.x += self.obj.vel.x * realDeltaTime;
        self.obj.pos.y += self.obj.vel.y * realDeltaTime;
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
    this.pOwn = null;

    this.life = svSettings.projectile.lifetime;

    this.objTick = this.tick;
    this.tick = function(realDeltaTime) {
        self.objTick(realDeltaTime);
        self.life -= realDeltaTime;
    }
}

/*function Asteroid() {
    GameObject.call(this);

    var self = this;

    this.objTick = this.tick;
    this.tick = function() {
        self.objTick();

    }
}*/

// -- Socket IO --
var clients = [];
var gameObjects = {};

function systemLog(message, tag = '') {
    if (tag != '') { tag = '<' + tag + '> '; }
    console.log(GetTime() + ' [SYSTEM] ' + tag + message);
};

function broadcastSysMsg(msg) {
    var sendData = {message: msg};
    for (var key in clients) {
        if (clients.hasOwnProperty(key)) {
            clients[key].socket.emit('system_message', sendData);
        }
    }
}

function broadcastMessage(sender, msg) {
    var sendData = {senderNick: sender.nickname, message: msg};
    for (var key in clients) {
        if (clients.hasOwnProperty(key)) {
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
    if (realDeltaTimeMS > deltaTime * 1350) {
        systemLog('Warning, Heavy load detected, Tick time: ' + realDeltaTimeMS + 'ms Threshold: ' + deltaTime * 1350 + 'ms Optimal: ' + deltaTime * 1000 + 'ms');
    }
    lastUpdateTime = currentSysTime;

    // Perform updates on player positions based on their inputs
    for (var i in clients) {
        if (clients.hasOwnProperty(i)) {
            clients[i].tick(realDeltaTime);
        }
    }

    // Update projectile positions
    for (var obj in gameObjects) {
        if (gameObjects.hasOwnProperty(obj)) {
            gameObjects[obj].tick(realDeltaTime);
            if (gameObjects[obj].hasOwnProperty('life')) { // Object is projectile
                if (gameObjects[obj].life <= 0) {
                    gameObjects[obj].destroy();
                    delete gameObjects[obj];
                }
            }
        }
    }

    // Update asteroid positions, spawn new ones if needed


    // Compile previous information to data packet to be sent to players to replicate

    
    syncTimer += realDeltaTime;
    if (syncTimer >= syncTime) {
        syncTimer -= syncTime;
        
        var plyData = {};
        for (var i in clients) {
            if (clients.hasOwnProperty(i)) {
                if (clients[i].loggedIn) {
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
                if (clients[i].loggedIn) {
                    var tmp = plyData[clients[i].pId];
                    delete plyData[clients[i].pId];
                    clients[i].updatePlayer({user: clients[i].collateHostData(), plys: plyData, objs: objData});
                    plyData[clients[i].pId] = tmp;
                }
            }
        }
    }
}
setInterval(Tick, shSettings.tickInterval);

// Client object constructor
function ClientVars(sck) {
    var self = this;
    this.pId = GeneratePlayerId();
    this.ship = {
        tarAng: 0,
        thrust: 0,
        pos: {x: 0, y: 0},
        vel: {x: 0, y: 0},
        ang: 0,
        fireTimer: svSettings.projectile.firerate,
        fireReady: false
    };
    this.sent = {
        fireReady: false
    }
    this.socket = sck;
    this.loggedIn = false;

    // Create log method 
    this.log = function(message, tag = '') {
        if (tag != '') { tag = '<' + tag + '> '; }
        console.log(GetTime() + ' [SOCKET.IO] ' + tag + message + ' {' + this.socket.request.connection.remoteAddress + ':' + this.socket.request.connection.remotePort + '}');
    };

    // Disconnect method
    this.disconnect = function() {
        clients.splice(clients.indexOf(self), 1);
        self.destroy();
        self.log('Client ' + (self.loggedIn ? ('"' + self.nickname + '" ') : '') + 'has disconnected');
    };
    this.socket.on('disconnect', self.disconnect);

    // Init settings
    this.initSettings = function() {
        self.socket.emit('settings_init', { settings: shSettings });
    }
    this.initSettings();

    // -- LOGIN --
    this.nickname = null;
    this.loginAttempt = function(data) {
        if (self.loggedIn === false) {
            var loginResponse = responses.login.error, loginSuccess = false;
            if (data.nick.length < svSettings.login.minNickLength) {
                loginResponse = responses.login.tooShort;
            }
            else if (data.nick.length > svSettings.login.maxNickLength) {
                loginResponse = responses.login.tooLong;
            }
            else if (!data.nick.match(svSettings.login.whitelistedCharacters)) {
                loginResponse = responses.login.illegalChars;
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
                    loginResponse = responses.login.alreadyActive;
                }
                else {
                    loginResponse = responses.login.success;
                    loginSuccess = true;
                }
            }
            if (loginSuccess) {
                self.loggedIn = true;
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
    this.socket.on('login_attempt', self.loginAttempt);

    // -- CHAT --
    var lastMessageTime = Date.now() - shSettings.chatSpamTime;
    // Chat message recieved
    this.chatRecieved = function(data) {
        if (self.loggedIn) {
            if (lastMessageTime + shSettings.chatSpamTime <= Date.now()) {
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
    this.socket.on('chat_message', self.chatRecieved);

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

        if ((self.ship.pos.x < shSettings.grid.center.x && self.ship.vel.x < 0) || (self.ship.pos.x > -shSettings.grid.center.x && self.ship.vel.x > 0)) { 
            self.ship.vel.x = 0; 
        }
        if ((self.ship.pos.y < shSettings.grid.center.y && self.ship.vel.y < 0) || (self.ship.pos.y > -shSettings.grid.center.y && self.ship.vel.y > 0)) {
            self.ship.vel.y = 0; 
        }
        
        self.ship.pos.x += self.ship.vel.x * realDeltaTime;
        self.ship.pos.y += self.ship.vel.y * realDeltaTime;
        
        self.ship.pos.x = Clamp(self.ship.pos.x, shSettings.grid.center.x, -shSettings.grid.center.x);
        self.ship.pos.y = Clamp(self.ship.pos.y, shSettings.grid.center.y, -shSettings.grid.center.y);
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
        return { tarAng: self.ship.tarAng, thrust: self.ship.thrust, pos: self.ship.pos, vel: self.ship.vel, ang: self.ship.ang };
    }

    this.fireProjectile = function() {
        var firedProjectile = new Projectile();
        firedProjectile.pOwn = self.pId;
        firedProjectile.obj.pos = self.ship.pos;
        firedProjectile.obj.vel = { x: Math.sin(self.ship.ang), y: Math.cos(self.ship.ang) };
        gameObjects[firedProjectile.oId] = firedProjectile;
        console.log(gameObjects);
    }

    this.playerUpdate = function(data) {
        if (self.loggedIn) {
            // Recieve client information about their input velocities and maybe camera position
            self.ship.tarAng = data.tarAng;
            self.ship.thrust = data.thrust;
            if (data.hasOwnProperty('fire') && self.ship.fireReady) {
                self.ship.fireTimer = svSettings.projectile.firerate;
                self.ship.fireReady = false;
                // Fire a projectile
                self.fireProjectile();
            }
        }
    }
    this.socket.on('player_update', this.playerUpdate);

    this.updatePlayer = function(data) {
        if (self.loggedIn) {
            // Send the client all new object positions, new object information, new player positions, etc.
            self.socket.emit('update_player', data);
        }
    }

    this.destroy = function() {
        freePlayerIds.unshift(self.pId);
        self.pId = null;
    }
}

// Client connection handler
function ClientConnected(socket) {
    // Create a new client object
    var cl = new ClientVars(socket)
    cl.log('Client has connected');
    clients.push(cl);
}

io.on('connection', ClientConnected)