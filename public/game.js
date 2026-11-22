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
  const RACE_FINISH = 2800;
  const RACE_OBSTACLES = [
    { distance: 340, type: 'rock', width: 40, height: 34 },
    { distance: 700, type: 'log', width: 56, height: 50 },
    { distance: 1060, type: 'branch', width: 74, height: 48 },
    { distance: 1440, type: 'log', width: 66, height: 55 },
    { distance: 1830, type: 'branch', width: 68, height: 44 },
    { distance: 2220, type: 'log', width: 58, height: 48 },
    { distance: 2580, type: 'rock', width: 44, height: 38 }
  ];

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
      mode: 'race',
      runners: [createRunner(), createRunner()],
      winner: -1
    };
  }

  function createRunner() {
    return { distance: 0, lateral: 0, y: FLOOR, vy: 0, grounded: true, jumpHeld: false, crouching: false, stun: 0, stamina: 100, collisions: 0 };
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

  function stepRace(state, inputs, dt) {
    const racers = state.runners;
    let winner = -1;
    let finishTime = Infinity;

    for (let side = 0; side < 2; side += 1) {
      const racer = racers[side];
      const input = inputs[side] || {};
      const direction = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      racer.lateral = clamp(racer.lateral + direction * 300 * dt, -100, 100);

      if (input.jump && !input.crouch && !racer.jumpHeld && racer.grounded && racer.stun === 0) {
        racer.vy = -620;
        racer.grounded = false;
      }
      racer.jumpHeld = !!input.jump;
      racer.crouching = !!input.crouch && racer.grounded;

      racer.vy += 1680 * dt;
      racer.y += racer.vy * dt;
      if (racer.y >= FLOOR) {
        racer.y = FLOOR;
        racer.vy = 0;
        racer.grounded = true;
      }

      const previousDistance = racer.distance;
      const speed = racer.stun > 0 ? 48 : input.sprint && racer.stamina > 0 ? 240 : 164;
      if (input.sprint && racer.stun === 0 && racer.stamina > 0) {
        racer.stamina = Math.max(0, racer.stamina - 36 * dt);
      } else {
        racer.stamina = Math.min(100, racer.stamina + 22 * dt);
      }

      racer.distance += speed * dt;

      const crossedObstacle = RACE_OBSTACLES.find((obstacle) =>
          previousDistance < obstacle.distance && racer.distance >= obstacle.distance);
      const changedLane = crossedObstacle && Math.abs(racer.lateral) >= crossedObstacle.width / 2 + 20;
      const avoided = crossedObstacle && (changedLane || (crossedObstacle.type === 'branch'
        ? racer.crouching
        : !racer.grounded && racer.y <= FLOOR - crossedObstacle.height - 30));
      if (crossedObstacle && !avoided) {
        racer.stun = 0.75;
        racer.collisions += 1;
      }

      racer.stun = Math.max(0, racer.stun - dt);

      if (racer.distance >= RACE_FINISH) {
        const crossingTime = (RACE_FINISH - previousDistance) / (racer.distance - previousDistance);
        if (crossingTime < finishTime) {
          finishTime = crossingTime;
          winner = side;
        }
      }
    }

    if (winner >= 0) state.winner = winner;
    return winner;
  }

  function step(state, inputs, dt) {
    if (!Number.isFinite(dt) || dt <= 0) return -1;
    const frameTime = Math.min(dt, 0.05);
    if (state.mode === 'pong') return stepPong(state, inputs, frameTime);
    if (state.mode === 'race') return stepRace(state, inputs, frameTime);
    throw new Error(`Unknown game mode: ${state.mode}`);
  }

  return { WIDTH, HEIGHT, FLOOR, WIN_SCORE, RACE_FINISH, RACE_OBSTACLES, create, step };
}));
