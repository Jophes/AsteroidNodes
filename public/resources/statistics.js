
var socket = io(); // Socket IO
var PAGE_TYPE = { GAME: 0, STATS: 1 };
var sessionSummary;

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
}

function Init() {
    sessionSummary = document.getElementById('sessionSummary');
    socket.emit('page_initialise', { page: PAGE_TYPE.STATS });
    socket.on('stats_update', Update);
}

window.addEventListener('load', Init);