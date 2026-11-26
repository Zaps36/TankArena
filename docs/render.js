// Renderer kartun bersama untuk mode solo (solo.js) dan layar TV (tv.js).
// Hanya menggambar; tidak mengubah state game.
(function (root) {
  'use strict';

  const INK = '#1b1530';
  const TITLE_FONT = "'Lilita One', 'Fredoka', system-ui, sans-serif";
  const BODY_FONT = "'Fredoka', system-ui, sans-serif";

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // amt > 0 mencerahkan, amt < 0 menggelapkan.
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const target = amt < 0 ? 0 : 255;
    const t = Math.abs(amt);
    const mix = (c) => Math.round(c + (target - c) * t);
    return `rgb(${mix(n >> 16)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
  }

  // Teks dengan outline tebal.
  function outlinedText(ctx, text, x, y, opts) {
    const o = Object.assign({ size: 16, fill: '#fff', stroke: INK, width: 5, font: TITLE_FONT, align: 'center', baseline: 'middle' }, opts);
    ctx.font = `${o.size}px ${o.font}`;
    ctx.textAlign = o.align;
    ctx.textBaseline = o.baseline;
    ctx.lineJoin = 'round';
    ctx.lineWidth = o.width;
    ctx.strokeStyle = o.stroke;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = o.fill;
    ctx.fillText(text, x, y);
  }

  // Hati digambar sebagai path supaya tidak bergantung font atau emoji.
  function drawHeart(ctx, x, y, s, filled) {
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.35);
    ctx.bezierCurveTo(x - s * 0.1, y + s * 0.1, x - s * 0.55, y, x - s * 0.5, y - s * 0.25);
    ctx.bezierCurveTo(x - s * 0.45, y - s * 0.55, x - s * 0.05, y - s * 0.55, x, y - s * 0.25);
    ctx.bezierCurveTo(x + s * 0.05, y - s * 0.55, x + s * 0.45, y - s * 0.55, x + s * 0.5, y - s * 0.25);
    ctx.bezierCurveTo(x + s * 0.55, y, x + s * 0.1, y + s * 0.1, x, y + s * 0.35);
    ctx.closePath();
    ctx.fillStyle = filled === false ? '#cfc8dc' : '#ff4d5e';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = INK;
    ctx.stroke();
  }

  function drawHearts(ctx, cx, y, count, size) {
    const gap = size * 1.1;
    const start = cx - ((count - 1) * gap) / 2;
    for (let i = 0; i < count; i++) drawHeart(ctx, start + i * gap, y, size);
  }

  // Ledakan kecil berbentuk bintang untuk kill feed.
  function drawBurst(ctx, x, y, r) {
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const rr = i % 2 === 0 ? r : r * 0.5;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fillStyle = '#ff8a2b';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffd23f';
    ctx.stroke();
  }

  // Generator acak sederhana yang deterministik untuk dekorasi rumput.
  function seeded(seed) {
    let s = seed;
    return () => {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
  }

  function createRenderer(canvas) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    const tanks = new Map(); // id -> state animasi
    const bulletTrail = new Map(); // id -> posisi sebelumnya
    let particles = [];
    let floaters = [];
    let feed = [];
    let shake = 0;
    let latest = null;
    let background = null;
    let bgMapId = null;
    let lastTime = performance.now();

    function tankState(id) {
      let t = tanks.get(id);
      if (!t) {
        t = { x: null, y: null, bodyAngle: 0, turret: null, aimA: 0, aimLen: 0, tread: 0, recoil: 0, flash: 0, hp: null, ghosts: [], blinkSeed: Math.random() * 5 };
        tanks.set(id, t);
      }
      return t;
    }

    function puff(x, y, color, opts) {
      const o = Object.assign({ count: 6, speed: 60, size: 8, life: 0.5, grow: 14 }, opts);
      for (let i = 0; i < o.count; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = o.speed * (0.4 + Math.random() * 0.8);
        particles.push({ kind: 'puff', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: o.size * (0.6 + Math.random() * 0.6), grow: o.grow, life: o.life, max: o.life, color });
      }
    }

    function sparks(x, y, count, color) {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = 120 + Math.random() * 160;
        particles.push({ kind: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.35, max: 0.35, color });
      }
    }

    function debris(x, y, color) {
      for (let i = 0; i < 8; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = 140 + Math.random() * 140;
        particles.push({ kind: 'debris', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14, size: 6 + Math.random() * 5, life: 0.9, max: 0.9, color });
      }
    }

    function ring(x, y, color, maxR) {
      particles.push({ kind: 'ring', x, y, r: 6, maxR: maxR || 46, life: 0.4, max: 0.4, color });
    }

    function floater(x, y, text, color, size) {
      floaters.push({ x, y, text, color, size: size || 22, life: 1, max: 1 });
    }

    function playerById(id) {
      return latest ? latest.players.find((p) => p.id === id) : null;
    }

    function onEvents(events) {
      for (const ev of events) {
        if (ev.type === 'fire') {
          const p = playerById(ev.id);
          if (!p) continue;
          const t = tankState(p.id);
          t.recoil = 9;
          const a = typeof ev.angle === 'number' ? ev.angle : p.angle;
          t.turret = a; // laras langsung menghadap arah tembakan
          const mx = p.x + Math.cos(a) * 36;
          const my = p.y + Math.sin(a) * 36;
          puff(mx, my, '#fff6c2', { count: 5, speed: 50, size: 7, life: 0.3, grow: 20 });
          ring(mx, my, p.color, 22);
          sparks(mx, my, 4, '#ffd23f');
        } else if (ev.type === 'impact') {
          impact(ev);
        } else if (ev.type === 'dash') {
          const p = playerById(ev.id);
          if (!p) continue;
          puff(p.x, p.y, '#f3e6c4', { count: 10, speed: 80, size: 9, life: 0.5 });
          floater(p.x, p.y - 44, 'WUSH!', '#a66bff', 18);
        } else if (ev.type === 'kill') {
          const victim = playerById(ev.victim);
          const killer = playerById(ev.killer);
          if (victim) {
            ring(victim.x, victim.y, '#ffd23f', 70);
            puff(victim.x, victim.y, '#ff8a2b', { count: 10, speed: 120, size: 12, life: 0.6, grow: 20 });
            puff(victim.x, victim.y, '#7d7590', { count: 8, speed: 70, size: 12, life: 0.9, grow: 24 });
            debris(victim.x, victim.y, victim.color);
            floater(victim.x, victim.y - 30, 'KO!', '#ffd23f', 34);
            shake = Math.max(shake, 12);
          }
          addFeed(killer, victim, ev.cause);
        } else if (ev.type === 'respawn') {
          const p = playerById(ev.id);
          if (p) ring(p.x, p.y, p.color, 60);
        } else if (ev.type === 'portal') {
          // Teleport: cincin di mulut masuk dan keluar.
          const color = ev.color || '#a66bff';
          ring(ev.fx, ev.fy, color, ev.bullet ? 22 : 46);
          ring(ev.tx, ev.ty, '#ffffff', ev.bullet ? 22 : 46);
          if (!ev.bullet) {
            puff(ev.tx, ev.ty, '#d2b6ff', { count: 8, speed: 70, size: 7, life: 0.45, grow: 14 });
            const t = tanks.get(ev.id);
            if (t) {
              t.x = ev.tx;
              t.y = ev.ty;
            }
          }
        }
      }
    }

    function addFeed(killer, victim, cause) {
      if (!victim) return;
      let name = killer ? killer.name : '?';
      let color = killer ? killer.color : '#fff';
      if (cause === 'lava') {
        name = 'Lava';
        color = '#ff8a2b';
      } else if (cause === 'self') {
        name = 'Pantulan';
        color = '#3ff0ff';
      }
      feed.push({ killer: name, kColor: color, victim: victim.name, vColor: victim.color, life: 4 });
      if (feed.length > 4) feed.shift();
    }

    function update(dt, snap) {
      for (const p of snap.players) {
        const t = tankState(p.id);
        if (t.x !== null && p.alive) {
          const dx = p.x - t.x;
          const dy = p.y - t.y;
          const dist = Math.hypot(dx, dy);
          if (dist > 40) {
            // Lompatan besar: dash atau respawn. Simpan bayangan dash.
            if (dist < 200) t.ghosts.push({ x: t.x, y: t.y, life: 0.3 });
          } else if (dist > 0.3) {
            const target = Math.atan2(dy, dx);
            let diff = Math.atan2(Math.sin(target - t.bodyAngle), Math.cos(target - t.bodyAngle));
            // Tank bisa jalan mundur, jadi badan cukup sejajar dengan arah gerak.
            if (diff > Math.PI / 2) diff -= Math.PI;
            if (diff < -Math.PI / 2) diff += Math.PI;
            t.bodyAngle += diff * Math.min(1, dt * 12);
            t.tread += dist;
          }
        }
        // Kena peluru (turun banyak sekaligus): angka damage + kilat.
        // Lava mengurangi HP sedikit demi sedikit, jadi tidak memunculkan angka tiap frame.
        if (t.hp !== null && t.hp - p.hp >= 10) {
          t.flash = 1;
          if (p.alive !== false) {
            sparks(p.x, p.y, 7, '#ffd23f');
            floater(p.x + 14, p.y - 26, `-${t.hp - p.hp}`, '#ff4d5e', 20);
          }
        }
        if (p.burn && p.alive && Math.random() < dt * 14) {
          // Api kecil naik dari tank yang terbakar lava.
          particles.push({ kind: 'puff', x: p.x + (Math.random() - 0.5) * 26, y: p.y + (Math.random() - 0.5) * 20, vx: (Math.random() - 0.5) * 20, vy: -60 - Math.random() * 40, r: 5 + Math.random() * 4, grow: 8, life: 0.45, max: 0.45, color: Math.random() < 0.5 ? '#ff8a2b' : '#ffd23f' });
        }
        t.x = p.x;
        t.y = p.y;
        t.hp = p.hp;
        // Laras berputar halus menuju sudut terbaru (data dari HP datang ~40x/detik,
        // layar digambar 60x/detik; tanpa ini laras dan garis bidik terlihat patah-patah).
        if (t.turret === null) t.turret = p.angle;
        const turn = Math.atan2(Math.sin(p.angle - t.turret), Math.cos(p.angle - t.turret));
        t.turret += turn * (1 - Math.exp(-dt * 28));
        // Garis bidik muncul dan hilang dengan transisi, tidak langsung.
        const aimTarget = p.aim && p.alive ? 1 : 0;
        t.aimA += (aimTarget - t.aimA) * (1 - Math.exp(-dt * (aimTarget ? 18 : 12)));
        t.recoil = Math.max(0, t.recoil - dt * 40);
        t.flash = Math.max(0, t.flash - dt * 6);
        t.ghosts = t.ghosts.filter((g) => (g.life -= dt) > 0);
      }
      for (const id of [...tanks.keys()]) {
        if (!snap.players.some((p) => p.id === id)) tanks.delete(id);
      }

      particles = particles.filter((q) => {
        q.life -= dt;
        if (q.life <= 0) return false;
        if (q.kind === 'ring') {
          q.r += (q.maxR - q.r) * Math.min(1, dt * 12);
          return true;
        }
        q.x += q.vx * dt;
        q.y += q.vy * dt;
        const drag = q.kind === 'debris' ? 2.2 : 4;
        q.vx *= 1 - Math.min(1, dt * drag);
        q.vy *= 1 - Math.min(1, dt * drag);
        if (q.kind === 'puff') q.r += q.grow * dt;
        if (q.kind === 'debris') q.rot += q.vr * dt;
        return true;
      });
      floaters = floaters.filter((f) => {
        f.life -= dt;
        f.y -= 38 * dt;
        return f.life > 0;
      });
      feed = feed.filter((f) => (f.life -= dt) > 0);
      shake = Math.max(0, shake - dt * 40);
    }

    function drawTank(p, now, highlight) {
      const t = tankState(p.id);

      for (const g of t.ghosts) {
        ctx.globalAlpha = g.life * 1.6;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(g.x, g.y, 20, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      if (!p.alive) {
        if (p.eliminated) {
          ctx.globalAlpha = 0.85;
          ctx.fillStyle = '#b9b3c9';
          ctx.strokeStyle = INK;
          ctx.lineWidth = 4;
          roundRect(ctx, p.x - 16, p.y - 22, 32, 38, 14);
          ctx.fill();
          ctx.stroke();
          outlinedText(ctx, 'RIP', p.x, p.y - 4, { size: 13, fill: '#fff', width: 4 });
          outlinedText(ctx, p.name, p.x, p.y + 30, { size: 13, fill: p.color, width: 4 });
          ctx.globalAlpha = 1;
        } else {
          const pulse = 1 + Math.sin(now / 150) * 0.06;
          ctx.setLineDash([8, 7]);
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 26 * pulse, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
          outlinedText(ctx, String(p.respawnIn), p.x, p.y + 2, { size: 30, fill: '#ffd23f', width: 6 });
          outlinedText(ctx, p.name, p.x, p.y + 40, { size: 13, fill: '#fff', width: 4 });
        }
        return;
      }

      // Bayangan.
      ctx.fillStyle = 'rgba(27, 21, 48, .25)';
      ctx.beginPath();
      ctx.ellipse(p.x + 2, p.y + 9, 25, 15, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.lineJoin = 'round';

      // Badan dan roda rantai.
      ctx.save();
      ctx.rotate(t.bodyAngle);
      for (const ty of [-21, 10]) {
        ctx.fillStyle = '#3b3550';
        ctx.strokeStyle = INK;
        ctx.lineWidth = 3.5;
        roundRect(ctx, -23, ty, 46, 11, 5);
        ctx.fill();
        ctx.stroke();
        ctx.save();
        roundRect(ctx, -23, ty, 46, 11, 5);
        ctx.clip();
        ctx.strokeStyle = '#6b6388';
        ctx.lineWidth = 2.5;
        const offset = t.tread % 8;
        for (let x = -24 + offset; x < 24; x += 8) {
          ctx.beginPath();
          ctx.moveTo(x, ty + 2);
          ctx.lineTo(x, ty + 9);
          ctx.stroke();
        }
        ctx.restore();
      }
      ctx.fillStyle = p.color;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 4;
      roundRect(ctx, -19, -13, 38, 26, 9);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 255, 255, .38)';
      roundRect(ctx, -14, -9, 24, 5, 3);
      ctx.fill();
      ctx.fillStyle = shade(p.color, -0.25);
      roundRect(ctx, -14, 6, 28, 3, 2);
      ctx.fill();
      ctx.restore();

      // Laras dan kubah.
      ctx.save();
      ctx.rotate(t.turret === null ? p.angle : t.turret);
      const rec = t.recoil;
      ctx.fillStyle = '#3b3550';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3.5;
      roundRect(ctx, 4 - rec, -5, 24, 10, 4);
      ctx.fill();
      ctx.stroke();
      roundRect(ctx, 25 - rec, -7, 8, 14, 3);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = shade(p.color, 0.35);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Mata yang melirik ke arah bidik dan sesekali berkedip.
      const look = t.turret === null ? p.angle : t.turret;
      const lookX = Math.cos(look) * 2.5;
      const lookY = Math.sin(look) * 2.5;
      const blink = ((now / 1000 + t.blinkSeed) % 4) > 3.85;
      ctx.fillStyle = INK;
      for (const ex of [-4, 4]) {
        ctx.beginPath();
        ctx.ellipse(ex + lookX, -1 + lookY, 2.4, blink ? 0.6 : 3.6, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      if (p.shield) {
        // Gelembung pelindung setelah respawn / awal ronde.
        const pulse = 1 + Math.sin(now / 90) * 0.05;
        ctx.globalAlpha = 0.28;
        ctx.fillStyle = '#a8e6ff';
        ctx.beginPath();
        ctx.arc(0, 0, 30 * pulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      if (t.flash > 0) {
        ctx.globalAlpha = t.flash * 0.8;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(0, 0, 24, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.restore();

      // Tank di dalam semak: label nama dan bar HP disembunyikan
      // (kecuali tank milik pemain sendiri di mode solo).
      if (p.hid && !highlight) return;

      // Label nama dan bar HP.
      ctx.font = `14px ${TITLE_FONT}`;
      const nameW = Math.max(44, ctx.measureText(p.name).width + 16);
      ctx.fillStyle = INK;
      roundRect(ctx, p.x - nameW / 2, p.y - 56, nameW, 20, 8);
      ctx.fill();
      outlinedText(ctx, p.name, p.x, p.y - 46, { size: 14, fill: p.color, width: 0.01 });

      const hpW = 46;
      ctx.fillStyle = INK;
      roundRect(ctx, p.x - hpW / 2 - 2, p.y - 35, hpW + 4, 11, 5);
      ctx.fill();
      const ratio = Math.max(0, p.hp) / 100;
      ctx.fillStyle = ratio > 0.6 ? '#4cd964' : ratio > 0.3 ? '#ffd23f' : '#ff4d5e';
      if (ratio > 0) {
        roundRect(ctx, p.x - hpW / 2, p.y - 33, hpW * ratio, 7, 3);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 255, 255, .4)';
        ctx.fillRect(p.x - hpW / 2 + 2, p.y - 32, Math.max(0, hpW * ratio - 4), 2);
      }

      drawHearts(ctx, p.x, p.y + 33, Math.max(0, p.lives), 11);

      // Penanda DASH siap: lingkaran ungu kecil berpetir di kanan bar HP.
      // Muncul dengan "pop" saat dash baru siap, hilang selama cooldown.
      const ready = !(p.dashCooldown > 0);
      if (ready && !t.dashReady) t.dashPop = 1;
      t.dashReady = ready;
      if (ready) {
        t.dashPop = Math.max(0, (t.dashPop || 0) - 0.06);
        const s = 1 + Math.sin((1 - t.dashPop) * Math.PI) * t.dashPop * 0.9;
        const bx = p.x + hpW / 2 + 10;
        const by = p.y - 29;
        ctx.save();
        ctx.translate(bx, by);
        ctx.scale(s, s);
        ctx.fillStyle = '#a66bff';
        ctx.strokeStyle = INK;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, 0, 6.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(1.2, -4.2);
        ctx.lineTo(-2.6, 0.6);
        ctx.lineTo(-0.2, 0.6);
        ctx.lineTo(-1.2, 4.2);
        ctx.lineTo(2.6, -0.8);
        ctx.lineTo(0.2, -0.8);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      if (highlight) {
        const bob = Math.sin(now / 180) * 4;
        ctx.fillStyle = '#ffd23f';
        ctx.strokeStyle = INK;
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(p.x - 9, p.y - 74 + bob);
        ctx.lineTo(p.x + 9, p.y - 74 + bob);
        ctx.lineTo(p.x, p.y - 62 + bob);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }

    // Garis bidik putus-putus saat pemain menahan stik SERANG (seperti Brawl Stars).
    function drawAimGuides(snap, now) {
      for (const p of snap.players) {
        if (!p.alive) continue;
        const t = tanks.get(p.id);
        if (!t || t.aimA < 0.02) continue;
        // Pakai sudut laras yang sudah dihaluskan; garis memanjang saat muncul.
        const a = t.turret === null ? p.angle : t.turret;
        const len = 60 + 200 * t.aimA;
        const ex = p.x + Math.cos(a) * len;
        const ey = p.y + Math.sin(a) * len;
        ctx.save();
        ctx.globalAlpha = Math.min(1, t.aimA * 1.2);
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(27, 21, 48, .35)';
        ctx.lineWidth = 16;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        ctx.setLineDash([14, 12]);
        ctx.lineDashOffset = -now / 25;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 7;
        ctx.globalAlpha = t.aimA * (p.fireCooldown > 0 ? 0.35 : 0.9);
        ctx.beginPath();
        ctx.moveTo(p.x + Math.cos(a) * 30, p.y + Math.sin(a) * 30);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = Math.min(1, t.aimA * 1.2);
        ctx.fillStyle = p.color;
        ctx.strokeStyle = INK;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(ex, ey, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }

    // Peluru: kapsul berwarna pemilik dengan inti terang, jejak meruncing, dan kilau.
    function drawBullets(snap, now) {
      const seen = new Set();
      for (const b of snap.bullets) {
        seen.add(b.id);
        const owner = playerById(b.o);
        const color = owner ? owner.color : '#ffd23f';
        let trail = bulletTrail.get(b.id);
        if (!trail) {
          trail = [];
          bulletTrail.set(b.id, trail);
        }
        const lastPt = trail[trail.length - 1];
        if (!lastPt || lastPt.x !== b.x || lastPt.y !== b.y) trail.push({ x: b.x, y: b.y });
        if (trail.length > 7) trail.shift();

        // Jejak meruncing.
        for (let i = 1; i < trail.length; i++) {
          const t = i / trail.length;
          ctx.strokeStyle = color;
          ctx.globalAlpha = 0.15 + t * 0.45;
          ctx.lineWidth = 3 + t * 9;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
          ctx.lineTo(trail[i].x, trail[i].y);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;

        const angle = Math.atan2(b.vy, b.vx);
        ctx.save();
        ctx.translate(b.x, b.y);
        // Cahaya lembut.
        ctx.globalAlpha = 0.35 + Math.sin(now / 60 + b.id) * 0.1;
        ctx.fillStyle = '#fff6c2';
        ctx.beginPath();
        ctx.arc(0, 0, 13, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.rotate(angle);
        // Badan kapsul.
        ctx.fillStyle = color;
        ctx.strokeStyle = INK;
        ctx.lineWidth = 3;
        roundRect(ctx, -11, -6.5, 22, 13, 6.5);
        ctx.fill();
        ctx.stroke();
        // Inti terang di depan.
        ctx.fillStyle = '#fff6c2';
        ctx.beginPath();
        ctx.arc(4, 0, 4.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 255, 255, .7)';
        roundRect(ctx, -7, -4, 10, 2.5, 1.2);
        ctx.fill();
        ctx.restore();
      }
      for (const id of [...bulletTrail.keys()]) if (!seen.has(id)) bulletTrail.delete(id);
    }

    function impact(ev) {
      const color = ev.color || '#ffd23f';
      if (ev.kind === 'tank') {
        ring(ev.x, ev.y, '#fff6c2', 30);
        sparks(ev.x, ev.y, 9, color);
        puff(ev.x, ev.y, color, { count: 5, speed: 90, size: 6, life: 0.35, grow: 16 });
        shake = Math.max(shake, 4);
      } else if (ev.kind === 'shield') {
        ring(ev.x, ev.y, '#a8e6ff', 26);
        sparks(ev.x, ev.y, 5, '#a8e6ff');
      } else if (ev.kind === 'bounce') {
        // Pantulan di dinding neon: kilatan kecil, peluru tetap terbang.
        ring(ev.x, ev.y, '#ffffff', 18);
        sparks(ev.x, ev.y, 5, color);
      } else if (ev.kind === 'wall') {
        ring(ev.x, ev.y, color, 22);
        puff(ev.x, ev.y, '#e8c79a', { count: 5, speed: 60, size: 6, life: 0.4, grow: 12 });
        sparks(ev.x, ev.y, 4, color);
      } else {
        puff(ev.x, ev.y, '#f3e6c4', { count: 3, speed: 30, size: 5, life: 0.3, grow: 10 });
      }
    }

    function drawParticles() {
      for (const q of particles) {
        const a = q.life / q.max;
        ctx.globalAlpha = Math.min(1, a * 1.5);
        if (q.kind === 'puff') {
          ctx.fillStyle = q.color;
          ctx.strokeStyle = INK;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(q.x, q.y, q.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        } else if (q.kind === 'spark') {
          ctx.strokeStyle = q.color;
          ctx.lineWidth = 4;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(q.x, q.y);
          ctx.lineTo(q.x - q.vx * 0.04, q.y - q.vy * 0.04);
          ctx.stroke();
        } else if (q.kind === 'debris') {
          ctx.save();
          ctx.translate(q.x, q.y);
          ctx.rotate(q.rot);
          ctx.fillStyle = q.color;
          ctx.strokeStyle = INK;
          ctx.lineWidth = 2.5;
          ctx.fillRect(-q.size / 2, -q.size / 2, q.size, q.size);
          ctx.strokeRect(-q.size / 2, -q.size / 2, q.size, q.size);
          ctx.restore();
        } else if (q.kind === 'ring') {
          ctx.strokeStyle = q.color;
          ctx.lineWidth = 6 * a + 1;
          ctx.beginPath();
          ctx.arc(q.x, q.y, q.r, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    }

    function drawFloaters() {
      for (const f of floaters) {
        const t = 1 - f.life / f.max;
        const scale = t < 0.15 ? 0.6 + (t / 0.15) * 0.6 : 1.2 - Math.min(0.2, (t - 0.15));
        ctx.globalAlpha = Math.min(1, f.life * 2);
        outlinedText(ctx, f.text, f.x, f.y, { size: f.size * scale, fill: f.color, width: 6 });
      }
      ctx.globalAlpha = 1;
    }

    function drawFeed() {
      feed.forEach((f, i) => {
        const y = 30 + i * 30;
        ctx.globalAlpha = Math.min(1, f.life);
        ctx.font = `15px ${TITLE_FONT}`;
        const kw = ctx.measureText(f.killer).width;
        const vw = ctx.measureText(f.victim).width;
        const iconW = 34;
        const w = kw + vw + iconW + 26;
        ctx.fillStyle = 'rgba(27, 21, 48, .82)';
        roundRect(ctx, W / 2 - w / 2, y - 12, w, 24, 10);
        ctx.fill();
        const left = W / 2 - w / 2 + 13;
        outlinedText(ctx, f.killer, left, y + 1, { size: 15, fill: f.kColor, width: 0.01, align: 'left' });
        drawBurst(ctx, left + kw + iconW / 2, y, 9);
        outlinedText(ctx, f.victim, left + kw + iconW, y + 1, { size: 15, fill: f.vColor, width: 0.01, align: 'left' });
      });
      ctx.globalAlpha = 1;
    }

    function drawScoreboard(snap) {
      const rows = [...snap.players].sort((a, b) => b.kills - a.kills || b.lives - a.lives);
      const w = 210;
      const h = 44 + rows.length * 28;
      const x = W - w - 18;
      const y = 18;
      ctx.fillStyle = INK;
      roundRect(ctx, x, y + 5, w, h, 16);
      ctx.fill();
      ctx.fillStyle = '#fff6dc';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 4;
      roundRect(ctx, x, y, w, h, 16);
      ctx.fill();
      ctx.stroke();
      outlinedText(ctx, 'PAPAN SKOR', x + w / 2, y + 18, { size: 16, fill: '#ffd23f', width: 5 });
      rows.forEach((p, i) => {
        const ry = y + 44 + i * 28;
        ctx.fillStyle = p.color;
        ctx.strokeStyle = INK;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x + 20, ry, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.globalAlpha = p.eliminated ? 0.45 : 1;
        ctx.font = `15px ${TITLE_FONT}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = INK;
        ctx.fillText(p.name, x + 34, ry + 1);
        ctx.textAlign = 'right';
        ctx.fillText(`${p.kills}`, x + w - 66, ry + 1);
        ctx.textAlign = 'center';
        for (let k = 0; k < 3; k++) drawHeart(ctx, x + w - 52 + k * 15, ry + 1, 12, k < p.lives);
        if (p.eliminated) outlinedText(ctx, 'KO', x + w - 37, ry + 1, { size: 14, fill: '#ff4d5e', width: 4 });
        ctx.globalAlpha = 1;
      });
    }

    function drawDashMeter(p) {
      if (!p) return;
      const x = 22;
      const y = H - 52;
      const ready = p.dashCooldown <= 0;
      ctx.fillStyle = INK;
      roundRect(ctx, x, y + 4, 170, 34, 14);
      ctx.fill();
      ctx.fillStyle = '#fff6dc';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 4;
      roundRect(ctx, x, y, 170, 34, 14);
      ctx.fill();
      ctx.stroke();
      const ratio = ready ? 1 : 1 - p.dashCooldown / 2;
      ctx.fillStyle = ready ? '#a66bff' : '#cdbdf0';
      roundRect(ctx, x + 6, y + 6, 158 * ratio, 22, 9);
      ctx.fill();
      outlinedText(ctx, ready ? 'DASH SIAP!' : 'ISI ULANG...', x + 85, y + 18, { size: 16, fill: '#fff', width: 5 });
    }

    function drawBanner(title, subtitle, color) {
      ctx.fillStyle = 'rgba(27, 21, 48, .55)';
      ctx.fillRect(0, 0, W, H);
      const w = 460;
      const h = 190;
      const x = W / 2 - w / 2;
      const y = H / 2 - h / 2;
      ctx.fillStyle = INK;
      roundRect(ctx, x, y + 8, w, h, 26);
      ctx.fill();
      ctx.fillStyle = '#fff6dc';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 5;
      roundRect(ctx, x, y, w, h, 26);
      ctx.fill();
      ctx.stroke();
      const wob = Math.sin(performance.now() / 260) * 0.04;
      ctx.save();
      ctx.translate(W / 2, y + 70);
      ctx.rotate(wob);
      outlinedText(ctx, title, 0, 0, { size: 58, fill: color || '#ffd23f', width: 9 });
      ctx.restore();
      outlinedText(ctx, subtitle, W / 2, y + 140, { size: 20, fill: '#1b1530', width: 0.01, font: BODY_FONT });
    }

    // opts: { hud: bool, highlightId: string, banner: {title, subtitle, color} }
    function draw(snap, opts) {
      opts = opts || {};
      const now = performance.now();
      const dt = Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;
      latest = snap;
      const map = root.TankMaps.get(snap.mapId);
      if (bgMapId !== map.id) {
        // Peta baru: bangun ulang latar dan buang efek dari peta sebelumnya.
        background = root.TankArt.buildBackground(map);
        bgMapId = map.id;
        tanks.clear();
        bulletTrail.clear();
        particles = [];
        floaters = [];
      }
      update(dt, snap);

      ctx.save();
      if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
      ctx.drawImage(background, 0, 0);
      root.TankArt.drawFx(ctx, map, now);
      root.TankArt.drawMovers(ctx, snap.movers);
      drawAimGuides(snap, now);
      for (const p of snap.players) drawTank(p, now, p.id === opts.highlightId);
      drawBullets(snap, now);
      root.TankArt.drawBushes(ctx, map, now);
      drawParticles();
      drawFloaters();
      ctx.restore();

      drawFeed();
      if (opts.hud) {
        drawScoreboard(snap);
        drawDashMeter(snap.players.find((p) => p.id === opts.highlightId));
      }
      if (opts.emptyText && snap.players.length === 0) {
        const bob = Math.sin(now / 300) * 6;
        outlinedText(ctx, opts.emptyText, W / 2, H / 2 + bob, { size: 34, fill: '#fff', width: 8 });
      }
      if (opts.banner) drawBanner(opts.banner.title, opts.banner.subtitle, opts.banner.color);
    }

    return { draw, onEvents };
  }

  root.TankRender = { createRenderer };
})(window);
