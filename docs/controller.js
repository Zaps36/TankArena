(() => {
  const roomId = new URLSearchParams(location.search).get('room');
  const joinEl = document.getElementById('join');
  const gameEl = document.getElementById('game');
  const nameInput = document.getElementById('name');
  const joinBtn = document.getElementById('join-btn');
  const errEl = document.getElementById('err');
  const roomEl = document.getElementById('room-code');
  const fireBtn = document.getElementById('fire');
  const dashBtn = document.getElementById('dash');
  const lifeEl = document.getElementById('life');
  roomEl.textContent = roomId || '-';

  const input = { mx: 0, my: 0, ax: 0, ay: 0, aiming: false, fire: false, dash: false };
  let peer = null;
  let connection = null;
  let sendTimer = null;
  let playerId = null;

  function error(message) { errEl.textContent = message; joinBtn.disabled = false; }

  if (!roomId) error('QR tidak valid. Scan ulang dari layar utama.');
  else {
    peer = new Peer();
    peer.on('open', () => { joinBtn.disabled = false; });
    peer.on('error', (e) => error(`PeerJS gagal: ${e.type || 'koneksi'}`));
    peer.on('disconnected', () => error('Koneksi signaling terputus. Muat ulang halaman.'));
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
      if (message.type === 'welcome') {
        playerId = message.playerId;
        joinEl.style.display = 'none';
        gameEl.style.display = 'block';
      }
      if (message.type === 'state' && playerId) {
        const me = message.state.players.find((p) => p.id === playerId);
        if (me) lifeEl.textContent = me.eliminated ? 'TERELIMINASI' : `Nyawa: ${'♥'.repeat(Math.max(0, me.lives))}`;
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
    stick.addEventListener('pointerdown', (e) => { if (pointerId === null) { pointerId = e.pointerId; stick.setPointerCapture(e.pointerId); update(e); } });
    stick.addEventListener('pointermove', (e) => { if (e.pointerId === pointerId) update(e); });
    const end = (e) => { if (e.pointerId === pointerId) reset(); };
    stick.addEventListener('pointerup', end); stick.addEventListener('pointercancel', end);
  }

  setupStick('left', 'left-knob', (x, y) => { input.mx = x; input.my = y; }, () => { input.mx = 0; input.my = 0; });
  setupStick('right', 'right-knob', (x, y) => { input.ax = x; input.ay = y; input.aiming = true; }, () => { input.ax = 0; input.ay = 0; input.aiming = false; });
  fireBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); input.fire = true; });
  const releaseFire = () => { input.fire = false; };
  fireBtn.addEventListener('pointerup', releaseFire); fireBtn.addEventListener('pointercancel', releaseFire); fireBtn.addEventListener('pointerleave', releaseFire);
  dashBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (input.dash) return;
    input.dash = true;
    setTimeout(() => { input.dash = false; }, 90);
  });
})();
