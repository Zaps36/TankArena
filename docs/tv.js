(() => {
  const TG = window.TankGame;
  const $ = (id) => document.getElementById(id);
  const canvas = $('game');
  const qrImg = $('qr');
  const qrPlaceholder = $('qr-placeholder');
  const codeEl = $('code');
  const loading = $('loading');
  const slotsEl = $('slots');
  const toast = $('toast');
  const toastText = $('toast-text');
  const chipRtc = $('chip-rtc');
  const chipRelay = $('chip-relay');

  const MODE = new URLSearchParams(location.search).get('mode') === 'bot' ? 'bot' : 'party';
  const TICK = 1 / 60;
  const STATUS_EVERY = 0.12; // detik antar kiriman status ke HP

  const match = TankMatch.create({ mode: MODE, botCount: 3 });
  let renderer = TankRender.createRenderer(canvas);
  let rendererRound = 0;
  let acc = 0;
  let last = performance.now();
  let statusTimer = 0;
  let toastTimer = null;
  let slotsKey = '';

  $('mode-label').textContent = MODE === 'bot' ? 'SOLO VS BOT' : 'MABAR';
  $('join-header').textContent = MODE === 'bot' ? 'SCAN, HP JADI STIK' : 'SCAN UNTUK MAIN';

  const overlay = TankOverlay.create($('stage'), {
    onStart: () => startGame(),
    onRounds: (n) => {
      match.setRounds(n);
      pushStatus();
    },
    onPlayAgain: () => {
      match.playAgain();
      pushStatus();
    },
    onLobby: () => {
      match.toLobby();
      pushStatus();
    },
    lobbyText: (m) => {
      const n = m.participants.filter((p) => !p.bot).length;
      if (MODE === 'bot') return n ? 'Siap! Pilih jumlah ronde lalu mulai. Kamu lawan 3 bot.' : 'Scan QR di kiri pakai HP untuk jadi stik.';
      return `Scan QR di kiri untuk ikut · <b>${n}/${TG.MAX_PLAYERS}</b> pemain. Pemain pertama juga bisa mulai dari HP.`;
    },
  });

  function showToast(text) {
    toastText.textContent = text;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
  }

  function startGame() {
    const can = match.canStart();
    if (!can.ok) {
      showToast(can.reason);
      return;
    }
    match.start();
    pushStatus();
  }

  function controllerUrl(code) {
    const url = new URL('controller.html', location.href);
    url.search = '';
    url.searchParams.set('room', code);
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
      $('room-link').textContent = url.replace(/^https?:\/\//, '');
    } catch (error) {
      console.error(error);
      loading.textContent = `QR gagal dibuat. Buka: ${url}`;
    }
  }

  // -------------------------------------------------------------- jaringan
  const LABEL = { connecting: ['...', 'wait'], ready: ['siap', 'ready'], unsupported: ['mati', 'bad'], error: ['gagal', 'bad'] };
  function paintChip(chip, prefix, s) {
    const [text, cls] = LABEL[s] || ['...', 'wait'];
    chip.textContent = `${prefix}: ${text}`;
    chip.className = `chip ${cls}`;
  }

  const host = TankNet.createHost({
    onStatus(s) {
      codeEl.textContent = s.room;
      paintChip(chipRtc, 'Langsung', s.rtc);
      paintChip(chipRelay, 'Relay', s.relay);
      const anyReady = s.rtc === 'ready' || s.relay === 'ready';
      if (anyReady) {
        if (qrImg.hidden) showQr(controllerUrl(s.room));
        loading.textContent = MODE === 'bot' ? 'Siap! Scan pakai kamera HP.' : 'Siap! Scan pakai kamera HP (2-4 pemain).';
      } else if (s.rtc === 'connecting' || s.relay === 'connecting') {
        loading.textContent = 'Menyiapkan room...';
      } else {
        loading.textContent = 'Tidak bisa tersambung. Cek internet lalu muat ulang.';
      }
    },
    onMessage(id, msg) {
      if (msg.t === 'join') handleJoin(id, msg);
      else if (msg.t === 'in') handleInput(id, msg);
      else if (isHost(id)) handleHostCommand(msg);
    },
    onLeave(id) {
      const p = match.participants.find((x) => x.id === id);
      const result = match.remove(id);
      if (!result) return;
      showToast(`${p ? p.name : 'Pemain'} keluar`);
      if (result === 'aborted') showToast('Pemain kurang, kembali ke lobby');
      pushStatus();
    },
  });

  function isHost(id) {
    const first = match.participants.find((p) => !p.bot);
    return !!first && first.id === id;
  }

  function welcome(id) {
    const p = match.participants.find((x) => x.id === id);
    if (p) host.send(id, { t: 'welcome', playerId: id, name: p.name, color: p.color, mode: MODE, cooldown: TG.FIRE_COOLDOWN });
  }

  function handleJoin(id, msg) {
    const res = match.add(id, msg.name, false);
    if (!res.ok) {
      host.send(id, { t: 'error', message: res.error });
      host.kick(id);
      return;
    }
    welcome(id);
    if (!res.rejoin) showToast(res.participant.waiting ? `${res.participant.name} ikut mulai ronde depan` : `${res.participant.name} masuk arena!`);
    pushStatus();
  }

  function handleInput(id, msg) {
    const i = Array.isArray(msg.i) ? msg.i : [];
    const f = Number(msg.f) || 0;
    match.setInput(id, {
      mx: i[0], my: i[1], ax: i[2], ay: i[3], sx: i[4], sy: i[5],
      aiming: !!(f & 1), dash: !!(f & 4),
      shot: Number.isInteger(msg.s) ? msg.s : null,
    });
  }

  function handleHostCommand(msg) {
    if (msg.t === 'start') startGame();
    else if (msg.t === 'rounds') match.setRounds(Number(msg.n));
    else if (msg.t === 'again') match.playAgain();
    else if (msg.t === 'lobby') match.toLobby();
    pushStatus();
  }

  function pushStatus() {
    statusTimer = 0;
    for (const p of match.participants) {
      if (!p.bot) host.send(p.id, Object.assign({ t: 'me' }, match.statusFor(p.id)));
    }
  }

  // ------------------------------------------------------------------ UI
  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function updateSlots() {
    const tanks = match.game.players;
    const list = match.phase === 'lobby' ? match.participants : match.standings();
    const key = JSON.stringify([match.phase, list.map((p) => {
      const t = tanks.get(p.id);
      return [p.id, p.total, t ? t.lives : -1, t ? t.eliminated : false, p.waiting];
    })]);
    if (key === slotsKey) return;
    slotsKey = key;
    let html = slotsEl.querySelector('.panel-header').outerHTML;
    const total = MODE === 'bot' && match.phase !== 'lobby' ? list.length : TG.MAX_PLAYERS;
    for (let i = 0; i < total; i++) {
      const p = list[i];
      if (p) {
        const t = tanks.get(p.id);
        const lives = t ? t.lives : TG.MAX_LIVES;
        const hearts = [0, 1, 2].map((k) => `<span class="heart${k < lives ? '' : ' empty'}"></span>`).join('');
        const sub = p.waiting ? 'ronde depan' : `${p.total} poin`;
        html += `<div class="slot filled${t && t.eliminated ? ' out' : ''}">
          <span class="dot" style="background:${p.color}"></span>
          <span class="name">${escapeHtml(p.name)}</span>
          <span class="stats"><span class="hearts">${hearts}</span><br>${sub}</span>
        </div>`;
      } else {
        const text = MODE === 'bot' ? (i === 0 ? 'Scan QR untuk main...' : 'Bot ikut saat mulai') : 'Menunggu pemain...';
        html += `<div class="slot"><span class="dot"></span><span class="waiting">${text}</span></div>`;
      }
    }
    slotsEl.innerHTML = html;
  }

  // ---------------------------------------------------------------- loop
  function tick() {
    const before = match.phase;
    const events = match.update(TICK);
    // Ronde baru = arena baru; renderer di-reset supaya efek lama hilang.
    if (match.round !== rendererRound && match.phase === 'roulette') {
      rendererRound = match.round;
      renderer = TankRender.createRenderer(canvas);
    }
    if (match.phase === 'lobby' && rendererRound !== 0) {
      rendererRound = 0;
      renderer = TankRender.createRenderer(canvas);
    }
    renderer.onEvents(events);
    statusTimer += TICK;
    if (before !== match.phase || statusTimer >= STATUS_EVERY) pushStatus();
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
    const snapshot = TG.snapshot(match.game);
    renderer.draw(snapshot, { emptyText: match.participants.length ? null : 'Scan QR untuk masuk arena!' });
    overlay.render(match);
    updateSlots();
    requestAnimationFrame(frame);
  }

  // Hanya-baca, untuk debug dari console browser.
  window.TankArenaDebug = {
    snapshot: () => TG.snapshot(match.game),
    humans: () => match.participants.filter((p) => !p.bot).map((p) => ({ id: p.id, name: p.name })),
    match: () => ({ phase: match.phase, round: match.round, rounds: match.rounds, standings: match.standings().map((p) => [p.name, p.total]) }),
  };

  window.addEventListener('beforeunload', () => host.destroy());
  requestAnimationFrame((now) => {
    last = now;
    requestAnimationFrame(frame);
  });
})();
