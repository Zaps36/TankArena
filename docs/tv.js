(() => {
  const TG = window.TankGame;
  const canvas = document.getElementById('game');
  const renderer = window.TankRender.createRenderer(canvas);
  const qrImg = document.getElementById('qr');
  const qrPlaceholder = document.getElementById('qr-placeholder');
  const codeEl = document.getElementById('code');
  const loading = document.getElementById('loading');
  const slotsEl = document.getElementById('slots');
  const toast = document.getElementById('toast');
  const toastText = document.getElementById('toast-text');

  const TICK = 1 / 30;
  const state = TG.createGame();
  const connections = new Map();
  let peer = null;
  let acc = 0;
  let last = performance.now();
  let toastTimer = null;
  let slotsKey = '';

  function showToast(text) {
    toastText.textContent = text;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
  }

  function controllerUrl(peerId) {
    const url = new URL('controller.html', window.location.href);
    url.searchParams.set('room', peerId);
    return url.href;
  }

  function showQr(url) {
    try {
      const qr = qrcode(0, 'M');
      qr.addData(url);
      qr.make();
      qrImg.src = qr.createDataURL(6, 2);
      qrImg.hidden = false;
      qrPlaceholder.hidden = true;
    } catch (error) {
      console.error(error);
      loading.textContent = `QR gagal dibuat. Buka: ${url}`;
    }
  }

  function setupPeer() {
    peer = new Peer();
    peer.on('open', (id) => {
      codeEl.textContent = id.slice(0, 8).toUpperCase();
      codeEl.title = id;
      loading.textContent = 'Room siap! Scan pakai kamera HP.';
      showQr(controllerUrl(id));
    });
    peer.on('connection', setupConnection);
    peer.on('error', (error) => {
      console.error(error);
      loading.textContent = 'Koneksi gagal. Muat ulang halaman.';
      showToast(`Koneksi gagal: ${error.type || 'unknown'}`);
    });
    peer.on('disconnected', () => {
      loading.textContent = 'Signaling terputus, menyambung ulang...';
      peer.reconnect();
    });
  }

  function setupConnection(conn) {
    let playerId = null;
    conn.on('data', (message) => {
      if (!message || typeof message !== 'object') return;
      if (message.type === 'join' && !playerId) {
        const player = TG.addPlayer(state, conn.peer, message.name);
        if (!player) {
          conn.send({ type: 'error', message: 'Room sudah penuh (maksimal 4 pemain).' });
          setTimeout(() => conn.close(), 300);
          return;
        }
        playerId = player.id;
        connections.set(conn.peer, { conn, playerId });
        conn.send({ type: 'welcome', playerId, name: player.name, color: player.color });
        showToast(`${player.name} masuk arena!`);
      } else if (message.type === 'input' && playerId) {
        TG.setInput(state, playerId, message.input || {});
      }
    });
    const cleanup = () => {
      if (!playerId) return;
      const player = state.players.get(playerId);
      connections.delete(conn.peer);
      TG.removePlayer(state, playerId);
      showToast(`${player ? player.name : 'Pemain'} keluar`);
      playerId = null;
    };
    conn.on('close', cleanup);
    conn.on('error', cleanup);
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function updateSlots(players) {
    const key = JSON.stringify(players.map((p) => [p.id, p.kills, p.lives, p.eliminated]));
    if (key === slotsKey) return;
    slotsKey = key;
    const header = slotsEl.querySelector('.panel-header').outerHTML;
    let html = header;
    for (let i = 0; i < TG.MAX_PLAYERS; i++) {
      const p = players[i];
      if (p) {
        const hearts = [0, 1, 2].map((k) => `<span class="heart${k < p.lives ? '' : ' empty'}"></span>`).join('');
        html += `<div class="slot filled${p.eliminated ? ' out' : ''}">
          <span class="dot" style="background:${p.color}"></span>
          <span class="name">${escapeHtml(p.name)}</span>
          <span class="stats"><span class="hearts">${hearts}</span><br>${p.kills} KO</span>
        </div>`;
      } else {
        html += `<div class="slot"><span class="dot"></span><span class="waiting">Menunggu pemain...</span></div>`;
      }
    }
    slotsEl.innerHTML = html;
  }

  function tick() {
    renderer.onEvents(TG.step(state, TICK));
    const snapshot = TG.snapshot(state);
    for (const { conn } of connections.values()) {
      if (conn.open) conn.send({ type: 'state', state: snapshot });
    }
  }

  function frame(now) {
    acc += Math.min(0.1, (now - last) / 1000);
    last = now;
    while (acc >= TICK) {
      tick();
      acc -= TICK;
    }
    const snapshot = TG.snapshot(state);
    renderer.draw(snapshot, { emptyText: 'Scan QR untuk masuk arena!' });
    updateSlots(snapshot.players);
    requestAnimationFrame(frame);
  }

  setupPeer();
  requestAnimationFrame((now) => {
    last = now;
    requestAnimationFrame(frame);
  });
})();
