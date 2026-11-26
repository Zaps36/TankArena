// UI fase pertandingan di atas arena (DOM + CSS), terinspirasi alur Fall Guys
// dan Mario Party: lobby -> "RONDE X" -> 3-2-1-GO! -> hasil ronde + poin -> juara umum.
// Dipakai tv.js dan solo.js. Membaca state dari TankMatch, tidak mengubahnya kecuali lewat callback.
(function (root) {
  'use strict';

  const MEDALS = ['🥇', '🥈', '🥉', '4'];

  function esc(text) {
    return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function tankAvatar(color, size) {
    return `<span class="ov-tank" style="--c:${color};--s:${size || 44}px"><i></i><i></i></span>`;
  }

  // opts: { onStart(), onRounds(n), onPlayAgain(), onLobby(), lobbyText(m) -> html,
  //         showStandings: bool, startLabel: string }
  function create(container, opts) {
    const o = Object.assign({ showStandings: false, startLabel: 'MULAI GAME', lobbyText: () => '' }, opts);
    const el = document.createElement('div');
    el.className = 'ov';
    container.appendChild(el);

    let key = '';
    let refs = {};

    el.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn || btn.disabled) return;
      const act = btn.dataset.act;
      if (act === 'start' && o.onStart) o.onStart();
      if (act === 'rounds' && o.onRounds) o.onRounds(Number(btn.dataset.n));
      if (act === 'again' && o.onPlayAgain) o.onPlayAgain();
      if (act === 'lobby' && o.onLobby) o.onLobby();
    });

    function hud(m) {
      return `<div class="ov-hud">
        <span class="ov-pill"><b>RONDE ${m.round}</b>/${m.rounds}</span>
        <span class="ov-pill">${m.mapInfo().icon} ${esc(m.mapInfo().name)}</span>
        <span class="ov-pill ov-timer" data-ref="timer">1:30</span>
      </div><div class="ov-board" data-ref="board"><div class="ov-board-title">👑 JUARA</div><div class="ov-board-rows" data-ref="boardRows"></div></div>`;
    }

    function lobbyHtml(m) {
      const can = m.canStart();
      const options = TankMatch.ROUND_OPTIONS.map((n) => `<button class="ov-seg${n === m.rounds ? ' on' : ''}" data-act="rounds" data-n="${n}">${n}</button>`).join('');
      const people = m.participants.filter((p) => !p.bot);
      const chips = people.length
        ? people.map((p) => `<span class="ov-chip">${tankAvatar(p.color, 22)}${esc(p.name)}</span>`).join('')
        : '<span class="ov-chip ghost">Belum ada pemain</span>';
      return `<div class="ov-lobby pop-in">
        <div class="panel ov-card">
          <div class="panel-header">LOBBY</div>
          <div class="ov-lobby-text">${o.lobbyText(m)}</div>
          <div class="ov-chips">${chips}</div>
          <div class="ov-label">JUMLAH RONDE</div>
          <div class="ov-segs">${options}</div>
          <button class="btn ov-start" data-act="start"${can.ok ? '' : ' disabled'}>▶ ${esc(o.startLabel)}</button>
          <div class="ov-reason">${can.ok ? `Juara 1 dapat ${TankMatch.POINTS[0]} poin per ronde. Total terbanyak jadi juara!` : esc(can.reason)}</div>
        </div>
      </div>`;
    }

    function introHtml(m) {
      const last = m.round === m.rounds;
      const map = m.mapInfo();
      return `<div class="ov-dim"></div>
      <div class="ov-band${last ? ' last' : ''}">
        <div class="ov-band-inner">
          <div class="ov-band-sub">${last ? 'RONDE TERAKHIR!' : 'BERSIAP!'}</div>
          <div class="ov-band-title">RONDE ${m.round}</div>
          <div class="ov-band-sub small">${map.icon} ${esc(map.name)} · dari ${m.rounds} ronde</div>
        </div>
      </div>`;
    }

    // Acak arena: deretan kartu arena digulir lalu melambat dan berhenti di arena terpilih
    // (mirip roda undian di game party). Arena yang sudah dimainkan diberi cap SUDAH.
    function rouletteHtml(m) {
      const map = m.mapInfo();
      const used = new Set(m.usedMaps());
      const order = TankMaps.shuffle(TankMaps.IDS);
      const LOOPS = 6;
      const cards = [];
      for (let l = 0; l < LOOPS; l++) for (const id of order) cards.push(id);
      // Berhenti di putaran ke-5 supaya gulungan terasa panjang.
      const target = (LOOPS - 2) * order.length + order.indexOf(map.id);
      const html = cards.map((id, i) => {
        const info = TankMaps.get(id);
        const cls = i === target ? ' target' : used.has(id) ? ' used' : '';
        return `<div class="ov-rl-card${cls}" style="--a:${info.accent}">
          <img src="${TankArt.preview(id, 260)}" alt="">
          <span class="ov-rl-name">${info.icon} ${esc(info.name)}</span>
          ${used.has(id) ? '<span class="ov-rl-stamp">SUDAH</span>' : ''}
        </div>`;
      }).join('');
      const spin = TankMatch.ROULETTE_SPIN;
      return `<div class="ov-dim dark"></div>
      <div class="ov-roulette" style="--spin:${spin}s">
        <div class="ov-rl-title"><span class="a">🎲 MENGACAK ARENA...</span><span class="b">ARENA RONDE ${m.round}</span></div>
        <div class="ov-rl-window">
          <div class="ov-rl-strip" data-ref="strip" data-target="${target}" style="--i:2">${html}</div>
          <div class="ov-rl-pointer top"></div><div class="ov-rl-pointer bottom"></div>
        </div>
        <div class="ov-rl-info" style="--a:${map.accent}">
          <div class="ov-rl-info-name">${map.icon} ${esc(map.name)}</div>
          <div class="ov-rl-info-tip">${esc(map.tip)}</div>
        </div>
      </div>`;
    }

    function countdownHtml() {
      return '<div class="ov-dim light"></div><div class="ov-count" data-ref="count"></div>';
    }

    function roundEndHtml(m) {
      const rows = m.results.map((r, i) => `<div class="ov-row" style="--d:${(m.results.length - 1 - i) * 0.35}s">
          <span class="ov-medal p${r.place}">${MEDALS[r.place - 1] || r.place}</span>
          ${tankAvatar(r.color, 34)}
          <span class="ov-name">${esc(r.name)}</span>
          <span class="ov-gain">+${r.gain}</span>
          <span class="ov-total"><span class="ov-bar"><i data-bar="${r.id}"></i></span><b data-total="${r.id}">${r.prev}</b></span>
        </div>`).join('');
      return `<div class="ov-dim"></div>
      <div class="ov-result pop-in">
        <div class="panel ov-card wide">
          <div class="panel-header">RONDE ${m.round} SELESAI! · ${m.mapInfo().icon} ${esc(m.mapInfo().name)}</div>
          <div class="ov-rows">${rows}</div>
          <div class="ov-next" data-ref="next"></div>
        </div>
      </div>`;
    }

    function finalHtml(m) {
      const s = m.standings();
      const podium = [s[1], s[0], s[2]].map((p, i) => {
        if (!p) return '<div class="ov-pod empty"></div>';
        const place = [2, 1, 3][i];
        return `<div class="ov-pod p${place}" style="--d:${[0.5, 1.1, 0.2][i]}s">
          ${place === 1 ? '<div class="ov-crown">👑</div>' : ''}
          ${tankAvatar(p.color, place === 1 ? 70 : 54)}
          <div class="ov-pod-name">${esc(p.name)}</div>
          <div class="ov-pod-pts">${p.total} poin</div>
          <div class="ov-pod-block"><span>${place}</span></div>
        </div>`;
      }).join('');
      const rest = s.slice(3).map((p, i) => `<span class="ov-chip">${i + 4}. ${tankAvatar(p.color, 20)}${esc(p.name)} · ${p.total}</span>`).join('');
      const confetti = Array.from({ length: 36 }, (_, i) => `<i style="--x:${(i * 37) % 100}%;--d:${(i % 9) * 0.35}s;--r:${(i * 53) % 360}deg;--c:${['#ff4d5e', '#ffd23f', '#3fa9ff', '#4cd964', '#a66bff'][i % 5]}"></i>`).join('');
      return `<div class="ov-dim"></div><div class="ov-confetti">${confetti}</div>
      <div class="ov-final">
        <h2 class="title ov-final-title">JUARA UMUM!</h2>
        <div class="ov-final-sub">${s[0] ? `${esc(s[0].name)} menang dengan ${s[0].total} poin` : ''}</div>
        <div class="ov-podium">${podium}</div>
        ${rest ? `<div class="ov-chips center">${rest}</div>` : ''}
        <div class="ov-final-btns">
          <button class="btn" data-act="again">🔁 MAIN LAGI</button>
          <button class="btn blue" data-act="lobby">🏠 LOBBY</button>
        </div>
      </div>`;
    }

    function build(m) {
      let html = '';
      if (m.phase === 'lobby') html = lobbyHtml(m);
      else if (m.phase === 'roulette') html = rouletteHtml(m);
      else if (m.phase === 'intro') html = hud(m) + introHtml(m);
      else if (m.phase === 'countdown') html = hud(m) + countdownHtml();
      else if (m.phase === 'play') html = hud(m) + '<div class="ov-count" data-ref="count"></div>';
      else if (m.phase === 'roundEnd') html = roundEndHtml(m);
      else if (m.phase === 'final') html = finalHtml(m);
      el.innerHTML = html;
      el.dataset.phase = m.phase;
      refs = {};
      el.querySelectorAll('[data-ref]').forEach((n) => {
        refs[n.dataset.ref] = n;
      });
      refs.count && (refs.count.dataset.v = '');
      if (refs.strip) {
        // Mulai gulir di frame berikutnya supaya transisi CSS berjalan dari posisi awal.
        const strip = refs.strip;
        requestAnimationFrame(() => requestAnimationFrame(() => {
          strip.classList.add('go');
          strip.style.setProperty('--i', strip.dataset.target);
        }));
      }
    }

    function render(m) {
      const lobbyKey = m.phase === 'lobby'
        ? JSON.stringify([m.rounds, m.canStart().ok, m.participants.map((p) => [p.id, p.name])])
        : '';
      const k = `${m.phase}|${m.round}|${lobbyKey}`;
      if (k !== key) {
        key = k;
        build(m);
      }

      if (refs.timer) {
        const left = m.timeLeft();
        const value = left === null ? TankMatch.ROUND_TIME : left;
        refs.timer.textContent = `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
        refs.timer.classList.toggle('hurry', left !== null && left <= 10);
      }

      if (refs.count) {
        const v = m.countdownValue();
        const text = v === null ? '' : String(v);
        if (refs.count.dataset.v !== text) {
          refs.count.dataset.v = text;
          refs.count.innerHTML = text ? `<span class="${text === 'GO!' ? 'go' : ''}">${text}</span>` : '';
        }
      }

      if (refs.boardRows) {
        const s = m.standings();
        const top = s[0] ? s[0].total : 0;
        const html = s.map((p, i) => {
          const lead = i === 0 && top > 0;
          return `<div class="ov-board-row${lead ? ' lead' : ''}">
            <span class="ov-board-rank">${lead ? '👑' : i + 1}</span>
            ${tankAvatar(p.color, 22)}
            <span class="ov-board-name">${esc(p.name)}</span>
            <span class="ov-board-pts">${p.total}</span>
          </div>`;
        }).join('');
        if (refs.boardRows.innerHTML !== html) refs.boardRows.innerHTML = html;
      }

      if (m.phase === 'roundEnd') {
        // Poin bertambah: angka total dihitung naik dari skor lama ke skor baru.
        const max = Math.max(1, ...m.results.map((r) => r.total), m.rounds * TankMatch.POINTS[0] * 0.6);
        const t = Math.min(1, Math.max(0, (m.phaseTime - 1.7) / 1.3));
        const ease = 1 - Math.pow(1 - t, 3);
        for (const r of m.results) {
          const value = Math.round(r.prev + (r.total - r.prev) * ease);
          const totalEl = el.querySelector(`[data-total="${r.id}"]`);
          const barEl = el.querySelector(`[data-bar="${r.id}"]`);
          if (totalEl && totalEl.textContent !== String(value)) {
            totalEl.textContent = String(value);
            totalEl.classList.add('bump');
            setTimeout(() => totalEl.classList.remove('bump'), 120);
          }
          if (barEl) barEl.style.width = `${Math.min(100, (value / max) * 100)}%`;
        }
        if (refs.next) {
          const left = Math.ceil(m.phaseLeft());
          refs.next.textContent = m.round < m.rounds ? `Ronde ${m.round + 1} akan dimulai dalam ${left}...` : `Menghitung juara umum... ${left}`;
        }
      }
    }

    return { render, element: el };
  }

  root.TankOverlay = { create, tankAvatar };
})(window);
