(() => {
  const roomId = new URLSearchParams(location.search).get('room');
  const $ = (id) => document.getElementById(id);
  const joinEl = $('join');
  const gameEl = $('game');
  const nameInput = $('name');
  const joinBtn = $('join-btn');
  const errEl = $('err');
  const fireBtn = $('fire');
  const dashBtn = $('dash');
  const lifeEl = $('life');
  const hpFill = $('hp-fill');
  const meName = $('me-name');
  const overlay = $('overlay');
  $('room-code').textContent = roomId ? roomId.slice(0, 8).toUpperCase() : '-';

  const input = { mx: 0, my: 0, ax: 0, ay: 0, aiming: false, fire: false, dash: false };
  let peer = null;
  let connection = null;
  let sendTimer = null;
  let playerId = null;
  let lastHp = null;

  function error(message) {
    errEl.textContent = message;
    joinBtn.disabled = !peer || !peer.open;
  }

  function vibrate(ms) {
    if (navigator.vibrate) navigator.vibrate(ms);
  }

  if (!roomId) {
    error('QR tidak valid. Scan ulang dari layar utama.');
  } else {
    errEl.textContent = 'Menyambung...';
    peer = new Peer();
    peer.on('open', () => {
      joinBtn.disabled = false;
      errEl.textContent = '';
    });
    peer.on('error', (e) => error(`Koneksi gagal: ${e.type || 'tidak diketahui'}`));
    peer.on('disconnected', () => error('Koneksi terputus. Muat ulang halaman.'));
  }

  function showGame(message) {
    playerId = message.playerId;
    document.documentElement.style.setProperty('--me', message.color);
    meName.textContent = message.name;
    joinEl.style.display = 'none';
    document.querySelector('.clouds').style.display = 'none';
    gameEl.style.display = 'block';
    vibrate(60);
  }

  function updateStatus(me) {
    const ratio = Math.max(0, me.hp) / 100;
    hpFill.style.width = `${ratio * 100}%`;
    hpFill.style.background = ratio > 0.6 ? 'var(--green)' : ratio > 0.3 ? 'var(--yellow)' : 'var(--red)';
    lifeEl.textContent = '♥'.repeat(Math.max(0, me.lives)) || '💀';
    dashBtn.classList.toggle('cooldown', me.dashCooldown > 0);
    overlay.style.display = me.eliminated ? 'grid' : 'none';
    if (lastHp !== null && me.hp < lastHp) vibrate(me.hp <= 0 ? [80, 40, 120] : 40);
    lastHp = me.hp;
  }

  joinBtn.addEventListener('click', () => {
    if (!peer || !roomId) return;
    errEl.textContent = 'Menghubungkan ke layar utama...';
    joinBtn.disabled = true;
    connection = peer.connect(roomId, { reliable: true });
    connection.on('open', () => {
      connection.send({ type: 'join', name: nameInput.value.trim() || 'Pemain' });
      sendTimer = setInterval(() => {
        if (connection && connection.open) connection.send({ type: 'input', input });
      }, 50);
    });
    connection.on('data', (message) => {
      if (!message) return;
      if (message.type === 'error') return error(message.message);
      if (message.type === 'welcome') showGame(message);
      if (message.type === 'state' && playerId) {
        const me = message.state.players.find((p) => p.id === playerId);
        if (me) updateStatus(me);
      }
    });
    connection.on('close', () => {
      clearInterval(sendTimer);
      gameEl.style.display = 'none';
      joinEl.style.display = 'flex';
      error('Koneksi ke layar utama terputus.');
    });
    connection.on('error', () => error('Koneksi controller gagal.'));
  });

  function setupStick(stickId, knobId, onMove, onRelease) {
    const stick = $(stickId);
    const knob = $(knobId);
    const radius = 75;
    let pointerId = null;
    function update(e) {
      const rect = stick.getBoundingClientRect();
      let dx = e.clientX - (rect.left + rect.width / 2);
      let dy = e.clientY - (rect.top + rect.height / 2);
      const len = Math.hypot(dx, dy);
      if (len > radius) {
        dx = (dx / len) * radius;
        dy = (dy / len) * radius;
      }
      knob.style.left = `${radius + dx - 35}px`;
      knob.style.top = `${radius + dy - 35}px`;
      onMove(dx / radius, dy / radius);
    }
    function reset() {
      pointerId = null;
      knob.style.left = '';
      knob.style.top = '';
      onRelease();
    }
    stick.addEventListener('pointerdown', (e) => {
      if (pointerId !== null) return;
      pointerId = e.pointerId;
      stick.setPointerCapture(e.pointerId);
      update(e);
    });
    stick.addEventListener('pointermove', (e) => {
      if (e.pointerId === pointerId) update(e);
    });
    const end = (e) => {
      if (e.pointerId === pointerId) reset();
    };
    stick.addEventListener('pointerup', end);
    stick.addEventListener('pointercancel', end);
  }

  setupStick('left', 'left-knob', (x, y) => { input.mx = x; input.my = y; }, () => { input.mx = 0; input.my = 0; });
  setupStick('right', 'right-knob', (x, y) => { input.ax = x; input.ay = y; input.aiming = true; }, () => { input.ax = 0; input.ay = 0; input.aiming = false; });

  fireBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    input.fire = true;
    fireBtn.classList.add('pressed');
    vibrate(15);
  });
  const releaseFire = () => {
    input.fire = false;
    fireBtn.classList.remove('pressed');
  };
  fireBtn.addEventListener('pointerup', releaseFire);
  fireBtn.addEventListener('pointercancel', releaseFire);
  fireBtn.addEventListener('pointerleave', releaseFire);

  dashBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    dashBtn.classList.add('pressed');
    setTimeout(() => dashBtn.classList.remove('pressed'), 120);
    if (input.dash) return;
    input.dash = true;
    vibrate(25);
    setTimeout(() => { input.dash = false; }, 90);
  });
})();
