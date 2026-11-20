(() => {
  const $ = (id) => document.getElementById(id);
  const room = TankNet.normalizeRoom(new URLSearchParams(location.search).get('room'));
  const joinEl = $('join');
  const gameEl = $('game');
  const nameInput = $('name');
  const joinBtn = $('join-btn');
  const msgEl = $('msg');
  const chipRtc = $('chip-rtc');
  const chipRelay = $('chip-relay');
  const lifeEl = $('life');
  const hpFill = $('hp-fill');
  const ptsEl = $('pts');
  const linkEl = $('link');
  const dashBtn = $('dash');
  const roundPill = $('round-pill');
  const lobbyEl = $('lobby');
  const lobbyText = $('lobby-text');
  const lobbyHost = $('lobby-host');
  const bigEl = $('big');
  const overlay = $('overlay');
  const overlayTitle = $('overlay-title');
  const overlayText = $('overlay-text');
  const overlayExtra = $('overlay-extra');
  const overlayBtns = $('overlay-btns');

  $('room-code').textContent = room || '-';
  try {
    nameInput.value = localStorage.getItem('tankarena-name') || '';
  } catch (e) {
    // abaikan
  }

  function message(text, isError) {
    msgEl.textContent = text;
    msgEl.classList.toggle('error', !!isError);
  }

  if (!room) {
    message('QR tidak valid. Scan ulang dari layar utama.', true);
    return;
  }

  let joining = false;
  let inGame = false;
  let lastHp = null;
  let lastSent = '';
  let lastSentAt = 0;
  let sendTimer = null;
  let bigKey = '';
  let lastStatus = null;

  // ------------------------------------------------------------ kirim input
  // Dikirim segera saat berubah (dibatasi jaraknya), plus detak berkala.
  function packed(input) {
    return {
      t: 'in',
      i: [input.mx, input.my, input.ax, input.ay, input.sx, input.sy].map((v) => Math.round(v * 100) / 100),
      f: (input.aiming ? 1 : 0) | (input.dash ? 4 : 0),
      s: input.shot,
    };
  }

  function sendInput(force) {
    if (!inGame || !net.transport()) return;
    const now = Date.now();
    const msg = packed(pad.input);
    const k = JSON.stringify(msg);
    if (!force && k === lastSent && now - lastSentAt < 350) return;
    const minGap = net.transport() === 'relay' ? 70 : 25;
    const wait = minGap - (now - lastSentAt);
    if (wait > 0 && !force) {
      if (!sendTimer) sendTimer = setTimeout(() => {
        sendTimer = null;
        sendInput(false);
      }, wait);
      return;
    }
    clearTimeout(sendTimer);
    sendTimer = null;
    lastSent = k;
    lastSentAt = now;
    net.send(msg);
  }

  const pad = TankTouch.attach({
    left: $('left'),
    leftKnob: $('left-knob'),
    attack: $('attack'),
    attackKnob: $('attack-knob'),
    dash: dashBtn,
  }, {
    cooldown: 1.2,
    // Tembakan dan dash dikirim tanpa menunggu supaya terasa responsif.
    onChange: (input, reason) => sendInput(reason === 'shot' || reason === 'dash'),
  });

  setInterval(() => sendInput(false), 120);

  // ------------------------------------------------------------- jaringan
  const LABEL = {
    connecting: ['...', 'wait'],
    ready: ['siap', 'ready'],
    unsupported: ['tidak didukung', 'bad'],
    timeout: ['gagal', 'bad'],
    error: ['gagal', 'bad'],
    closed: ['putus', 'bad'],
  };

  function paintChip(chip, prefix, state) {
    const [text, cls] = LABEL[state] || ['...', 'wait'];
    chip.textContent = `${prefix}: ${text}`;
    chip.className = `chip ${cls}`;
  }

  function paintLink(active) {
    linkEl.textContent = active === 'relay' ? 'RELAY' : active === 'rtc' ? 'LANGSUNG' : 'MENYAMBUNG';
    linkEl.className = active === 'relay' ? 'relay' : active ? '' : 'lost';
  }

  const net = TankNet.connectClient(room, {
    onStatus(s) {
      paintChip(chipRtc, 'Langsung', s.rtc);
      paintChip(chipRelay, 'Relay', s.relay);
      const usable = s.rtc === 'ready' || s.relay === 'ready';
      if (!joining && !inGame) {
        joinBtn.disabled = !usable;
        if (usable) message('Siap! Isi nama lalu tekan MASUK.');
        else if (s.rtc !== 'connecting' && s.relay !== 'connecting') message('Tidak bisa tersambung ke internet. Cek koneksi HP lalu muat ulang.', true);
      }
      if (inGame) paintLink(s.active);
    },
    onRetry(attempt) {
      if (!inGame) message(`Belum ada jawaban dari layar utama, mencoba lagi (${attempt})...`);
    },
    onFail(text) {
      joining = false;
      joinBtn.disabled = false;
      message(text, true);
    },
    onMessage(msg) {
      if (msg.t === 'error') {
        joining = false;
        joinBtn.disabled = false;
        message(msg.message || 'Gagal masuk.', true);
      } else if (msg.t === 'welcome') {
        enterGame(msg);
      } else if (msg.t === 'me') {
        updateStatus(msg);
      }
    },
  });

  function enterGame(msg) {
    joining = false;
    if (!inGame) TankTouch.vibrate(60);
    inGame = true;
    document.documentElement.style.setProperty('--me', msg.color || '#ff4d5e');
    $('me-name').textContent = msg.name || 'Kamu';
    joinEl.style.display = 'none';
    document.querySelector('.clouds').style.display = 'none';
    gameEl.style.display = 'block';
    paintLink(net.transport());
    sendInput(true);
  }

  // ------------------------------------------------------------ status UI
  function showBig(text, cls) {
    const k = `${text}|${cls}`;
    if (k === bigKey) return;
    bigKey = k;
    bigEl.innerHTML = text ? `<span class="${cls || ''}">${text}</span>` : '';
  }

  function showOverlay(title, color, text, extra, buttons) {
    overlayTitle.textContent = title;
    overlayTitle.style.color = color;
    overlayText.innerHTML = text;
    overlayExtra.innerHTML = extra || '';
    overlayBtns.style.display = buttons ? 'flex' : 'none';
    overlay.style.display = 'grid';
  }

  function placeLabel(n) {
    return n === 1 ? 'JUARA 1!' : `JUARA ${n}`;
  }

  function updateStatus(s) {
    const prev = lastStatus;
    lastStatus = s;
    const ratio = Math.max(0, s.hp) / 100;
    hpFill.style.width = `${ratio * 100}%`;
    hpFill.style.background = ratio > 0.6 ? 'var(--green)' : ratio > 0.3 ? 'var(--yellow)' : 'var(--red)';
    lifeEl.innerHTML = [0, 1, 2].map((i) => `<span class="heart${i < s.lives ? '' : ' empty'}"></span>`).join('');
    ptsEl.textContent = `${s.total} poin`;
    dashBtn.classList.toggle('cooldown', s.dash > 0);
    pad.syncCooldown(s.fire);
    if (s.phase === 'play' && lastHp !== null && s.hp < lastHp) TankTouch.vibrate(s.hp <= 0 ? [80, 40, 120] : 40);
    lastHp = s.hp;

    // Lobby
    lobbyEl.style.display = s.phase === 'lobby' ? 'block' : 'none';
    if (s.phase === 'lobby') {
      lobbyHost.style.display = s.host ? 'block' : 'none';
      lobbyText.textContent = s.host
        ? `Kamu host. Pilih ronde lalu mulai (${s.players} pemain). Sambil nunggu, coba latihan tembak!`
        : 'Menunggu host memulai game... Sambil nunggu, coba latihan tembak!';
      lobbyEl.querySelectorAll('.seg').forEach((b) => b.classList.toggle('on', Number(b.dataset.n) === s.rounds));
    }

    // Info ronde + waktu
    if (s.phase === 'play' || s.phase === 'countdown' || s.phase === 'intro') {
      roundPill.hidden = false;
      const left = s.left === null ? '' : ` · ${Math.floor(s.left / 60)}:${String(s.left % 60).padStart(2, '0')}`;
      roundPill.textContent = `RONDE ${s.round}/${s.rounds}${left}`;
      roundPill.classList.toggle('hurry', s.left !== null && s.left <= 10);
    } else {
      roundPill.hidden = true;
    }

    // Teks besar
    if (s.phase === 'intro') showBig(s.round === s.rounds ? 'RONDE TERAKHIR!' : `RONDE ${s.round}`, 'small');
    else if (s.phase === 'countdown' || (s.phase === 'play' && s.cd === 'GO!')) {
      showBig(String(s.cd), s.cd === 'GO!' ? 'go' : '');
      if (!prev || prev.cd !== s.cd) TankTouch.vibrate(s.cd === 'GO!' ? 90 : 25);
    } else showBig('', '');

    // Overlay
    if (s.waiting) {
      showOverlay('TUNGGU', 'var(--yellow)', 'Kamu ikut mulai <b>ronde berikutnya</b>.');
    } else if (s.phase === 'roundEnd' && s.place) {
      const color = s.place === 1 ? 'var(--yellow)' : s.place === 2 ? '#d7d7e6' : s.place === 3 ? 'var(--orange)' : '#fff';
      showOverlay(placeLabel(s.place), color, `Ronde ${s.round} selesai`, `<div class="gain">+${s.gain} poin</div><p>Total ${s.total} poin · peringkat ${s.rank} dari ${s.players}</p>`);
    } else if (s.phase === 'final') {
      const win = s.rank === 1;
      showOverlay(win ? 'JUARA UMUM!' : `PERINGKAT ${s.rank}`, win ? 'var(--yellow)' : '#fff', win ? 'Selamat, kamu juaranya! 🏆' : 'Game selesai. Lihat podium di layar utama.', `<p>Total ${s.total} poin</p>`, s.host);
      if (!prev || prev.phase !== 'final') TankTouch.vibrate(win ? [100, 60, 100, 60, 200] : 80);
    } else if (s.phase === 'play' && s.out) {
      showOverlay('KO!', 'var(--red)', 'Nyawa habis. Tunggu ronde selesai.');
    } else {
      overlay.style.display = 'none';
    }
  }

  // ------------------------------------------------------- tombol host
  lobbyEl.querySelectorAll('.seg').forEach((b) => {
    b.addEventListener('click', () => net.send({ t: 'rounds', n: Number(b.dataset.n) }));
  });
  $('start-btn').addEventListener('click', () => net.send({ t: 'start' }));
  $('again-btn').addEventListener('click', () => net.send({ t: 'again' }));
  $('lobby-btn').addEventListener('click', () => net.send({ t: 'lobby' }));

  joinBtn.addEventListener('click', () => {
    if (joining) return;
    const name = nameInput.value.trim() || 'Pemain';
    try {
      localStorage.setItem('tankarena-name', name);
    } catch (e) {
      // abaikan
    }
    joining = true;
    joinBtn.disabled = true;
    message('Menghubungkan ke layar utama...');
    net.join(name);
  });
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') joinBtn.click();
  });
})();
