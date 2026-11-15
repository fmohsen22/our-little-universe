// A busy evening on the real server: 9 players at 3 tables playing at the same time, people signing in on new
// devices, a server restart in the middle, and at the end a cross-check of every player's record:
// points add up, wins add up, the leaderboard is in the right order, and every badge matches the numbers.
// Run: node tests/scenario.test.js
const { spawn } = require('child_process'), path = require('path'), assert = require('assert'), fs = require('fs');
process.env.LEVEL_SCALE = '0.02';   // the same small chapters the test server uses
const G = require('../server/game.js'), fx = require('./fixture.js')(), PORT = 8793, base = 'http://127.0.0.1:' + PORT;
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; console.log('  ok  ' + m); };
const call = async (method, p, key, body) => { const r = await fetch(base + p, { method, headers: Object.assign({ 'Content-Type': 'application/json' }, key ? { Authorization: 'Bearer ' + key } : {}), body: body ? JSON.stringify(body) : undefined }); return { status: r.status, json: await r.json().catch(() => ({})) }; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function listen(code, key) { const ctl = new AbortController(), box = { state: null, close: () => ctl.abort() }; const r = await fetch(base + '/api/rooms/' + code + '/events?k=' + key, { signal: ctl.signal });
  (async () => { const dec = new TextDecoder(); let buf = ''; try { for await (const ch of r.body) { buf += dec.decode(ch, { stream: true }); let i; while ((i = buf.indexOf('\n\n')) >= 0) { const m = /data: (.*)/.exec(buf.slice(0, i)); buf = buf.slice(i + 2); if (m) box.state = JSON.parse(m[1]); } } } catch (e) { /* closed */ } })(); return box; }
const judge = async key => (await call('POST', '/api/referee', key)).json;
const NOCOUNTRY = { cats: ['name', 'surname', 'city', 'animal', 'food', 'thing', 'color'] };   // made-up test answers cannot be countries
const until = async (f, what) => { for (let i = 0; i < 200; i++) { if (f()) return; await sleep(40); } throw new Error('timed out: ' + what); };
const env = { PORT, REFEREE_TEST: '1', DATA_DIR: fx.dir, LEVELS_FILE: fx.file, LEVEL_SCALE: '0.02', COLLECT_MS: '100', REVIEW_MS: '4000', MIN_PLAY_MS: '0', MIN_REVIEW_MS: '0', ROUNDS_PER_HOUR: '1000' };
const start = () => spawn('node', [path.join(__dirname, '..', 'server', 'server.js')], { env: Object.assign({}, process.env, env), stdio: 'ignore' });

(async () => {
  let srv = start();
  const expected = {};               // what each player's record must be, worked out by this test independently of the server
  try {
    await sleep(700);
    const names = ['Mohsey', 'Sufi', 'Rudabeh', 'Zal', 'Tahmineh', 'Sohrab', 'Giv', 'Manizheh', 'Bizhan'], P = {};
    for (const name of names) { const r = (await call('POST', '/api/register', null, { name, password: 'pw-' + name + '-1', kingdom: names.indexOf(name) % 2 ? 'turan' : 'iran' })).json; P[name] = { key: r.key, id: r.me.id }; expected[r.me.id] = { name, total: 0, wins: 0, rounds: 0, streak: 0, best: 0, lossStreak: 0, bigWins: 0 }; }
    ok(Object.keys(P).length === 9, 'nine players create accounts');

    // three tables, filled at the same time: 2, 3 and 4 players
    const groups = [['Mohsey', 'Sufi'], ['Rudabeh', 'Zal', 'Tahmineh'], ['Sohrab', 'Giv', 'Manizheh', 'Bizhan']];
    const tables = await Promise.all(groups.map(async g => { const code = (await call('POST', '/api/rooms', P[g[0]].key, {})).json.code, eyes = {}; for (const nm of g) eyes[nm] = await listen(code, P[nm].key); await until(() => eyes[g[0]].state && eyes[g[0]].state.players.filter(p => p.online).length === g.length, 'table ' + code); await call('POST', '/api/rooms/' + code + '/settings', P[g[0]].key, NOCOUNTRY); return { code, g, eyes }; }));
    ok(new Set(tables.map(t => t.code)).size === 3 && (await call('GET', '/api/rooms', P.Giv.key)).json.tables.length === 3, 'three tables run side by side and all are listed');

    // one round at a table, with answers chosen so the scores are known in advance
    async function round(t, plan) {
      const host = P[t.g[0]], eye = t.eyes[t.g[0]];
      await call('POST', '/api/rooms/' + t.code + '/start', host.key); await until(() => eye.state.phase === 'play', 'play ' + t.code);
      const L = eye.state.letter, cats = eye.state.settings.cats;
      await Promise.all(t.g.map((nm, i) => { const a = {}; cats.forEach((c, k) => { const style = plan[nm] && plan[nm][k]; a[c] = style === 'empty' ? '' : style === 'same' ? L + 'shared' + c : L + nm + c; }); return call('POST', '/api/rooms/' + t.code + '/answers', P[nm].key, { answers: a }); }));
      const stopper = t.g.find(nm => !(plan[nm] || []).includes('empty'));   // Stop needs every box filled, so every plan has at least one full sheet
      assert.ok(stopper, 'test plan needs someone with every answer at ' + t.code);
      const all = {}; cats.forEach((c, k) => { const style = plan[stopper] && plan[stopper][k]; all[c] = style === 'same' ? L + 'shared' + c : L + stopper + c; });
      await call('POST', '/api/rooms/' + t.code + '/stop', P[stopper].key, { answers: all }); await until(() => eye.state.phase === 'review', 'review ' + t.code);
      await Promise.all(t.g.map(nm => call('POST', '/api/rooms/' + t.code + '/ready', P[nm].key))); await until(() => eye.state.phase === 'results', 'results ' + t.code);
      return eye.state;
    }
    // apply the same scoring rules this test expects, then compare with what the server says
    function expect(t, st, plan) {
      const cats = st.settings.cats, sc = {}; t.g.forEach(nm => { sc[nm] = 0; });
      cats.forEach((c, k) => { const same = t.g.filter(nm => (plan[nm] || [])[k] === 'same'); t.g.forEach(nm => { const s = (plan[nm] || [])[k]; if (s === 'empty') return; sc[nm] += s === 'same' && same.length > 1 ? 5 : 10; }); });
      const top = Math.max(...Object.values(sc)), winners = t.g.filter(nm => sc[nm] === top), winner = top > 0 && winners.length === 1 ? winners[0] : null;
      t.g.forEach(nm => { const e = expected[P[nm].id]; e.total += sc[nm]; e.rounds += 1;
        if (winner === nm) { e.wins += 1; e.streak += 1; e.lossStreak = 0; e.best = Math.max(e.best, e.streak); if (t.g.length >= 5) e.bigWins += 1; } else if (winner) { e.streak = 0; e.lossStreak += 1; } });
      t.g.forEach(nm => { assert.strictEqual(st.scores.players[P[nm].id].total, sc[nm], 'score of ' + nm + ': server ' + st.scores.players[P[nm].id].total + ', expected ' + sc[nm]); });
      assert.strictEqual(st.scores.winner, winner ? P[winner].id : null, 'winner at ' + t.code);
    }
    const plans = [
      [{ Sufi: ['empty', 'empty'] }, { Rudabeh: [, 'same'], Zal: [, 'same'] }, { Giv: ['empty'], Bizhan: ['same', 'same'], Manizheh: ['same', 'same'] }],
      [{ Mohsey: ['empty'] }, { Rudabeh: ['empty'] }, { Sohrab: ['empty', 'empty'] }],
      [{}, { Tahmineh: ['empty', 'empty', 'empty'] }, { Giv: ['empty'], Manizheh: ['empty'], Bizhan: ['empty', 'empty'] }],
      [{ Sufi: ['empty'] }, { Zal: ['empty'], Rudabeh: ['empty'] }, { Manizheh: ['empty'], Giv: ['empty'], Bizhan: ['empty'] }],
      [{ Sufi: ['empty'] }, { Zal: ['empty'], Rudabeh: ['empty'] }, { Manizheh: ['empty'], Giv: ['empty'], Bizhan: ['empty'] }]
    ];
    for (let r = 0; r < 3; r++) { const res = await Promise.all(tables.map((t, i) => round(t, plans[r][i]))); res.forEach((st, i) => expect(tables[i], st, plans[r][i])); }
    ok(true, 'three rounds played at all three tables at the same time; every score and winner is what the rules say');

    const waiting = (await call('GET', '/api/me', P.Giv.key)).json.me;
    ok(waiting.total === 0 && waiting.pendingRounds === 3, 'until the referee has judged, the rounds wait and nothing is on anyone’s record');
    const verdict = await judge(P.Giv.key);
    ok(verdict.rounds === 9, 'the referee judges all nine rounds from the three tables');

    // a second device signs in mid-evening and sees the same record
    const phone = (await call('POST', '/api/login', null, { name: 'sufi', password: 'pw-Sufi-1' })).json;
    ok(phone.me.total === expected[P.Sufi.id].total && phone.me.wins === expected[P.Sufi.id].wins, 'Sufi signs in on a new phone and sees exactly her points and wins');
    ok((await call('POST', '/api/login', null, { name: 'Sufi', password: 'pw-Mohsey-1' })).status === 401, 'another player’s password does not open her account');

    // the server restarts in the middle of the evening
    Object.values(tables).forEach(t => Object.values(t.eyes).forEach(e => e.close())); await sleep(500); srv.kill(); await sleep(300); srv = start(); await sleep(700);
    ok((await call('GET', '/api/me', P.Mohsey.key)).status === 200 && (await call('GET', '/api/me', phone.key)).status === 200, 'after a server restart everyone is still signed in on every device');
    ok((await call('GET', '/api/rooms', P.Giv.key)).json.tables.length === 0, 'tables in progress end with the restart, as documented');
    const t2 = await Promise.all(groups.map(async g => { const code = (await call('POST', '/api/rooms', P[g[0]].key, {})).json.code, eyes = {}; for (const nm of g) eyes[nm] = await listen(code, P[nm].key); await until(() => eyes[g[0]].state && eyes[g[0]].state.players.filter(p => p.online).length === g.length, 'table again'); await call('POST', '/api/rooms/' + code + '/settings', P[g[0]].key, NOCOUNTRY); return { code, g, eyes }; }));
    for (let r = 3; r < 5; r++) { const res = await Promise.all(t2.map((t, i) => round(t, plans[r][i]))); res.forEach((st, i) => expect(t2[i], st, plans[r][i])); }
    ok(true, 'two more rounds at three new tables after the restart, all scored as the rules say');

    // a big table of five for the hidden badge
    const big = ['Mohsey', 'Zal', 'Giv', 'Sohrab', 'Sufi'], bt = { code: (await call('POST', '/api/rooms', P.Mohsey.key, {})).json.code, g: big, eyes: {} };
    for (const nm of big) bt.eyes[nm] = await listen(bt.code, P[nm].key); await until(() => bt.eyes.Mohsey.state && bt.eyes.Mohsey.state.players.filter(p => p.online).length === 5, 'big table'); await call('POST', '/api/rooms/' + bt.code + '/settings', P.Mohsey.key, NOCOUNTRY);
    const bigPlan = { Zal: ['empty'], Giv: ['empty'], Sohrab: ['empty'], Sufi: ['empty', 'empty'] }, bs = await round(bt, bigPlan); expect(bt, bs, bigPlan);
    ok(bs.scores.winner === P.Mohsey.id, 'Mohsey wins at a table of five');

    // the final cross-check, player by player, after one more restart
    [...t2.flatMap(t => Object.values(t.eyes)), ...Object.values(bt.eyes)].forEach(e => e.close()); await sleep(500); srv.kill(); await sleep(300); srv = start(); await sleep(700);
    const kept = (await call('GET', '/api/me', P.Mohsey.key)).json.me;
    ok(kept.pendingRounds === 3, 'rounds still waiting for the referee survive a server restart');
    ok((await judge(P.Mohsey.key)).rounds === 7, 'the referee then judges the seven rounds that were waiting');
    const moh = (await call('GET', '/api/me', P.Mohsey.key)).json.me;
    ok(moh.ach.cup && moh.news.some(u => u.id === 'cup'), 'after the verdict, the win at a table of five unlocks the hidden Cup of Kay Khosrow, with a ceremony waiting');
    let wrong = [];
    for (const name of names) {
      const me = (await call('GET', '/api/me', P[name].key)).json.me, e = expected[P[name].id];
      for (const k of ['total', 'wins', 'rounds', 'streak', 'best']) if (me[k] !== e[k]) wrong.push(name + '.' + k + ' is ' + me[k] + ', expected ' + e[k]);
      G.RANKS.forEach(r => { if (!!me.ranks[r.id] !== (e.wins >= r.wins)) wrong.push(name + ' rank ' + r.id + ' is ' + !!me.ranks[r.id] + ' with ' + e.wins + ' wins'); });
      const stats = Object.assign(G.newPlayer('x', 'x', 0), e, { comebacks: me.progress.simurgh, cleanStops: me.progress.rakhsh, firstTries: 0 });
      G.ACHIEVEMENTS.forEach(a => { const should = a.value(stats) >= a.goal; if (!!me.ach[a.id] !== should) wrong.push(name + ' badge ' + a.id + ' is ' + !!me.ach[a.id] + ', expected ' + should); });
      const r = G.rankOf(me); if ((me.rank || null) !== (r ? r.id : null)) wrong.push(name + ' shown rank ' + me.rank);
      if (me.levelPoints !== Math.min(e.total, G.levelPoints(1))) wrong.push(name + ' level points ' + me.levelPoints);
      if (me.quizReady !== (e.total >= G.levelPoints(1))) wrong.push(name + ' quizReady ' + me.quizReady);
    }
    ok(wrong.length === 0, 'after a second restart, all nine records match: points, wins, rounds, streaks, ranks, badges and level progress' + (wrong.length ? '\n      ' + wrong.join('\n      ') : ''));
    const board = (await call('GET', '/api/leaderboard')).json.players, sorted = board.slice().sort((a, b) => b.level - a.level || b.total - a.total || b.wins - a.wins);
    ok(board.length === 9 && board.every((p, i) => p.id === sorted[i].id) && board.every(p => p.total === expected[p.id].total), 'the leaderboard lists all nine in the right order with the right points');
    const sumWins = Object.values(expected).reduce((s, e) => s + e.wins, 0);
    ok(board.reduce((s, p) => s + p.wins, 0) === sumWins, 'wins on the leaderboard add up to the rounds that had a winner (' + sumWins + ')');
    console.log('\n  leaderboard:\n' + board.map((p, i) => '    ' + (i + 1) + '. ' + p.name.padEnd(9) + ' points ' + String(p.total).padStart(3) + '  wins ' + p.wins + '  ' + (p.title || '-')).join('\n'));
    console.log('\nscenario: ' + n + ' checks passed');
  } finally { srv.kill(); fs.rmSync(fx.dir, { recursive: true, force: true }); }
})().catch(e => { console.error('FAILED: ' + e.message); process.exit(1); });
