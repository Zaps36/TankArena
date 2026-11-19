(() => {
  const TG = window.TankGame;
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const qrImg = document.getElementById('qr');
  const codeEl = document.getElementById('code');
  const scoreList = document.getElementById('score-list');
  const notice = document.getElementById('notice');
  const loading = document.getElementById('loading');
  const TICK = 1 / 30;
  const TANK_RADIUS = 18;
  const state = TG.createGame();
  const connections = new Map();
  let peer = null;
  let acc = 0;
  let last = performance.now();
  let noticeTimer = null;

  function showNotice(text) {
    notice.textContent = text;
    notice.style.display = 'block';
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { notice.style.display = 'none'; }, 2200);
  }

  function controllerUrl(peerId) {
    const url = new URL('controller.html', window.location.href);
    url.searchParams.set('room', peerId);
    return url.href;
  }

  function setupPeer() {
    peer = new Peer();
    peer.on('open', (id) => {
      const url = controllerUrl(id);
      codeEl.textContent = `ROOM ${id}`;
      loading.textContent = 'Room aktif · scan QR dari HP';
      QRCode.toDataURL(url, { margin: 1, width: 260 }, (error, dataUrl) => {
        if (error) {
          loading.textContent = url;
          return;
        }
        qrImg.src = dataUrl;
      });
    });
    peer.on('connection', setupConnection);
    peer.on('error', (error) => {
      console.error(error);
      loading.textContent = 'PeerJS gagal tersambung. Muat ulang halaman.';
      showNotice(`Koneksi gagal: ${error.type || 'unknown'}`);
    });
    peer.on('disconnected', () => {
      loading.textContent = 'Signaling terputus. Mencoba menyambung ulang...';
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
          conn.close();
          return;
        }
        playerId = player.id;
        connections.set(conn.peer, { conn, playerId });
        conn.send({ type: 'welcome', playerId, name: player.name, color: player.color });
        showNotice(`${player.name} bergabung`);
      } else if (message.type === 'input' && playerId) {
        TG.setInput(state, playerId, message.input || {});
      }
    });
    const cleanup = () => {
      if (!playerId) return;
      const player = state.players.get(playerId);
      connections.delete(conn.peer);
      TG.removePlayer(state, playerId);
      showNotice(`${player ? player.name : 'Pemain'} keluar`);
    };
    conn.on('close', cleanup);
    conn.on('error', cleanup);
  }

  function tick() {
    const events = TG.step(state, TICK);
    for (const event of events) {
      if (event.type === 'kill') {
        const victim = state.players.get(event.victim);
        showNotice(`${victim ? victim.name : 'Tank'} terkena serangan`);
      } else if (event.type === 'eliminated') {
        const victim = state.players.get(event.id);
        showNotice(`${victim ? victim.name : 'Pemain'} kehabisan 3 nyawa`);
      }
    }
    const snapshot = TG.snapshot(state);
    for (const { conn } of connections.values()) {
      if (conn.open) conn.send({ type: 'state', state: snapshot });
    }
    updateScores(snapshot.players);
  }

  function updateScores(players) {
    if (!players.length) { scoreList.textContent = 'Belum ada pemain'; return; }
    scoreList.innerHTML = '';
    for (const p of players) {
      const row = document.createElement('div');
      row.style.color = p.color;
      row.textContent = `${p.name}: ${p.kills} kill / ${p.deaths} mati · ${'♥'.repeat(Math.max(0, p.lives))}`;
      scoreList.appendChild(row);
    }
  }

  function drawGrid(w, h) {
    ctx.strokeStyle = 'rgba(255,255,255,.04)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= w; x += 50) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y <= h; y += 50) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  }

  function drawTank(p) {
    if (!p.alive) {
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      ctx.font = '14px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(p.eliminated ? `${p.name} ELIMINATED` : `${p.name} respawn ${p.respawnIn}`, p.x, p.y);
      return;
    }
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(0, 0, TANK_RADIUS, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#000'; ctx.stroke();
    ctx.rotate(p.angle);
    ctx.fillStyle = '#222'; ctx.fillRect(0, -4, TANK_RADIUS + 10, 8);
    ctx.restore();
    ctx.fillStyle = '#fff'; ctx.font = '12px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(p.name, p.x, p.y - TANK_RADIUS - 14);
    ctx.fillStyle = '#400'; ctx.fillRect(p.x - 18, p.y - TANK_RADIUS - 9, 36, 4);
    ctx.fillStyle = '#4f4'; ctx.fillRect(p.x - 18, p.y - TANK_RADIUS - 9, 36 * (p.hp / 100), 4);
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawGrid(canvas.width, canvas.height);
    const snapshot = TG.snapshot(state);
    for (const o of snapshot.obstacles) {
      ctx.fillStyle = '#6b5b45'; ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.strokeStyle = '#3e3427'; ctx.lineWidth = 3; ctx.strokeRect(o.x, o.y, o.w, o.h);
    }
    ctx.fillStyle = '#ffe066';
    for (const b of snapshot.bullets) { ctx.beginPath(); ctx.arc(b.x, b.y, 4, 0, Math.PI * 2); ctx.fill(); }
    for (const p of snapshot.players) drawTank(p);
    if (!snapshot.players.length) {
      ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.font = '24px system-ui'; ctx.textAlign = 'center';
      ctx.fillText('Scan QR untuk mulai bermain', canvas.width / 2, canvas.height / 2);
    }
    requestAnimationFrame(render);
  }

  function frame(now) {
    acc += Math.min(.1, (now - last) / 1000);
    last = now;
    while (acc >= TICK) { tick(); acc -= TICK; }
    requestAnimationFrame(frame);
  }

  setupPeer();
  requestAnimationFrame(render);
  requestAnimationFrame((now) => { last = now; requestAnimationFrame(frame); });
})();
