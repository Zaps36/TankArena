// Kontrol sentuh bersama ala game mobile (mirip Brawl Stars):
//   - Analog kiri: jalan.
//   - Stik SERANG (kanan): geser untuk membidik, lepas untuk menembak.
//     Ketuk saja = tembak otomatis ke musuh terdekat.
//   - Tombol DASH.
// Dipakai controller HP (controller.js) dan mode main di HP (solo.js).
(function (root) {
  'use strict';

  const TAP_DRAG = 0.3; // geser kurang dari ini (relatif radius) dianggap ketuk
  const AIM_DEADZONE = 0.2;
  const EARLY_MS = 300; // harus lebih kecil dari SHOT_BUFFER di game.js (350 ms)

  function vibrate(pattern) {
    if (navigator.vibrate) navigator.vibrate(pattern);
  }

  function setupStick(stick, knob, handlers) {
    let pointerId = null;
    let maxDrag = 0;
    let last = { x: 0, y: 0 };
    function read(e) {
      const rect = stick.getBoundingClientRect();
      const radius = rect.width / 2;
      let dx = e.clientX - (rect.left + radius);
      let dy = e.clientY - (rect.top + radius);
      const len = Math.hypot(dx, dy);
      if (len > radius) {
        dx = (dx / len) * radius;
        dy = (dy / len) * radius;
      }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      return { x: dx / radius, y: dy / radius };
    }
    function finish(cancelled) {
      pointerId = null;
      knob.style.transform = '';
      stick.classList.remove('held');
      handlers.end(last, maxDrag, cancelled);
    }
    stick.addEventListener('pointerdown', (e) => {
      if (pointerId !== null) return;
      e.preventDefault();
      pointerId = e.pointerId;
      stick.setPointerCapture(e.pointerId);
      stick.classList.add('held');
      maxDrag = 0;
      last = read(e);
      maxDrag = Math.max(maxDrag, Math.hypot(last.x, last.y));
      handlers.move(last, maxDrag);
    });
    stick.addEventListener('pointermove', (e) => {
      if (e.pointerId !== pointerId) return;
      last = read(e);
      maxDrag = Math.max(maxDrag, Math.hypot(last.x, last.y));
      handlers.move(last, maxDrag);
    });
    stick.addEventListener('pointerup', (e) => {
      if (e.pointerId === pointerId) finish(false);
    });
    stick.addEventListener('pointercancel', (e) => {
      if (e.pointerId === pointerId) finish(true);
    });
    stick.addEventListener('lostpointercapture', (e) => {
      if (e.pointerId === pointerId) finish(true);
    });
    stick.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // Tombol DASH berbentuk pita melengkung (seperempat lingkaran) yang memeluk stik SERANG
  // dari atas sampai kiri. Dibuat dengan SVG supaya hanya pita yang bisa disentuh;
  // sentuhan ke stik di tengahnya tetap sampai ke stik. Posisi dihitung dari stik SERANG.
  function setupArcButton(svg, stick) {
    svg.innerHTML = `
      <defs>
        <linearGradient id="dashGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#e2d0ff"/><stop offset=".5" stop-color="#a66bff"/><stop offset="1" stop-color="#6e3bd1"/>
        </linearGradient>
        <path id="dashTextArc" fill="none"/>
      </defs>
      <path class="arc-shadow"/>
      <g class="arc-body">
        <path class="arc-outline"/>
        <path class="arc-fill"/>
        <path class="arc-shine"/>
        <text class="arc-label"><textPath href="#dashTextArc" startOffset="50%" text-anchor="middle">DASH</textPath></text>
      </g>
      <path class="arc-hit"/>`;
    const q = (s) => svg.querySelector(s);

    function arc(cx, cy, r) {
      // Dari kiri (jam 9) searah jarum jam ke atas (jam 12).
      return `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx} ${cy - r}`;
    }

    function layout() {
      const r = stick.getBoundingClientRect();
      if (!r.width) return;
      const s = r.width;
      const gap = s * 0.07;
      const th = s * 0.36; // tebal pita
      const ri = s / 2 + gap;
      const rm = ri + th / 2;
      const pad = th / 2 + 12;
      const size = (rm + pad) * 2;
      const c = size / 2;
      svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
      svg.style.width = `${size}px`;
      svg.style.height = `${size}px`;
      svg.style.left = `${r.left + s / 2 - c}px`;
      svg.style.top = `${r.top + s / 2 - c}px`;
      const main = arc(c, c, rm);
      for (const sel of ['.arc-shadow', '.arc-outline', '.arc-fill', '.arc-hit']) q(sel).setAttribute('d', main);
      q('#dashTextArc').setAttribute('d', arc(c, c, rm - th * 0.12));
      q('.arc-shine').setAttribute('d', arc(c, c, rm + th * 0.26));
      q('.arc-shadow').style.strokeWidth = `${th + 8}px`;
      q('.arc-outline').style.strokeWidth = `${th + 8}px`;
      q('.arc-hit').style.strokeWidth = `${th + 10}px`;
      q('.arc-fill').style.strokeWidth = `${th}px`;
      q('.arc-shine').style.strokeWidth = `${th * 0.18}px`;
      q('.arc-label').style.fontSize = `${th * 0.4}px`;
    }

    layout();
    if (typeof ResizeObserver === 'function') new ResizeObserver(layout).observe(stick);
    window.addEventListener('resize', layout);
    window.addEventListener('orientationchange', () => setTimeout(layout, 250));
    return layout;
  }

  // el: { left, leftKnob, attack, attackKnob, dash, ring? }
  // opts.onChange(input, reason): dipanggil setiap input berubah (untuk kirim segera).
  // opts.cooldown: durasi cooldown tembak (detik), untuk animasi cincin lokal.
  function attach(el, opts) {
    const options = Object.assign({ onChange: null, cooldown: 1.2 }, opts);
    const input = { mx: 0, my: 0, ax: 0, ay: 0, aiming: false, fire: false, dash: false, shot: 0, sx: 0, sy: 0 };
    let readyAt = 0;
    let cdTimer = null;

    const changed = (reason) => {
      if (options.onChange) options.onChange(input, reason);
    };

    function startCooldownRing(seconds) {
      readyAt = performance.now() + seconds * 1000;
      el.attack.classList.add('cooling');
      clearInterval(cdTimer);
      cdTimer = setInterval(() => {
        const left = Math.max(0, readyAt - performance.now());
        el.attack.style.setProperty('--cd', String(left / (options.cooldown * 1000)));
        if (left <= 0) {
          clearInterval(cdTimer);
          el.attack.classList.remove('cooling');
          el.attack.style.setProperty('--cd', '0');
        }
      }, 33);
    }

    setupStick(el.left, el.leftKnob, {
      move(v) {
        input.mx = v.x;
        input.my = v.y;
        changed('move');
      },
      end() {
        input.mx = 0;
        input.my = 0;
        changed('move');
      },
    });

    setupStick(el.attack, el.attackKnob, {
      move(v, maxDrag) {
        const aiming = maxDrag >= TAP_DRAG && Math.hypot(v.x, v.y) > AIM_DEADZONE;
        input.aiming = aiming;
        input.ax = aiming ? v.x : 0;
        input.ay = aiming ? v.y : 0;
        el.attack.classList.toggle('aiming', aiming);
        changed('aim');
      },
      end(v, maxDrag, cancelled) {
        const dragged = maxDrag >= TAP_DRAG;
        const len = Math.hypot(v.x, v.y);
        input.aiming = false;
        input.ax = 0;
        input.ay = 0;
        el.attack.classList.remove('aiming');
        // Bidikan ditarik balik ke tengah = batal (tidak menembak).
        if (cancelled || (dragged && len <= AIM_DEADZONE)) {
          changed('aim');
          return;
        }
        // Boleh lepas sedikit lebih awal; TV menyimpan tembakan sampai cooldown habis.
        if (performance.now() < readyAt - EARLY_MS) {
          el.attack.classList.remove('denied');
          void el.attack.offsetWidth;
          el.attack.classList.add('denied');
          vibrate(30);
          changed('aim');
          return;
        }
        input.shot += 1;
        input.sx = dragged ? v.x / len : 0;
        input.sy = dragged ? v.y / len : 0;
        // Cincin cooldown dimulai saat tembakan benar-benar keluar (sisa cooldown + 1.2 s).
        startCooldownRing(Math.max(0, readyAt - performance.now()) / 1000 + options.cooldown);
        vibrate(15);
        changed('shot');
      },
    });

    if (typeof SVGElement !== 'undefined' && el.dash instanceof SVGElement) setupArcButton(el.dash, el.attack);

    // Dash dikirim sebagai pulsa singkat; game memicu dash pada transisi false -> true.
    el.dash.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.dash.classList.add('pressed');
      setTimeout(() => el.dash.classList.remove('pressed'), 120);
      if (input.dash) return;
      input.dash = true;
      vibrate(20);
      changed('dash');
      setTimeout(() => {
        input.dash = false;
        changed('dash');
      }, 160);
    });
    el.dash.addEventListener('contextmenu', (e) => e.preventDefault());

    return {
      input,
      // Cincin cooldown dihitung lokal di HP supaya langsung terlihat saat menembak.
      // Status dari TV hanya dipakai untuk memperpanjang, tidak pernah memotong,
      // karena status TV selalu tertinggal sebesar jeda jaringan.
      syncCooldown(seconds) {
        const left = Math.max(0, readyAt - performance.now()) / 1000;
        if (seconds > left + 0.3) startCooldownRing(seconds);
      },
      resetCooldown() {
        startCooldownRing(0);
      },
    };
  }

  root.TankTouch = { attach, vibrate };
})(window);
