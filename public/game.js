(function (root, factory) {
  const game = factory();
  if (typeof module === 'object' && module.exports) module.exports = game;
  else root.DuelGame = game;
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  const WIDTH = 800;
  const HEIGHT = 450;
  const FLOOR = 370;
  const PADDLE_HEIGHT = 88;
  const WIN_SCORE = 5;

  function create(mode) {
    if (mode === 'pong') {
      return {
        mode,
        score: [0, 0],
        paddles: [181, 181],
        ball: { x: WIDTH / 2, y: HEIGHT / 2, vx: 270, vy: 115 }
      };
    }
    return {
      mode: 'arena',
      score: [0, 0],
      fighters: [
        { x: 150, y: FLOOR, vy: 0, hp: 3, facing: 1, grounded: true, cooldown: 0, swing: 0, hitThisSwing: false, invulnerable: 0 },
        { x: 650, y: FLOOR, vy: 0, hp: 3, facing: -1, grounded: true, cooldown: 0, swing: 0, hitThisSwing: false, invulnerable: 0 }
      ]
    };
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function stepPong(state, inputs, dt) {
    const minY = 58;
    const maxY = HEIGHT - 58 - PADDLE_HEIGHT;
    for (let side = 0; side < 2; side += 1) {
      const input = inputs[side] || {};
      const direction = (input.down ? 1 : 0) - (input.up ? 1 : 0);
      state.paddles[side] = clamp(state.paddles[side] + direction * 360 * dt, minY, maxY);
    }

    const ball = state.ball;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    if (ball.y < 34 || ball.y > HEIGHT - 34) {
      ball.y = clamp(ball.y, 34, HEIGHT - 34);
      ball.vy *= -1;
    }

    const paddleX = [46, WIDTH - 54];
    for (let side = 0; side < 2; side += 1) {
      const facing = side === 0 ? 1 : -1;
      const edge = paddleX[side];
      const reachedPaddle = side === 0 ? ball.vx < 0 && ball.x < edge + 14 : ball.vx > 0 && ball.x > edge - 5;
      if (reachedPaddle && ball.y > state.paddles[side] && ball.y < state.paddles[side] + PADDLE_HEIGHT) {
        ball.x = side === 0 ? edge + 14 : edge - 5;
        const offset = (ball.y - state.paddles[side] - PADDLE_HEIGHT / 2) / (PADDLE_HEIGHT / 2);
        ball.vx = facing * Math.min(520, Math.abs(ball.vx) * 1.045);
        ball.vy = clamp(ball.vy + offset * 130, -370, 370);
      }
    }

    if (ball.x < 0 || ball.x > WIDTH) {
      const scorer = ball.x < 0 ? 1 : 0;
      state.score[scorer] += 1;
      const direction = scorer === 0 ? 1 : -1;
      state.ball = { x: WIDTH / 2, y: HEIGHT / 2, vx: direction * 270, vy: scorer === 0 ? -120 : 120 };
      return state.score[scorer] >= WIN_SCORE ? scorer : -1;
    }
    return -1;
  }

  function stepArena(state, inputs, dt) {
    const fighters = state.fighters;
    for (let side = 0; side < 2; side += 1) {
      const fighter = fighters[side];
      const input = inputs[side] || {};
      const direction = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      if (direction) fighter.facing = direction;
      if (Math.abs(fighters[1 - side].x - fighter.x) < 190) fighter.facing = fighters[1 - side].x > fighter.x ? 1 : -1;
      fighter.x = clamp(fighter.x + direction * 265 * dt, 40, WIDTH - 40);

      if (input.jump && fighter.grounded) {
        fighter.vy = -640;
        fighter.grounded = false;
      }
      fighter.vy += 1700 * dt;
      fighter.y += fighter.vy * dt;
      if (fighter.y >= FLOOR) {
        fighter.y = FLOOR;
        fighter.vy = 0;
        fighter.grounded = true;
      }

      fighter.cooldown = Math.max(0, fighter.cooldown - dt);
      fighter.swing = Math.max(0, fighter.swing - dt);
      fighter.invulnerable = Math.max(0, fighter.invulnerable - dt);
      if (input.attack && fighter.cooldown === 0) {
        fighter.cooldown = 0.5;
        fighter.swing = 0.16;
        fighter.hitThisSwing = false;
      }
    }

    for (let side = 0; side < 2; side += 1) {
      const attacker = fighters[side];
      const target = fighters[1 - side];
      const inFront = (target.x - attacker.x) * attacker.facing > 0;
      const close = Math.abs(target.x - attacker.x) < 110 && Math.abs(target.y - attacker.y) < 95;
      if (attacker.swing > 0 && !attacker.hitThisSwing && inFront && close && target.invulnerable === 0) {
        target.hp = Math.max(0, target.hp - 1);
        target.vy = -210;
        target.grounded = false;
        target.x = clamp(target.x + attacker.facing * 26, 40, WIDTH - 40);
        target.invulnerable = 0.7;
        attacker.hitThisSwing = true;
        if (target.hp === 0) {
          state.score[side] += 1;
          return side;
        }
      }
    }
    return -1;
  }

  function step(state, inputs, dt) {
    if (!Number.isFinite(dt) || dt <= 0) return -1;
    return state.mode === 'pong' ? stepPong(state, inputs, Math.min(dt, 0.05)) : stepArena(state, inputs, Math.min(dt, 0.05));
  }

  return { WIDTH, HEIGHT, FLOOR, WIN_SCORE, create, step };
}));
