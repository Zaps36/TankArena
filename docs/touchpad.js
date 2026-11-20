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
        if (performance.now() < readyAt) {
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
        startCooldownRing(options.cooldown);
        vibrate(15);
        changed('shot');
      },
    });

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
      // Sinkronkan cincin cooldown dengan status dari TV (misalnya setelah ronde baru).
      syncCooldown(seconds) {
        const left = Math.max(0, readyAt - performance.now()) / 1000;
        if (seconds <= 0.05 && left > 0.25) startCooldownRing(0);
      },
    };
  }

  root.TankTouch = { attach, vibrate };
})(window);
