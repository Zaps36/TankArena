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
  const BOT_COUNT = 3;
  const TICK = 1 / 30;
  const ROUND_RESTART = 5; // detik

  let renderer = window.TankRender.createRenderer(canvas);
  let state = TG.createGame();
  const humans = []; // urutan bergabung: { id, name }
  let round = null; // { until, winnerId, result }
  let acc = 0;
  let last = performance.now();
  let statusTimer = 0;
  let toastTimer = null;
  let slotsKey = '';

  $('mode-label').textContent = MODE === 'bot' ? 'SOLO VS BOT' : 'MABAR';
  $('join-header').textContent = MODE === 'bot' ? 'SCAN, HP JADI STIK' : 'SCAN UNTUK MAIN';

  function showToast(text) {
    toastText.textContent = text;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
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

  // ---------------------------------------------------------------- ronde
  function rebuildGame() {
    state = TG.createGame();
    for (const h of humans) TG.addPlayer(state, h.id, h.name);
    if (MODE === 'bot' && humans.length) {
      for (let i = 1; i <= BOT_COUNT; i++) TG.addPlayer(state, `bot${i}`, `Bot ${i}`);
    }
    renderer = window.TankRender.createRenderer(canvas);
    round = null;
  }

  function checkRound() {
    if (round) return;
    const players = [...state.players.values()];
    if (MODE === 'bot') {
      const me = humans[0] && state.players.get(humans[0].id);
      if (!me) return;
      if (me.eliminated) round = { result: 'lose' };
      else if (!players.some((p) => p.id.startsWith('bot') && !p.eliminated)) round = { result: 'win' };
    } else {
      if (humans.length < 2) return;
      const standing = players.filter((p) => !p.eliminated);
      if (standing.length > 1) return;
      round = { result: standing.length ? 'winner' : 'draw', winnerId: standing[0] && standing[0].id };
    }
    if (round) round.until = performance.now() + ROUND_RESTART * 1000;
  }

  function roundBanner() {
    if (!round) return null;
    const left = Math.max(0, Math.ceil((round.until - performance.now()) / 1000));
    const next = `Ronde baru dalam ${left} detik...`;
    if (round.result === 'win') return { title: 'MENANG!', subtitle: `Semua bot tumbang! ${next}`, color: '#4cd964' };
    if (round.result === 'lose') return { title: 'KALAH!', subtitle: `Nyawa habis. ${next}`, color: '#ff4d5e' };
    if (round.result === 'draw') return { title: 'SERI!', subtitle: next, color: '#ffd23f' };
    const w = state.players.get(round.winnerId);
    return { title: 'JUARA!', subtitle: `${w ? w.name : 'Pemenang'} menang! ${next}`, color: w ? w.color : '#ffd23f' };
  }

  function roundFor(id) {
    if (!round) return null;
    const left = Math.max(0, Math.ceil((round.until - performance.now()) / 1000));
    const text = `Ronde baru dalam ${left} detik.`;
    if (round.result === 'win') return { title: 'MENANG!', text, color: '#4cd964' };
    if (round.result === 'lose') return { title: 'KALAH!', text, color: '#ff4d5e' };
    if (round.result === 'draw') return { title: 'SERI!', text, color: '#ffd23f' };
    if (round.winnerId === id) return { title: 'JUARA!', text, color: '#4cd964' };
    const w = state.players.get(round.winnerId);
    return { title: 'KALAH!', text: `${w ? w.name : 'Lawan'} menang. ${text}`, color: '#ff4d5e' };
  }

  // -------------------------------------------------------------- jaringan
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
    },
    onLeave(id) {
      const idx = humans.findIndex((h) => h.id === id);
      if (idx < 0) return;
      const [h] = humans.splice(idx, 1);
      showToast(`${h.name} keluar`);
      if (MODE === 'bot') rebuildGame();
      else {
        TG.removePlayer(state, id);
        if (humans.length < 2) round = null;
      }
    },
  });

  const LABEL = { connecting: ['...', 'wait'], ready: ['siap', 'ready'], unsupported: ['mati', 'bad'], error: ['gagal', 'bad'] };
  function paintChip(chip, prefix, s) {
    const [text, cls] = LABEL[s] || ['...', 'wait'];
    chip.textContent = `${prefix}: ${text}`;
    chip.className = `chip ${cls}`;
  }

  function welcome(id) {
    const p = state.players.get(id);
    if (p) host.send(id, { t: 'welcome', playerId: id, name: p.name, color: p.color, mode: MODE });
  }

  function handleJoin(id, msg) {
    if (humans.some((h) => h.id === id)) {
      welcome(id); // HP bergabung ulang (misalnya pindah jalur koneksi)
      return;
    }
    const limit = MODE === 'bot' ? 1 : TG.MAX_PLAYERS;
    if (humans.length >= limit) {
      host.send(id, { t: 'error', message: MODE === 'bot' ? 'Mode solo hanya untuk 1 pemain. Pilih MABAR untuk main bareng.' : 'Room sudah penuh (maksimal 4 pemain).' });
      host.kick(id);
      return;
    }
    const name = String(msg.name || '').trim().slice(0, 12) || `Pemain ${humans.length + 1}`;
    humans.push({ id, name });
    if (MODE === 'bot' || round) rebuildGame();
    else TG.addPlayer(state, id, name);
    welcome(id);
    showToast(`${name} masuk arena!`);
  }

  function handleInput(id, msg) {
    if (!state.players.has(id) || round) return;
    const i = Array.isArray(msg.i) ? msg.i : [];
    const f = Number(msg.f) || 0;
    TG.setInput(state, id, { mx: i[0], my: i[1], ax: i[2], ay: i[3], aiming: !!(f & 1), fire: !!(f & 2), dash: !!(f & 4) });
  }

  function sendStatus() {
    for (const h of humans) {
      const p = state.players.get(h.id);
      if (!p) continue;
      host.send(h.id, { t: 'me', hp: p.hp, lives: p.lives, dash: Math.round(p.dashCooldown * 10) / 10, out: p.eliminated, round: roundFor(h.id) });
    }
  }

  // ------------------------------------------------------------------ UI
  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function updateSlots(players) {
    const shown = MODE === 'bot' ? players : players.slice(0, TG.MAX_PLAYERS);
    const key = JSON.stringify(shown.map((p) => [p.id, p.kills, p.lives, p.eliminated]));
    if (key === slotsKey) return;
    slotsKey = key;
    let html = slotsEl.querySelector('.panel-header').outerHTML;
    const total = MODE === 'bot' ? 1 + BOT_COUNT : TG.MAX_PLAYERS;
    for (let i = 0; i < total; i++) {
      const p = shown[i];
      if (p) {
        const hearts = [0, 1, 2].map((k) => `<span class="heart${k < p.lives ? '' : ' empty'}"></span>`).join('');
        html += `<div class="slot filled${p.eliminated ? ' out' : ''}">
          <span class="dot" style="background:${p.color}"></span>
          <span class="name">${escapeHtml(p.name)}</span>
          <span class="stats"><span class="hearts">${hearts}</span><br>${p.kills} KO</span>
        </div>`;
      } else {
        const text = MODE === 'bot' ? (i === 0 ? 'Scan QR untuk main...' : 'Bot siap') : 'Menunggu pemain...';
        html += `<div class="slot"><span class="dot"></span><span class="waiting">${text}</span></div>`;
      }
    }
    slotsEl.innerHTML = html;
  }

  // ---------------------------------------------------------------- loop
  function tick() {
    if (MODE === 'bot') {
      for (let i = 1; i <= BOT_COUNT; i++) {
        const id = `bot${i}`;
        if (state.players.has(id)) TG.setInput(state, id, round ? {} : TG.botInput(state, id));
      }
    }
    if (round) for (const h of humans) TG.setInput(state, h.id, {});
    renderer.onEvents(TG.step(state, TICK));
    checkRound();
    if (round && performance.now() >= round.until) rebuildGame();
    statusTimer += TICK;
    if (statusTimer >= 0.16) {
      statusTimer = 0;
      sendStatus();
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
    let emptyText = null;
    if (!humans.length) emptyText = 'Scan QR untuk masuk arena!';
    else if (MODE === 'party' && humans.length === 1) emptyText = null;
    renderer.draw(snapshot, { emptyText, banner: roundBanner(), hud: false });
    if (MODE === 'party' && humans.length === 1 && !round) {
      const ctx = canvas.getContext('2d');
      ctx.font = "22px 'Lilita One', system-ui";
      ctx.textAlign = 'center';
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#1b1530';
      ctx.strokeText('Menunggu pemain lain... (latihan dulu)', canvas.width / 2, canvas.height - 40);
      ctx.fillStyle = '#fff';
      ctx.fillText('Menunggu pemain lain... (latihan dulu)', canvas.width / 2, canvas.height - 40);
    }
    updateSlots(snapshot.players);
    requestAnimationFrame(frame);
  }

  // Hanya-baca, untuk debug dari console browser.
  window.TankArenaDebug = { snapshot: () => TG.snapshot(state), humans: () => humans.slice() };

  window.addEventListener('beforeunload', () => host.destroy());
  requestAnimationFrame((now) => {
    last = now;
    requestAnimationFrame(frame);
  });
})();
