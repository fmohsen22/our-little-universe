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

// A stand-in for the Claude API: it strikes any answer containing "bad", and fails outright while aiDown is set.
// It also checks the request is what the referee should send: the key, the model, the fallback setting and the JSON schema.
const http = require('http'), AI_PORT = PORT + 5; let aiCalls = 0, aiDown = false;
const reply = (items, judgeFn) => ({ id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 },
  content: [{ type: 'text', text: JSON.stringify({ verdicts: items.map(x => judgeFn(x)) }) }] });
const ai = http.createServer((req, res) => { let body = ''; req.on('data', c => { body += c; }); req.on('end', () => {
  aiCalls += 1; const msg = JSON.parse(body), items = JSON.parse(msg.messages[0].content).items;
  const right = req.url.startsWith('/v1/messages') && (req.headers['authorization'] === 'Bearer test-key' || req.headers['x-api-key'] === 'test-key') && msg.model === 'claude-opus-5-5' && msg.fallbacks === 'default' && /server-side-fallback/.test(req.headers['anthropic-beta'] || '') && msg.output_config.format.type === 'json_schema';
  if (!right) { res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'unexpected request' } })); }
  if (aiDown) { res.writeHead(500, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'down' } })); }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(reply(items, x => /bad/i.test(x.answer) ? { i: x.i, valid: false, why: 'not a real ' + x.category.toLowerCase() } : { i: x.i, valid: true, why: '' })));
}); }).listen(AI_PORT, '127.0.0.1');
const judge = async key => (await call('POST', '/api/referee', key)).json;
const meOf = async key => (await call('GET', '/api/me', key)).json.me;

(async () => {
  const srv = spawn('node', [path.join(__dirname, '..', 'server', 'server.js')], { env: Object.assign({}, process.env, { PORT, DATA_DIR: fx.dir, LEVELS_FILE: fx.file, LEVEL_SCALE: '0.005', COLLECT_MS: '150', REVIEW_MS: '2500', MIN_PLAY_MS: '0', MIN_REVIEW_MS: '0', REFEREE_TEST: '1', ANTHROPIC_API_KEY: 'test-key', ANTHROPIC_BASE_URL: 'http://127.0.0.1:' + (PORT + 5), ALLOWED_ORIGINS: 'https://game.mosi-app.com' }), stdio: 'inherit' });
  try {
    await sleep(700);
    const meta = (await call('GET', '/api/meta')).json;
    ok(meta.levels.length === 7 && meta.levels[0].points === 40 && meta.levels[1].points === 50 && meta.ranks.length === 8, 'meta lists seven levels (scaled down for the test) and eight ranks');
    const reg = async name => (await call('POST', '/api/register', null, { name, password: 'secret-' + name, kingdom: name === 'Sufi' ? 'turan' : 'iran', royal: name === 'Sufi' ? 'Princess' : 'Prince' })).json;
    const A = await reg('Mohsey'), B = await reg('Sufi'), C = await reg('Rudabeh');
    ok(A.key && B.me.kingdom === 'turan' && (await call('POST', '/api/register', null, { name: 'mohsey ', password: 'whatever1' })).status === 409, 'players register; a taken name is refused');
    ok((await call('POST', '/api/register', null, { name: 'Shorty', password: '123' })).status === 400 && (await call('POST', '/api/register', null, { name: 'Nopass' })).status === 400, 'a new account needs a password of at least 6 characters');
    const in2 = await call('POST', '/api/login', null, { name: ' MOHSEY', password: 'secret-Mohsey' });
    ok(in2.status === 200 && in2.json.key !== A.key && in2.json.me.id === A.me.id && (await call('GET', '/api/me', in2.json.key)).status === 200 && (await call('GET', '/api/me', A.key)).status === 200, 'name and password sign the same player in on a second device, and both devices stay signed in');
    ok((await call('POST', '/api/login', null, { name: 'Mohsey', password: 'wrong-one' })).status === 401 && (await call('POST', '/api/login', null, { name: 'Nobody', password: 'secret-Mohsey' })).status === 401 && (await call('POST', '/api/login', null, { name: { toString: 1 }, password: [1] })).status === 401, 'a wrong password, an unknown name and malformed input are all refused the same way');
    await call('POST', '/api/logout', in2.json.key); ok((await call('GET', '/api/me', in2.json.key)).status === 401 && (await call('GET', '/api/me', A.key)).status === 200, 'signing out ends that device only');
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
    let meA = await meOf(A.key);
    ok(st.scores.provisional === true && meA.total === 0 && meA.wins === 0 && meA.pending === 30 && meA.pendingRounds === 1 && !Object.keys(st.unlocks).length, 'nothing reaches the record yet: 30 points wait for the referee');
    ok((await judge(A.key)).rounds === 1 && aiCalls === 1, 'the referee judges the waiting round in one call to the service');
    meA = await meOf(A.key);
    ok(meA.news.some(u => u.id === 'hero') && meA.title === 'Young Hero' && meA.pending === 0 && meA.verdict.points === 30 && meA.verdict.struck.length === 0, 'after the verdict the winner is promoted to Young Hero, with a ceremony waiting');
    ok((await call('POST', '/api/news', A.key)).status === 200 && (await meOf(A.key)).news.length === 0, 'the ceremony is shown once');
    ok(meA.total === 30 && meA.levelPoints === 30 && meA.wins === 1 && !meA.quizReady && meA.progress.rakhsh === 1, 'points, win and a clean Stop are on the server’s record');
    await round(false); ok((await meOf(A.key)).quizReady === false, 'the next chapter does not open on points the referee has not checked'); await judge(A.key); meA = await meOf(A.key);
    ok(meA.total === 60 && meA.levelPoints === 40 && meA.quizReady, 'level progress stops at the 40 the level needs; lifetime points keep growing');

    // the story opens, then the quiz
    const story = (await call('GET', '/api/story/1', A.key)).json;
    ok(story.title === 'Test chapter 1' && story.story.length === 2 && (await call('GET', '/api/story/1', B.key)).status === 403 && (await call('GET', '/api/story/2', A.key)).status === 403, 'chapter 1 opens for the player who earned it, and only for them');
    const q1 = (await call('POST', '/api/quiz/start', A.key)).json, q1b = (await call('POST', '/api/quiz/start', A.key)).json;
    ok(q1.questions.length === 5 && JSON.stringify(q1) === JSON.stringify(q1b) && !JSON.stringify(q1).includes('answer'), 'the quiz is five questions, the same five if asked again, with no answers sent');
    const bad = (await call('POST', '/api/quiz/answer', A.key, { answers: q1.questions.map(q => (q.options.indexOf('right') + 1) % 4) })).json;
    ok(bad.passed === false && bad.me.level === 0 && bad.me.levelPoints === 0 && bad.me.total === 60 && (await call('GET', '/api/story/1', A.key)).status === 403, 'failing the quiz loses the level’s points and closes the chapter; lifetime points stay');
    await round(false); await round(false); await judge(A.key);
    const q2 = (await call('POST', '/api/quiz/start', A.key)).json;
    const good = (await call('POST', '/api/quiz/answer', A.key, { answers: q2.questions.map((q, i) => i === 0 ? (q.options.indexOf('right') + 1) % 4 : q.options.indexOf('right')) })).json;
    ok(good.passed && good.correct === 4 && good.me.level === 1 && good.me.need === 50 && (await call('GET', '/api/story/1', A.key)).json.passed, 'four of five passes: chapter 1 is unlocked and chapter 2 needs 30% more');
    ok((await call('POST', '/api/quiz/answer', A.key, { answers: [0, 0, 0, 0, 0] })).status === 409, 'a quiz cannot be answered twice');

    const lb = (await call('GET', '/api/leaderboard')).json.players;
    ok(lb[0].name === 'Mohsey' && lb[0].level === 1 && lb.length === 3 && !/hash|sessions|pw"/.test(JSON.stringify(lb)), 'the leaderboard ranks everyone, chapter first, and leaks no keys');

    // a lone player is practice only
    const solo = (await call('POST', '/api/rooms', C.key, { open: false })).json.code, s = await listen(solo, C.key);
    await until(() => s.state, 'solo table'); await call('POST', '/api/rooms/' + solo + '/start', C.key); await until(() => s.state.phase === 'play', 'solo play');
    const before = (await call('GET', '/api/me', C.key)).json.me.total;
    await call('POST', '/api/rooms/' + solo + '/stop', C.key, { answers: Object.fromEntries(s.state.settings.cats.map(k => [k, s.state.letter + 'x'])) });
    await until(() => s.state.phase === 'review', 'solo review'); await call('POST', '/api/rooms/' + solo + '/ready', C.key); await until(() => s.state.phase === 'results', 'solo results');
    ok(s.state.scores.scored === false && (await call('GET', '/api/me', C.key)).json.me.total === before && (await call('GET', '/api/rooms', A.key)).json.tables.some(t => t.code === solo), 'a round alone is practice: no points; every table is listed for everyone');

    await sleep(400); const saved = JSON.parse(fs.readFileSync(path.join(fx.dir, 'players.json'), 'utf8')).players;
    ok(Object.keys(saved).length === 3 && saved[A.me.id].level === 1 && saved[A.me.id].sessions[0].length === 64 && !JSON.stringify(saved).includes(A.key.split('.')[1]) && !JSON.stringify(saved).includes('secret-') && /^[0-9a-f]{32}:[0-9a-f]{64}$/.test(saved[A.me.id].pw), 'players are saved to disk; passwords and sign-in tokens only as hashes');
    // the referee strikes a made-up answer that got past the table, and a failed check leaves the rounds waiting
    const strikeRound = async (bWord) => {
      await call('POST', '/api/rooms/' + code + '/start', A.key); await until(() => a.state.phase === 'play', 'strike round');
      const L = a.state.letter, cats = a.state.settings.cats, all = s => Object.fromEntries(cats.map(k => [k, L + s + k]));
      await call('POST', '/api/rooms/' + code + '/answers', B.key, { answers: Object.assign(all('q'), { [cats[0]]: L + bWord }) });
      await call('POST', '/api/rooms/' + code + '/stop', A.key, { answers: all('p') }); await until(() => a.state.phase === 'review', 'strike review');
      for (const k of [A.key, B.key, C.key]) await call('POST', '/api/rooms/' + code + '/ready', k); await until(() => a.state.phase === 'results', 'strike results');
      return a.state;
    };
    const before3 = await meOf(B.key), sr = await strikeRound('xbadword');
    ok(sr.scores.players[B.me.id].cats[sr.settings.cats[0]].status === 'ok', 'a made-up answer gets past a table that does not object');
    await judge(A.key); const afterB = await meOf(B.key);
    ok(afterB.total - before3.total === sr.scores.players[B.me.id].total - 10 && afterB.verdict.struck.length === 1 && /badword/.test(afterB.verdict.struck[0].text) && /not a real/.test(afterB.verdict.struck[0].why), 'the referee strikes it: those 10 points never reach the record, and the verdict says why');
    const beforeBoom = await meOf(B.key); await strikeRound('fine'); aiDown = true; const failed = await judge(A.key);
    ok(failed.error && (await meOf(B.key)).total === beforeBoom.total && (await meOf(B.key)).pendingRounds === 1, 'if the referee service fails, nothing is scored and the round waits for the next night');
    aiDown = false; ok((await judge(A.key)).rounds === 1 && (await meOf(B.key)).pendingRounds === 0, 'the next night it is judged as normal');

    // hostile input must never take the server down or bend the rules
    const weird = { toString: 1 };
    ok((await call('GET', '/api/meta?k=__proto__.x')).status === 200 && (await call('GET', '/api/me', 'constructor.x')).status === 401 && (await call('GET', '/api/me', '__proto__.x')).status === 401, 'keys named after built-in properties are simply refused');
    ok((await call('POST', '/api/register', null, { name: weird })).status === 400 && (await call('POST', '/api/profile', A.key, { name: weird })).status === 400 && (await call('POST', '/api/register', null, [1, 2])).status === 400, 'objects and arrays where a name belongs are refused');
    ok((await call('GET', '/api/me?k=' + A.key)).status === 401, 'a key in the address is accepted only for the event stream');
    await call('POST', '/api/rooms/' + code + '/start', A.key); await until(() => a.state.phase === 'play', 'hostile round');
    ok((await call('POST', '/api/rooms/' + code + '/answers', B.key, { answers: { name: weird, city: [weird], food: 7 } })).status === 200 && (await call('POST', '/api/rooms/' + code + '/answers', B.key, { answers: 'x' })).status === 200, 'malformed answers are stored as empty');
    await call('POST', '/api/rooms/' + code + '/stop', A.key, { answers: { name: a.state.letter + 'a', city: a.state.letter + 'b', food: a.state.letter + 'c' } }); await until(() => a.state.phase === 'review', 'hostile review');
    ok((await call('POST', '/api/rooms/' + code + '/vote', B.key, { player: weird, cat: 'name', reject: true })).status === 409 && (await call('POST', '/api/rooms/' + code + '/vote', B.key, { player: A.me.id, cat: weird, reject: true })).status === 409, 'malformed votes are refused');
    await call('POST', '/api/rooms/' + code + '/settings', A.key, { cats: ['name', 'city', 'food', 'color', 'thing'] });
    for (const k of [A.key, B.key, C.key]) await call('POST', '/api/rooms/' + code + '/ready', k); await until(() => a.state.phase === 'results', 'hostile results');
    await call('POST', '/api/rooms/' + code + '/settings', A.key, { cats: ['name', 'city', 'food', 'color', 'thing'] }); await until(() => a.state.settings.cats.length === 5, 'cats changed');
    ok(a.state.scores.cats.length === 3 && Object.keys(a.state.scores.players[A.me.id].cats).length === 3, 'changing the categories after a round does not disturb that round’s results');
    for (let i = 0; i < 2; i++) { await call('POST', '/api/rooms/' + code + '/start', A.key); await until(() => a.state.phase === 'play', 'q round'); await call('POST', '/api/rooms/' + code + '/stop', A.key, { answers: Object.fromEntries(a.state.settings.cats.map(k => [k, a.state.letter + k])) }); await until(() => a.state.phase === 'review', 'q review'); for (const k of [A.key, B.key, C.key]) await call('POST', '/api/rooms/' + code + '/ready', k); await until(() => a.state.phase === 'results', 'q results'); }
    await judge(A.key); await call('POST', '/api/quiz/start', A.key);
    const junk = (await call('POST', '/api/quiz/answer', A.key, { answers: [weird, '__proto__', -1, 1.5, null] })).json;
    ok(junk.passed === false && junk.correct === 0 && junk.wrong === undefined, 'junk quiz answers are graded wrong, and the reply does not say which questions were wrong');
    const dev2 = (await call('POST', '/api/login', null, { name: 'Sufi', password: 'secret-Sufi' })).json.key;
    ok((await call('POST', '/api/password', B.key, { current: 'nope', password: 'brand-new-1' })).status === 401 && (await call('POST', '/api/password', B.key, { current: 'secret-Sufi', password: 'brand-new-1' })).status === 200, 'changing the password needs the current one');
    ok((await call('GET', '/api/me', dev2)).status === 401 && (await call('GET', '/api/me', B.key)).status === 200 && (await call('POST', '/api/login', null, { name: 'Sufi', password: 'secret-Sufi' })).status === 401 && (await call('POST', '/api/login', null, { name: 'Sufi', password: 'brand-new-1' })).status === 200, 'a new password signs out the other devices and replaces the old one');
    let locked = 0; for (let i = 0; i < 12; i++) locked = (await call('POST', '/api/login', null, { name: 'Rudabeh', password: 'guess' + i })).status;
    ok(locked === 429 && (await call('POST', '/api/login', null, { name: 'Rudabeh', password: 'secret-Rudabeh' })).status === 429, 'repeated wrong passwords are locked out for a while');
    const before2 = (await call('GET', '/health')).json.tables; for (let i = 0; i < 6; i++) await call('POST', '/api/rooms', B.key, {});
    ok((await call('GET', '/health')).json.tables <= before2 + 1, 'one player cannot pile up empty tables');
    const again = await listen(code, A.key); await until(() => again.state, 'second stream'); await sleep(200);
    ok((await call('GET', '/health')).json.ok === true, 'the server is still up after all of that'); again.close();

    // pace limits and fairness, on a second server with realistic minimums
    const srv2 = spawn('node', [path.join(__dirname, '..', 'server', 'server.js')], { env: Object.assign({}, process.env, { PORT: PORT + 1, DATA_DIR: fs.mkdtempSync(path.join(fx.dir, 'two-')), LEVELS_FILE: fx.file, COLLECT_MS: '100', REVIEW_MS: '6000', MIN_PLAY_MS: '1500', MIN_REVIEW_MS: '1200', ROUNDS_PER_HOUR: '2', REFEREE_TEST: '1' }), stdio: 'inherit' });
    try {
      await sleep(600); const b2 = 'http://127.0.0.1:' + (PORT + 1), c2 = async (m, p, k, body) => { const r = await fetch(b2 + p, { method: m, headers: Object.assign({ 'Content-Type': 'application/json' }, k ? { Authorization: 'Bearer ' + k } : {}), body: body ? JSON.stringify(body) : undefined }); return { status: r.status, json: await r.json().catch(() => ({})) }; };
      const l2 = async (code, key) => { const ctl = new AbortController(), box = { state: null, close: () => ctl.abort() }; const r = await fetch(b2 + '/api/rooms/' + code + '/events?k=' + key, { signal: ctl.signal }); (async () => { const dec = new TextDecoder(); let buf = ''; try { for await (const ch of r.body) { buf += dec.decode(ch, { stream: true }); let i; while ((i = buf.indexOf('\n\n')) >= 0) { const m = /data: (.*)/.exec(buf.slice(0, i)); buf = buf.slice(i + 2); if (m) box.state = JSON.parse(m[1]); } } } catch (e) { /* closed */ } })(); return box; };
      const X = (await c2('POST', '/api/register', null, { name: 'Xena', password: 'secret-x' })).json, Y = (await c2('POST', '/api/register', null, { name: 'Yara', password: 'secret-y' })).json;
      const t1 = (await c2('POST', '/api/rooms', X.key, {})).json.code, x = await l2(t1, X.key), y = await l2(t1, Y.key); await until(() => x.state && x.state.players.length === 2, 'two at table');
      await c2('POST', '/api/rooms/' + t1 + '/settings', X.key, { cats: ['name', 'surname', 'city', 'animal', 'food', 'thing'] });
      const play = async (leaver) => {
        await c2('POST', '/api/rooms/' + t1 + '/start', X.key); await until(() => x.state.phase === 'play', 'play'); const all = s => Object.fromEntries(x.state.settings.cats.map(k => [k, x.state.letter + s + k]));
        const fast = await c2('POST', '/api/rooms/' + t1 + '/stop', X.key, { answers: all('x') }); await c2('POST', '/api/rooms/' + t1 + '/answers', Y.key, { answers: { name: x.state.letter + 'y' } });
        await sleep(1600); await c2('POST', '/api/rooms/' + t1 + '/stop', X.key, { answers: all('x') }); await until(() => x.state.phase === 'review', 'review'); const t0 = Date.now();
        if (leaver) { await c2('POST', '/api/rooms/' + t1 + '/leave', Y.key); } else { await c2('POST', '/api/rooms/' + t1 + '/ready', X.key); await c2('POST', '/api/rooms/' + t1 + '/vote', Y.key, { player: X.me.id, cat: 'name', reject: true }); await until(() => !x.state.players.find(p => p.id === X.me.id).ready, 'ready cleared'); await c2('POST', '/api/rooms/' + t1 + '/vote', Y.key, { player: X.me.id, cat: 'name', reject: false }); await c2('POST', '/api/rooms/' + t1 + '/ready', Y.key); }
        await c2('POST', '/api/rooms/' + t1 + '/ready', X.key); await until(() => x.state.phase === 'results', 'results'); return { fast, took: Date.now() - t0 };
      };
      const r1 = await play(false);
      ok(r1.fast.status === 409 && /Too fast/.test(r1.fast.json.error) && r1.took >= 1100, 'Stop is refused in the first moments of a round, and checking cannot be skipped in under the minimum');
      await c2('POST', '/api/referee', X.key); ok((await c2('GET', '/api/me', X.key)).json.me.wins === 1, 'a vote after someone pressed Done reopens the check, so nobody is ambushed');
      const y2 = await l2(t1, Y.key); await until(() => x.state.players.length === 2 && x.state.players.every(p => p.online), 'Y back'); const r2 = await play(true); void r2;
      await c2('POST', '/api/referee', X.key); const mx = (await c2('GET', '/api/me', X.key)).json.me; ok(mx.wins === 2 && mx.total === 120, 'an opponent who leaves during the check does not cancel your win');
      const two = (await c2('POST', '/api/rooms', Y.key, {})).json.code, yb = await l2(two, Y.key); await until(() => yb.state, 'Y at another table'); await until(() => !x.state.players.some(p => p.id === Y.me.id && p.online), 'Y gone from first');
      ok(true, 'sitting down at a second table takes you off the first: one table at a time');
      const y3 = await l2(t1, Y.key); await until(() => x.state.players.filter(p => p.online).length === 2, 'Y returns'); await play(false);
      await c2('POST', '/api/referee', X.key); ok((await c2('GET', '/api/me', X.key)).json.me.total === 120 && x.state.scores.players[X.me.id].capped === true, 'rounds beyond the hourly limit are played but not counted');
      [x, y, y2, yb, y3].forEach(s => s.close());
    } finally { srv2.kill(); }
    [a, b, c, s].forEach(x => x.close());
    console.log('server: ' + n + ' checks passed');
  } finally { srv.kill(); ai.close(); fs.rmSync(fx.dir, { recursive: true, force: true }); }
})().catch(e => { console.error('FAILED: ' + e.message); process.exit(1); });
