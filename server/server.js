// "Where is the Prince?" game server. No dependencies, Node 18 or newer.
//
//   node server/server.js
//
// Environment:
//   PORT             port to listen on (default 8787)
//   DATA_DIR         where players are stored (default server/data)
//   ALLOWED_ORIGINS  comma-separated sites allowed to call it (default https://game.mosi-app.com)
//
// Each table elects a referee from its volunteers. The server picks the letter, keeps the clock, hides answers
// until the round ends, applies the automatic checks and the referee's decisions, scores the round, and owns
// every player's points, wins, level and badges. Rules live in game.js; stories and quiz answers in levels.json.
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const G = require('./game.js');

const PORT = +(process.env.PORT || 8787);
const DATA = process.env.DATA_DIR || path.join(__dirname, 'data');
const ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://game.mosi-app.com').split(',').map(s => s.trim()).filter(Boolean);
const HOST = process.env.HOST || '127.0.0.1';   // local only: the tunnel on this machine is the way in
const COLLECT_MS = +(process.env.COLLECT_MS || 1500), REVIEW_MS = +(process.env.REVIEW_MS || 300000), MAX_BODY = 32 * 1024, MAX_ROOMS = 300;
// Pace limits, so points cannot be manufactured faster than a real table plays.
const MIN_PLAY_MS = +(process.env.MIN_PLAY_MS || 20000), ROUNDS_PER_HOUR = +(process.env.ROUNDS_PER_HOUR || 40);
const REFEREE_GRACE_MS = +(process.env.REFEREE_GRACE_MS || 20000);   // how long a round waits for a referee who dropped out
const MAX_PLAYERS_TOTAL = 5000, MAX_STREAMS = 600, NEW_PLAYERS_PER_HOUR = 300;
fs.mkdirSync(DATA, { recursive: true });

let LEVELS = [];
let FINALE = null;   // chapter 8: Prince Mohsey's story, the Simurgh's riddle and its ending
try { const book = JSON.parse(fs.readFileSync(process.env.LEVELS_FILE || path.join(__dirname, 'levels.json'), 'utf8')); LEVELS = book.levels || []; FINALE = book.finale || null; } catch (e) { console.error('levels.json could not be read: ' + e.message); }
const M = require('./mohsey.js'), MOHSEY_SECS = +(process.env.MOHSEY_SECS || 120);
const duels = new Map();   // a game against Prince Mohsey in progress, by player

/* ---------- players (persisted) ---------- */
const FILE = path.join(DATA, 'players.json');
let players = Object.create(null);
try { Object.assign(players, JSON.parse(fs.readFileSync(FILE, 'utf8')).players); }
catch (e) {
  // Only a missing file means a first run. Anything else must not be papered over, or the next save would wipe every player.
  if (e.code !== 'ENOENT') { console.error('players.json exists but cannot be read (' + e.message + '). Fix or move it; a copy of the last good save is players.json.bak.'); process.exit(1); }
}
Object.values(players).forEach(p => { delete p.admin; });   // an earlier version kept admin rights on player accounts

// The owner: one admin login that is not a player. Its name and a hash of its password are set on the server with
// server/set-owner.sh, which writes OWNER_USER and OWNER_HASH to /etc/our-little-universe.env.
const OWNER_USER = process.env.OWNER_USER || '', OWNER_HASH = process.env.OWNER_HASH || '';
const OWNER_LINK = /^[0-9a-f]{64}$/.test(process.env.OWNER_LINK || '') ? process.env.OWNER_LINK : '';   // the hash of the owner's sign-in link (server/owner-link.sh)
const ownerSessions = new Map();   // hash of the token -> when it expires; signing in again after a restart is fine
const OWNER_DAYS = 30, ownerFails = new Map();
// The owner's password is set in a terminal but typed on a phone: spaces at either end are dropped (as the terminal
// does), and Persian or Arabic digits count as the same digits, so a Persian keyboard still works.
const ownerPw = v => (typeof v === 'string' ? v : '').normalize('NFC').replace(/[\u06F0-\u06F9]/g, d => String(d.charCodeAt(0) - 0x06F0)).replace(/[\u0660-\u0669]/g, d => String(d.charCodeAt(0) - 0x0660)).trim().slice(0, 200);

// Daily numbers for the owner's dashboard: rounds played, who played, and new accounts, for the last 90 days.
const STATS_FILE = path.join(DATA, 'stats.json');
let stats = { days: {} };
try { stats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8')); if (!stats.days) stats.days = {}; } catch (e) { /* a first run, or no stats yet */ }
const today = (t) => new Date(t || Date.now()).toLocaleDateString('sv-SE');   // YYYY-MM-DD in the server's time zone
function dayOf(t) { const d = today(t); return stats.days[d] = stats.days[d] || { rounds: 0, players: [], signups: 0 }; }
let statsTimer = null;
function saveStats() {
  clearTimeout(statsTimer);
  statsTimer = setTimeout(() => {
    const keep = Object.keys(stats.days).sort().slice(-90), days = {}; keep.forEach(d => { days[d] = stats.days[d]; }); stats.days = days;
    fs.writeFile(STATS_FILE + '.tmp', JSON.stringify(stats), err => { if (!err) fs.rename(STATS_FILE + '.tmp', STATS_FILE, () => {}); });
  }, 500);
}
function countRound(ids) { const d = dayOf(); d.rounds += 1; ids.forEach(id => { if (!d.players.includes(id)) d.players.push(id); }); saveStats(); }
function countSignup() { dayOf().signups += 1; saveStats(); }

// Messages from the contact form, for the owner. Kept in messages.json in the data folder (the newest 2000).
const MSG_FILE = path.join(DATA, 'messages.json'), TOPICS = ['account', 'password', 'bug', 'player', 'idea', 'other'];
let messages = [];
try { messages = JSON.parse(fs.readFileSync(MSG_FILE, 'utf8')).messages || []; } catch (e) { /* none yet */ }
let msgTimer = null;
const MAIL = require('./mail.js');
// email each new message to the owner; a failed send is tried again later (up to 6 times), and the message stays on the dashboard either way
function mailMessage(m) {
  if (!MAIL.ready() || m.mailed || (m.tries || 0) >= 6) return;
  m.tries = (m.tries || 0) + 1;
  MAIL.send(MAIL.forMessage(m)).then(() => { m.mailed = Date.now(); saveMessages(); }, e => { console.error('email for a message failed (' + m.tries + '/6): ' + e.message); saveMessages(); });
}
setInterval(() => { messages.filter(m => !m.mailed && (m.tries || 0) < 6 && Date.now() - m.at < 3 * 86400000).slice(-20).forEach(mailMessage); }, 10 * 60000).unref();
function saveMessages() { clearTimeout(msgTimer); msgTimer = setTimeout(() => { messages = messages.slice(-2000); fs.writeFile(MSG_FILE + '.tmp', JSON.stringify({ messages }), err => { if (!err) fs.rename(MSG_FILE + '.tmp', MSG_FILE, () => {}); }); }, 300); }
const msgText = (v, n) => (typeof v === 'string' ? v : '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').replace(/\r\n?/g, '\n').trim().slice(0, n);

// Google sign-in: the browser gets a signed token from Google; the server checks Google's signature, the audience
// (our client ID) and the expiry, then signs the player in. Only Google's account number is kept, never the email.
// Only something shaped like a client ID is ever used or shown: the client ID is public, a client secret must never be.
const GOOGLE_RAW = (process.env.GOOGLE_CLIENT_ID || '').trim(), GOOGLE_CLIENT_ID = /^[A-Za-z0-9-]+\.apps\.googleusercontent\.com$/.test(GOOGLE_RAW) ? GOOGLE_RAW : '';
if (GOOGLE_RAW && !GOOGLE_CLIENT_ID) console.error('GOOGLE_CLIENT_ID is not a Google client ID (it must end in .apps.googleusercontent.com), so Google sign-in is off. Was the client secret used by mistake?');
const GOOGLE_CERTS_URL = process.env.GOOGLE_CERTS_URL || 'https://www.googleapis.com/oauth2/v3/certs';
let googleKeys = null, googleKeysAt = 0;
async function googleKey(kid) {
  if (!googleKeys || Date.now() - googleKeysAt > 3600000 || !googleKeys[kid]) {
    const r = await fetch(GOOGLE_CERTS_URL); if (!r.ok) throw new Error('Google keys: ' + r.status);
    const j = await r.json(); googleKeys = {}; (j.keys || []).forEach(k => { googleKeys[k.kid] = crypto.createPublicKey({ key: k, format: 'jwk' }); }); googleKeysAt = Date.now();
  }
  return googleKeys[kid];
}
async function checkGoogle(token) {
  const parts = typeof token === 'string' ? token.split('.') : [];
  if (parts.length !== 3) return null;
  const dec = x => JSON.parse(Buffer.from(x, 'base64url').toString('utf8'));
  let head, body; try { head = dec(parts[0]); body = dec(parts[1]); } catch (e) { return null; }
  if (head.alg !== 'RS256' || typeof head.kid !== 'string') return null;
  const k = await googleKey(head.kid); if (!k) return null;
  if (!crypto.verify('RSA-SHA256', Buffer.from(parts[0] + '.' + parts[1]), k, Buffer.from(parts[2], 'base64url'))) return null;
  const now = Date.now() / 1000;
  if (body.aud !== GOOGLE_CLIENT_ID || !['accounts.google.com', 'https://accounts.google.com'].includes(body.iss) || !(body.exp > now) || typeof body.sub !== 'string' || !body.sub) return null;
  return body;
}
let saveTimer = null, saving = false, dirty = false, boardCache = null;
function savePlayers() { boardCache = null; clearTimeout(saveTimer); saveTimer = setTimeout(writePlayers, 200); }   // any change also refreshes the leaderboard
function writePlayers() {
  if (saving) { dirty = true; return; }                     // never two writes to the same temp file
  saving = true; dirty = false; const tmp = FILE + '.tmp';
  fs.writeFile(tmp, JSON.stringify({ players }), err => {
    const done = () => { saving = false; if (dirty) writePlayers(); };
    if (err) { console.error('save failed: ' + err.message); return done(); }
    fs.copyFile(FILE, FILE + '.bak', () => fs.rename(tmp, FILE, done));   // keep the previous good save beside the new one
  });
}
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const rid = n => crypto.randomBytes(n).toString('hex');
const has = id => typeof id === 'string' && Object.prototype.hasOwnProperty.call(players, id);
function auth(req, url, allowQuery) {
  const h = req.headers.authorization || '', raw = h.startsWith('Bearer ') ? h.slice(7) : (allowQuery ? url.searchParams.get('k') || '' : '');
  const dot = raw.indexOf('.'); if (dot < 1) return null;
  const id = raw.slice(0, dot), p = has(id) ? players[id] : null; if (!p) return null;
  const mine = sha(raw.slice(dot + 1));                     // a signed-in device holds a random token; only its hash is kept
  if (!sessionsOf(p).includes(mine)) return null;
  req.session = mine; return p;
}
function sessionsOf(p) { if (!Array.isArray(p.sessions)) { p.sessions = typeof p.hash === 'string' ? [p.hash] : []; delete p.hash; } return p.sessions; }
function signIn(p) { const token = rid(24); p.sessions = sessionsOf(p).concat([sha(token)]).slice(-8); savePlayers(); return p.id + '.' + token; }
const okPw = v => typeof v === 'string' && v.length >= 6 && v.length <= 100;
function hashPw(pw, cb) { const salt = crypto.randomBytes(16); crypto.scrypt(pw, salt, 32, (e, k) => cb(e, e ? '' : salt.toString('hex') + ':' + k.toString('hex'))); }
function checkPw(pw, stored, cb) {
  const parts = String(stored || '').split(':'), salt = Buffer.from(parts[0] || '00', 'hex'), want = Buffer.from(parts[1] || '', 'hex');
  crypto.scrypt(pw, salt, 32, (e, k) => cb(!e && want.length === k.length && crypto.timingSafeEqual(k, want)));   // always does the work, so a missing account answers no faster
}
const tries = new Map();
function tooManyTries(k, max) { const now = Date.now(), list = (tries.get(k) || []).filter(t => now - t < 900000); if (list.length >= max) { tries.set(k, list); return true; } list.push(now); tries.set(k, list); return false; }
function cleanName(s) { return (typeof s === 'string' ? s : '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 20); }
function nameTaken(name, except) { const k = G.key(name); return Object.values(players).some(p => p.id !== except && G.key(p.name) === k); }
function pub(p) { const r = G.rankOf(p); return { id: p.id, name: p.name, kingdom: p.kingdom, royal: p.royal, level: p.level, finale: !!p.finale, total: p.total, wins: p.wins, rounds: p.rounds, streak: p.streak, best: p.best, rank: r ? r.id : null, title: r ? G.rankTitle(r, p) : '' }; }
function priv(p) {
  const prog = {}; G.ACHIEVEMENTS.forEach(a => { prog[a.id] = Math.min(a.goal, a.value(p)); });
  return Object.assign(pub(p), { refereed: p.refereed || 0, mohseyWins: p.mohseyWins || 0, mohseyGames: p.mohseyGames || 0, news: p.news || [], levelPoints: p.levelPoints, need: G.nextLevelNeed(p), quizReady: G.quizReady(p), quizPending: !!p.quiz, quizFails: p.quizFails, hasPassword: !!p.pw, google: !!p.google, ranks: p.ranks, ach: p.ach, progress: prog });
}
function meta() {
  return {
    googleClientId: GOOGLE_CLIENT_ID,
    categories: G.CATEGORIES, defaults: G.DEFAULT_SETTINGS, points: G.POINTS, maxPlayers: G.MAX_PLAYERS, minScored: G.MIN_SCORED, minTable: G.MIN_TABLE, reviewSeconds: REVIEW_MS / 1000,
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
    referee: room.phase === 'lobby' || room.phase === 'results' ? electedReferee(room) : room.referee, notice: room.notice || '',
    volunteers: Array.from(room.volunteers.keys()).filter(id => room.members.has(id)), votes: Object.fromEntries(Array.from(room.votes).filter(([v, c]) => room.members.has(v) && room.volunteers.has(c))),
    players: Array.from(room.members.values()).filter(m => has(m.id)).map(m => Object.assign(pub(players[m.id]), { online: online(m), inRound: m.inRound, ready: m.ready, session: m.session,
      filled: room.phase === 'play' || room.phase === 'collect' ? room.cats.filter(c => G.key((m.answers || {})[c])).length : 0 }))
  };
  if (live) v.scores = room.results || score(room);
  if (room.phase === 'results') { v.stopper = room.stopper; v.unlocks = room.unlocks; }
  return v;
}
function score(room) {
  const answers = {};
  room.members.forEach(m => { if (m.inRound) answers[m.id] = m.answers; });
  return G.scoreRound({ letter: room.letter, cats: room.cats, answers, invalid: room.rejects });   // the referee's rejections
}
function tell(room) {
  const msg = 'event: state\ndata: ' + JSON.stringify(view(room)) + '\n\n';
  room.members.forEach(m => m.conns.forEach(c => { if (c.writableLength > 262144) c.destroy(); else c.write(msg); }));   // a stream nobody reads is dropped, not buffered
  room.active = Date.now();
}
let streams = 0;
function dropFromOtherTables(id, keep) {              // one table at a time
  rooms.forEach(r => { if (r !== keep && r.members.has(id)) depart(r, id); });
}
function depart(room, id) {
  const m = room.members.get(id); if (!m) return;
  m.conns.forEach(c => c.end()); m.conns.clear();
  const mid = m.inRound && room.phase !== 'lobby' && room.phase !== 'results';
  if (mid) m.left = true; else room.members.delete(id);   // someone who leaves mid-round still counts in that round's scoring
  const stay = Array.from(room.members.values()).filter(x => !x.left);
  if (!stay.length) { clearTimeout(room.timer); rooms.delete(room.code); return; }
  if (room.host === id) room.host = (stay.find(online) || stay[0]).id;
  room.volunteers.delete(id); room.votes.delete(id);
  if (id === room.referee) refereeGone(room); else tell(room);
}
/* ---------- choosing the referee ----------
   Anyone can volunteer; everyone else votes for one volunteer. The online volunteer with the most votes (at least one)
   is the referee; a tie goes to whoever volunteered first. The choice is fixed while a round is running. */
function electedReferee(room) {
  const counts = new Map();
  room.votes.forEach((cand, voter) => { const v = room.members.get(voter), c = room.members.get(cand); if (v && c && voter !== cand && room.volunteers.has(cand) && online(c)) counts.set(cand, (counts.get(cand) || 0) + 1); });
  let best = null;
  counts.forEach((n, id) => { if (!best || n > counts.get(best) || (n === counts.get(best) && room.volunteers.get(id) < room.volunteers.get(best))) best = id; });
  return best;
}
// The referee dropped out mid-round: wait a little for them to come back, then cancel the round.
function refereeGone(room) {
  tell(room);
  if (room.phase === 'lobby' || room.phase === 'results') return;
  clearTimeout(room.grace);
  room.grace = setTimeout(() => {
    const r = room.members.get(room.referee);
    if (r && online(r) && !r.left) return;
    clearTimeout(room.timer); room.phase = 'lobby'; room.results = null; room.referee = null;
    room.members.forEach((m, id) => { m.inRound = false; if (m.left) room.members.delete(id); });
    room.notice = 'The referee left, so the round was cancelled and nobody scored. Choose a new referee.'; tell(room);
  }, REFEREE_GRACE_MS);
}
function canDrive(room, id) { const h = room.members.get(room.host); return id === room.host || !h || !online(h); }

function startRound(room) {
  room.members.forEach((m, id) => { if (m.left || !online(m)) { room.members.delete(id); room.volunteers.delete(id); room.votes.delete(id); } });   // seats of people who have gone are freed between rounds
  const ref = electedReferee(room), playing = Array.from(room.members.values()).filter(m => online(m) && m.id !== ref);
  if (!ref) return 'Choose a referee first: someone volunteers, and the others vote.';
  if (playing.length < G.MIN_TABLE - 1) return 'You need at least ' + (G.MIN_TABLE - 1) + ' players besides the referee.';
  clearTimeout(room.timer); clearTimeout(room.grace); room.cats = room.settings.cats.slice(); room.startedAt = Date.now(); room.referee = ref; room.notice = '';
  const pool = G.LETTERS[room.settings.lang].filter(l => l !== room.letter);
  room.letter = pool[crypto.randomInt(pool.length)]; room.round += 1; room.phase = 'play'; room.stopper = null; room.results = null; room.unlocks = {}; room.rejects = {};
  room.members.forEach(m => { m.inRound = online(m) && m.id !== ref; m.answers = {}; m.ready = false; });
  room.endsAt = Date.now() + room.settings.secs * 1000; room.reviewEndsAt = 0;
  room.timer = setTimeout(() => endPlay(room), room.settings.secs * 1000);
  tell(room); return null;
}
function endPlay(room) {
  if (room.phase !== 'play') return;
  clearTimeout(room.timer); room.phase = 'collect'; tell(room);      // a short grace so every browser can hand in what was typed
  room.timer = setTimeout(() => { room.phase = 'review'; room.reviewStart = Date.now(); room.reviewEndsAt = Date.now() + REVIEW_MS; tell(room); room.timer = setTimeout(() => finish(room), REVIEW_MS); }, COLLECT_MS);
}
function finish(room) {
  if (room.phase !== 'review') return;
  clearTimeout(room.timer); clearTimeout(room.grace);
  const res = score(room), now = Date.now(), n = res.order.length; room.results = res; room.unlocks = {};
  res.order.forEach(id => {
    const m = room.members.get(id), p = has(id) ? players[id] : null, mine = res.players[id]; if (!p) return;
    if (m) m.session += mine.total;
    if (!res.scored) return;
    const recent = (pace.get(id) || []).filter(t => now - t < 3600000);
    if (recent.length >= ROUNDS_PER_HOUR) { mine.capped = true; return; }      // more rounds in an hour than a table can really play: not counted
    recent.push(now); pace.set(id, recent);
    const clean = room.stopper === id && room.cats.every(c => mine.cats[c].status === 'ok');
    const got = G.applyRound(p, { points: mine.total, won: res.winner === id, hadWinner: !!res.winner, tableSize: n, cleanStop: clean }, now);
    if (got.length) { room.unlocks[id] = got; p.news = (p.news || []).concat(got).slice(-20); }
  });
  const ref = has(room.referee) ? players[room.referee] : null;
  if (ref && res.scored) { ref.refereed = (ref.refereed || 0) + 1; const got = G.checkUnlocks(ref, now); if (got.length) { room.unlocks[ref.id] = got; ref.news = (ref.news || []).concat(got).slice(-20); } }
  res.referee = room.referee;
  if (res.scored) { savePlayers(); countRound(res.order.concat(room.referee ? [room.referee] : [])); }
  room.phase = 'results'; tell(room);
}
const pace = new Map();
setInterval(() => {
  const now = Date.now();
  rooms.forEach((r, code) => { const idle = now - r.active; if (!Array.from(r.members.values()).some(online) && idle > (r.members.size ? 10 * 60000 : 90000)) { clearTimeout(r.timer); clearTimeout(r.grace); rooms.delete(code); } });
  regs.forEach((list, ip) => { if (!list.some(t => now - t < 3600000)) regs.delete(ip); });
  tries.forEach((list, k) => { if (!list.some(t => now - t < 900000)) tries.delete(k); });
  pace.forEach((list, id) => { if (!list.some(t => now - t < 3600000)) pace.delete(id); });
  duels.forEach((d, id) => { if (now - d.endsAt > 3600000) duels.delete(id); });
}, 60000).unref();

/* ---------- http ---------- */
const regs = new Map();
let newPlayers = [];
function limited(ip) {
  const now = Date.now(), list = (regs.get(ip) || []).filter(t => now - t < 3600000);
  newPlayers = newPlayers.filter(t => now - t < 3600000);
  if (list.length >= 30 || newPlayers.length >= NEW_PLAYERS_PER_HOUR || Object.keys(players).length >= MAX_PLAYERS_TOTAL) { regs.set(ip, list); return true; }
  list.push(now); regs.set(ip, list); newPlayers.push(now); return false;
}
let boardAt = 0;
// Everyone, from every table, in one ranking. The full order is cached for a few seconds; any change to a player clears it.
let rankedAll = null;
function ranked() { const now = Date.now(); if (!rankedAll || !boardCache || now - boardAt > 5000) { rankedAll = Object.values(players).sort(G.compareBoard).map((p, i) => Object.assign(pub(p), { place: i + 1 })); boardCache = true; boardAt = now; } return rankedAll; }
function leaderboard(q) {
  const all = ranked(), k = G.key(typeof q === 'string' ? q.slice(0, 40) : '');
  return k ? { total: all.length, query: q, players: all.filter(p => G.key(p.name).includes(k)).slice(0, 50) } : { total: all.length, players: all.slice(0, 200) };
}
function send(res, code, body) { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); }
function readBody(req, res, cb) {
  let size = 0; const chunks = [];
  req.on('data', c => { size += c.length; if (size > MAX_BODY) { send(res, 413, { error: 'too large' }); req.destroy(); } else chunks.push(c); });
  req.on('end', () => {
    if (size > MAX_BODY) return; let j = {};
    try { if (size) j = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (e) { return send(res, 400, { error: 'bad json' }); }
    try { cb(j && typeof j === 'object' && !Array.isArray(j) ? j : {}); } catch (e) { oops(res, e); }
  });
}

function oops(res, e) { console.error('request failed: ' + (e && e.stack || e)); try { if (!res.headersSent) send(res, 500, { error: 'Something went wrong on the server.' }); else res.end(); } catch (x) { /* nothing more to do */ } }
const server = http.createServer((req, res) => { try { handle(req, res); } catch (e) { oops(res, e); } });   // no request can take the process down
function handle(req, res) {
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
  const what = parts[1], me = auth(req, url, parts[1] === 'rooms' && parts[3] === 'events');   // the key may ride in the address only for the event stream, which cannot send headers

  if (GET && what === 'meta') return send(res, 200, meta());
  if (GET && what === 'leaderboard') return send(res, 200, leaderboard(url.searchParams.get('q')));
  if (POST && what === 'register') return readBody(req, res, b => {
    const ip = String(req.headers['cf-connecting-ip'] || req.socket.remoteAddress || '').slice(0, 64);
    if (limited(ip)) return send(res, 429, { error: 'Too many new players from here. Try again later.' });
    const name = cleanName(b.name);
    if (G.key(name).length < 2) return send(res, 400, { error: 'Choose a name with at least two letters.' });
    if (!okPw(b.password)) return send(res, 400, { error: 'Choose a password of at least 6 characters.' });
    if (nameTaken(name)) return send(res, 409, { error: 'That name is taken. If it is yours, sign in instead.' });
    hashPw(b.password, (err, pw) => { try {
      if (err) return oops(res, err);
      if (nameTaken(name)) return send(res, 409, { error: 'That name is taken. If it is yours, sign in instead.' });
      const id = 'p' + rid(6), p = G.newPlayer(id, name, Date.now());
      p.pw = pw; p.sessions = []; if (typeof b.kingdom === 'string' && Object.prototype.hasOwnProperty.call(G.KINGDOMS, b.kingdom)) p.kingdom = b.kingdom; if (['Prince', 'Princess', 'Champion'].includes(b.royal)) p.royal = b.royal;
      players[id] = p; countSignup(); send(res, 200, { key: signIn(p), me: priv(p) });
    } catch (e) { oops(res, e); } });
  });
  if (POST && what === 'google') return readBody(req, res, b => {
    const ip = String(req.headers['cf-connecting-ip'] || req.socket.remoteAddress || '').slice(0, 64);
    if (!GOOGLE_CLIENT_ID) return send(res, 503, { error: 'Google sign-in is not set up on this server.' });
    if (tooManyTries('google:' + ip, 60)) return send(res, 429, { error: 'Too many attempts. Wait a few minutes and try again.' });
    checkGoogle(b.credential).then(g => {
      if (!g) return send(res, 401, { error: 'Google could not confirm who you are. Try again.' });
      const known = Object.values(players).find(p => p.google === g.sub);
      if (known) return send(res, 200, { key: signIn(known), me: priv(known) });
      if (b.name === undefined) return send(res, 200, { needName: true, suggestion: cleanName(g.given_name || '') });   // a first visit: choose a name in the kingdom
      if (limited(ip)) return send(res, 429, { error: 'Too many new players from here. Try again later.' });
      const name = cleanName(b.name);
      if (G.key(name).length < 2) return send(res, 400, { error: 'Choose a name with at least two letters.' });
      if (nameTaken(name)) return send(res, 409, { error: 'That name is taken. Choose another.' });
      const id = 'p' + rid(6), p = G.newPlayer(id, name, Date.now());
      p.google = g.sub; p.sessions = []; if (typeof b.kingdom === 'string' && Object.prototype.hasOwnProperty.call(G.KINGDOMS, b.kingdom)) p.kingdom = b.kingdom; if (['Prince', 'Princess', 'Champion'].includes(b.royal)) p.royal = b.royal;
      players[id] = p; countSignup(); send(res, 200, { key: signIn(p), me: priv(p) });
    }).catch(e => { console.error('google sign-in: ' + e.message); send(res, 502, { error: 'Google could not be reached. Try again in a moment.' }); });
  });

  /* the contact form: open to everyone, signed in or not */
  if (POST && what === 'contact') return readBody(req, res, b => {
    const ip = String(req.headers['cf-connecting-ip'] || req.socket.remoteAddress || '').slice(0, 64);
    const text = msgText(b.message, 2000), name = me ? me.name : cleanName(b.name), reply = msgText(b.reply, 120), topic = TOPICS.includes(b.topic) ? b.topic : 'other';
    if (text.length < 5) return send(res, 400, { error: 'Write a few words, please.' });
    if (!me && G.key(name).length < 1 && !reply) return send(res, 400, { error: 'Tell us your name in the game, or how to reach you.' });
    if (tooManyTries('contact:' + ip, 6) || tooManyTries('contact', 200)) return send(res, 429, { error: 'Thank you! You have sent several messages already. Try again a little later.' });
    const m = { id: 'm' + rid(6), at: Date.now(), topic, text, name, reply, player: me ? me.id : null, done: false }; messages.push(m); saveMessages(); mailMessage(m);
    console.log('a new message from ' + (name || 'someone') + ' (' + topic + ')');
    send(res, 200, { ok: true });
  });

  /* the owner's dashboard: not a player account */
  if (what === 'owner') {
    if (POST && parts[2] === 'link') return readBody(req, res, b => {   // the owner's personal sign-in link: no name or password to type
      const ip = String(req.headers['cf-connecting-ip'] || req.socket.remoteAddress || '').slice(0, 64), now = Date.now();
      const fails = (ownerFails.get(ip) || []).filter(x => now - x < 900000);
      if (fails.length >= 8) return send(res, 429, { error: 'Too many wrong tries. Wait 15 minutes and try again.' });
      const tok = typeof b.token === 'string' ? b.token.trim() : '', h = Buffer.from(sha(tok), 'hex'), want = Buffer.from(OWNER_LINK || '00', 'hex');
      if (!OWNER_LINK || !/^[0-9a-f]{48}$/.test(tok) || h.length !== want.length || !crypto.timingSafeEqual(h, want)) { ownerFails.set(ip, fails.concat(now)); return send(res, 401, { error: 'This sign-in link is not valid any more. Make a new one on the server: bash server/owner-link.sh' }); }
      const token = rid(24); ownerSessions.set(sha(token), now + OWNER_DAYS * 86400000);
      console.log('the owner signed in with the link'); send(res, 200, { key: 'owner.' + token });
    });
    if (POST && parts[2] === 'login') return readBody(req, res, b => {
      const ip = String(req.headers['cf-connecting-ip'] || req.socket.remoteAddress || '').slice(0, 64);
      if (!OWNER_USER || !OWNER_HASH) return send(res, 503, { error: 'No owner is set up yet. On the server run: bash server/set-owner.sh' });
      const now = Date.now(), fails = (ownerFails.get(ip) || []).filter(x => now - x < 900000), all = (ownerFails.get('*') || []).filter(x => now - x < 900000);
      if (fails.length >= 8 || all.length >= 30) return send(res, 429, { error: 'Too many wrong tries. Wait 15 minutes and try again.' });   // only wrong tries count
      const u = typeof b.user === 'string' ? b.user.trim().toLowerCase().slice(0, 60) : '';
      checkPw(ownerPw(b.password), OWNER_HASH, good => { try {
        if (!good || u !== OWNER_USER.toLowerCase()) { ownerFails.set(ip, fails.concat(now)); ownerFails.set('*', all.concat(now)); return send(res, 401, { error: 'That name and password do not match.' }); }
        const token = rid(24); ownerSessions.set(sha(token), Date.now() + OWNER_DAYS * 86400000);
        console.log('the owner signed in'); send(res, 200, { key: 'owner.' + token });
      } catch (e) { oops(res, e); } });
    });
    const h = req.headers.authorization || '', t = h.startsWith('Bearer owner.') ? sha(h.slice(13)) : '', until = t && ownerSessions.get(t);
    if (!until || until < Date.now()) { if (t) ownerSessions.delete(t); return send(res, 401, { error: 'Sign in as the owner first.' }); }
    if (POST && parts[2] === 'logout') { ownerSessions.delete(t); return send(res, 200, { ok: true }); }
    const target = id => has(id) ? players[id] : null, seated = id => Array.from(rooms.values()).some(r => { const m = r.members.get(id); return m && online(m); });
    if (GET && parts[2] === 'stats') {
      const now = Date.now(), all = Object.values(players), dayMs = 86400000, startToday = new Date(today() + 'T00:00:00').getTime();
      const online = new Set(); let tables = 0, playing = 0;
      rooms.forEach(r => { let any = false; r.members.forEach(m => { if (m.conns.size) { online.add(m.id); any = true; } }); if (any) { tables++; if (r.phase !== 'lobby' && r.phase !== 'results') playing++; } });
      const days = []; for (let i = 13; i >= 0; i--) { const d = today(now - i * dayMs), x = stats.days[d] || { rounds: 0, players: [], signups: 0 }; days.push({ date: d, rounds: x.rounds, players: x.players.length, signups: x.signups }); }
      const week = days.slice(-7), weekPlayers = new Set(); Object.keys(stats.days).filter(d => d >= days[7].date).forEach(d => stats.days[d].players.forEach(id => weekPlayers.add(id)));
      const chapters = Array.from({ length: G.LEVELS.count + 1 }, (_, n) => all.filter(p => p.level === n && !(n === G.LEVELS.count && p.finale)).length);
      return send(res, 200, {
        now: { online: online.size, tables, playing }, messages: messages.filter(m => !m.done).length,
        players: { total: all.length, newToday: all.filter(p => p.createdAt >= startToday).length, newWeek: all.filter(p => now - p.createdAt < 7 * dayMs).length, activeToday: all.filter(p => p.lastSeen >= startToday).length, activeWeek: all.filter(p => now - p.lastSeen < 7 * dayMs).length, google: all.filter(p => p.google).length },
        rounds: { today: days[13].rounds, week: week.reduce((t, d) => t + d.rounds, 0), playersToday: days[13].players, playersWeek: weekPlayers.size, since: Object.keys(stats.days).sort()[0] || today() },
        progress: { chapters, finale: all.filter(p => p.finale).length, quizzesPassed: all.reduce((t, p) => t + (p.level || 0), 0), mohseyGames: all.reduce((t, p) => t + (p.mohseyGames || 0), 0), mohseyWins: all.reduce((t, p) => t + (p.mohseyWins || 0), 0) },
        days, recent: all.slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, 8).map(p => ({ name: p.name, createdAt: p.createdAt, google: !!p.google })),
        top: ranked().slice(0, 10)
      });
    }
    if (GET && parts[2] === 'messages') {
      const list = messages.slice().reverse().slice(0, 300).map(m => Object.assign({}, m, { playerName: m.player && has(m.player) ? players[m.player].name : '', exists: !m.player || has(m.player) }));
      return send(res, 200, { open: messages.filter(m => !m.done).length, total: messages.length, email: MAIL.ready(), messages: list });
    }
    if (POST && parts[2] === 'message') return readBody(req, res, b => {
      const i = messages.findIndex(m => m.id === b.id); if (i < 0) return send(res, 404, { error: 'That message is gone.' });
      if (b.remove === true) messages.splice(i, 1); else messages[i].done = b.done !== false;
      saveMessages(); send(res, 200, { ok: true, open: messages.filter(m => !m.done).length });
    });
    if (GET && parts[2] === 'players') {
      const k = G.key(String(url.searchParams.get('q') || '').slice(0, 40)), all = ranked();
      const list = all.filter(p => !k || G.key(p.name).includes(k)).slice(0, 500).map(x => { const p = players[x.id]; return Object.assign({}, x, { refereed: p.refereed || 0, levelPoints: p.levelPoints, createdAt: p.createdAt, lastSeen: p.lastSeen, devices: sessionsOf(p).length, online: seated(p.id), google: !!p.google, hasPassword: !!p.pw }); });
      return send(res, 200, { total: all.length, players: list });
    }
    if (POST && parts[2] === 'remove') return readBody(req, res, b => {
      const p = target(b.id);
      if (!p) return send(res, 404, { error: 'There is no such player.' });
      dropFromOtherTables(p.id, null); pace.delete(p.id); duels.delete(p.id); delete players[p.id]; savePlayers();
      console.log('the owner removed the account ' + p.name + ' (' + p.id + ')');
      send(res, 200, { ok: true, removed: p.name });
    });
    if (POST && parts[2] === 'password') return readBody(req, res, b => {
      const p = target(b.id);
      if (!p) return send(res, 404, { error: 'There is no such player.' });
      if (!okPw(b.password)) return send(res, 400, { error: 'Choose a password of at least 6 characters.' });
      hashPw(b.password, (err, pw) => { try { if (err) return oops(res, err); p.pw = pw; p.sessions = []; savePlayers(); console.log('the owner set a new password for ' + p.name); send(res, 200, { ok: true }); } catch (e) { oops(res, e); } });   // every device of theirs is signed out
    });
    return send(res, 404, { error: 'not found' });
  }
  if (POST && what === 'login') return readBody(req, res, b => {
    const ip = String(req.headers['cf-connecting-ip'] || req.socket.remoteAddress || '').slice(0, 64), k = G.key(cleanName(b.name));
    if (tooManyTries('ip:' + ip, 60) || tooManyTries(ip + '|' + k, 10)) return send(res, 429, { error: 'Too many attempts. Wait a few minutes and try again.' });
    const p = k ? Object.values(players).find(x => G.key(x.name) === k) : null;
    checkPw(typeof b.password === 'string' ? b.password.slice(0, 100) : '', p && p.pw, good => { try {
      if (!p || !good) return send(res, 401, { error: 'That name and password do not match.' });
      send(res, 200, { key: signIn(p), me: priv(p) });
    } catch (e) { oops(res, e); } });
  });
  if (!me) return send(res, 401, { error: 'Sign in first.' });
  me.lastSeen = Date.now();

  if (GET && what === 'me') return send(res, 200, { me: priv(me) });
  if (POST && what === 'news') { me.news = []; savePlayers(); return send(res, 200, { ok: true }); }

  if (POST && what === 'logout') { me.sessions = sessionsOf(me).filter(h => h !== req.session); savePlayers(); return send(res, 200, { ok: true }); }
  if (POST && what === 'password') return readBody(req, res, b => {
    if (!okPw(b.password)) return send(res, 400, { error: 'Choose a password of at least 6 characters.' });
    const set = () => hashPw(b.password, (err, pw) => { try { if (err) return oops(res, err); me.pw = pw; me.sessions = [req.session]; savePlayers(); send(res, 200, { me: priv(me) }); } catch (e) { oops(res, e); } });   // other devices are signed out
    if (!me.pw) return set();
    checkPw(typeof b.current === 'string' ? b.current.slice(0, 100) : '', me.pw, good => { try { if (!good) return send(res, 401, { error: 'The current password is not right.' }); set(); } catch (e) { oops(res, e); } });
  });
  if (POST && what === 'profile') return readBody(req, res, b => {
    if (b.name !== undefined) { const name = cleanName(b.name); if (G.key(name).length < 2) return send(res, 400, { error: 'Choose a name with at least two letters.' }); if (nameTaken(name, me.id)) return send(res, 409, { error: 'That name is taken. Choose another.' });
      me.name = name; }
    if (typeof b.kingdom === 'string' && Object.prototype.hasOwnProperty.call(G.KINGDOMS, b.kingdom)) me.kingdom = b.kingdom;
    if (['Prince', 'Princess', 'Champion'].includes(b.royal)) me.royal = b.royal;
    savePlayers(); rooms.forEach(r => { if (r.members.has(me.id)) tell(r); }); send(res, 200, { me: priv(me) });
  });

  /* levels: the story opens when the points are there; the quiz decides the rest */
  if (GET && what === 'story') {
    const n = +parts[2], L = LEVELS[n - 1];
    if (!L || !(n <= me.level || (n === me.level + 1 && G.quizReady(me)))) return send(res, 403, { error: 'This chapter is still locked.' });
    return send(res, 200, { n, title: L.title, story: L.story, video: L.video || '', sources: L.sources || [], clue: L.clue || '', passed: n <= me.level });
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
    let right = 0; qz.items.forEach((it, i) => { const a = b.answers[i]; if (Number.isInteger(a) && a >= 0 && a < 4 && it.order[a] === L.quiz[it.qi].answer) right += 1; });
    const r = G.applyQuiz(me, right, Date.now()); savePlayers();
    send(res, 200, { passed: r.passed, level: r.level, correct: r.correct, of: qz.items.length, unlocks: r.unlocks, me: priv(me) });   // only the count: which ones were wrong is not revealed
  });

  /* chapter 8: the Simurgh's riddle. It opens once all seven chapters are passed. */
  if (what === 'finale') {
    if (!FINALE || me.level < G.LEVELS.count) return send(res, 403, { error: 'Pass all seven chapters of Rostam\u2019s life to open the last one.' });
    const page = () => ({ title: FINALE.title, story: FINALE.story, riddle: FINALE.riddle, clues: LEVELS.map(L => L.clue || ''), solved: !!me.finale, ending: me.finale ? FINALE.ending : undefined });
    if (GET && parts.length === 2) return send(res, 200, page());
    if (POST && parts[2] === 'answer') return readBody(req, res, b => {
      if (me.finale) return send(res, 200, Object.assign(page(), { correct: true, unlocks: [], me: priv(me) }));
      const k = G.key(typeof b.answer === 'string' ? b.answer.slice(0, 60) : '');
      if (!k) return send(res, 400, { error: 'Type the name of a city.' });
      if (tooManyTries('finale:' + me.id, 40)) return send(res, 429, { error: 'The Simurgh is resting. Try again in a few minutes.' });
      if ((FINALE.answers || []).some(a => k.includes(G.key(a)))) {
        me.finale = Date.now(); const unlocks = G.checkUnlocks(me, me.finale); savePlayers();
        console.log(me.name + ' solved the Simurgh\u2019s riddle');
        return send(res, 200, Object.assign(page(), { correct: true, unlocks, me: priv(me) }));
      }
      me.finaleTries = (me.finaleTries || 0) + 1; savePlayers();
      const near = Object.keys(FINALE.near || {}).find(n => k.includes(G.key(n))), hints = FINALE.hints || [];
      send(res, 200, { correct: false, hint: near ? FINALE.near[near] : hints[Math.min(me.finaleTries, hints.length) - 1] || 'Not this one.' });
    });
    return send(res, 404, { error: 'not found' });
  }

  /* the last reward: a game of Esm Famil against Prince Mohsey, played by the server. It does not change the leaderboard. */
  if (what === 'mohsey') {
    if (!me.finale) return send(res, 403, { error: 'Solve the Simurgh\u2019s riddle to find Prince Mohsey first.' });
    const d = duels.get(me.id), open = d && Date.now() < d.endsAt + 8000;
    if (GET && parts.length === 2) return send(res, 200, { wins: me.mohseyWins || 0, draws: me.mohseyDraws || 0, games: me.mohseyGames || 0, duel: open ? { letter: d.letter, cats: d.cats, endsAt: d.endsAt, now: Date.now(), hello: d.hello } : null });
    if (POST && parts[2] === 'start') {
      if (open) return send(res, 200, { letter: d.letter, cats: d.cats, endsAt: d.endsAt, now: Date.now(), hello: d.hello });
      const letters = G.LETTERS.en, cats = G.DEFAULT_SETTINGS.cats.slice(), letter = letters[crypto.randomInt(letters.length)];
      const duel = { letter, cats, endsAt: Date.now() + MOHSEY_SECS * 1000, bot: M.play(letter, cats), hello: M.pick(M.LINES.hello) };
      duels.set(me.id, duel); return send(res, 200, { letter, cats, endsAt: duel.endsAt, now: Date.now(), hello: duel.hello });
    }
    if (POST && parts[2] === 'answer') return readBody(req, res, b => {
      if (!d) return send(res, 409, { error: 'There is no game running. Start a new one.' });
      duels.delete(me.id);
      const late = !open, src = b.answers && typeof b.answers === 'object' ? b.answers : {}, mine = {};
      d.cats.forEach(c => { mine[c] = late ? '' : G.clean(src[c]); });
      const sc = G.scoreRound({ letter: d.letter, cats: d.cats, answers: { you: mine, mohsey: d.bot } });
      const you = sc.players.you, him = sc.players.mohsey, winner = sc.winner;
      const unknown = d.cats.filter(c => you.cats[c].status === 'ok' && !you.cats[c].shared && !M.knows(c, you.cats[c].text));
      const shared = d.cats.filter(c => you.cats[c].shared).length;
      const notes = [shared ? (shared === 1 ? 'We had the same answer once: we share those points.' : 'We had the same answer ' + shared + ' times: we share those points.') : '',
        unknown.length ? 'I didn\u2019t know ' + (unknown.length === 1 ? 'one of your words' : unknown.length + ' of your words') + ', but in Rum I learned to trust a friend.' : ''].filter(Boolean);
      me.mohseyGames = (me.mohseyGames || 0) + 1; if (winner === 'you') me.mohseyWins = (me.mohseyWins || 0) + 1; else if (!winner) me.mohseyDraws = (me.mohseyDraws || 0) + 1;
      const unlocks = G.checkUnlocks(me, Date.now()); savePlayers();
      send(res, 200, { letter: d.letter, cats: d.cats, you, mohsey: him, winner, late, notes, line: M.pick(late ? M.LINES.late : winner === 'you' ? M.LINES.lose : winner === 'mohsey' ? M.LINES.win : M.LINES.draw), unknown, wins: me.mohseyWins || 0, draws: me.mohseyDraws || 0, games: me.mohseyGames, unlocks, me: priv(me) });
    });
    return send(res, 404, { error: 'not found' });
  }

  /* tables */
  if (what !== 'rooms') return send(res, 404, { error: 'not found' });
  if (GET && parts.length === 2) return send(res, 200, { tables: Array.from(rooms.values()).filter(r => r.open && Array.from(r.members.values()).some(online)).slice(0, 30).map(r => ({ code: r.code, phase: r.phase, players: Array.from(r.members.values()).filter(m => online(m) && has(m.id)).map(m => players[m.id].name) })) });
  if (POST && parts.length === 2) return readBody(req, res, b => {
    if (rooms.size >= MAX_ROOMS) return send(res, 503, { error: 'Every table is taken. Try again in a few minutes.' });
    rooms.forEach((r, c) => { if (r.host === me.id && !Array.from(r.members.values()).some(x => x.id !== me.id && online(x))) { clearTimeout(r.timer); clearTimeout(r.early); rooms.delete(c); } });   // one table per host
    const code = roomCode();
    rooms.set(code, { code, host: me.id, open: true, settings: JSON.parse(JSON.stringify(G.DEFAULT_SETTINGS)), members: new Map(), phase: 'lobby', letter: '', cats: G.DEFAULT_SETTINGS.cats.slice(), startedAt: 0, reviewStart: 0, grace: null, referee: null, volunteers: new Map(), votes: new Map(), notice: '', endsAt: 0, reviewEndsAt: 0, round: 0, stopper: null, rejects: {}, results: null, unlocks: {}, timer: null, active: Date.now() });
    send(res, 200, { code });
  });
  const room = rooms.get(String(parts[2] || '').toUpperCase()), action = parts[3];
  if (!room) return send(res, 404, { error: 'That table has closed.' });

  if (GET && action === 'events') {
    let m = room.members.get(me.id);
    if (streams >= MAX_STREAMS) return send(res, 503, { error: 'The hall is full. Try again in a moment.' });
    if (!m) {
      if (room.members.size >= G.MAX_PLAYERS) { const gone = Array.from(room.members.values()).find(x => !online(x) && !(x.inRound && room.phase !== 'lobby' && room.phase !== 'results')); if (gone) room.members.delete(gone.id); }
      if (room.members.size >= G.MAX_PLAYERS) return send(res, 409, { error: 'That table is full.' });
      m = { id: me.id, conns: new Set(), answers: {}, ready: false, session: 0, inRound: false, left: false }; room.members.set(me.id, m);
    }
    dropFromOtherTables(me.id, room); m.left = false;
    m.conns.forEach(c => c.end()); m.conns.clear();              // one live stream per player per table
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write('retry: 2000\n\n'); m.conns.add(res); streams += 1; tell(room);
    const beat = setInterval(() => res.write(': keep-alive\n\n'), 25000);
    req.on('close', () => { clearInterval(beat); streams -= 1; m.conns.delete(res); if (rooms.get(room.code) === room) { if (m.id === room.referee && !online(m)) refereeGone(room); else tell(room); } });
    return;
  }
  const m = room.members.get(me.id);
  if (!POST || !m) return send(res, 403, { error: 'Join the table first.' });
  readBody(req, res, b => {
    if (action === 'leave') {
      depart(room, me.id); return send(res, 200, { ok: true });
    }
    if (action === 'settings') {
      if (!canDrive(room, me.id) || (room.phase !== 'lobby' && room.phase !== 'results')) return send(res, 409, { error: 'Only the host can change the table between rounds.' });
      if ([60, 90, 120].includes(b.secs)) room.settings.secs = b.secs;
      if (Array.isArray(b.cats)) { const cats = G.CATEGORIES.map(c => c.id).filter(id => b.cats.includes(id)); if (cats.length >= 3) room.settings.cats = cats; }
      tell(room); return send(res, 200, { ok: true });
    }
    if (action === 'start') {
      if (!canDrive(room, me.id)) return send(res, 409, { error: 'The host starts the round.' });
      if (room.phase !== 'lobby' && room.phase !== 'results') return send(res, 409, { error: 'A round is already running.' });
      const err = startRound(room); return err ? send(res, 409, { error: err }) : send(res, 200, { ok: true });
    }
    if (action === 'answers') {
      if ((room.phase !== 'play' && room.phase !== 'collect') || !m.inRound) return send(res, 409, { error: 'The round is over.' });
      m.answers = answersOf(room, b.answers);
      if (room.phase === 'play') tell(room); return send(res, 200, { ok: true });
    }
    if (action === 'stop') {
      if (room.phase !== 'play' || !m.inRound) return send(res, 409, { error: 'The round is over.' });
      const early = room.startedAt + MIN_PLAY_MS - Date.now();
      if (early > 0) return send(res, 409, { error: 'Too fast! Stop opens in ' + Math.ceil(early / 1000) + ' seconds.' });
      if (b.answers) m.answers = answersOf(room, b.answers);
      if (!room.cats.every(c => G.key(m.answers[c]))) return send(res, 409, { error: 'Fill in every category before you call Stop.' });
      room.stopper = me.id; endPlay(room); return send(res, 200, { ok: true });
    }
    /* choosing the referee, between rounds */
    const between = room.phase === 'lobby' || room.phase === 'results';
    if (action === 'volunteer') {
      if (!between) return send(res, 409, { error: 'You can volunteer between rounds.' });
      if (b.on === true) { if (!room.volunteers.has(me.id)) room.volunteers.set(me.id, Date.now()); room.votes.delete(me.id); }
      else { room.volunteers.delete(me.id); room.votes.forEach((c, v) => { if (c === me.id) room.votes.delete(v); }); }
      room.notice = ''; tell(room); return send(res, 200, { ok: true });
    }
    if (action === 'elect') {
      if (!between) return send(res, 409, { error: 'You can vote between rounds.' });
      if (b.player === null) { room.votes.delete(me.id); tell(room); return send(res, 200, { ok: true }); }
      if (typeof b.player !== 'string' || !room.volunteers.has(b.player) || !room.members.has(b.player)) return send(res, 409, { error: 'Vote for someone who has volunteered.' });
      if (b.player === me.id) return send(res, 409, { error: 'You cannot vote for yourself.' });
      room.votes.set(me.id, b.player); tell(room); return send(res, 200, { ok: true });
    }
    /* the referee at work */
    if (action === 'judge' || action === 'verdict') {
      if (room.phase !== 'review') return send(res, 409, { error: 'There is nothing to judge right now.' });
      if (me.id !== room.referee) return send(res, 403, { error: 'Only the referee decides.' });
      if (action === 'verdict') { finish(room); return send(res, 200, { ok: true }); }
      const t = typeof b.player === 'string' ? room.members.get(b.player) : null;
      if (!t || !t.inRound || typeof b.cat !== 'string' || !room.cats.includes(b.cat) || typeof b.accept !== 'boolean') return send(res, 409, { error: 'You cannot judge that.' });
      const mine = room.rejects[t.id] = room.rejects[t.id] || {};
      if (b.accept) delete mine[b.cat]; else mine[b.cat] = true;
      tell(room); return send(res, 200, { ok: true });
    }
    send(res, 404, { error: 'not found' });
  });
}
function answersOf(room, src) { const a = {}, o = src && typeof src === 'object' ? src : {}; room.cats.forEach(c => { a[c] = G.clean(o[c]); }); return a; }
server.listen(PORT, HOST, () => console.log('Where is the Prince? server on ' + HOST + ':' + PORT + ', data in ' + DATA + ', ' + LEVELS.length + ' level stories, allowing ' + ORIGINS.join(', ')));
