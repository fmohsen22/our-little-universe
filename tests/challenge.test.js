// The rules that keep the game fresh, on the real server with everything at its defaults:
// the letter bag (every letter once before any repeats), surprise categories, and "one word, once a day".
// Then the warning under a repeated word, in a phone browser. Run: node tests/challenge.test.js
const { spawn } = require('child_process'), path = require('path'), assert = require('assert'), fs = require('fs');
const G = require('../server/game.js'), fx = require('./fixture.js')(), root = path.resolve(__dirname, '..');
const PORT = 8807, base = 'http://127.0.0.1:' + PORT, site = 'http://127.0.0.1:4184/';
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; console.log('  ok  ' + m); };
const call = async (method, p, key, body) => { const r = await fetch(base + p, { method, headers: Object.assign({ 'Content-Type': 'application/json' }, key ? { Authorization: 'Bearer ' + key } : {}), body: body ? JSON.stringify(body) : undefined }); return { status: r.status, json: await r.json().catch(() => ({})) }; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, what) => { for (let i = 0; i < 200; i++) { if (f()) return; await sleep(30); } throw new Error('timed out: ' + what); };
async function listen(code, key) { const ctl = new AbortController(), box = { state: null, close: () => ctl.abort() }; const r = await fetch(base + '/api/rooms/' + code + '/events?k=' + key, { signal: ctl.signal });
  (async () => { const dec = new TextDecoder(); let buf = ''; try { for await (const ch of r.body) { buf += dec.decode(ch, { stream: true }); let i; while ((i = buf.indexOf('\n\n')) >= 0) { const m = /data: (.*)/.exec(buf.slice(0, i)); buf = buf.slice(i + 2); if (m) box.state = JSON.parse(m[1]); } } } catch (e) { /* closed */ } })(); return box; }
const start = () => { const env = Object.assign({}, process.env, { PORT, DATA_DIR: fx.dir, LEVELS_FILE: fx.file, COLLECT_MS: '40', MIN_PLAY_MS: '0', ROUNDS_PER_HOUR: '1000', ALLOWED_ORIGINS: 'http://127.0.0.1:4184' }); delete env.REPEAT_RULE; delete env.SURPRISE_DEFAULT; return spawn('node', [path.join(root, 'server', 'server.js')], { env, stdio: 'ignore' }); };
// each player's word for a letter and a category: always the same, like a memorised list
const word = (L, who, cat) => L + who + cat;

(async () => {
  let srv = start(), web;
  try {
    await sleep(700);
    const meta = (await call('GET', '/api/meta')).json;
    ok(meta.repeatRule === true && meta.extra.length === 12 && meta.extra.every(c => c.id && c.en) && !meta.extra.some(c => meta.categories.some(b => b.id === c.id)), 'the game offers twelve surprise categories, and the once-a-day rule is on');
    const P = {}; for (const nm of ['Arash', 'Bahar', 'Cyrus', 'Dorna']) P[nm] = (await call('POST', '/api/register', null, { name: nm, password: 'pw-' + nm + '-1' })).json;
    async function table(host, others) {
      const code = (await call('POST', '/api/rooms', P[host].key, {})).json.code, eyes = {};
      for (const nm of [host].concat(others)) eyes[nm] = await listen(code, P[nm].key);
      await until(() => eyes[host].state && eyes[host].state.players.filter(p => p.online).length === others.length + 1, 'table');
      return { code, eyes, eye: eyes[host], host, R: p => '/api/rooms/' + code + '/' + p };
    }
    const t = await table('Arash', ['Bahar', 'Cyrus', 'Dorna']);
    ok(t.eye.state.settings.surprise === 1 && t.eye.state.settings.cats.length === 8, 'a new table has the eight usual categories and one surprise category');
    await call('POST', t.R('settings'), P.Arash.key, { cats: ['name', 'city', 'food'] });
    ok((await call('POST', t.R('settings'), P.Bahar.key, { surprise: 0 })).status === 409 && (await call('POST', t.R('settings'), P.Arash.key, { surprise: 7 })).status === 200 && t.eye.state.settings.surprise === 1, 'only the host changes the surprise setting, and only to none, one or two');
    await call('POST', t.R('volunteer'), P.Dorna.key, { on: true }); for (const nm of ['Arash', 'Bahar', 'Cyrus']) await call('POST', t.R('elect'), P[nm].key, { player: P.Dorna.me.id });
    await until(() => t.eye.state.referee === P.Dorna.me.id, 'referee');

    // one round; `sheet(nm, L, cats)` gives each player's answers; `reject` is [player, cat] for the referee
    async function round(tb, sheet, reject, check) {
      const before = tb.eye.state.round;
      await call('POST', tb.R('start'), P[tb.host].key); await until(() => tb.eye.state.phase === 'play' && tb.eye.state.round === before + 1, 'play');
      const st = tb.eye.state, L = st.letter, cats = st.cats, players = st.players.filter(p => p.inRound).map(p => p.name), replies = {};
      for (const nm of players) replies[nm] = (await call('POST', tb.R('answers'), P[nm].key, { answers: sheet(nm, L, cats) })).json;
      if (check) await check(st, replies);
      const stop = await call('POST', tb.R('stop'), P[tb.host].key, { answers: sheet(tb.host, L, cats) }); assert.strictEqual(stop.status, 200, 'stop: ' + JSON.stringify(stop.json));
      await until(() => tb.eye.state.phase === 'review', 'review');
      const review = tb.eye.state;
      if (reject) await call('POST', tb.R('judge'), P.Dorna.key, { player: P[reject[0]].me.id, cat: reject[1], accept: false });
      await call('POST', tb.R('verdict'), P.Dorna.key); await until(() => tb.eye.state.phase === 'results', 'results');
      return { L, cats, surprise: st.surprise, review, results: tb.eye.state, replies };
    }
    const full = (nm, L, cats) => Object.fromEntries(cats.map(c => [c, word(L, nm, c)]));

    // 22 rounds: the whole bag of letters
    const seen = [], first = {}, extras = [];
    const r1 = await round(t, full, ['Bahar', 'food'], async (st) => {
      ok(st.cats.length === 4 && st.surprise.length === 1 && st.cats[3] === st.surprise[0] && meta.extra.some(c => c.id === st.surprise[0]), 'the round has the three chosen categories plus one surprise category, shown to everyone when it starts');
      const partial = full('Arash', st.letter, st.cats); partial[st.surprise[0]] = '';
      ok((await call('POST', t.R('stop'), P.Arash.key, { answers: partial })).status === 409, 'Stop needs the surprise box filled too');
    });
    seen.push(r1.L); first[r1.L] = r1; extras.push(r1.surprise[0]);
    ok(r1.results.scores.players[P.Arash.me.id].total === 40 && r1.results.scores.players[P.Bahar.me.id].total === 30 && r1.replies.Arash.repeats.length === 0, 'first time round, every new word scores: 40 for four answers, 30 for Bahar after the referee rejects her food');
    for (let i = 1; i < 22; i++) { const r = await round(t, full); seen.push(r.L); first[r.L] = r; extras.push(r.surprise[0]); }
    ok(new Set(seen).size === 22 && G.LETTERS.en.every(l => seen.includes(l)), 'in 22 rounds the table gets all 22 letters, each exactly once (' + seen.join('') + ')');
    ok(extras.every((e, i) => i === 0 || e !== extras[i - 1]) && new Set(extras).size >= 6, 'the surprise category changes every round (' + new Set(extras).size + ' different ones in 22 rounds)');
    const mid = (await call('GET', '/api/me', P.Arash.key)).json.me;
    ok(mid.total === 22 * 40, 'all 22 rounds scored in full: ' + mid.total + ' points');

    // round 23: a letter comes back, and so does Arash's memorised list
    let again;
    const r23 = await round(t, (nm, L, cats) => nm === 'Arash' || nm === 'Bahar' ? full(nm, L, cats) : Object.fromEntries(cats.map(c => [c, word(L, nm + 'new', c)])), null, async (st, replies) => { again = replies; });
    const was = first[r23.L], aSc = r23.results.scores.players[P.Arash.me.id], cSc = r23.results.scores.players[P.Cyrus.me.id], bSc = r23.results.scores.players[P.Bahar.me.id];
    const baseCats = ['name', 'city', 'food'], sameExtra = was.surprise[0] === r23.surprise[0];
    ok(baseCats.every(c => again.Arash.repeats.includes(c)) && again.Cyrus.repeats.length === 0, 'when the letter ' + r23.L + ' comes back, the server warns Arash that his three usual words were already used today; Cyrus, with new words, gets no warning');
    ok(baseCats.every(c => aSc.cats[c].status === 'repeat' && aSc.cats[c].pts === 0) && aSc.total === (sameExtra ? 0 : 10) && cSc.total === 40, 'Arash’s memorised list scores nothing the second time (' + aSc.total + ' points); Cyrus scores 40 with fresh words');
    ok(r23.review.scores.players[P.Arash.me.id].cats.name.status === 'repeat', 'the referee and the table already see “already used today” during the review');
    if (was === r1) ok(bSc.cats.food.status === 'ok', 'a word the referee rejected earlier was never “used”, so it may be tried again'); else ok(bSc.cats.name.status === 'repeat', 'Bahar’s repeated words score nothing either');
    const after = (await call('GET', '/api/me', P.Arash.key)).json.me;
    ok(after.total === mid.total + aSc.total, 'his record grows only by what really scored');

    // the surprise setting: none, and two
    await call('POST', t.R('settings'), P.Arash.key, { surprise: 0 });
    const fresh = (nm, L, cats) => Object.fromEntries(cats.map(c => [c, word(L, nm + 'x' + Math.random().toString(36).slice(2, 6), c)]));
    const r0 = await round(t, fresh); ok(r0.cats.length === 3 && r0.surprise.length === 0, 'with surprise categories set to none, the round has only the chosen three');
    await call('POST', t.R('settings'), P.Arash.key, { surprise: 2 });
    const r2 = await round(t, fresh); ok(r2.cats.length === 5 && r2.surprise.length === 2 && r2.surprise[0] !== r2.surprise[1], 'set to two, the round has two different surprise categories');

    // a different table, same day: the rule follows the player, not the table
    Object.values(t.eyes).forEach(e => e.close()); await sleep(200);
    const t2 = await table('Arash', ['Bahar', 'Cyrus', 'Dorna']);
    await call('POST', t2.R('settings'), P.Arash.key, { cats: ['name', 'city', 'food'], surprise: 0 });
    await call('POST', t2.R('volunteer'), P.Dorna.key, { on: true }); for (const nm of ['Arash', 'Bahar', 'Cyrus']) await call('POST', t2.R('elect'), P[nm].key, { player: P.Dorna.me.id });
    await until(() => t2.eye.state.referee === P.Dorna.me.id, 'referee 2');
    const rn = await round(t2, (nm, L, cats) => nm === 'Arash' ? full(nm, L, cats) : fresh(nm, L, cats));
    ok(rn.results.scores.players[P.Arash.me.id].total === 0 && rn.replies.Arash.repeats.length === 3, 'at a new table on the same day, his old list still scores nothing: the rule follows the player');

    // the warning, on a phone: Arash types an old word, then a new one
    web = spawn('python3', ['-m', 'http.server', '4184', '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' }); await sleep(500);
    const { chromium, devices } = require('playwright'), browser = await chromium.launch(), errors = [];
    try {
      Object.values(t2.eyes).forEach(e => e.close()); await sleep(200);
      const code = (await call('POST', '/api/rooms', P.Bahar.key, {})).json.code, eyes = {}, R = p => '/api/rooms/' + code + '/' + p;
      for (const nm of ['Bahar', 'Cyrus', 'Dorna']) eyes[nm] = await listen(code, P[nm].key);
      const ctx = await browser.newContext({ ...devices['Pixel 7'] }); await ctx.route('**/config.js', q => q.fulfill({ contentType: 'text/javascript', body: "window.WPM_CONFIG={serverUrl:'" + base + "',princeImage:'assets/prince-mohsey.jpg'};" }));
      const p = await ctx.newPage(); p.on('pageerror', e => errors.push(String(e))); p.on('console', m => { if (m.type() === 'error' && !/fonts\.g|net::ERR|40\d/.test(m.text())) errors.push(m.text()); });
      await p.goto(site + '#table-' + code); await p.waitForSelector('#w-name'); await p.locator('[data-m="login"]').tap(); await p.fill('#w-name', 'Arash'); await p.fill('#w-pass', 'pw-Arash-1'); await p.locator('form[data-form="login"] [type=submit]').tap();
      await p.waitForSelector('#t-people'); await until(() => eyes.Bahar.state && eyes.Bahar.state.players.filter(x => x.online).length === 4, 'four at the phone table');
      ok(/plus a surprise category/.test(await p.textContent('#app')), 'a player waiting at the table is told a surprise category is coming');
      await call('POST', R('volunteer'), P.Dorna.key, { on: true }); for (const nm of ['Bahar', 'Cyrus']) await call('POST', R('elect'), P[nm].key, { player: P.Dorna.me.id });
      await until(() => eyes.Bahar.state.referee === P.Dorna.me.id, 'phone referee'); await call('POST', R('start'), P.Bahar.key);
      await p.waitForSelector('#e-name'); const L = await p.textContent('.letter'), sur = eyes.Bahar.state.surprise[0];
      ok(await p.locator('.field.surprise').count() === 1 && /surprise/.test(await p.textContent('label[for="e-' + sur + '"]')) && /Surprise:/.test(await p.textContent('.surprise-note')) && await p.locator('input[data-cat]').count() === 9, 'in the round the surprise category is announced and its box is marked ✨');
      await p.locator('#e-name').tap(); await p.keyboard.type(word(L, 'Arash', 'name'));
      await p.waitForFunction(() => /already scored with this word today/.test(document.querySelector('#r-name').textContent));
      ok(await p.locator('#e-name.repeat').count() === 1 && (await p.textContent('#r-city')) === '', 'typing a word he already used today shows a warning under that box, and only that box');
      if (process.env.SHOTS) await p.screenshot({ path: path.join(process.env.SHOTS, 'repeat-warning.png'), fullPage: true });
      await p.fill('#e-name', L + 'brandnewname'); await p.waitForFunction(() => document.querySelector('#r-name').textContent === '');
      ok(await p.locator('#e-name.repeat').count() === 0, 'changing it to a new word clears the warning');
      ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no sideways scroll on the phone');
      await p.goto(site + '#guide'); await p.waitForSelector('.guide-step'); const guide = await p.textContent('#app');
      ok(/One word, once a day/.test(guide) && /Surprise categories/.test(guide), 'How to play explains both rules');
      ok(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
      Object.values(eyes).forEach(e => e.close());
    } finally { await browser.close(); }

    // the next day every word is fresh again (the saved day is moved back, as if a night had passed)
    await sleep(500); srv.kill(); await sleep(300);
    const file = path.join(fx.dir, 'players.json'), saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    ok(Object.keys(saved.players[P.Arash.me.id].used.words.name).length >= 22 && /^\d{4}-\d\d-\d\d$/.test(saved.players[P.Arash.me.id].used.day), 'today’s used words are saved with the player, so a server restart does not forget them');
    Object.values(saved.players).forEach(pl => { if (pl.used) pl.used.day = '2000-01-01'; }); fs.writeFileSync(file, JSON.stringify(saved));
    srv = start(); await sleep(700);
    const t3 = await table('Arash', ['Bahar', 'Cyrus', 'Dorna']);
    await call('POST', t3.R('settings'), P.Arash.key, { cats: ['name', 'city', 'food'], surprise: 0 });
    await call('POST', t3.R('volunteer'), P.Dorna.key, { on: true }); for (const nm of ['Arash', 'Bahar', 'Cyrus']) await call('POST', t3.R('elect'), P[nm].key, { player: P.Dorna.me.id });
    await until(() => t3.eye.state.referee === P.Dorna.me.id, 'referee 3');
    const next = await round(t3, full);
    ok(next.results.scores.players[P.Arash.me.id].total === 30 && next.replies.Arash.repeats.length === 0, 'the next day the same words score again: 30 points, no warning');
    Object.values(t3.eyes).forEach(e => e.close());
    console.log('\nchallenge: ' + n + ' checks passed');
  } finally { srv.kill(); if (web) web.kill(); fs.rmSync(fx.dir, { recursive: true, force: true }); }
})().catch(e => { console.error('FAILED: ' + e.message); process.exit(1); });
