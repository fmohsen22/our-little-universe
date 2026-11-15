// "Where is Prince Mohsey?" game server. No dependencies, Node 18 or newer.
//
//   node server/server.js
//
// Environment:
//   PORT             port to listen on (default 8787)
//   DATA_DIR         where players are stored (default server/data)
//   ALLOWED_ORIGINS  comma-separated sites allowed to call it (default https://game.mosi-app.com)
//
// The server is the referee: it picks the letter, keeps the clock, hides answers until the round ends,
// scores the round, and owns every player's points, wins, level and badges. Browsers only send
// their own answers and votes. Rules live in game.js; level stories and quiz answers in levels.json.
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const G = require('./game.js');

const PORT = +(process.env.PORT || 8787);
const DATA = process.env.DATA_DIR || path.join(__dirname, 'data');
const ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://game.mosi-app.com').split(',').map(s => s.trim()).filter(Boolean);
const COLLECT_MS = +(process.env.COLLECT_MS || 1500), REVIEW_MS = +(process.env.REVIEW_MS || 45000), MAX_BODY = 32 * 1024, MAX_ROOMS = 300;
fs.mkdirSync(DATA, { recursive: true });

let LEVELS = [];
try { LEVELS = JSON.parse(fs.readFileSync(process.env.LEVELS_FILE || path.join(__dirname, 'levels.json'), 'utf8')).levels || []; } catch (e) { console.error('levels.json could not be read: ' + e.message); }

/* ---------- players (persisted) ---------- */
const FILE = path.join(DATA, 'players.json');
let players = {};
try { players = JSON.parse(fs.readFileSync(FILE, 'utf8')).players || {}; } catch (e) { /* first run */ }
let saveTimer = null;
function savePlayers() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { const tmp = FILE + '.tmp'; fs.writeFile(tmp, JSON.stringify({ players }), err => { if (err) console.error('save failed: ' + err.message); else fs.rename(tmp, FILE, () => {}); }); }, 200);
}
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const rid = n => crypto.randomBytes(n).toString('hex');
function auth(req, url) {
  const h = req.headers.authorization || '', raw = h.startsWith('Bearer ') ? h.slice(7) : (url.searchParams.get('k') || '');
  const dot = raw.indexOf('.'); if (dot < 1) return null;
  const p = players[raw.slice(0, dot)]; if (!p) return null;
  const a = Buffer.from(sha(raw.slice(dot + 1))), b = Buffer.from(p.hash);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? p : null;
}
function cleanName(s) { return String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 20); }
function nameTaken(name, except) { const k = G.key(name); return Object.values(players).some(p => p.id !== except && G.key(p.name) === k); }
function pub(p) { const r = G.rankOf(p); return { id: p.id, name: p.name, kingdom: p.kingdom, royal: p.royal, level: p.level, total: p.total, wins: p.wins, rounds: p.rounds, streak: p.streak, best: p.best, rank: r ? r.id : null, title: r ? G.rankTitle(r, p) : '' }; }
function priv(p) {
  const prog = {}; G.ACHIEVEMENTS.forEach(a => { prog[a.id] = Math.min(a.goal, a.value(p)); });
  return Object.assign(pub(p), { levelPoints: p.levelPoints, need: G.nextLevelNeed(p), quizReady: G.quizReady(p), quizPending: !!p.quiz, quizFails: p.quizFails, ranks: p.ranks, ach: p.ach, progress: prog });
}
function meta() {
  return {
    categories: G.CATEGORIES, defaults: G.DEFAULT_SETTINGS, points: G.POINTS, maxPlayers: G.MAX_PLAYERS, minScored: G.MIN_SCORED, reviewSeconds: REVIEW_MS / 1000,
    quiz: { size: G.LEVELS.quizSize, pass: G.LEVELS.quizPass },
    ranks: G.RANKS.map(r => ({ id: r.id, wins: r.wins, title: r.title, badge: r.badge, art: r.art, metal: r.metal, legendary: !!r.legendary })),
    achievements: G.ACHIEVEMENTS.map(a => ({ id: a.id, name: a.name, desc: a.desc, art: a.art, metal: a.metal, goal: a.goal, legendary: !!a.legendary, hidden: !!a.hidden })),
    levels: Array.from({ length: G.LEVELS.count }, (_, i) => { const L = LEVELS[i] || {}; return { n: i + 1, title: L.title || 'Chapter ' + (i + 1), teaser: L.teaser || '', points: G.levelPoints(i + 1) }; })
  };
}

/* ---------- tables (in memory) ---------- */
const rooms = new Map();
function roomCode() { const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; let c; do { c = Array.from(crypto.randomBytes(5), b => abc[b % abc.length]).join(''); } while (rooms.has(c)); return c; }
const online = m => m.conns.size > 0;
function view(room) {
  const live = room.phase === 'review' || room.phase === 'results', v = {
    code: room.code, host: room.host, open: room.open, settings: room.settings, phase: room.phase, letter: room.letter, endsAt: room.endsAt, reviewEndsAt: room.reviewEndsAt, round: room.round, now: Date.now(),
    players: Array.from(room.members.values()).map(m => Object.assign(pub(players[m.id]), { online: online(m), inRound: m.inRound, ready: m.ready, session: m.session,
      filled: room.phase === 'play' || room.phase === 'collect' ? room.settings.cats.filter(c => G.key((m.answers || {})[c])).length : 0 }))
  };
  if (live) { v.scores = room.results || score(room); v.rejects = {}; Object.keys(room.rejects).forEach(id => { v.rejects[id] = {}; Object.keys(room.rejects[id]).forEach(c => { v.rejects[id][c] = Array.from(room.rejects[id][c]); }); }); }
  if (room.phase === 'results') { v.stopper = room.stopper; v.unlocks = room.unlocks; }
  return v;
}
function score(room) {
  const answers = {}, rejects = {};
  room.members.forEach(m => { if (m.inRound) { answers[m.id] = m.answers; rejects[m.id] = {}; Object.keys(room.rejects[m.id] || {}).forEach(c => { rejects[m.id][c] = Array.from(room.rejects[m.id][c]); }); } });
  return G.scoreRound({ letter: room.letter, cats: room.settings.cats, answers, rejects });
}
function tell(room) { const msg = 'event: state\ndata: ' + JSON.stringify(view(room)) + '\n\n'; room.members.forEach(m => m.conns.forEach(c => c.write(msg))); room.active = Date.now(); }
function canDrive(room, id) { const h = room.members.get(room.host); return id === room.host || !h || !online(h); }

function startRound(room) {
  const inRound = Array.from(room.members.values()).filter(online);
  if (!inRound.length) return 'nobody is here';
  clearTimeout(room.timer);
  const pool = G.LETTERS[room.settings.lang].filter(l => l !== room.letter);
  room.letter = pool[crypto.randomInt(pool.length)]; room.round += 1; room.phase = 'play'; room.stopper = null; room.results = null; room.unlocks = {}; room.rejects = {};
  room.members.forEach(m => { m.inRound = online(m); m.answers = {}; m.ready = false; });
  room.endsAt = Date.now() + room.settings.secs * 1000; room.reviewEndsAt = 0;
  room.timer = setTimeout(() => endPlay(room), room.settings.secs * 1000);
  tell(room); return null;
}
function endPlay(room) {
  if (room.phase !== 'play') return;
  clearTimeout(room.timer); room.phase = 'collect'; tell(room);      // a short grace so every browser can hand in what was typed
  room.timer = setTimeout(() => { room.phase = 'review'; room.reviewEndsAt = Date.now() + REVIEW_MS; tell(room); room.timer = setTimeout(() => finish(room), REVIEW_MS); }, COLLECT_MS);
}
function finish(room) {
  if (room.phase !== 'review') return;
  clearTimeout(room.timer);
  const res = score(room), now = Date.now(), n = res.order.length; room.results = res; room.unlocks = {};
  res.order.forEach(id => {
    const m = room.members.get(id), p = players[id], mine = res.players[id]; if (!p) return;
    if (m) m.session += mine.total;
    if (!res.scored) return;
    const clean = room.stopper === id && room.settings.cats.every(c => mine.cats[c].status === 'ok');
    const got = G.applyRound(p, { points: mine.total, won: res.winner === id, hadWinner: !!res.winner, tableSize: n, cleanStop: clean }, now);
    if (got.length) room.unlocks[id] = got;
  });
  if (res.scored) savePlayers();
  room.phase = 'results'; tell(room);
}
setInterval(() => { const now = Date.now(); rooms.forEach((r, code) => { if (!Array.from(r.members.values()).some(online) && now - r.active > 10 * 60000) { clearTimeout(r.timer); rooms.delete(code); } }); }, 60000).unref();

/* ---------- http ---------- */
const regs = new Map();
function limited(ip) { const now = Date.now(), list = (regs.get(ip) || []).filter(t => now - t < 3600000); list.push(now); regs.set(ip, list); return list.length > 30; }
function send(res, code, body) { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); }
function readBody(req, res, cb) {
  let size = 0; const chunks = [];
  req.on('data', c => { size += c.length; if (size > MAX_BODY) { send(res, 413, { error: 'too large' }); req.destroy(); } else chunks.push(c); });
  req.on('end', () => { if (size > MAX_BODY) return; let j = {}; try { if (size) j = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (e) { return send(res, 400, { error: 'bad json' }); } cb(j && typeof j === 'object' ? j : {}); });
}

const server = http.createServer((req, res) => {
  const origin = req.headers.origin;
  if (origin && (ORIGINS.includes('*') || ORIGINS.includes(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization'); res.setHeader('Access-Control-Max-Age', '86400');
  }
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  let url; try { url = new URL(req.url, 'http://x'); } catch (e) { return send(res, 400, { error: 'bad url' }); }
  const parts = url.pathname.split('/').filter(Boolean), GET = req.method === 'GET', POST = req.method === 'POST';
  if (parts[0] === 'health') return send(res, 200, { ok: true, game: 'where-is-prince-mohsey', players: Object.keys(players).length, tables: rooms.size });
  if (parts[0] !== 'api') return send(res, 404, { error: 'not found' });
  const what = parts[1], me = auth(req, url);

  if (GET && what === 'meta') return send(res, 200, meta());
  if (GET && what === 'leaderboard') return send(res, 200, { players: Object.values(players).sort(G.compareBoard).slice(0, 200).map(pub) });
  if (POST && what === 'register') return readBody(req, res, b => {
    const ip = req.headers['cf-connecting-ip'] || req.socket.remoteAddress || '';
    if (limited(ip)) return send(res, 429, { error: 'Too many new players from here. Try again later.' });
    const name = cleanName(b.name);
    if (G.key(name).length < 2) return send(res, 400, { error: 'Choose a name with at least two letters.' });
    if (nameTaken(name)) return send(res, 409, { error: 'That name is taken. Choose another.' });
    const id = 'p' + rid(6), token = rid(24), p = G.newPlayer(id, name, Date.now());
    p.hash = sha(token); if (b.kingdom === 'turan') p.kingdom = 'turan'; if (['Prince', 'Princess', 'Champion'].includes(b.royal)) p.royal = b.royal;
    players[id] = p; savePlayers(); send(res, 200, { key: id + '.' + token, me: priv(p) });
  });
  if (!me) return send(res, 401, { error: 'Sign in first.' });
  me.lastSeen = Date.now();

  if (GET && what === 'me') return send(res, 200, { me: priv(me) });
  if (POST && what === 'profile') return readBody(req, res, b => {
    if (b.name !== undefined) { const name = cleanName(b.name); if (G.key(name).length < 2) return send(res, 400, { error: 'Choose a name with at least two letters.' }); if (nameTaken(name, me.id)) return send(res, 409, { error: 'That name is taken. Choose another.' }); me.name = name; }
    if (b.kingdom === 'iran' || b.kingdom === 'turan') me.kingdom = b.kingdom;
    if (['Prince', 'Princess', 'Champion'].includes(b.royal)) me.royal = b.royal;
    savePlayers(); rooms.forEach(r => { if (r.members.has(me.id)) tell(r); }); send(res, 200, { me: priv(me) });
  });

  /* levels: the story opens when the points are there; the quiz decides the rest */
  if (GET && what === 'story') {
    const n = +parts[2], L = LEVELS[n - 1];
    if (!L || !(n <= me.level || (n === me.level + 1 && G.quizReady(me)))) return send(res, 403, { error: 'This chapter is still locked.' });
    return send(res, 200, { n, title: L.title, story: L.story, video: L.video || '', sources: L.sources || [], passed: n <= me.level });
  }
  if (POST && what === 'quiz' && parts[2] === 'start') {
    const L = LEVELS[me.level];
    if (!G.quizReady(me) || !L) return send(res, 409, { error: 'You need more points before this quiz.' });
    if (!me.quiz || me.quiz.level !== me.level + 1) {            // the draw is made once: asking again returns the same questions
      const idx = L.quiz.map((_, i) => i); for (let i = idx.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [idx[i], idx[j]] = [idx[j], idx[i]]; }
      me.quiz = { level: me.level + 1, items: idx.slice(0, G.LEVELS.quizSize).map(qi => { const order = [0, 1, 2, 3]; for (let i = 3; i > 0; i--) { const j = crypto.randomInt(i + 1); [order[i], order[j]] = [order[j], order[i]]; } return { qi, order }; }) };
      savePlayers();
    }
    return send(res, 200, { level: me.quiz.level, pass: G.LEVELS.quizPass, questions: me.quiz.items.map(it => ({ q: L.quiz[it.qi].q, options: it.order.map(o => L.quiz[it.qi].options[o]) })) });
  }
  if (POST && what === 'quiz' && parts[2] === 'answer') return readBody(req, res, b => {
    const L = LEVELS[me.level], qz = me.quiz;
    if (!qz || !L || qz.level !== me.level + 1 || !Array.isArray(b.answers) || b.answers.length !== qz.items.length) return send(res, 409, { error: 'There is no quiz to answer.' });
    const wrong = []; qz.items.forEach((it, i) => { if (it.order[b.answers[i]] !== L.quiz[it.qi].answer) wrong.push(i); });
    const r = G.applyQuiz(me, qz.items.length - wrong.length, Date.now()); savePlayers();
    send(res, 200, { passed: r.passed, level: r.level, correct: r.correct, of: qz.items.length, wrong, unlocks: r.unlocks, me: priv(me) });
  });

  /* tables */
  if (what !== 'rooms') return send(res, 404, { error: 'not found' });
  if (GET && parts.length === 2) return send(res, 200, { tables: Array.from(rooms.values()).filter(r => r.open && Array.from(r.members.values()).some(online)).slice(0, 30).map(r => ({ code: r.code, phase: r.phase, players: Array.from(r.members.values()).filter(online).map(m => players[m.id].name), host: (players[r.host] || {}).name || '' })) });
  if (POST && parts.length === 2) return readBody(req, res, b => {
    if (rooms.size >= MAX_ROOMS) return send(res, 503, { error: 'Every table is taken. Try again in a few minutes.' });
    const code = roomCode();
    rooms.set(code, { code, host: me.id, open: b.open !== false, settings: JSON.parse(JSON.stringify(G.DEFAULT_SETTINGS)), members: new Map(), phase: 'lobby', letter: '', endsAt: 0, reviewEndsAt: 0, round: 0, stopper: null, rejects: {}, results: null, unlocks: {}, timer: null, active: Date.now() });
    send(res, 200, { code });
  });
  const room = rooms.get(String(parts[2] || '').toUpperCase()), action = parts[3];
  if (!room) return send(res, 404, { error: 'That table has closed.' });

  if (GET && action === 'events') {
    let m = room.members.get(me.id);
    if (!m) { if (room.members.size >= G.MAX_PLAYERS) return send(res, 409, { error: 'That table is full.' }); m = { id: me.id, conns: new Set(), answers: {}, ready: false, session: 0, inRound: false }; room.members.set(me.id, m); }
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write('retry: 2000\n\n'); m.conns.add(res); tell(room);
    const beat = setInterval(() => res.write(': keep-alive\n\n'), 25000);
    req.on('close', () => { clearInterval(beat); m.conns.delete(res); if (rooms.get(room.code) === room) tell(room); });
    return;
  }
  const m = room.members.get(me.id);
  if (!POST || !m) return send(res, 403, { error: 'Join the table first.' });
  readBody(req, res, b => {
    if (action === 'leave') {
      room.members.delete(me.id); m.conns.forEach(c => c.end());
      if (!room.members.size) { clearTimeout(room.timer); rooms.delete(room.code); } else { if (room.host === me.id) room.host = room.members.keys().next().value; tell(room); }
      return send(res, 200, { ok: true });
    }
    if (action === 'settings') {
      if (!canDrive(room, me.id) || (room.phase !== 'lobby' && room.phase !== 'results')) return send(res, 409, { error: 'Only the host can change the table between rounds.' });
      if (b.lang === 'en' || b.lang === 'fa') room.settings.lang = b.lang;
      if ([60, 90, 120].includes(b.secs)) room.settings.secs = b.secs;
      if (Array.isArray(b.cats)) { const cats = G.CATEGORIES.map(c => c.id).filter(id => b.cats.includes(id)); if (cats.length >= 3) room.settings.cats = cats; }
      if (typeof b.open === 'boolean') room.open = b.open;
      tell(room); return send(res, 200, { ok: true });
    }
    if (action === 'start') {
      if (!canDrive(room, me.id)) return send(res, 409, { error: 'The host starts the round.' });
      if (room.phase !== 'lobby' && room.phase !== 'results') return send(res, 409, { error: 'A round is already running.' });
      const err = startRound(room); return err ? send(res, 409, { error: err }) : send(res, 200, { ok: true });
    }
    if (action === 'answers') {
      if ((room.phase !== 'play' && room.phase !== 'collect') || !m.inRound) return send(res, 409, { error: 'The round is over.' });
      const a = {}; room.settings.cats.forEach(c => { a[c] = G.clean((b.answers || {})[c]); }); m.answers = a;
      if (room.phase === 'play') tell(room); return send(res, 200, { ok: true });
    }
    if (action === 'stop') {
      if (room.phase !== 'play' || !m.inRound) return send(res, 409, { error: 'The round is over.' });
      if (b.answers) { const a = {}; room.settings.cats.forEach(c => { a[c] = G.clean(b.answers[c]); }); m.answers = a; }
      if (!room.settings.cats.every(c => G.key(m.answers[c]))) return send(res, 409, { error: 'Fill in every category before you call Stop.' });
      room.stopper = me.id; endPlay(room); return send(res, 200, { ok: true });
    }
    if (action === 'vote') {
      const t = room.members.get(String(b.player || ''));
      if (room.phase !== 'review' || !m.inRound || !t || !t.inRound || t.id === me.id || !room.settings.cats.includes(b.cat)) return send(res, 409, { error: 'You cannot vote on that.' });
      const set = ((room.rejects[t.id] = room.rejects[t.id] || {})[b.cat] = room.rejects[t.id][b.cat] || new Set());
      if (b.reject) set.add(me.id); else set.delete(me.id);
      tell(room); return send(res, 200, { ok: true });
    }
    if (action === 'ready') {
      if (room.phase !== 'review') return send(res, 409, { error: 'Nothing to confirm.' });
      m.ready = true;
      if (Array.from(room.members.values()).filter(x => x.inRound && online(x)).every(x => x.ready)) finish(room); else tell(room);
      return send(res, 200, { ok: true });
    }
    send(res, 404, { error: 'not found' });
  });
});
server.listen(PORT, () => console.log('Where is Prince Mohsey? server on port ' + PORT + ', data in ' + DATA + ', ' + LEVELS.length + ' level stories, allowing ' + ORIGINS.join(', ')));
