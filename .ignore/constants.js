module.exports = { };
module.exports.pi2 = Math.PI * 2;
module.exports.sh = { 
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
    },
    influenceZones: {
        deadzoneRad: 14,
        influenceRad: 64,
        totalRad: 14 + 64
    }
};
module.exports.syncTime = module.exports.sh.syncInterval / 1000;
module.exports.deltaTime = module.exports.sh.tickInterval / 1000;
module.exports.sh.grid.center = {
    x: module.exports.sh.grid.cell.width * module.exports.sh.grid.count.width * -0.5, 
    y: module.exports.sh.grid.cell.height * module.exports.sh.grid.count.height * -0.5
};
module.exports.sv = { 
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
module.exports.OBJECT_TYPE = { OBJECT: 0, PROJECTILE: 1, ASTEROID: 2 };
module.exports.responses = {
    login: { 
        success: 'Successfully logged in.', 
        alreadyActive: 'Nickname is already active', 
        tooShort: 'Nickname is too short', 
        tooLong: 'Nickname is too long',
        illegalChars: 'Nickname contains illegal characters', 
        error: 'Unknown Error' 
    }
};
