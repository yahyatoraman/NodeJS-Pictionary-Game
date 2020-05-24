const socket = io('http://localhost:3000')

/* TABLE OF CONTENTS
- 1. CANVAS
- 2. CHATBOX / GUESS EVENTS
- 3. TIMING
- 4. MODAL POPUP
- 5. SCOREBOARD 
- 6. NEW CONNECTION / USERNAME EVENTS / DISCONNECTION
- 7. NEW TURN */

/* 1. CANVAS 
This part handles all of the events related to: draw, color palette, linewidth and clear
The main idea behind these events is to send event requests to server with a socket ID
so that server checks if the request comes from the drawing player or not
This block (maybe even the whole project) could have been simpler with the assumption that
players do not use browser console, but in case they do, this verification logic makes the game
immune to such interventions thanks to the centralized storage on the node server */

function requestDrawing(e) {
    // mouse left button must be pressed
    if (e.buttons !== 1) return;

    socket.emit('drawing-request', getDrawing(e));
}

socket.on('drawing-response', drawing => {
    ctx.beginPath();

    ctx.lineWidth = drawing.lineWidth;
    ctx.strokeStyle = drawing.strokeStyle;

    ctx.moveTo(drawing.fromPosX, drawing.fromPosY); // from
    ctx.lineTo(drawing.toPosX, drawing.toPosY); // to

    ctx.stroke();
})

function requestNewStrokeStyle(id) {
    socket.emit('new-style-request', id); // ID is a color name
}

socket.on('new-style-response', strokeStyle => {
    globalStrokeStyle = strokeStyle;
})

function requestClearingCanvas() {
    socket.emit('clear-canvas-request');
}

socket.on('clear-canvas-response', function () {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
})

// fired by server at the start of each turn
// no request avaiable for this event
socket.on('reset-line-width-slider', function () {
    lineWidthSlider.value = 6;
})

document.addEventListener('mousemove', requestDrawing);
document.addEventListener('mousedown', setPosition);
document.addEventListener('mouseenter', setPosition);

// last known position
var pos = { x: 0, y: 0 };

// new position from mouse event
function setPosition(e) {
    var bounds = canvas.getBoundingClientRect();
    // when boundary values are not subtracted
    // user draws on wrong coordinates based on browser size
    pos.x = e.clientX - bounds.left;
    pos.y = e.clientY - bounds.top;
}

var canvas = document.getElementById('canvas');
var ctx = canvas.getContext('2d');
const lineWidthSlider = document.getElementById('line-width-slider');
var globalStrokeStyle; // default set to black by server at the start of the each turn

function getDrawing(e) {
    var lineWidth = lineWidthSlider.value;

    var fromPosX = pos.x;
    var fromPosY = pos.y;

    setPosition(e);

    var toPosX = pos.x;
    var toPosY = pos.y;

    var drawing = {
        lineWidth: lineWidth,
        strokeStyle: globalStrokeStyle,
        fromPosX: fromPosX,
        fromPosY: fromPosY,
        toPosX: toPosX,
        toPosY: toPosY,
    }

    return drawing;
}


/* 2. CHATBOX / GUESS EVENTS */

const chatbox = document.getElementById('chatbox')
const guessInput = document.getElementById('guess-input')

guessInput.addEventListener('keydown', e => {
    if (e.keyCode == 13 && guessInput.value != "") {
        const guess = guessInput.value
        socket.emit('new-guess-request', guess)
        appendToChat('You: ' + guess)
        guessInput.value = ''
    }
})

socket.on('new-guess-response', data => {
    appendToChat(data.name + ': ' + data.guess);
})

socket.on('correct-answer', data => {
    stopTime()
    newModal(data.guesserName + ' guessed correctly: ' + data.word, true)
})

function appendToChat(message) {
    const messageElement = document.createElement('p')
    messageElement.innerText = message
    chatbox.append(messageElement)

    // scroll to the bottom to keep up with the overflow
    chatbox.scrollTop = chatbox.scrollHeight;
}

/* 3. TIMING 
This section is responsible for visually managing the time bar below the scoreboard */

const progressBar = document.getElementById("progress-bar")
// these are supposed to be accessed by both functions, so they are declared global
var intervalId;
var barWidth;
var timeIsStopped = false;

function startTime(from = 1) {
    if(from != 1) console.log("im here")
    progressBar.style.transition = 'none';
    progressBar.style.width = '1%';
    barWidth = from;
    timeIsStopped = false;
    intervalId = setInterval(frame, 500);
    function frame() {
        progressBar.style.transition = 'width 3s';
        if (barWidth >= 100) {
            clearInterval(intervalId);
            setTimeout(function () { if (!timeIsStopped) socket.emit('time-is-up-request'); }, 3000);
        } else {
            barWidth += 9;
            progressBar.style.width = barWidth + "%";
        }
    }
}

function stopTime() {
    timeIsStopped = true;
    clearInterval(intervalId);
}

socket.on('current-time-request', socketId => {
    socket.emit('current-time-response', {time : barWidth, socketId : socketId});
})

socket.on('set-time-in-between', time => {
    startTime(time);
})

socket.on('time-is-up-response', currentWord => {
    newModal('Time is up! Correct answer should have been: ' + currentWord, true);
})


/* 4. MODAL POPUP
Pop up a text box with a given text and shadow the background for a given period (default 3 seconds) */

var modal = document.getElementById("modal")
var modalText = document.getElementById("modal-text")

function newModal(text, dontClose = false) {
    modalText.innerText = text
    modal.style.display = "block"
    if(dontClose) return; 
    setTimeout(() => { modal.style.display = "none"; }, 3000)
}

/* 5. SCOREBOARD
This section is responsible for two main functionalities, as their names imply:
- (Re)rendering the scoreboard with a list of player data (called during the start of each turn)
- Append a new player to the scoreboard (called when a new player enters the room)

Node server sends data that looks like these:

var player1 = { rank: 1, name: 'Name 1', points: 94 };
var player2 = { rank: 2, name: 'Name 2', points: 89 };
var scoreboardData = [player1, player2];

renderScoreboard function takes a parameter such as "scoreboardData"
appendNewPlayer function takes a parameter such as "player1", "player2" etc. */

socket.on('players-data', scoreboardData => {
    renderScoreboard(scoreboardData);
})

const scoreboardTable = document.getElementById('scoreboard-table')

function renderScoreboard(scoreboardData) {
    clearScoreboard();
    populateScoreboard(scoreboardData);
}

function clearScoreboard() {
    const numberOfRows = scoreboardTable.childElementCount - 1;
    for (var i = 0; i < numberOfRows; i++) {
        scoreboardTable.removeChild(scoreboardTable.lastChild);
    }
}

var rankCounter = 1;

function populateScoreboard(scoreboardData) {
    // Sort by points
    scoreboardData.sort(function(player1, player2) {
        return player2.points - player1.points;
    })

    // Append players one by one
    rankCounter = 1;
    for (var data of scoreboardData) {
        appendNewPlayer(data);
        rankCounter++;
    }
}

function appendNewPlayer(data) {
    const row = document.createElement('tr');

    const tdRank = document.createElement('td');
    tdRank.innerText = rankCounter;
    row.appendChild(tdRank);

    const tdName = document.createElement('td');
    tdName.innerText = data.name;
    row.appendChild(tdName);

    const tdPoints = document.createElement('td');
    tdPoints.innerText = data.points;
    row.appendChild(tdPoints);

    scoreboardTable.append(row);
}

/* 6. NEW CONNECTION / USERNAME EVENTS / DISCONNECTION
Upon new connection, ask the user to pick a username.
Regardless of her name, she sees a 'You joined the room' text on her chatbox.
Send server a new user request to handle the following:
- Create a new user (socket) id and keep it in both client and server side
- Send a 'current canvas' response to make sure that new-comers in between games
- See the actual version of the canvas rather than a blank canvas upon connection
- Finally, to start the game if applicable */

const name = prompt("Enter a username.")
appendToChat('You joined the room.')

socket.emit('new-user-request', name)

socket.on('new-user-response', name => {
    appendToChat(name + ' joined the room.')
})

var mySocketId = ''
socket.on('new-socket-id', socketId => {
    mySocketId = socketId
})

socket.on('game-over', function() {
    stopTime();
    newModal('Game Over! \n You are the only player left!', true);
})

/* 7. NEW TURN */

const drawingInfo = document.getElementById('drawing-info')

// A word is given to drawing player, name of the drawing player is given to others
socket.on('new-turn-response', data => {
    // 1. Distribute new variables to all players
    var isYourTurn = (Object.keys(data) == "word")
    if (isYourTurn) {
        var infoText = 'You are drawing ' + data.word
    } else {
        var infoText = data.drawingName + ' is drawing now.'
    }
    // 2. Pop up a new modal & Change the drawing-info text
    newModal(infoText); // 3 seconds by default
    drawingInfo.innerText = infoText;
    // 3. Wait 3 seconds before starting time (until the modal pops down)
    setTimeout(function () { startTime(); }, 3000);
})
