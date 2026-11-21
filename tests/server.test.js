process.env.LEVEL_POINTS = '8000,10400,13500,17600,22800,29700,38600';   // the table these checks were written for
// Plays the game against the real server over HTTP: accounts, electing a referee, three players and a referee at a table, judging, scoring, levels and the quiz.
// Run: node tests/server.test.js
process.env.REPEAT_RULE = '0'; process.env.SURPRISE_DEFAULT = '0'; process.env.REFEREE_POINTS = '0';   // these rules have their own tests (challenge.test.js, referee.test.js)
const { spawn } = require('child_process'), path = require('path'), assert = require('assert'), fs = require('fs');
const fx = require('./fixture.js')(), PORT = 8791, base = 'http://127.0.0.1:' + PORT;
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; console.log('  ok  ' + m); };
const call = async (method, p, key, body) => { const r = await fetch(base + p, { method, headers: Object.assign({ 'Content-Type': 'application/json' }, key ? { Authorization: 'Bearer ' + key } : {}), body: body ? JSON.stringify(body) : undefined }); return { status: r.status, json: await r.json().catch(() => ({})) }; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
// a minimal Server-Sent Events reader that keeps the latest table state
async function listen(code, key) { const ctl = new AbortController(), box = { state: null, close: () => ctl.abort() }; const r = await fetch(base + '/api/rooms/' + code + '/events?k=' + key, { signal: ctl.signal }); if (!r.ok) { box.status = r.status; return box; }
  (async () => { const dec = new TextDecoder(); let buf = ''; try { for await (const chunk of r.body) { buf += dec.decode(chunk, { stream: true }); let i; while ((i = buf.indexOf('\n\n')) >= 0) { const m = /data: (.*)/.exec(buf.slice(0, i)); buf = buf.slice(i + 2); if (m) box.state = JSON.parse(m[1]); } } } catch (e) { /* closed */ } })(); return box; }
const until = async (f, what) => { for (let i = 0; i < 100; i++) { if (f()) return; await sleep(50); } throw new Error('timed out: ' + what); };

const meOf = async key => (await call('GET', '/api/me', key)).json.me;

(async () => {
  const srv = spawn('node', [path.join(__dirname, '..', 'server', 'server.js')], { env: Object.assign({}, process.env, { PORT, DATA_DIR: fx.dir, LEVELS_FILE: fx.file, LEVEL_SCALE: '0.005', COLLECT_MS: '150', REVIEW_MS: '4000', MIN_PLAY_MS: '0', REFEREE_GRACE_MS: '500', ALLOWED_ORIGINS: 'https://game.mosi-app.com' }), stdio: 'inherit' });
  try {
    await sleep(700);
    const meta = (await call('GET', '/api/meta')).json;
    ok(meta.levels.length === 7 && meta.levels[0].points === 40 && meta.levels[1].points === 50 && meta.ranks.length === 8, 'meta lists seven levels (scaled down for the test) and eight ranks');
    const reg = async name => (await call('POST', '/api/register', null, { name, password: 'secret-' + name, kingdom: name === 'Sufi' ? 'turan' : 'iran', royal: name === 'Sufi' ? 'Princess' : 'Prince' })).json;
    const A = await reg('Mohsey'), B = await reg('Sufi'), C = await reg('Rudabeh'), R = await reg('Zal');
    ok(A.key && B.me.kingdom === 'turan' && (await call('POST', '/api/register', null, { name: 'mohsey ', password: 'whatever1' })).status === 409, 'players register; a taken name is refused');
    ok((await call('POST', '/api/register', null, { name: 'Shorty', password: '123' })).status === 400 && (await call('POST', '/api/register', null, { name: 'Nopass' })).status === 400, 'a new account needs a password of at least 6 characters');
    const in2 = await call('POST', '/api/login', null, { name: ' MOHSEY', password: 'secret-Mohsey' });
    ok(in2.status === 200 && in2.json.key !== A.key && in2.json.me.id === A.me.id && (await call('GET', '/api/me', in2.json.key)).status === 200 && (await call('GET', '/api/me', A.key)).status === 200, 'name and password sign the same player in on a second device, and both devices stay signed in');
    ok((await call('POST', '/api/login', null, { name: 'Mohsey', password: 'wrong-one' })).status === 401 && (await call('POST', '/api/login', null, { name: 'Nobody', password: 'secret-Mohsey' })).status === 401 && (await call('POST', '/api/login', null, { name: { toString: 1 }, password: [1] })).status === 401, 'a wrong password, an unknown name and malformed input are all refused the same way');
    await call('POST', '/api/logout', in2.json.key); ok((await call('GET', '/api/me', in2.json.key)).status === 401 && (await call('GET', '/api/me', A.key)).status === 200, 'signing out ends that device only');
    ok((await call('GET', '/api/me', 'p000000.bad')).status === 401 && (await call('GET', '/api/me', A.key.replace(/.$/, 'x'))).status === 401 && (await call('GET', '/api/story/1', A.key)).status === 403, 'a wrong key is refused, and a locked chapter cannot be read');

    const code = (await call('POST', '/api/rooms', A.key, {})).json.code, RM = p => '/api/rooms/' + code + '/' + p;
    const a = await listen(code, A.key), b = await listen(code, B.key), c = await listen(code, C.key), r = await listen(code, R.key);
    await until(() => a.state && a.state.players.length === 4, 'four people at the table');
    ok((await call('GET', '/api/rooms', B.key)).json.tables[0].players.length === 4, 'the open table is listed with everyone at it');
    ok((await call('POST', RM('start'), B.key)).status === 409, 'only the host can start');
    await call('POST', RM('settings'), A.key, { cats: ['name', 'city', 'food'], secs: 60 });

    // choosing the referee
    const noRef = await call('POST', RM('start'), A.key);
    ok(noRef.status === 409 && /Choose a referee/.test(noRef.json.error), 'no round starts without a referee');
    ok((await call('POST', RM('elect'), A.key, { player: R.me.id })).status === 409, 'you can only vote for someone who has volunteered');
    await call('POST', RM('volunteer'), R.key, { on: true }); await call('POST', RM('volunteer'), B.key, { on: true });
    await until(() => a.state.volunteers.length === 2, 'two volunteers');
    ok((await call('POST', RM('elect'), R.key, { player: R.me.id })).status === 409, 'a volunteer cannot vote for themself');
    await call('POST', RM('elect'), A.key, { player: B.me.id }); await until(() => a.state.referee === B.me.id, 'B leads');
    ok(a.state.referee === B.me.id, 'with one vote each way the earlier volunteer or the leader is the referee');
    await call('POST', RM('elect'), A.key, { player: R.me.id }); await call('POST', RM('elect'), C.key, { player: R.me.id });
    await until(() => a.state.referee === R.me.id, 'R elected');
    ok(a.state.referee === R.me.id && a.state.votes[A.me.id] === R.me.id, 'changing a vote moves the referee: Zal has two votes and is the referee');
    await call('POST', RM('volunteer'), B.key, { on: false }); await until(() => a.state.volunteers.length === 1, 'B steps down');

    // play rounds until Mohsey has the 40 points level 1 needs (30 a round)
    const round = async (cheat) => {
      await call('POST', RM('start'), A.key); await until(() => a.state.phase === 'play', 'round starts');
      const L = a.state.letter, w = s => L + s;
      ok(!JSON.stringify(b.state).includes('scores') && a.state.endsAt > a.state.now && a.state.referee === R.me.id, 'during play nobody receives anyone else’s answers, and the referee is fixed for the round');
      ok((await call('POST', RM('answers'), R.key, { answers: { name: w('ref') } })).status === 409 && !r.state.players.find(p => p.id === R.me.id).inRound, 'the referee does not play');
      await call('POST', RM('answers'), B.key, { answers: { name: w('ara'), city: w('same'), food: 'zzz-wrong-letter' } });
      await call('POST', RM('answers'), C.key, { answers: { name: w('ina'), city: w('same'), food: w('fake') } });
      ok((await call('POST', RM('stop'), A.key, { answers: { name: w('one'), city: '', food: '' } })).status === 409, 'Stop is refused until every box is filled');
      await call('POST', RM('stop'), A.key, { answers: { name: w('one'), city: w('two'), food: w('three') } });
      await until(() => r.state.phase === 'review', 'review starts');
      ok(r.state.scores.players[B.me.id].cats.food.status === 'letter' && r.state.scores.players[C.me.id].cats.city.pts === 5 && !r.state.scores.players[R.me.id], 'the referee sees every answer: wrong letters already refused, shared answers at 5, and no score sheet for the referee');
      ok((await call('POST', RM('judge'), B.key, { player: C.me.id, cat: 'food', accept: false })).status === 403 && (await call('POST', RM('verdict'), A.key)).status === 403, 'only the referee can judge or give the verdict');
      await call('POST', RM('judge'), R.key, { player: C.me.id, cat: 'food', accept: false });
      await until(() => a.state.scores.players[C.me.id].cats.food.status === 'referee', 'reject arrives');
      ok(a.state.scores.players[C.me.id].total === 15 && b.state.scores.players[C.me.id].cats.food.status === 'referee', 'one tap rejects an answer, and every player sees it at once');
      await call('POST', RM('judge'), R.key, { player: C.me.id, cat: 'food', accept: true }); await until(() => a.state.scores.players[C.me.id].cats.food.status === 'ok', 'accepted back');
      await call('POST', RM('judge'), R.key, { player: C.me.id, cat: 'food', accept: false }); await until(() => a.state.scores.players[C.me.id].cats.food.status === 'referee', 'rejected again');
      ok(true, 'a second tap accepts it back: the referee can change their mind until the verdict');
      if (cheat) ok((await call('POST', RM('answers'), B.key, { answers: { name: w('late'), city: w('late'), food: w('late') } })).status === 409, 'answers sent after the round closed are refused');
      await call('POST', RM('verdict'), R.key);
      await until(() => a.state.phase === 'results', 'results');
      return a.state;
    };
    let st = await round(true);
    ok(st.scores.players[A.me.id].total === 30 && st.scores.players[B.me.id].total === 15 && st.scores.players[C.me.id].total === 15 && st.scores.winner === A.me.id && st.scores.referee === R.me.id, 'round scored 30 / 15 / 15, Mohsey wins, and the results name the referee');
    ok(r.state.phase === 'results' && r.state.scores.players[C.me.id].cats.food.status === 'referee' && r.state.scores.cats.length === 3, 'after the verdict the referee (and everyone) still sees all the answers and how each was judged');
    let meA = await meOf(A.key);
    ok(meA.news.some(u => u.id === 'hero') && meA.title === 'Young Hero', 'the verdict counts at once: the winner is promoted to Young Hero, with a ceremony waiting');
    ok((await call('POST', '/api/news', A.key)).status === 200 && (await meOf(A.key)).news.length === 0, 'the ceremony is shown once');
    ok(meA.total === 30 && meA.levelPoints === 30 && meA.wins === 1 && !meA.quizReady && meA.progress.rakhsh === 1, 'points, win and a clean Stop are on the server’s record');
    const meR = await meOf(R.key); ok(meR.refereed === 1 && meR.total === 0 && meR.progress.judge === 1, 'the referee scores no points but the round counts toward the Wise Judge badge');
    await round(false); meA = await meOf(A.key);
    ok(meA.total === 60 && meA.levelPoints === 40 && meA.quizReady, 'level progress stops at the 40 the level needs; lifetime points keep growing');

    // the story opens, then the quiz
    const story = (await call('GET', '/api/story/1', A.key)).json;
    ok(story.title === 'Test chapter 1' && story.story.length === 2 && (await call('GET', '/api/story/1', B.key)).status === 403 && (await call('GET', '/api/story/2', A.key)).status === 403, 'chapter 1 opens for the player who earned it, and only for them');
    const q1 = (await call('POST', '/api/quiz/start', A.key)).json, q1b = (await call('POST', '/api/quiz/start', A.key)).json;
    ok(q1.questions.length === 5 && JSON.stringify(q1) === JSON.stringify(q1b) && !JSON.stringify(q1).includes('answer'), 'the quiz is five questions, the same five if asked again, with no answers sent');
    const bad = (await call('POST', '/api/quiz/answer', A.key, { answers: q1.questions.map(q => (q.options.indexOf('right') + 1) % 4) })).json;
    ok(bad.passed === false && bad.me.level === 0 && bad.me.levelPoints === 32 && bad.me.quizReady === false && bad.me.total === 60 && (await call('GET', '/api/story/1', A.key)).status === 403, 'failing the quiz costs a fifth of the level’s points (40 becomes 32) and closes the chapter; lifetime points stay');
    await round(false); await round(false);
    const q2 = (await call('POST', '/api/quiz/start', A.key)).json;
    const good = (await call('POST', '/api/quiz/answer', A.key, { answers: q2.questions.map((q, i) => i === 0 ? (q.options.indexOf('right') + 1) % 4 : q.options.indexOf('right')) })).json;
    ok(good.passed && good.correct === 4 && good.me.level === 1 && good.me.need === 50 && (await call('GET', '/api/story/1', A.key)).json.passed, 'four of five passes: chapter 1 is unlocked and chapter 2 needs 30% more');
    ok((await call('POST', '/api/quiz/answer', A.key, { answers: [0, 0, 0, 0, 0] })).status === 409, 'a quiz cannot be answered twice');

    const lb = (await call('GET', '/api/leaderboard')).json.players;
    ok(lb[0].name === 'Mohsey' && lb[0].level === 1 && lb.length === 4 && !/hash|sessions|pw"/.test(JSON.stringify(lb)), 'the leaderboard ranks everyone, chapter first, and leaks no keys');

    // a table needs three people: a referee and two players
    const solo = (await call('POST', '/api/rooms', C.key, { open: false })).json.code, s = await listen(solo, C.key), s2 = await listen(solo, R.key);
    await until(() => s.state && s.state.players.length === 2, 'two at a small table');
    await call('POST', '/api/rooms/' + solo + '/volunteer', R.key, { on: true }); await call('POST', '/api/rooms/' + solo + '/elect', C.key, { player: R.me.id }); await until(() => s.state.referee === R.me.id, 'small table referee');
    const few = await call('POST', '/api/rooms/' + solo + '/start', C.key);
    ok(few.status === 409 && /at least 2 players besides the referee/.test(few.json.error) && (await call('GET', '/api/rooms', A.key)).json.tables.some(t => t.code === solo), 'two people cannot start a round: a referee needs at least two players; every table is listed for everyone');
    s2.close();
    const rBack = await listen(code, R.key); await until(() => (a.state.players.find(p => p.id === R.me.id) || {}).online, 'R back at the main table');
    if (a.state.referee !== R.me.id) { await call('POST', RM('volunteer'), R.key, { on: true }); await call('POST', RM('elect'), A.key, { player: R.me.id }); await call('POST', RM('elect'), C.key, { player: R.me.id }); }
    await until(() => a.state.referee === R.me.id, 'R referee at the main table again');

    await sleep(400); const saved = JSON.parse(fs.readFileSync(path.join(fx.dir, 'players.json'), 'utf8')).players;
    ok(Object.keys(saved).length === 4 && saved[A.me.id].level === 1 && saved[A.me.id].sessions[0].length === 64 && !JSON.stringify(saved).includes(A.key.split('.')[1]) && !JSON.stringify(saved).includes('secret-') && /^[0-9a-f]{32}:[0-9a-f]{64}$/.test(saved[A.me.id].pw), 'players are saved to disk; passwords and sign-in tokens only as hashes');
    // a referee who walks out cancels the round after a short grace; one who comes back in time does not
    const before3 = await meOf(B.key);
    await call('POST', RM('start'), A.key); await until(() => a.state.phase === 'play', 'walkout round');
    rBack.close(); r.close(); await until(() => !a.state.players.find(p => p.id === R.me.id).online, 'referee offline');
    const rAgain = await listen(code, R.key); await until(() => a.state.players.find(p => p.id === R.me.id).online, 'referee back'); await sleep(700);
    ok(a.state.phase === 'play', 'a referee whose phone drops for a moment is waited for');
    rAgain.close(); await until(() => a.state.phase === 'lobby', 'round cancelled');
    ok(/referee left/.test(a.state.notice) && (await meOf(B.key)).total === before3.total && !a.state.referee, 'a referee who stays away cancels the round: nobody scores, and the table chooses again');
    const r3 = await listen(code, R.key); await until(() => a.state.referee === R.me.id, 'R referee again');
    ok(a.state.referee === R.me.id, 'votes are kept, so the referee is back as soon as they return');

    // hostile input must never take the server down or bend the rules
    const weird = { toString: 1 };
    ok((await call('GET', '/api/meta?k=__proto__.x')).status === 200 && (await call('GET', '/api/me', 'constructor.x')).status === 401 && (await call('GET', '/api/me', '__proto__.x')).status === 401, 'keys named after built-in properties are simply refused');
    ok((await call('POST', '/api/register', null, { name: weird })).status === 400 && (await call('POST', '/api/profile', A.key, { name: weird })).status === 400 && (await call('POST', '/api/register', null, [1, 2])).status === 400, 'objects and arrays where a name belongs are refused');
    ok((await call('GET', '/api/me?k=' + A.key)).status === 401, 'a key in the address is accepted only for the event stream');
    await call('POST', RM('start'), A.key); await until(() => a.state.phase === 'play', 'hostile round');
    ok((await call('POST', '/api/rooms/' + code + '/answers', B.key, { answers: { name: weird, city: [weird], food: 7 } })).status === 200 && (await call('POST', '/api/rooms/' + code + '/answers', B.key, { answers: 'x' })).status === 200, 'malformed answers are stored as empty');
    await call('POST', '/api/rooms/' + code + '/stop', A.key, { answers: { name: a.state.letter + 'a', city: a.state.letter + 'b', food: a.state.letter + 'c' } }); await until(() => a.state.phase === 'review', 'hostile review');
    ok((await call('POST', RM('judge'), R.key, { player: weird, cat: 'name', accept: false })).status === 409 && (await call('POST', RM('judge'), R.key, { player: A.me.id, cat: weird, accept: false })).status === 409 && (await call('POST', RM('judge'), R.key, { player: A.me.id, cat: 'name', accept: 'no' })).status === 409 && (await call('POST', RM('judge'), R.key, { player: R.me.id, cat: 'name', accept: false })).status === 409, 'malformed judgements, and judging someone not playing, are refused');
    ok((await call('POST', RM('elect'), B.key, { player: R.me.id })).status === 409 && (await call('POST', RM('volunteer'), B.key, { on: true })).status === 409, 'nobody can change the referee during a round');
    await call('POST', '/api/rooms/' + code + '/settings', A.key, { cats: ['name', 'city', 'food', 'color', 'thing'] });
    await call('POST', RM('verdict'), R.key); await until(() => a.state.phase === 'results', 'hostile results');
    await call('POST', '/api/rooms/' + code + '/settings', A.key, { cats: ['name', 'city', 'food', 'color', 'thing'] }); await until(() => a.state.settings.cats.length === 5, 'cats changed');
    ok(a.state.scores.cats.length === 3 && Object.keys(a.state.scores.players[A.me.id].cats).length === 3, 'changing the categories after a round does not disturb that round’s results');
    for (let i = 0; i < 2; i++) { await call('POST', '/api/rooms/' + code + '/start', A.key); await until(() => a.state.phase === 'play', 'q round'); await call('POST', '/api/rooms/' + code + '/stop', A.key, { answers: Object.fromEntries(a.state.settings.cats.map(k => [k, a.state.letter + k])) }); await until(() => a.state.phase === 'review', 'q review'); await call('POST', RM('verdict'), R.key); await until(() => a.state.phase === 'results', 'q results'); }
    await call('POST', '/api/quiz/start', A.key);
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
    const srv2 = spawn('node', [path.join(__dirname, '..', 'server', 'server.js')], { env: Object.assign({}, process.env, { PORT: PORT + 1, DATA_DIR: fs.mkdtempSync(path.join(fx.dir, 'two-')), LEVELS_FILE: fx.file, COLLECT_MS: '100', REVIEW_MS: '6000', MIN_PLAY_MS: '1500', ROUNDS_PER_HOUR: '2', REFEREE_GRACE_MS: '400' }), stdio: 'inherit' });
    try {
      await sleep(600); const b2 = 'http://127.0.0.1:' + (PORT + 1), c2 = async (m, p, k, body) => { const r = await fetch(b2 + p, { method: m, headers: Object.assign({ 'Content-Type': 'application/json' }, k ? { Authorization: 'Bearer ' + k } : {}), body: body ? JSON.stringify(body) : undefined }); return { status: r.status, json: await r.json().catch(() => ({})) }; };
      const l2 = async (code, key) => { const ctl = new AbortController(), box = { state: null, close: () => ctl.abort() }; const r = await fetch(b2 + '/api/rooms/' + code + '/events?k=' + key, { signal: ctl.signal }); (async () => { const dec = new TextDecoder(); let buf = ''; try { for await (const ch of r.body) { buf += dec.decode(ch, { stream: true }); let i; while ((i = buf.indexOf('\n\n')) >= 0) { const m = /data: (.*)/.exec(buf.slice(0, i)); buf = buf.slice(i + 2); if (m) box.state = JSON.parse(m[1]); } } } catch (e) { /* closed */ } })(); return box; };
      const reg2 = async n => (await c2('POST', '/api/register', null, { name: n, password: 'secret-' + n })).json;
      const X = await reg2('Xena'), Y = await reg2('Yara'), Z = await reg2('Zoya');
      const t1 = (await c2('POST', '/api/rooms', X.key, {})).json.code, T = p => '/api/rooms/' + t1 + '/' + p, x = await l2(t1, X.key), y = await l2(t1, Y.key), z = await l2(t1, Z.key); await until(() => x.state && x.state.players.length === 3, 'three at table');
      await c2('POST', T('volunteer'), Z.key, { on: true }); await c2('POST', T('elect'), X.key, { player: Z.me.id }); await until(() => x.state.referee === Z.me.id, 'Zoya referees');
      await c2('POST', T('settings'), X.key, { cats: ['name', 'surname', 'city', 'animal', 'food', 'thing'] });
      const play = async (leaver) => {
        await c2('POST', T('start'), X.key); await until(() => x.state.phase === 'play', 'play'); const all = s => Object.fromEntries(x.state.settings.cats.map(k => [k, x.state.letter + s + k]));
        const fast = await c2('POST', T('stop'), X.key, { answers: all('x') }); await c2('POST', T('answers'), Y.key, { answers: { name: x.state.letter + 'y' } });
        await sleep(1600); await c2('POST', T('stop'), X.key, { answers: all('x') }); await until(() => x.state.phase === 'review', 'review');
        if (leaver) { await c2('POST', T('leave'), Y.key); await until(() => !x.state.players.some(p => p.id === Y.me.id && p.online), 'Y left'); }
        await c2('POST', T('verdict'), Z.key); await until(() => x.state.phase === 'results', 'results'); return { fast };
      };
      const r1 = await play(false);
      ok(r1.fast.status === 409 && /Too fast/.test(r1.fast.json.error), 'Stop is refused in the first moments of a round');
      ok((await c2('GET', '/api/me', X.key)).json.me.wins === 1, 'the win counts the moment the referee gives the verdict');
      await play(true);
      const mx = (await c2('GET', '/api/me', X.key)).json.me; ok(mx.wins === 2 && mx.total === 120, 'an opponent who leaves during the check does not cancel your win');
      const y2 = await l2(t1, Y.key); await until(() => x.state.players.filter(p => p.online).length === 3, 'Y back');
      const two = (await c2('POST', '/api/rooms', Y.key, {})).json.code, yb = await l2(two, Y.key); await until(() => yb.state, 'Y at another table'); await until(() => !x.state.players.some(p => p.id === Y.me.id && p.online), 'Y gone from first');
      ok(true, 'sitting down at a second table takes you off the first: one table at a time');
      const y3 = await l2(t1, Y.key); await until(() => x.state.players.filter(p => p.online).length === 3, 'Y returns'); await play(false);
      ok((await c2('GET', '/api/me', X.key)).json.me.total === 120 && x.state.scores.players[X.me.id].capped === true, 'rounds beyond the hourly limit are played but not counted');
      [x, y, z, y2, yb, y3].forEach(s => s.close());
    } finally { srv2.kill(); }
    [a, b, c, s, r3].forEach(x => x.close());
    console.log('server: ' + n + ' checks passed');
  } finally { srv.kill(); fs.rmSync(fx.dir, { recursive: true, force: true }); }
})().catch(e => { console.error('FAILED: ' + e.message); process.exit(1); });
