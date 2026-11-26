// Mode main di satu perangkat (HP atau laptop) melawan 3 bot, dengan sistem ronde.
(() => {
  const TG = window.TankGame;
  const canvas = document.getElementById('game');
  const HUMAN_ID = 'you';
  const TICK = 1 / 60;

  const match = TankMatch.create({ mode: 'bot', botCount: 3 });
  match.add(HUMAN_ID, 'Kamu', false);
  let renderer = TankRender.createRenderer(canvas);
  let rendererRound = 0;
  let acc = 0;
  let last = performance.now();

  const overlay = TankOverlay.create(document.getElementById('stage'), {
    onStart: () => match.start(),
    onRounds: (n) => match.setRounds(n),
    onPlayAgain: () => match.playAgain(),
    onLobby: () => match.toLobby(),
    lobbyText: () => (pad
      ? 'Kamu lawan 3 bot. Kiri: jalan. Kanan: geser bidik lalu lepas, atau ketuk untuk tembak otomatis.'
      : 'Kamu lawan 3 bot. WASD jalan, mouse bidik, klik/Spasi tembak, Shift dash.'),
  });

  // ------------------------------------------------- kontrol layar sentuh
  const padEl = document.getElementById('pad');
  const pad = padEl && !padEl.hidden
    ? TankTouch.attach({
      left: document.getElementById('left'),
      leftKnob: document.getElementById('left-knob'),
      attack: document.getElementById('attack'),
      attackKnob: document.getElementById('attack-knob'),
      dash: document.getElementById('dash'),
    }, { cooldown: TG.FIRE_COOLDOWN })
    : null;

  // ---------------------------------------------- keyboard dan mouse
  const keys = new Set();
  const mouse = { x: 0, y: 0, active: false, down: false };

  function toWorld(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) * canvas.width) / rect.width,
      y: ((clientY - rect.top) * canvas.height) / rect.height,
    };
  }

  function humanInput() {
    const me = match.game.players.get(HUMAN_ID);
    let mx = 0;
    let my = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) my -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) my += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;
    const input = { mx, my, ax: 0, ay: 0, aiming: false, fire: keys.has('Space') || mouse.down, dash: keys.has('ShiftLeft') || keys.has('ShiftRight') };

    if (mouse.active && me) {
      const dx = mouse.x - me.x;
      const dy = mouse.y - me.y;
      const len = Math.hypot(dx, dy);
      if (len > 10) Object.assign(input, { ax: dx / len, ay: dy / len, aiming: true });
    }

    if (pad) {
      const p = pad.input;
      if (Math.hypot(p.mx, p.my) > 0.05) {
        input.mx = p.mx;
        input.my = p.my;
      }
      if (p.aiming) Object.assign(input, { ax: p.ax, ay: p.ay, aiming: true });
      input.dash = input.dash || p.dash;
      input.shot = p.shot;
      input.sx = p.sx;
      input.sy = p.sy;
    }
    return input;
  }

  // ---------------------------------------------------------------- loop
  function tick() {
    match.setInput(HUMAN_ID, humanInput());
    const events = match.update(TICK);
    if (match.round !== rendererRound && match.phase === 'roulette') {
      rendererRound = match.round;
      renderer = TankRender.createRenderer(canvas);
    }
    if (match.phase === 'lobby' && rendererRound !== 0) {
      rendererRound = 0;
      renderer = TankRender.createRenderer(canvas);
    }
    renderer.onEvents(events);
    if (pad && events.some((e) => e.type === 'impact' && e.kind === 'tank' && e.target === HUMAN_ID)) TankTouch.vibrate(40);
  }

  function frame(now) {
    acc += Math.min(0.1, (now - last) / 1000);
    last = now;
    let steps = 0;
    while (acc >= TICK && steps < 6) {
      tick();
      acc -= TICK;
      steps++;
    }
    if (steps === 6) acc = 0;
    const playing = match.phase === 'play' || match.phase === 'countdown' || match.phase === 'intro' || match.phase === 'lobby';
    renderer.draw(TG.snapshot(match.game), { hud: false, highlightId: playing ? HUMAN_ID : null });
    overlay.render(match);
    requestAnimationFrame(frame);
  }

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') e.preventDefault();
    if (e.code === 'Enter') {
      if (match.phase === 'lobby') match.start();
      else if (match.phase === 'final') match.playAgain();
    }
    keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => {
    keys.clear();
    mouse.down = false;
  });

  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse') return;
    Object.assign(mouse, toWorld(e.clientX, e.clientY), { active: true, down: true });
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    Object.assign(mouse, toWorld(e.clientX, e.clientY), { active: true });
  });
  window.addEventListener('pointerup', (e) => {
    if (e.pointerType === 'mouse') mouse.down = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  requestAnimationFrame((now) => {
    last = now;
    requestAnimationFrame(frame);
  });
})();
