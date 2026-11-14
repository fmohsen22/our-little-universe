// Our Little Universe: room server for your own machine. No dependencies, Node 18 or newer.
//
//   node server/server.js
//
// Environment:
//   PORT             port to listen on (default 8787)
//   DATA_DIR         where rooms are stored, one JSON file per room (default server/data)
//   ALLOWED_ORIGINS  comma-separated sites allowed to call it (default https://game.mosi-app.com)
//
// API (the room code is the secret; it only travels in the invite link):
//   GET  /health                      -> ok
//   GET  /rooms/:room                 -> { docs: { name: data } }
//   POST /rooms/:room/:name           <- { kind: "set" | "patch", body: {...}, from: "client id" }
//   GET  /rooms/:room/events          -> Server-Sent Events: "op" for every move, "peers" with how many are connected
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const PORT = +(process.env.PORT || 8787);
const DATA = process.env.DATA_DIR || path.join(__dirname, 'data');
const ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://game.mosi-app.com').split(',').map(s => s.trim()).filter(Boolean);
const ROOM = /^[A-Za-z0-9_-]{12,64}$/, NAME = /^[a-z]{1,24}$/, MAX_BODY = 400 * 1024;
fs.mkdirSync(DATA, { recursive: true });

const rooms = new Map();   // room -> { docs, clients:Set<res>, timer }
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
function merge(t, p) { for (const k of Object.keys(p)) { if (k === '__proto__' || k === 'constructor') continue; if (isObj(p[k])) t[k] = merge(isObj(t[k]) ? t[k] : {}, p[k]); else t[k] = p[k]; } return t; }
function open(room) {
  let r = rooms.get(room);
  if (!r) {
    let docs = {};
    try { docs = JSON.parse(fs.readFileSync(path.join(DATA, room + '.json'), 'utf8')); } catch (e) { /* new room */ }
    r = { docs, clients: new Set(), timer: null }; rooms.set(room, r);
  }
  return r;
}
function persist(room, r) {
  clearTimeout(r.timer);
  r.timer = setTimeout(() => {
    const file = path.join(DATA, room + '.json'), tmp = file + '.tmp';
    fs.writeFile(tmp, JSON.stringify(r.docs), err => { if (!err) fs.rename(tmp, file, () => {}); else console.error('save failed', err.message); });
  }, 150);
}
function tell(r, event, data) { const msg = 'event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n'; for (const c of r.clients) c.write(msg); }
function send(res, code, body) { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); }

const server = http.createServer((req, res) => {
  const origin = req.headers.origin;
  if (origin && (ORIGINS.includes('*') || ORIGINS.includes(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type'); res.setHeader('Access-Control-Max-Age', '86400');
  }
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const parts = new URL(req.url, 'http://x').pathname.split('/').filter(Boolean);
  if (parts[0] === 'health') return send(res, 200, { ok: true });
  if (parts[0] !== 'rooms' || !ROOM.test(parts[1] || '')) return send(res, 404, { error: 'not found' });
  const room = parts[1], r = open(room);

  if (req.method === 'GET' && parts.length === 2) return send(res, 200, { docs: r.docs });

  if (req.method === 'GET' && parts[2] === 'events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write('retry: 2000\n\n'); r.clients.add(res); tell(r, 'peers', r.clients.size);
    const beat = setInterval(() => res.write(': keep-alive\n\n'), 25000);
    req.on('close', () => { clearInterval(beat); r.clients.delete(res); tell(r, 'peers', r.clients.size); });
    return;
  }

  if (req.method === 'POST' && parts.length === 3 && NAME.test(parts[2])) {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > MAX_BODY) { send(res, 413, { error: 'too large' }); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      if (size > MAX_BODY) return;
      let m; try { m = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (e) { return send(res, 400, { error: 'bad json' }); }
      if (!m || !isObj(m.body) || (m.kind !== 'set' && m.kind !== 'patch')) return send(res, 400, { error: 'bad request' });
      const name = parts[2];
      r.docs[name] = m.kind === 'set' ? m.body : merge(isObj(r.docs[name]) ? r.docs[name] : {}, m.body);
      persist(room, r); tell(r, 'op', { name, kind: m.kind, body: m.body, from: String(m.from || '').slice(0, 16) });
      send(res, 200, { ok: true });
    });
    return;
  }
  send(res, 404, { error: 'not found' });
});
server.listen(PORT, () => console.log('Our Little Universe room server on port ' + PORT + ', data in ' + DATA + ', allowing ' + ORIGINS.join(', ')));
