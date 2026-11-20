// Logika game. Tidak ada dependensi I/O di sini.
// Dipakai di layar TV, mode main di HP, dan server Node (opsional).
(function (root) {
'use strict';

const WORLD = { width: 1000, height: 700 };
const TANK_RADIUS = 18;
const TANK_SPEED = 170; // px per detik
const BULLET_SPEED = 560; // px per detik
const BULLET_LIFE = 1.5; // detik
const BULLET_RADIUS = 6;
const FIRE_COOLDOWN = 1.2; // detik
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

// Rintangan berbentuk kotak: { x, y, w, h }
const OBSTACLES = [
  { x: 180, y: 140, w: 120, h: 40 },
  { x: 700, y: 520, w: 120, h: 40 },
  { x: 460, y: 300, w: 80, h: 100 },
  { x: 150, y: 480, w: 40, h: 120 },
  { x: 810, y: 150, w: 40, h: 120 },
];

const SPAWNS = [
  { x: 80, y: 80 },
  { x: WORLD.width - 80, y: WORLD.height - 80 },
  { x: WORLD.width - 80, y: 80 },
  { x: 80, y: WORLD.height - 80 },
];

const PLAYER_COLORS = ['#ff4d5e', '#3fa9ff', '#4cd964', '#ffd23f'];

function emptyInput() {
  return { mx: 0, my: 0, ax: 0, ay: 0, aiming: false, fire: false, dash: false, shot: null, sx: 0, sy: 0 };
}

function createGame() {
  return {
    players: new Map(), // id -> player
    bullets: [],
    nextBulletId: 1,
  };
}

function spawnPoint(index) {
  return { ...SPAWNS[index % SPAWNS.length] };
}

// slot opsional: dipakai supaya warna dan posisi awal pemain tetap sama antar ronde.
function addPlayer(game, id, name, slot) {
  if (game.players.size >= MAX_PLAYERS) return null;
  const used = new Set([...game.players.values()].map((p) => p.slot));
  if (!(Number.isInteger(slot) && slot >= 0 && slot < MAX_PLAYERS && !used.has(slot))) {
    slot = 0;
    while (used.has(slot)) slot++;
  }

  const pos = spawnPoint(slot);
  const player = {
    id,
    name: (name || `Pemain ${slot + 1}`).toString().slice(0, 12),
    slot,
    color: PLAYER_COLORS[slot],
    x: pos.x,
    y: pos.y,
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
    input: emptyInput(),
  };
  game.players.set(id, player);
  return player;
}

function removePlayer(game, id) {
  game.players.delete(id);
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
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

function moveTank(x, y, dx, dy) {
  let nx = clamp(x + dx, TANK_RADIUS, WORLD.width - TANK_RADIUS);
  let ny = clamp(y + dy, TANK_RADIUS, WORLD.height - TANK_RADIUS);
  for (const rect of OBSTACLES) {
    const res = resolveCircleRect(nx, ny, TANK_RADIUS, rect);
    nx = res.x;
    ny = res.y;
  }
  return { x: nx, y: ny };
}

function hitsRect(x, y, rect) {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

// Cek apakah garis dari (x1,y1) ke (x2,y2) tidak tertutup rintangan.
function hasLineOfSight(x1, y1, x2, y2) {
  const dist = Math.hypot(x2 - x1, y2 - y1);
  const steps = Math.ceil(dist / 10);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = x1 + (x2 - x1) * t;
    const y = y1 + (y2 - y1) * t;
    if (OBSTACLES.some((r) => hitsRect(x, y, r))) return false;
  }
  return true;
}

// Musuh terdekat; yang terlihat langsung (tidak tertutup peti) diutamakan.
function nearestEnemy(game, me, range) {
  let best = null;
  let bestScore = Infinity;
  for (const p of game.players.values()) {
    if (p.id === me.id || !p.alive) continue;
    const d = Math.hypot(p.x - me.x, p.y - me.y);
    if (range && d > range) continue;
    const score = d + (hasLineOfSight(me.x, me.y, p.x, p.y) ? 0 : 10000);
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
    life: BULLET_LIFE,
  });
}

// Satu langkah simulasi. dt dalam detik.
function step(game, dt) {
  const events = [];

  for (const p of game.players.values()) {
    p.dashCooldown = Math.max(0, p.dashCooldown - dt);
    p.cooldown = Math.max(0, p.cooldown - dt);
    p.shield = Math.max(0, p.shield - dt);
    const input = p.input;

    if (!p.alive) {
      if (!p.eliminated) {
        p.respawnIn -= dt;
        if (p.respawnIn <= 0 && p.lives > 0) {
          const pos = spawnPoint(p.slot);
          Object.assign(p, { x: pos.x, y: pos.y, hp: MAX_HP, alive: true, shield: SPAWN_SHIELD });
          events.push({ type: 'respawn', id: p.id });
        }
      }
      p.lastDash = !!input.dash;
      if (input.shot !== null) p.lastShot = input.shot; // tembakan saat mati diabaikan
      continue;
    }

    const { mx, my, ax, ay, aiming, fire, dash } = input;

    const moveLen = Math.hypot(mx, my);
    if (moveLen > 0.05) {
      const k = Math.min(1, moveLen) / moveLen;
      const moved = moveTank(p.x, p.y, mx * k * TANK_SPEED * dt, my * k * TANK_SPEED * dt);
      p.x = moved.x;
      p.y = moved.y;
    }

    // Arah laras: ikut bidikan saat membidik, kalau tidak ikut arah jalan.
    if (aiming && Math.hypot(ax, ay) > 0.2) {
      p.angle = Math.atan2(ay, ax);
    } else if (moveLen > 0.05) {
      p.angle = Math.atan2(my, mx);
    }

    if (dash && !p.lastDash && p.dashCooldown <= 0) {
      let dx = moveLen > 0.05 ? mx / moveLen : Math.cos(p.angle);
      let dy = moveLen > 0.05 ? my / moveLen : Math.sin(p.angle);
      for (let i = 0; i < DASH_STEPS; i++) {
        const moved = moveTank(p.x, p.y, (dx * DASH_DISTANCE) / DASH_STEPS, (dy * DASH_DISTANCE) / DASH_STEPS);
        p.x = moved.x;
        p.y = moved.y;
      }
      p.dashCooldown = DASH_COOLDOWN;
      events.push({ type: 'dash', id: p.id });
    }
    p.lastDash = !!dash;

    // Tembakan sekali-lepas dari HP: `shot` naik satu setiap kali stik serang dilepas.
    // sx/sy = arah bidik; (0,0) berarti ketuk = bidik otomatis ke musuh terdekat.
    let wantShot = false;
    let shotAngle = p.angle;
    if (input.shot !== null && input.shot !== p.lastShot) {
      p.lastShot = input.shot;
      wantShot = true;
      shotAngle = Math.hypot(input.sx, input.sy) > 0.2 ? Math.atan2(input.sy, input.sx) : autoAimAngle(game, p);
    } else if (fire) {
      // Tahan tembak (keyboard, mouse, bot): menembak setiap cooldown habis.
      wantShot = true;
    }

    if (wantShot && p.cooldown <= 0) {
      p.angle = shotAngle;
      spawnBullet(game, p, shotAngle);
      p.cooldown = FIRE_COOLDOWN;
      events.push({ type: 'fire', id: p.id, angle: shotAngle });
    } else if (wantShot && input.shot !== null && p.cooldown > 0 && !fire) {
      events.push({ type: 'dry', id: p.id });
    }
  }

  for (const b of game.bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
  }
  game.bullets = game.bullets.filter((b) => {
    const owner = game.players.get(b.ownerId);
    const color = owner ? owner.color : '#ffd23f';
    if (b.life <= 0) {
      events.push({ type: 'impact', x: b.x, y: b.y, kind: 'fizzle', color });
      return false;
    }
    if (b.x < 0 || b.y < 0 || b.x > WORLD.width || b.y > WORLD.height) {
      events.push({ type: 'impact', x: clamp(b.x, 0, WORLD.width), y: clamp(b.y, 0, WORLD.height), kind: 'wall', color });
      return false;
    }
    if (OBSTACLES.some((r) => hitsRect(b.x, b.y, r))) {
      events.push({ type: 'impact', x: b.x, y: b.y, kind: 'wall', color });
      return false;
    }

    for (const p of game.players.values()) {
      if (!p.alive || p.id === b.ownerId) continue;
      if (Math.hypot(p.x - b.x, p.y - b.y) > TANK_RADIUS + BULLET_RADIUS) continue;
      if (p.shield > 0) {
        events.push({ type: 'impact', x: b.x, y: b.y, kind: 'shield', color });
        return false;
      }
      p.hp -= BULLET_DAMAGE;
      events.push({ type: 'impact', x: b.x, y: b.y, kind: 'tank', color, target: p.id });
      if (p.hp <= 0) {
        p.hp = 0;
        p.alive = false;
        p.deaths++;
        p.lives--;
        p.respawnIn = p.lives > 0 ? RESPAWN_TIME : 0;
        p.eliminated = p.lives <= 0;
        if (owner) owner.kills++;
        events.push({ type: 'kill', killer: b.ownerId, victim: p.id, lives: p.lives, eliminated: p.eliminated });
        if (p.eliminated) events.push({ type: 'eliminated', id: p.id });
      }
      return false;
    }
    return true;
  });

  return events;
}

const IDLE_INPUT = emptyInput();

// AI bot sederhana: kejar musuh terdekat, menyamping sambil membidik,
// dan menembak hanya saat lurus ke target dengan garis pandang bebas.
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

  const aimAngle = Math.atan2(dy, dx);
  const angleDiff = Math.abs(Math.atan2(Math.sin(aimAngle - me.angle), Math.cos(aimAngle - me.angle)));
  const canShoot = len < 600 && hasLineOfSight(me.x, me.y, target.x, target.y);

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
      hp: p.hp,
      lives: p.lives,
      kills: p.kills,
      deaths: p.deaths,
      alive: p.alive,
      eliminated: p.eliminated,
      shield: p.shield > 0,
      aim: p.input.aiming && p.input.shot !== null,
      respawnIn: Math.max(0, Math.ceil(p.respawnIn)),
      dashCooldown: Math.max(0, Math.ceil(p.dashCooldown * 10) / 10),
      fireCooldown: Math.max(0, Math.ceil(p.cooldown * 10) / 10),
    });
  }
  const bullets = game.bullets.map((b) => ({ id: b.id, x: Math.round(b.x), y: Math.round(b.y), vx: b.vx, vy: b.vy, o: b.ownerId }));
  return { world: WORLD, obstacles: OBSTACLES, players, bullets };
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
