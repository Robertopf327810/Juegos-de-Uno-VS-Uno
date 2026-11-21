'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Game = require('../public/game');

test('ping-pong awards a point when the ball leaves the court', () => {
  const state = Game.create('pong');
  state.ball = { x: -1, y: 350, vx: -250, vy: 0 };

  const winner = Game.step(state, [{}, {}], 1 / 30);

  assert.equal(winner, -1);
  assert.deepEqual(state.score, [0, 1]);
  assert.equal(state.ball.x, 400);
});

test('ping-pong ends the match at five points', () => {
  const state = Game.create('pong');
  state.score[0] = 4;
  state.ball = { x: 801, y: 350, vx: 250, vy: 0 };

  assert.equal(Game.step(state, [{}, {}], 1 / 30), 0);
  assert.deepEqual(state.score, [5, 0]);
});

test('arena fight ends when a fighter lands three hits', () => {
  const state = Game.create('arena');
  state.fighters[0].x = 300;
  state.fighters[0].facing = 1;
  state.fighters[1].x = 350;
  state.fighters[1].facing = -1;
  let winner = -1;

  for (let frame = 0; frame < 100 && winner < 0; frame += 1) {
    winner = Game.step(state, [{ attack: true }, {}], 1 / 30);
  }

  assert.equal(winner, 0);
  assert.equal(state.fighters[1].hp, 0);
});
