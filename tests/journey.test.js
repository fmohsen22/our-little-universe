// The whole game, start to finish, with the real stories and quizzes: five friends at one table take turns as
// referee, play until each chapter opens, read it, take its real quiz (one of them fails once and has to win the
// points back), and go through all seven chapters. Then the Simurgh's riddle with different answers, games against
// Prince Mohsey, a server restart, and a last check in a phone browser. Chapters are shrunk to a few points each.
// Run: node tests/journey.test.js
process.env.LEVEL_SCALE = '0.001';
const { spawn } = require('child_process'), path = require('path'), assert = require('assert'), fs = require('fs'), os = require('os');
const G = require('../server/game.js'), BOOK = require('../server/levels.json'), root = path.resolve(__dirname, '..');
const PORT = 8801, base = 'http://127.0.0.1:' + PORT, site = 'http://127.0.0.1:4178/', dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpm-journey-'));
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; console.log('  ok  ' + m); };
const call = async (method, p, key, body) => { const r = await fetch(base + p, { method, headers: Object.assign({ 'Content-Type': 'application/json' }, key ? { Authorization: 'Bearer ' + key } : {}), body: body ? JSON.stringify(body) : undefined }); return { status: r.status, json: await r.json().catch(() => ({})) }; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, what) => { for (let i = 0; i < 200; i++) { if (f()) return; await sleep(40); } throw new Error('timed out: ' + what); };
async function listen(code, key) { const ctl = new AbortController(), box = { state: null, close: () => ctl.abort() }; const r = await fetch(base + '/api/rooms/' + code + '/events?k=' + key, { signal: ctl.signal });
  (async () => { const dec = new TextDecoder(); let buf = ''; try { for await (const ch of r.body) { buf += dec.decode(ch, { stream: true }); let i; while ((i = buf.indexOf('\n\n')) >= 0) { const m = /data: (.*)/.exec(buf.slice(0, i)); buf = buf.slice(i + 2); if (m) box.state = JSON.parse(m[1]); } } } catch (e) { /* closed */ } })(); return box; }
const start = () => spawn('node', [path.join(root, 'server', 'server.js')], { env: Object.assign({}, process.env, { PORT, DATA_DIR: dir, LEVEL_SCALE: '0.001', COLLECT_MS: '60', MIN_PLAY_MS: '0', ROUNDS_PER_HOUR: '1000', MOHSEY_SECS: '120', ALLOWED_ORIGINS: 'http://127.0.0.1:4178' }), stdio: 'ignore' });
const CATS = ['name', 'surname', 'city', 'animal', 'food', 'thing', 'color'];   // made-up test answers cannot be countries
// the right answer to a real quiz question, found by its text
const rightIndex = (level, q) => { const Q = BOOK.levels[level - 1].quiz.find(x => x.q === q.q); return q.options.indexOf(Q.options[Q.answer]); };

(async () => {
  let srv = start(), web;
  try {
    await sleep(700);
    ok(BOOK.levels.length === 7 && BOOK.levels.every(L => L.clue && L.quiz.length >= 5) && BOOK.finale && BOOK.finale.story.some(p => /Softolli/.test(p)), 'the real book has seven chapters, each with a quiz and a clue, and the final chapter with Princess Softolli');
    const names = ['Arash', 'Bahar', 'Cyrus', 'Dorna', 'Elham'], P = {};
    for (const nm of names) { const r = (await call('POST', '/api/register', null, { name: nm, password: 'pw-' + nm + '-1' })).json; P[nm] = { key: r.key, id: r.me.id }; }
    ok(Object.keys(P).length === 5, 'five test accounts are created');
    const code = (await call('POST', '/api/rooms', P.Arash.key, {})).json.code, eyes = {};
    for (const nm of names) eyes[nm] = await listen(code, P[nm].key);
    await until(() => eyes.Arash.state && eyes.Arash.state.players.filter(p => p.online).length === 5, 'all five at the table');
    await call('POST', '/api/rooms/' + code + '/settings', P.Arash.key, { cats: CATS });
    for (const nm of names) await call('POST', '/api/rooms/' + code + '/volunteer', P[nm].key, { on: true });
    const eye = eyes.Arash;

    // one round: the referee is elected by the other four, everyone writes unique answers, one fake gets rejected
    let roundNo = 0; const refCount = {};
    async function round(playersOut) {
      const active = names.filter(nm => !playersOut.includes(nm)), ref = names[roundNo % 5]; roundNo++;
      for (const nm of names) if (nm !== ref) await call('POST', '/api/rooms/' + code + '/elect', P[nm].key, { player: P[ref].id });
      await until(() => eye.state.referee === P[ref].id, 'referee ' + ref);
      await call('POST', '/api/rooms/' + code + '/start', P.Arash.key); await until(() => eye.state.phase === 'play', 'play');
      const L = eye.state.letter, players = names.filter(nm => nm !== ref);
      for (const nm of players) await call('POST', '/api/rooms/' + code + '/answers', P[nm].key, { answers: Object.fromEntries(CATS.map(c => [c, active.includes(nm) ? L + nm.toLowerCase() + c : ''])) });
      const stopper = players.find(nm => active.includes(nm));
      await call('POST', '/api/rooms/' + code + '/stop', P[stopper].key, { answers: Object.fromEntries(CATS.map(c => [c, L + stopper.toLowerCase() + c])) });
      await until(() => eye.state.phase === 'review', 'review');
      const fake = players.find(nm => nm !== stopper && active.includes(nm));
      if (fake) await call('POST', '/api/rooms/' + code + '/judge', P[ref].key, { player: P[fake].id, cat: 'food', accept: false });
      await call('POST', '/api/rooms/' + code + '/verdict', P[ref].key); await until(() => eye.state.phase === 'results', 'results');
      refCount[ref] = (refCount[ref] || 0) + 1;
      return eye.state;
    }
    const me = async nm => (await call('GET', '/api/me', P[nm].key)).json.me;
    async function takeQuiz(nm, pass) {
      const m = await me(nm), level = m.level + 1, q = (await call('POST', '/api/quiz/start', P[nm].key)).json;
      const answers = q.questions.map(x => pass ? rightIndex(level, x) : (rightIndex(level, x) + 1) % 4);
      return (await call('POST', '/api/quiz/answer', P[nm].key, { answers })).json;
    }

    // Dorna stays at chapter 6 to check the last chapter stays locked for her
    let failedOnce = false, chapterLog = [], lockedChecks = 0, earlyOpen = 0;
    for (let ch = 1; ch <= 7; ch++) {
      const going = names.filter(nm => !(nm === 'Dorna' && ch === 7));
      for (const nm of going) {   // a chapter can be read, and its quiz taken, exactly when the player has its points
        const m = await me(nm), s = (await call('GET', '/api/story/' + ch, P[nm].key)).status, nx = (await call('GET', '/api/story/' + (ch + 1), P[nm].key)).status;
        assert.strictEqual(s, m.quizReady ? 200 : 403, 'chapter ' + ch + ' for ' + nm + ' with ' + m.levelPoints + ' of ' + m.need);
        if (ch < 7) assert.strictEqual(nx, 403, 'chapter ' + (ch + 1) + ' is locked for ' + nm);
        if (!m.quizReady) { assert.strictEqual((await call('POST', '/api/quiz/start', P[nm].key)).status, 409, 'no quiz for ' + nm + ' before the points'); lockedChecks++; } else earlyOpen++;
      }
      let guard = 0; while (guard++ < 12) { const ms = await Promise.all(going.map(me)); if (ms.every(m => m.quizReady)) break; await round(names.filter(nm => !going.includes(nm))); }
      for (const nm of going) {
        assert.strictEqual((await call('GET', '/api/story/' + ch, P[nm].key)).status, 200, nm + ' can read chapter ' + ch);
        if (nm === 'Bahar' && ch === 3 && !failedOnce) {
          const bad = await takeQuiz(nm, false); failedOnce = true;
          ok(bad.passed === false && bad.me.levelPoints === 0 && bad.me.level === 2 && (await call('GET', '/api/story/3', P[nm].key)).status === 403, 'Bahar fails the real chapter 3 quiz: the chapter closes and its points are lost');
          let g = 0; while (!(await me(nm)).quizReady && g++ < 6) await round(names.filter(x => !going.includes(x)));
          ok((await me(nm)).quizReady, 'she wins the points back at the table and the chapter opens again');
        }
        const r = await takeQuiz(nm, true);
        assert.ok(r.passed && r.level === ch, nm + ' passes the real chapter ' + ch + ' quiz');
      }
      const story = (await call('GET', '/api/story/' + ch, P.Arash.key)).json;
      assert.strictEqual(story.clue, BOOK.levels[ch - 1].clue);
      chapterLog.push(ch + ': ' + story.title);
      if (ch < 7) { const locked = (await call('GET', '/api/finale', P.Arash.key)).status; assert.strictEqual(locked, 403, 'finale locked after chapter ' + ch); }
    }
    ok(lockedChecks + earlyOpen === 34 && lockedChecks >= 25, 'each chapter (and its quiz) stayed locked until the player had its points, and opened exactly then; the chapter after it always stayed locked (' + lockedChecks + ' locked, ' + earlyOpen + ' already open from points won in extra rounds)');
    ok(true, 'all four play through the seven real chapters and pass every real quiz (' + roundNo + ' rounds, the referee changing every round)');
    ok((await Promise.all(['Arash', 'Bahar', 'Cyrus', 'Elham'].map(me))).every(m => m.level === 7) && (await me('Dorna')).level === 6, 'Arash, Bahar, Cyrus and Elham reach the end; Dorna stops after chapter 6');
    ok(names.every(nm => refCount[nm] >= 1) && (await Promise.all(names.map(me))).every((m, i) => m.refereed === refCount[names[i]]), 'everyone took turns as referee, and each referee count is right');
    ok((await call('GET', '/api/finale', P.Dorna.key)).status === 403 && (await call('GET', '/api/mohsey', P.Dorna.key)).status === 403, 'for Dorna, the last chapter and Prince Mohsey stay locked');

    // the riddle
    const f = (await call('GET', '/api/finale', P.Arash.key)).json;
    ok(f.clues.length === 7 && f.clues.every((c, i) => c === BOOK.levels[i].clue) && f.story.some(p => /Softolli/.test(p)) && !f.ending && !/Vienna|Wien/.test(JSON.stringify(f)), 'the last chapter shows the real story and all seven clues, without giving away the city');
    const say = async (nm, a) => (await call('POST', '/api/finale/answer', P[nm].key, { answer: a })).json;
    const arash = await say('Arash', 'Vienna');
    ok(arash.correct && arash.ending.some(p => /Vienna/.test(p)) && arash.ending.some(p => /Softolli/.test(p)) && arash.unlocks.some(u => u.id === 'feather'), 'Arash answers Vienna at once: the real ending is told and he wins the Last Feather');
    const b1 = await say('Bahar', 'Budapest'), b2 = await say('Bahar', 'Austria'), b3 = await say('Bahar', 'Prague'), b4 = await say('Bahar', 'wien');
    ok(!b1.correct && /Danube|river|horses/i.test(b1.hint) && /city/.test(b2.hint) && /capital of Austria/.test(b3.hint) && b4.correct, 'Bahar tries Budapest, Austria and Prague, gets stronger hints each time, then answers Wien: accepted');
    ok((await say('Cyrus', 'I think he is in vienna, austria')).correct, 'Cyrus writes a whole sentence with Vienna in it: accepted');
    const e1 = await say('Elham', 'Paris'); ok(!e1.correct && (await me('Elham')).finale === false && (await call('GET', '/api/mohsey', P.Elham.key)).status === 403, 'Elham guesses Paris and has not found him yet, so she cannot play him yet');
    const board = (await call('GET', '/api/leaderboard')).json.players;
    ok(board.slice(0, 3).every(p => p.finale) && board[3].name === 'Elham' && board[4].name === 'Dorna', 'the leaderboard puts the three who found Prince Mohsey first, then Elham, then Dorna');

    // games against Prince Mohsey
    const before = await Promise.all(names.map(me));
    for (const nm of ['Arash', 'Bahar', 'Cyrus']) {
      for (let i = 0; i < 3; i++) {
        const g = (await call('POST', '/api/mohsey/start', P[nm].key)).json;
        const answers = nm === 'Cyrus' ? {} : Object.fromEntries(g.cats.map(c => [c, c === 'country' ? '' : g.letter + 'qa' + nm.toLowerCase() + c]));
        const r = (await call('POST', '/api/mohsey/answer', P[nm].key, { answers })).json;
        assert.ok(r.you && r.mohsey && r.games === i + 1, nm + ' game ' + (i + 1));
        if (nm === 'Cyrus') assert.strictEqual(r.winner, 'mohsey', 'an empty sheet loses');
      }
    }
    const after = await Promise.all(names.map(me)), recs = after.map(m => m.mohseyWins + '/' + m.mohseyGames);
    ok(after[2].mohseyWins === 0 && after[2].mohseyGames === 3 && after.slice(0, 3).every(m => m.mohseyGames === 3), 'three players play Prince Mohsey three times each; Cyrus hands in empty sheets and loses all three (records ' + recs.slice(0, 3).join(', ') + ')');
    ok(after.every((m, i) => m.total === before[i].total && m.wins === before[i].wins), 'none of those games changes anyone’s points or wins');

    // a server restart keeps everything
    Object.values(eyes).forEach(e => e.close()); await sleep(400); srv.kill(); await sleep(300); srv = start(); await sleep(700);
    const kept = await Promise.all(names.map(me));
    ok(kept.every((m, i) => m.level === after[i].level && m.finale === after[i].finale && m.mohseyGames === after[i].mohseyGames && m.total === after[i].total && !!m.ach.feather === after[i].finale), 'after a server restart every record is the same: chapters, the riddle, badges and games against the prince');
    ok((await say('Elham', 'Vienne')).correct, 'Elham comes back after the restart and solves it in French: Vienne');

    // a last look in a phone browser, with the real text
    web = spawn('python3', ['-m', 'http.server', '4178', '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' }); await sleep(500);
    const { chromium, devices } = require('playwright'), browser = await chromium.launch(), errors = [];
    try {
      const ctx = await browser.newContext({ ...devices['Pixel 7'] }); await ctx.route('**/config.js', q => q.fulfill({ contentType: 'text/javascript', body: "window.WPM_CONFIG={serverUrl:'" + base + "',princeImage:'assets/prince-mohsey.jpg'};" }));
      const p = await ctx.newPage(); p.on('pageerror', e => errors.push(String(e))); p.on('console', m => { if (m.type() === 'error' && !/fonts\.g|net::ERR|40\d/.test(m.text())) errors.push(m.text()); });
      await p.goto(site); await p.waitForSelector('#w-name'); await p.locator('[data-m="login"]').tap(); await p.fill('#w-name', 'Dorna'); await p.fill('#w-pass', 'pw-Dorna-1'); await p.locator('form[data-form="login"] [type=submit]').tap();
      await p.waitForSelector('.me-card'); await p.goto(site + '#journey'); await p.waitForSelector('.chapter.final');
      ok(/Pass all seven chapters/.test(await p.textContent('.chapter.final')) && await p.locator('.chapter.passed').count() === 6, 'Dorna’s journey: six chapters passed, the last one still locked');
      await p.goto(site + '#level-5'); await p.waitForSelector('.clue'); ok((await p.textContent('.clue')).includes(BOOK.levels[4].clue) && await p.locator('.story-pic').count() === 1, 'a real chapter shows its picture, its story and its clue');
      await p.goto(site + '#home'); await p.locator('[data-act="signout"]').count();
      await p.evaluate(() => localStorage.clear()); await p.goto(site); await p.waitForSelector('#w-name'); await p.locator('[data-m="login"]').tap(); await p.fill('#w-name', 'Arash'); await p.fill('#w-pass', 'pw-Arash-1'); await p.locator('form[data-form="login"] [type=submit]').tap();
      await p.waitForSelector('a[href="#mohsey"]'); await p.goto(site + '#finale'); await p.waitForSelector('#f-box');
      const txt = await p.textContent('#app'); ok(/Softolli/.test(txt) && /Vienna/.test(txt) && /waiting at his table/.test(txt), 'Arash, who solved it, can read the whole final chapter again with its ending');
      await p.goto(site + '#leaders'); await p.waitForSelector('.leaders tbody tr'); ok((await p.locator('.leaders tbody tr').first().textContent()).includes('8 🪶'), 'the leaderboard marks the players who found him');
      ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth) && errors.length === 0, 'no sideways scroll and no console errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
    } finally { await browser.close(); }
    console.log('\n  chapters played: ' + chapterLog.join(' · '));
    console.log('\n  leaderboard:\n' + (await call('GET', '/api/leaderboard')).json.players.map((x, i) => '    ' + (i + 1) + '. ' + x.name.padEnd(6) + ' chapter ' + (x.finale ? '8 🪶' : x.level) + '  points ' + x.total).join('\n'));
    console.log('\njourney: ' + n + ' checks passed');
  } finally { srv.kill(); if (web) web.kill(); fs.rmSync(dir, { recursive: true, force: true }); }
})().catch(e => { console.error('FAILED: ' + e.message); process.exit(1); });
