module.exports = { };

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


const svSettings = { 
    login: {
        minNickLength: 2, // Minimum number of characters in a nickname
        maxNickLength: 16, // Maximum number of characters in a nickname
        whitelistedCharacters: /^[0-9a-zA-Z]*$/ // Legal characters in a nickname /^[a-zA-Z0-9- ]*$/
    },
    projectile: {
        lifetime: 2.5,
        fireRate: 0.25
    }
};
shSettings.grid.center = {
    x: shSettings.grid.cell.width * shSettings.grid.count.width * -0.5, 
    y: shSettings.grid.cell.height * shSettings.grid.count.height * -0.5
};
var influenceZones = {
    deadzoneRad: 14,
    influenceRad: 64,
    totalRad: 14 + 64
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

module.exports.client = function (sck) {
    var self = this;
    this.bot = false;
    this.alive = false;
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
        fireTimer: svSettings.projectile.fireRate,
        fireReady: false
    };
    this.ship.pos.x = (Math.random() * 2 - 1) * shSettings.grid.center.x;
    this.ship.pos.y = (Math.random() * 2 - 1) * shSettings.grid.center.y;
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
                if (gameObjects[i].type == OBJECT_TYPE.PROJECTILE && gameObjects[i].obj.pOwn == self.pId) {
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
        self.socket.emit('settings_init', { settings: shSettings });
    }

    // -- LOGIN --
    this.nickname = null;
    this.loginAttempt = function(data) {
        if (!self.bot && !self.loggedIn) {
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
    var lastMessageTime = Date.now() - shSettings.chatSpamTime;
    // Chat message recieved
    this.chatRecieved = function(data) {
        if (!self.bot && self.isActive()) {
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
                self.ship.fireTimer = svSettings.projectile.fireRate;
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

module.exports.bot = function () {
    module.exports.client.call(this);

    var self = this;

    this.loggedIn = true;
    this.alive = true;
    this.nickname = 'Bot ' + self.pId;

    self.clTick = this.tick;
    this.tick = function(realDeltaTime) {
        if (self.alive) {
            if (self.ship.fireReady) {
                self.ship.fireTimer = svSettings.projectile.fireRate;
                self.ship.fireReady = false;
                self.fireProjectile();
            }
    
            var dist = null, plyTarget = false, target = null;
            for (const i in gameObjects) {
                if (gameObjects.hasOwnProperty(i)) {
                    if (gameObjects[i].type == OBJECT_TYPE.ASTEROID) {
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
                self.ship.thrust = (Magnitude(target) - influenceZones.deadzoneRad) / influenceZones.influenceRad;
                if (self.ship.thrust > 1) { self.ship.thrust = 1; }
                else if (self.ship.thrust < 0) { self.ship.thrust = 0; }
                if (self.ship.thrust <= 0.001) {
                    self.ship.thrust = 0;
                }
                self.ship.tarAng = Math.atan2(target.x, target.y) + Math.PI;
                if (self.ship.tarAng > Math.PI) { self.ship.tarAng -= pi2; }
                else if (self.ship.tarAng < -Math.PI) { self.ship.tarAng += pi2; }
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