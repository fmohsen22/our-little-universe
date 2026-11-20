// When nobody wants to be the referee: the game picks one (taking turns), the referee is paid, and a table where
// everyone agrees can play with no referee at all and judge together. On the real server, then on three phones.
// Run: node tests/referee.test.js
process.env.LEVEL_SCALE = '0.005';
const { spawn } = require('child_process'), path = require('path'), assert = require('assert'), fs = require('fs');
const G = require('../server/game.js'), fx = require('./fixture.js')(), root = path.resolve(__dirname, '..');
const PORT = 8811, base = 'http://127.0.0.1:' + PORT, site = 'http://127.0.0.1:4188/';
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; console.log('  ok  ' + m); };
const call = async (method, p, key, body) => { const r = await fetch(base + p, { method, headers: Object.assign({ 'Content-Type': 'application/json' }, key ? { Authorization: 'Bearer ' + key } : {}), body: body ? JSON.stringify(body) : undefined }); return { status: r.status, json: await r.json().catch(() => ({})) }; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, what) => { for (let i = 0; i < 200; i++) { if (f()) return; await sleep(30); } throw new Error('timed out: ' + what); };
async function listen(code, key) { const ctl = new AbortController(), box = { state: null, close: () => ctl.abort() }; const r = await fetch(base + '/api/rooms/' + code + '/events?k=' + key, { signal: ctl.signal });
  (async () => { const dec = new TextDecoder(); let buf = ''; try { for await (const ch of r.body) { buf += dec.decode(ch, { stream: true }); let i; while ((i = buf.indexOf('\n\n')) >= 0) { const m = /data: (.*)/.exec(buf.slice(0, i)); buf = buf.slice(i + 2); if (m) box.state = JSON.parse(m[1]); } } } catch (e) { /* closed */ } })(); return box; }
const env = Object.assign({}, process.env, { PORT, DATA_DIR: fx.dir, LEVELS_FILE: fx.file, LEVEL_SCALE: '0.005', COLLECT_MS: '50', MIN_PLAY_MS: '0', ROUNDS_PER_HOUR: '1000', REPEAT_RULE: '0', SURPRISE_DEFAULT: '0', ALLOWED_ORIGINS: 'http://127.0.0.1:4188' }); delete env.REFEREE_POINTS;
const CATS = ['name', 'city', 'food'];

(async () => {
  const srv = spawn('node', [path.join(root, 'server', 'server.js')], { env, stdio: 'ignore' }); let web;
  try {
    await sleep(700);
    ok((await call('GET', '/api/meta')).json.refereePoints === 20, 'a referee earns 20 points for each round they judge');
    const names = ['Arash', 'Bahar', 'Cyrus', 'Dorna'], P = {}; for (const nm of names) P[nm] = (await call('POST', '/api/register', null, { name: nm, password: 'pw-' + nm + '-1' })).json;
    const idName = id => names.find(nm => P[nm].me.id === id), me = async nm => (await call('GET', '/api/me', P[nm].key)).json.me;
    const code = (await call('POST', '/api/rooms', P.Arash.key, {})).json.code, eyes = {}, R = p => '/api/rooms/' + code + '/' + p; for (const nm of names) eyes[nm] = await listen(code, P[nm].key);
    const eye = eyes.Arash; await until(() => eye.state && eye.state.players.filter(p => p.online).length === 4, 'table');
    await call('POST', R('settings'), P.Arash.key, { cats: CATS });
    // play one round; the referee (if any) gives the verdict straight away
    async function play(judge) {
      const before = eye.state.round, start = await call('POST', R('start'), P.Arash.key); assert.strictEqual(start.status, 200, JSON.stringify(start.json));
      await until(() => eye.state.phase === 'play' && eye.state.round === before + 1, 'play');
      const st = eye.state, L = st.letter, players = st.players.filter(p => p.inRound).map(p => p.name), ref = idName(st.referee);
      for (const nm of players) await call('POST', R('answers'), P[nm].key, { answers: Object.fromEntries(CATS.map(c => [c, L + nm.toLowerCase() + c])) });
      await call('POST', R('stop'), P[players[0]].key, { answers: Object.fromEntries(CATS.map(c => [c, L + players[0].toLowerCase() + c])) }); await until(() => eye.state.phase === 'review', 'review');
      if (judge) await judge(eye.state, players, L);
      if (ref) { await call('POST', R('verdict'), P[ref].key); await until(() => eye.state.phase === 'results', 'results'); }
      return { ref, players, L, results: eye.state };
    }

    // 1. nobody volunteers: the game picks, and takes turns
    const stuck = await call('POST', R('start'), P.Arash.key);
    ok(stuck.status === 409 && /let the game pick one/.test(stuck.json.error), 'with no volunteer the round cannot start, and the message points to letting the game pick');
    ok((await call('POST', R('pickref'), P.Bahar.key, { on: true })).status === 409, 'only the host can ask the game to pick');
    await call('POST', R('pickref'), P.Arash.key, { on: true }); await until(() => eye.state.auto === true && eye.state.referee, 'picked');
    ok(names.some(nm => P[nm].me.id === eye.state.referee), 'the host taps “Pick a referee for us” and the game names one of the four');
    const refs = [], before = {}; for (const nm of names) before[nm] = await me(nm);
    const r1 = await play(); refs.push(r1.ref);
    const paid = await me(r1.ref);
    ok(r1.results.scores.refereePoints === 20 && paid.total === 20 && paid.levelPoints === 20 && paid.refereed === 1 && paid.rounds === 0 && r1.players.length === 3, 'the picked referee judges, does not play, and earns 20 points toward the next chapter');
    for (let i = 0; i < 3; i++) refs.push((await play()).ref);
    ok(new Set(refs).size === 4 && refs.every((x, i) => i === 0 || x !== refs[i - 1]), 'over four rounds everyone is the referee exactly once (' + refs.join(', ') + ')');
    const after4 = {}; for (const nm of names) after4[nm] = await me(nm);
    ok(names.every(nm => after4[nm].refereed === 1 && after4[nm].rounds === 3 && after4[nm].total === 3 * 30 + 20), 'so after four rounds all four have the same: three rounds played, one refereed, 110 points');
    for (let i = 0; i < 4; i++) refs.push((await play()).ref);
    ok(new Set(refs.slice(4)).size === 4, 'and the next four rounds go round the table again (' + refs.slice(4).join(', ') + ')');
    // choosing by hand again
    await call('POST', R('volunteer'), P.Dorna.key, { on: true }); await until(() => eye.state.auto === false, 'manual');
    ok(eye.state.referee === null && eye.state.volunteers.length === 1, 'when someone volunteers, the table is choosing its referee itself again');
    for (const nm of ['Arash', 'Bahar', 'Cyrus']) await call('POST', R('elect'), P[nm].key, { player: P.Dorna.me.id });
    await until(() => eye.state.referee === P.Dorna.me.id, 'elected'); ok((await play()).ref === 'Dorna', 'and the elected referee judges as before');

    // 2. no referee, when everyone agrees
    for (const nm of ['Arash', 'Bahar', 'Cyrus']) await call('POST', R('noref'), P[nm].key, { on: true });
    await until(() => eye.state.noRef.agreed.length === 3, 'three agree');
    ok(eye.state.noRef.active === false && eye.state.referee === P.Dorna.me.id, 'three of four agree to play without a referee: not enough, the referee stays');
    await call('POST', R('noref'), P.Dorna.key, { on: true }); await until(() => eye.state.noRef.active === true, 'all agree');
    ok(eye.state.referee === null, 'when the fourth agrees too, the table has no referee');
    const totals0 = {}; for (const nm of names) totals0[nm] = (await me(nm));
    const t = await play(async (st, players, L) => {
      ok(st.tableRound === true && players.length === 4 && st.referee === null, 'in a round without a referee all four play');
      const vote = (who, target, cat, reject) => call('POST', R('vote'), P[who].key, { player: P[target].me.id, cat, reject });
      ok((await vote('Arash', 'Arash', 'name', true)).status === 409 && (await call('POST', R('judge'), P.Arash.key, { player: P.Bahar.me.id, cat: 'name', accept: false })).status === 403 && (await call('POST', R('verdict'), P.Arash.key)).status === 403, 'nobody votes on their own answer, and nobody can act as a referee');
      await vote('Bahar', 'Arash', 'name', true); await until(() => (eye.state.tableVotes[P.Arash.me.id] || {}).name, 'one vote');
      ok(eye.state.scores.players[P.Arash.me.id].cats.name.status === 'ok', 'one vote of three is not enough to reject an answer');
      await vote('Cyrus', 'Arash', 'name', true); await until(() => eye.state.scores.players[P.Arash.me.id].cats.name.status === 'rejected', 'rejected');
      ok(eye.state.scores.players[P.Arash.me.id].total === 20, 'two of the three others vote against it: the answer falls');
      await vote('Cyrus', 'Arash', 'name', false); await until(() => eye.state.scores.players[P.Arash.me.id].cats.name.status === 'ok', 'back');
      ok(eye.state.scores.players[P.Arash.me.id].total === 30, 'a vote taken back brings the answer back');
      await vote('Cyrus', 'Arash', 'name', true); await vote('Dorna', 'Bahar', 'food', true); await vote('Arash', 'Bahar', 'food', true);
      await call('POST', R('ready'), P.Arash.key); await call('POST', R('ready'), P.Bahar.key); await until(() => eye.state.players.filter(p => p.ready).length === 2, 'two done');
      await vote('Dorna', 'Cyrus', 'city', true); await until(() => eye.state.players.every(p => !p.ready), 'reopened');
      ok(eye.state.phase === 'review', 'a new vote after someone pressed Done reopens the check for everyone');
      for (const nm of ['Arash', 'Bahar', 'Cyrus']) await call('POST', R('ready'), P[nm].key); await sleep(150);
      ok(eye.state.phase === 'review', 'the round waits until every player has pressed Done');
      await call('POST', R('ready'), P.Dorna.key); await until(() => eye.state.phase === 'results', 'table results');
    });
    const sc = t.results.scores;
    ok(sc.tableRound === true && sc.referee === null && !sc.refereePoints && sc.players[P.Arash.me.id].total === 20 && sc.players[P.Bahar.me.id].total === 20 && sc.players[P.Cyrus.me.id].total === 30 && sc.players[P.Dorna.me.id].total === 30 && sc.players[P.Cyrus.me.id].cats.city.status === 'ok', 'when the last one is done the round is scored: the two rejected answers count 0, a single vote changes nothing');
    const totals1 = {}; for (const nm of names) totals1[nm] = await me(nm);
    ok(names.every(nm => totals1[nm].total === totals0[nm].total + sc.players[P[nm].me.id].total && totals1[nm].refereed === totals0[nm].refereed && totals1[nm].rounds === totals0[nm].rounds + 1), 'the points go on everyone’s record, and nobody is counted as a referee');
    // someone leaving during the check does not block the others
    await play(async () => { for (const nm of ['Arash', 'Bahar', 'Cyrus']) await call('POST', R('ready'), P[nm].key); await sleep(100); assert.strictEqual(eye.state.phase, 'review'); eyes.Dorna.close(); await until(() => eye.state.phase === 'results', 'results without Dorna'); });
    ok(eye.state.phase === 'results' && eye.state.scores.players[P.Dorna.me.id].total === 30, 'if a player leaves during the check, the round ends when the others are done, and the one who left keeps their points');
    eyes.Dorna = await listen(code, P.Dorna.key); await until(() => eye.state.players.filter(p => p.online).length === 4, 'Dorna back');

    // 3. changing their minds before the next round
    ok(eye.state.noRef.active === true && eye.state.noRef.agreed.length === 4, 'a player whose connection dropped and came back has not lost their agreement: still no referee');
    await call('POST', R('noref'), P.Bahar.key, { on: false }); await until(() => eye.state.noRef.active === false, 'Bahar changes her mind');
    ok(eye.state.referee === P.Dorna.me.id && eye.state.noRef.agreed.length === 3, 'one player changes her mind before the next round: the referee the table elected earlier is the referee again');
    const back = await play(); ok(back.ref === 'Dorna' && back.results.scores.tableRound === false && back.results.scores.refereePoints === 20 && back.players.length === 3, 'and that round is judged by the referee, who is paid for it');
    ok((await call('POST', R('noref'), P.Arash.key, { on: true })).status === 200 && (await call('POST', R('start'), P.Arash.key)).status === 200 && (await call('POST', R('noref'), P.Cyrus.key, { on: true })).status === 409, 'the choice can only be changed between rounds, not while one is running');
    Object.values(eyes).forEach(e => e.close()); await sleep(200);
    // two people: with a referee it cannot work, without one it can, by challenge and agreement
    const two = (await call('POST', '/api/rooms', P.Arash.key, {})).json.code, e2 = { a: await listen(two, P.Arash.key), b: await listen(two, P.Bahar.key) }, R2 = x => '/api/rooms/' + two + '/' + x;
    await until(() => e2.a.state && e2.a.state.players.filter(x => x.online).length === 2, 'two'); await call('POST', R2('settings'), P.Arash.key, { cats: CATS });
    await call('POST', R2('pickref'), P.Arash.key, { on: true }); await until(() => e2.a.state.referee, 'picked for two');
    const few = await call('POST', R2('start'), P.Arash.key);
    ok(few.status === 409 && /at least 2 players besides the referee/.test(few.json.error), 'two people cannot play with a referee: that takes three');
    for (const nm of ['Arash', 'Bahar']) await call('POST', R2('noref'), P[nm].key, { on: true }); await until(() => e2.a.state.noRef.active, 'two agree');
    const rec0 = { a: await me('Arash'), b: await me('Bahar') };
    ok((await call('POST', R2('start'), P.Arash.key)).status === 200, 'but when both agree to play without a referee, the round starts');
    await until(() => e2.a.state.phase === 'play', 'duo play'); const L2 = e2.a.state.letter, sheet2 = nm => Object.fromEntries(CATS.map(c => [c, L2 + nm + 'duo' + c]));
    ok(e2.a.state.players.filter(x => x.inRound).length === 2 && e2.a.state.tableRound === true, 'both of them play');
    await call('POST', R2('answers'), P.Bahar.key, { answers: sheet2('bahar') }); await call('POST', R2('stop'), P.Arash.key, { answers: sheet2('arash') }); await until(() => e2.a.state.phase === 'review', 'duo review');
    const stOf = (nm, c) => e2.a.state.scores.players[P[nm].me.id].cats[c].status;
    ok((await call('POST', R2('concede'), P.Bahar.key, { cat: 'food', agree: true })).status === 409, 'an answer nobody challenged cannot be given up');
    await call('POST', R2('vote'), P.Arash.key, { player: P.Bahar.me.id, cat: 'food', reject: true }); await until(() => ((e2.a.state.tableVotes[P.Bahar.me.id] || {}).food || []).length === 1, 'challenged');
    ok(stOf('Bahar', 'food') === 'ok' && e2.a.state.scores.players[P.Bahar.me.id].total === 30, 'Arash challenges one of Bahar’s answers: alone he cannot remove it, it still counts');
    ok((await call('POST', R2('concede'), P.Arash.key, { cat: 'food', agree: true })).status === 409, 'and he cannot agree on her behalf');
    await call('POST', R2('concede'), P.Bahar.key, { cat: 'food', agree: true }); await until(() => stOf('Bahar', 'food') === 'rejected', 'agreed');
    ok(e2.a.state.scores.players[P.Bahar.me.id].total === 20, 'Bahar agrees (“OK, remove it”): now the answer falls');
    await call('POST', R2('concede'), P.Bahar.key, { cat: 'food', agree: false }); await until(() => stOf('Bahar', 'food') === 'ok', 'kept');
    ok(true, 'she can change her mind and keep it after all');
    await call('POST', R2('concede'), P.Bahar.key, { cat: 'food', agree: true }); await until(() => stOf('Bahar', 'food') === 'rejected', 'agreed again');
    await call('POST', R2('vote'), P.Arash.key, { player: P.Bahar.me.id, cat: 'food', reject: false }); await until(() => stOf('Bahar', 'food') === 'ok', 'challenge withdrawn');
    await call('POST', R2('vote'), P.Arash.key, { player: P.Bahar.me.id, cat: 'food', reject: true }); await sleep(120);
    ok(stOf('Bahar', 'food') === 'ok', 'a challenge that is taken back and made again needs her agreement again');
    await call('POST', R2('concede'), P.Bahar.key, { cat: 'food', agree: true }); await until(() => stOf('Bahar', 'food') === 'rejected', 'final');
    await call('POST', R2('ready'), P.Arash.key); await sleep(100); assert.strictEqual(e2.a.state.phase, 'review'); await call('POST', R2('ready'), P.Bahar.key); await until(() => e2.a.state.phase === 'results', 'duo results');
    const rec1 = { a: await me('Arash'), b: await me('Bahar') }, d2 = e2.a.state.scores;
    ok(d2.scored === true && d2.players[P.Arash.me.id].total === 30 && d2.players[P.Bahar.me.id].total === 20 && d2.winner === P.Arash.me.id && rec1.a.total === rec0.a.total + 30 && rec1.b.total === rec0.b.total + 20 && rec1.a.wins === rec0.a.wins + 1, 'when both are done the round is scored 30 to 20 and counts on their records like any other');
    ok((await call('GET', '/api/rooms', P.Cyrus.key)).json.online >= 3, 'the home page can show how many players are online now');
    Object.values(e2).forEach(e => e.close()); await sleep(200);
    const one = (await call('POST', '/api/rooms', P.Cyrus.key, {})).json.code, e1 = await listen(one, P.Cyrus.key); await until(() => e1.state, 'alone');
    await call('POST', '/api/rooms/' + one + '/noref', P.Cyrus.key, { on: true }); const alone = await call('POST', '/api/rooms/' + one + '/start', P.Cyrus.key);
    ok(alone.status === 409 && /at least 2 players/.test(alone.json.error), 'one person alone cannot start a round'); e1.close();

    // on three phones: agree, play, vote, done
    web = spawn('python3', ['-m', 'http.server', '4188', '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' }); await sleep(500);
    const { chromium, devices } = require('playwright'), browser = await chromium.launch(), errors = [];
    try {
      const phone = async (nm, device) => { const ctx = await browser.newContext({ ...devices[device] }); await ctx.route('**/config.js', q => q.fulfill({ contentType: 'text/javascript', body: "window.WPM_CONFIG={serverUrl:'" + base + "',princeImage:'assets/prince-mohsey.jpg'};" }));
        const p = await ctx.newPage(); p.on('pageerror', e => errors.push(nm + ': ' + e)); p.on('console', m => { if (m.type() === 'error' && !/fonts\.g|net::ERR|40\d/.test(m.text())) errors.push(nm + ': ' + m.text()); });
        await p.goto(site); await p.waitForSelector('#w-name'); await p.locator('[data-m="login"]').tap(); await p.fill('#w-name', nm); await p.fill('#w-pass', 'pw-' + nm + '-1'); await p.locator('form[data-form="login"] [type=submit]').tap(); await p.waitForSelector('.me-card');
        for (let i = 0; i < 6 && await p.locator('#ceremony button[data-cer]').isVisible(); i++) await p.locator('#ceremony button[data-cer]').tap();
        return p; };
      const a = await phone('Arash', 'Pixel 7'), b = await phone('Bahar', 'iPhone 13'), c = await phone('Cyrus', 'iPhone SE'), all = [a, b, c];
      await a.locator('[data-act="create"]').tap(); await a.waitForSelector('#t-link'); const link = await a.inputValue('#t-link');
      for (const p of [b, c]) { await p.goto(link); await p.waitForSelector('#t-people'); }
      await a.waitForFunction(() => document.querySelectorAll('#t-people li').length === 3);
      ok(/earns 20 points for each round/.test(await a.textContent('.election')) && await a.locator('[data-act="pickref"]').isVisible() && await b.locator('[data-act="pickref"]').count() === 0 && /The host can let the game pick/.test(await b.textContent('.election')), 'the referee card says what a referee earns; the host has “Pick a referee for us”, the others are told the host can');
      await a.locator('[data-act="pickref"]').tap(); await b.waitForFunction(() => /is the referee for the next round\. The game is taking turns/.test(document.querySelector('.election').textContent));
      ok(await a.locator('[data-act="start"]').isEnabled() && /Choose a referee ourselves/.test(await a.textContent('[data-act="pickref"]')), 'one tap and the game names a referee: the round can start');
      if (process.env.SHOTS) await a.screenshot({ path: path.join(process.env.SHOTS, 'referee-picked.png'), fullPage: true });
      await a.locator('[data-act="noref"]').tap(); await b.locator('[data-act="noref"]').tap();
      await c.waitForFunction(() => /2 of 3 agreed/.test(document.querySelector('#nr-count').textContent)); ok(/Arash, Bahar/.test(await c.textContent('#nr-count')) && !/No referee: the table judges/.test(await c.textContent('.election')), 'two tap “I agree: no referee”; the third sees 2 of 3 agreed, and the referee stays for now');
      await c.locator('[data-act="noref"]').tap(); for (const p of all) await p.waitForFunction(() => /No referee: the table judges together/.test(document.querySelector('.election').textContent));
      ok(true, 'when the third agrees, every phone shows “No referee: the table judges together”');
      for (const id of ['surname', 'country', 'animal', 'thing', 'color']) { const k = await a.locator('.checks input:checked').count(); await a.locator('#c-' + id).tap(); await a.waitForFunction(x => document.querySelectorAll('.checks input:checked').length === x, k - 1); }
      await a.locator('[data-act="start"]').tap(); for (const p of all) await p.waitForSelector('#e-name');
      const L = await a.textContent('.letter');
      for (const [p, nm] of [[a, 'one'], [b, 'two'], [c, 'three']]) for (const k of CATS) await p.fill('#e-' + k, L + nm + k);
      await a.waitForFunction(() => (document.querySelector('#t-people').textContent.match(/3\/3/g) || []).length === 3);
      await a.locator('[data-act="stop"]').tap(); for (const p of all) await p.waitForSelector('.review');
      ok(/No referee this round/.test(await a.textContent('#app')) && await a.locator('[data-act="tvote"]').count() === 6 && await a.locator('[data-act="verdict"]').count() === 0, 'in the check, each phone gets a ✓ on the six answers of the other two players, and none on its own');
      const target = p => p.locator('.ans', { hasText: L + 'threefood' }).locator('[data-act="tvote"]');
      await target(a).tap(); await c.waitForFunction(() => /1 of 2 against/.test(document.querySelector('.review').textContent));
      ok(await target(a).textContent() === '✗' && await c.locator('.ans', { hasText: L + 'threefood' }).locator('.pts').textContent() === '10', 'one tap votes against an answer; its owner sees “1 of 2 against”, and it still counts');
      await target(b).tap(); await c.waitForFunction(() => /rejected by the table/.test(document.querySelector('.review').textContent));
      ok(await c.locator('.ans', { hasText: L + 'threefood' }).locator('.pts').textContent() === '0', 'the second vote rejects it, live on every phone');
      if (process.env.SHOTS) await a.screenshot({ path: path.join(process.env.SHOTS, 'table-review.png'), fullPage: true });
      await a.locator('[data-act="tready"]').tap(); await a.waitForFunction(() => /Waiting for the others… \(1 of 3\)/.test(document.querySelector('.verdict-bar').textContent)); await b.waitForFunction(() => /✓ done/.test(document.querySelector('#t-people').textContent));
      ok(true, 'pressing Done shows who has finished checking');
      await b.locator('[data-act="tready"]').tap(); await c.locator('[data-act="tready"]').tap();
      for (const p of all) await p.waitForFunction(() => /No referee: judged by the table/.test(document.querySelector('#app').textContent));
      for (let i = 0; i < 6 && await c.locator('#ceremony button[data-cer]').isVisible(); i++) await c.locator('#ceremony button[data-cer]').tap();
      ok(/You scored 20(?!\d)/.test(await c.textContent('#app')) && /You scored 30(?!\d)/.test(await a.textContent('#app')) && /As the table judged them/.test(await b.textContent('#app')), 'when all three are done the round is scored: 30, 30 and 20, “judged by the table”');
      await c.locator('[data-act="noref"]').tap(); await a.waitForFunction(() => /is the referee for the next round/.test(document.querySelector('.election').textContent));
      ok(/2 of 3 agreed/.test(await a.textContent('#nr-count')), 'before the next round one player changes their mind: the table has a referee again');
      // the third player leaves: two are left, and they play without a referee
      await c.locator('[data-act="leave"]').tap(); await a.waitForFunction(() => document.querySelectorAll('#t-people li').length === 2);
      await a.waitForFunction(() => /2 of 2 agreed/.test(document.querySelector('#nr-count').textContent) && /No referee: the table judges together/.test(document.querySelector('.election').textContent));
      ok(/challenge the other’s answer/.test(await a.textContent('.noref')) && await a.locator('[data-act="start"]').isEnabled(), 'with two left, both still agreed: the card explains the two-player rule and the round can start');
      for (const p of [a, b]) for (let i = 0; i < 6 && await p.locator('#ceremony button[data-cer]').isVisible(); i++) await p.locator('#ceremony button[data-cer]').tap();
      await a.locator('[data-act="start"]').tap(); for (const p of [a, b]) await p.waitForSelector('#e-name');
      const L3 = await a.textContent('.letter'); for (const [p, nm] of [[a, 'uno'], [b, 'due']]) for (const k of CATS) await p.fill('#e-' + k, L3 + nm + k);
      await a.waitForFunction(() => (document.querySelector('#t-people').textContent.match(/3\/3/g) || []).length === 2); await a.locator('[data-act="stop"]').tap(); for (const p of [a, b]) await p.waitForSelector('.review');
      ok(/Just the two of you/.test(await a.textContent('#app')) && await b.locator('[data-act="tvote"]').count() === 3 && await a.locator('[data-act="concede"]').count() === 0, 'the two-player check explains the rule; each can challenge the other’s three answers');
      await b.locator('.ans', { hasText: L3 + 'unofood' }).locator('[data-act="tvote"]').tap(); await a.waitForSelector('[data-act="concede"]');
      ok(/challenged/.test(await a.textContent('.review')) && await a.locator('.ans', { hasText: L3 + 'unofood' }).locator('.pts').textContent() === '10' && /OK, remove it/.test(await a.textContent('[data-act="concede"]')), 'a challenged answer still counts, and its owner gets an “OK, remove it” button');
      if (process.env.SHOTS) await a.screenshot({ path: path.join(process.env.SHOTS, 'duo-challenged.png'), fullPage: true });
      await a.locator('[data-act="concede"]').tap(); await b.waitForFunction(() => /removed by agreement/.test(document.querySelector('.review').textContent));
      ok(await b.locator('.ans', { hasText: L3 + 'unofood' }).locator('.pts').textContent() === '0' && /Keep it after all/.test(await a.textContent('[data-act="concede"]')), 'when the owner agrees the answer is removed, on both phones');
      await a.locator('[data-act="tready"]').tap(); await b.locator('[data-act="tready"]').tap(); for (const p of [a, b]) await p.waitForFunction(() => /No referee: judged by the table/.test(document.querySelector('#app').textContent));
      for (const p of [a, b]) for (let i = 0; i < 6 && await p.locator('#ceremony button[data-cer]').isVisible(); i++) await p.locator('#ceremony button[data-cer]').tap();
      ok(/You scored 20(?!\d)/.test(await a.textContent('#app')) && /You scored 30(?!\d)/.test(await b.textContent('#app')), 'the pair’s round is scored: 20 and 30');
      await a.goto(site + '#home'); await a.waitForSelector('.live'); ok(/players online now/.test(await a.textContent('.live')), 'the home page shows how many players are online now'); await a.goBack(); await a.waitForSelector('#t-people');
      for (const p of all) assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'fits the phone');
      await a.goto(site + '#guide'); await a.waitForSelector('.guide-step'); const guide = await a.textContent('#app'); ok(/Elect a referee\./.test(guide) && /Let the game pick\./.test(guide) && /No referee\./.test(guide) && /earns 20 points/.test(guide) && /more than half of the other players/.test(guide) && /Done checking/.test(guide) && /Just two of you\?/.test(guide) && /OK, remove it/.test(guide), 'How to play explains the three ways to judge a round, what the referee earns, and how the table votes without one');
      if (process.env.SHOTS) await a.screenshot({ path: path.join(process.env.SHOTS, 'guide-judging.png'), fullPage: true });
      ok(errors.length === 0, 'everything fits the three phones, with no errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
    } finally { await browser.close(); }
    console.log('\nreferee: ' + n + ' checks passed');
  } finally { srv.kill(); if (web) web.kill(); fs.rmSync(fx.dir, { recursive: true, force: true }); }
})().catch(e => { console.error('FAILED: ' + e.message); process.exit(1); });
