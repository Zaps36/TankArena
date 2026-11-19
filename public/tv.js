(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const qrImg = document.getElementById('qr');
  const codeEl = document.getElementById('code');
  const scoreList = document.getElementById('score-list');
  const notice = document.getElementById('notice');

  const TANK_RADIUS = 18;
  let state = null;
  let noticeTimer = null;

  const socket = io();

  socket.on('connect', () => {
    socket.emit('tv:create', {}, (res) => {
      if (!res.ok) return showNotice('Gagal membuat room');
      qrImg.src = res.qr;
      codeEl.textContent = res.code;
    });
  });

  socket.on('state', (s) => {
    state = s;
    updateScores(s.players);
  });

  socket.on('player:joined', (p) => showNotice(`${p.name} bergabung`));
  socket.on('player:left', (p) => showNotice(`${p.name || 'Pemain'} keluar`));
  socket.on('event', (ev) => {
    if (ev.type === 'kill') showNotice('Tank hancur!');
  });
  socket.on('disconnect', () => showNotice('Koneksi ke server terputus'));

  function showNotice(text) {
    notice.textContent = text;
    notice.style.display = 'block';
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => (notice.style.display = 'none'), 2000);
  }

  function updateScores(players) {
    if (!players.length) {
      scoreList.textContent = 'Belum ada pemain';
      return;
    }
    scoreList.innerHTML = '';
    for (const p of players) {
      const row = document.createElement('div');
      row.style.color = p.color;
      row.textContent = `${p.name}: ${p.kills} kill / ${p.deaths} mati`;
      scoreList.appendChild(row);
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

  function drawObstacles(obstacles) {
    for (const o of obstacles) {
      ctx.fillStyle = '#6b5b45';
      ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.strokeStyle = '#3e3427';
      ctx.lineWidth = 3;
      ctx.strokeRect(o.x, o.y, o.w, o.h);
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

    ctx.save();
    ctx.translate(p.x, p.y);

    // Badan tank
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(0, 0, TANK_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#000';
    ctx.stroke();

    // Laras
    ctx.rotate(p.angle);
    ctx.fillStyle = '#222';
    ctx.fillRect(0, -4, TANK_RADIUS + 10, 8);
    ctx.restore();

    // Nama dan HP
    ctx.fillStyle = '#fff';
    ctx.font = '12px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(p.name, p.x, p.y - TANK_RADIUS - 14);

    const barW = 36;
    ctx.fillStyle = '#400';
    ctx.fillRect(p.x - barW / 2, p.y - TANK_RADIUS - 9, barW, 4);
    ctx.fillStyle = '#4f4';
    ctx.fillRect(p.x - barW / 2, p.y - TANK_RADIUS - 9, barW * (p.hp / 100), 4);
  }

  function render() {
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    drawGrid(w, h);

    if (state) {
      drawObstacles(state.obstacles);

      ctx.fillStyle = '#ffe066';
      for (const b of state.bullets) {
        ctx.beginPath();
        ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
        ctx.fill();
      }

      for (const p of state.players) drawTank(p);

      if (state.players.length === 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = '24px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('Scan QR untuk mulai bermain', w / 2, h / 2);
      }
    }

    requestAnimationFrame(render);
  }

  requestAnimationFrame(render);
})();
