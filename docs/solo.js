(() => {
  const TG = window.TankGame;
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const TICK = 1 / 60;
  const BOT_COUNT = 3;
  const HUMAN_ID = 'you';
  const STICK_RADIUS = 60; // piksel layar

  let state = null;
  let acc = 0;
  let last = performance.now();
  const messages = []; // { text, until }

  const keys = new Set();
  const mouse = { x: 0, y: 0, active: false, down: false };
  const touch = { move: null, aim: null }; // { id, sx, sy, dx, dy }

  function newGame() {
    state = TG.createGame();
    TG.addPlayer(state, HUMAN_ID, 'Kamu');
    for (let i = 1; i <= BOT_COUNT; i++) {
      TG.addPlayer(state, `bot${i}`, `Bot ${i}`);
    }
    messages.length = 0;
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
      // Bidik ke arah kursor dari posisi tank.
      aimX = mouse.x - me.x;
      aimY = mouse.y - me.y;
      const len = Math.hypot(aimX, aimY);
      if (len > 10) {
        aimX /= len;
        aimY /= len;
        aiming = true;
      }
    }

    return { mx, my, ax: aimX, ay: aimY, aiming, fire };
  }

  function addMessage(text) {
    messages.push({ text, until: performance.now() + 2500 });
    if (messages.length > 4) messages.shift();
  }

  function tick(dt) {
    for (let i = 1; i <= BOT_COUNT; i++) {
      const id = `bot${i}`;
      TG.setInput(state, id, TG.botInput(state, id));
    }
    const me = state.players.get(HUMAN_ID);
    TG.setInput(state, HUMAN_ID, humanInput(me));

    const events = TG.step(state, dt);
    for (const ev of events) {
      if (ev.type !== 'kill') continue;
      const killer = state.players.get(ev.killer);
      const victim = state.players.get(ev.victim);
      const kName = killer ? killer.name : 'Seseorang';
      const vName = victim ? victim.name : 'Seseorang';
      addMessage(`${kName} menghancurkan ${vName}`);
    }
  }

  function drawGrid(w, h) {
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= w; x += 50) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 0; y <= h; y += 50) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
  }

  function drawTank(p) {
    if (!p.alive) {
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = '14px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(`${p.name} respawn ${p.respawnIn}`, p.x, p.y);
      return;
    }
    const r = TG.TANK_RADIUS;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#000';
    ctx.stroke();
    ctx.rotate(p.angle);
    ctx.fillStyle = '#222';
    ctx.fillRect(0, -4, r + 10, 8);
    ctx.restore();

    ctx.fillStyle = '#fff';
    ctx.font = '12px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(p.name, p.x, p.y - r - 14);

    const barW = 36;
    ctx.fillStyle = '#400';
    ctx.fillRect(p.x - barW / 2, p.y - r - 9, barW, 4);
    ctx.fillStyle = '#4f4';
    ctx.fillRect(p.x - barW / 2, p.y - r - 9, (barW * p.hp) / 100, 4);
  }

  function drawHud(snap) {
    const sorted = [...snap.players].sort((a, b) => b.kills - a.kills);
    ctx.textAlign = 'right';
    ctx.font = '14px system-ui';
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(canvas.width - 190, 8, 182, 22 + sorted.length * 20);
    ctx.fillStyle = '#fff';
    ctx.fillText('Skor (kill / mati)', canvas.width - 16, 24);
    sorted.forEach((p, i) => {
      ctx.fillStyle = p.color;
      ctx.fillText(`${p.name}: ${p.kills} / ${p.deaths}`, canvas.width - 16, 46 + i * 20);
    });

    const now = performance.now();
    const live = messages.filter((m) => m.until > now);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ddd';
    live.forEach((m, i) => ctx.fillText(m.text, 12, canvas.height - 12 - (live.length - 1 - i) * 18));

    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = '12px system-ui';
    ctx.fillText('WASD gerak, mouse bidik, klik/Spasi tembak. HP: joystick kiri gerak, sentuh kanan bidik dan tembak.', 12, 20);
  }

  function render() {
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    drawGrid(w, h);
    const snap = TG.snapshot(state);

    for (const o of snap.obstacles) {
      ctx.fillStyle = '#6b5b45';
      ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.strokeStyle = '#3e3427';
      ctx.lineWidth = 3;
      ctx.strokeRect(o.x, o.y, o.w, o.h);
    }

    ctx.fillStyle = '#ffe066';
    for (const b of snap.bullets) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const p of snap.players) drawTank(p);
    drawHud(snap);
  }

  function frame(now) {
    acc += Math.min(0.1, (now - last) / 1000);
    last = now;
    while (acc >= TICK) {
      tick(TICK);
      acc -= TICK;
    }
    render();
    requestAnimationFrame(frame);
  }

  // Keyboard
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') e.preventDefault();
    keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));

  // Mouse dan sentuh
  canvas.addEventListener('pointerdown', (e) => {
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
    if (world.x < canvas.width / 2 && !touch.move) {
      touch.move = anchor;
    } else if (!touch.aim) {
      touch.aim = anchor;
    }
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') {
      const p = toWorld(e.clientX, e.clientY);
      mouse.x = p.x;
      mouse.y = p.y;
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
