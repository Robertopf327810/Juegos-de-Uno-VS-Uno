'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { io: createClient } = require('socket.io-client');
const { createService } = require('../server');

function once(socket, event) {
  return new Promise((resolve) => socket.once(event, resolve));
}

async function connect(url) {
  const socket = createClient(url, { autoConnect: false });
  const connected = once(socket, 'connect');
  socket.connect();
  await connected;
  return socket;
}

test('online race accepts exactly two players while the Pong room stays independent', async (t) => {
  const service = createService();
  await new Promise((resolve) => service.httpServer.listen(0, '127.0.0.1', resolve));
  const address = service.httpServer.address();
  const url = `http://127.0.0.1:${address.port}`;
  const clients = [];

  t.after(async () => {
    clients.forEach((client) => client.disconnect());
    await service.close();
  });

  const first = await connect(url);
  const second = await connect(url);
  const third = await connect(url);
  const pongPlayer = await connect(url);
  clients.push(first, second, third, pongPlayer);

  const firstJoined = once(first, 'joined');
  first.emit('join-game', 'race');
  assert.equal((await firstJoined).side, 0);

  const secondJoined = once(second, 'joined');
  const firstRoomStatus = once(first, 'room-status');
  second.emit('join-game', 'race');
  assert.equal((await secondJoined).side, 1);
  assert.equal((await firstRoomStatus).players, 2);

  const firstReadyStatus = once(first, 'room-status');
  const secondWaitingStatus = once(second, 'room-status');
  first.emit('player-ready');
  assert.equal((await firstReadyStatus).phase, 'ready');
  assert.equal((await secondWaitingStatus).phase, 'ready');

  const secondReadyStatus = once(second, 'room-status');
  second.emit('player-ready');
  assert.equal((await secondReadyStatus).phase, 'countdown');

  const rejected = once(third, 'room-full');
  third.emit('join-game', 'race');
  await rejected;

  const pongJoined = once(pongPlayer, 'joined');
  pongPlayer.emit('join-game', 'pong');
  assert.equal((await pongJoined).side, 0);
});
