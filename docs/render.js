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
    let lastTime = performance.now();

    function buildBackground(obstacles) {
      const bg = document.createElement('canvas');
      bg.width = W;
      bg.height = H;
      const b = bg.getContext('2d');

      // Rumput kotak-kotak.
      for (let y = 0; y < H; y += 50) {
        for (let x = 0; x < W; x += 50) {
          b.fillStyle = ((x + y) / 50) % 2 === 0 ? '#93d66b' : '#87cb5f';
          b.fillRect(x, y, 50, 50);
        }
      }

      // Rumput kecil dan bunga sebagai hiasan.
      const rand = seeded(7);
      const blocked = (x, y) => obstacles.some((o) => x > o.x - 14 && x < o.x + o.w + 14 && y > o.y - 14 && y < o.y + o.h + 14);
      for (let i = 0; i < 90; i++) {
        const x = 20 + rand() * (W - 40);
        const y = 20 + rand() * (H - 40);
        if (blocked(x, y)) continue;
        if (rand() < 0.2) {
          const colors = ['#ffffff', '#ffd23f', '#ff8fb1'];
          b.fillStyle = colors[Math.floor(rand() * colors.length)];
          for (let k = 0; k < 5; k++) {
            const a = (k / 5) * Math.PI * 2;
            b.beginPath();
            b.arc(x + Math.cos(a) * 3.5, y + Math.sin(a) * 3.5, 2.6, 0, Math.PI * 2);
            b.fill();
          }
          b.fillStyle = '#ff9f1c';
          b.beginPath();
          b.arc(x, y, 2.2, 0, Math.PI * 2);
          b.fill();
        } else {
          b.strokeStyle = '#5fa843';
          b.lineWidth = 2.5;
          b.lineCap = 'round';
          b.beginPath();
          b.moveTo(x - 5, y + 3); b.lineTo(x - 3, y - 4);
          b.moveTo(x, y + 3); b.lineTo(x, y - 6);
          b.moveTo(x + 5, y + 3); b.lineTo(x + 3, y - 4);
          b.stroke();
        }
      }

      // Peti kayu.
      for (const o of obstacles) {
        b.fillStyle = 'rgba(27, 21, 48, .22)';
        roundRect(b, o.x + 5, o.y + 8, o.w, o.h, 10);
        b.fill();

        b.fillStyle = '#d0904f';
        b.strokeStyle = INK;
        b.lineWidth = 4;
        roundRect(b, o.x, o.y, o.w, o.h, 10);
        b.fill();
        b.stroke();

        b.save();
        roundRect(b, o.x, o.y, o.w, o.h, 10);
        b.clip();
        b.strokeStyle = '#a8692f';
        b.lineWidth = 3;
        const horizontal = o.w >= o.h;
        const span = horizontal ? o.h : o.w;
        for (let d = 14; d < span - 6; d += 14) {
          b.beginPath();
          if (horizontal) { b.moveTo(o.x + 6, o.y + d); b.lineTo(o.x + o.w - 6, o.y + d); }
          else { b.moveTo(o.x + d, o.y + 6); b.lineTo(o.x + d, o.y + o.h - 6); }
          b.stroke();
        }
        b.fillStyle = 'rgba(255, 255, 255, .28)';
        b.fillRect(o.x, o.y, o.w, 6);
        b.restore();

        b.strokeStyle = '#8a5426';
        b.lineWidth = 4;
        roundRect(b, o.x + 7, o.y + 7, o.w - 14, o.h - 14, 6);
        b.stroke();

        b.fillStyle = '#6b3f1c';
        for (const [cx, cy] of [[o.x + 11, o.y + 11], [o.x + o.w - 11, o.y + 11], [o.x + 11, o.y + o.h - 11], [o.x + o.w - 11, o.y + o.h - 11]]) {
          b.beginPath();
          b.arc(cx, cy, 3, 0, Math.PI * 2);
          b.fill();
        }
      }

      // Bingkai arena.
      b.strokeStyle = INK;
      b.lineWidth = 10;
      roundRect(b, 5, 5, W - 10, H - 10, 22);
      b.stroke();
      b.strokeStyle = 'rgba(255, 255, 255, .35)';
      b.lineWidth = 3;
      roundRect(b, 13, 13, W - 26, H - 26, 16);
      b.stroke();
      return bg;
    }

    function tankState(id) {
      let t = tanks.get(id);
      if (!t) {
        t = { x: null, y: null, bodyAngle: 0, tread: 0, recoil: 0, flash: 0, hp: null, ghosts: [], blinkSeed: Math.random() * 5 };
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
          t.recoil = 7;
          const mx = p.x + Math.cos(p.angle) * 34;
          const my = p.y + Math.sin(p.angle) * 34;
          puff(mx, my, '#fff6c2', { count: 4, speed: 40, size: 6, life: 0.25, grow: 18 });
          ring(mx, my, '#ffd23f', 16);
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
          addFeed(killer, victim);
        } else if (ev.type === 'respawn') {
          const p = playerById(ev.id);
          if (p) ring(p.x, p.y, p.color, 60);
        }
      }
    }

    function addFeed(killer, victim) {
      if (!victim) return;
      feed.push({ killer: killer ? killer.name : '?', kColor: killer ? killer.color : '#fff', victim: victim.name, vColor: victim.color, life: 4 });
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
        if (t.hp !== null && p.hp < t.hp && p.alive !== false) {
          t.flash = 1;
          sparks(p.x, p.y, 7, '#ffd23f');
          floater(p.x + 14, p.y - 26, `-${t.hp - p.hp}`, '#ff4d5e', 20);
        } else if (t.hp !== null && p.hp < t.hp) {
          t.flash = 1;
        }
        t.x = p.x;
        t.y = p.y;
        t.hp = p.hp;
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
      ctx.rotate(p.angle);
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
      const lookX = Math.cos(p.angle) * 2.5;
      const lookY = Math.sin(p.angle) * 2.5;
      const blink = ((now / 1000 + t.blinkSeed) % 4) > 3.85;
      ctx.fillStyle = INK;
      for (const ex of [-4, 4]) {
        ctx.beginPath();
        ctx.ellipse(ex + lookX, -1 + lookY, 2.4, blink ? 0.6 : 3.6, 0, 0, Math.PI * 2);
        ctx.fill();
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

      const hearts = '♥'.repeat(Math.max(0, p.lives));
      outlinedText(ctx, hearts, p.x, p.y + 32, { size: 13, fill: '#ff4d5e', width: 4, font: BODY_FONT });

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

    function drawBullets(snap) {
      const seen = new Set();
      for (const b of snap.bullets) {
        seen.add(b.id);
        const prev = bulletTrail.get(b.id);
        if (prev) {
          ctx.strokeStyle = 'rgba(255, 246, 194, .7)';
          ctx.lineWidth = 7;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(prev.x, prev.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
        bulletTrail.set(b.id, { x: b.x, y: b.y });
        ctx.fillStyle = '#ffd23f';
        ctx.strokeStyle = INK;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(b.x, b.y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(b.x - 2, b.y - 2, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const id of [...bulletTrail.keys()]) if (!seen.has(id)) bulletTrail.delete(id);
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
        const text = `${f.killer}  💥  ${f.victim}`;
        const w = ctx.measureText(text).width + 26;
        ctx.fillStyle = 'rgba(27, 21, 48, .82)';
        roundRect(ctx, W / 2 - w / 2, y - 12, w, 24, 10);
        ctx.fill();
        const kw = ctx.measureText(`${f.killer}  `).width;
        const mid = ctx.measureText('💥').width;
        const left = W / 2 - w / 2 + 13;
        outlinedText(ctx, f.killer, left, y + 1, { size: 15, fill: f.kColor, width: 0.01, align: 'left' });
        outlinedText(ctx, '💥', left + kw, y + 1, { size: 15, fill: '#fff', width: 0.01, align: 'left' });
        outlinedText(ctx, f.victim, left + kw + mid + ctx.measureText('  ').width, y + 1, { size: 15, fill: f.vColor, width: 0.01, align: 'left' });
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
        ctx.fillStyle = '#ff4d5e';
        ctx.font = `14px ${BODY_FONT}`;
        ctx.fillText('♥'.repeat(Math.max(0, p.lives)) || '💀', x + w - 14, ry + 1);
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
      outlinedText(ctx, ready ? '⚡ DASH SIAP' : '⚡ DASH...', x + 85, y + 18, { size: 16, fill: '#fff', width: 5 });
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
      if (!background) background = buildBackground(snap.obstacles);
      update(dt, snap);

      ctx.save();
      if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
      ctx.drawImage(background, 0, 0);
      drawBullets(snap);
      for (const p of snap.players) drawTank(p, now, p.id === opts.highlightId);
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
