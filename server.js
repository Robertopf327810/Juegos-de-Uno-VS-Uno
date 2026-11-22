'use strict';

const express = require('express');
const http = require('node:http');
const path = require('node:path');
const { Server } = require('socket.io');
const DuelGame = require('./public/game');

function createRoom(mode) {
  return {
    mode,
    players: [null, null],
    inputs: [{}, {}],
    ready: [false, false],
    state: DuelGame.create(mode),
    phase: 'waiting',
    countdown: 0,
    winner: -1
  };
}

function createService() {
  const app = express();
  const httpServer = http.createServer(app);
  const io = new Server(httpServer);
  const rooms = new Map([
    ['race', createRoom('race')],
    ['pong', createRoom('pong')]
  ]);

  function roomStatus(room) {
    return {
      mode: room.mode,
      phase: room.phase,
      players: room.players.filter(Boolean).length,
      occupied: room.players.map(Boolean),
      ready: room.ready.slice()
    };
  }

  function sendStatus(room) {
    io.to(room.mode).emit('room-status', roomStatus(room));
  }

  function resetRoom(room) {
    room.ready = [false, false];
    room.inputs = [{}, {}];
    room.state = DuelGame.create(room.mode);
    room.phase = 'waiting';
    room.countdown = 0;
    room.winner = -1;
  }

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

  io.on('connection', (socket) => {
    let currentRoom = null;
    let side = -1;

    socket.on('join-game', (mode) => {
      if (currentRoom) return;
      const room = rooms.get(mode);
      if (!room) {
        socket.emit('room-full');
        return;
      }
      const freeSide = room.players.findIndex((player) => !player);
      if (freeSide === -1) {
        socket.emit('room-full');
        return;
      }
      if (room.phase === 'gameover') resetRoom(room);
      currentRoom = room;
      side = freeSide;
      room.players[side] = socket.id;
      room.inputs[side] = {};
      socket.join(room.mode);
      socket.emit('joined', { side, state: room.state, ...roomStatus(room) });
      sendStatus(room);
    });

    socket.on('player-ready', () => {
      if (!currentRoom || currentRoom.phase === 'playing' || currentRoom.phase === 'countdown') return;
      if (currentRoom.phase === 'gameover') resetRoom(currentRoom);
      currentRoom.ready[side] = true;
      if (currentRoom.players.every(Boolean) && currentRoom.ready.every(Boolean)) {
        currentRoom.phase = 'countdown';
        currentRoom.countdown = 3;
      } else {
        currentRoom.phase = currentRoom.players.every(Boolean) ? 'ready' : 'waiting';
      }
      sendStatus(currentRoom);
    });

    socket.on('rematch', () => {
      if (!currentRoom || currentRoom.phase !== 'gameover') return;
      resetRoom(currentRoom);
      currentRoom.ready[side] = true;
      currentRoom.phase = 'ready';
      sendStatus(currentRoom);
    });

    socket.on('player-input', (input) => {
      if (!currentRoom || currentRoom.phase !== 'playing' || !input || typeof input !== 'object') return;
      const allowed = currentRoom.mode === 'pong'
        ? ['up', 'down']
        : ['left', 'right', 'jump', 'crouch', 'sprint'];
      const clean = {};
      for (const key of allowed) clean[key] = input[key] === true;
      currentRoom.inputs[side] = clean;
    });

    function leaveRoom() {
      if (!currentRoom) return;
      const room = currentRoom;
      const wasPlaying = room.phase === 'playing' || room.phase === 'countdown';
      room.players[side] = null;
      room.inputs[side] = {};
      room.ready[side] = false;
      socket.leave(room.mode);
      currentRoom = null;
      side = -1;
      if (wasPlaying && room.players.some(Boolean)) {
        room.phase = 'gameover';
        room.winner = room.players.findIndex(Boolean);
        io.to(room.mode).emit('game-state', { state: room.state, phase: room.phase, winner: room.winner, ready: room.ready });
      } else if (!room.players.some(Boolean)) {
        resetRoom(room);
      } else {
        room.phase = 'waiting';
      }
      io.to(room.mode).emit('opponent-left');
      sendStatus(room);
    }

    socket.on('leave-game', leaveRoom);
    socket.on('disconnect', leaveRoom);
  });

  const tickTimer = setInterval(() => {
    for (const room of rooms.values()) {
      if (room.phase === 'countdown') {
        room.countdown = Math.max(0, room.countdown - 1 / 30);
        if (room.countdown === 0) room.phase = 'playing';
      } else if (room.phase === 'playing') {
        room.winner = DuelGame.step(room.state, room.inputs, 1 / 30);
        if (room.winner >= 0) room.phase = 'gameover';
      }
      if (room.players.some(Boolean)) {
        io.to(room.mode).emit('game-state', {
          state: room.state,
          phase: room.phase,
          countdown: room.countdown,
          winner: room.winner,
          ready: room.ready
        });
      }
    }
  }, 1000 / 30);

  return {
    app,
    httpServer,
    io,
    close() {
      clearInterval(tickTimer);
      return new Promise((resolve) => io.close(resolve));
    }
  };
}

if (require.main === module) {
  const service = createService();
  const port = Number(process.env.PORT) || 3000;
  service.httpServer.listen(port, '0.0.0.0', () => console.log(`Duelo Doble listo en el puerto ${port}`));
}

module.exports = { createService };
