
var socket = io(); // Socket IO
var PAGE_TYPE = { GAME: 0, STATS: 1 };
var sessionSummary, sessionsParent;

function CreateInstanceObj(instance) {
    var instanceObj = document.createElement('div');
    var head = document.createElement('header');
    instanceObj.appendChild(head);
    var headTitle = document.createElement('h1');
    head.appendChild(headTitle);
    var headName = document.createElement('p');
    head.appendChild(headName);
    var instanceDataObj = document.createElement('div');
    instanceObj.appendChild(instanceDataObj);
    
    var dealtObj = document.createElement('div');
    instanceDataObj.appendChild(dealtObj);
    var dealtH3 = document.createElement('h3');
    dealtH3.innerHTML = 'Hits taken:';
    dealtObj.appendChild(dealtH3);
    var dealtP = document.createElement('p');
    dealtP.innerHTML = instance.dealt;
    dealtObj.appendChild(dealtP);

    var takenObj = document.createElement('div');
    instanceDataObj.appendChild(takenObj);
    var takenH3 = document.createElement('h3');
    takenH3.innerHTML = 'Hits taken:';
    takenObj.appendChild(takenH3);
    var takenP = document.createElement('p');
    takenP.innerHTML = instance.taken;
    takenObj.appendChild(takenP);

    var lifeObj = document.createElement('div');
    instanceDataObj.appendChild(lifeObj);
    var lifeH3 = document.createElement('h3');
    lifeH3.innerHTML = 'Lifetime:';
    lifeObj.appendChild(lifeH3);
    var lifeP = document.createElement('p');
    lifeP.innerHTML = instance.lifetime;
    lifeObj.appendChild(lifeP);

    return instanceObj;
}

function CreateSessionObj(session) {
    var sesh = document.createElement('div');
    sesh.id = 'session';
    var head = document.createElement('header');
    sesh.appendChild(head);
    var headTitle = document.createElement('h1');
    headTitle.innerHTML = 'Session';
    head.appendChild(headTitle);
    var headName = document.createElement('p');
    headName.innerHTML = session.id + ':' + session.name;
    head.appendChild(headName);
    var instanceParent = document.createElement('div');
    sesh.appendChild(instanceParent);

    for (const i in session.instances) {
        if (session.instances.hasOwnProperty(i)) {
            instanceParent.appendChild(CreateInstanceObj(session.instances[i]));
        }
    }
    return sesh;
}

function Update(data) {
    console.log(data);
    for (const i in data) {
        if (data.hasOwnProperty(i)) {
            var obj = document.getElementById(i);
            if (obj) {
                var p = obj.getElementsByTagName('p')[0];
                if (p) {
                    p.innerHTML = data[i];
                }
            }
        }
    }
    sessionsParent.innerHTML = '';
    for (const i in data.sessions) {
        if (data.sessions.hasOwnProperty(i)) {
            sessionsParent.appendChild(CreateSessionObj(data.sessions[i]));
        }
    }
    CreateSessionObj
}

function Init() {
    sessionSummary = document.getElementById('sessionSummary');
    sessionsParent = document.getElementById('sessions');
    socket.emit('page_initialise', { page: PAGE_TYPE.STATS });
    socket.on('stats_update', Update);
}

window.addEventListener('load', Init);