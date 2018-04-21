//  -------------------------
// -- Variable declarations --
//  -------------------------

var messageBox = {}, loginBox = {}, deathBox = {}, canvas, ctx; // HTML DOM elements
var scrolled = true;  // scrolled boolean, is the user is at the bottom of the chat
var socket = io(); // Socket IO

var pi2 = Math.PI * 2;

var messageBuffer = [], clearBufferTimeoutId;
var lastUpdate;

var alive = false, loggedIn = false;
var camPos = {x: 0, y: 0};

// Defaults, may be updated by the server
var svSettings = { 
    chatSpamTime: 250,
    updateInterval: (1000 / 40),
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
    },
};
svSettings.grid.center = {
    x: svSettings.grid.cell.width * svSettings.grid.count.width * -0.5, 
    y: svSettings.grid.cell.height * svSettings.grid.count.height * -0.5
};

// Colour table, updatable client side only so the user may customise their view of the game
var colors = {
    player: {
        ship: '#DDD',
        bot: '#F66',
        net: '#66F',
        thruster: '#BBB'
    },
    asteroid: '#DDD',
    rings: {
        outer: '#393',
        inner: '#933',
        asteroid: '#339'
    },
    grid: '#353535'
};

// Influence zones are used for controls, any adjustments will only effect how the vehicle controls and not the rate of turn or speed
var influenceZones = {
    deadzoneRad: 14,
    influenceRad: 64,
    totalRad: 14 + 64
};

// Grid spacing values so that the user can tell they're moving, client side only. May be adjusted for minor performance improvements


// Draw enum variables
var DRAW_MOVE = 0, DRAW_LINE = 1;
var PAGE_TYPE = { GAME: 0, STATS: 1 };
var OBJECT_TYPE = { OBJECT: 0, PROJECTILE: 1, ASTEROID: 2 };
var PLY_TYPE = { USER: 0, BOT: 1, NET: 2 };

// Polygon data for visual objects
var polys = {
    player: [
        {type: DRAW_MOVE, x: -9, y: 12},
        {type: DRAW_LINE, x: 0,  y: -12},
        {type: DRAW_LINE, x: 9,  y: 12},
        {type: DRAW_MOVE, x: 7,  y: 8},
        {type: DRAW_LINE, x: -7, y: 8}
    ],
    shipThruster: [
        {type: DRAW_MOVE, x: 4, y: 8},
        {type: DRAW_LINE, x: 0, y: 18},
        {type: DRAW_LINE, x: -4, y: 8}
    ]
};

// Calculate the angle and radius of each of the verticies for the polygon so they may be transformed correctly
for (var i in polys) {
    if (polys.hasOwnProperty(i)) {
        for (var j in polys[i]) {
            if (polys[i].hasOwnProperty(j)) {
                polys[i][j].ang = Math.atan2(polys[i][j].x, polys[i][j].y);
                polys[i][j].rad = Math.sqrt(Math.pow(polys[i][j].y, 2) + Math.pow(polys[i][j].x, 2));
            }
        }
    }
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

function InBounds(value, min, max) {
    return (value <= max && value >= min);
}

function OutOfBounds(value, min, max) {
    return (value > max || value < min);
}

function Lerp(value, target, fraction) {
    return value + (target - value) * fraction;
}

function Magnitude(vec) {
    return Math.sqrt(Math.pow(vec.x, 2) + Math.pow(vec.y, 2));
}

function Distance(vec1, vec2) {
    return Magnitude({x: vec1.x - vec2.x, y: vec1.y - vec2.y });
}

//  -----------
// -- Objects --
//  -----------

function VisObject(polyData) {
    var self = this;
    this.polyData = polyData;
    this.pos = {x: 0, y: 0};
    this.ang = 0;

    this.draw = function() {
        ctx.beginPath();
        for (var key in self.polyData) {
            if (self.polyData.hasOwnProperty(key)) {
                var poly = self.polyData[key];
                var translatedPos = { x: camPos.x + svSettings.grid.offset.x + self.pos.x + Math.sin(self.ang + poly.ang) * poly.rad, y: camPos.y + svSettings.grid.offset.y + self.pos.y + Math.cos(self.ang + poly.ang) * poly.rad };
                if (poly.type == DRAW_LINE) {
                    ctx.lineTo(translatedPos.x, translatedPos.y);
                }
                else {
                    ctx.moveTo(translatedPos.x, translatedPos.y);
                }
            }
        }
        ctx.stroke();
    }
}

function Asteroid() {
    var self = this;

    self.type = OBJECT_TYPE.ASTEROID;
    self.outerRad = 0;
    self.collisionRad = 0;

    this.visObj = new VisObject([]);
    Object.defineProperty(self, 'polyData', {
        get: function() {
            return self.visObj.polyData;
        },
        set: function(value) {
            self.visObj.polyData = value;
        }
    });
    Object.defineProperty(self, 'pos', {
        get: function() {
            return self.visObj.pos;
        },
        set: function(value) {
            self.visObj.pos = value;
        }
    });
    this.pos = {x: 0, y: 0};

    Object.defineProperty(self, 'ang', {
        get: function() {
            return self.visObj.ang;
        },
        set: function(value) {
            self.visObj.ang = value;
        }
    });
    this.ang = 0;
    this.vel = {x: 0, y: 0};
    this.angVel = 0;

    this.generatePolyData = function(points, rads) {
        var angStep = pi2 / points;
        self.polyData = [];
        for (var i = 0; i < points; i++) {
            self.polyData[i] = {type: (i == 0 ? DRAW_MOVE : DRAW_LINE), ang: angStep * i, rad: rads[i]};
        }
        self.polyData[points] = {type: DRAW_LINE, ang: self.polyData[0].ang, rad: self.polyData[0].rad};
        self.outerRad = 8 + points * 2.5 + (6 + (points - 6) * 2.5) * 0.5 + 2;
        self.collisionRad = 8 + points * 2.5;
    }

    this.importData = function(data) {
        for (const key in data.obj) {
            if (data.obj.hasOwnProperty(key) && self.hasOwnProperty(key)) {
                self[key] = data.obj[key];
            }
        }
        if (data.hasOwnProperty('vis')) {
            self.generatePolyData(data.vis.points, data.vis.rads);
        }
    };

    this.tick = function(deltaTime) {
        self.pos.x += self.vel.x * deltaTime;
        self.pos.y += self.vel.y * deltaTime;
        self.ang += self.angVel * deltaTime;
    };

    this.draw = function() {
        /*ctx.strokeStyle = colors.rings.asteroid;
        if (self.outerRad) {
            ctx.beginPath();
            ctx.arc(camPos.x + svSettings.grid.offset.x + self.pos.x, camPos.y + svSettings.grid.offset.y + self.pos.y, self.outerRad, 0, pi2);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(camPos.x + svSettings.grid.offset.x + self.pos.x, camPos.y + svSettings.grid.offset.y + self.pos.y);
            ctx.lineTo(camPos.x + svSettings.grid.offset.x + self.pos.x - Math.sin(self.ang) * influenceZones.totalRad, camPos.y + svSettings.grid.offset.y + self.pos.y - Math.cos(self.ang) * influenceZones.totalRad);
            ctx.stroke();
        }

        if (self.collisionRad) {
            ctx.strokeStyle = colors.rings.inner;
            ctx.beginPath();
            ctx.arc(camPos.x + svSettings.grid.offset.x + self.pos.x, camPos.y + svSettings.grid.offset.y + self.pos.y, self.collisionRad, 0, pi2);
            ctx.stroke();
        }*/

        if (self.polyData.length > 0) {
            ctx.strokeStyle = colors.asteroid;
            self.visObj.draw();
        }
    };
}

function Projectile() {
    var self = this;

    self.type = OBJECT_TYPE.PROJECTILE;
    this.visObj = new VisObject([{type: DRAW_MOVE, ang: 0, rad: 0},{type: DRAW_LINE, ang: 0, rad: 25}]);

    Object.defineProperty(self, 'pos', {
        get: function() {
            return self.visObj.pos;
        },
        set: function(value) {
            self.visObj.pos = value;
        }
    });

    this.velDat = {x: 0, y: 0};
    Object.defineProperty(self, 'vel', {
        get: function() {
            return self.velDat;
        },
        set: function(value) {
            self.velDat = value;
            self.updatePoly();
        }
    });

    this.updatePoly = function() {
        self.visObj.polyData[1].ang = Math.PI + Math.atan2(self.vel.x, self.vel.y);
        self.visObj.polyData[1].rad = Magnitude(self.vel) * (svSettings.tickInterval / 1000);
    }

    this.importData = function(data) {
        for (const key in data) {
            if (data.hasOwnProperty(key) && self.hasOwnProperty(key)) {
                self[key] = data[key];
            }
        }
    };

    this.tick = function(deltaTime) {
        self.pos.x += self.vel.x * deltaTime;
        self.pos.y += self.vel.y * deltaTime;
    };

    this.draw = function(dt) {
        ///if (self.visible) {
            ctx.strokeStyle = colors.player.ship;
            self.visObj.draw();
        //}
    };
}

function ShipThruster() {
    var self = this;

    this.thrust = 1;

    this.polyData = [ {type: polys.shipThruster[0].type, ang: polys.shipThruster[0].ang, rad: polys.shipThruster[0].rad},
        {type: polys.shipThruster[1].type, ang: polys.shipThruster[1].ang, rad: 8 + 10 * this.thrust}, // + Math.PI * 0.075
        {type: polys.shipThruster[2].type, ang: polys.shipThruster[2].ang, rad: polys.shipThruster[2].rad}];
    this.visObj = new VisObject(this.polyData);

    Object.defineProperty(self, 'pos', {
        get: function() {
            return self.visObj.pos;
        },
        set: function(value) {
            self.visObj.pos = value;
        }
    })

    this.updateTilt = function(tilt) {
        self.polyData[1].ang = polys.shipThruster[1].ang + Math.PI * 0.15 * tilt;
        self.visObj.polyData = self.polyData;
    }

    this.tick = function() {
        self.polyData[1].rad = 8 + 10 * this.thrust * (1 + Math.random()*0.3 - 0.15);
        self.visObj.polyData = self.polyData;
    }

    this.draw = function() {
        self.visObj.draw();
    };
}

function PlayerShip() {
    var self = this;

    this.ship = new VisObject(polys.player);
    Object.defineProperty(self, 'pos', {
        get: function() {
            return self.ship.pos;
        },
        set: function(value) {
            self.ship.pos = value;
            self.thruster.pos = value;
        }
    });

    this.thruster = new ShipThruster();
    Object.defineProperty(self, 'thrust', {
        get: function() {
            return self.thruster.thrust;
        },
        set: function(value) {
            self.thruster.thrust = value;
        }
    });

    this.thruster.tilt = 0;
    this.thrust = 0;
    this.type = PLY_TYPE.USER;

    this.pId = null;
    this.pos = {x: 0, y: 0};
    this.vel = {x: 0, y: 0};
    this.ang = 0; 
    this.health = 0;
    this.tarAng = 0;

    this.lastUpdate = Date.now();

    this.importData = function(data) {
        for (const key in data) {
            if (data.hasOwnProperty(key) && self.hasOwnProperty(key)) {
                self[key] = data[key];
            }
        }
        self.lastUpdate = Date.now();
    }

    this.tick = function(now) {
        var deltaTime = (now - self.lastUpdate) * 0.001;
        self.lastUpdate = now;

        var angDiff = DeltaAng(self.ang, self.tarAng);
        if (angDiff > 1) { angDiff = 1; }
        else if (angDiff < -1) { angDiff = -1; }
        self.thruster.updateTilt(-angDiff);
        
        self.vel.x *= 0.875;
        self.vel.y *= 0.875;

        self.ang += angDiff * 7.5 * self.thruster.thrust  * deltaTime;

        self.vel.x -= Math.sin(self.ang) * self.thruster.thrust * deltaTime * 1500;
        self.vel.y -= Math.cos(self.ang) * self.thruster.thrust * deltaTime * 1500;

        
        var force = { x: 0, y: 0 };
		for (const i in plys) {
            if (plys.hasOwnProperty(i) && i != self.pId) {
                const client = plys[i];
                var delta = { x: (self.pos.x + self.vel.x * now) - client.pos.x, y: (self.pos.y + self.vel.y * now) - client.pos.y };
                var deltaLen = Magnitude(delta);
                var minDist = influenceZones.deadzoneRad * 2 + 8 * (self.health - 1) + 8 * (client.health - 1);
                if (deltaLen < minDist) {
                    force.x += ((delta.x / deltaLen) * (minDist - deltaLen)) / now;
                    force.y += ((delta.y / deltaLen) * (minDist - deltaLen)) / now;
                }
            }
        }
        self.vel.x += force.x;
        self.vel.y += force.y;

        if ((self.pos.x < svSettings.grid.center.x && self.vel.x < 0) || (self.pos.x > -svSettings.grid.center.x && self.vel.x > 0)) { self.vel.x = 0; }
        if ((self.pos.y < svSettings.grid.center.y && self.vel.y < 0) || (self.pos.y > -svSettings.grid.center.y && self.vel.y > 0)) { self.vel.y = 0; }

        self.pos.x += self.vel.x * deltaTime;
        self.pos.y += self.vel.y * deltaTime;

        self.pos.x = Clamp(self.pos.x, svSettings.grid.center.x, -svSettings.grid.center.x);
        self.pos.y = Clamp(self.pos.y, svSettings.grid.center.y, -svSettings.grid.center.y);
        //self.pos = GridClamp(self.pos);

        //console.log('vel x: ' + self.vel.x + ' y: ' + self.vel.y + ' pos x: ' + self.pos.x + ' y: ' + self.pos.y + ' thrust: ' + self.thruster.thrust + ' dt: ' + deltaTime);
        self.thruster.tick(deltaTime);
    };

    this.draw = function() {
        /*if (self.type == PLY_TYPE.NET) {
            
            ctx.strokeStyle = colors.rings.inner;
            ctx.beginPath();
            ctx.arc(camPos.x + svSettings.grid.offset.x + self.ship.pos.x, camPos.y + svSettings.grid.offset.y + self.ship.pos.y, influenceZones.deadzoneRad, Math.PI * -0.5 - self.ship.tarAng, Math.PI * 1.5 - self.ship.tarAng);
            ctx.lineTo(camPos.x + svSettings.grid.offset.x + self.ship.pos.x - Math.sin(self.ship.tarAng) * influenceZones.totalRad, camPos.y + svSettings.grid.offset.y + self.ship.pos.y - Math.cos(self.ship.tarAng) * influenceZones.totalRad);
            ctx.stroke();

            ctx.strokeStyle = colors.rings.outer;
            ctx.beginPath();
            ctx.arc(camPos.x + svSettings.grid.offset.x + self.ship.pos.x, camPos.y + svSettings.grid.offset.y + self.ship.pos.y, influenceZones.totalRad, 0, pi2);
            ctx.stroke();

        }*/

        /*ctx.strokeStyle = colors.rings.inner;
        ctx.beginPath();
        ctx.arc(camPos.x + svSettings.grid.offset.x + self.pos.x, camPos.y + svSettings.grid.offset.y + self.pos.y, influenceZones.deadzoneRad, Math.PI * -0.5 - self.tarAng, Math.PI * 1.5 - self.tarAng);
        ctx.lineTo(camPos.x + svSettings.grid.offset.x + self.pos.x - Math.sin(self.tarAng) * influenceZones.totalRad, camPos.y + svSettings.grid.offset.y + self.pos.y - Math.cos(self.tarAng) * influenceZones.totalRad);
        ctx.stroke();

        ctx.strokeStyle = colors.rings.outer;
        ctx.beginPath();
        ctx.arc(camPos.x + svSettings.grid.offset.x + self.pos.x, camPos.y + svSettings.grid.offset.y + self.pos.y, influenceZones.totalRad, 0, pi2);
        ctx.stroke();*/
        var shipCol = (self.type == PLY_TYPE.USER ? colors.player.ship : (self.type == PLY_TYPE.BOT ? colors.player.bot : colors.player.net));
        ctx.strokeStyle = shipCol;
        for (let i = 1; i < self.health; i++) {
            ctx.beginPath();
            ctx.arc(camPos.x + svSettings.grid.offset.x + self.pos.x, camPos.y + svSettings.grid.offset.y + self.pos.y, influenceZones.deadzoneRad + 8 * i, 0, pi2);
            ctx.stroke();
        }

        //ctx.strokeStyle = colors.player.thruster;
        
        if (self.thruster.thrust > 0) {
            self.thruster.visObj.ang = self.ang;
            self.thruster.draw();
        }

        //ctx.strokeStyle = colors.player.ship;
        //ctx.strokeStyle = shipCol;
        self.ship.ang = self.ang;
        self.ship.draw();
    };
}

function PlayerInput() {
    var self = this;

    this.distance = 0;

    this.thrustInput = 0; this.lmbDown = false;
    this.ship = new PlayerShip();
    this.fireReady = false;
    this.attemptFire = false;
    this.mPos = { x: this.ship.pos.x, y: this.ship.pos.y };

    this.handleMouseMove = function(event) {
        self.mPos.x = event.clientX - svSettings.grid.offset.x; 
        self.mPos.y = event.clientY - svSettings.grid.offset.y; 
    };

    this.handleMouseDown = function(event) {
        if (event.button == 0) {
            self.lmbDown = true;
        }
    };

    this.handleMouseUp = function(event) {
        if (event.button == 0) {
            self.lmbDown = false;
        }
    };

    this.tick = function(now) {
        // CHEAT
        /*self.lmbDown = 1;
        self.attemptFire = true;*/

        self.thrustInput = self.thrustInput + ((self.lmbDown ? 1 : 0) - self.thrustInput) * 0.1;
        var diff = { x: self.mPos.x - self.ship.pos.x - camPos.x, y: self.mPos.y - self.ship.pos.y - camPos.y };

        // CHEAT
        /*var dist = null, plyTarget = false;
        for (const i in gameObjects) {
            if (gameObjects.hasOwnProperty(i)) {
                if (gameObjects[i].type == OBJECT_TYPE.ASTEROID) {
                    var tmpDist = Distance(self.ship.pos, gameObjects[i].pos);
                    if (dist == null || tmpDist < dist) {
                        dist = tmpDist;
                        diff = { x: gameObjects[i].pos.x - self.ship.pos.x, y: gameObjects[i].pos.y - self.ship.pos.y };;
                    }
                }
            }
        }
        for (const i in plys) {
            if (plys.hasOwnProperty(i)) {
                var tmpDist = Distance(self.ship.pos, plys[i].pos);
                if (dist == null || (plyTarget == false && tmpDist * 0.25 < dist) || tmpDist < dist) {
                    dist = tmpDist;
                    plyTarget = true;
                    diff = { x: plys[i].pos.x - self.ship.pos.x, y: plys[i].pos.y - self.ship.pos.y };;
                }
            }
        }*/
        
        self.distance = (Math.sqrt(Math.pow(diff.x, 2) + Math.pow(diff.y, 2)) - influenceZones.deadzoneRad) / influenceZones.influenceRad;
        if (self.distance > 1) { self.distance = 1; }
        else if (self.distance < 0) { self.distance = 0; }

        self.ship.thruster.thrust = self.distance * self.thrustInput;
        if (self.ship.thruster.thrust <= 0.001) {
            self.ship.thruster.thrust = 0;
        }

        self.ship.tarAng = Math.atan2(diff.x, diff.y) + Math.PI;
        if (self.ship.tarAng > Math.PI) { self.ship.tarAng -= pi2; }
        else if (self.ship.tarAng < -Math.PI) { self.ship.tarAng += pi2; }

        self.ship.tick(now);
        camPos.x = Lerp(camPos.x, Clamp(-self.ship.pos.x, Math.min(svSettings.grid.center.x + canvas.width*0.5, 0), Math.max(-svSettings.grid.center.x - canvas.width*0.5, 0)), 0.05);
        camPos.y = Lerp(camPos.y, Clamp(-self.ship.pos.y, Math.min(svSettings.grid.center.y + canvas.height*0.5, 0), Math.max(-svSettings.grid.center.y - canvas.height*0.5, 0)), 0.05);
        //camPos.x = Lerp(camPos.x, -self.ship.pos.x, 0.05);
        //camPos.y = Lerp(camPos.y, -self.ship.pos.y, 0.05);
    };

    this.collateSendData = function() {
        var data = { tarAng: user.ship.tarAng, thrust: user.ship.thruster.thrust };
        if (self.attemptFire && self.fireReady) {
            data.fire = null;
        }
        return data;
    }

    this.draw = function() {
        ctx.strokeStyle = colors.rings.inner;
        ctx.beginPath();
        ctx.arc(camPos.x + svSettings.grid.offset.x + self.ship.pos.x, camPos.y + svSettings.grid.offset.y + self.ship.pos.y, influenceZones.deadzoneRad, Math.PI * -0.5 - self.ship.tarAng, Math.PI * 1.5 - self.ship.tarAng);
        ctx.lineTo(camPos.x + svSettings.grid.offset.x + self.ship.pos.x - Math.sin(self.ship.tarAng) * influenceZones.totalRad, camPos.y + svSettings.grid.offset.y + self.ship.pos.y - Math.cos(self.ship.tarAng) * influenceZones.totalRad);
        ctx.stroke();

        ctx.strokeStyle = colors.rings.outer;
        ctx.beginPath();
        ctx.arc(camPos.x + svSettings.grid.offset.x + self.ship.pos.x, camPos.y + svSettings.grid.offset.y + self.ship.pos.y, influenceZones.totalRad, 0, pi2);
        ctx.stroke();

        this.ship.draw();
    };
}

//  -------------------------
// -- Static Event handlers --
//  -------------------------

function MessageListScrollBarUpdate() {
    if (scrolled) {
        messageBox.list.scrollTop = messageBox.list.scrollHeight;
    }
}

function MessageListScrollbarUpdated() {
    scrolled = (messageBox.list.scrollTop + messageBox.list.offsetHeight == messageBox.list.scrollHeight);
}

function AddMessage(msg, sender = '') {
    var newMessage = document.createElement('li'); 
    if (sender == null || sender === '') {
        newMessage.innerHTML = '> ' + msg;
    }
    else {
        newMessage.innerHTML = sender + ': ' + msg;
    }
    messageBox.list.appendChild(newMessage);
    MessageListScrollBarUpdate();
}

var lastMessageTime = Date.now() - svSettings.chatSpamTime;
function SendMessage() {
    if (messageBox.textBox.value !== '' && lastMessageTime + svSettings.chatSpamTime <= Date.now())
    {
        socket.emit('chat_message', { message: messageBox.textBox.value });
        messageBox.textBox.value = '';
    }
    SetMsgBoxVisibility(false);
}

function SubmitMessage(event) {
    event.preventDefault();
    SendMessage();
}

function SetMsgBoxVisibility(state) {
    messageBox.open = state;
    messageBox.container.className = (messageBox.open ? '' : 'closed');
    if (messageBox.open) {
        setTimeout(function() {
            messageBox.textBox.focus();
        }, 25);
    }
    else {
        messageBox.textBox.blur();
    }
}

function HandleKeyPress(event) {
    event = event || window.event;
    var charCode = event.keyCode || event.which;
    switch (charCode) {
        case 121:
            SetMsgBoxVisibility(true);
            break;
        case 32:
            user.attemptFire = true;
            break;
        default:
            break;
    }
}

function HandleKeyRelease(event) {
    event = event || window.event;
    var charCode = event.keyCode || event.which;
    switch (charCode) {
        case 32:
            user.attemptFire = false;
            break;
        default:
            break;
    }
}

function CanvasResize() {
    if (canvas) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    svSettings.grid.pos.x = window.innerWidth * 0.5 + svSettings.grid.center.x;
    svSettings.grid.pos.y = window.innerHeight * 0.5 + svSettings.grid.center.y;
    svSettings.grid.offset.x = svSettings.grid.pos.x - svSettings.grid.center.x;
    svSettings.grid.offset.y = svSettings.grid.pos.y - svSettings.grid.center.y;
    if (ctx) {
        ctx.lineWidth = 2;
    }

    svSettings.grid.cutoffs.offsets.x = svSettings.grid.pos.x - svSettings.grid.center.x * 2;
    svSettings.grid.cutoffs.offsets.y = svSettings.grid.pos.y - svSettings.grid.center.y * 2;
    if (canvas) {
        svSettings.grid.cutoffs.sizes.width = canvas.width * 0.5 + svSettings.grid.center.x;
        svSettings.grid.cutoffs.sizes.height = canvas.height * 0.5 + svSettings.grid.center.y;
    }
}

function LoginAttempt(event) {
    event.preventDefault();
    if (loginBox.nameInput.value !== '') {
        AddMessage('Attempting to login with nickname: ' + loginBox.nameInput.value + '.');
        socket.emit('login_attempt', { nick: loginBox.nameInput.value });
    }
}

function RespawnAttempt() {
    if (!alive) {
        socket.emit('respawn_attempt');
        deathBox.container.className = 'hidden';
        alive = true;
        AddMessage('You respawned.');
    }
}

function QuitAttempt() {
    if (!alive) {
        socket.emit('quit_attempt');
        deathBox.container.className = 'hidden';
        loginBox.container.className = '';
        loggedIn = false;
        AddMessage('You disconnected.');
        GameDestroy();
    }
}

function ClearMessageBuffer() {
    if (messageBox.list) {
        for (var key in messageBuffer) {
            if (messageBuffer.hasOwnProperty(key)) {
                var msg = messageBuffer[key];
                AddMessage(msg.message, msg.senderNick);
            }
        }
    }
    else {
        if (clearBufferTimeoutId) {
            clearTimeout(clearBufferTimeoutId);
        }
        clearBufferTimeoutId = setTimeout(ClearMessageBuffer, 250);
    }
}

var updateId;
function GameInit() {
    // Handle key presses for chat messages and game play controls
    document.addEventListener('keypress', HandleKeyPress);
    document.addEventListener('keyup', HandleKeyRelease);

    window.addEventListener('mousemove', user.handleMouseMove);
    window.addEventListener('mousedown', user.handleMouseDown);
    window.addEventListener('mouseup', user.handleMouseUp);

    alive = true;
    Clear();
    requestAnimationFrame(Draw);
    updateId = setInterval(Update, svSettings.updateInterval);
}

function GameDestroy() {
    document.removeEventListener('keypress', HandleKeyPress);
    document.removeEventListener('keyup', HandleKeyRelease);

    window.removeEventListener('mousemove', user.handleMouseMove);
    window.removeEventListener('mousedown', user.handleMouseDown);
    window.removeEventListener('mouseup', user.handleMouseUp);

    clearInterval(updateId);
}

//  ----------------------------
// -- Socket.IO Event handlers --
//  ----------------------------

function LoginResponse(data) {
    AddMessage(data.msg);
    if (data.successful) {
        loggedIn = true;
        loginBox.container.className = 'hidden';
        GameInit();
    }   
}
socket.on('login_response', LoginResponse);


function RecieveSettings(data) {
    svSettings = data.settings;
    CanvasResize();
}
socket.on('settings_init', RecieveSettings);

var killerId = null;

function PlayerDied(data) {
    alive = false;
    //GameDestroy();
    //loginBox.container.style = '';
    AddMessage('You were killed by: ' + data.killer);
    deathBox.killerText.innerHTML = 'You were killed by: ' + data.killer;
    killerId = data.kId;
    deathBox.container.className = '';

}
socket.on('update_death', PlayerDied);

function RecieveMessage(data) {
    if (messageBox.list) {
        AddMessage(data.message, data.senderNick);
    }
    else {
        messageBuffer.push({ message: data.message, senderNick: data.senderNick });
        clearBufferTimeoutId = setTimeout(ClearMessageBuffer, 250);
    }
}
socket.on('chat_message', RecieveMessage);

function RecieveSysMsg(data) {
    RecieveMessage({message: data.message, senderNick: ''});
}
socket.on('system_message', RecieveSysMsg);

function RecieveUpdate(data) {
    if (data.hasOwnProperty('plys')) {
        for (var i in data.plys) {
            if (data.plys.hasOwnProperty(i)) {
                if (!plys.hasOwnProperty(i)) {
                    plys[i] = new PlayerShip();
                }
                plys[i].importData(data.plys[i]);
            }
        }
    
        for (var i in plys) {
            if (!data.plys.hasOwnProperty(i)) {
                delete plys[i];
            }
        }
    }

    if (data.hasOwnProperty('objs')) {
        for (var i in data.objs) {
            if (data.objs.hasOwnProperty(i)) {
                if (!gameObjects.hasOwnProperty(i)) {
                    switch (data.objs[i].type) {
                        case OBJECT_TYPE.PROJECTILE:
                            gameObjects[i] = new Projectile();
                            break;
                        case OBJECT_TYPE.ASTEROID:
                            gameObjects[i] = new Asteroid();
                            break;
                        default:
                            break;
                    }
                }
                if (gameObjects.hasOwnProperty(i)) {
                    gameObjects[i].importData(data.objs[i]);
                }
            }
        }
        //console.log(data.objs);
        //console.log(gameObjects);

        for (var i in gameObjects) {
            if (!data.objs.hasOwnProperty(i)) {
                delete gameObjects[i];
            }
        }
    }

    if (data.hasOwnProperty('user')) {
        user.ship.importData(data.user);
        if (data.user.hasOwnProperty('fireReady')) {
            user.fireReady = data.user.fireReady;
        }
    }
}
socket.on('update_player', RecieveUpdate);

// Game Objects
var user = new PlayerInput();
var plys = {};
var gameObjects = {};

//  ----------
// -- Update --
//  ----------

function Update() {
    //socket.emit('player_update', { tarAng: user.ship.tarAng, thrust: user.ship.thruster.thrust });
    if (alive) {
        socket.emit('player_update', user.collateSendData());
    }
}

//  --------
// -- Draw --
//  --------

function Clear() {
    // Clear the screen
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function Draw(now) {
    if (!lastUpdate) { lastUpdate = now }
    var deltaTime = (now - lastUpdate) * 0.001;
    lastUpdate = now;
    Clear();
    
    if (loggedIn) {
        // -- Tick -- 
        // Perform update on gameObjects
        for (var i in gameObjects) {
            if (gameObjects.hasOwnProperty(i)) {
                gameObjects[i].tick(deltaTime);
            }
        }

        // Perform update on player input
        for (var i in plys) {
            if (plys.hasOwnProperty(i)) {
                plys[i].tick(Date.now());
            }
        }
        
        if (alive) {
            user.tick(Date.now());
        }
        else if (killerId != null) {
            if (plys.hasOwnProperty(killerId)) {
                camPos.x = Lerp(camPos.x, Clamp(-plys[killerId].pos.x, Math.min(svSettings.grid.center.x + canvas.width*0.5, 0), Math.max(-svSettings.grid.center.x - canvas.width*0.5, 0)), 0.05);
                camPos.y = Lerp(camPos.y, Clamp(-plys[killerId].pos.y, Math.min(svSettings.grid.center.y + canvas.height*0.5, 0), Math.max(-svSettings.grid.center.y - canvas.height*0.5, 0)), 0.05);
                //camPos.x = Lerp(camPos.x, -plys[killerId].pos.x, 0.05);
                //camPos.y = Lerp(camPos.y, -plys[killerId].pos.y, 0.05);
            }
        }

        // -- Draw --
        // Draw the grid
        ctx.strokeStyle = colors.grid;
        ctx.beginPath();
        for (var i = 0; i <= svSettings.grid.count.width; i++) {
            var cellPos = { x: camPos.x + svSettings.grid.pos.x + i * svSettings.grid.cell.width, y: camPos.y + svSettings.grid.pos.y };
            ctx.moveTo(cellPos.x, cellPos.y);
            ctx.lineTo(cellPos.x, cellPos.y + svSettings.grid.cell.height * svSettings.grid.count.height);
        }

        for (var i = 0; i <= svSettings.grid.count.height; i++) {
            var cellPos = { x: camPos.x + svSettings.grid.pos.x, y: camPos.y + svSettings.grid.pos.y + i * svSettings.grid.cell.width };
            ctx.moveTo(cellPos.x, cellPos.y);
            ctx.lineTo(cellPos.x + svSettings.grid.cell.width * svSettings.grid.count.width, cellPos.y);
        }
        ctx.stroke();

        for (const i in gameObjects) {
            if (gameObjects.hasOwnProperty(i)) {
                gameObjects[i].draw();
            }
        }

        // Draw the current user on top of everything so they can always see themselves
        for (const i in plys) {
            if (plys.hasOwnProperty(i)) {
                plys[i].draw();
            }
        }
        if (alive) {
            user.draw();
        }

        // Clear the sides of the grid so the player can't see the objects outside the grid being removed
        ctx.clearRect(0, 0, svSettings.grid.cutoffs.sizes.width, canvas.height);
        ctx.clearRect(svSettings.grid.cutoffs.offsets.x, 0, svSettings.grid.cutoffs.sizes.width, canvas.height);
        ctx.clearRect(0, 0, canvas.width, svSettings.grid.cutoffs.sizes.height);
        ctx.clearRect(0, svSettings.grid.cutoffs.offsets.y, canvas.width, svSettings.grid.cutoffs.sizes.height);

        requestAnimationFrame(Draw);
    }
}

//  --------
// -- INIT --
//  --------

var openSurvey, survey, closeSurvey;

function Init() {
    openSurvey = document.getElementById('openSurvey');
    openSurvey.addEventListener('click', function() {
        openSurvey.className = "hidden";
        survey.className = "";
        closeSurvey.className = "";
    });
    survey = document.getElementById('survey');
    closeSurvey = document.getElementById('closeSurvey');
    closeSurvey.addEventListener('click', function() {
        openSurvey.className = "";
        survey.className = "hidden";
        closeSurvey.className = "hidden";
    });

    // Get canvas element
    canvas = document.getElementsByTagName('canvas')[0];
    CanvasResize();
    window.addEventListener('resize', CanvasResize);
    ctx = canvas.getContext("2d");
    ctx.lineWidth = 2;

    // Get message list element
    messageBox.open = false;
    messageBox.container = document.getElementById('chatBox');
    messageBox.container.className = 'closed';
    messageBox.list = document.getElementById('messageList').getElementsByTagName('ul')[0];

    // Attach event listener to the scroll event of the message list element
    messageBox.list.addEventListener('scroll', MessageListScrollbarUpdated);

    // Get send button and text box elements for the message creation
    var messageCreate = document.getElementById('messageCreate').getElementsByTagName('form')[0];
    messageBox.textBox = messageCreate.getElementsByTagName('input')[0];
    messageBox.sendBtn = messageCreate.getElementsByTagName('button')[0];

    // Get all login box elements needed
    loginBox.container = document.getElementById('loginBox');
    loginBox.form = loginBox.container.getElementsByTagName('form')[0];
    loginBox.nameInput = loginBox.container.getElementsByTagName('input')[0];

    // Get all death box elements needed
    deathBox.container = document.getElementById('deathBox');
    deathBox.respawnBtn = deathBox.container.getElementsByTagName('button')[0];
    deathBox.quitBtn = deathBox.container.getElementsByTagName('button')[1];
    deathBox.killerText = deathBox.container.getElementsByTagName('p')[0];

    // Automatically focus the login nickname input box
    loginBox.nameInput.focus();

    // Attach event listener to the submit events of both login and chat forms
    loginBox.form.addEventListener('submit', LoginAttempt);
    messageCreate.addEventListener('submit', SubmitMessage);
    deathBox.respawnBtn.addEventListener('click', RespawnAttempt);
    deathBox.quitBtn.addEventListener('click', QuitAttempt);

    AddMessage('Welcome to Asteroids Online.');

    socket.emit('page_initialise', { page: PAGE_TYPE.GAME });
}
window.addEventListener('load', Init);