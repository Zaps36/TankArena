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
    ctx.strokeStyle = 'rgba(23,37,28,.08)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= w; x += 50) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y <= h; y += 50) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  }

  function drawTank(p) {
    if (!p.alive) {
      ctx.fillStyle = 'rgba(23,37,28,.8)';
      ctx.font = 'bold 14px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(p.eliminated ? `${p.name} ELIMINATED` : `${p.name} respawn ${p.respawnIn}`, p.x, p.y);
      return;
    }
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(0,0,0,.35)';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 4;
    // Track kartun
    ctx.fillStyle = '#303b32';
    ctx.strokeStyle = '#17251c';
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.roundRect(-22, -15, 44, 30, 10); ctx.fill(); ctx.stroke();
    // Badan tank ber-outline tebal
    ctx.shadowOffsetY = 0;
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.roundRect(-16, -13, 32, 26, 9); ctx.fill(); ctx.stroke();
    // Laras dan turret
    ctx.rotate(p.angle);
    ctx.fillStyle = '#252b25';
    ctx.beginPath(); ctx.roundRect(2, -4, 27, 8, 4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f8d66d';
    ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.font = 'bold 13px system-ui'; ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.strokeStyle = '#17251c';
    ctx.strokeText(p.name, p.x, p.y - TANK_RADIUS - 14);
    ctx.fillStyle = '#fff'; ctx.fillText(p.name, p.x, p.y - TANK_RADIUS - 14);
    ctx.fillStyle = '#400'; ctx.fillRect(p.x - 18, p.y - TANK_RADIUS - 9, 36, 4);
    ctx.fillStyle = '#4f4'; ctx.fillRect(p.x - 18, p.y - TANK_RADIUS - 9, 36 * (p.hp / 100), 4);
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawGrid(canvas.width, canvas.height);
    const snapshot = TG.snapshot(state);
    for (const o of snapshot.obstacles) {
      ctx.fillStyle = '#a9784d';
      ctx.strokeStyle = '#4a3021';
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.roundRect(o.x, o.y, o.w, o.h, 12); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,230,160,.45)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(o.x + 12, o.y + 12); ctx.lineTo(o.x + o.w - 12, o.y + 12); ctx.stroke();
    }
    ctx.fillStyle = '#ffe066';
    ctx.strokeStyle = '#252b25';
    ctx.lineWidth = 3;
    for (const b of snapshot.bullets) { ctx.beginPath(); ctx.arc(b.x, b.y, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    for (const p of snapshot.players) drawTank(p);
    if (!snapshot.players.length) {
      ctx.fillStyle = 'rgba(23,37,28,.75)'; ctx.font = 'bold 26px system-ui'; ctx.textAlign = 'center';
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
