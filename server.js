const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const game = require('./game');

const PORT = process.env.PORT || 3000;
const TICK_RATE = 30; // update simulasi per detik
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const io = new Server(server);

// code -> { code, state, tvSocketId, controllers: Map<socketId, playerId>, timer, lastTick }
const rooms = new Map();

function makeCode() {
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) {
      code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
  } while (rooms.has(code));
  return code;
}

function baseUrlFromSocket(socket) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, '');
  const host = socket.handshake.headers.host;
  return `http://${host}`;
}

function startRoomLoop(room) {
  room.lastTick = Date.now();
  room.timer = setInterval(() => {
    const now = Date.now();
    const dt = Math.min(0.1, (now - room.lastTick) / 1000);
    room.lastTick = now;

    const events = game.step(room.state, dt);
    io.to(`tv:${room.code}`).emit('state', game.snapshot(room.state));
    for (const ev of events) {
      io.to(`tv:${room.code}`).emit('event', ev);
    }
  }, 1000 / TICK_RATE);
}

function destroyRoom(code) {
  const room = rooms.get(code);
  if (!room) return;
  clearInterval(room.timer);
  for (const socketId of room.controllers.keys()) {
    const s = io.sockets.sockets.get(socketId);
    if (s) s.emit('room:closed');
  }
  rooms.delete(code);
}

io.on('connection', (socket) => {
  // Layar utama (TV / monitor) membuat room baru.
  socket.on('tv:create', async (_payload, ack) => {
    const code = makeCode();
    const room = {
      code,
      state: game.createGame(),
      tvSocketId: socket.id,
      controllers: new Map(),
      timer: null,
      lastTick: Date.now(),
    };
    rooms.set(code, room);
    socket.data.roomCode = code;
    socket.join(`tv:${code}`);

    const joinUrl = `${baseUrlFromSocket(socket)}/controller.html?room=${code}`;
    const qr = await QRCode.toDataURL(joinUrl, { margin: 1, width: 280 });

    startRoomLoop(room);
    ack({ ok: true, code, joinUrl, qr, max: game.MAX_PLAYERS });
  });

  // Controller (HP) bergabung ke room.
  socket.on('ctrl:join', ({ code, name } = {}, ack) => {
    const room = rooms.get(String(code || '').toUpperCase());
    if (!room) return ack({ ok: false, error: 'Room tidak ditemukan.' });

    const player = game.addPlayer(room.state, socket.id, name);
    if (!player) return ack({ ok: false, error: 'Room sudah penuh.' });

    room.controllers.set(socket.id, player.id);
    socket.data.roomCode = room.code;
    io.to(`tv:${room.code}`).emit('player:joined', { id: player.id, name: player.name, color: player.color });
    ack({ ok: true, playerId: player.id, name: player.name, color: player.color });
  });

  // Input dari HP, dikirim sekitar 20 kali per detik.
  socket.on('ctrl:input', (input) => {
    const code = socket.data.roomCode;
    const room = code && rooms.get(code);
    if (!room) return;
    game.setInput(room.state, socket.id, input || {});
  });

  socket.on('disconnect', () => {
    const code = socket.data.roomCode;
    const room = code && rooms.get(code);
    if (!room) return;

    if (room.tvSocketId === socket.id) {
      destroyRoom(code);
      return;
    }
    if (room.controllers.has(socket.id)) {
      const player = room.state.players.get(socket.id);
      room.controllers.delete(socket.id);
      game.removePlayer(room.state, socket.id);
      io.to(`tv:${code}`).emit('player:left', { id: socket.id, name: player && player.name });
    }
  });
});

server.listen(PORT, () => {
  console.log(`Tank Arena berjalan di http://localhost:${PORT}`);
});
