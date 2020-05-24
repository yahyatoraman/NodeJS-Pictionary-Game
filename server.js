const io = require('socket.io')(3000);

/* TABLE OF CONTENTS
- 1. SOCKET IMPLEMENTATIONS
-- 1.1. Canvas
-- 1.2. Chatbox / Guess
-- 1.3. Timing
-- 1.4. New Connection
-- 1.5. Disconnection
- 2. HELPER FUNCTIONS */

var players = []; // holds id/name/points
const words = ['AUTOMOBILE', 'DRESS', 'LAPTOP', 'TABLE', 'CHARGER']

// Global variables that change over game turns
var currentPlayerId = '';
var currentPlayerName = '';
var currentWord = '';
var currentCanvasHistory = [];

io.on('connection', socket => {

    /* 1.1. CANVAS 
    All canvas related functions do a player check first
    Since only drawing player should be able to manipulate canvas */

    socket.on('drawing-request', drawing => {
        if (isNotDrawingPlayer(socket.id)) return;
        io.sockets.emit('drawing-response', drawing);
        currentCanvasHistory.push(drawing);
    })

    socket.on('new-style-request', strokeStyle => {
        if (isNotDrawingPlayer(socket.id)) return;
        io.sockets.emit('new-style-response', strokeStyle);
    })

    socket.on('clear-canvas-request', function () {
        if (isNotDrawingPlayer(socket.id)) return;
        io.sockets.emit('clear-canvas-response');
        currentCanvasHistory = []; // server variable
    })

    /* 1.2. CHATBOX / GUESS */

    socket.on('new-guess-request', guess => {
        socket.broadcast.emit('new-guess-response', { name: getNameById(socket.id), guess: guess });
        if (isCorrectAnswer(guess) && isNotDrawingPlayer(socket.id)) {
            io.sockets.emit('correct-answer', { word: currentWord, guesserName: getNameById(socket.id) });
            add5Points(socket.id);
            // Wait for modal to pop down before starting next turn / time
            setTimeout(function () { nextTurn(); }, 3020);;
        }
    })

    /* 1.3. TIMING */

    socket.on('time-is-up-request', function () {
        // Only drawing player is able to fire this function
        // To make sure that time up function fires just once on the server side
        if (isNotDrawingPlayer(socket.id)) return;
        io.sockets.emit('time-is-up-response', currentWord);
        // Wait for modal to pop down before starting next turn / time
        setTimeout(function () { nextTurn(); }, 3020);
    })

    // Current time (in-game) is sent to the new player
    socket.on('current-time-response', data => {
        io.to(data.socketId).emit('set-time-in-between', data.time);
    })

    /* 1.4. NEW CONNECTION */

    socket.on('new-user-request', name => {
        players.push({
            socketId: socket.id,
            name: name,
            points: 0
        });

        socket.broadcast.emit('new-user-response', name);
        io.to(socket.id).emit('new-socket-id', socket.id);
        // Players who join in-between games should be able to see current canvas
        for (var drawing of currentCanvasHistory) {
            io.to(socket.id).emit('drawing-response', drawing);
        }
        // Players who join in-between games should be able to see current time
        // Rest of the handling can be found on Timing section rather than New Connection section
        io.to(currentPlayerId).emit('current-time-request', socket.id);

        // This block fires in here rather than socket.on('connection') because
        // A connection may not necessarily mean a new player (i.e. leave w/o entering a name)
        const secondPlayerHasEntered = (players.length == 2);
        if (secondPlayerHasEntered) {
            nextTurn(); // first turn
        } 
    })

    /* 1.5. DISCONNECTION */

    socket.on('disconnect', function () {
        deletePlayer(socket.id);
        const onlyOnePlayerLeft = (players.length == 1)
        if (onlyOnePlayerLeft) {
            io.sockets.emit('game-over');
        }
    })

}) /* End of io.on('connection', socket => { */


/* 2. HELPER FUNCTIONS */

function isNotDrawingPlayer(socketId) {
    return (socketId != currentPlayerId);
}

function randomlyAssignNewTurnDetails() {
    const randomPlayerIndex = Math.floor(Math.random() * players.length);
    currentPlayerId = players[randomPlayerIndex].socketId;
    currentPlayerName = players[randomPlayerIndex].name;
    currentWord = words[Math.floor(Math.random() * words.length)];
}

function isCorrectAnswer(guess) {
    return (guess.toUpperCase() == currentWord);
}

function nextTurn() {
    const lastPlayerId = currentPlayerId;
    const lastWord = currentWord;
    while (lastPlayerId == currentPlayerId || lastWord == currentWord) {
        randomlyAssignNewTurnDetails(); // changes global server variables
    }

    // Send drawing player a new word
    io.to(currentPlayerId).emit('new-turn-response', { word: currentWord })

    // Send guessing player(s) the name of drawing player
    for (var player of players) {
        if (isNotDrawingPlayer(player.socketId)) {
            io.to(player.socketId).emit('new-turn-response', { drawingName: currentPlayerName })
        }
    }

    currentCanvasHistory = [] // reset canvas history each turn (server side)
    io.sockets.emit('clear-canvas-response') // make each client also reset

    io.sockets.emit('new-style-response', 'black'); // reset color
    io.sockets.emit('reset-line-width-slider'); // reset slider

    io.sockets.emit('players-data', players); // recompose scoreboard
}

function add5Points(socketId) {
    for (var i = 0; i < players.length; i++) {
        if (players[i].socketId == socketId) {
            players[i].points += 5;
            break;
        }
    }
}

function deletePlayer(socketId) {
    for (var i = 0; i < players.length; i++) {
        if (players[i].socketId == socketId) {
            players.splice(i, 1);
            break;
        }
    }
}

function getNameById(socketId) {
    for (var i = 0; i < players.length; i++) {
        if (players[i].socketId == socketId) {
            return players[i].name;
        }
    }
}