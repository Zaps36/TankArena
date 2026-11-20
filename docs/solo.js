(() => {
  const TG = window.TankGame;
  const canvas = document.getElementById('game');
  let renderer = window.TankRender.createRenderer(canvas);

  const TICK = 1 / 60;
  const BOT_COUNT = 3;
  const HUMAN_ID = 'you';
  const STICK_RADIUS = 60; // piksel layar

  let state = null;
  let result = null; // null, 'win', atau 'lose'
  let acc = 0;
  let last = performance.now();

  const keys = new Set();
  const mouse = { x: 0, y: 0, active: false, down: false };
  const touch = { move: null, aim: null }; // { id, sx, sy, dx, dy }

  function newGame() {
    state = TG.createGame();
    TG.addPlayer(state, HUMAN_ID, 'Kamu');
    for (let i = 1; i <= BOT_COUNT; i++) TG.addPlayer(state, `bot${i}`, `Bot ${i}`);
    renderer = window.TankRender.createRenderer(canvas);
    result = null;
  }

  // Ubah koordinat layar (piksel) menjadi koordinat dunia game.
  function toWorld(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) * canvas.width) / rect.width,
      y: ((clientY - rect.top) * canvas.height) / rect.height,
    };
  }

  function humanInput(me) {
    let mx = 0;
    let my = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) my -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) my += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;

    let aimX = 0;
    let aimY = 0;
    let aiming = false;
    let fire = keys.has('Space') || mouse.down;
    const dash = keys.has('ShiftLeft') || keys.has('ShiftRight');

    if (touch.move) {
      mx = touch.move.dx;
      my = touch.move.dy;
    }

    if (touch.aim) {
      aimX = touch.aim.dx;
      aimY = touch.aim.dy;
      aiming = Math.hypot(aimX, aimY) > 0.3;
      fire = true;
    } else if (mouse.active && me) {
      aimX = mouse.x - me.x;
      aimY = mouse.y - me.y;
      const len = Math.hypot(aimX, aimY);
      if (len > 10) {
        aimX /= len;
        aimY /= len;
        aiming = true;
      }
    }

    return { mx, my, ax: aimX, ay: aimY, aiming, fire, dash };
  }

  function checkResult() {
    if (result) return;
    const me = state.players.get(HUMAN_ID);
    if (me && me.eliminated) {
      result = 'lose';
      return;
    }
    const botsLeft = [...state.players.values()].some((p) => p.id !== HUMAN_ID && !p.eliminated);
    if (!botsLeft) result = 'win';
  }

  function tick(dt) {
    for (let i = 1; i <= BOT_COUNT; i++) {
      const id = `bot${i}`;
      TG.setInput(state, id, TG.botInput(state, id));
    }
    const me = state.players.get(HUMAN_ID);
    TG.setInput(state, HUMAN_ID, result ? {} : humanInput(me));
    renderer.onEvents(TG.step(state, dt));
    checkResult();
  }

  function banner() {
    if (result === 'win') return { title: 'MENANG!', subtitle: 'Semua bot tumbang. Tekan R atau ketuk untuk main lagi.', color: '#4cd964' };
    if (result === 'lose') return { title: 'KALAH!', subtitle: 'Nyawa habis. Tekan R atau ketuk untuk coba lagi.', color: '#ff4d5e' };
    return null;
  }

  function frame(now) {
    acc += Math.min(0.1, (now - last) / 1000);
    last = now;
    while (acc >= TICK) {
      tick(TICK);
      acc -= TICK;
    }
    renderer.draw(TG.snapshot(state), { hud: true, highlightId: HUMAN_ID, banner: banner() });
    requestAnimationFrame(frame);
  }

  // Keyboard
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') e.preventDefault();
    if (e.code === 'KeyR' && result) newGame();
    keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));

  // Mouse dan sentuh
  canvas.addEventListener('pointerdown', (e) => {
    if (result) {
      newGame();
      return;
    }
    if (e.pointerType === 'mouse') {
      const p = toWorld(e.clientX, e.clientY);
      mouse.x = p.x;
      mouse.y = p.y;
      mouse.active = true;
      mouse.down = true;
      return;
    }
    const world = toWorld(e.clientX, e.clientY);
    const anchor = { id: e.pointerId, sx: e.clientX, sy: e.clientY, dx: 0, dy: 0 };
    if (world.x < canvas.width / 2 && !touch.move) touch.move = anchor;
    else if (!touch.aim) touch.aim = anchor;
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') {
      const p = toWorld(e.clientX, e.clientY);
      mouse.x = p.x;
      mouse.y = p.y;
      mouse.active = true;
      return;
    }
    for (const s of [touch.move, touch.aim]) {
      if (!s || s.id !== e.pointerId) continue;
      const dx = e.clientX - s.sx;
      const dy = e.clientY - s.sy;
      const len = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, len / STICK_RADIUS) / len;
      s.dx = dx * k;
      s.dy = dy * k;
    }
  });

  function endPointer(e) {
    if (e.pointerType === 'mouse') {
      mouse.down = false;
      return;
    }
    if (touch.move && touch.move.id === e.pointerId) touch.move = null;
    if (touch.aim && touch.aim.id === e.pointerId) touch.aim = null;
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  newGame();
  requestAnimationFrame((now) => {
    last = now;
    requestAnimationFrame(frame);
  });
})();
