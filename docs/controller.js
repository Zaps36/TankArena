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
  const linkEl = $('link');
  const dashBtn = $('dash');
  const overlay = $('overlay');
  const overlayTitle = $('overlay-title');
  const overlayText = $('overlay-text');

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

  const input = TankTouch.attach({
    left: $('left'),
    leftKnob: $('left-knob'),
    right: $('right'),
    rightKnob: $('right-knob'),
    fire: $('fire'),
    dash: dashBtn,
  });

  if (!room) {
    message('QR tidak valid. Scan ulang dari layar utama.', true);
    return;
  }

  let joining = false;
  let inGame = false;
  let lastHp = null;
  let lastSent = '';
  let lastSentAt = 0;

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
      if (inGame) {
        linkEl.textContent = s.active === 'relay' ? 'RELAY' : s.active === 'rtc' ? 'LANGSUNG' : 'MENYAMBUNG';
        linkEl.className = s.active === 'relay' ? 'relay' : s.active ? '' : 'lost';
      }
    },
    onRetry(attempt) {
      if (inGame) return;
      message(`Belum ada jawaban dari layar utama, mencoba lagi (${attempt})...`);
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
    linkEl.textContent = net.transport() === 'relay' ? 'RELAY' : 'LANGSUNG';
    linkEl.className = net.transport() === 'relay' ? 'relay' : '';
  }

  function updateStatus(s) {
    const ratio = Math.max(0, s.hp) / 100;
    hpFill.style.width = `${ratio * 100}%`;
    hpFill.style.background = ratio > 0.6 ? 'var(--green)' : ratio > 0.3 ? 'var(--yellow)' : 'var(--red)';
    lifeEl.innerHTML = [0, 1, 2].map((i) => `<span class="heart${i < s.lives ? '' : ' empty'}"></span>`).join('');
    dashBtn.classList.toggle('cooldown', s.dash > 0);
    if (lastHp !== null && s.hp < lastHp) TankTouch.vibrate(s.hp <= 0 ? [80, 40, 120] : 40);
    lastHp = s.hp;

    if (s.round) {
      overlayTitle.textContent = s.round.title;
      overlayTitle.style.color = s.round.color || 'var(--yellow)';
      overlayText.textContent = s.round.text;
      overlay.style.display = 'grid';
    } else if (s.out) {
      overlayTitle.textContent = 'KO!';
      overlayTitle.style.color = 'var(--red)';
      overlayText.textContent = 'Nyawa habis. Tunggu ronde berikutnya.';
      overlay.style.display = 'grid';
    } else {
      overlay.style.display = 'none';
    }
  }

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

  // Kirim input saat berubah, plus detak berkala supaya TV tahu HP masih ada.
  setInterval(() => {
    if (!inGame || !net.transport()) return;
    const now = Date.now();
    const minGap = net.transport() === 'relay' ? 90 : 45;
    if (now - lastSentAt < minGap) return;
    const packed = [input.mx, input.my, input.ax, input.ay].map((v) => Math.round(v * 100) / 100);
    const flags = (input.aiming ? 1 : 0) | (input.fire ? 2 : 0) | (input.dash ? 4 : 0);
    const key = packed.join(',') + '|' + flags;
    if (key === lastSent && now - lastSentAt < 400) return;
    lastSent = key;
    lastSentAt = now;
    net.send({ t: 'in', i: packed, f: flags });
  }, 30);
})();
