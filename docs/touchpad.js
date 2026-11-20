// Kontrol sentuh bersama: analog jalan, analog bidik, tombol TEMBAK, dan DASH.
// Dipakai oleh controller HP (controller.js) dan mode main di HP (solo.js).
(function (root) {
  'use strict';

  function vibrate(pattern) {
    if (navigator.vibrate) navigator.vibrate(pattern);
  }

  function setupStick(stick, knob, onMove, onRelease) {
    let pointerId = null;
    function update(e) {
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
      onMove(dx / radius, dy / radius);
    }
    function reset() {
      pointerId = null;
      knob.style.transform = '';
      onRelease();
    }
    stick.addEventListener('pointerdown', (e) => {
      if (pointerId !== null) return;
      e.preventDefault();
      pointerId = e.pointerId;
      stick.setPointerCapture(e.pointerId);
      update(e);
    });
    stick.addEventListener('pointermove', (e) => {
      if (e.pointerId === pointerId) update(e);
    });
    const end = (e) => {
      if (e.pointerId === pointerId) reset();
    };
    stick.addEventListener('pointerup', end);
    stick.addEventListener('pointercancel', end);
    stick.addEventListener('lostpointercapture', end);
  }

  // el: { left, leftKnob, right, rightKnob, fire, dash }
  // Mengembalikan objek input yang selalu terbarui.
  function attach(el, opts) {
    const options = Object.assign({ autoFireWhileAiming: false }, opts);
    const input = { mx: 0, my: 0, ax: 0, ay: 0, aiming: false, fire: false, dash: false };
    let fireHeld = false;

    function syncFire() {
      input.fire = fireHeld || (options.autoFireWhileAiming && input.aiming && Math.hypot(input.ax, input.ay) > 0.55);
    }

    setupStick(el.left, el.leftKnob, (x, y) => {
      input.mx = x;
      input.my = y;
    }, () => {
      input.mx = 0;
      input.my = 0;
    });

    setupStick(el.right, el.rightKnob, (x, y) => {
      input.ax = x;
      input.ay = y;
      input.aiming = Math.hypot(x, y) > 0.2;
      syncFire();
    }, () => {
      input.ax = 0;
      input.ay = 0;
      input.aiming = false;
      syncFire();
    });

    el.fire.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      fireHeld = true;
      syncFire();
      el.fire.classList.add('pressed');
      vibrate(12);
    });
    const releaseFire = () => {
      fireHeld = false;
      syncFire();
      el.fire.classList.remove('pressed');
    };
    el.fire.addEventListener('pointerup', releaseFire);
    el.fire.addEventListener('pointercancel', releaseFire);
    el.fire.addEventListener('pointerleave', releaseFire);

    // Dash dikirim sebagai pulsa singkat; game hanya memicu dash pada transisi false -> true.
    el.dash.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.dash.classList.add('pressed');
      setTimeout(() => el.dash.classList.remove('pressed'), 120);
      if (input.dash) return;
      input.dash = true;
      vibrate(20);
      setTimeout(() => {
        input.dash = false;
      }, 160);
    });

    for (const node of [el.left, el.right, el.fire, el.dash]) {
      node.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    return input;
  }

  root.TankTouch = { attach, vibrate };
})(window);
