// Logika game. Tidak ada dependensi I/O di sini.
// Dipakai di layar TV, mode main di HP, dan server Node (opsional).
(function (root) {
'use strict';

const Maps = root.TankMaps || (typeof require === 'function' ? require('./maps.js') : null);

const WORLD = { width: 1000, height: 700 };
const TANK_RADIUS = 18;
const TANK_SPEED = 170; // px per detik
const BULLET_SPEED = 560; // px per detik
const BULLET_LIFE = 1.5; // detik
const BULLET_RADIUS = 6;
const FIRE_COOLDOWN = 1.2; // detik
const SHOT_BUFFER = 0.35; // detik: tembakan sedikit lebih awal dari cooldown tetap diterima
const MAX_HP = 100;
const BULLET_DAMAGE = 50; // 2 tembakan = 1 nyawa
const RESPAWN_TIME = 3; // detik
const SPAWN_SHIELD = 1.2; // detik kebal setelah respawn
const MAX_LIVES = 3;
const DASH_DISTANCE = 120;
const DASH_COOLDOWN = 2;
const DASH_STEPS = 8;
const MAX_PLAYERS = 4;
const AUTO_AIM_RANGE = 860; // kira-kira jarak tempuh peluru (560 x 1.5)

// Efek peta
const SLOW_MUL = 0.45; // kecepatan di pasir hisap
const ICE_GRIP = 1.8; // makin kecil makin licin
const CONVEYOR_SPEED = 120; // px per detik
const LAVA_DPS = 34; // HP per detik
const PORTAL_R = 24;
const BUSH_REVEAL = 120; // musuh di semak tetap terkunci kalau sedekat ini
const MAX_BOUNCES = 2;

const PLAYER_COLORS = ['#ff4d5e', '#3fa9ff', '#4cd964', '#ffd23f'];

function emptyInput() {
  return { mx: 0, my: 0, ax: 0, ay: 0, aiming: false, fire: false, dash: false, shot: null, sx: 0, sy: 0 };
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function inRect(x, y, r, pad) {
  const p = pad || 0;
  return x >= r.x - p && x <= r.x + r.w + p && y >= r.y - p && y <= r.y + r.h + p;
}

function createGame(mapId) {
  const map = Maps.get(mapId);
  const game = {
    map,
    mapId: map.id,
    time: 0,
    players: new Map(), // id -> player
    bullets: [],
    nextBulletId: 1,
    movers: [],
    solids: map.obstacles,
  };
  updateMovers(game);
  return game;
}

// Posisi rintangan bergerak mengikuti gelombang sinus.
function updateMovers(game) {
  const list = game.map.movers;
  if (!list.length) return;
  game.movers = list.map((m) => {
    const s = Math.sin((game.time / m.period + (m.phase || 0)) * Math.PI * 2);
    return { x: m.x + s * (m.ax || 0), y: m.y + s * (m.ay || 0), w: m.w, h: m.h, kind: m.kind };
  });
  game.solids = game.map.obstacles.concat(game.movers);
}

function zoneAt(game, type, x, y) {
  for (const z of Maps.zones(game.map, type)) if (inRect(x, y, z)) return z;
  return null;
}

function solidAt(game, x, y) {
  for (const r of game.solids) if (inRect(x, y, r)) return r;
  return null;
}

// Titik keluar portal jika (x, y) berada di salah satu mulut portal.
function portalAt(game, x, y, r) {
  for (const pair of game.map.portals) {
    if (Math.hypot(x - pair.a.x, y - pair.a.y) < r) return pair.b;
    if (Math.hypot(x - pair.b.x, y - pair.b.y) < r) return pair.a;
  }
  return null;
}

function spawnPoint(game, index) {
  const list = game.map.spawns;
  return { ...list[index % list.length] };
}

// slot opsional: dipakai supaya warna dan posisi awal pemain tetap sama antar ronde.
function addPlayer(game, id, name, slot) {
  if (game.players.size >= MAX_PLAYERS) return null;
  const used = new Set([...game.players.values()].map((p) => p.slot));
  if (!(Number.isInteger(slot) && slot >= 0 && slot < MAX_PLAYERS && !used.has(slot))) {
    slot = 0;
    while (used.has(slot)) slot++;
  }

  const pos = spawnPoint(game, slot);
  const player = {
    id,
    name: (name || `Pemain ${slot + 1}`).toString().slice(0, 12),
    slot,
    color: PLAYER_COLORS[slot],
    x: pos.x,
    y: pos.y,
    vx: 0,
    vy: 0,
    angle: Math.atan2(WORLD.height / 2 - pos.y, WORLD.width / 2 - pos.x),
    hp: MAX_HP,
    lives: MAX_LIVES,
    kills: 0,
    deaths: 0,
    alive: true,
    eliminated: false,
    respawnIn: 0,
    shield: SPAWN_SHIELD,
    cooldown: 0,
    dashCooldown: 0,
    lastDash: false,
    lastShot: null, // nilai `shot` terakhir yang sudah diproses
    pendingShot: null, // tembakan yang menunggu cooldown habis
    inPortal: false,
    hidden: false,
    burning: false,
    input: emptyInput(),
  };
  game.players.set(id, player);
  return player;
}

function removePlayer(game, id) {
  game.players.delete(id);
}

function setInput(game, id, input) {
  const p = game.players.get(id);
  if (!p) return;
  const shot = Number.isInteger(input.shot) ? input.shot : null;
  p.input = {
    mx: clamp(Number(input.mx) || 0, -1, 1),
    my: clamp(Number(input.my) || 0, -1, 1),
    ax: clamp(Number(input.ax) || 0, -1, 1),
    ay: clamp(Number(input.ay) || 0, -1, 1),
    aiming: !!input.aiming,
    fire: !!input.fire,
    dash: !!input.dash,
    shot,
    sx: clamp(Number(input.sx) || 0, -1, 1),
    sy: clamp(Number(input.sy) || 0, -1, 1),
  };
  // Input pertama dari HP: catat penghitung tembakan tanpa langsung menembak.
  if (p.lastShot === null && shot !== null) p.lastShot = shot;
}

// Dorong lingkaran (tank) keluar dari kotak rintangan.
function resolveCircleRect(x, y, r, rect) {
  const cx = clamp(x, rect.x, rect.x + rect.w);
  const cy = clamp(y, rect.y, rect.y + rect.h);
  const dx = x - cx;
  const dy = y - cy;
  const distSq = dx * dx + dy * dy;
  if (distSq >= r * r) return { x, y };
  if (distSq === 0) {
    const left = x - rect.x;
    const right = rect.x + rect.w - x;
    const top = y - rect.y;
    const bottom = rect.y + rect.h - y;
    const min = Math.min(left, right, top, bottom);
    if (min === left) return { x: rect.x - r, y };
    if (min === right) return { x: rect.x + rect.w + r, y };
    if (min === top) return { x, y: rect.y - r };
    return { x, y: rect.y + rect.h + r };
  }
  const dist = Math.sqrt(distSq);
  const push = r - dist;
  return { x: x + (dx / dist) * push, y: y + (dy / dist) * push };
}

function moveTank(game, x, y, dx, dy) {
  let nx = clamp(x + dx, TANK_RADIUS, WORLD.width - TANK_RADIUS);
  let ny = clamp(y + dy, TANK_RADIUS, WORLD.height - TANK_RADIUS);
  for (const rect of game.solids) {
    const res = resolveCircleRect(nx, ny, TANK_RADIUS, rect);
    nx = res.x;
    ny = res.y;
  }
  nx = clamp(nx, TANK_RADIUS, WORLD.width - TANK_RADIUS);
  ny = clamp(ny, TANK_RADIUS, WORLD.height - TANK_RADIUS);
  return { x: nx, y: ny };
}

// Cek apakah garis dari (x1,y1) ke (x2,y2) tidak tertutup rintangan.
function hasLineOfSight(game, x1, y1, x2, y2) {
  const dist = Math.hypot(x2 - x1, y2 - y1);
  const steps = Math.ceil(dist / 10);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (solidAt(game, x1 + (x2 - x1) * t, y1 + (y2 - y1) * t)) return false;
  }
  return true;
}

// Musuh terdekat; yang terlihat langsung (tidak tertutup rintangan) diutamakan.
// Musuh di dalam semak diabaikan kecuali sangat dekat.
function nearestEnemy(game, me, range) {
  let best = null;
  let bestScore = Infinity;
  for (const p of game.players.values()) {
    if (p.id === me.id || !p.alive) continue;
    const d = Math.hypot(p.x - me.x, p.y - me.y);
    if (range && d > range) continue;
    if (p.hidden && d > BUSH_REVEAL) continue;
    const score = d + (hasLineOfSight(game, me.x, me.y, p.x, p.y) ? 0 : 10000);
    if (score < bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best;
}

function autoAimAngle(game, p) {
  const target = nearestEnemy(game, p, AUTO_AIM_RANGE);
  return target ? Math.atan2(target.y - p.y, target.x - p.x) : p.angle;
}

function spawnBullet(game, owner, angle) {
  game.bullets.push({
    id: game.nextBulletId++,
    ownerId: owner.id,
    x: owner.x + Math.cos(angle) * (TANK_RADIUS + 10),
    y: owner.y + Math.sin(angle) * (TANK_RADIUS + 10),
    vx: Math.cos(angle) * BULLET_SPEED,
    vy: Math.sin(angle) * BULLET_SPEED,
    life: game.map.bulletLife || BULLET_LIFE,
    bounces: game.map.bounce ? MAX_BOUNCES : 0,
    bounced: false,
    inPortal: false,
  });
}

function killPlayer(game, p, killerId, cause, events) {
  p.hp = 0;
  p.alive = false;
  p.deaths++;
  p.lives--;
  p.respawnIn = p.lives > 0 ? RESPAWN_TIME : 0;
  p.eliminated = p.lives <= 0;
  p.vx = 0;
  p.vy = 0;
  p.burning = false;
  p.hidden = false;
  p.pendingShot = null;
  const killer = killerId && killerId !== p.id ? game.players.get(killerId) : null;
  if (killer) killer.kills++;
  events.push({ type: 'kill', killer: killerId, victim: p.id, cause, lives: p.lives, eliminated: p.eliminated });
  if (p.eliminated) events.push({ type: 'eliminated', id: p.id });
}

// Satu langkah simulasi. dt dalam detik.
function step(game, dt) {
  const events = [];
  game.time += dt;
  updateMovers(game);

  for (const p of game.players.values()) {
    p.dashCooldown = Math.max(0, p.dashCooldown - dt);
    p.cooldown = Math.max(0, p.cooldown - dt);
    p.shield = Math.max(0, p.shield - dt);
    const input = p.input;

    if (!p.alive) {
      if (!p.eliminated) {
        p.respawnIn -= dt;
        if (p.respawnIn <= 0 && p.lives > 0) {
          const pos = spawnPoint(game, p.slot);
          Object.assign(p, { x: pos.x, y: pos.y, vx: 0, vy: 0, hp: MAX_HP, alive: true, shield: SPAWN_SHIELD, inPortal: false });
          events.push({ type: 'respawn', id: p.id });
        }
      }
      p.lastDash = !!input.dash;
      if (input.shot !== null) p.lastShot = input.shot; // tembakan saat mati diabaikan
      p.pendingShot = null;
      continue;
    }

    const { mx, my, ax, ay, aiming, fire, dash } = input;
    const onIce = !!zoneAt(game, 'ice', p.x, p.y);
    const inSand = !!zoneAt(game, 'slow', p.x, p.y);
    const belt = zoneAt(game, 'conveyor', p.x, p.y);

    // Gerak: es memberi inersia, pasir hisap memperlambat, ban berjalan mendorong.
    const moveLen = Math.hypot(mx, my);
    let tx = 0;
    let ty = 0;
    if (moveLen > 0.05) {
      const k = Math.min(1, moveLen) / moveLen;
      const speed = TANK_SPEED * (inSand ? SLOW_MUL : 1);
      tx = mx * k * speed;
      ty = my * k * speed;
    }
    if (onIce) {
      const grip = 1 - Math.exp(-dt * ICE_GRIP);
      p.vx += (tx - p.vx) * grip;
      p.vy += (ty - p.vy) * grip;
    } else {
      p.vx = tx;
      p.vy = ty;
    }
    let ddx = p.vx * dt;
    let ddy = p.vy * dt;
    if (belt) {
      ddx += belt.dx * CONVEYOR_SPEED * dt;
      ddy += belt.dy * CONVEYOR_SPEED * dt;
    }
    // Selalu diselesaikan, supaya rintangan bergerak mendorong tank yang diam.
    const moved = moveTank(game, p.x, p.y, ddx, ddy);
    if (onIce) {
      // Menabrak tembok di atas es: memantul pelan.
      if (Math.abs(moved.x - p.x - ddx) > 0.5) p.vx = -p.vx * 0.4;
      if (Math.abs(moved.y - p.y - ddy) > 0.5) p.vy = -p.vy * 0.4;
    }
    p.x = moved.x;
    p.y = moved.y;

    // Arah laras: ikut bidikan saat membidik, kalau tidak ikut arah jalan.
    if (aiming && Math.hypot(ax, ay) > 0.2) {
      p.angle = Math.atan2(ay, ax);
    } else if (moveLen > 0.05) {
      p.angle = Math.atan2(my, mx);
    }

    if (dash && !p.lastDash && p.dashCooldown <= 0) {
      const dx = moveLen > 0.05 ? mx / moveLen : Math.cos(p.angle);
      const dy = moveLen > 0.05 ? my / moveLen : Math.sin(p.angle);
      for (let i = 0; i < DASH_STEPS; i++) {
        const m = moveTank(game, p.x, p.y, (dx * DASH_DISTANCE) / DASH_STEPS, (dy * DASH_DISTANCE) / DASH_STEPS);
        p.x = m.x;
        p.y = m.y;
      }
      if (onIce) {
        p.vx = dx * TANK_SPEED * 1.4;
        p.vy = dy * TANK_SPEED * 1.4;
      }
      p.dashCooldown = DASH_COOLDOWN;
      events.push({ type: 'dash', id: p.id });
    }
    p.lastDash = !!dash;

    // Portal: teleport saat masuk mulut portal; harus keluar dulu sebelum bisa teleport lagi.
    const exit = portalAt(game, p.x, p.y, PORTAL_R);
    if (exit && !p.inPortal) {
      events.push({ type: 'portal', id: p.id, fx: p.x, fy: p.y, tx: exit.x, ty: exit.y });
      p.x = exit.x;
      p.y = exit.y;
      p.inPortal = true;
    } else if (!exit) {
      p.inPortal = false;
    }

    p.hidden = !!zoneAt(game, 'bush', p.x, p.y);

    // Lava membakar HP (perisai spawn melindungi).
    p.burning = !!zoneAt(game, 'lava', p.x, p.y) && p.shield <= 0;
    if (p.burning) {
      p.hp -= LAVA_DPS * dt;
      if (p.hp <= 0) {
        killPlayer(game, p, null, 'lava', events);
        continue;
      }
    }

    // Tembakan sekali-lepas dari HP: `shot` naik satu setiap kali stik serang dilepas.
    // sx/sy = arah bidik; (0,0) berarti ketuk = bidik otomatis ke musuh terdekat.
    if (input.shot !== null && input.shot !== p.lastShot) {
      p.lastShot = input.shot;
      if (p.cooldown <= SHOT_BUFFER) {
        // Tembakan yang datang sedikit sebelum cooldown habis disimpan, lalu
        // ditembakkan begitu siap (jam HP dan TV berbeda sebesar jeda jaringan).
        p.pendingShot = { sx: input.sx, sy: input.sy, ttl: SHOT_BUFFER + 0.15 };
      } else {
        events.push({ type: 'dry', id: p.id });
      }
    }
    if (p.pendingShot) {
      p.pendingShot.ttl -= dt;
      if (p.pendingShot.ttl <= 0) p.pendingShot = null;
    }

    let shotAngle = null;
    if (p.cooldown <= 0 && p.pendingShot) {
      const s = p.pendingShot;
      p.pendingShot = null;
      shotAngle = Math.hypot(s.sx, s.sy) > 0.2 ? Math.atan2(s.sy, s.sx) : autoAimAngle(game, p);
    } else if (p.cooldown <= 0 && fire) {
      // Tahan tembak (keyboard, mouse, bot): menembak setiap cooldown habis.
      shotAngle = p.angle;
    }

    if (shotAngle !== null) {
      p.angle = shotAngle;
      spawnBullet(game, p, shotAngle);
      p.cooldown = FIRE_COOLDOWN;
      events.push({ type: 'fire', id: p.id, angle: shotAngle });
    }
  }

  // ------------------------------------------------------------- peluru
  for (const b of game.bullets) {
    const owner = game.players.get(b.ownerId);
    const color = owner ? owner.color : '#ffd23f';
    const px = b.x;
    const py = b.y;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    b.dead = false;

    // Tepi arena.
    if (b.x < 0 || b.x > WORLD.width) {
      if (b.bounces > 0) {
        b.vx = -b.vx;
        b.x = clamp(b.x, 0, WORLD.width);
        b.bounces--;
        b.bounced = true;
        events.push({ type: 'impact', x: b.x, y: b.y, kind: 'bounce', color });
      } else {
        b.dead = true;
        events.push({ type: 'impact', x: clamp(b.x, 0, WORLD.width), y: clamp(b.y, 0, WORLD.height), kind: 'wall', color });
      }
    }
    if (!b.dead && (b.y < 0 || b.y > WORLD.height)) {
      if (b.bounces > 0) {
        b.vy = -b.vy;
        b.y = clamp(b.y, 0, WORLD.height);
        b.bounces--;
        b.bounced = true;
        events.push({ type: 'impact', x: b.x, y: b.y, kind: 'bounce', color });
      } else {
        b.dead = true;
        events.push({ type: 'impact', x: clamp(b.x, 0, WORLD.width), y: clamp(b.y, 0, WORLD.height), kind: 'wall', color });
      }
    }

    // Rintangan.
    if (!b.dead) {
      const r = solidAt(game, b.x, b.y);
      if (r) {
        if (b.bounces > 0) {
          const insideX = px >= r.x && px <= r.x + r.w;
          const insideY = py >= r.y && py <= r.y + r.h;
          if (!insideX) b.vx = -b.vx;
          if (!insideY) b.vy = -b.vy;
          if (insideX && insideY) {
            b.vx = -b.vx;
            b.vy = -b.vy;
          }
          b.x = px;
          b.y = py;
          b.bounces--;
          b.bounced = true;
          events.push({ type: 'impact', x: b.x, y: b.y, kind: 'bounce', color });
        } else {
          b.dead = true;
          events.push({ type: 'impact', x: b.x, y: b.y, kind: 'wall', color });
        }
      }
    }

    // Portal juga memindahkan peluru.
    if (!b.dead && game.map.portals.length) {
      const exit = portalAt(game, b.x, b.y, PORTAL_R - 4);
      if (exit && !b.inPortal) {
        events.push({ type: 'portal', bullet: true, fx: b.x, fy: b.y, tx: exit.x, ty: exit.y, color });
        b.x = exit.x;
        b.y = exit.y;
        b.inPortal = true;
      } else if (!exit) {
        b.inPortal = false;
      }
    }
  }

  game.bullets = game.bullets.filter((b) => {
    if (b.dead) return false;
    const owner = game.players.get(b.ownerId);
    const color = owner ? owner.color : '#ffd23f';
    if (b.life <= 0) {
      events.push({ type: 'impact', x: b.x, y: b.y, kind: 'fizzle', color });
      return false;
    }

    for (const p of game.players.values()) {
      if (!p.alive) continue;
      // Peluru sendiri baru bisa kena setelah memantul.
      if (p.id === b.ownerId && !b.bounced) continue;
      if (Math.hypot(p.x - b.x, p.y - b.y) > TANK_RADIUS + BULLET_RADIUS) continue;
      if (p.shield > 0) {
        events.push({ type: 'impact', x: b.x, y: b.y, kind: 'shield', color });
        return false;
      }
      p.hp -= BULLET_DAMAGE;
      events.push({ type: 'impact', x: b.x, y: b.y, kind: 'tank', color, target: p.id });
      if (p.hp <= 0) killPlayer(game, p, b.ownerId, p.id === b.ownerId ? 'self' : 'bullet', events);
      return false;
    }
    return true;
  });

  return events;
}

const IDLE_INPUT = emptyInput();

// AI bot sederhana: kejar musuh terdekat, menyamping sambil membidik,
// menembak hanya saat lurus ke target dengan garis pandang bebas, dan menghindari lava.
function botInput(game, botId) {
  const me = game.players.get(botId);
  if (!me || !me.alive) return IDLE_INPUT;

  const target = nearestEnemy(game, me, 0);
  if (!target) return IDLE_INPUT;

  const dx = target.x - me.x;
  const dy = target.y - me.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;

  // Jaga jarak dan menyamping dengan arah tetap per bot.
  const side = me.slot % 2 === 0 ? 1 : -1;
  let mx = -uy * 0.6 * side;
  let my = ux * 0.6 * side;
  if (len > 260) {
    mx += ux;
    my += uy;
  } else if (len < 160) {
    mx -= ux;
    my -= uy;
  }

  // Hindari lava: sungai panjang dilewati lewat ujungnya (jembatan), kolam dijauhi.
  for (const z of Maps.zones(game.map, 'lava')) {
    const ahead = inRect(me.x + mx * 55, me.y + my * 55, z, 26);
    const inside = inRect(me.x, me.y, z, 12);
    if (!ahead && !inside) continue;
    const cx = z.x + z.w / 2;
    const cy = z.y + z.h / 2;
    let ex;
    let ey;
    if (z.h > z.w * 1.5) {
      // Sungai tegak: menuju ujung yang tidak menempel tepi arena.
      const endY = z.y <= 0 ? z.y + z.h + 40 : z.y + z.h >= WORLD.height ? z.y - 40 : (me.y < cy ? z.y - 40 : z.y + z.h + 40);
      ex = (me.x < cx ? -0.35 : 0.35);
      ey = Math.sign(endY - me.y);
    } else if (z.w > z.h * 1.5) {
      const endX = z.x <= 0 ? z.x + z.w + 40 : z.x + z.w >= WORLD.width ? z.x - 40 : (me.x < cx ? z.x - 40 : z.x + z.w + 40);
      ex = Math.sign(endX - me.x);
      ey = (me.y < cy ? -0.35 : 0.35);
    } else {
      ex = me.x - cx;
      ey = me.y - cy;
    }
    const l = Math.hypot(ex, ey) || 1;
    mx = (ex / l) * 1.2 + mx * 0.15;
    my = (ey / l) * 1.2 + my * 0.15;
  }

  const aimAngle = Math.atan2(dy, dx);
  const angleDiff = Math.abs(Math.atan2(Math.sin(aimAngle - me.angle), Math.cos(aimAngle - me.angle)));
  const canShoot = len < 600 && hasLineOfSight(game, me.x, me.y, target.x, target.y);

  return {
    mx: clamp(mx, -1, 1),
    my: clamp(my, -1, 1),
    ax: ux,
    ay: uy,
    aiming: true,
    fire: canShoot && angleDiff < 0.12,
    dash: false,
    shot: null,
    sx: 0,
    sy: 0,
  };
}

function snapshot(game) {
  const players = [];
  for (const p of game.players.values()) {
    players.push({
      id: p.id,
      name: p.name,
      color: p.color,
      slot: p.slot,
      x: Math.round(p.x),
      y: Math.round(p.y),
      angle: p.angle,
      hp: Math.max(0, Math.ceil(p.hp)),
      lives: p.lives,
      kills: p.kills,
      deaths: p.deaths,
      alive: p.alive,
      eliminated: p.eliminated,
      shield: p.shield > 0,
      hid: p.hidden,
      burn: p.burning,
      aim: p.input.aiming && p.input.shot !== null,
      respawnIn: Math.max(0, Math.ceil(p.respawnIn)),
      dashCooldown: Math.max(0, Math.ceil(p.dashCooldown * 10) / 10),
      fireCooldown: Math.max(0, Math.ceil(p.cooldown * 10) / 10),
    });
  }
  const bullets = game.bullets.map((b) => ({ id: b.id, x: Math.round(b.x), y: Math.round(b.y), vx: b.vx, vy: b.vy, o: b.ownerId }));
  return {
    world: WORLD,
    mapId: game.mapId,
    obstacles: game.map.obstacles,
    movers: game.movers.map((m) => ({ x: Math.round(m.x), y: Math.round(m.y), w: m.w, h: m.h, kind: m.kind })),
    players,
    bullets,
  };
}

const TankGame = {
  WORLD,
  TANK_RADIUS,
  MAX_PLAYERS,
  MAX_LIVES,
  MAX_HP,
  FIRE_COOLDOWN,
  DASH_COOLDOWN,
  PLAYER_COLORS,
  CONVEYOR_SPEED,
  createGame,
  addPlayer,
  removePlayer,
  setInput,
  step,
  snapshot,
  botInput,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = TankGame;
} else {
  root.TankGame = TankGame;
}
})(typeof window !== 'undefined' ? window : globalThis);
