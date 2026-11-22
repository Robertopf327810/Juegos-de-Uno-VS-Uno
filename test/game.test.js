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

test('race jump clears an obstacle and sprint uses stamina', () => {
  const state = Game.create('race');
  state.runners[0].distance = 270;

  for (let frame = 0; frame < 15; frame += 1) {
    Game.step(state, [{ jump: frame === 0, sprint: true }, {}], 1 / 30);
  }

  assert.equal(state.runners[0].collisions, 0);
  assert.ok(state.runners[0].distance > state.runners[1].distance);
  assert.ok(state.runners[0].stamina < 100);
});

test('race runners can move sideways to dodge obstacles', () => {
  const state = Game.create('race');
  state.runners[0].distance = 300;

  for (let frame = 0; frame < 4; frame += 1) {
    Game.step(state, [{ left: true }, {}], 0.05);
  }
  for (let frame = 0; frame < 2; frame += 1) {
    Game.step(state, [{}, {}], 0.05);
  }

  assert.ok(state.runners[0].lateral < -40);
  assert.equal(state.runners[0].collisions, 0);
});

test('crouching avoids low branches', () => {
  const state = Game.create('race');
  state.runners[0].distance = 1059;
  state.runners[1].distance = 1059;

  Game.step(state, [{ crouch: true }, {}], 1 / 30);

  assert.equal(state.runners[0].crouching, true);
  assert.equal(state.runners[0].collisions, 0);
  assert.equal(state.runners[1].collisions, 1);
});

test('hitting a race obstacle slows the runner', () => {
  const state = Game.create('race');
  state.runners[0].distance = 339;

  Game.step(state, [{}, {}], 1 / 30);
  const distanceAfterImpact = state.runners[0].distance;
  Game.step(state, [{}, {}], 1 / 30);

  assert.equal(state.runners[0].collisions, 1);
  assert.ok(state.runners[0].stun > 0);
  assert.ok(state.runners[0].distance - distanceAfterImpact < 164 / 30);
});

test('race ends when the first runner crosses the finish', () => {
  const state = Game.create('race');
  state.runners[0].distance = Game.RACE_FINISH - 5;

  assert.equal(Game.step(state, [{ sprint: true }, {}], 1 / 30), 0);
  assert.equal(state.winner, 0);
});
