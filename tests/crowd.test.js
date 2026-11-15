// Thirty players on one evening: four tables of 12, 8, 6 and 4 playing at the same time, several rounds each,
// with empty, shared and made-up answers. The referee (a stand-in for the OpenAI service) strikes the made-up ones.
// Every score is worked out here independently and compared with the server, player by player.
// Run: node tests/crowd.test.js
process.env.LEVEL_SCALE = '0.02';
const { spawn } = require('child_process'), path = require('path'), assert = require('assert'), fs = require('fs'), http = require('http');
const G = require('../server/game.js'), fx = require('./fixture.js')(), PORT = 8797, base = 'http://127.0.0.1:' + PORT;
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; console.log('  ok  ' + m); };
const call = async (method, p, key, body) => { const r = await fetch(base + p, { method, headers: Object.assign({ 'Content-Type': 'application/json' }, key ? { Authorization: 'Bearer ' + key } : {}), body: body ? JSON.stringify(body) : undefined }); return { status: r.status, json: await r.json().catch(() => ({})) }; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function listen(code, key) { const ctl = new AbortController(), box = { state: null, close: () => ctl.abort() }; const r = await fetch(base + '/api/rooms/' + code + '/events?k=' + key, { signal: ctl.signal });
  (async () => { const dec = new TextDecoder(); let buf = ''; try { for await (const ch of r.body) { buf += dec.decode(ch, { stream: true }); let i; while ((i = buf.indexOf('\n\n')) >= 0) { const m = /data: (.*)/.exec(buf.slice(0, i)); buf = buf.slice(i + 2); if (m) box.state = JSON.parse(m[1]); } } } catch (e) { /* closed */ } })(); return box; }
const until = async (f, what) => { for (let i = 0; i < 400; i++) { if (f()) return; await sleep(40); } throw new Error('timed out: ' + what); };
let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

// the stand-in referee service: anything containing "bad" is not a real example
const AI_PORT = PORT + 1; let aiItems = 0;
const ai = http.createServer((req, res) => { let body = ''; req.on('data', c => { body += c; }); req.on('end', () => {
  const items = JSON.parse(JSON.parse(body).messages[1].content).items; aiItems += items.length;
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ verdicts: items.map(x => ({ i: x.i, valid: !/bad/i.test(x.answer), why: /bad/i.test(x.answer) ? 'made up' : '' })) }) } }] }));
}); }).listen(AI_PORT, '127.0.0.1');

const CATS = ['name', 'surname', 'city', 'animal', 'food', 'thing', 'color'];
(async () => {
  const srv = spawn('node', [path.join(__dirname, '..', 'server', 'server.js')], { env: Object.assign({}, process.env, { PORT, DATA_DIR: fx.dir, LEVELS_FILE: fx.file, COLLECT_MS: '100', REVIEW_MS: '5000', MIN_PLAY_MS: '0', MIN_REVIEW_MS: '0', ROUNDS_PER_HOUR: '1000', REFEREE_TEST: '1', OPENAI_API_KEY: 'k', REFEREE_MODEL: 'm', REFEREE_BASE_URL: 'http://127.0.0.1:' + AI_PORT }), stdio: 'ignore' });
  const t0 = Date.now();
  try {
    await sleep(700);
    const names = Array.from({ length: 30 }, (_, i) => 'Player' + String(i + 1).padStart(2, '0')), P = {}, E = {};
    await Promise.all(names.map(async name => { const r = await call('POST', '/api/register', null, { name, password: 'pw-' + name }); P[name] = { key: r.json.key, id: r.json.me.id }; E[r.json.me.id] = { name, total: 0, wins: 0, rounds: 0, streak: 0, best: 0 }; }));
    ok(Object.keys(P).length === 30 && Object.values(P).every(p => p.key), 'thirty players create accounts at the same time');

    const sizes = [12, 8, 6, 4], groups = []; let k = 0; sizes.forEach(s => { groups.push(names.slice(k, k + s)); k += s; });
    const tables = await Promise.all(groups.map(async g => {
      const code = (await call('POST', '/api/rooms', P[g[0]].key, {})).json.code, eyes = {};
      for (const nm of g) eyes[nm] = await listen(code, P[nm].key);
      await until(() => eyes[g[0]].state && eyes[g[0]].state.players.filter(p => p.online).length === g.length, 'table ' + code);
      await call('POST', '/api/rooms/' + code + '/settings', P[g[0]].key, { cats: CATS });
      await until(() => eyes[g[0]].state.settings.cats.length === CATS.length, 'categories');
      return { code, g, eyes };
    }));
    ok(tables.length === 4 && (await call('GET', '/api/rooms', P.Player01.key)).json.tables.length === 4, 'four tables of 12, 8, 6 and 4 players are open at once');
    ok((await call('GET', '/api/rooms/' + tables[0].code + '/events?k=' + P.Player13.key)).status === 409, 'a thirteenth player cannot squeeze onto the full table of 12');

    // plan: for each player and category, an answer that is unique, shared with others, empty, or made up
    const plan = g => { const p = {}; g.forEach(nm => { p[nm] = CATS.map(() => { const x = rnd(); return x < 0.55 ? 'unique' : x < 0.75 ? 'same' : x < 0.88 ? 'empty' : 'bad'; }); }); p[g[0]] = p[g[0]].map(s => s === 'empty' ? 'unique' : s); return p; };
    const text = (L, nm, k, style) => style === 'empty' ? '' : style === 'same' ? L + 'shared' + CATS[k] : style === 'bad' ? L + 'bad' + nm + CATS[k] : L + nm + CATS[k];
    async function round(t) {
      const host = P[t.g[0]], eye = t.eyes[t.g[0]], pl = plan(t.g);
      await call('POST', '/api/rooms/' + t.code + '/start', host.key); await until(() => eye.state.phase === 'play', 'play');
      const L = eye.state.letter;
      await Promise.all(t.g.slice(1).map(nm => call('POST', '/api/rooms/' + t.code + '/answers', P[nm].key, { answers: Object.fromEntries(CATS.map((c, k) => [c, text(L, nm, k, pl[nm][k])])) })));
      await call('POST', '/api/rooms/' + t.code + '/stop', host.key, { answers: Object.fromEntries(CATS.map((c, k) => [c, text(L, t.g[0], k, pl[t.g[0]][k])])) });
      await until(() => eye.state.phase === 'review', 'review');
      await Promise.all(t.g.map(nm => call('POST', '/api/rooms/' + t.code + '/ready', P[nm].key))); await until(() => eye.state.phase === 'results', 'results');
      // the expected verdict, worked out here: made-up answers are struck, shared ones score 5, unique ones 10
      const pts = {}; t.g.forEach(nm => { pts[nm] = 0; });
      CATS.forEach((c, k) => { const shared = t.g.filter(nm => pl[nm][k] === 'same').length; t.g.forEach(nm => { const s = pl[nm][k]; if (s === 'unique') pts[nm] += 10; else if (s === 'same') pts[nm] += shared > 1 ? 5 : 10; }); });
      const top = Math.max(...Object.values(pts)), w = t.g.filter(nm => pts[nm] === top), winner = top > 0 && w.length === 1 ? w[0] : null;
      t.g.forEach(nm => { const e = E[P[nm].id]; e.total += pts[nm]; e.rounds += 1; if (winner === nm) { e.wins += 1; e.streak += 1; e.best = Math.max(e.best, e.streak); } else if (winner) e.streak = 0; });
      return eye.state;
    }
    const ROUNDS = 4, timing = [];
    for (let r = 0; r < ROUNDS; r++) { const s = Date.now(); await Promise.all(tables.map(round)); timing.push(Date.now() - s); }
    ok(true, ROUNDS + ' rounds played at all four tables in parallel (' + ROUNDS * 4 + ' rounds, ' + ROUNDS * 30 + ' player-rounds); slowest batch ' + Math.max(...timing) + ' ms');
    const before = (await call('GET', '/api/me', P.Player05.key)).json.me;
    ok(before.total === 0 && before.pendingRounds === ROUNDS, 'before the referee, nobody has any points yet; every round is waiting');

    const v = await call('POST', '/api/referee', P.Player01.key);
    ok(v.json.rounds === ROUNDS * 4 && !v.json.error, 'the referee judges all ' + ROUNDS * 4 + ' rounds (' + aiItems + ' answers sent to the service)');

    const wrong = [];
    for (const name of names) {
      const me = (await call('GET', '/api/me', P[name].key)).json.me, e = E[P[name].id];
      ['total', 'wins', 'rounds', 'streak', 'best'].forEach(f => { if (me[f] !== e[f]) wrong.push(name + ' ' + f + ' ' + me[f] + ' expected ' + e[f]); });
      G.RANKS.forEach(r => { if (!!me.ranks[r.id] !== (e.wins >= r.wins)) wrong.push(name + ' rank ' + r.id); });
      if (me.levelPoints !== Math.min(e.total, G.levelPoints(1))) wrong.push(name + ' level points ' + me.levelPoints);
      if (me.pendingRounds !== 0) wrong.push(name + ' still waiting');
    }
    ok(wrong.length === 0, 'all thirty records are exactly right: points, wins, rounds, streaks, ranks and level progress' + (wrong.length ? '\n      ' + wrong.slice(0, 15).join('\n      ') : ''));
    const struck = (await call('GET', '/api/me', P.Player02.key)).json.me.verdict;
    ok(struck && struck.struck.every(x => /bad/.test(x.text)) && struck.claimed >= struck.points, 'each verdict lists only the made-up answers, and points only ever go down from what the table showed');
    const board = (await call('GET', '/api/leaderboard')).json.players, sorted = board.slice().sort((a, b) => b.level - a.level || b.total - a.total || b.wins - a.wins);
    ok(board.length === 30 && board.every((p, i) => p.id === sorted[i].id && p.total === E[p.id].total), 'the leaderboard lists all thirty, in the right order, with the right points');
    console.log('\n  top five: ' + board.slice(0, 5).map(p => p.name + ' ' + p.total).join(', '));
    console.log('\ncrowd: ' + n + ' checks passed in ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
  } finally { srv.kill(); ai.close(); fs.rmSync(fx.dir, { recursive: true, force: true }); }
})().catch(e => { console.error('FAILED: ' + e.message); process.exit(1); });
