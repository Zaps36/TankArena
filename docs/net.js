// Lapisan koneksi TV <-> HP untuk GitHub Pages (tanpa server sendiri).
//
// Dua jalur dipakai bersamaan:
//   1. WebRTC (PeerJS): langsung HP -> TV, latensi paling kecil.
//   2. Relay MQTT lewat WebSocket (broker publik): cadangan saat WebRTC gagal,
//      misalnya HP pakai data seluler, Wi-Fi memakai isolasi klien, NAT ketat,
//      atau browser bawaan aplikasi scanner yang tidak mendukung WebRTC.
//
// Pesan berbentuk objek JSON kecil dengan field `t` (tipe) dan `c` (id klien).
(function (root) {
  'use strict';

  const BROKER_URL = 'wss://broker.emqx.io:8084/mqtt';
  const TOPIC_ROOT = 'tankarena/v1/';
  const PEER_PREFIX = 'tankarena-v1-';
  const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const CLIENT_TIMEOUT = 7000; // TV melepas pemain yang diam selama ini
  const HOST_SILENCE = 4000; // HP mencoba sambung ulang jika TV diam selama ini
  const MAX_JOIN_ATTEMPTS = 5;

  function randomCode(length) {
    const values = new Uint32Array(length);
    crypto.getRandomValues(values);
    let out = '';
    for (const v of values) out += CODE_CHARS[v % CODE_CHARS.length];
    return out;
  }

  function normalizeRoom(code) {
    return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  }

  function validClientId(id) {
    return typeof id === 'string' && /^[A-Z0-9]{6,16}$/.test(id);
  }

  function webrtcAvailable() {
    return typeof root.RTCPeerConnection === 'function' && typeof root.Peer === 'function';
  }

  function relayAvailable() {
    return !!(root.mqtt && typeof root.mqtt.connect === 'function');
  }

  function parse(payload) {
    if (payload && typeof payload === 'object' && !(payload instanceof Uint8Array)) return payload;
    try {
      const text = typeof payload === 'string' ? payload : new TextDecoder().decode(payload);
      const msg = JSON.parse(text);
      return msg && typeof msg === 'object' ? msg : null;
    } catch (e) {
      return null;
    }
  }

  function connectBroker(clientId) {
    return root.mqtt.connect(BROKER_URL, {
      clientId,
      clean: true,
      keepalive: 30,
      reconnectPeriod: 2000,
      connectTimeout: 10000,
    });
  }

  // ---------------------------------------------------------------- TV (host)
  // handlers: onStatus({room, rtc, relay}), onMessage(clientId, msg, via), onLeave(clientId)
  function createHost(handlers) {
    const room = randomCode(6);
    const clients = new Map(); // clientId -> { via, conn, lastSeen }
    const st = { rtc: webrtcAvailable() ? 'connecting' : 'unsupported', relay: relayAvailable() ? 'connecting' : 'unsupported' };
    const upTopic = `${TOPIC_ROOT}${room}/up`;
    const downTopic = (id) => `${TOPIC_ROOT}${room}/down/${id}`;
    let peer = null;
    let broker = null;
    let destroyed = false;

    function status() {
      if (handlers.onStatus) handlers.onStatus({ room, rtc: st.rtc, relay: st.relay });
    }

    function drop(id) {
      if (!clients.delete(id)) return;
      handlers.onLeave(id);
    }

    function receive(msg, via, conn) {
      if (!msg || !validClientId(msg.c) || typeof msg.t !== 'string') return;
      let entry = clients.get(msg.c);
      if (!entry) {
        if (msg.t !== 'join') return;
        entry = { via, conn: null, lastSeen: 0 };
        clients.set(msg.c, entry);
      }
      // Jalur balasan mengikuti jalur pesan join terakhir.
      if (msg.t === 'join') {
        entry.via = via;
        entry.conn = conn || null;
      }
      entry.lastSeen = Date.now();
      if (msg.t === 'leave') {
        drop(msg.c);
        return;
      }
      handlers.onMessage(msg.c, msg, entry.via);
    }

    function send(id, msg) {
      const entry = clients.get(id);
      if (!entry) return;
      if (entry.via === 'rtc' && entry.conn && entry.conn.open) {
        try {
          entry.conn.send(msg);
          return;
        } catch (e) {
          // lanjut ke relay
        }
      }
      if (broker && broker.connected) broker.publish(downTopic(id), JSON.stringify(msg), { qos: 0 });
    }

    if (st.rtc === 'connecting') {
      peer = new root.Peer(PEER_PREFIX + room, { debug: 0 });
      peer.on('open', () => {
        st.rtc = 'ready';
        status();
      });
      peer.on('connection', (conn) => {
        conn.on('data', (data) => receive(parse(data), 'rtc', conn));
        // Saat jalur WebRTC putus, pemain tidak langsung dilepas: HP akan
        // bergabung lagi lewat relay. Batas waktu CLIENT_TIMEOUT yang menentukan.
        conn.on('close', () => {
          for (const entry of clients.values()) if (entry.conn === conn) entry.conn = null;
        });
      });
      peer.on('disconnected', () => {
        if (destroyed) return;
        st.rtc = 'connecting';
        status();
        setTimeout(() => {
          if (!destroyed && peer.disconnected && !peer.destroyed) peer.reconnect();
        }, 1500);
      });
      peer.on('error', (err) => {
        if (err && err.type === 'peer-unavailable') return;
        console.warn('PeerJS host:', err && err.type, err);
        if (!peer.open) st.rtc = 'error';
        status();
      });
    }

    if (st.relay === 'connecting') {
      broker = connectBroker(`ta_h_${room}_${randomCode(4)}`);
      broker.on('connect', () => {
        broker.subscribe(upTopic, { qos: 0 });
        st.relay = 'ready';
        status();
      });
      broker.on('reconnect', () => {
        st.relay = 'connecting';
        status();
      });
      broker.on('error', (err) => {
        console.warn('Relay host:', err);
        st.relay = 'error';
        status();
      });
      broker.on('message', (topic, payload) => {
        if (topic === upTopic) receive(parse(payload), 'relay');
      });
    }

    const sweep = setInterval(() => {
      const now = Date.now();
      for (const [id, entry] of clients) if (now - entry.lastSeen > CLIENT_TIMEOUT) drop(id);
    }, 1000);

    setTimeout(status, 0);

    return {
      room,
      send,
      kick(id) {
        clients.delete(id);
      },
      destroy() {
        destroyed = true;
        clearInterval(sweep);
        if (peer) peer.destroy();
        if (broker) broker.end(true);
      },
    };
  }

  // ---------------------------------------------------------- HP (controller)
  // handlers: onStatus({rtc, relay, active}), onMessage(msg, via), onFail(text), onRetry(attempt)
  function connectClient(roomCode, handlers) {
    const room = normalizeRoom(roomCode);
    const storageKey = `tankarena-client-${room}`;
    let clientId = null;
    try {
      clientId = sessionStorage.getItem(storageKey);
    } catch (e) {
      clientId = null;
    }
    if (!validClientId(clientId)) {
      clientId = randomCode(10);
      try {
        sessionStorage.setItem(storageKey, clientId);
      } catch (e) {
        // mode privat: id hanya berlaku di halaman ini
      }
    }

    const st = { rtc: webrtcAvailable() ? 'connecting' : 'unsupported', relay: relayAvailable() ? 'connecting' : 'unsupported' };
    const upTopic = `${TOPIC_ROOT}${room}/up`;
    const downTopic = `${TOPIC_ROOT}${room}/down/${clientId}`;
    let peer = null;
    let conn = null;
    let broker = null;
    let active = null; // jalur yang menerima "welcome"
    let joinMsg = null;
    let joinTimer = null;
    let lastHostMsg = 0;

    function status() {
      if (handlers.onStatus) handlers.onStatus({ rtc: st.rtc, relay: st.relay, active });
    }

    const rtcOpen = () => !!(conn && conn.open);
    const relayOpen = () => !!(broker && broker.connected);

    function sendVia(via, msg) {
      const full = Object.assign({ c: clientId }, msg);
      if (via === 'rtc' && rtcOpen()) {
        try {
          conn.send(full);
          return true;
        } catch (e) {
          return false;
        }
      }
      if (via === 'relay' && relayOpen()) {
        broker.publish(upTopic, JSON.stringify(full), { qos: 0 });
        return true;
      }
      return false;
    }

    function receive(msg, via) {
      if (!msg || typeof msg.t !== 'string') return;
      lastHostMsg = Date.now();
      if (msg.t === 'welcome') {
        active = via;
        clearTimeout(joinTimer);
        status();
      }
      handlers.onMessage(msg, via);
    }

    // Kirim join lewat jalur yang tersedia. Percobaan genap mengutamakan
    // WebRTC, percobaan ganjil mengutamakan relay.
    function attemptJoin(attempt) {
      clearTimeout(joinTimer);
      if (!joinMsg) return;
      if (attempt >= MAX_JOIN_ATTEMPTS) {
        handlers.onFail('Layar utama tidak merespons. Pastikan halaman TV masih terbuka, lalu scan ulang QR-nya.');
        return;
      }
      const order = attempt % 2 === 0 ? ['rtc', 'relay'] : ['relay', 'rtc'];
      let sent = null;
      for (const via of order) {
        if (sendVia(via, joinMsg)) {
          sent = via;
          break;
        }
      }
      if (handlers.onRetry && attempt > 0) handlers.onRetry(attempt, sent);
      joinTimer = setTimeout(() => {
        if (!active) attemptJoin(attempt + 1);
      }, 3500);
    }

    function join(name) {
      joinMsg = { t: 'join', name: String(name || '').slice(0, 12) };
      active = null;
      attemptJoin(0);
    }

    function send(msg) {
      if (!active) return;
      if (!sendVia(active, msg)) sendVia(active === 'rtc' ? 'relay' : 'rtc', msg);
    }

    // Jika TV diam terlalu lama setelah bergabung, gabung ulang lewat relay.
    const watchdog = setInterval(() => {
      if (!active || !joinMsg) return;
      if (Date.now() - lastHostMsg > HOST_SILENCE) {
        active = null;
        status();
        if (handlers.onRetry) handlers.onRetry(1, null);
        attemptJoin(1);
      }
    }, 1000);

    if (st.rtc === 'connecting') {
      peer = new root.Peer({ debug: 0 });
      peer.on('open', () => {
        conn = peer.connect(PEER_PREFIX + room, { reliable: true, serialization: 'json' });
        conn.on('open', () => {
          st.rtc = 'ready';
          status();
          // Sudah masuk lewat relay: pindah ke jalur langsung yang lebih cepat.
          if (active === 'relay' && joinMsg) sendVia('rtc', joinMsg);
        });
        conn.on('data', (data) => receive(parse(data), 'rtc'));
        conn.on('close', () => {
          st.rtc = 'closed';
          status();
        });
        conn.on('error', () => {
          st.rtc = 'error';
          status();
        });
      });
      peer.on('error', (err) => {
        console.warn('PeerJS controller:', err && err.type, err);
        st.rtc = 'error';
        status();
      });
      setTimeout(() => {
        if (st.rtc === 'connecting') {
          st.rtc = 'timeout';
          status();
        }
      }, 9000);
    }

    if (st.relay === 'connecting') {
      broker = connectBroker(`ta_c_${clientId}`);
      broker.on('connect', () => {
        broker.subscribe(downTopic, { qos: 0 });
        st.relay = 'ready';
        status();
      });
      broker.on('reconnect', () => {
        st.relay = 'connecting';
        status();
      });
      broker.on('error', (err) => {
        console.warn('Relay controller:', err);
        st.relay = 'error';
        status();
      });
      broker.on('message', (topic, payload) => {
        if (topic === downTopic) receive(parse(payload), 'relay');
      });
    }

    root.addEventListener('pagehide', () => {
      if (active) sendVia(active, { t: 'leave' });
    });

    setTimeout(status, 0);

    return {
      room,
      clientId,
      join,
      send,
      ready: () => rtcOpen() || relayOpen(),
      transport: () => active,
      destroy() {
        clearInterval(watchdog);
        clearTimeout(joinTimer);
        if (peer) peer.destroy();
        if (broker) broker.end(true);
      },
    };
  }

  root.TankNet = { createHost, connectClient, normalizeRoom };
})(window);
