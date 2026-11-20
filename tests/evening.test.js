// A whole evening with everything at its real defaults (surprise categories on, one word once a day on):
// eight players at two tables in parallel, the referee changing every round, real words from word lists so that
// answers are sometimes shared, a few made-up words for the referee to reject, players swapping tables half way so
// letters and words come back. Every score is worked out here independently and compared with the server.
// Then four phones play a complete round through the real pages. Run: node tests/evening.test.js
process.env.LEVEL_SCALE = '0.005';
const { spawn } = require('child_process'), path = require('path'), assert = require('assert'), fs = require('fs');
const G = require('../server/game.js'), M = require('../server/mohsey.js'), fx = require('./fixture.js')(), root = path.resolve(__dirname, '..');
const PORT = 8809, base = 'http://127.0.0.1:' + PORT, site = 'http://127.0.0.1:4186/';
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; console.log('  ok  ' + m); };
const call = async (method, p, key, body) => { const r = await fetch(base + p, { method, headers: Object.assign({ 'Content-Type': 'application/json' }, key ? { Authorization: 'Bearer ' + key } : {}), body: body ? JSON.stringify(body) : undefined }); return { status: r.status, json: await r.json().catch(() => ({})) }; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, what) => { for (let i = 0; i < 250; i++) { if (f()) return; await sleep(30); } throw new Error('timed out: ' + what); };
async function listen(code, key) { const ctl = new AbortController(), box = { state: null, close: () => ctl.abort() }; const r = await fetch(base + '/api/rooms/' + code + '/events?k=' + key, { signal: ctl.signal });
  (async () => { const dec = new TextDecoder(); let buf = ''; try { for await (const ch of r.body) { buf += dec.decode(ch, { stream: true }); let i; while ((i = buf.indexOf('\n\n')) >= 0) { const m = /data: (.*)/.exec(buf.slice(0, i)); buf = buf.slice(i + 2); if (m) box.state = JSON.parse(m[1]); } } } catch (e) { /* closed */ } })(); return box; }
const env = Object.assign({}, process.env, { PORT, DATA_DIR: fx.dir, LEVELS_FILE: fx.file, LEVEL_SCALE: '0.005', COLLECT_MS: '50', MIN_PLAY_MS: '0', ROUNDS_PER_HOUR: '1000', ALLOWED_ORIGINS: 'http://127.0.0.1:4186' }); delete env.REPEAT_RULE; delete env.SURPRISE_DEFAULT;
let seed = 11; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

(async () => {
  const srv = spawn('node', [path.join(root, 'server', 'server.js')], { env, stdio: 'ignore' }); let web;
  try {
    await sleep(700);
    const names = ['Arash', 'Bahar', 'Cyrus', 'Dorna', 'Elham', 'Farid', 'Golnaz', 'Hamid'], P = {}, E = {};
    for (const nm of names) { const r = (await call('POST', '/api/register', null, { name: nm, password: 'pw-' + nm + '-1' })).json; P[nm] = { key: r.key, id: r.me.id }; E[nm] = { total: 0, wins: 0, rounds: 0, refereed: 0, used: {} }; }
    ok(Object.keys(P).length === 8, 'eight players create accounts');

    // What a player writes: a real word from the lists when there is one (so two players sometimes choose the same),
    // sometimes nothing, sometimes a made-up word ("…zz") that the referee will reject.
    function answer(nm, L, cat, i) {
      const x = rnd();
      if (x < 0.08) return '';
      if (x < 0.16) return L + 'zz' + nm.toLowerCase();
      const real = (M.WORDS[cat] || []).filter(w => G.startsWith(w, L));
      if (real.length) return real[(i + Math.floor(rnd() * 2)) % Math.min(real.length, 3)];   // a small personal vocabulary: repeats and shared answers happen
      return L + nm.toLowerCase() + cat;                                                    // a surprise category: the player's own idea
    }
    async function seat(group) {
      const code = (await call('POST', '/api/rooms', P[group[0]].key, {})).json.code, eyes = {};
      for (const nm of group) eyes[nm] = await listen(code, P[nm].key);
      await until(() => eyes[group[0]].state && eyes[group[0]].state.players.filter(p => p.online).length === group.length, 'table');
      for (const nm of group) await call('POST', '/api/rooms/' + code + '/volunteer', P[nm].key, { on: true });
      return { code, group, eyes, eye: eyes[group[0]], R: p => '/api/rooms/' + code + '/' + p, round: 0 };
    }
    const stats = { rounds: 0, shared: 0, repeats: 0, rejected: 0, empty: 0, surprises: new Set(), letters: {} };
    async function round(t) {
      const ref = t.group[t.round % t.group.length], players = t.group.filter(x => x !== ref), i = t.round; t.round++;
      for (const nm of players) await call('POST', t.R('elect'), P[nm].key, { player: P[ref].id });
      await call('POST', t.R('elect'), P[ref].key, { player: null });
      await until(() => t.eye.state.referee === P[ref].id, 'referee ' + ref);
      const before = t.eye.state.round; await call('POST', t.R('start'), P[t.group[0]].key); await until(() => t.eye.state.phase === 'play' && t.eye.state.round === before + 1, 'play');
      const st = t.eye.state, L = st.letter, cats = st.cats, sheets = {};
      assert.strictEqual(cats.length, 9, 'eight categories and a surprise'); stats.surprises.add(st.surprise[0]); (stats.letters[t.code] = stats.letters[t.code] || []).push(L);
      const stopper = players[i % players.length];
      for (const nm of players) { sheets[nm] = {}; cats.forEach(c => { let a = answer(nm, L, c, names.indexOf(nm) + i); if (nm === stopper && !a) a = L + nm.toLowerCase() + c; sheets[nm][c] = a; }); }
      const warned = {}; for (const nm of players) warned[nm] = (await call('POST', t.R('answers'), P[nm].key, { answers: sheets[nm] })).json.repeats;
      const stop = await call('POST', t.R('stop'), P[stopper].key, { answers: sheets[stopper] }); assert.strictEqual(stop.status, 200, JSON.stringify(stop.json));
      await until(() => t.eye.state.phase === 'review', 'review');
      // the referee rejects every made-up word that the game has not already refused
      const rejected = {}; for (const nm of players) for (const c of cats) { const a = t.eye.state.scores.players[P[nm].id].cats[c]; if (a.status === 'ok' && /zz/.test(a.text)) { await call('POST', t.R('judge'), P[ref].key, { player: P[nm].id, cat: c, accept: false }); (rejected[nm] = rejected[nm] || {})[c] = true; stats.rejected++; } }
      await call('POST', t.R('verdict'), P[ref].key); await until(() => t.eye.state.phase === 'results', 'results');
      const res = t.eye.state.scores;
      // the same round, scored here by the rules as written in How to play
      const pts = {}; players.forEach(nm => { pts[nm] = 0; });
      cats.forEach(c => {
        const good = {};
        players.forEach(nm => { const text = sheets[nm][c], k = G.key(text); let status = 'ok';
          if (!k) { status = 'empty'; stats.empty++; } else if (c === 'country' && G.notACountry(text)) status = 'country';
          else if ((E[nm].used[c] || []).includes(k)) { status = 'repeat'; stats.repeats++; } else if ((rejected[nm] || {})[c]) status = 'referee';
          assert.strictEqual(res.players[P[nm].id].cats[c].status, status, nm + ' ' + c + ' "' + text + '" in round ' + t.round + ' at ' + t.code);
          if (status === 'repeat') assert.ok(warned[nm].includes(c), nm + ' was warned about ' + text);
          if (status === 'ok') (good[k] = good[k] || []).push(nm); });
        Object.values(good).forEach(list => { if (list.length > 1) stats.shared += list.length; list.forEach(nm => { pts[nm] += list.length === 1 ? 10 : 5; (E[nm].used[c] = E[nm].used[c] || []).push(G.key(sheets[nm][c])); }); });
      });
      const top = Math.max(...Object.values(pts)), best = players.filter(nm => pts[nm] === top), winner = top > 0 && best.length === 1 ? best[0] : null;
      players.forEach(nm => { assert.strictEqual(res.players[P[nm].id].total, pts[nm], nm + ' total in round ' + t.round + ' at ' + t.code); E[nm].total += pts[nm]; E[nm].rounds++; if (winner === nm) E[nm].wins++; });
      assert.strictEqual(res.winner, winner ? P[winner].id : null, 'winner'); E[ref].refereed++; stats.rounds++;
    }

    // first half: two tables of four, six rounds each, at the same time
    let tables = await Promise.all([seat(names.slice(0, 4)), seat(names.slice(4))]);
    for (let r = 0; r < 6; r++) await Promise.all(tables.map(round));
    ok(true, 'first half: two tables play six rounds each at the same time, the referee changing every round; every answer and every score is what the rules say');
    // second half: the players mix, so letters and words come back for them
    tables.forEach(t => Object.values(t.eyes).forEach(e => e.close())); await sleep(300);
    tables = await Promise.all([seat(['Arash', 'Elham', 'Cyrus', 'Golnaz']), seat(['Bahar', 'Farid', 'Dorna', 'Hamid'])]);
    for (let r = 0; r < 20; r++) await Promise.all(tables.map(round));
    ok(true, 'second half: the players mix into two new tables and play twenty more rounds each, still all correct');
    ok(stats.rounds === 52 && stats.shared > 20 && stats.repeats > 20 && stats.rejected > 20 && stats.empty > 20, stats.rounds + ' rounds in all, with ' + stats.shared + ' shared answers, ' + stats.repeats + ' words refused as already used today, ' + stats.rejected + ' rejected by referees and ' + stats.empty + ' empty boxes');
    ok(Object.values(stats.letters).every(l => new Set(l.slice(0, 22)).size === Math.min(l.length, 22)) && stats.surprises.size >= 10, 'no table repeated a letter within its first 22 rounds, and ' + stats.surprises.size + ' of the 12 surprise categories came up');

    const wrong = [];
    for (const nm of names) { const me = (await call('GET', '/api/me', P[nm].key)).json.me, e = E[nm];
      ['total', 'wins', 'rounds', 'refereed'].forEach(f => { if (me[f] !== e[f]) wrong.push(nm + ' ' + f + ' ' + me[f] + ', expected ' + e[f]); });
      G.RANKS.forEach(r => { if (!!me.ranks[r.id] !== (e.wins >= r.wins)) wrong.push(nm + ' rank ' + r.id); });
      if (me.quizReady !== (e.total >= G.levelPoints(1))) wrong.push(nm + ' quizReady'); }
    ok(wrong.length === 0, 'all eight records are right: points, victories, rounds played, rounds refereed, ranks and the first chapter' + (wrong.length ? '\n      ' + wrong.join('\n      ') : ''));
    const board = (await call('GET', '/api/leaderboard')).json.players;
    ok(board.length === 8 && board.every((p, i) => i === 0 || board[i - 1].total >= p.total) && board.every(p => p.total === E[p.name].total), 'the leaderboard lists all eight in the right order');
    const reader = names.find(nm => E[nm].total >= G.levelPoints(1));
    const story = await call('GET', '/api/story/1', P[reader].key), q = (await call('POST', '/api/quiz/start', P[reader].key)).json;
    const pass = (await call('POST', '/api/quiz/answer', P[reader].key, { answers: q.questions.map(x => x.options.indexOf('right')) })).json;
    ok(story.status === 200 && pass.passed && pass.me.level === 1, reader + ' has the points, reads chapter 1 and passes its quiz');
    tables.forEach(t => Object.values(t.eyes).forEach(e => e.close()));

    // four phones, one complete round through the real pages, everything at its defaults
    web = spawn('python3', ['-m', 'http.server', '4186', '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' }); await sleep(500);
    const { chromium, devices } = require('playwright'), browser = await chromium.launch(), errors = [];
    try {
      const phone = async (nm, device) => { const ctx = await browser.newContext({ ...devices[device] }); await ctx.route('**/config.js', q2 => q2.fulfill({ contentType: 'text/javascript', body: "window.WPM_CONFIG={serverUrl:'" + base + "',princeImage:'assets/prince-mohsey.jpg'};" }));
        const p = await ctx.newPage(); p.on('pageerror', e => errors.push(nm + ': ' + e)); p.on('console', m => { if (m.type() === 'error' && !/fonts\.g|net::ERR|40\d/.test(m.text())) errors.push(nm + ': ' + m.text()); });
        await p.goto(site); await p.waitForSelector('#w-name'); await p.locator('[data-m="login"]').tap(); await p.fill('#w-name', nm); await p.fill('#w-pass', 'pw-' + nm + '-1'); await p.locator('form[data-form="login"] [type=submit]').tap(); await p.waitForSelector('.me-card');
        for (let i = 0; i < 5 && await p.locator('#ceremony button[data-cer]').isVisible(); i++) await p.locator('#ceremony button[data-cer]').tap();
        return p; };
      const a = await phone('Arash', 'Pixel 7'), b = await phone('Bahar', 'iPhone 13'), c = await phone('Cyrus', 'Galaxy S9+'), d = await phone('Dorna', 'iPhone SE'), all = [a, b, c, d];
      ok(/Where is the Prince\?/.test(await a.title()) && /Where is the Prince\?/.test(await a.textContent('.mark')), 'the game is called “Where is the Prince?” on every phone');
      await a.locator('[data-act="create"]').tap(); await a.waitForSelector('#t-link'); const link = await a.inputValue('#t-link');
      for (const p of [b, c, d]) { await p.goto(link); await p.waitForSelector('#t-people'); }
      await a.waitForFunction(() => document.querySelectorAll('#t-people li').length === 4);
      ok(await a.locator('[data-f="surprise"][data-v="1"]').getAttribute('aria-pressed') === 'true', 'the host sees the surprise setting, on One');
      await d.locator('[data-act="volunteer"]').tap(); for (const p of [a, b, c]) { await p.waitForSelector('[data-act="elect"]'); await p.locator('[data-act="elect"]').tap(); }
      await a.waitForFunction(() => /Dorna is the referee/.test(document.querySelector('#app').textContent)); await a.locator('[data-act="start"]').tap();
      for (const p of [a, b, c]) await p.waitForSelector('#e-name');
      const L = await a.textContent('.letter'), cats = await a.evaluate(() => Array.from(document.querySelectorAll('input[data-cat]')).map(i => i.dataset.cat)), sur = cats[8];
      ok(cats.length === 9 && await b.locator('.field.surprise').count() === 1 && (await a.textContent('.surprise-note')) === (await c.textContent('.surprise-note')), 'three phones get the same letter, eight categories and the same surprise category');
      const country = M.WORDS.country.find(w => G.startsWith(w, L)) || '';
      for (const [p, nm] of [[a, 'ph1'], [b, 'ph2'], [c, 'ph3']]) for (const k of cats) { if (p !== a && k === 'color') continue; await p.fill('#e-' + k, k === 'country' ? country : k === 'city' ? L + 'sharedcity' : L + nm + k); }
      await d.waitForFunction(() => { const t = document.querySelector('#t-people').textContent; return /9\/9/.test(t) && (t.match(/8\/9/g) || []).length === 2; });   // every phone's answers have reached the server
      await a.locator('[data-act="stop"]').tap(); for (const p of all) await p.waitForSelector('.review');
      // the three already played today: whoever has used this country before gets nothing for it now
      const fresh = country ? ['Arash', 'Bahar', 'Cyrus'].filter(nm => !(E[nm].used.country || []).includes(G.key(country))) : [], cPts = nm => fresh.includes(nm) ? (fresh.length > 1 ? 5 : 10) : 0;
      ok(await d.locator('.judge-btn').count() === 22 + fresh.length && await a.locator('.judge-btn').count() === 0, 'the referee’s phone gets a ✓ on every answer that could count; the players get none');
      await d.locator('.ans', { hasText: L + 'ph2food' }).locator('.judge-btn').tap(); await b.waitForFunction(() => /rejected by the referee/.test(document.querySelector('.review').textContent));
      await d.locator('[data-act="verdict"]').tap(); for (const p of all) await p.waitForFunction(() => /wins the round/.test(document.querySelector('#app').textContent));
      const expectA = 70 + 5 + cPts('Arash'), expectB = 60 + 5 + cPts('Bahar') - 10, expectC = 60 + 5 + cPts('Cyrus');
      if (fresh.length < 3 && country) ok(/already used today/.test(await d.textContent('.review')), 'a country one of them had already used today (' + country + ') is refused on the phones too');
      for (let i = 0; i < 5 && await a.locator('#ceremony button[data-cer]').isVisible(); i++) await a.locator('#ceremony button[data-cer]').tap();
      if (process.env.DEBUG_EVENING) for (const p of [a, b, c]) console.log('   debug:', ((await p.textContent('#app')).match(/You scored[^.]*/) || [])[0], '|', (await p.textContent('.review')).replace(/\s+/g, ' ').slice(0, 700));
      ok(new RegExp('You scored ' + expectA + '(?!\\d)').test(await a.textContent('#app')) && new RegExp('You scored ' + expectB + '(?!\\d)').test(await b.textContent('#app')) && new RegExp('You scored ' + expectC + '(?!\\d)').test(await c.textContent('#app')), 'scores on the phones: ' + expectA + ', ' + expectB + ' (one answer rejected) and ' + expectC + ', with the shared city at 5');
      ok(/Arash wins the round/.test(await d.textContent('#app')) && /Thank you for refereeing/.test(await d.textContent('#app')) && (await d.textContent('.review')).includes('✨'), 'everyone sees the winner; the referee sees all the answers, the surprise category marked ✨');
      for (const p of all) assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'fits the phone');
      ok(errors.length === 0, 'nothing is wider than any of the four phones, and there are no errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
      if (process.env.SHOTS) await d.screenshot({ path: path.join(process.env.SHOTS, 'evening-referee.png'), fullPage: true });
    } finally { await browser.close(); }
    console.log('\n  leaderboard after the evening:\n' + (await call('GET', '/api/leaderboard')).json.players.map((p, i) => '    ' + (i + 1) + '. ' + p.name.padEnd(7) + ' points ' + String(p.total).padStart(4) + '  wins ' + String(p.wins).padStart(2) + '  ' + (p.title || '-')).join('\n'));
    console.log('\nevening: ' + n + ' checks passed');
  } finally { srv.kill(); if (web) web.kill(); fs.rmSync(fx.dir, { recursive: true, force: true }); }
})().catch(e => { console.error('FAILED: ' + e.message); process.exit(1); });
