// Gambar arena per tema: lantai, rintangan, zona, efek animasi, semak, dan pratinjau kecil.
// Hanya menggambar; tidak mengubah state game.
(function (root) {
  'use strict';

  const INK = '#1b1530';
  const W = 1000;
  const H = 700;
  const TAU = Math.PI * 2;

  // ---------------------------------------------------------------- util
  function rr(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function circle(ctx, x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
  }

  function seeded(seed) {
    let s = seed % 233280;
    return () => {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
  }

  function hashRect(o) {
    return Math.abs(Math.round(o.x * 7 + o.y * 13 + o.w * 3 + o.h * 5)) + 1;
  }

  // Titik dekorasi lantai tidak boleh menimpa rintangan/zona/portal.
  function isBlocked(map, x, y, pad) {
    for (const o of map.obstacles) if (x > o.x - pad && x < o.x + o.w + pad && y > o.y - pad && y < o.y + o.h + pad) return true;
    for (const z of map.zones) if (x > z.x - pad && x < z.x + z.w + pad && y > z.y - pad && y < z.y + z.h + pad) return true;
    for (const m of map.movers) if (x > m.x - m.ax - pad && x < m.x + m.w + m.ax + pad && y > m.y - m.ay - pad && y < m.y + m.h + m.ay + pad) return true;
    for (const p of map.portals) for (const e of [p.a, p.b]) if (Math.hypot(x - e.x, y - e.y) < 40 + pad) return true;
    return false;
  }

  function scatter(map, seed, count, pad, fn) {
    const rand = seeded(seed);
    for (let i = 0; i < count; i++) {
      const x = 24 + rand() * (W - 48);
      const y = 24 + rand() * (H - 48);
      const r1 = rand();
      const r2 = rand();
      if (isBlocked(map, x, y, pad)) continue;
      fn(x, y, r1, r2, i);
    }
  }

  function checker(b, a, c, size) {
    for (let y = 0; y < H; y += size) {
      for (let x = 0; x < W; x += size) {
        b.fillStyle = ((x + y) / size) % 2 === 0 ? a : c;
        b.fillRect(x, y, size, size);
      }
    }
  }

  function shadowRect(b, o, r) {
    b.fillStyle = 'rgba(27, 21, 48, .24)';
    rr(b, o.x + 5, o.y + 8, o.w, o.h, r);
    b.fill();
  }

  // ------------------------------------------------------------- lantai
  const GROUND = {
    meadow(b, map) {
      checker(b, '#93d66b', '#87cb5f', 50);
      scatter(map, 7, 110, 14, (x, y, r1, r2) => {
        if (r1 < 0.22) {
          const colors = ['#ffffff', '#ffd23f', '#ff8fb1'];
          b.fillStyle = colors[Math.floor(r2 * colors.length)];
          for (let k = 0; k < 5; k++) {
            const a = (k / 5) * TAU;
            circle(b, x + Math.cos(a) * 3.5, y + Math.sin(a) * 3.5, 2.6);
            b.fill();
          }
          b.fillStyle = '#ff9f1c';
          circle(b, x, y, 2.2);
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
      });
    },

    desert(b, map) {
      const g = b.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#f6d896');
      g.addColorStop(1, '#efc77d');
      b.fillStyle = g;
      b.fillRect(0, 0, W, H);
      // Riak bukit pasir.
      b.strokeStyle = 'rgba(196, 140, 66, .35)';
      b.lineWidth = 3;
      b.lineCap = 'round';
      scatter(map, 11, 70, 10, (x, y, r1) => {
        const w = 26 + r1 * 30;
        b.beginPath();
        b.moveTo(x - w / 2, y);
        b.quadraticCurveTo(x, y - 7, x + w / 2, y);
        b.stroke();
      });
      // Kerikil dan semak kering.
      scatter(map, 23, 45, 12, (x, y, r1, r2) => {
        if (r1 < 0.6) {
          b.fillStyle = r2 < 0.5 ? '#c99a5a' : '#b98648';
          b.strokeStyle = 'rgba(27,21,48,.5)';
          b.lineWidth = 1.5;
          b.beginPath();
          b.ellipse(x, y, 4 + r2 * 4, 3 + r2 * 2, r1 * 3, 0, TAU);
          b.fill();
          b.stroke();
        } else {
          b.strokeStyle = '#a8773e';
          b.lineWidth = 2;
          for (let k = 0; k < 5; k++) {
            const a = -Math.PI / 2 + (k - 2) * 0.45;
            b.beginPath();
            b.moveTo(x, y + 4);
            b.lineTo(x + Math.cos(a) * 9, y + 4 + Math.sin(a) * 9);
            b.stroke();
          }
        }
      });
      // Tulang kecil sebagai hiasan.
      scatter(map, 31, 6, 20, (x, y, r1) => {
        b.save();
        b.translate(x, y);
        b.rotate(r1 * TAU);
        b.fillStyle = '#fff6e0';
        b.strokeStyle = INK;
        b.lineWidth = 2;
        rr(b, -9, -2.5, 18, 5, 2.5);
        b.fill();
        b.stroke();
        for (const ex of [-9, 9]) for (const ey of [-2.5, 2.5]) {
          circle(b, ex, ey, 3);
          b.fill();
          b.stroke();
        }
        b.restore();
      });
    },

    ice(b, map) {
      checker(b, '#eef8ff', '#e2f1fc', 50);
      // Gundukan salju dan jejak.
      scatter(map, 13, 40, 14, (x, y, r1) => {
        b.fillStyle = '#ffffff';
        b.strokeStyle = 'rgba(111, 169, 214, .6)';
        b.lineWidth = 2;
        b.beginPath();
        b.ellipse(x, y, 12 + r1 * 10, 6 + r1 * 3, 0, 0, TAU);
        b.fill();
        b.stroke();
      });
      scatter(map, 17, 90, 8, (x, y, r1) => {
        b.fillStyle = r1 < 0.5 ? 'rgba(127, 190, 230, .5)' : 'rgba(255,255,255,.9)';
        circle(b, x, y, 1.5 + r1 * 2);
        b.fill();
      });
      // Pohon cemara kecil di tepi (hiasan datar).
      for (const [x, y] of [[30, 200], [970, 480], [30, 470], [970, 210], [350, 26], [650, 674]]) {
        if (isBlocked(map, x, y, 6)) continue;
        b.fillStyle = '#2f7d5a';
        b.strokeStyle = INK;
        b.lineWidth = 2.5;
        for (let k = 0; k < 3; k++) {
          const s = 16 - k * 4;
          b.beginPath();
          b.moveTo(x, y - 18 + k * 7 - s);
          b.lineTo(x + s, y - 6 + k * 7);
          b.lineTo(x - s, y - 6 + k * 7);
          b.closePath();
          b.fill();
          b.stroke();
        }
        b.fillStyle = '#ffffff';
        circle(b, x - 3, y - 24, 3);
        b.fill();
      }
    },

    volcano(b, map) {
      checker(b, '#4b3b41', '#44353b', 50);
      // Retakan bercahaya.
      const rand = seeded(19);
      b.lineCap = 'round';
      for (let i = 0; i < 26; i++) {
        let x = rand() * W;
        let y = rand() * H;
        if (isBlocked(map, x, y, 10)) continue;
        b.strokeStyle = 'rgba(255, 122, 43, .45)';
        b.lineWidth = 2.5;
        b.beginPath();
        b.moveTo(x, y);
        for (let k = 0; k < 4; k++) {
          x += (rand() - 0.5) * 40;
          y += (rand() - 0.5) * 40;
          b.lineTo(x, y);
        }
        b.stroke();
      }
      // Abu dan bara.
      scatter(map, 41, 120, 6, (x, y, r1) => {
        b.fillStyle = r1 < 0.15 ? 'rgba(255, 150, 60, .8)' : 'rgba(20, 12, 16, .35)';
        circle(b, x, y, r1 < 0.15 ? 2 : 1.5 + r1 * 2.5);
        b.fill();
      });
      // Jembatan batu di antara dua sungai lava.
      const river = map.zones.filter((z) => z.type === 'lava' && z.h > z.w * 1.5);
      if (river.length === 2) {
        const top = river[0].y + river[0].h;
        const bot = river[1].y;
        const x = river[0].x - 24;
        const w = river[0].w + 48;
        b.fillStyle = '#7d6a64';
        b.strokeStyle = INK;
        b.lineWidth = 4;
        rr(b, x, top - 10, w, bot - top + 20, 10);
        b.fill();
        b.stroke();
        b.strokeStyle = 'rgba(27,21,48,.35)';
        b.lineWidth = 2;
        for (let y = top + 14; y < bot - 6; y += 22) {
          b.beginPath();
          b.moveTo(x + 6, y);
          b.lineTo(x + w - 6, y);
          b.stroke();
        }
      }
    },

    factory(b, map) {
      // Pelat besi dengan paku keling.
      for (let y = 0; y < H; y += 100) {
        for (let x = 0; x < W; x += 100) {
          b.fillStyle = ((x + y) / 100) % 2 === 0 ? '#a7afbf' : '#9ca5b6';
          b.fillRect(x, y, 100, 100);
          b.strokeStyle = 'rgba(27,21,48,.18)';
          b.lineWidth = 2;
          b.strokeRect(x + 1, y + 1, 98, 98);
          b.fillStyle = 'rgba(27,21,48,.3)';
          for (const [rx, ry] of [[8, 8], [92, 8], [8, 92], [92, 92]]) {
            circle(b, x + rx, y + ry, 2.5);
            b.fill();
          }
        }
      }
      // Noda oli.
      scatter(map, 29, 10, 16, (x, y, r1) => {
        b.fillStyle = 'rgba(40, 36, 60, .25)';
        b.beginPath();
        b.ellipse(x, y, 18 + r1 * 16, 10 + r1 * 8, r1 * 3, 0, TAU);
        b.fill();
      });
      // Garis bahaya kuning-hitam di tepi.
      b.save();
      b.beginPath();
      b.rect(0, 0, W, 14);
      b.rect(0, H - 14, W, 14);
      b.clip();
      b.fillStyle = '#ffd23f';
      b.fillRect(0, 0, W, H);
      b.fillStyle = INK;
      for (let x = -40; x < W + 40; x += 28) {
        b.beginPath();
        b.moveTo(x, 0); b.lineTo(x + 14, 0); b.lineTo(x - 6, H); b.lineTo(x - 20, H);
        b.closePath();
        b.fill();
      }
      b.restore();
    },

    neon(b, map) {
      const g = b.createRadialGradient(W / 2, H / 2, 50, W / 2, H / 2, 640);
      g.addColorStop(0, '#24134a');
      g.addColorStop(1, '#100826');
      b.fillStyle = g;
      b.fillRect(0, 0, W, H);
      b.lineWidth = 1.5;
      for (let x = 0; x <= W; x += 50) {
        b.strokeStyle = x % 250 === 0 ? 'rgba(255, 79, 216, .35)' : 'rgba(110, 80, 220, .22)';
        b.beginPath(); b.moveTo(x, 0); b.lineTo(x, H); b.stroke();
      }
      for (let y = 0; y <= H; y += 50) {
        b.strokeStyle = y % 250 === 0 ? 'rgba(63, 240, 255, .3)' : 'rgba(110, 80, 220, .22)';
        b.beginPath(); b.moveTo(0, y); b.lineTo(W, y); b.stroke();
      }
      scatter(map, 37, 80, 4, (x, y, r1) => {
        b.fillStyle = r1 < 0.5 ? 'rgba(63, 240, 255, .7)' : 'rgba(255, 79, 216, .7)';
        circle(b, x, y, 1 + r1 * 1.5);
        b.fill();
      });
    },

    temple(b, map) {
      // Ubin batu berlumut.
      for (let y = 0; y < H; y += 50) {
        const off = (y / 50) % 2 === 0 ? 0 : 25;
        for (let x = -25; x < W; x += 50) {
          b.fillStyle = ((x + off + y) / 25) % 4 < 2 ? '#a9bba1' : '#9fb297';
          b.fillRect(x + off, y, 50, 50);
          b.strokeStyle = 'rgba(60, 80, 55, .35)';
          b.lineWidth = 2;
          b.strokeRect(x + off + 1, y + 1, 48, 48);
        }
      }
      scatter(map, 43, 40, 10, (x, y, r1) => {
        b.fillStyle = 'rgba(76, 140, 70, .45)';
        b.beginPath();
        b.ellipse(x, y, 14 + r1 * 14, 8 + r1 * 6, r1 * 2, 0, TAU);
        b.fill();
      });
      // Akar menjalar di tepi.
      b.strokeStyle = '#4d7a3f';
      b.lineWidth = 4;
      b.lineCap = 'round';
      for (const [x0, y0, dx, dy] of [[0, 120, 1, 0.3], [W, 580, -1, -0.3], [300, 0, 0.2, 1], [700, H, -0.2, -1]]) {
        b.beginPath();
        b.moveTo(x0, y0);
        for (let k = 1; k <= 5; k++) b.lineTo(x0 + dx * k * 18 + Math.sin(k) * 8, y0 + dy * k * 18 + Math.cos(k) * 8);
        b.stroke();
      }
      // Lingkaran rune di sekitar altar.
      const altar = map.obstacles.find((o) => o.kind === 'altar');
      if (altar) {
        const cx = altar.x + altar.w / 2;
        const cy = altar.y + altar.h / 2;
        b.strokeStyle = 'rgba(166, 107, 255, .45)';
        b.lineWidth = 3;
        circle(b, cx, cy, 100);
        b.stroke();
        b.setLineDash([6, 10]);
        circle(b, cx, cy, 116);
        b.stroke();
        b.setLineDash([]);
      }
    },
  };

  // ------------------------------------------------------------ rintangan
  const OBSTACLE = {
    crate(b, o) {
      shadowRect(b, o, 10);
      b.fillStyle = '#d0904f';
      b.strokeStyle = INK;
      b.lineWidth = 4;
      rr(b, o.x, o.y, o.w, o.h, 10);
      b.fill();
      b.stroke();
      b.save();
      rr(b, o.x, o.y, o.w, o.h, 10);
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
      rr(b, o.x + 7, o.y + 7, o.w - 14, o.h - 14, 6);
      b.stroke();
      b.fillStyle = '#6b3f1c';
      for (const [cx, cy] of [[o.x + 11, o.y + 11], [o.x + o.w - 11, o.y + 11], [o.x + 11, o.y + o.h - 11], [o.x + o.w - 11, o.y + o.h - 11]]) {
        circle(b, cx, cy, 3);
        b.fill();
      }
    },

    rock(b, o) {
      const rand = seeded(hashRect(o));
      const cx = o.x + o.w / 2;
      const cy = o.y + o.h / 2;
      const pts = [];
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * TAU;
        const k = 0.86 + rand() * 0.2;
        pts.push([cx + Math.cos(a) * (o.w / 2) * k * 1.06, cy + Math.sin(a) * (o.h / 2) * k * 1.06]);
      }
      const path = (dx, dy) => {
        b.beginPath();
        pts.forEach(([x, y], i) => (i ? b.lineTo(x + dx, y + dy) : b.moveTo(x + dx, y + dy)));
        b.closePath();
      };
      b.fillStyle = 'rgba(27,21,48,.24)';
      path(5, 8);
      b.fill();
      b.fillStyle = '#c8874c';
      b.strokeStyle = INK;
      b.lineWidth = 4;
      b.lineJoin = 'round';
      path(0, 0);
      b.fill();
      b.save();
      b.clip();
      b.fillStyle = '#a96c37';
      b.fillRect(o.x - 10, cy + o.h * 0.12, o.w + 20, o.h);
      b.fillStyle = 'rgba(255, 236, 200, .45)';
      b.beginPath();
      b.ellipse(cx - o.w * 0.15, cy - o.h * 0.22, o.w * 0.28, o.h * 0.14, -0.3, 0, TAU);
      b.fill();
      b.restore();
      path(0, 0);
      b.stroke();
    },

    mesa(b, o) {
      OBSTACLE.rock(b, o);
      // Lapisan batuan.
      b.save();
      b.beginPath();
      b.ellipse(o.x + o.w / 2, o.y + o.h / 2, o.w / 2 - 4, o.h / 2 - 4, 0, 0, TAU);
      b.clip();
      b.strokeStyle = 'rgba(122, 70, 30, .55)';
      b.lineWidth = 3;
      for (let y = o.y + 26; y < o.y + o.h - 10; y += 20) {
        b.beginPath();
        b.moveTo(o.x, y);
        b.quadraticCurveTo(o.x + o.w / 2, y + 8, o.x + o.w, y);
        b.stroke();
      }
      b.restore();
    },

    cactus(b, o) {
      const cx = o.x + o.w / 2;
      shadowRect(b, o, o.w / 2);
      b.fillStyle = '#5cbf5c';
      b.strokeStyle = INK;
      b.lineWidth = 4;
      // Lengan.
      rr(b, o.x - 12, o.y + 18, 14, 22, 7);
      b.fill();
      b.stroke();
      rr(b, o.x + o.w - 2, o.y + 8, 14, 24, 7);
      b.fill();
      b.stroke();
      rr(b, o.x, o.y, o.w, o.h, o.w / 2);
      b.fill();
      b.stroke();
      b.strokeStyle = '#3e9a48';
      b.lineWidth = 2.5;
      for (const dx of [-7, 0, 7]) {
        b.beginPath();
        b.moveTo(cx + dx, o.y + 8);
        b.lineTo(cx + dx, o.y + o.h - 8);
        b.stroke();
      }
      b.fillStyle = '#ffffff';
      for (let y = o.y + 12; y < o.y + o.h - 6; y += 12) {
        circle(b, cx - 10, y, 1.3); b.fill();
        circle(b, cx + 10, y + 6, 1.3); b.fill();
      }
      b.fillStyle = '#ff8fb1';
      b.strokeStyle = INK;
      b.lineWidth = 2.5;
      circle(b, cx, o.y + 2, 6);
      b.fill();
      b.stroke();
      b.fillStyle = '#ffd23f';
      circle(b, cx, o.y + 2, 2);
      b.fill();
    },

    iceblock(b, o) {
      shadowRect(b, o, 8);
      b.fillStyle = '#a6defa';
      b.strokeStyle = INK;
      b.lineWidth = 4;
      rr(b, o.x, o.y, o.w, o.h, 8);
      b.fill();
      b.save();
      rr(b, o.x, o.y, o.w, o.h, 8);
      b.clip();
      b.fillStyle = '#d8f2ff';
      b.beginPath();
      b.moveTo(o.x, o.y);
      b.lineTo(o.x + o.w, o.y);
      b.lineTo(o.x + o.w * 0.7, o.y + o.h * 0.35);
      b.lineTo(o.x + o.w * 0.25, o.y + o.h * 0.3);
      b.closePath();
      b.fill();
      b.fillStyle = '#7cc3ec';
      b.beginPath();
      b.moveTo(o.x, o.y + o.h);
      b.lineTo(o.x + o.w, o.y + o.h);
      b.lineTo(o.x + o.w * 0.75, o.y + o.h * 0.7);
      b.lineTo(o.x + o.w * 0.2, o.y + o.h * 0.75);
      b.closePath();
      b.fill();
      b.strokeStyle = 'rgba(255,255,255,.85)';
      b.lineWidth = 3;
      b.beginPath();
      b.moveTo(o.x + o.w * 0.18, o.y + o.h * 0.55);
      b.lineTo(o.x + o.w * 0.42, o.y + o.h * 0.42);
      b.stroke();
      b.restore();
      rr(b, o.x, o.y, o.w, o.h, 8);
      b.stroke();
    },

    snow(b, o) {
      shadowRect(b, o, o.h / 2);
      b.fillStyle = '#ffffff';
      b.strokeStyle = INK;
      b.lineWidth = 4;
      b.beginPath();
      const bumps = Math.max(2, Math.round(o.w / 26));
      b.moveTo(o.x, o.y + o.h);
      for (let i = 0; i < bumps; i++) {
        const x0 = o.x + (o.w / bumps) * i;
        const x1 = o.x + (o.w / bumps) * (i + 1);
        b.quadraticCurveTo((x0 + x1) / 2, o.y - 8, x1, o.y + o.h * 0.35);
      }
      b.lineTo(o.x + o.w, o.y + o.h);
      b.closePath();
      b.fill();
      b.stroke();
      b.fillStyle = '#cfe3f2';
      rr(b, o.x + 4, o.y + o.h - 9, o.w - 8, 6, 3);
      b.fill();
    },

    basalt(b, o) {
      shadowRect(b, o, 10);
      b.fillStyle = '#3a2f33';
      b.strokeStyle = INK;
      b.lineWidth = 4;
      rr(b, o.x, o.y, o.w, o.h, 10);
      b.fill();
      b.save();
      rr(b, o.x, o.y, o.w, o.h, 10);
      b.clip();
      b.strokeStyle = '#5c4b54';
      b.lineWidth = 2.5;
      const s = 16;
      for (let y = o.y - s; y < o.y + o.h + s; y += s * 1.5) {
        for (let x = o.x - s; x < o.x + o.w + s; x += s * 1.7) {
          const ox = ((y - o.y) / (s * 1.5)) % 2 ? s * 0.85 : 0;
          b.beginPath();
          for (let k = 0; k < 6; k++) {
            const a = (k / 6) * TAU + Math.PI / 6;
            const px = x + ox + Math.cos(a) * s * 0.9;
            const py = y + Math.sin(a) * s * 0.9;
            k ? b.lineTo(px, py) : b.moveTo(px, py);
          }
          b.closePath();
          b.stroke();
        }
      }
      b.strokeStyle = 'rgba(255, 122, 43, .8)';
      b.lineWidth = 2;
      b.beginPath();
      b.moveTo(o.x + o.w * 0.2, o.y + o.h * 0.8);
      b.lineTo(o.x + o.w * 0.45, o.y + o.h * 0.55);
      b.lineTo(o.x + o.w * 0.6, o.y + o.h * 0.65);
      b.stroke();
      b.fillStyle = 'rgba(255,255,255,.12)';
      b.fillRect(o.x, o.y, o.w, 6);
      b.restore();
    },

    machine(b, o) {
      shadowRect(b, o, 8);
      b.fillStyle = '#5c6c8e';
      b.strokeStyle = INK;
      b.lineWidth = 4;
      rr(b, o.x, o.y, o.w, o.h, 8);
      b.fill();
      b.stroke();
      b.fillStyle = '#46557a';
      rr(b, o.x + 8, o.y + 8, o.w - 16, o.h - 30, 4);
      b.fill();
      b.strokeStyle = 'rgba(255,255,255,.35)';
      b.lineWidth = 2;
      for (let y = o.y + 14; y < o.y + o.h - 26; y += 7) {
        b.beginPath();
        b.moveTo(o.x + 13, y);
        b.lineTo(o.x + o.w - 13, y);
        b.stroke();
      }
      for (const [dx, c] of [[0.32, '#4cd964'], [0.68, '#ff4d5e']]) {
        b.fillStyle = c;
        b.strokeStyle = INK;
        b.lineWidth = 2;
        circle(b, o.x + o.w * dx, o.y + o.h - 12, 4.5);
        b.fill();
        b.stroke();
      }
    },

    pipe(b, o) {
      shadowRect(b, o, o.w / 2);
      const g = b.createLinearGradient(o.x, 0, o.x + o.w, 0);
      g.addColorStop(0, '#6f8299');
      g.addColorStop(0.4, '#b9c8d8');
      g.addColorStop(1, '#6a7c92');
      b.fillStyle = g;
      b.strokeStyle = INK;
      b.lineWidth = 4;
      rr(b, o.x, o.y, o.w, o.h, o.w / 2);
      b.fill();
      b.stroke();
      b.fillStyle = '#5a6b80';
      for (let y = o.y + 20; y < o.y + o.h - 12; y += 32) {
        rr(b, o.x - 3, y, o.w + 6, 9, 3);
        b.fill();
        b.stroke();
      }
    },

    steel(b, o) {
      shadowRect(b, o, 6);
      b.fillStyle = '#b8c0cc';
      b.strokeStyle = INK;
      b.lineWidth = 4;
      rr(b, o.x, o.y, o.w, o.h, 6);
      b.fill();
      b.stroke();
      b.strokeStyle = '#8e97a6';
      b.lineWidth = 5;
      b.beginPath();
      b.moveTo(o.x + 8, o.y + 8); b.lineTo(o.x + o.w - 8, o.y + o.h - 8);
      b.moveTo(o.x + o.w - 8, o.y + 8); b.lineTo(o.x + 8, o.y + o.h - 8);
      b.stroke();
      b.strokeStyle = INK;
      b.lineWidth = 2.5;
      rr(b, o.x + 5, o.y + 5, o.w - 10, o.h - 10, 3);
      b.stroke();
    },

    neon(b, o, i) {
      const color = i % 2 === 0 ? '#3ff0ff' : '#ff4fd8';
      b.save();
      b.shadowColor = color;
      b.shadowBlur = 18;
      b.fillStyle = '#120a24';
      b.strokeStyle = color;
      b.lineWidth = 4;
      rr(b, o.x, o.y, o.w, o.h, 6);
      b.fill();
      b.stroke();
      b.shadowBlur = 0;
      b.strokeStyle = 'rgba(255,255,255,.75)';
      b.lineWidth = 1.5;
      rr(b, o.x + 4, o.y + 4, o.w - 8, o.h - 8, 3);
      b.stroke();
      b.restore();
    },

    pillar(b, o) {
      const cx = o.x + o.w / 2;
      const cy = o.y + o.h / 2;
      const r = o.w / 2;
      b.fillStyle = 'rgba(27,21,48,.24)';
      circle(b, cx + 5, cy + 8, r + 4);
      b.fill();
      b.fillStyle = '#c9c1ae';
      b.strokeStyle = INK;
      b.lineWidth = 4;
      circle(b, cx, cy, r + 4);
      b.fill();
      b.stroke();
      b.fillStyle = '#ddd6c4';
      circle(b, cx, cy, r - 6);
      b.fill();
      b.strokeStyle = '#a79f8c';
      b.lineWidth = 3;
      b.stroke();
      b.strokeStyle = 'rgba(27,21,48,.35)';
      b.lineWidth = 2;
      b.beginPath();
      b.moveTo(cx - 6, cy - r + 4); b.lineTo(cx - 1, cy - 4); b.lineTo(cx + 5, cy + 2);
      b.stroke();
      b.fillStyle = '#5f9a4f';
      circle(b, cx + r - 2, cy + r - 8, 6);
      b.fill();
      circle(b, cx + r - 10, cy + r - 2, 5);
      b.fill();
    },

    altar(b, o) {
      shadowRect(b, o, 14);
      b.fillStyle = '#b9b19c';
      b.strokeStyle = INK;
      b.lineWidth = 4;
      rr(b, o.x, o.y, o.w, o.h, 14);
      b.fill();
      b.stroke();
      b.strokeStyle = '#e8a40c';
      b.lineWidth = 3;
      rr(b, o.x + 8, o.y + 8, o.w - 16, o.h - 16, 8);
      b.stroke();
      const cx = o.x + o.w / 2;
      const cy = o.y + o.h / 2;
      b.strokeStyle = '#7c55d6';
      b.lineWidth = 3;
      circle(b, cx, cy, 20);
      b.stroke();
      b.beginPath();
      b.moveTo(cx, cy - 16); b.lineTo(cx + 14, cy + 10); b.lineTo(cx - 14, cy + 10);
      b.closePath();
      b.stroke();
      b.fillStyle = '#a66bff';
      circle(b, cx, cy + 2, 4);
      b.fill();
    },

    ruin(b, o) {
      shadowRect(b, o, 4);
      b.save();
      // Sudut yang runtuh.
      b.beginPath();
      b.moveTo(o.x, o.y);
      b.lineTo(o.x + o.w - 22, o.y);
      b.lineTo(o.x + o.w, o.y + 16);
      b.lineTo(o.x + o.w, o.y + o.h);
      b.lineTo(o.x, o.y + o.h);
      b.closePath();
      b.fillStyle = '#b0a893';
      b.fill();
      b.clip();
      b.strokeStyle = 'rgba(27,21,48,.45)';
      b.lineWidth = 2;
      const bh = o.h / 2;
      for (let row = 0; row < 2; row++) {
        const y = o.y + row * bh;
        b.beginPath(); b.moveTo(o.x, y); b.lineTo(o.x + o.w, y); b.stroke();
        for (let x = o.x + (row ? 15 : 30); x < o.x + o.w; x += 30) {
          b.beginPath(); b.moveTo(x, y); b.lineTo(x, y + bh); b.stroke();
        }
      }
      b.fillStyle = 'rgba(76, 140, 70, .7)';
      circle(b, o.x + 12, o.y + o.h - 4, 8);
      b.fill();
      b.restore();
      b.strokeStyle = INK;
      b.lineWidth = 4;
      b.beginPath();
      b.moveTo(o.x, o.y);
      b.lineTo(o.x + o.w - 22, o.y);
      b.lineTo(o.x + o.w, o.y + 16);
      b.lineTo(o.x + o.w, o.y + o.h);
      b.lineTo(o.x, o.y + o.h);
      b.closePath();
      b.stroke();
    },
  };

  // --------------------------------------------------- dasar zona (statis)
  const ZONE = {
    slow(b, z) {
      b.fillStyle = '#d2a35c';
      b.strokeStyle = 'rgba(122, 78, 30, .7)';
      b.lineWidth = 4;
      rr(b, z.x, z.y, z.w, z.h, Math.min(z.w, z.h) / 2.2);
      b.fill();
      b.stroke();
      b.save();
      rr(b, z.x, z.y, z.w, z.h, Math.min(z.w, z.h) / 2.2);
      b.clip();
      b.strokeStyle = 'rgba(150, 100, 45, .5)';
      b.lineWidth = 3;
      const cx = z.x + z.w / 2;
      const cy = z.y + z.h / 2;
      for (let k = 1; k <= 4; k++) {
        b.beginPath();
        b.ellipse(cx, cy, (z.w / 2) * (k / 4.4), (z.h / 2) * (k / 4.4), 0, 0, TAU);
        b.stroke();
      }
      b.fillStyle = 'rgba(110, 70, 30, .35)';
      b.beginPath();
      b.ellipse(cx, cy, z.w * 0.12, z.h * 0.12, 0, 0, TAU);
      b.fill();
      b.restore();
    },

    ice(b, z) {
      const r = 46;
      b.fillStyle = '#b5e3fb';
      rr(b, z.x, z.y, z.w, z.h, r);
      b.fill();
      b.save();
      rr(b, z.x, z.y, z.w, z.h, r);
      b.clip();
      b.strokeStyle = 'rgba(255,255,255,.75)';
      b.lineWidth = 10;
      for (let x = z.x - z.h; x < z.x + z.w; x += 90) {
        b.beginPath();
        b.moveTo(x, z.y + z.h);
        b.lineTo(x + z.h * 0.6, z.y);
        b.stroke();
      }
      b.strokeStyle = 'rgba(80, 150, 200, .45)';
      b.lineWidth = 2;
      const rand = seeded(5);
      for (let i = 0; i < 7; i++) {
        let x = z.x + rand() * z.w;
        let y = z.y + rand() * z.h;
        b.beginPath();
        b.moveTo(x, y);
        for (let k = 0; k < 3; k++) {
          x += (rand() - 0.5) * 50;
          y += (rand() - 0.5) * 50;
          b.lineTo(x, y);
        }
        b.stroke();
      }
      b.restore();
      b.strokeStyle = '#5aa9d6';
      b.lineWidth = 5;
      rr(b, z.x, z.y, z.w, z.h, r);
      b.stroke();
    },

    lava(b, z) {
      const r = Math.min(z.w, z.h) > 80 ? 40 : 18;
      b.strokeStyle = '#2a1d22';
      b.lineWidth = 12;
      rr(b, z.x, z.y, z.w, z.h, r);
      b.stroke();
      const g = b.createLinearGradient(z.x, z.y, z.x + z.w, z.y + z.h);
      g.addColorStop(0, '#ff8a1f');
      g.addColorStop(1, '#ff4a12');
      b.fillStyle = g;
      b.fill();
      b.save();
      rr(b, z.x, z.y, z.w, z.h, r);
      b.clip();
      b.fillStyle = 'rgba(255, 210, 63, .55)';
      const rand = seeded(hashRect(z));
      for (let i = 0; i < Math.max(4, (z.w * z.h) / 1800); i++) {
        b.beginPath();
        b.ellipse(z.x + rand() * z.w, z.y + rand() * z.h, 6 + rand() * 12, 4 + rand() * 7, rand() * 3, 0, TAU);
        b.fill();
      }
      b.restore();
      b.strokeStyle = INK;
      b.lineWidth = 3;
      rr(b, z.x - 6, z.y - 6, z.w + 12, z.h + 12, r + 6);
      b.stroke();
    },

    conveyor(b, z) {
      b.fillStyle = 'rgba(27,21,48,.25)';
      b.fillRect(z.x + 4, z.y + 7, z.w, z.h);
      b.fillStyle = '#3a3e4a';
      b.fillRect(z.x, z.y, z.w, z.h);
      b.strokeStyle = '#2b2e37';
      b.lineWidth = 2;
      const horizontal = z.w >= z.h;
      if (horizontal) {
        for (let x = z.x + 10; x < z.x + z.w; x += 16) {
          b.beginPath(); b.moveTo(x, z.y + 8); b.lineTo(x, z.y + z.h - 8); b.stroke();
        }
      } else {
        for (let y = z.y + 10; y < z.y + z.h; y += 16) {
          b.beginPath(); b.moveTo(z.x + 8, y); b.lineTo(z.x + z.w - 8, y); b.stroke();
        }
      }
      // Rel kuning-hitam di sisi panjang.
      const rails = horizontal
        ? [[z.x, z.y - 6, z.w, 8], [z.x, z.y + z.h - 2, z.w, 8]]
        : [[z.x - 6, z.y, 8, z.h], [z.x + z.w - 2, z.y, 8, z.h]];
      for (const [x, y, w, h] of rails) {
        b.save();
        b.beginPath();
        b.rect(x, y, w, h);
        b.clip();
        b.fillStyle = '#ffd23f';
        b.fillRect(x, y, w, h);
        b.fillStyle = INK;
        for (let k = -20; k < Math.max(w, h) + 20; k += 16) {
          b.beginPath();
          if (horizontal) { b.moveTo(x + k, y); b.lineTo(x + k + 8, y); b.lineTo(x + k, y + h); b.lineTo(x + k - 8, y + h); }
          else { b.moveTo(x, y + k); b.lineTo(x, y + k + 8); b.lineTo(x + w, y + k); b.lineTo(x + w, y + k - 8); }
          b.closePath();
          b.fill();
        }
        b.restore();
      }
      // Roller di ujung.
      b.fillStyle = '#8f98ab';
      b.strokeStyle = INK;
      b.lineWidth = 3;
      const ends = horizontal ? [[z.x, z.y + z.h / 2], [z.x + z.w, z.y + z.h / 2]] : [[z.x + z.w / 2, z.y], [z.x + z.w / 2, z.y + z.h]];
      for (const [x, y] of ends) {
        circle(b, x, y, (horizontal ? z.h : z.w) / 2);
        b.fill();
        b.stroke();
        circle(b, x, y, 6);
        b.stroke();
      }
      b.strokeStyle = INK;
      b.lineWidth = 3;
      b.strokeRect(z.x, z.y, z.w, z.h);
    },
  };

  function paintPortalBase(b, e) {
    b.fillStyle = 'rgba(27,21,48,.24)';
    circle(b, e.x + 4, e.y + 7, 36);
    b.fill();
    b.fillStyle = '#8f8a7a';
    b.strokeStyle = INK;
    b.lineWidth = 4;
    circle(b, e.x, e.y, 36);
    b.fill();
    b.stroke();
    b.fillStyle = '#6f6a5c';
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU;
      circle(b, e.x + Math.cos(a) * 31, e.y + Math.sin(a) * 31, 3);
      b.fill();
    }
    b.fillStyle = '#20143a';
    circle(b, e.x, e.y, 27);
    b.fill();
    b.stroke();
  }

  function paintRail(b, m) {
    const horizontal = (m.ax || 0) >= (m.ay || 0);
    b.fillStyle = '#5b616e';
    b.strokeStyle = INK;
    b.lineWidth = 3;
    if (horizontal) rr(b, m.x - m.ax, m.y + m.h / 2 - 9, m.w + m.ax * 2, 18, 9);
    else rr(b, m.x + m.w / 2 - 9, m.y - m.ay, 18, m.h + m.ay * 2, 9);
    b.fill();
    b.stroke();
    b.strokeStyle = 'rgba(255,255,255,.2)';
    b.lineWidth = 2;
    b.beginPath();
    if (horizontal) { b.moveTo(m.x - m.ax + 8, m.y + m.h / 2); b.lineTo(m.x + m.w + m.ax - 8, m.y + m.h / 2); }
    else { b.moveTo(m.x + m.w / 2, m.y - m.ay + 8); b.lineTo(m.x + m.w / 2, m.y + m.h + m.ay - 8); }
    b.stroke();
  }

  function paintFrame(b, map) {
    const neon = map.id === 'neon';
    b.save();
    if (neon) {
      b.shadowColor = '#ff4fd8';
      b.shadowBlur = 16;
    }
    b.strokeStyle = neon ? '#ff4fd8' : map.id === 'volcano' ? '#1a1115' : INK;
    b.lineWidth = 10;
    rr(b, 5, 5, W - 10, H - 10, 22);
    b.stroke();
    b.restore();
    b.strokeStyle = neon ? 'rgba(63, 240, 255, .6)' : 'rgba(255, 255, 255, .35)';
    b.lineWidth = 3;
    rr(b, 13, 13, W - 26, H - 26, 16);
    b.stroke();
  }

  function buildBackground(map) {
    const bg = document.createElement('canvas');
    bg.width = W;
    bg.height = H;
    const b = bg.getContext('2d');
    b.lineJoin = 'round';
    (GROUND[map.id] || GROUND.meadow)(b, map);
    for (const m of map.movers) paintRail(b, m);
    for (const z of map.zones) if (ZONE[z.type]) ZONE[z.type](b, z);
    for (const p of map.portals) {
      paintPortalBase(b, p.a);
      paintPortalBase(b, p.b);
    }
    map.obstacles.forEach((o, i) => (OBSTACLE[o.kind] || OBSTACLE.crate)(b, o, i));
    paintFrame(b, map);
    return bg;
  }

  // ------------------------------------------------- efek animasi per frame
  function drawFx(ctx, map, now) {
    const t = now / 1000;
    for (const z of map.zones) {
      if (z.type === 'slow') {
        // Pusaran pasir berputar pelan.
        const cx = z.x + z.w / 2;
        const cy = z.y + z.h / 2;
        ctx.save();
        rr(ctx, z.x, z.y, z.w, z.h, Math.min(z.w, z.h) / 2.2);
        ctx.clip();
        ctx.translate(cx, cy);
        ctx.scale(z.w / z.h, 1);
        ctx.strokeStyle = 'rgba(120, 76, 30, .45)';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        for (let k = 0; k < 3; k++) {
          const r = (z.h / 2) * (0.3 + k * 0.22);
          const a = t * (0.8 - k * 0.15) + k * 2;
          ctx.beginPath();
          ctx.arc(0, 0, r, a, a + 1.6);
          ctx.stroke();
        }
        ctx.restore();
      } else if (z.type === 'ice') {
        // Kilau es berkedip.
        const rand = seeded(hashRect(z) + 3);
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 14; i++) {
          const x = z.x + 20 + rand() * (z.w - 40);
          const y = z.y + 20 + rand() * (z.h - 40);
          const a = Math.max(0, Math.sin(t * 2.2 + i * 1.7));
          if (a < 0.2) continue;
          const s = 2 + a * 5;
          ctx.globalAlpha = a;
          ctx.beginPath();
          ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.3, y - s * 0.3); ctx.lineTo(x + s, y);
          ctx.lineTo(x + s * 0.3, y + s * 0.3); ctx.lineTo(x, y + s); ctx.lineTo(x - s * 0.3, y + s * 0.3);
          ctx.lineTo(x - s, y); ctx.lineTo(x - s * 0.3, y - s * 0.3);
          ctx.closePath();
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      } else if (z.type === 'lava') {
        const r = Math.min(z.w, z.h) > 80 ? 40 : 18;
        ctx.save();
        rr(ctx, z.x, z.y, z.w, z.h, r);
        ctx.clip();
        ctx.globalAlpha = 0.18 + Math.sin(t * 2.4 + z.x) * 0.1;
        ctx.fillStyle = '#ffe066';
        ctx.fillRect(z.x, z.y, z.w, z.h);
        ctx.globalAlpha = 1;
        // Gelembung yang membesar lalu pecah.
        const rand = seeded(hashRect(z) + 9);
        const n = Math.max(3, Math.round((z.w * z.h) / 3500));
        for (let i = 0; i < n; i++) {
          const bx = z.x + 10 + rand() * (z.w - 20);
          const by = z.y + 10 + rand() * (z.h - 20);
          const phase = (t * 0.55 + rand()) % 1;
          const br = 2 + phase * 9;
          ctx.globalAlpha = phase < 0.85 ? 0.9 : (1 - phase) / 0.15;
          ctx.fillStyle = '#ff9a2b';
          ctx.strokeStyle = '#ffd23f';
          ctx.lineWidth = 2;
          circle(ctx, bx, by, br);
          ctx.fill();
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.restore();
      } else if (z.type === 'conveyor') {
        // Panah bergerak searah dorongan.
        const horizontal = z.w >= z.h;
        const gap = 44;
        const off = ((t * 120) % gap + gap) % gap;
        ctx.save();
        ctx.beginPath();
        ctx.rect(z.x, z.y, z.w, z.h);
        ctx.clip();
        ctx.strokeStyle = 'rgba(255, 210, 63, .85)';
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        const s = 10;
        if (horizontal) {
          const cy = z.y + z.h / 2;
          for (let x = z.x - gap; x < z.x + z.w + gap; x += gap) {
            const px = z.dx > 0 ? x + off : x - off + gap;
            ctx.beginPath();
            ctx.moveTo(px - s * z.dx, cy - s);
            ctx.lineTo(px, cy);
            ctx.lineTo(px - s * z.dx, cy + s);
            ctx.stroke();
          }
        } else {
          const cx = z.x + z.w / 2;
          for (let y = z.y - gap; y < z.y + z.h + gap; y += gap) {
            const py = z.dy > 0 ? y + off : y - off + gap;
            ctx.beginPath();
            ctx.moveTo(cx - s, py - s * z.dy);
            ctx.lineTo(cx, py);
            ctx.lineTo(cx + s, py - s * z.dy);
            ctx.stroke();
          }
        }
        ctx.restore();
      }
    }

    // Dinding neon berdenyut.
    if (map.id === 'neon') {
      ctx.save();
      map.obstacles.forEach((o, i) => {
        const color = i % 2 === 0 ? '#3ff0ff' : '#ff4fd8';
        ctx.globalAlpha = 0.25 + Math.max(0, Math.sin(t * 2 + i * 0.9)) * 0.55;
        ctx.shadowColor = color;
        ctx.shadowBlur = 22;
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        rr(ctx, o.x - 2, o.y - 2, o.w + 4, o.h + 4, 7);
        ctx.stroke();
      });
      ctx.restore();
    }

    // Portal berputar.
    map.portals.forEach((pair, pi) => {
      for (const [e, dir] of [[pair.a, 1], [pair.b, -1]]) {
        ctx.save();
        ctx.translate(e.x, e.y);
        const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 26);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(0.35, pair.color);
        g.addColorStop(1, 'rgba(32, 20, 58, 0)');
        ctx.globalAlpha = 0.75 + Math.sin(t * 3 + pi) * 0.15;
        ctx.fillStyle = g;
        circle(ctx, 0, 0, 26);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.rotate(t * 2.6 * dir);
        ctx.strokeStyle = pair.color;
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        for (let k = 0; k < 3; k++) {
          ctx.beginPath();
          ctx.arc(0, 0, 10 + k * 5, (k / 3) * TAU, (k / 3) * TAU + 2.2);
          ctx.stroke();
        }
        ctx.fillStyle = '#ffffff';
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * TAU;
          circle(ctx, Math.cos(a) * 22, Math.sin(a) * 22, 2.2);
          ctx.fill();
        }
        ctx.restore();
      }
    });
  }

  // Rintangan bergerak (mesin press).
  function drawMovers(ctx, movers) {
    for (const m of movers || []) {
      ctx.fillStyle = 'rgba(27,21,48,.28)';
      rr(ctx, m.x + 5, m.y + 8, m.w, m.h, 8);
      ctx.fill();
      ctx.save();
      rr(ctx, m.x, m.y, m.w, m.h, 8);
      ctx.clip();
      ctx.fillStyle = '#ffcf3f';
      ctx.fillRect(m.x, m.y, m.w, m.h);
      ctx.fillStyle = INK;
      for (let k = -m.h; k < m.w + m.h; k += 22) {
        ctx.beginPath();
        ctx.moveTo(m.x + k, m.y);
        ctx.lineTo(m.x + k + 11, m.y);
        ctx.lineTo(m.x + k + 11 - m.h, m.y + m.h);
        ctx.lineTo(m.x + k - m.h, m.y + m.h);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = '#7a8fa6';
      rr(ctx, m.x + 8, m.y + 8, m.w - 16, m.h - 16, 5);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.35)';
      ctx.fillRect(m.x + 10, m.y + 10, m.w - 20, 5);
      ctx.restore();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 4;
      rr(ctx, m.x, m.y, m.w, m.h, 8);
      ctx.stroke();
    }
  }

  // Semak digambar di atas tank supaya tank di dalamnya tertutup daun.
  function drawBushes(ctx, map, now) {
    const bushes = map.zones.filter((z) => z.type === 'bush');
    if (!bushes.length) return;
    const t = now / 1000;
    for (const z of bushes) {
      const rand = seeded(hashRect(z));
      const blobs = [];
      const cols = Math.max(2, Math.round(z.w / 34));
      const rows = Math.max(2, Math.round(z.h / 34));
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = z.x + ((c + 0.5) / cols) * z.w + (rand() - 0.5) * 8;
          const y = z.y + ((r + 0.5) / rows) * z.h + (rand() - 0.5) * 8;
          blobs.push({ x, y, r: 17 + rand() * 7, s: rand() * TAU });
        }
      }
      const sway = (bl) => Math.sin(t * 1.6 + bl.s) * 1.5;
      ctx.fillStyle = INK;
      for (const bl of blobs) {
        circle(ctx, bl.x + sway(bl), bl.y, bl.r + 3.5);
        ctx.fill();
      }
      ctx.fillStyle = '#3d9b3f';
      for (const bl of blobs) {
        circle(ctx, bl.x + sway(bl), bl.y, bl.r);
        ctx.fill();
      }
      ctx.fillStyle = '#5cc25a';
      for (const bl of blobs) {
        circle(ctx, bl.x + sway(bl) - bl.r * 0.25, bl.y - bl.r * 0.3, bl.r * 0.55);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,255,255,.35)';
      for (const bl of blobs) {
        circle(ctx, bl.x + sway(bl) - bl.r * 0.35, bl.y - bl.r * 0.45, bl.r * 0.18);
        ctx.fill();
      }
      ctx.fillStyle = '#ff4d5e';
      for (let i = 0; i < blobs.length; i += 3) {
        const bl = blobs[i];
        circle(ctx, bl.x + sway(bl) + bl.r * 0.3, bl.y + bl.r * 0.25, 3);
        ctx.fill();
      }
    }
  }

  // Pratinjau kecil (data URL) untuk kartu acak arena. Disimpan di cache.
  const previewCache = new Map();
  function preview(mapId, width) {
    const w = width || 280;
    const key = `${mapId}|${w}`;
    if (previewCache.has(key)) return previewCache.get(key);
    const map = root.TankMaps.get(mapId);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = Math.round((w * H) / W);
    const x = c.getContext('2d');
    x.drawImage(buildBackground(map), 0, 0, c.width, c.height);
    x.save();
    x.scale(c.width / W, c.height / H);
    drawFx(x, map, 1200);
    drawMovers(x, map.movers.map((m) => ({ x: m.x, y: m.y, w: m.w, h: m.h })));
    drawBushes(x, map, 0);
    x.restore();
    const url = c.toDataURL('image/png');
    previewCache.set(key, url);
    return url;
  }

  root.TankArt = { buildBackground, drawFx, drawMovers, drawBushes, preview };
})(window);
