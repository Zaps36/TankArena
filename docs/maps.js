// Daftar arena. Hanya data (tanpa DOM), dipakai game.js, match.js, mapart.js.
// Koordinat dalam dunia 1000 x 700. Spawn default di empat sudut.
//
// Jenis zona:
//   bush      - semak: tank di dalamnya tidak bisa dikunci auto-aim/bot dari jauh
//   slow      - pasir hisap: tank melambat
//   ice       - es: tank meluncur (punya inersia)
//   lava      - lava: membakar HP
//   conveyor  - ban berjalan: mendorong tank ke arah (dx, dy)
// Lainnya: portals (pasangan teleport), movers (rintangan bergerak), bounce (peluru memantul).
(function (root) {
  'use strict';

  const SPAWNS = [
    { x: 80, y: 80 },
    { x: 920, y: 620 },
    { x: 920, y: 80 },
    { x: 80, y: 620 },
  ];

  const MAPS = [
    {
      id: 'meadow',
      name: 'Padang Semak',
      icon: '🌿',
      accent: '#4cd964',
      tip: 'Masuk semak untuk sembunyi. Auto-aim dan bot tidak bisa mengunci kamu dari jauh.',
      obstacles: [
        { x: 180, y: 140, w: 120, h: 40, kind: 'crate' },
        { x: 700, y: 520, w: 120, h: 40, kind: 'crate' },
        { x: 460, y: 300, w: 80, h: 100, kind: 'crate' },
        { x: 150, y: 480, w: 40, h: 120, kind: 'crate' },
        { x: 810, y: 150, w: 40, h: 120, kind: 'crate' },
      ],
      zones: [
        { type: 'bush', x: 320, y: 240, w: 120, h: 70 },
        { type: 'bush', x: 560, y: 390, w: 120, h: 70 },
        { type: 'bush', x: 420, y: 560, w: 150, h: 60 },
        { type: 'bush', x: 430, y: 80, w: 150, h: 60 },
        { type: 'bush', x: 40, y: 300, w: 90, h: 110 },
        { type: 'bush', x: 870, y: 290, w: 90, h: 110 },
      ],
    },
    {
      id: 'desert',
      name: 'Gurun Pasir Hisap',
      icon: '🌵',
      accent: '#ff8a2b',
      tip: 'Pasir hisap bikin tank lambat. Jangan sampai terjebak saat diserang!',
      obstacles: [
        { x: 430, y: 290, w: 140, h: 120, kind: 'mesa' },
        { x: 240, y: 170, w: 34, h: 64, kind: 'cactus' },
        { x: 726, y: 466, w: 34, h: 64, kind: 'cactus' },
        { x: 726, y: 170, w: 34, h: 64, kind: 'cactus' },
        { x: 240, y: 466, w: 34, h: 64, kind: 'cactus' },
        { x: 470, y: 90, w: 60, h: 46, kind: 'rock' },
        { x: 470, y: 564, w: 60, h: 46, kind: 'rock' },
      ],
      zones: [
        { type: 'slow', x: 100, y: 290, w: 160, h: 120 },
        { type: 'slow', x: 740, y: 290, w: 160, h: 120 },
        { type: 'slow', x: 600, y: 120, w: 100, h: 90 },
        { type: 'slow', x: 300, y: 490, w: 100, h: 90 },
      ],
    },
    {
      id: 'ice',
      name: 'Danau Beku',
      icon: '❄️',
      accent: '#3fa9ff',
      tip: 'Es licin! Tank meluncur, susah berhenti, dan memantul dari tembok.',
      obstacles: [
        { x: 190, y: 110, w: 60, h: 60, kind: 'iceblock' },
        { x: 750, y: 110, w: 60, h: 60, kind: 'iceblock' },
        { x: 190, y: 530, w: 60, h: 60, kind: 'iceblock' },
        { x: 750, y: 530, w: 60, h: 60, kind: 'iceblock' },
        { x: 460, y: 128, w: 80, h: 34, kind: 'snow' },
        { x: 460, y: 538, w: 80, h: 34, kind: 'snow' },
        { x: 470, y: 320, w: 60, h: 60, kind: 'iceblock' },
        { x: 60, y: 330, w: 70, h: 40, kind: 'snow' },
        { x: 870, y: 330, w: 70, h: 40, kind: 'snow' },
      ],
      zones: [
        { type: 'ice', x: 270, y: 190, w: 460, h: 320 },
      ],
    },
    {
      id: 'volcano',
      name: 'Gunung Berapi',
      icon: '🌋',
      accent: '#ff4d5e',
      tip: 'Lava membakar HP! Seberangi sungai lava lewat jembatan batu di tengah.',
      obstacles: [
        { x: 300, y: 130, w: 64, h: 64, kind: 'basalt' },
        { x: 636, y: 130, w: 64, h: 64, kind: 'basalt' },
        { x: 300, y: 506, w: 64, h: 64, kind: 'basalt' },
        { x: 636, y: 506, w: 64, h: 64, kind: 'basalt' },
        { x: 480, y: 325, w: 40, h: 50, kind: 'basalt' },
      ],
      zones: [
        { type: 'lava', x: 470, y: 0, w: 60, h: 250 },
        { type: 'lava', x: 470, y: 450, w: 60, h: 250 },
        { type: 'lava', x: 170, y: 300, w: 100, h: 100 },
        { type: 'lava', x: 730, y: 300, w: 100, h: 100 },
      ],
    },
    {
      id: 'factory',
      name: 'Pabrik Robot',
      icon: '🏭',
      accent: '#ffd23f',
      tip: 'Ban berjalan mendorong tank, dan mesin press bergerak bolak-balik. Jangan kegencet!',
      obstacles: [
        { x: 40, y: 310, w: 56, h: 80, kind: 'machine' },
        { x: 904, y: 310, w: 56, h: 80, kind: 'machine' },
        { x: 480, y: 40, w: 40, h: 110, kind: 'pipe' },
        { x: 480, y: 550, w: 40, h: 110, kind: 'pipe' },
        { x: 250, y: 90, w: 70, h: 50, kind: 'steel' },
        { x: 680, y: 560, w: 70, h: 50, kind: 'steel' },
      ],
      zones: [
        { type: 'conveyor', x: 120, y: 190, w: 760, h: 60, dx: 1, dy: 0 },
        { type: 'conveyor', x: 120, y: 450, w: 760, h: 60, dx: -1, dy: 0 },
      ],
      movers: [
        { x: 470, y: 300, w: 60, h: 100, ax: 300, ay: 0, period: 6, phase: 0, kind: 'press' },
      ],
    },
    {
      id: 'neon',
      name: 'Kota Neon',
      icon: '🌃',
      accent: '#a66bff',
      tip: 'Peluru memantul 2x di dinding. Awas, pantulan bisa kena dirimu sendiri!',
      bounce: true,
      bulletLife: 2.4,
      obstacles: [
        { x: 200, y: 140, w: 240, h: 22, kind: 'neon' },
        { x: 560, y: 140, w: 240, h: 22, kind: 'neon' },
        { x: 200, y: 538, w: 240, h: 22, kind: 'neon' },
        { x: 560, y: 538, w: 240, h: 22, kind: 'neon' },
        { x: 200, y: 162, w: 22, h: 120, kind: 'neon' },
        { x: 778, y: 162, w: 22, h: 120, kind: 'neon' },
        { x: 200, y: 418, w: 22, h: 120, kind: 'neon' },
        { x: 778, y: 418, w: 22, h: 120, kind: 'neon' },
        { x: 489, y: 270, w: 22, h: 160, kind: 'neon' },
        { x: 420, y: 339, w: 160, h: 22, kind: 'neon' },
      ],
      zones: [],
    },
    {
      id: 'temple',
      name: 'Kuil Portal',
      icon: '🌀',
      accent: '#a66bff',
      tip: 'Masuk portal untuk teleport ke pasangannya. Peluru juga bisa lewat portal!',
      obstacles: [
        { x: 290, y: 170, w: 56, h: 56, kind: 'pillar' },
        { x: 654, y: 170, w: 56, h: 56, kind: 'pillar' },
        { x: 290, y: 474, w: 56, h: 56, kind: 'pillar' },
        { x: 654, y: 474, w: 56, h: 56, kind: 'pillar' },
        { x: 445, y: 305, w: 110, h: 90, kind: 'altar' },
        { x: 110, y: 330, w: 120, h: 40, kind: 'ruin' },
        { x: 770, y: 330, w: 120, h: 40, kind: 'ruin' },
      ],
      zones: [],
      portals: [
        { a: { x: 175, y: 175 }, b: { x: 825, y: 525 }, color: '#a66bff' },
        { a: { x: 825, y: 175 }, b: { x: 175, y: 525 }, color: '#4cd964' },
      ],
    },
  ];

  const BY_ID = new Map();
  for (const m of MAPS) {
    m.spawns = m.spawns || SPAWNS;
    m.zones = m.zones || [];
    m.movers = m.movers || [];
    m.portals = m.portals || [];
    m.byType = {};
    for (const z of m.zones) (m.byType[z.type] = m.byType[z.type] || []).push(z);
    BY_ID.set(m.id, m);
  }

  function get(id) {
    return BY_ID.get(id) || MAPS[0];
  }

  function zones(map, type) {
    return map.byType[type] || [];
  }

  // Acak urutan (Fisher-Yates), memakai Math.random.
  function shuffle(list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const TankMaps = { MAPS, IDS: MAPS.map((m) => m.id), get, zones, shuffle };
  root.TankMaps = TankMaps;
  if (typeof module !== 'undefined' && module.exports) module.exports = TankMaps;
})(typeof window !== 'undefined' ? window : globalThis);
