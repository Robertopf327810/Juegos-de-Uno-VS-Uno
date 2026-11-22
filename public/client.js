(function () {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const menu = $('#menu-screen');
  const gameScreen = $('#game-screen');
  const canvas = $('#game-canvas');
  const ctx = canvas.getContext('2d');
  const overlay = $('#game-overlay');
  const overlayTitle = $('#overlay-title');
  const overlayCopy = $('#overlay-copy');
  const overlayEyebrow = $('#overlay-eyebrow');
  const readyButton = $('#ready-button');
  const socket = typeof window.io === 'function' ? window.io() : null;
  const keys = new Set();
  const keyCodes = ['KeyA', 'KeyD', 'KeyW', 'KeyS', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', 'ShiftLeft', 'ShiftRight'];

  let mode = 'race';
  let playMode = 'local';
  let localState = null;
  let onlineState = null;
  let onlineSide = -1;
  let phase = 'waiting';
  let countdown = 0;
  let lastFrame = 0;
  let lastInput = '';

  const GAME_NAMES = { race: 'Carrera de plataformas', pong: 'Ping-pong relámpago' };
  const localInputs = [
    { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', jump: 'KeyW', crouch: 'KeyS', sprint: 'ShiftLeft' },
    { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', jump: 'ArrowUp', crouch: 'ArrowDown', sprint: 'Enter' }
  ];

  function setOverlay(title, copy, button, eyebrow) {
    overlayTitle.textContent = title;
    overlayCopy.textContent = copy || '';
    overlayEyebrow.textContent = eyebrow || 'LISTOS PARA JUGAR';
    readyButton.textContent = button || '';
    readyButton.hidden = !button;
    readyButton.disabled = false;
    overlay.hidden = false;
  }

  function setPhase(nextPhase, data) {
    phase = nextPhase;
    const ready = data ? data.ready : [];
    if (nextPhase === 'waiting') {
      const others = data && data.players ? data.players : 1;
      setOverlay('Buscando rival…', others === 1 ? 'Comparte la URL y espera a que se una el segundo jugador.' : 'Ya hay dos jugadores en la sala.', '', 'DUELO EN LÍNEA');
      if (data && data.players >= 2) setOverlay('Rival encontrado', 'Los dos jugadores deben pulsar el botón para comenzar.', '¡Estoy listo!', 'SALA COMPLETA');
      return;
    }
    if (nextPhase === 'ready') {
      const isReady = ready[onlineSide];
      setOverlay(isReady ? 'Esperando al rival…' : 'Rival encontrado', isReady ? 'El otro jugador aún no está listo.' : 'Los dos jugadores deben pulsar el botón para comenzar.', isReady ? '' : '¡Estoy listo!', 'SALA COMPLETA');
      return;
    }
    if (nextPhase === 'countdown') {
      setOverlay('¡Prepárate!', 'El duelo comienza en breve.', '', 'EN SUS MARCAS');
      return;
    }
    if (nextPhase === 'playing') {
      overlay.hidden = true;
      return;
    }
    if (nextPhase === 'gameover') {
      const winner = data && data.winner;
      const title = playMode === 'local'
        ? `¡Jugador ${winner + 1} gana!`
        : winner === onlineSide ? '¡Victoria!' : '¡Buen duelo!';
      setOverlay(title, 'Ronda terminada. ¿Jugamos otra?', 'Revancha', 'FIN DEL DUELO');
    }
  }

  function beginGame(game, selectedMode) {
    mode = game;
    playMode = selectedMode;
    localState = selectedMode === 'local' ? DuelGame.create(game) : null;
    onlineState = null;
    onlineSide = -1;
    phase = 'waiting';
    keys.clear();
    lastInput = '';
    $('#game-title').textContent = GAME_NAMES[game];
    $('#game-kicker').textContent = selectedMode === 'online' ? 'DUELO EN LÍNEA · MÁXIMO 2 JUGADORES' : 'DUELO LOCAL · 2 JUGADORES';
    $('#connection-pill').textContent = selectedMode === 'online' ? 'EN LÍNEA' : 'LOCAL';
    $('#player-label').innerHTML = selectedMode === 'online' ? '<span id="player-slot">BUSCANDO PLAZA</span> <i>VS</i> RIVAL' : 'JUGADOR 1 <i>VS</i> JUGADOR 2';
    $('#game-instructions').textContent = game === 'pong'
      ? 'Devuelve la pelota y llega a 5 puntos.'
      : 'Muévete con A/D o ←/→; salta con W/↑, agáchate con S/↓ y acelera con Shift/Enter.';
    menu.hidden = true;
    gameScreen.hidden = false;
    if (selectedMode === 'online') {
      if (!socket) {
        setOverlay('No se pudo conectar', 'El servidor de juego no está disponible. Inténtalo más tarde.', 'Volver al menú', 'SIN CONEXIÓN');
        return;
      }
      setOverlay('Conectando…', 'Buscando una sala libre para este duelo.', '', 'EN LÍNEA');
      socket.emit('join-game', game);
    } else {
      setOverlay('¿Quién gana?', '¡Jugador 1 contra Jugador 2, en el mismo teclado!', 'Comenzar duelo', 'DUELO LOCAL');
    }
  }

  function goToMenu() {
    if (socket && playMode === 'online') socket.emit('leave-game');
    keys.clear();
    onlineState = null;
    localState = null;
    gameScreen.hidden = true;
    menu.hidden = false;
    if (socket) socket.disconnect().connect();
  }

  function inputFor(side) {
    const controls = localInputs[side];
    return {
      up: keys.has(controls.up),
      down: keys.has(controls.down),
      left: keys.has(controls.left),
      right: keys.has(controls.right),
      jump: keys.has(controls.jump),
      crouch: keys.has(controls.crouch),
      sprint: keys.has(controls.sprint)
    };
  }

  function sendInput() {
    if (playMode !== 'online' || phase !== 'playing' || !socket || onlineSide < 0) return;
    const own = inputFor(onlineSide);
    const payload = JSON.stringify(own);
    if (payload !== lastInput) {
      socket.emit('player-input', own);
      lastInput = payload;
    }
  }

  function roundRect(x, y, width, height, radius, fill) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    ctx.fill();
  }

  function drawBackground() {
    const gradient = ctx.createLinearGradient(0, 0, 0, 450);
    gradient.addColorStop(0, mode === 'pong' ? '#182437' : '#1c2034');
    gradient.addColorStop(1, mode === 'pong' ? '#1c3143' : '#342e45');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 800, 450);
    ctx.fillStyle = 'rgba(255,255,255,.025)';
    for (let x = 20; x < 800; x += 38) {
      for (let y = 19; y < 450; y += 38) ctx.fillRect(x, y, 1, 1);
    }
  }

  function drawScore(score) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = '500 34px "DM Mono", monospace';
    ctx.fillStyle = '#f6f1e8';
    ctx.fillText(String(score[0]).padStart(2, '0'), 350, 24);
    ctx.fillStyle = 'rgba(255,255,255,.34)';
    ctx.fillText(':', 400, 22);
    ctx.fillStyle = '#f6f1e8';
    ctx.fillText(String(score[1]).padStart(2, '0'), 450, 24);
    ctx.font = '9px "DM Mono", monospace';
    ctx.fillStyle = 'rgba(255,255,255,.48)';
    ctx.fillText('PUNTOS', 400, 66);
  }

  function drawPong(state) {
    drawBackground();
    ctx.setLineDash([6, 9]);
    ctx.strokeStyle = 'rgba(255,255,255,.18)';
    ctx.beginPath(); ctx.moveTo(400, 65); ctx.lineTo(400, 400); ctx.stroke();
    ctx.setLineDash([]);
    drawScore(state.score);
    roundRect(46, state.paddles[0], 11, 88, 6, '#70d7f0');
    roundRect(743, state.paddles[1], 11, 88, 6, '#f7bd4b');
    ctx.shadowBlur = 18; ctx.shadowColor = '#fff';
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(state.ball.x, state.ball.y, 7, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,.35)';
    ctx.font = '10px "DM Mono", monospace'; ctx.textAlign = 'left'; ctx.fillText('JUGADOR 1', 42, 425);
    ctx.textAlign = 'right'; ctx.fillStyle = '#f7bd4b'; ctx.fillText('JUGADOR 2', 758, 425);
  }

  function drawRunner(runner, side, groundY, animationTime) {
    const x = 164 + runner.lateral;
    const footY = groundY - (DuelGame.FLOOR - runner.y);
    const bob = runner.grounded ? Math.abs(Math.sin(animationTime * 0.014)) * 2 : 0;
    const bodyColor = side === 0 ? '#f07849' : '#48a6bb';
    const trimColor = side === 0 ? '#ffc86c' : '#a9ead8';
    const headY = footY - (runner.crouching ? 29 : 43) - bob;
    const stride = runner.grounded ? Math.sin(animationTime * 0.018) * 9 : 5;

    ctx.save();
    ctx.fillStyle = 'rgba(11,17,27,.24)';
    ctx.beginPath(); ctx.ellipse(x, groundY + 2, 27, 6, 0, 0, Math.PI * 2); ctx.fill();
    if (runner.crouching) {
      ctx.translate(x, footY);
      ctx.scale(1, .7);
      ctx.translate(-x, -footY);
    }

    ctx.lineCap = 'round';
    ctx.lineWidth = 7;
    ctx.strokeStyle = '#31424c';
    ctx.beginPath();
    ctx.moveTo(x - 7, footY - 13 - bob); ctx.lineTo(x - 9 - stride, footY - bob);
    ctx.moveTo(x + 7, footY - 13 - bob); ctx.lineTo(x + 9 + stride, footY - bob);
    ctx.stroke();

    ctx.fillStyle = bodyColor;
    ctx.beginPath(); ctx.roundRect(x - 16, footY - 38 - bob, 32, 29, 11); ctx.fill();
    ctx.fillStyle = trimColor;
    ctx.beginPath(); ctx.roundRect(x - 5, footY - 36 - bob, 10, 23, 4); ctx.fill();

    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.moveTo(x - 14, headY + 1); ctx.lineTo(x - 12, headY - 14);
    ctx.lineTo(x - 3, headY - 7); ctx.lineTo(x + 4, headY - 7);
    ctx.lineTo(x + 13, headY - 14); ctx.lineTo(x + 15, headY + 1);
    ctx.quadraticCurveTo(x + 16, headY + 17, x, headY + 17);
    ctx.quadraticCurveTo(x - 16, headY + 17, x - 14, headY + 1);
    ctx.fill();
    ctx.fillStyle = '#222b37';
    ctx.beginPath();
    ctx.arc(x - 5, headY + 2, 1.8, 0, Math.PI * 2);
    ctx.arc(x + 5, headY + 2, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = trimColor;
    ctx.beginPath();
    ctx.moveTo(x - 14, headY - 7);
    ctx.quadraticCurveTo(x, headY - 17, x + 14, headY - 7);
    ctx.lineTo(x + 11, headY - 12);
    ctx.quadraticCurveTo(x, headY - 24, x - 11, headY - 12);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = trimColor;
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(x + 8, headY + 19); ctx.lineTo(x + 23, headY + 23); ctx.stroke();
    ctx.restore();
  }

  function drawRaceObstacle(obstacle, x, groundY) {
    if (obstacle.type === 'branch') {
      ctx.fillStyle = '#72533a';
      ctx.fillRect(x - obstacle.width / 2, groundY - obstacle.height - 22, 7, obstacle.height + 22);
      ctx.fillRect(x + obstacle.width / 2 - 7, groundY - obstacle.height - 22, 7, obstacle.height + 22);
      roundRect(x - obstacle.width / 2 - 4, groundY - obstacle.height - 26, obstacle.width + 8, 13, 6, '#52764d');
      ctx.fillStyle = '#73945a';
      ctx.beginPath();
      ctx.arc(x - obstacle.width * .25, groundY - obstacle.height - 28, 12, 0, Math.PI * 2);
      ctx.arc(x + obstacle.width * .2, groundY - obstacle.height - 29, 13, 0, Math.PI * 2);
      ctx.fill();
    } else if (obstacle.type === 'rock') {
      ctx.fillStyle = '#75806b';
      ctx.beginPath();
      ctx.moveTo(x - obstacle.width / 2, groundY);
      ctx.lineTo(x - obstacle.width / 2 + 5, groundY - obstacle.height * .6);
      ctx.lineTo(x - obstacle.width * .1, groundY - obstacle.height);
      ctx.lineTo(x + obstacle.width * .35, groundY - obstacle.height * .75);
      ctx.lineTo(x + obstacle.width / 2, groundY);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.3)';
      ctx.fillRect(x - 5, groundY - obstacle.height + 8, 9, 3);
    } else {
      roundRect(x - obstacle.width / 2, groundY - obstacle.height + 8, obstacle.width, obstacle.height - 8, 7, '#aa7047');
      ctx.strokeStyle = '#e0a267';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - obstacle.width * .28, groundY - obstacle.height + 10);
      ctx.lineTo(x - obstacle.width * .28, groundY - 3);
      ctx.moveTo(x + obstacle.width * .28, groundY - obstacle.height + 10);
      ctx.lineTo(x + obstacle.width * .28, groundY - 3);
      ctx.stroke();
    }
  }

  function drawRace(state, time) {
    const laneGrounds = [205, 430];

    for (let side = 0; side < 2; side += 1) {
      const runner = state.runners[side];
      const laneTop = side * 225;
      const groundY = laneGrounds[side];
      const palette = side === 0
        ? { sky: '#b3d9d4', horizon: '#7fa79b', hill: '#578879', grass: '#8fae65', dirt: '#785d43' }
        : { sky: '#f1d6a5', horizon: '#cba777', hill: '#ac8256', grass: '#c4a267', dirt: '#785b43' };

      const sky = ctx.createLinearGradient(0, laneTop, 0, groundY);
      sky.addColorStop(0, palette.sky);
      sky.addColorStop(1, '#e8e1c2');
      ctx.fillStyle = sky;
      ctx.fillRect(0, laneTop, 800, groundY - laneTop);

      ctx.fillStyle = 'rgba(255,255,255,.72)';
      for (let cloud = 0; cloud < 3; cloud += 1) {
        const cloudX = (cloud * 291 + 72 - runner.distance * .12 % 920 + 920) % 920 - 55;
        const cloudY = laneTop + 72 + cloud % 2 * 18;
        ctx.beginPath();
        ctx.ellipse(cloudX, cloudY, 27, 8, 0, 0, Math.PI * 2);
        ctx.ellipse(cloudX - 15, cloudY + 3, 15, 6, 0, 0, Math.PI * 2);
        ctx.ellipse(cloudX + 16, cloudY + 4, 18, 6, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      const hillOffset = (runner.distance * .24) % 400;
      ctx.fillStyle = palette.horizon;
      ctx.beginPath(); ctx.moveTo(0, groundY);
      for (let point = -1; point < 5; point += 1) {
        const x = point * 200 - hillOffset;
        ctx.quadraticCurveTo(x + 85, groundY - 104 - point % 2 * 19, x + 200, groundY);
      }
      ctx.closePath(); ctx.fill();

      ctx.fillStyle = palette.hill; ctx.fillRect(0, groundY - 7, 800, 10);
      ctx.fillStyle = palette.grass; ctx.fillRect(0, groundY + 3, 800, 4);
      ctx.fillStyle = palette.dirt;
      ctx.fillRect(0, groundY + 7, 800, laneTop + 225 - groundY - 7);
      ctx.fillStyle = 'rgba(239,219,168,.36)';
      const trackOffset = runner.distance % 84;
      for (let mark = 0; mark < 11; mark += 1) ctx.fillRect(mark * 84 - trackOffset, groundY + 24, 27, 3);

      for (const obstacle of DuelGame.RACE_OBSTACLES) {
        const obstacleX = 164 + obstacle.distance - runner.distance;
        if (obstacleX > 805 || obstacleX < -60) continue;
        drawRaceObstacle(obstacle, obstacleX, groundY);
        if (obstacleX > 190 && obstacleX < 380) {
          ctx.fillStyle = side === 0 ? '#435f56' : '#715c44';
          ctx.font = '9px monospace'; ctx.textAlign = 'left';
          ctx.fillText(obstacle.type === 'branch' ? '¡AGÁCHATE!' : '¡SALTA O MUÉVETE!', 228, groundY - obstacle.height - 10);
        }
      }

      const finishX = 164 + DuelGame.RACE_FINISH - runner.distance;
      if (finishX > 125 && finishX < 810) {
        ctx.fillStyle = '#f2eee0'; ctx.fillRect(finishX, groundY - 103, 3, 103);
        for (let row = 0; row < 4; row += 1) {
          for (let col = 0; col < 4; col += 1) {
            ctx.fillStyle = (row + col) % 2 ? '#f7f0dd' : '#364052';
            ctx.fillRect(finishX + 3 + col * 10, groundY - 103 + row * 10, 10, 10);
          }
        }
        ctx.fillStyle = '#f5f0e2'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center';
        ctx.fillText('META', finishX + 22, groundY - 112);
      }

      drawRunner(runner, side, groundY, time);

      ctx.fillStyle = 'rgba(19,31,34,.76)';
      ctx.beginPath(); ctx.roundRect(15, laneTop + 12, 151, 34, 8); ctx.fill();
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff8e9'; ctx.font = 'bold 10px monospace';
      ctx.fillText(side === 0 ? 'LUNA  ·  J1' : 'MILO  ·  J2', 25, laneTop + 29);
      ctx.fillStyle = 'rgba(255,255,255,.3)';
      ctx.beginPath(); ctx.roundRect(180, laneTop + 23, 99, 9, 5); ctx.fill();
      ctx.fillStyle = side === 0 ? '#ffc86c' : '#8be1d0';
      ctx.beginPath(); ctx.roundRect(180, laneTop + 23, 99 * runner.stamina / 100, 9, 5); ctx.fill();
      ctx.font = '9px monospace'; ctx.fillStyle = '#fff8e9'; ctx.fillText('TURBO', 285, laneTop + 29);

      const progress = Math.min(1, runner.distance / DuelGame.RACE_FINISH);
      ctx.fillStyle = 'rgba(19,31,34,.64)';
      ctx.beginPath(); ctx.roundRect(617, laneTop + 16, 166, 25, 7); ctx.fill();
      ctx.fillStyle = '#fff8e9'; ctx.textAlign = 'right';
      ctx.fillText(`${Math.floor(runner.distance)} / ${DuelGame.RACE_FINISH} m`, 774, laneTop + 28);
      ctx.fillStyle = 'rgba(255,255,255,.3)';
      ctx.beginPath(); ctx.roundRect(622, laneTop + 47, 157, 4, 3); ctx.fill();
      ctx.fillStyle = side === 0 ? '#ffc86c' : '#8be1d0';
      ctx.beginPath(); ctx.roundRect(622, laneTop + 47, 157 * progress, 4, 3); ctx.fill();

      if (runner.stun > 0) {
        ctx.fillStyle = '#fff2c2'; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center';
        ctx.fillText('¡TROPEZÓN!', 164, groundY - 102);
      }
    }

    ctx.fillStyle = 'rgba(24,28,37,.9)';
    ctx.fillRect(0, 223, 800, 4);
  }

  function render(time) {
    if (!gameScreen.hidden) {
      const state = playMode === 'online' ? onlineState : localState;
      if (state) mode === 'pong' ? drawPong(state) : drawRace(state, time);
      else {
        drawBackground();
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = 'rgba(255,255,255,.45)';
        ctx.font = '13px "DM Mono", monospace'; ctx.fillText('ESPERANDO A LOS JUGADORES', 400, 225);
      }
    }
    requestAnimationFrame(render);
  }

  function frame(now) {
    const dt = lastFrame ? Math.min((now - lastFrame) / 1000, 0.05) : 0;
    lastFrame = now;
    if (playMode === 'local' && phase === 'playing' && localState) {
      const winner = DuelGame.step(localState, [inputFor(0), inputFor(1)], dt);
      if (winner >= 0) {
        phase = 'gameover';
        setPhase('gameover', { winner });
      }
    } else if (playMode === 'online' && phase === 'playing') sendInput();
    if (phase === 'countdown') {
      countdown -= dt;
      if (countdown <= 0) {
        phase = 'playing';
        overlay.hidden = true;
      } else {
        overlayTitle.textContent = String(Math.ceil(countdown));
      }
    }
    requestAnimationFrame(frame);
  }

  document.querySelectorAll('[data-game]').forEach((button) => {
    button.addEventListener('click', () => beginGame(button.dataset.game, button.dataset.mode));
  });
  $('#back-button').addEventListener('click', goToMenu);
  $('#brand-home').addEventListener('click', (event) => {
    if (!gameScreen.hidden) { event.preventDefault(); goToMenu(); }
  });
  readyButton.addEventListener('click', () => {
    if (readyButton.textContent === 'Volver al menú') { goToMenu(); return; }
    if (playMode === 'online') {
      socket.emit(phase === 'gameover' ? 'rematch' : 'player-ready');
      readyButton.disabled = true;
      readyButton.textContent = 'Esperando…';
      return;
    }
    if (phase === 'gameover') localState = DuelGame.create(mode);
    phase = 'countdown';
    countdown = 3;
    setOverlay('3', 'El duelo comienza en breve.', '', 'EN SUS MARCAS');
  });

  window.addEventListener('keydown', (event) => {
    if (keyCodes.includes(event.code) && !gameScreen.hidden) {
      event.preventDefault();
      keys.add(event.code);
    }
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', () => keys.clear());

  if (socket) {
    socket.on('joined', (data) => {
      onlineSide = data.side;
      onlineState = data.state;
      $('#player-slot').textContent = `JUGADOR ${onlineSide + 1}`;
      setPhase(data.phase, data);
    });
    socket.on('room-status', (data) => {
      if (playMode === 'online') setPhase(data.phase, data);
    });
    socket.on('game-state', (data) => {
      onlineState = data.state;
      if (data.phase !== phase) setPhase(data.phase, data);
      if (data.phase === 'countdown') {
        countdown = data.countdown;
        overlayTitle.textContent = String(Math.ceil(countdown));
      }
      if (data.phase === 'playing') overlay.hidden = true;
      if (data.phase === 'ready' && data.ready && onlineSide >= 0) {
        readyButton.disabled = data.ready[onlineSide];
      }
    });
    socket.on('room-full', () => {
      setOverlay('Duelo completo', 'Ya hay dos jugadores en esta partida. Prueba el otro juego o vuelve más tarde.', 'Volver al menú', 'SALA LLENA');
      readyButton.disabled = false;
    });
    socket.on('opponent-left', () => {
      setOverlay('El rival salió', 'La plaza quedó libre. Vuelve al menú para iniciar otra partida.', 'Volver al menú', 'SALA ABIERTA');
      readyButton.disabled = false;
      phase = 'waiting';
    });
    socket.on('disconnect', () => {
      if (playMode === 'online' && !gameScreen.hidden) {
        setOverlay('Conexión interrumpida', 'No se pudo mantener la conexión al servidor. Vuelve al menú e inténtalo otra vez.', 'Volver al menú', 'SIN CONEXIÓN');
        readyButton.disabled = false;
      }
    });
  }

  requestAnimationFrame(render);
  requestAnimationFrame(frame);
}());
