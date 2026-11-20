// Pengatur pertandingan multi-ronde: lobby -> intro ronde -> hitung mundur ->
// main -> hasil ronde (poin) -> ronde berikutnya ... -> juara umum.
// Dipakai layar TV (tv.js) dan mode main di HP (solo.js). Tidak menyentuh DOM.
(function (root) {
  'use strict';

  const TG = root.TankGame;
  const POINTS = [10, 7, 4, 2]; // juara 1, 2, 3, 4
  const ROUND_OPTIONS = [3, 5, 7];
  const DURATION = { intro: 2.2, countdown: 3, roundEnd: 6.5 };
  const ROUND_TIME = 90; // detik per ronde sebelum diakhiri paksa
  const GO_TIME = 0.8; // tulisan GO! tampil di awal fase main

  function create(options) {
    const opts = Object.assign({ mode: 'party', botCount: 3 }, options);
    const m = {
      mode: opts.mode,
      phase: 'lobby',
      phaseTime: 0, // detik sejak fase dimulai
      round: 0,
      rounds: 3,
      game: TG.createGame(),
      participants: [], // { id, name, bot, slot, total, waiting }
      results: [], // hasil ronde terakhir
      elim: new Map(), // id -> tick tereliminasi
      tick: 0,
    };

    const humans = () => m.participants.filter((p) => !p.bot);
    const find = (id) => m.participants.find((p) => p.id === id);

    function freeSlot() {
      const used = new Set(m.participants.map((p) => p.slot));
      for (let s = 0; s < TG.MAX_PLAYERS; s++) if (!used.has(s)) return s;
      return -1;
    }

    function setPhase(phase) {
      m.phase = phase;
      m.phaseTime = 0;
    }

    function buildRoundGame() {
      m.game = TG.createGame();
      m.elim = new Map();
      m.tick = 0;
      for (const p of m.participants) {
        p.waiting = false;
        const tank = TG.addPlayer(m.game, p.id, p.name, p.slot);
        if (tank) p.color = tank.color;
      }
    }

    // Lobby: tampilkan tank yang sudah bergabung supaya arena tidak kosong.
    function buildLobbyGame() {
      m.game = TG.createGame();
      for (const p of m.participants) {
        const tank = TG.addPlayer(m.game, p.id, p.name, p.slot);
        if (tank) p.color = tank.color;
      }
    }

    m.maxHumans = () => (m.mode === 'bot' ? 1 : TG.MAX_PLAYERS);

    m.add = function (id, name, isBot) {
      const existing = find(id);
      if (existing) return { ok: true, participant: existing, rejoin: true };
      if (!isBot && humans().length >= m.maxHumans()) {
        return { ok: false, error: m.mode === 'bot' ? 'Mode solo hanya untuk 1 pemain. Pilih MABAR untuk main bareng.' : 'Room sudah penuh (maksimal 4 pemain).' };
      }
      const slot = freeSlot();
      if (slot < 0) return { ok: false, error: 'Room sudah penuh.' };
      const participant = {
        id,
        name: String(name || '').trim().slice(0, 12) || `Pemain ${slot + 1}`,
        bot: !!isBot,
        slot,
        color: TG.PLAYER_COLORS[slot],
        total: 0,
        waiting: m.phase !== 'lobby',
      };
      m.participants.push(participant);
      if (m.phase === 'lobby') buildLobbyGame();
      return { ok: true, participant };
    };

    m.remove = function (id) {
      const idx = m.participants.findIndex((p) => p.id === id);
      if (idx < 0) return false;
      m.participants.splice(idx, 1);
      TG.removePlayer(m.game, id);
      if (m.phase === 'lobby') {
        buildLobbyGame();
      } else if (!m.canContinue()) {
        m.toLobby();
        return 'aborted';
      }
      return true;
    };

    m.setRounds = function (n) {
      if (m.phase === 'lobby' && ROUND_OPTIONS.includes(n)) m.rounds = n;
    };

    m.canStart = function () {
      const h = humans().length;
      if (m.mode === 'bot') return h >= 1 ? { ok: true } : { ok: false, reason: 'Scan QR dulu untuk masuk.' };
      return h >= 2 ? { ok: true } : { ok: false, reason: 'Butuh minimal 2 pemain.' };
    };

    m.canContinue = function () {
      const h = humans().filter((p) => !p.waiting).length;
      return m.mode === 'bot' ? h >= 1 : h >= 2;
    };

    m.start = function () {
      if (m.phase !== 'lobby' || !m.canStart().ok) return false;
      if (m.mode === 'bot') {
        for (let i = 1; i <= opts.botCount; i++) {
          if (!find(`bot${i}`)) m.add(`bot${i}`, `Bot ${i}`, true);
        }
      }
      for (const p of m.participants) p.total = 0;
      m.round = 1;
      m.results = [];
      buildRoundGame();
      setPhase('intro');
      return true;
    };

    m.toLobby = function () {
      m.participants = m.participants.filter((p) => !p.bot);
      for (const p of m.participants) {
        p.total = 0;
        p.waiting = false;
      }
      m.round = 0;
      m.results = [];
      buildLobbyGame();
      setPhase('lobby');
    };

    m.playAgain = function () {
      if (m.phase !== 'final') return false;
      m.toLobby();
      return m.start();
    };

    m.setInput = function (id, input) {
      const tank = m.game.players.get(id);
      if (!tank) return;
      TG.setInput(m.game, id, input || {});
      // Di luar fase main, tembakan yang ditekan tidak disimpan untuk nanti.
      if (m.phase !== 'play' && tank.input.shot !== null) tank.lastShot = tank.input.shot;
    };

    function rankRound() {
      const tanks = [...m.game.players.values()];
      tanks.sort((a, b) => {
        const ea = m.elim.has(a.id);
        const eb = m.elim.has(b.id);
        if (ea !== eb) return ea ? 1 : -1;
        if (ea && eb && m.elim.get(a.id) !== m.elim.get(b.id)) return m.elim.get(b.id) - m.elim.get(a.id);
        if (!ea && a.lives !== b.lives) return b.lives - a.lives;
        if (!ea && a.alive !== b.alive) return a.alive ? -1 : 1;
        if (!ea && a.hp !== b.hp) return b.hp - a.hp;
        return b.kills - a.kills;
      });
      m.results = tanks.map((t, i) => {
        const p = find(t.id);
        const gain = POINTS[i] || 0;
        const prev = p ? p.total : 0;
        if (p) p.total += gain;
        return { id: t.id, name: t.name, color: t.color, bot: p ? p.bot : false, place: i + 1, gain, prev, total: prev + gain, kills: t.kills };
      });
    }

    function roundOver() {
      const tanks = [...m.game.players.values()];
      const standing = tanks.filter((t) => !t.eliminated);
      if (m.phaseTime >= ROUND_TIME) return true;
      if (m.mode === 'bot') {
        const me = tanks.find((t) => !find(t.id) || !find(t.id).bot);
        if (!me || me.eliminated) return true;
        return !standing.some((t) => t.id !== me.id);
      }
      return standing.length <= 1;
    }

    function idleAll() {
      for (const t of m.game.players.values()) {
        const shot = t.input.shot;
        TG.setInput(m.game, t.id, { shot });
      }
    }

    // Satu langkah. Mengembalikan event game dan event fase.
    m.update = function (dt) {
      m.phaseTime += dt;
      const events = [];

      if (m.phase === 'intro' && m.phaseTime >= DURATION.intro) {
        setPhase('countdown');
        events.push({ type: 'phase', phase: 'countdown' });
      } else if (m.phase === 'countdown' && m.phaseTime >= DURATION.countdown) {
        setPhase('play');
        for (const t of m.game.players.values()) t.shield = 1;
        events.push({ type: 'phase', phase: 'play' });
      }

      if (m.phase === 'play') {
        for (const p of m.participants) {
          if (p.bot && m.game.players.has(p.id)) TG.setInput(m.game, p.id, TG.botInput(m.game, p.id));
        }
        m.tick++;
        const gameEvents = TG.step(m.game, dt);
        for (const ev of gameEvents) {
          if (ev.type === 'eliminated') m.elim.set(ev.id, m.tick);
          events.push(ev);
        }
        if (roundOver()) {
          rankRound();
          idleAll();
          setPhase('roundEnd');
          events.push({ type: 'phase', phase: 'roundEnd' });
        }
      } else if (m.phase === 'roundEnd') {
        // Peluru yang masih terbang tetap selesai; tank diam.
        idleAll();
        for (const ev of TG.step(m.game, dt)) if (ev.type === 'impact') events.push(ev);
        if (m.phaseTime >= DURATION.roundEnd) {
          if (m.round < m.rounds) {
            m.round++;
            buildRoundGame();
            setPhase('intro');
            events.push({ type: 'phase', phase: 'intro' });
          } else {
            setPhase('final');
            events.push({ type: 'phase', phase: 'final' });
          }
        }
      } else if (m.phase === 'lobby') {
        // Lobby: pemain boleh jalan-jalan dan latihan menembak tanpa mati.
        const gameEvents = TG.step(m.game, dt);
        for (const t of m.game.players.values()) {
          if (t.hp < TG.MAX_HP || !t.alive) Object.assign(t, { hp: TG.MAX_HP, alive: true, eliminated: false, lives: TG.MAX_LIVES });
        }
        for (const ev of gameEvents) if (ev.type === 'fire' || ev.type === 'impact' || ev.type === 'dash') events.push(ev);
      }
      return events;
    };

    m.standings = function () {
      return m.participants.slice().sort((a, b) => b.total - a.total);
    };

    m.timeLeft = function () {
      return m.phase === 'play' ? Math.max(0, Math.ceil(ROUND_TIME - m.phaseTime)) : null;
    };

    m.countdownValue = function () {
      if (m.phase === 'countdown') return Math.max(1, 3 - Math.floor(m.phaseTime));
      if (m.phase === 'play' && m.phaseTime < GO_TIME) return 'GO!';
      return null;
    };

    m.phaseLeft = function () {
      const d = DURATION[m.phase];
      return d ? Math.max(0, d - m.phaseTime) : null;
    };

    // Ringkasan untuk dikirim ke HP pemain.
    m.statusFor = function (id) {
      const p = find(id);
      const tank = m.game.players.get(id);
      const res = m.results.find((r) => r.id === id);
      const rank = m.standings().findIndex((s) => s.id === id) + 1;
      return {
        phase: m.phase,
        round: m.round,
        rounds: m.rounds,
        cd: m.countdownValue(),
        left: m.timeLeft(),
        waiting: p ? p.waiting : false,
        total: p ? p.total : 0,
        rank,
        players: m.participants.length,
        place: res ? res.place : null,
        gain: res ? res.gain : null,
        hp: tank ? tank.hp : 0,
        lives: tank ? tank.lives : 0,
        out: tank ? tank.eliminated : false,
        dash: tank ? Math.round(tank.dashCooldown * 10) / 10 : 0,
        fire: tank ? Math.round(tank.cooldown * 10) / 10 : 0,
        host: humans()[0] ? humans()[0].id === id : false,
      };
    };

    return m;
  }

  root.TankMatch = { create, POINTS, ROUND_OPTIONS, ROUND_TIME };
})(typeof window !== 'undefined' ? window : globalThis);
