// Plays the game against the real server over HTTP: accounts, a three-player round, votes, scoring, levels and the quiz.
// Run: node tests/server.test.js
const { spawn } = require('child_process'), path = require('path'), assert = require('assert'), fs = require('fs');
const fx = require('./fixture.js')(), PORT = 8791, base = 'http://127.0.0.1:' + PORT;
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; console.log('  ok  ' + m); };
const call = async (method, p, key, body) => { const r = await fetch(base + p, { method, headers: Object.assign({ 'Content-Type': 'application/json' }, key ? { Authorization: 'Bearer ' + key } : {}), body: body ? JSON.stringify(body) : undefined }); return { status: r.status, json: await r.json().catch(() => ({})) }; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
// a minimal Server-Sent Events reader that keeps the latest table state
async function listen(code, key) { const ctl = new AbortController(), box = { state: null, close: () => ctl.abort() }; const r = await fetch(base + '/api/rooms/' + code + '/events?k=' + key, { signal: ctl.signal }); if (!r.ok) { box.status = r.status; return box; }
  (async () => { const dec = new TextDecoder(); let buf = ''; try { for await (const chunk of r.body) { buf += dec.decode(chunk, { stream: true }); let i; while ((i = buf.indexOf('\n\n')) >= 0) { const m = /data: (.*)/.exec(buf.slice(0, i)); buf = buf.slice(i + 2); if (m) box.state = JSON.parse(m[1]); } } } catch (e) { /* closed */ } })(); return box; }
const until = async (f, what) => { for (let i = 0; i < 100; i++) { if (f()) return; await sleep(50); } throw new Error('timed out: ' + what); };

(async () => {
  const srv = spawn('node', [path.join(__dirname, '..', 'server', 'server.js')], { env: Object.assign({}, process.env, { PORT, DATA_DIR: fx.dir, LEVELS_FILE: fx.file, LEVEL_SCALE: '0.005', COLLECT_MS: '150', REVIEW_MS: '2500', ALLOWED_ORIGINS: 'https://game.mosi-app.com' }), stdio: 'inherit' });
  try {
    await sleep(700);
    const meta = (await call('GET', '/api/meta')).json;
    ok(meta.levels.length === 7 && meta.levels[0].points === 40 && meta.levels[1].points === 50 && meta.ranks.length === 8, 'meta lists seven levels (scaled down for the test) and eight ranks');
    const reg = async name => (await call('POST', '/api/register', null, { name, kingdom: name === 'Sufi' ? 'turan' : 'iran', royal: name === 'Sufi' ? 'Princess' : 'Prince' })).json;
    const A = await reg('Mohsey'), B = await reg('Sufi'), C = await reg('Rudabeh');
    ok(A.key && B.me.kingdom === 'turan' && (await call('POST', '/api/register', null, { name: 'mohsey ' })).status === 409, 'players register; a taken name is refused');
    ok((await call('GET', '/api/me', 'p000000.bad')).status === 401 && (await call('GET', '/api/me', A.key.replace(/.$/, 'x'))).status === 401 && (await call('GET', '/api/story/1', A.key)).status === 403, 'a wrong key is refused, and a locked chapter cannot be read');

    const code = (await call('POST', '/api/rooms', A.key, {})).json.code;
    const a = await listen(code, A.key), b = await listen(code, B.key), c = await listen(code, C.key);
    await until(() => a.state && a.state.players.length === 3, 'three players at the table');
    ok((await call('GET', '/api/rooms', B.key)).json.tables[0].players.length === 3, 'the open table is listed with its three players');
    ok((await call('POST', '/api/rooms/' + code + '/start', B.key)).status === 409, 'only the host can start');
    await call('POST', '/api/rooms/' + code + '/settings', A.key, { cats: ['name', 'city', 'food'], secs: 60 });

    // play rounds until Mohsey has the 40 points level 1 needs (30 a round)
    const round = async (cheat) => {
      await call('POST', '/api/rooms/' + code + '/start', A.key); await until(() => a.state.phase === 'play', 'round starts');
      const L = a.state.letter, w = s => L + s;
      ok(!JSON.stringify(b.state).includes('scores') && a.state.endsAt > a.state.now, 'during play nobody receives anyone else’s answers');
      await call('POST', '/api/rooms/' + code + '/answers', B.key, { answers: { name: w('ara'), city: w('same'), food: 'zzz-wrong-letter' } });
      await call('POST', '/api/rooms/' + code + '/answers', C.key, { answers: { name: w('ina'), city: w('same'), food: w('fake') } });
      ok((await call('POST', '/api/rooms/' + code + '/stop', A.key, { answers: { name: w('one'), city: '', food: '' } })).status === 409, 'Stop is refused until every box is filled');
      await call('POST', '/api/rooms/' + code + '/stop', A.key, { answers: { name: w('one'), city: w('two'), food: w('three') } });
      await until(() => a.state.phase === 'review', 'review starts');
      ok(a.state.scores.players[B.me.id].cats.food.status === 'letter' && a.state.scores.players[C.me.id].cats.city.pts === 5, 'review shows every answer, wrong letters refused and shared answers at 5');
      await call('POST', '/api/rooms/' + code + '/vote', A.key, { player: C.me.id, cat: 'food', reject: true });
      await until(() => (a.state.rejects[C.me.id] || {}).food, 'vote arrives');
      ok(a.state.scores.players[C.me.id].cats.food.status === 'ok', 'one vote out of two other players does not reject an answer');
      await call('POST', '/api/rooms/' + code + '/vote', B.key, { player: C.me.id, cat: 'food', reject: true });
      ok((await call('POST', '/api/rooms/' + code + '/vote', C.key, { player: C.me.id, cat: 'food', reject: false })).status === 409, 'you cannot vote on your own answer');
      if (cheat) ok((await call('POST', '/api/rooms/' + code + '/answers', B.key, { answers: { name: w('late'), city: w('late'), food: w('late') } })).status === 409, 'answers sent after the round closed are refused');
      for (const k of [A.key, B.key, C.key]) await call('POST', '/api/rooms/' + code + '/ready', k);
      await until(() => a.state.phase === 'results', 'results');
      return a.state;
    };
    let st = await round(true);
    ok(st.scores.players[A.me.id].total === 30 && st.scores.players[B.me.id].total === 15 && st.scores.players[C.me.id].total === 15 && st.scores.winner === A.me.id, 'round scored 30 / 15 / 15 and Mohsey wins');
    ok(st.unlocks[A.me.id].some(u => u.id === 'hero') && st.players.find(p => p.id === A.me.id).title === 'Young Hero', 'the winner is promoted to Young Hero and the table is told');
    let meA = (await call('GET', '/api/me', A.key)).json.me;
    ok(meA.total === 30 && meA.levelPoints === 30 && meA.wins === 1 && !meA.quizReady && meA.progress.rakhsh === 1, 'points, win and a clean Stop are on the server’s record');
    await round(false); meA = (await call('GET', '/api/me', A.key)).json.me;
    ok(meA.total === 60 && meA.levelPoints === 40 && meA.quizReady, 'level progress stops at the 40 the level needs; lifetime points keep growing');

    // the story opens, then the quiz
    const story = (await call('GET', '/api/story/1', A.key)).json;
    ok(story.title === 'Test chapter 1' && story.story.length === 2 && (await call('GET', '/api/story/1', B.key)).status === 403 && (await call('GET', '/api/story/2', A.key)).status === 403, 'chapter 1 opens for the player who earned it, and only for them');
    const q1 = (await call('POST', '/api/quiz/start', A.key)).json, q1b = (await call('POST', '/api/quiz/start', A.key)).json;
    ok(q1.questions.length === 5 && JSON.stringify(q1) === JSON.stringify(q1b) && !JSON.stringify(q1).includes('answer'), 'the quiz is five questions, the same five if asked again, with no answers sent');
    const bad = (await call('POST', '/api/quiz/answer', A.key, { answers: q1.questions.map(q => (q.options.indexOf('right') + 1) % 4) })).json;
    ok(bad.passed === false && bad.me.level === 0 && bad.me.levelPoints === 0 && bad.me.total === 60 && (await call('GET', '/api/story/1', A.key)).status === 403, 'failing the quiz loses the level’s points and closes the chapter; lifetime points stay');
    await round(false); await round(false);
    const q2 = (await call('POST', '/api/quiz/start', A.key)).json;
    const good = (await call('POST', '/api/quiz/answer', A.key, { answers: q2.questions.map((q, i) => i === 0 ? (q.options.indexOf('right') + 1) % 4 : q.options.indexOf('right')) })).json;
    ok(good.passed && good.correct === 4 && good.me.level === 1 && good.me.need === 50 && (await call('GET', '/api/story/1', A.key)).json.passed, 'four of five passes: chapter 1 is unlocked and chapter 2 needs 30% more');
    ok((await call('POST', '/api/quiz/answer', A.key, { answers: [0, 0, 0, 0, 0] })).status === 409, 'a quiz cannot be answered twice');

    const lb = (await call('GET', '/api/leaderboard')).json.players;
    ok(lb[0].name === 'Mohsey' && lb[0].level === 1 && lb.length === 3 && !JSON.stringify(lb).includes('hash'), 'the leaderboard ranks everyone, chapter first, and leaks no keys');

    // a lone player is practice only
    const solo = (await call('POST', '/api/rooms', C.key, { open: false })).json.code, s = await listen(solo, C.key);
    await until(() => s.state, 'solo table'); await call('POST', '/api/rooms/' + solo + '/start', C.key); await until(() => s.state.phase === 'play', 'solo play');
    const before = (await call('GET', '/api/me', C.key)).json.me.total;
    await call('POST', '/api/rooms/' + solo + '/stop', C.key, { answers: Object.fromEntries(s.state.settings.cats.map(k => [k, s.state.letter + 'x'])) });
    await until(() => s.state.phase === 'review', 'solo review'); await call('POST', '/api/rooms/' + solo + '/ready', C.key); await until(() => s.state.phase === 'results', 'solo results');
    ok(s.state.scores.scored === false && (await call('GET', '/api/me', C.key)).json.me.total === before && !(await call('GET', '/api/rooms', A.key)).json.tables.some(t => t.code === solo), 'a round alone is practice: no points; an invite-only table is not listed');

    await sleep(400); const saved = JSON.parse(fs.readFileSync(path.join(fx.dir, 'players.json'), 'utf8')).players;
    ok(Object.keys(saved).length === 3 && saved[A.me.id].level === 1 && saved[A.me.id].hash.length === 64 && !JSON.stringify(saved).includes(A.key.split('.')[1]), 'players are saved to disk, with the key stored only as a hash');
    [a, b, c, s].forEach(x => x.close());
    console.log('server: ' + n + ' checks passed');
  } finally { srv.kill(); fs.rmSync(fx.dir, { recursive: true, force: true }); }
})().catch(e => { console.error('FAILED: ' + e.message); process.exit(1); });
