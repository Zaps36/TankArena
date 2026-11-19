// Logika game (authoritative di server). Tidak ada dependensi I/O di sini.

const WORLD = { width: 1000, height: 700 };
const TANK_RADIUS = 18;
const TANK_SPEED = 170; // px per detik
const BULLET_SPEED = 520; // px per detik
const BULLET_LIFE = 1.6; // detik
const BULLET_RADIUS = 4;
const FIRE_COOLDOWN = 0.45; // detik
const MAX_HP = 100;
const BULLET_DAMAGE = 34;
const RESPAWN_TIME = 3; // detik
const MAX_PLAYERS = 4;

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

const PLAYER_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f'];

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

function addPlayer(game, id, name) {
  if (game.players.size >= MAX_PLAYERS) return null;
  const used = new Set([...game.players.values()].map((p) => p.slot));
  let slot = 0;
  while (used.has(slot)) slot++;

  const pos = spawnPoint(slot);
  const player = {
    id,
    name: (name || `Pemain ${slot + 1}`).toString().slice(0, 12),
    slot,
    color: PLAYER_COLORS[slot],
    x: pos.x,
    y: pos.y,
    angle: 0,
    hp: MAX_HP,
    kills: 0,
    deaths: 0,
    alive: true,
    respawnIn: 0,
    cooldown: 0,
    input: { mx: 0, my: 0, ax: 0, ay: 0, aiming: false, fire: false },
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
  p.input = {
    mx: clamp(Number(input.mx) || 0, -1, 1),
    my: clamp(Number(input.my) || 0, -1, 1),
    ax: clamp(Number(input.ax) || 0, -1, 1),
    ay: clamp(Number(input.ay) || 0, -1, 1),
    aiming: !!input.aiming,
    fire: !!input.fire,
  };
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
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
    // Pusat tank tepat di dalam kotak: dorong ke sisi terdekat.
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

function spawnBullet(game, owner, angle) {
  game.bullets.push({
    id: game.nextBulletId++,
    ownerId: owner.id,
    x: owner.x + Math.cos(angle) * (TANK_RADIUS + 6),
    y: owner.y + Math.sin(angle) * (TANK_RADIUS + 6),
    vx: Math.cos(angle) * BULLET_SPEED,
    vy: Math.sin(angle) * BULLET_SPEED,
    life: BULLET_LIFE,
  });
}

function hitsRect(x, y, rect) {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

// Satu langkah simulasi. dt dalam detik.
function step(game, dt) {
  const events = [];

  for (const p of game.players.values()) {
    if (!p.alive) {
      p.respawnIn -= dt;
      if (p.respawnIn <= 0) {
        const pos = spawnPoint(p.slot);
        Object.assign(p, { x: pos.x, y: pos.y, hp: MAX_HP, alive: true });
        events.push({ type: 'respawn', id: p.id });
      }
      continue;
    }

    const { mx, my, ax, ay, aiming, fire } = p.input;

    // Gerak: joystick kiri. Arah tank mengikuti bidik jika bidik aktif, kalau tidak mengikuti gerak.
    const moveLen = Math.hypot(mx, my);
    if (moveLen > 0.05) {
      const k = Math.min(1, moveLen) / moveLen;
      const moved = moveTank(p.x, p.y, mx * k * TANK_SPEED * dt, my * k * TANK_SPEED * dt);
      p.x = moved.x;
      p.y = moved.y;
    }

    if (aiming && Math.hypot(ax, ay) > 0.3) {
      p.angle = Math.atan2(ay, ax);
    } else if (moveLen > 0.05) {
      p.angle = Math.atan2(my, mx);
    }

    p.cooldown = Math.max(0, p.cooldown - dt);
    if (fire && p.cooldown <= 0) {
      spawnBullet(game, p, p.angle);
      p.cooldown = FIRE_COOLDOWN;
      events.push({ type: 'fire', id: p.id });
    }
  }

  // Peluru
  for (const b of game.bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
  }
  game.bullets = game.bullets.filter((b) => {
    if (b.life <= 0) return false;
    if (b.x < 0 || b.y < 0 || b.x > WORLD.width || b.y > WORLD.height) return false;
    if (OBSTACLES.some((r) => hitsRect(b.x, b.y, r))) return false;

    for (const p of game.players.values()) {
      if (!p.alive || p.id === b.ownerId) continue;
      if (Math.hypot(p.x - b.x, p.y - b.y) <= TANK_RADIUS + BULLET_RADIUS) {
        p.hp -= BULLET_DAMAGE;
        if (p.hp <= 0) {
          p.hp = 0;
          p.alive = false;
          p.deaths++;
          p.respawnIn = RESPAWN_TIME;
          const killer = game.players.get(b.ownerId);
          if (killer) killer.kills++;
          events.push({ type: 'kill', killer: b.ownerId, victim: p.id });
        }
        return false;
      }
    }
    return true;
  });

  return events;
}

function snapshot(game) {
  return {
    world: WORLD,
    obstacles: OBSTACLES,
    players: [...game.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      x: Math.round(p.x),
      y: Math.round(p.y),
      angle: p.angle,
      hp: p.hp,
      kills: p.kills,
      deaths: p.deaths,
      alive: p.alive,
      respawnIn: Math.max(0, Math.ceil(p.respawnIn)),
    })),
    bullets: game.bullets.map((b) => ({ id: b.id, x: Math.round(b.x), y: Math.round(b.y) })),
  };
}

module.exports = {
  WORLD,
  TANK_RADIUS,
  MAX_PLAYERS,
  createGame,
  addPlayer,
  removePlayer,
  setInput,
  step,
  snapshot,
};
