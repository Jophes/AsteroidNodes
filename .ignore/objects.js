module.exports = { };

const consts = require('./constants.js');

module.exports.client = function (sck, id, main) {
    var self = this;
    this.main = main;
    this.bot = false;
    this.alive = false;
    this.pId = id;
    if (sck == null) {
        this.bot = true;
    }
    this.ship = {
        tarAng: 0,
        thrust: 0,
        pos: {x: 0, y: 0},
        vel: {x: 0, y: 0},
        ang: 0,
        fireTimer: consts.sv.projectile.fireRate,
        fireReady: false
    };
    this.ship.pos.x = (Math.random() * 2 - 1) * consts.sh.grid.center.x;
    this.ship.pos.y = (Math.random() * 2 - 1) * consts.sh.grid.center.y;
    this.sent = {
        fireReady: false
    }
    this.socket = sck;
    this.loggedIn = false;

    // Create log method 
    this.log = function(message, tag = '') {
        if (tag != '') { tag = '<' + tag + '> '; }
        console.log(self.main.GetTime() + ' [SOCKET.IO] ' + tag + message + (!self.bot ? ' {' + this.socket.request.connection.remoteAddress + ':' + this.socket.request.connection.remotePort + '}' : '{BOT}'));
    };

    this.isActive = function() {
        return self.alive && self.loggedIn;
    }
    
    this.kill = function(killerNick) {
        self.alive = false;
        self.loggedIn = false;

        self.main.broadcastExcluded(self.nickname + ' was killed by ' + killerNick, self.pId);

        if (!self.bot) {
            self.socket.emit('update_death', { killer: killerNick });
        }

        for (const i in self.main.gameObjects) {
            if (self.main.gameObjects.hasOwnProperty(i)) {
                if (self.main.gameObjects[i].type == consts.OBJECT_TYPE.PROJECTILE && self.main.gameObjects[i].obj.pOwn == self.pId) {
                    self.main.gameObjects[i].destroy();
                    delete self.main.gameObjects[i];
                }
            }
        }

        delete self.nickname;
    }

    // Disconnect method
    this.disconnect = function() {
        delete self.main.clients[self.pId];
        self.destroy();
        self.log('Client ' + (self.loggedIn ? ('"' + self.nickname + '" ') : '') + 'has disconnected');
    };

    // Init settings
    this.initSettings = function() {
        self.socket.emit('settings_init', { settings: consts.sh });
    }

    // -- LOGIN --
    this.nickname = null;
    this.loginAttempt = function(data) {
        if (!self.bot && !self.loggedIn) {
            var loginResponse = consts.responses.login.error, loginSuccess = false;
            if (data.nick.length < consts.sv.login.minNickLength) {
                loginResponse = consts.responses.login.tooShort;
            }
            else if (data.nick.length > consts.sv.login.maxNickLength) {
                loginResponse = consts.responses.login.tooLong;
            }
            else if (!data.nick.match(consts.sv.login.whitelistedCharacters)) {
                loginResponse = consts.responses.login.illegalChars;
            }
            else {
                var nicknameInuse = false;
                for (var key in self.main.clients) {
                    if (self.main.clients.hasOwnProperty(key)) {
                        var nickname = self.main.clients[key].nickname;
                        if (nickname !== null && nickname == data.nick) {
                            nicknameInuse = true;
                            break;
                        }
                    }
                }
                if (nicknameInuse) {
                    loginResponse = consts.responses.login.alreadyActive;
                }
                else {
                    loginResponse = consts.responses.login.success;
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
                self.main.broadcastSysMsg('"' + data.nick + '" has joined.'); 
            }
        }
        else {
            self.log('Ignoring login request for client already logged in', 'WARNING');
        }
    }

    // -- CHAT --
    var lastMessageTime = Date.now() - consts.sh.chatSpamTime;
    // Chat message recieved
    this.chatRecieved = function(data) {
        if (!self.bot && self.isActive()) {
            if (lastMessageTime + consts.sh.chatSpamTime <= Date.now()) {
                self.log(data.message, 'CHAT');
                self.main.broadcastMessage(self, data.message);
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
        
        var angDiff = self.main.DeltaAng(self.ship.ang, self.ship.tarAng);
        if (angDiff > 1) { angDiff = 1; }
        else if (angDiff < -1) { angDiff = -1; }

        self.ship.vel.x *= 0.875;
        self.ship.vel.y *= 0.875;

        self.ship.ang += angDiff * 7.5 * self.ship.thrust * realDeltaTime;

        self.ship.vel.x -= Math.sin(self.ship.ang) * self.ship.thrust * realDeltaTime * 1500;
        self.ship.vel.y -= Math.cos(self.ship.ang) * self.ship.thrust * realDeltaTime * 1500;

        if ((self.ship.pos.x < consts.sh.grid.center.x && self.ship.vel.x < 0) || (self.ship.pos.x > -consts.sh.grid.center.x && self.ship.vel.x > 0)) { 
            self.ship.vel.x = 0; 
        }
        if ((self.ship.pos.y < consts.sh.grid.center.y && self.ship.vel.y < 0) || (self.ship.pos.y > -consts.sh.grid.center.y && self.ship.vel.y > 0)) {
            self.ship.vel.y = 0; 
        }
        
        self.ship.pos.x += self.ship.vel.x * realDeltaTime;
        self.ship.pos.y += self.ship.vel.y * realDeltaTime;
        
        self.ship.pos.x = self.main.Clamp(self.ship.pos.x, consts.sh.grid.center.x, -consts.sh.grid.center.x);
        self.ship.pos.y = self.main.Clamp(self.ship.pos.y, consts.sh.grid.center.y, -consts.sh.grid.center.y);
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
        var firedProjectile = new self.main.Projectile();
        firedProjectile.obj.pOwn = self.pId;
        firedProjectile.obj.pos.x = self.ship.pos.x;
        firedProjectile.obj.pos.y = self.ship.pos.y;
        firedProjectile.obj.vel = { x: Math.sin(Math.PI + self.ship.ang) * 1024, y: Math.cos(Math.PI + self.ship.ang) * 1024 };
        self.main.gameObjects[firedProjectile.oId] = firedProjectile;
    }

    this.playerUpdate = function(data) {
        if (!self.bot && self.isActive()) {
            // Recieve client information about their input velocities and maybe camera position
            self.ship.tarAng = data.tarAng;
            self.ship.thrust = data.thrust;
            if (data.hasOwnProperty('fire') && self.ship.fireReady) {
                self.ship.fireTimer = consts.sv.projectile.fireRate;
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
        self.main.freePlayerIds.unshift(self.pId);
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

module.exports.bot = function (main) {
    this.main = main;

    module.exports.client.call(this);

    var self = this;

    this.loggedIn = true;
    this.alive = true;
    this.nickname = 'Bot ' + self.pId;

    self.clTick = this.tick;
    this.tick = function(realDeltaTime) {
        if (self.alive) {
            if (self.ship.fireReady) {
                self.ship.fireTimer = consts.sv.projectile.fireRate;
                self.ship.fireReady = false;
                self.fireProjectile();
            }
    
            var dist = null, plyTarget = false, target = null;
            for (const i in self.main.gameObjects) {
                if (self.main.gameObjects.hasOwnProperty(i)) {
                    if (self.main.gameObjects[i].type == consts.OBJECT_TYPE.ASTEROID) {
                        var tmpDist = self.main.Distance(self.ship.pos, self.main.gameObjects[i].pos) * (0.8 + Math.random() * 0.4);
                        if (dist == null || tmpDist < dist) {
                            dist = tmpDist;
                            target = { x: self.main.gameObjects[i].pos.x - self.ship.pos.x, y: self.main.gameObjects[i].pos.y - self.ship.pos.y };;
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
                self.ship.thrust = (self.main.Magnitude(target) - consts.influenceZones.deadzoneRad) / consts.influenceZones.influenceRad;
                if (self.ship.thrust > 1) { self.ship.thrust = 1; }
                else if (self.ship.thrust < 0) { self.ship.thrust = 0; }
                if (self.ship.thrust <= 0.001) {
                    self.ship.thrust = 0;
                }
                self.ship.tarAng = Math.atan2(target.x, target.y) + Math.PI;
                if (self.ship.tarAng > Math.PI) { self.ship.tarAng -= consts.pi2; }
                else if (self.ship.tarAng < -Math.PI) { self.ship.tarAng += consts.pi2; }
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