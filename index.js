var express = require('express');

var app = express();
var server = require('http').createServer(app);
var io = require('socket.io')(server);
const port = process.env.PORT || 8080;
const uuidv4 = require('uuid/v4');


/*
var controllers = require('./objects.js');

var ClientVars = controllers.client;
var Bot = controllers.bot;*/

const pi2 = Math.PI * 2;
// ---- CONFIG VARS ----
const shSettings = { 
    chatSpamTime: 250, // time that must elapse between each chat message in milliseconds
    tickRate: 60, // 40 updates per second
    tickInterval: (1000 / 24),
    syncRate: 30,
    syncInterval: (1000 / 24),
    grid: {
        cell: {width: 96, height: 96},
        count: {width: 64, height: 64},
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
var influenceZones = {
    deadzoneRad: 14,
    influenceRad: 64,
    totalRad: 14 + 64
};




///////////
var neataptic = require('neataptic');
var Neat    = neataptic.Neat;
var Methods = neataptic.methods;
var Mutations = Methods.mutation;
var Config  = neataptic.Config;
var Architect = neataptic.Architect;

var WIDTH            = shSettings.grid.center.x * -2;
var HEIGHT           = shSettings.grid.center.y * 2;
var MAX_SPEED        = 5;
var START_X          = shSettings.grid.center.x;
var START_Y          = shSettings.grid.center.y;
var SCORE_RADIUS     = 512;

// GA settings
var PLAYER_AMOUNT    = 16; //Math.round(2.3e-4 * WIDTH * HEIGHT);
var ITERATIONS       = 250;
var MUTATION_RATE    = 0.3;
var ELITISM          = Math.round(0.1 * PLAYER_AMOUNT);

var USE_TRAINED_POP = false;

var neat;

function initNeat(){
    neat = new Neat(
        6, 1,
        null,
        {
            mutation: [
                Mutations.ADD_NODE,
                Mutations.SUB_NODE,
                Mutations.ADD_CONN,
                Mutations.SUB_CONN,
                Mutations.MOD_WEIGHT,
                Mutations.MOD_BIAS,
                Mutations.MOD_ACTIVATION,
                Mutations.ADD_GATE,
                Mutations.SUB_GATE,
                Mutations.ADD_SELF_CONN,
                Mutations.SUB_SELF_CONN,
                Mutations.ADD_BACK_CONN,
                Mutations.SUB_BACK_CONN
            ],
            popsize: PLAYER_AMOUNT,
            mutationRate: MUTATION_RATE,
            elitism: ELITISM
        }
    );
  
    if(USE_TRAINED_POP){
        neat.population = require('./population').popGet(PLAYER_AMOUNT, neataptic);
    }
  
    // Draw the first graph
    //drawGraph(neat.population[0].graph($('.best').width()/2, $('.best').height()/2), '.best');
}

initNeat();
if (!USE_TRAINED_POP) {
    neat.mutate();
}

/** Start the evaluation of the current generation */
/*function startEvaluation(){
    players = [];
    highestScore = 0;

    for(var genome in neat.population){
        genome = neat.population[genome];
        //new Player(genome);
    }

    walker.reset();
}*/
  
  /** End the evaluation of the current generation */
/*function endEvaluation(){
    console.log('Generation:', neat.generation, '- average score:', Math.round(neat.getAverage()));
    console.log('Fittest score:', Math.round(neat.getFittest().score));

    // Networks shouldn't get too big
    for(var genome in neat.population){
        genome = neat.population[genome];
        genome.score -= genome.nodes.length * SCORE_RADIUS / 10;
    }

    // Sort the population by score
    neat.sort();

    // Draw the best genome
    //drawGraph(neat.population[0].graph($('.best').width()/2, $('.best').height()/2), '.best');

    // Init new pop
    var newPopulation = [];

    // Elitism
    for(var i = 0; i < neat.elitism; i++){
        newPopulation.push(neat.population[i]);
    }

    // Breed the next individuals
    for(var i = 0; i < neat.popsize - neat.elitism; i++){
        newPopulation.push(neat.getOffspring());
    }

    // Replace the old population with the new population
    neat.population = newPopulation;
    neat.mutate();

    neat.generation++;
    startEvaluation();
}*/

/////////////////////

const syncTime = shSettings.syncInterval / 1000;
const deltaTime = shSettings.tickInterval / 1000;

var lastPlayerId = 1, freePlayerIds = [];
var lastObjectId = 1, freeObjectIds = [];
var lastStatUserId = 1, freeStatUserIds = [];

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

function GenerateStatId() {
    if (freeStatUserIds.length > 0) {
        return freeStatUserIds.pop();
    }
    else {
        return lastStatUserId++;
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
        fireRate: 0.25
    }
};
// ---- CONFIG END -----

var PAGE_TYPE = { GAME: 0, STATS: 1 };
var PLY_TYPE = { USER: 0, BOT: 1, NET: 2 };
var OBJECT_TYPE = { OBJECT: 0, PROJECTILE: 1, ASTEROID: 2 };

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

const servePages = ['/index.html','/statistics.html','/resources/cheese.ico','/resources/main.js','/resources/styles.css','/resources/statistics.js'];
var renameTable = {'/': '/index.html', '/statistics': '/statistics.html'};
for(var i in servePages) {
    renameTable[servePages[i]] = servePages[i];
}

function HandleHomeGetRequest(req, res, next) {
    if (req.method == 'GET' && renameTable.hasOwnProperty(req.url)) {
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
    else if (req.url == '/statistics.json') {
        AppLog('Serving "' + req.url + '" to', req);
        res.setHeader('Content-Type', 'application/json');
        res.send(JSON.stringify(stats.sessions));
    }
    else {
        AppLog('Recieved invalid request for ' + req.url + ' from', req);
        next();
    }
}

app.use(LogRequests);
app.use(HandleHomeGetRequest);

// Object constructors

function Stats() {
    var self = this;

    self.sessions = {};

    this.addSession = function(uId, pId, nickname, plyType) {
        /*self.sessions[uId] = {
            id: uId,
            pId: pId,
            spawns: -1,
            instances: {},
            name: nickname,
            type: plyType,
            start: Date.now(),
            end: null
        };*/
        //console.log('uId: "' + uId + '" session started at ' + self.sessions[uId].start);
    }

    this.addInstance = function(uId) {
        /*self.sessions[uId].spawns++;
        self.sessions[uId].instances[self.sessions[uId].spawns] = {
            hits: [],
            start: Date.now(),
            end: null
        };*/
        //console.log('uId: "' + uId + '" instance: "' + self.sessions[uId].spawns + '" started at ' + self.sessions[uId].instances[self.sessions[uId].spawns].start);
    }

    this.projectileHit = function(originId, hitId, projId) {
        /*self.sessions[originId].instances[self.sessions[originId].spawns].hits.push({
            hitUId: hitId, // The uId of the player that got hurt
            hitPos: { x: clients[self.sessions[hitId].pId].ship.pos.x, y: clients[self.sessions[hitId].pId].ship.pos.y }, // Pos of the player that got hurt at the time of getting hurt
            originPos: { x: clients[self.sessions[originId].pId].ship.pos.x, y: clients[self.sessions[originId].pId].ship.pos.y }, // Pos of the player that fired the projectile at the time of hit
            projPos: { x: gameObjects[projId].pos.x, y: gameObjects[projId].pos.y },
            time: Date.now()
        });*/
        //console.log('Projecitle hit player: "' + self.sessions[hitId].name + '" fired from: "' + self.sessions[originId].name + '"');
    }

    this.endInstance = function(uId) {
        /*self.sessions[uId].instances[self.sessions[uId].spawns].end = Date.now();*/
        //console.log('uId: "' + uId + '" instance: "' + self.sessions[uId].spawns + '" ended at ' + self.sessions[uId].instances[self.sessions[uId].spawns].end);
    }

    this.endSession = function(uId) {
        /*self.sessions[uId].end = Date.now();*/
        //console.log('uId: "' + uId + '" session ended at ' + self.sessions[uId].end);
    }

    this.exportSummary = function() {
        var activeSessions = 0, totalSessions = 0, shotsFired = 0;
        for (const i in self.sessions) {
            if (self.sessions.hasOwnProperty(i)) {
                totalSessions++;
                if (self.sessions[i].end == null) {
                    activeSessions++;
                }
                for (const j in self.sessions[i].instances) {
                    if (self.sessions[i].instances.hasOwnProperty(j)) {
                        shotsFired += self.sessions[i].instances[j].hits.length;
                    }
                }
            }
        }
        var activePlayers = 0, activeBots = 0, activeNets = 0;
        for (const i in activeSessions) {
            if (activeSessions.hasOwnProperty(i)) {
                if (activeSessions[i].type == PLY_TYPE.BOT) {
                    activeBots++;
                }
                else if (activeSessions[i].type == PLY_TYPE.NET) {
                    activeNets++;
                }
                else {
                    activePlayers++;
                }
            }
        }
        return {
            totalSessions: totalSessions,
            activeSessions: activeSessions,
            activePlayers: activePlayers,
            activeBots: activeBots,
            activeNets: activeNets,
            totalShotsHit: shotsFired,
        };
    }

    this.exportData = function() {
        var shotsFired = [];
        for (const i in self.sessions) {
            if (self.sessions.hasOwnProperty(i)) {
                for (const j in self.sessions[i].instances) {
                    if (self.sessions[i].instances.hasOwnProperty(j)) {
                        for (const k in self.sessions[i].instances[j].hits) {
                            if (self.sessions[i].instances[j].hits.hasOwnProperty(k)) {
                                shotsFired.push(self.sessions[i].instances[j].hits[k]);
                                shotsFired[shotsFired.length - 1].originId = i;
                            }
                        }
                    }
                }
            }
        }
        var sessionData = {};
        for (const i in self.sessions) {
            if (self.sessions.hasOwnProperty(i)) {
                sessionData[i] = { id: i, name: self.sessions[i].name, instances: [] };
                for (const j in self.sessions[i].instances) {
                    if (self.sessions[i].instances.hasOwnProperty(j)) {
                        var shotsDealt = [], shotsTaken = [];
                        for (const k in shotsFired) {
                            if (shotsFired.hasOwnProperty(k)) {
                                if (shotsFired[k].originId == i) {
                                    shotsDealt.push(shotsFired[k]);
                                }
                                if (shotsFired[k].hitUId == i) {
                                    shotsTaken.push(shotsFired[k]);
                                }
                            }
                        }
                        sessionData[i].instances[j] = { 
                            dealt: shotsDealt.length,
                            taken: shotsTaken.length,
                            lifetime: ((self.sessions[i].instances[j].end != null ? self.sessions[i].instances[j].end : Date.now()) - self.sessions[i].instances[j].start)/1000 };
                    }
                }
            }
        }
        return sessionData;
    }
}

var stats = new Stats();

function GameObject() {
    var self = this;

    this.oId = GenerateObjectId();


    this.obj = { 
        type: OBJECT_TYPE.OBJECT,
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

    this.life = svSettings.projectile.lifetime;

    this.type = OBJECT_TYPE.PROJECTILE;

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
                if (clients[i].isActive() && clients[self.obj.pOwn] != null && clients[i].pId != self.obj.pOwn && Distance(self.pos, clients[i].ship.pos) <= 6 + 8 * clients[i].health) {
                    self.life = 0;
                    stats.projectileHit(clients[self.obj.pOwn].uId, clients[i].uId, self.oId);
                    clients[i].damage(self.obj.pOwn);
                    //clients[i].kill(clients[self.obj.pOwn].nickname);
                    break;
                }
            }
        }
        for (const i in gameObjects) {
            if (gameObjects.hasOwnProperty(i)) {
                if (gameObjects[i].type == OBJECT_TYPE.ASTEROID && Distance(self.pos, gameObjects[i].obj.pos) <= gameObjects[i].collisionRad) {
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
        self.obj.ang = pi2 * Math.random();
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

    this.type = OBJECT_TYPE.ASTEROID;

    this.respawn = function() {
        this.generateVisData();
        var ang = FixAng(Math.atan2(self.obj.vel.x, self.obj.vel.y));
        if (InBounds(ang, Math.PI * -0.25, Math.PI * 0.25)) {
            self.obj.pos.x = (Math.random() * 2 - 1) * shSettings.grid.center.x;
            self.obj.pos.y = shSettings.grid.center.y - self.outerRad + 2;
        }
        else if (InBounds(ang, Math.PI * 0.25, Math.PI * 0.75)) {
            self.obj.pos.x = shSettings.grid.center.x - self.outerRad + 2;
            self.obj.pos.y = (Math.random() * 2 - 1) * shSettings.grid.center.x;
        }
        else if (ang > Math.PI * 0.75 || ang < Math.PI * -0.75) {
            self.obj.pos.x = (Math.random() * 2 - 1) * shSettings.grid.center.x;
            self.obj.pos.y = -shSettings.grid.center.y + self.outerRad - 2;
        }
        else if (InBounds(ang, Math.PI * -0.75, Math.PI * -0.25)) {
            self.obj.pos.x = -shSettings.grid.center.x + self.outerRad - 2;
            self.obj.pos.y = (Math.random() * 2 - 1) * shSettings.grid.center.y;
        }
        
        /*self.obj.pos.x = (Math.random() * 2 - 1) * shSettings.grid.center.x;
        self.obj.pos.y = (Math.random() * 2 - 1) * shSettings.grid.center.y;*/
    }

    this.outOfBounds = function() {
        return OutOfBounds(self.obj.pos.x, shSettings.grid.center.x - self.outerRad, self.outerRad - shSettings.grid.center.x) || OutOfBounds(self.obj.pos.y, shSettings.grid.center.y - self.outerRad, self.outerRad - shSettings.grid.center.y);
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


var statSets = { nets: 8, bots: 16, health: 4, asteroids: 0, fireRate: 0.25 };

function SpawnAsteroid() {
    var asteroid = new Asteroid();
    asteroid.obj.pos.x = (Math.random() * 2 - 1) * shSettings.grid.center.x;
    asteroid.obj.pos.y = (Math.random() * 2 - 1) * shSettings.grid.center.y;
    gameObjects[asteroid.oId] = asteroid;
}
function SpawnBot() {
    var newBot = new Bot();
    clients[newBot.pId] = newBot;
}
function SpawnNet(genome) {
    var newNet = new Net(genome);
    clients[newNet.pId] = newNet;
}
function SpawnNets() {
    for(var genome in neat.population){
        genome = neat.population[genome];
        SpawnNet(genome);
    }
}

for (var i = 0; i < statSets.asteroids; i++) {
    SpawnAsteroid();
}
for (let i = 0; i < statSets.bots; i++) {
    SpawnBot();
}
SpawnNets();
function endEvaluation(){
    var avg = neat.getAverage();
    console.log('Generation:', neat.generation, '- average score:', Math.round(avg));
    var fittest = neat.getFittest();
    console.log('Fittest score:', Math.round(fittest.score));

    // Networks shouldn't get too big
    for(var genome in neat.population){
        genome = neat.population[genome];
        genome.score -= genome.nodes.length * SCORE_RADIUS / 10;
    }

    // Sort the population by score
    neat.sort();

    // Draw the best genome
    //drawGraph(neat.population[0].graph($('.best').width()/2, $('.best').height()/2), '.best');

    // Init new pop
    var newPopulation = [];

    // Elitism
    for(var i = 0; i < neat.elitism; i++){
        newPopulation.push(neat.population[i]);
    }

    // Breed the next individuals
    for(var i = 0; i < neat.popsize - neat.elitism; i++){
        newPopulation.push(neat.getOffspring());
    }

    // Replace the old population with the new population
    neat.population = newPopulation;
    neat.mutate();

    neat.generation++;
    var popCounter = 0;
    for (const i in clients) {
        if (clients.hasOwnProperty(i) && clients[i].type == PLY_TYPE.NET) {
            if (popCounter >= neat.population.length) {
                break;
            }
            else {
                clients[i].brain = neat.population[popCounter];
                clients[i].brain.score = 0;
                clients[i].respawn(false);
                popCounter++;
            }
        }
    }
}
setInterval(endEvaluation, 10000);
/*for (let i = 0; i < statSets.nets; i++) {
    SpawnNet();
}*/

function systemLog(message, tag = '') {
    if (tag != '') { tag = '<' + tag + '> '; }
    console.log(GetTime() + ' [SYSTEM] ' + tag + message);
};

function broadcastSysMsg(msg) {
    var sendData = {message: msg};
    for (var key in clients) {
        if (clients.hasOwnProperty(key) && clients[key].type == PLY_TYPE.USER) {
            clients[key].socket.emit('system_message', sendData);
        }
    }
    systemLog(msg, 'GAME')
}

function broadcastExcluded(msg, excludedId) {
    var sendData = {message: msg};
    for (var key in clients) {
        if (clients.hasOwnProperty(key) && clients[key].type == PLY_TYPE.USER && key != excludedId) {
            clients[key].socket.emit('system_message', sendData);
        }
    }
    systemLog(msg, 'GAME')
}

function broadcastMessage(sender, msg) {
    var sendData = {senderNick: sender.nickname, message: msg};
    for (var key in clients) {
        if (clients.hasOwnProperty(key) && clients[key].type == PLY_TYPE.USER) {
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
                case OBJECT_TYPE.ASTEROID:
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
                case OBJECT_TYPE.PROJECTILE:
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
    if (syncTimer >= syncTime) {
        syncTimer -= syncTime;
        
        var plyData = {};
        for (var i in clients) {
            if (clients.hasOwnProperty(i)) {
                if (clients[i].loggedIn && clients[i].alive) {
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
                if (clients[i].loggedIn && clients[i].type == PLY_TYPE.USER) {
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


//var perceptron = new Architect.Perceptron(34, 42, 1);
// Client object constructor
function ClientVars(sck) {
    var self = this;

    this.type = PLY_TYPE.USER;
    this.alive = false;
    this.health = 0;
    if (sck == null) {
        this.type = PLY_TYPE.BOT;
    }
    this.pId = GeneratePlayerId();
    this.uId = null;

    this.ship = {
        tarAng: 0,
        thrust: 0,
        pos: {x: 0, y: 0},
        vel: {x: 0, y: 0},
        ang: 0,
        fireTimer: statSets.fireRate,
        fireReady: false
    };
    this.sent = {
        fireReady: false
    }
    this.socket = sck;
    this.loggedIn = false;

    this.newSession = function() {
        self.uId = uuidv4();
        self.loggedIn = true;
        stats.addSession(self.uId, self.pId, self.nickname, self.type);
    }

    // Create log method 
    this.log = function(message, tag = '') {
        if (tag != '') { tag = '<' + tag + '> '; }
        console.log(GetTime() + ' [SOCKET.IO] ' + tag + message + (self.type == PLY_TYPE.USER  ? ' {' + self.socket.request.connection.remoteAddress + ':' + self.socket.request.connection.remotePort + '}' : '{BOT}'));
    };

    this.respawn = function(broadcast = true) {
        self.health = statSets.health;
        self.alive = true;
        self.ship.pos.x = (Math.random() * 2 - 1) * shSettings.grid.center.x;
        self.ship.pos.y = (Math.random() * 2 - 1) * shSettings.grid.center.y;
        stats.addInstance(self.uId);
        if (broadcast) {
            broadcastExcluded(self.nickname + ' has respawned.', self.pId);
        }
    }

    this.isActive = function() {
        return self.alive && self.loggedIn;
    }

    this.damage = function(killerId) {
        self.health -= 1;
        if (self.health <= 0) {
            self.kill(killerId);
        }
    }
    
    this.kill = function(killerId) {
        self.alive = false;

        broadcastExcluded(self.nickname + ' was killed by ' + clients[killerId].nickname, self.pId);

        if (self.type == PLY_TYPE.USER) {
            self.socket.emit('update_death', { killer: clients[killerId].nickname, kId:  killerId});
        }

        for (const i in gameObjects) {
            if (gameObjects.hasOwnProperty(i)) {
                if (gameObjects[i].type == OBJECT_TYPE.PROJECTILE && gameObjects[i].obj.pOwn == self.pId) {
                    gameObjects[i].destroy();
                    delete gameObjects[i];
                }
            }
        }

        stats.endInstance(self.uId);
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
        if (self.type == PLY_TYPE.USER && !self.loggedIn) {
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
                self.newSession();
                self.respawn();
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
        if (self.type == PLY_TYPE.USER && self.loggedIn) {
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

        var force = { x: 0, y: 0 };
		for (const i in clients) {
            if (clients.hasOwnProperty(i) && i != self.pId) {
                const client = clients[i];
                var delta = { x: (self.ship.pos.x + self.ship.vel.x * realDeltaTime) - client.ship.pos.x, y: (self.ship.pos.y + self.ship.vel.y * realDeltaTime) - client.ship.pos.y };
                var deltaLen = Magnitude(delta);
                var minDist = influenceZones.deadzoneRad * 2 + 8 * (self.health - 1) + 8 * (client.health - 1);
                if (deltaLen < minDist) {
                    force.x += ((delta.x / deltaLen) * (minDist - deltaLen)) / realDeltaTime;
                    force.y += ((delta.y / deltaLen) * (minDist - deltaLen)) / realDeltaTime;
                }
            }
        }
        self.ship.vel.x += force.x;
        self.ship.vel.y += force.y;

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
        var returnObj = { pos: self.ship.pos, vel: self.ship.vel, ang: self.ship.ang, health: self.health };
        if (self.sent.fireReady != self.ship.fireReady) {
            self.sent.fireReady = self.ship.fireReady;
            returnObj.fireReady = self.ship.fireReady;
        }
        return returnObj;
    }

    this.collateDroneData = function() { 
        return { tarAng: self.ship.tarAng, thrust: self.ship.thrust, pos: self.ship.pos, vel: self.ship.vel, ang: self.ship.ang, pId: self.pId, health: self.health, type: self.type };
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
        if (self.type == PLY_TYPE.USER && self.isActive()) {
            // Recieve client information about their input velocities and maybe camera position
            self.ship.tarAng = data.tarAng;
            self.ship.thrust = data.thrust;
            if (data.hasOwnProperty('fire') && self.ship.fireReady) {
                self.ship.fireTimer = statSets.fireRate;
                self.ship.fireReady = false;
                // Fire a projectile
                self.fireProjectile();
            }
        }
    }

    this.updatePlayer = function(data) {
        if (self.type == PLY_TYPE.USER && self.loggedIn) {
            // Send the client all new object positions, new object information, new player positions, etc.
            self.socket.emit('update_player', data);
        }
    }

    this.destroy = function() {
        freePlayerIds.unshift(self.pId);
        self.pId = null;
    }

    this.attemptQuit = function() {
        if (self.type == PLY_TYPE.USER && self.loggedIn) {
            self.loggedIn = false;
            broadcastExcluded(self.nickname + ' has disconnected.', self.pId);
            stats.endSession(self.uId);
            delete self.nickname;
        }
    }
    
    this.attemptRespawn = function() {
        if (self.type == PLY_TYPE.USER && self.loggedIn && !self.alive) {
            self.respawn();
        }
    }

    if (self.type == PLY_TYPE.USER) {
        this.socket.on('disconnect', self.disconnect);
        this.initSettings();
        this.socket.on('login_attempt', self.loginAttempt);
        this.socket.on('chat_message', self.chatRecieved);
        this.socket.on('player_update', self.playerUpdate);
        this.socket.on('quit_attempt', self.attemptQuit);
        this.socket.on('respawn_attempt', self.attemptRespawn);
    }
}

function Bot() {
    ClientVars.call(this);

    var self = this;

    this.loggedIn = true;
    this.nickname = 'Bot ' + self.pId;
    this.newSession();
    this.respawn();
    self.respawnTimeout = null;

    this.oldRespawn = this.respawn;
    this.respawn = function(broadcast = true) {
        self.respawnTimeout = null;
        self.oldRespawn(broadcast);
    }

    this.clKill = this.kill;
    this.kill = function(killerId) {
        self.clKill(killerId);
        self.respawnTimeout = setTimeout(self.respawn, 2000);
    }

    this.oldDestroy = this.destroy;
    this.destroy = function() {
        if (self.respawnTimeout) {
            clearTimeout(self.respawnTimeout);
        }
        self.oldDestroy();
    } 

    self.clTick = this.tick;
    this.tick = function(realDeltaTime) {
        if (self.alive) {
            if (self.ship.fireReady) {
                self.ship.fireTimer = statSets.fireRate;
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
            for (const i in clients) {
                if (clients.hasOwnProperty(i) && clients[i].pId != self.pId && clients[i].alive) {
                    var tmpDist = Distance(self.ship.pos, clients[i].ship.pos);
                    if (dist == null || tmpDist < dist) {
                        dist = tmpDist;
                        target = { x: clients[i].ship.pos.x - self.ship.pos.x, y: clients[i].ship.pos.y - self.ship.pos.y };;
                   }
                }
            }

            
            
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
                self.ship.thrust = 0;
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

function angleToPoint(pos1, pos2) {
    var dv = {x: pos2.x - pos1.x, y: pos2.y - pos1.y};
    var d = Magnitude(dv);
    var a = Math.acos(dv.x / d);
    return dv.y < 0 ? pi2 - a : a;
    /*var dv = {x: pos2.x - pos1.x, y: pos2.y - pos1.y};
    return Math.atan2(dv.y, dv.x);*/
}

const SCORES = { HIT: 250 *0, KILL: 500*0 };

function Net(genome) {
    Bot.call(this);

    var self = this;

    this.loggedIn = true;
    this.type = PLY_TYPE.NET;
    this.nickname = 'Net ' + self.pId;
    this.newSession();
    this.respawn();
    this.brain = genome;
    this.brain.score = 0;
    this.target = null;

    this.clDamage = this.damage;
    this.damage = function(killerId) {
        if (clients[killerId].type == PLY_TYPE.NET) {
            clients[killerId].brain.score += (clients[killerId].health > 1 ? SCORES.HIT : SCORES.KILL);
        }

        self.clDamage(killerId);
    }

    this.detect = function() {
        var dist = null;
        self.target = null;
        for (const i in clients) {
            if (clients.hasOwnProperty(i) && clients[i].pId != self.pId && clients[i].alive && clients[i].type != PLY_TYPE.NET) {
                var tmpDist = Distance(self.ship.pos, clients[i].ship.pos);
                if (dist == null || tmpDist < dist) {
                    dist = tmpDist;
                    self.target = i;
                }
            }
        }

        dist /= Math.sqrt(Math.pow(WIDTH, 2) + Math.pow(HEIGHT, 2));
        var targetAngle = 0;
        var tvx = 0;
        var tvy = 0;
        if (self.target != null) {
            targetAngle = angleToPoint(self.ship.pos, clients[self.target].ship.pos) / pi2;
            tvx = (Clamp(clients[self.target].ship.vel.x, -MAX_SPEED, MAX_SPEED) + MAX_SPEED) / MAX_SPEED;
            tvy = (Clamp(clients[self.target].ship.vel.y, -MAX_SPEED, MAX_SPEED) + MAX_SPEED) / MAX_SPEED;
        }
        var vx = (Clamp(self.ship.vel.x, -MAX_SPEED, MAX_SPEED) + MAX_SPEED) / MAX_SPEED;
        var vy = (Clamp(self.ship.vel.y, -MAX_SPEED, MAX_SPEED) + MAX_SPEED) / MAX_SPEED;

        // NaN checking
        targetAngle = isNaN(targetAngle) ? 0 : targetAngle;
        dist = isNaN(dist) ? 0 : dist;

        return [vx, vy, tvx, tvy, targetAngle, dist];
    }

    this.score = function() {
        var dist = 0;
        if (self.target != null) {
            dist = Magnitude(self.ship.pos, clients[self.target].ship.pos);
            if (!isNaN(dist) && dist < SCORE_RADIUS) {
                self.brain.score += SCORE_RADIUS - dist;
            }
        }
    }

    this.tick = function(dt) {
        if (self.alive) {
            if (self.ship.fireReady) {
                self.ship.fireTimer = statSets.fireRate;
                self.ship.fireReady = false;
                self.fireProjectile();
            }
            var inputs = self.detect();
            var output = self.brain.activate(inputs);

            if (!isNaN(output)) {
                if (output[0] >= Infinity) {
                    self.brain.score -= 9999;
                }
                else {
                    self.ship.tarAng = output[0];
                }
            }

            self.ship.thrust = 1;
    
            self.clTick(dt);

            self.score();
        }
    }
}

// STATS STUFF
var statUsers = {};

function StatsUser(sck) {
    var self = this;
    self.socket = sck;
    self.sId = GenerateStatId();
    this.update = function(data) {
        self.socket.emit('stats_update', data);
    }
    this.destroy = function() {
        freeStatUserIds.unshift(self.sId);
        self.sId = null;
    }
    // Disconnect method
    this.disconnect = function() {
        delete statUsers[self.sId];
        self.destroy();
    }
    self.socket.on('disconnect', self.disconnect);

    // Update Settings
    this.applySettings = function(data) {
        console.log('<STATS> Applying new settings!');
        for (const i in data) {
            if (data.hasOwnProperty(i) && statSets.hasOwnProperty(i)) {
                if ((i == 'nets' || i == 'bots') && statSets[i] != data[i]) {
                    if (statSets[i] < data[i]) {
                        for (; statSets[i] < data[i]; statSets[i]++) {
                            if (i == 'nets') {
                                SpawnNet();
                            }
                            else if (i == 'bots') {
                                SpawnBot();
                            }
                        }
                    }
                    else if (statSets[i] > data[i]) {
                        for (const j in clients) {
                            if (clients.hasOwnProperty(j)) {
                                if (clients[j].type == PLY_TYPE.NET && i == 'nets' || clients[j].type == PLY_TYPE.BOT && i == 'bots') {
                                    var cl = clients[j];
                                    delete clients[j];
                                    cl.destroy();
                                    statSets[i]--;
                                    if (statSets[i] <= data[i]) {
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
                else if (i == 'asteroids' && statSets[i] != data[i]) {
                    if (statSets[i] < data[i]) {
                        for (; statSets[i] < data[i]; statSets[i]++) {
                            SpawnAsteroid();
                        }
                    }
                    else if (statSets[i] > data[i]) {
                        for (const j in gameObjects) {
                            if (gameObjects.hasOwnProperty(j)) {
                                if (gameObjects[j].type == OBJECT_TYPE.ASTEROID) {
                                    var asteroid = gameObjects[j];
                                    delete gameObjects[j];
                                    asteroid.destroy();
                                    statSets[i]--;
                                    if (statSets[i] <= data[i]) {
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
                statSets[i] = data[i];
            }
        }
        BroadcastSettings();
    }
    self.socket.on('apply_settings', self.applySettings);

    self.resetStats = function(data) {
        for (const i in clients) {
            if (clients.hasOwnProperty(i)) {
                var cl = clients[i];
                delete clients[i];
                if (cl.type == PLY_TYPE.USER) {
                    cl.socket.disconnect();
                }
                cl.destroy();
            }
        }
        clients = {};
        
        for (const i in gameObjects) {
            if (gameObjects.hasOwnProperty(i)) {
                var go = gameObjects[i];
                delete gameObjects[i];
                go.destroy();
            }
        }
        gameObjects = {};

        stats.sessions = {};

        for (var i = 0; i < statSets.asteroids; i++) {
            SpawnAsteroid();
        }
        for (let i = 0; i < statSets.bots; i++) {
            SpawnBot();
        }
        for (let i = 0; i < statSets.nets; i++) {
            SpawnNet();
        }
    }
    self.socket.on('reset_stats', self.resetStats);

    self.getSessions = function(data) {
        var sessionData = stats.exportData();
        for (const i in statUsers) {
            if (statUsers.hasOwnProperty(i)) {
                statUsers[i].update({sessions: sessionData});
            }
        }
    }
    self.socket.on('get_sessions', self.getSessions);
}

function BroadcastSettings() {
    for (const i in statUsers) {
        if (statUsers.hasOwnProperty(i)) {
            statUsers[i].update({settings: statSets});
        }
    }
}

function UpdateStatUsers() {
    var sumData = stats.exportSummary();
    for (const i in statUsers) {
        if (statUsers.hasOwnProperty(i)) {
            statUsers[i].update({summary: sumData});
        }
    }
}
setInterval(UpdateStatUsers, 1000);

// Client connection handler
function ClientConnected(socket) {
    // Create a new client object
    var self = this;
    this.pageInit = function(data) {
        if (data.page == PAGE_TYPE.GAME) {
            var cl = new ClientVars(socket)
            cl.log('Client has connected');
            clients[cl.pId] = cl;
        }
        else if (data.page == PAGE_TYPE.STATS) {
            var su = new StatsUser(socket);
            console.log('Stats connected');
            statUsers[su.sId] = su;
            UpdateStatUsers();
            su.update({settings: statSets});
        }
        socket.removeListener('page_initialise', self.pageInit);
    }
    socket.on('page_initialise', self.pageInit);
}

io.on('connection', ClientConnected);