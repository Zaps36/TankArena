(() => {
  const params = new URLSearchParams(location.search);
  const roomCode = (params.get('room') || '').toUpperCase();
  const joinEl = document.getElementById('join');
  const gameEl = document.getElementById('game');
  const nameInput = document.getElementById('name');
  const joinBtn = document.getElementById('join-btn');
  const errEl = document.getElementById('err');
  const roomEl = document.getElementById('room-code');
  const fireBtn = document.getElementById('fire');
  const dashBtn = document.getElementById('dash');
  roomEl.textContent = roomCode || '-';

  const socket = io();
  const input = { mx: 0, my: 0, ax: 0, ay: 0, aiming: false, fire: false, dash: false };
  let sendTimer = null;

  socket.on('connect', () => {
    if (!roomCode) errEl.textContent = 'QR tidak valid. Scan ulang dari layar utama.';
  });

  joinBtn.addEventListener('click', () => {
    errEl.textContent = '';
    if (!roomCode) return;
    joinBtn.disabled = true;
    socket.emit('ctrl:join', { code: roomCode, name: nameInput.value.trim() }, (res) => {
      joinBtn.disabled = false;
      if (!res.ok) { errEl.textContent = res.error; return; }
      joinEl.style.display = 'none';
      gameEl.style.display = 'block';
      sendTimer = setInterval(() => socket.emit('ctrl:input', input), 50);
    });
  });

  socket.on('room:closed', () => {
    clearInterval(sendTimer);
    gameEl.style.display = 'none';
    joinEl.style.display = 'flex';
    errEl.textContent = 'Room sudah ditutup.';
  });

  function setupStick(stickId, knobId, onMove, onRelease) {
    const stick = document.getElementById(stickId);
    const knob = document.getElementById(knobId);
    const radius = 75;
    let pointerId = null;
    function update(e) {
      const rect = stick.getBoundingClientRect();
      let dx = e.clientX - (rect.left + rect.width / 2);
      let dy = e.clientY - (rect.top + rect.height / 2);
      const len = Math.hypot(dx, dy);
      if (len > radius) { dx = (dx / len) * radius; dy = (dy / len) * radius; }
      knob.style.left = `${radius + dx - 30}px`;
      knob.style.top = `${radius + dy - 30}px`;
      onMove(dx / radius, dy / radius);
    }
    function reset() { pointerId = null; knob.style.left = '45px'; knob.style.top = '45px'; onRelease(); }
    stick.addEventListener('pointerdown', (e) => {
      if (pointerId !== null) return;
      pointerId = e.pointerId;
      stick.setPointerCapture(e.pointerId);
      update(e);
    });
    stick.addEventListener('pointermove', (e) => { if (e.pointerId === pointerId) update(e); });
    const end = (e) => { if (e.pointerId === pointerId) reset(); };
    stick.addEventListener('pointerup', end);
    stick.addEventListener('pointercancel', end);
  }

  setupStick('left', 'left-knob', (x, y) => { input.mx = x; input.my = y; }, () => { input.mx = 0; input.my = 0; });
  setupStick('right', 'right-knob', (x, y) => { input.ax = x; input.ay = y; input.aiming = true; }, () => { input.ax = 0; input.ay = 0; input.aiming = false; });

  fireBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); input.fire = true; });
  const releaseFire = () => { input.fire = false; };
  fireBtn.addEventListener('pointerup', releaseFire);
  fireBtn.addEventListener('pointercancel', releaseFire);
  fireBtn.addEventListener('pointerleave', releaseFire);

  function dash() {
    if (input.dash) return;
    input.dash = true;
    window.setTimeout(() => { input.dash = false; }, 90);
  }
  dashBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); dash(); });
})();
