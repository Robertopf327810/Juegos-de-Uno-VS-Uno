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
  const keyCodes = ['KeyA', 'KeyD', 'KeyW', 'KeyS', 'KeyF', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter'];

  let mode = 'arena';
  let playMode = 'local';
  let localState = null;
  let onlineState = null;
  let onlineSide = -1;
  let phase = 'waiting';
  let countdown = 0;
  let lastFrame = 0;
  let lastInput = '';

  const GAME_NAMES = { arena: 'Choque de Chispas', pong: 'Ping-pong relámpago' };
  const localInputs = [
    { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', jump: 'KeyW', attack: 'KeyF' },
    { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', jump: 'ArrowUp', attack: 'Enter' }
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
      : 'Salta con ↑ / W y golpea con Enter / F. Cada jugador tiene 3 vidas.';
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
      attack: keys.has(controls.attack)
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

  function drawFighter(fighter, side) {
    ctx.save();
    ctx.translate(fighter.x, fighter.y);
    const color = side === 0 ? '#f1874f' : '#58afc3';
    const glow = side === 0 ? '#ffc06f' : '#8de8ee';
    if (fighter.invulnerable > 0 && Math.floor(fighter.invulnerable * 16) % 2 === 0) ctx.globalAlpha = .45;
    ctx.fillStyle = 'rgba(0,0,0,.24)';
    ctx.beginPath(); ctx.ellipse(0, 1, 29, 6, 0, 0, Math.PI * 2); ctx.fill();
    if (fighter.swing > 0) {
      ctx.globalAlpha = .7;
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.ellipse(fighter.facing * 48, -48, 34, 18, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = fighter.invulnerable > 0 ? .45 : 1;
    }
    ctx.fillStyle = color;
    ctx.strokeStyle = '#f7e7c7';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(-22, -59, 44, 54, 13); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.roundRect(-19, -88, 38, 35, 14); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#202738';
    roundRect(-12, -76, 24, 11, 5, '#202738');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(-6, -71, 2.3, 0, Math.PI * 2); ctx.arc(6, -71, 2.3, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 9; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-14, -12); ctx.lineTo(-16, 0); ctx.moveTo(14, -12); ctx.lineTo(16, 0); ctx.stroke();
    ctx.restore();
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillStyle = side === 0 ? '#ffc06f' : '#8de8ee';
    ctx.font = '10px "DM Mono", monospace';
    ctx.fillText(side === 0 ? 'NOVA' : 'BOLT', fighter.x, fighter.y - 101);
  }

  function drawArena(state) {
    drawBackground();
    const glow = ctx.createLinearGradient(0, 310, 0, 450);
    glow.addColorStop(0, 'rgba(248,183,76,.02)'); glow.addColorStop(1, 'rgba(248,183,76,.15)');
    ctx.fillStyle = glow; ctx.fillRect(0, 310, 800, 140);
    ctx.fillStyle = '#a06d42'; ctx.fillRect(0, 371, 800, 79);
    ctx.fillStyle = '#f4b65d'; ctx.fillRect(0, 369, 800, 3);
    drawScore(state.score);
    state.fighters.forEach(drawFighter);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    for (let side = 0; side < 2; side += 1) {
      const x = side === 0 ? 35 : 585;
      ctx.font = '9px "DM Mono", monospace';
      ctx.fillStyle = side === 0 ? '#ffc06f' : '#8de8ee';
      ctx.fillText(side === 0 ? 'NOVA · J1' : 'BOLT · J2', x, 88);
      for (let heart = 0; heart < 3; heart += 1) {
        ctx.fillStyle = heart < state.fighters[side].hp ? (side === 0 ? '#f1874f' : '#58afc3') : 'rgba(255,255,255,.15)';
        roundRect(x + heart * 20, 107, 15, 7, 4, ctx.fillStyle);
      }
    }
  }

  function render() {
    if (!gameScreen.hidden) {
      const state = playMode === 'online' ? onlineState : localState;
      if (state) mode === 'pong' ? drawPong(state) : drawArena(state);
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
