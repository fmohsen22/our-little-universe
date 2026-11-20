// The end of the game: the Simurgh's riddle (chapter 8) and the games against Prince Mohsey, first over the API,
// then on a phone in the browser. A player is set up at chapter 7 by editing the saved file between two server starts.
// Run: node tests/finale.test.js
process.env.REPEAT_RULE = '0'; process.env.SURPRISE_DEFAULT = '0';   // the once-a-day rule and the surprise categories have their own test (challenge.test.js)
const { spawn } = require('child_process'), path = require('path'), assert = require('assert'), fs = require('fs');
const G = require('../server/game.js'), M = require('../server/mohsey.js'), fx = require('./fixture.js')(), root = path.resolve(__dirname, '..');
const PORT = 8799, base = 'http://127.0.0.1:' + PORT, site = 'http://127.0.0.1:4176/';
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; console.log('  ok  ' + m); };
const call = async (method, p, key, body) => { const r = await fetch(base + p, { method, headers: Object.assign({ 'Content-Type': 'application/json' }, key ? { Authorization: 'Bearer ' + key } : {}), body: body ? JSON.stringify(body) : undefined }); return { status: r.status, json: await r.json().catch(() => ({})) }; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const start = extra => spawn('node', [path.join(root, 'server', 'server.js')], { env: Object.assign({}, process.env, { PORT, DATA_DIR: fx.dir, LEVELS_FILE: fx.file, LEVEL_SCALE: '0.005', ALLOWED_ORIGINS: 'http://127.0.0.1:4176' }, extra || {}), stdio: 'ignore' });
// a full, correct sheet for a letter: unknown made-up words are trusted, the country is a real one
const sheet = L => { const c = M.WORDS.country.find(x => G.startsWith(x, L)) || ''; return Object.fromEntries(G.DEFAULT_SETTINGS.cats.map(k => [k, k === 'country' ? c : L + 'zor' + k])); };

(async () => {
  let srv = start(), web;
  try {
    await sleep(700);
    // Mohsey's own play: always the right letter, never junk, a real country, most boxes filled
    let filled = 0, wrong = 0; for (let i = 0; i < 400; i++) { const L = G.LETTERS.en[i % G.LETTERS.en.length], a = M.play(L, G.DEFAULT_SETTINGS.cats); G.DEFAULT_SETTINGS.cats.forEach(c => { const t = a[c]; if (!t) return; filled++; if (!G.startsWith(t, L) || G.junk(t) || (c === 'country' && G.notACountry(t))) wrong++; }); }
    ok(wrong === 0 && filled / (400 * 8) > 0.75 && filled / (400 * 8) < 0.95, 'Prince Mohsey plays fair: the right letter, real countries, about ' + Math.round(100 * filled / 3200) + '% of boxes filled');
    ok(G.LETTERS.en.every(L => G.DEFAULT_SETTINGS.cats.every(c => M.WORDS[c].some(w => G.startsWith(w, L)))), 'he has a word for every letter in every category');

    const A = (await call('POST', '/api/register', null, { name: 'Faramarz', password: 'secret-f1' })).json, B = (await call('POST', '/api/register', null, { name: 'Gordieh', password: 'secret-g1' })).json;
    ok((await call('GET', '/api/finale', A.key)).status === 403 && (await call('GET', '/api/mohsey', A.key)).status === 403, 'the last chapter and Prince Mohsey stay locked until all seven chapters are passed');
    await sleep(500); srv.kill(); await sleep(400);
    const file = path.join(fx.dir, 'players.json'), saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    saved.players[A.me.id].level = 7; saved.players[B.me.id].level = 7; saved.players[A.me.id].total = 50; saved.players[B.me.id].total = 900; fs.writeFileSync(file, JSON.stringify(saved));
    srv = start({ MOHSEY_SECS: '3' }); await sleep(700);
    ok((await call('GET', '/api/story/3', A.key)).json.clue === 'Clue 3 about the city.', 'each chapter ends with a fragment of the riddle');

    const f = (await call('GET', '/api/finale', A.key)).json;
    ok(f.story.length === 2 && f.clues.length === 7 && f.solved === false && !f.ending && !JSON.stringify(f).includes('vienna'), 'after chapter 7 the last chapter opens with all seven fragments, and neither the answer nor the ending is sent');
    const tries = []; for (const a of ['Paris', 'Rome', 'Austria', 'Berlin', 'Prague']) tries.push((await call('POST', '/api/finale/answer', A.key, { answer: a })).json);
    ok(tries.every(t => t.correct === false) && tries[0].hint === 'Hint one.' && tries[1].hint === 'Hint two.' && /name the city/.test(tries[2].hint) && tries[3].hint === 'Hint three.' && tries[4].hint === 'Hint three.', 'wrong answers get a gentle hint, each a little stronger; naming the country gets its own nudge');
    ok((await call('POST', '/api/finale/answer', A.key, { answer: '' })).status === 400 && (await call('POST', '/api/finale/answer', A.key, { answer: { x: 1 } })).status === 400, 'an empty or nonsense answer is refused');
    ok((await call('GET', '/api/mohsey', A.key)).status === 403, 'Prince Mohsey cannot be played before the riddle is solved');
    const right = (await call('POST', '/api/finale/answer', A.key, { answer: ' in  VIENNA, Austria!' })).json;
    ok(right.correct && right.ending.length === 2 && right.me.finale && right.unlocks.some(u => u.id === 'feather'), '"in Vienna, Austria" is accepted: the ending is told and the Last Feather badge is won');
    ok((await call('POST', '/api/finale/answer', B.key, { answer: 'Wien' })).json.correct === true, 'Wien is accepted too');
    const lb = (await call('GET', '/api/leaderboard')).json.players;
    ok(lb[0].name === 'Gordieh' && lb[0].finale === true, 'players who found Prince Mohsey are marked on the leaderboard');

    // games against Prince Mohsey (3 seconds a game for the test)
    const before = (await call('GET', '/api/me', A.key)).json.me;
    let g = (await call('POST', '/api/mohsey/start', A.key)).json;
    ok(g.letter && g.cats.length === 8 && g.hello && !JSON.stringify(g).includes('bot'), 'a game gives a letter, the eight categories and a greeting, but not his answers');
    ok((await call('POST', '/api/mohsey/start', A.key)).json.letter === g.letter, 'asking again returns the same game, so a reload cannot reroll the letter');
    let r = (await call('POST', '/api/mohsey/answer', A.key, { answers: sheet(g.letter) })).json;
    const cats = G.DEFAULT_SETTINGS.cats, sum = s => cats.reduce((t, c) => t + s.cats[c].pts, 0);
    ok(r.you.total === sum(r.you) && r.mohsey.total === sum(r.mohsey) && cats.every(c => !r.mohsey.cats[c].text || G.startsWith(r.mohsey.cats[c].text, g.letter)) && ['you', 'mohsey', null].includes(r.winner) && r.line, 'the result shows both sheets, scored by the usual rules, with a line from the prince');
    ok(r.notes.some(t => /trust a friend/.test(t)) && r.unknown.length >= 6, 'for answers he does not know, he says so once, but trusts you');
    ok((await call('POST', '/api/mohsey/answer', A.key, { answers: sheet(g.letter) })).status === 409, 'a game can be handed in only once');
    let tries2 = 1; while (r.winner !== 'you' && tries2 < 12) { g = (await call('POST', '/api/mohsey/start', A.key)).json; r = (await call('POST', '/api/mohsey/answer', A.key, { answers: sheet(g.letter) })).json; tries2++; }
    ok(r.winner === 'you' && r.unlocks.some(u => u.id === 'equal') && r.wins >= 1 && r.games === tries2, 'a full sheet beats him sooner or later, and the first win earns Equal of the Prince (' + tries2 + ' games)');
    g = (await call('POST', '/api/mohsey/start', A.key)).json; await sleep(3000 + 8500);
    r = (await call('POST', '/api/mohsey/answer', A.key, { answers: sheet(g.letter) })).json;
    ok(r.late && r.you.total === 0 && /clock ran out/.test(r.line), 'answers handed in long after the clock ran out count for nothing');
    const after = (await call('GET', '/api/me', A.key)).json.me;
    ok(after.total === before.total && after.wins === before.wins && after.rounds === before.rounds, 'games against the prince do not change points, wins or the leaderboard');

    // on a phone
    srv.kill(); await sleep(300); srv = start({ MOHSEY_SECS: '120' }); await sleep(700);
    web = spawn('python3', ['-m', 'http.server', '4176', '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' }); await sleep(500);
    const { chromium, devices } = require('playwright'), browser = await chromium.launch(), errors = [];
    try {
      const ctx = await browser.newContext({ ...devices['iPhone 13'] }); await ctx.route('**/config.js', q => q.fulfill({ contentType: 'text/javascript', body: "window.WPM_CONFIG={serverUrl:'" + base + "',princeImage:'assets/prince-mohsey.jpg'};" }));
      const p = await ctx.newPage(); p.on('pageerror', e => errors.push(String(e))); p.on('console', m => { if (m.type() === 'error' && !/fonts\.g|net::ERR|40\d/.test(m.text())) errors.push(m.text()); });
      const C = (await call('POST', '/api/register', null, { name: 'Tahmineh', password: 'secret-t1' })).json; await sleep(500); srv.kill(); await sleep(400);
      const s2 = JSON.parse(fs.readFileSync(file, 'utf8')); s2.players[C.me.id].level = 7; fs.writeFileSync(file, JSON.stringify(s2)); srv = start({ MOHSEY_SECS: '120' }); await sleep(700);
      await p.goto(site); await p.waitForSelector('#w-name'); await p.locator('[data-m="login"]').tap(); await p.fill('#w-name', 'Tahmineh'); await p.fill('#w-pass', 'secret-t1'); await p.locator('form[data-form="login"] [type=submit]').tap();
      await p.waitForSelector('a[href="#finale"]'); ok(/The last chapter is open/.test(await p.textContent('#app')), 'after chapter 7, the home page announces that the last chapter is open');
      await p.goto(site + '#journey'); await p.waitForSelector('.chapter.final.open'); ok(/Open the last chapter/.test(await p.textContent('.chapter.final')), 'the journey shows chapter 8 open');
      await p.goto(site + '#level-2'); await p.waitForSelector('.clue'); ok(/fragment 2 of 7/.test(await p.textContent('.clue')) && /Clue 2/.test(await p.textContent('.clue')), 'each chapter ends with its fragment of the riddle');
      await p.goto(site + '#finale'); await p.waitForSelector('form.riddle'); ok(await p.locator('.clues li').count() === 7, 'the last chapter tells the story and lists the seven fragments');
      await p.fill('#f-answer', 'Paris'); await p.locator('form.riddle [type=submit]').tap(); await p.waitForFunction(() => /Hint one/.test(document.querySelector('#f-hint').textContent)); ok(true, 'a wrong answer shows a hint, with no penalty');
      await p.fill('#f-answer', 'Vienna'); await p.locator('form.riddle [type=submit]').tap(); await p.waitForSelector('#ceremony .cer-box'); ok(/Last Feather/.test(await p.textContent('#cer-title')), 'Vienna is right: the Last Feather ceremony plays');
      for (let i = 0; i < 4 && await p.locator('#ceremony button[data-cer]').isVisible(); i++) await p.locator('#ceremony button[data-cer]').tap();
      ok(/Vienna, of course/.test(await p.textContent('#f-box')), 'the ending is told'); if (process.env.SHOTS) await p.screenshot({ path: path.join(process.env.SHOTS, 'finale.png'), fullPage: true });
      await p.locator('#f-box a[href="#mohsey"]').tap(); await p.waitForSelector('[data-act="duelstart"]'); await p.locator('[data-act="duelstart"]').tap(); await p.waitForSelector('input[data-duel]');
      const L = await p.textContent('.letter'), sh = sheet(L); for (const c of G.DEFAULT_SETTINGS.cats) await p.fill('#d-' + c, sh[c]);
      if (process.env.SHOTS) await p.screenshot({ path: path.join(process.env.SHOTS, 'duel-play.png'), fullPage: true });
      await p.locator('form[data-form="duel"] [type=submit]').tap(); await p.waitForSelector('.duel-board');
      ok(await p.locator('.duel-board li').count() === 10 && /to/.test(await p.textContent('.mohsey .turn')), 'the result shows both answer sheets side by side, with the score');
      for (let i = 0; i < 4 && await p.locator('#ceremony button[data-cer]').isVisible(); i++) await p.locator('#ceremony button[data-cer]').tap();
      if (process.env.SHOTS) await p.screenshot({ path: path.join(process.env.SHOTS, 'duel-result.png'), fullPage: true });
      ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no sideways scroll on the phone');
      await p.goto(site + '#home'); await p.waitForSelector('a[href="#mohsey"]'); ok(/Play Prince Mohsey/.test(await p.textContent('#app')), 'the home page now offers a game with Prince Mohsey');
      ok(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
    } finally { await browser.close(); }
    console.log('\nfinale: ' + n + ' checks passed');
  } finally { srv.kill(); if (web) web.kill(); fs.rmSync(fx.dir, { recursive: true, force: true }); }
})().catch(e => { console.error('FAILED: ' + e.message); process.exit(1); });
