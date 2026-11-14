// Plays all six games in Chromium: alone on one device (phone + desktop), then as two devices sharing a fake store.
const { chromium, devices } = require('playwright');
const path = require('path'), fs = require('fs');
const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
const shots = process.env.SHOTS; if (shots) fs.mkdirSync(shots, { recursive: true });
const ok = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('  ok  ' + m); };
const watch = (page, errors, tag) => { page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|net::ERR/.test(m.text())) errors.push(tag + m.text()); }); page.on('pageerror', e => errors.push(tag + e)); };
const noScroll = async (p, w) => ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no sideways scroll: ' + w);

async function solo(name, opts) {
  console.log('\n== ' + name + ' =='); const b = await chromium.launch(), ctx = await b.newContext(opts), p = await ctx.newPage(), errors = [];
  watch(p, errors, ''); const shot = async n => { if (shots) await p.screenshot({ path: path.join(shots, name + '-' + n + '.png'), fullPage: true }); };
  const go = async h => { await p.goto(url + '#' + h); await p.waitForSelector('.ghead, .hero'); };
  const act = a => p.locator('[data-act="' + a + '"]').first().click(), who = () => p.click('#who');
  await go('home'); ok(await p.locator('.tile').count() === 6, 'home shows six games'); await noScroll(p, 'home'); await shot('home');
  await act('surprise'); ok(await p.locator('.surprise h2').isVisible(), 'Surprise Us picks a game');

  await go('questions'); await act('deal'); const q1 = await p.textContent('#q-text'); await act('next'); const q2 = await p.textContent('#q-text');
  ok(q1 && q2 && q1 !== q2, 'question cards flip to a new question'); await act('prev'); ok(await p.textContent('#q-text') === q1, 'previous returns to the earlier card');
  await p.locator('[data-cat="flirty"]').click(); ok(/of 20/.test(await p.textContent('.note')), 'a category holds 20 cards'); await act('keep'); await noScroll(p, 'questions'); await shot('questions');

  await go('life'); await act('roll'); ok(await p.locator('.scene mark').count() === 6, 'imaginary life rolls a scene');
  await p.fill('#l-text', 'The chickens unionise.'); await p.click('form [type=submit]'); await act('twist');
  ok(await p.locator('.story li').count() === 2 && await p.locator('.story .twist').count() === 1, 'story line and plot twist are added'); await act('keep'); await noScroll(p, 'life'); await shot('life');

  await go('truths'); await p.fill('#t0', 'I once met a goat.'); await p.fill('#t1', 'I can juggle.'); await p.fill('#t2', 'I hate tea.'); await p.check('#lie1'); await p.click('form [type=submit]');
  ok(await p.locator('.card.feature').isVisible() && await p.locator('.option').count() === 0, 'author cannot see the options while waiting');
  await who(); await p.locator('.option').nth(1).click(); ok(/found the lie/.test(await p.textContent('.turn')), 'guesser finds the lie and scores');
  ok((await p.locator('.score b').allTextContents()).join() === '0,1', 'two truths score is 0–1'); await shot('truths'); await act('swap'); await who(); await noScroll(p, 'truths');

  await go('missions'); await act('deal'); ok(await p.locator('.big-text').isVisible(), 'a mission is dealt'); await act('done');
  await p.locator('[data-m="versus"]').click(); await act('deal'); await p.locator('[data-act="win"]').nth(1).click();
  ok((await p.locator('.score b').allTextContents()).join() === '1,0,1', 'missions tally together and versus results'); await noScroll(p, 'missions');

  await go('draw'); await act('word'); const word = await p.textContent('#d-word'); await act('start');
  const box = await p.locator('#d-canvas').boundingBox(); await p.mouse.move(box.x + 40, box.y + 40); await p.mouse.down(); await p.mouse.move(box.x + 150, box.y + 120, { steps: 6 }); await p.mouse.move(box.x + 60, box.y + 200, { steps: 6 }); await p.mouse.up();
  const inked = await p.evaluate(() => { const c = document.querySelector('#d-canvas'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 100) n++; return n; });
  ok(inked > 50, 'drawing puts ink on the canvas (' + inked + ' px)'); await noScroll(p, 'draw'); await shot('draw');
  await who(); await p.fill('#d-guess', 'banana'); await p.click('form [type=submit]'); ok(await p.locator('#d-guesses li').count() === 1, 'a wrong guess is listed');
  await p.fill('#d-guess', word.toUpperCase()); await p.click('form [type=submit]'); ok(/got it/.test(await p.textContent('.turn')), 'the right word ends the round');
  ok((await p.locator('.score b').allTextContents()).join() === '1,2', 'draw scores 1 for the artist, 2 for the guesser'); await act('again'); await who();

  await go('esm'); await p.locator('[data-s="60"]').click(); await act('start'); ok(/^[A-W]$/.test(await p.textContent('.letter')), 'esm famil picks a letter');
  await p.fill('#e-name', 'Sara'); await p.fill('#e-city', 'شیراز'); await who(); await p.fill('#e-name', 'sara'); await p.fill('#e-food', 'Soup'); await act('stop');
  ok((await p.locator('.pts').allTextContents()).slice(0, 2).join() === '5,5', 'matching answers are suggested at 5 each'); await noScroll(p, 'esm'); await shot('esm');
  await p.locator('.pts').nth(0).click(); ok(await p.locator('.pts').nth(0).textContent() === '0', 'a score can be changed by hand'); await act('finish');
  const tot = (await p.locator('.score b').allTextContents()).join(); ok(tot === '10,15', 'esm totals add up to 10 and 15 (got ' + tot + ')');

  await go('questions'); await p.locator('[data-act="award"]').nth(1).click(); await go('life'); await p.locator('[data-act="award"]').nth(0).click();
  await go('scores'); const rows = await p.locator('.board tbody tr').count(), lead = await p.textContent('.big-text');
  ok(rows === 6 && await p.locator('.rounds li').count() === 6, 'scoreboard lists six games and the six decided rounds');
  ok(/Sophie leads 5 to 1/.test(lead), 'scoreboard names the leader (' + lead + ')'); await p.waitForFunction(() => document.querySelectorAll('.badge.earned').length >= 4);
  const earned = (await p.locator('.badge.earned b').allTextContents()).join(', '); ok(/First win/.test(earned) && /High five/.test(earned) && /Hat-trick/.test(earned) && /On fire/.test(earned), 'badges are earned from wins: ' + earned);
  await p.locator('[data-act="reset"]').click(); await p.locator('[data-act="reset"]').click(); await p.reload(); await p.waitForSelector('.badge');
  ok(/No rounds/.test(await p.textContent('#lead')) && await p.locator('.badge.earned').count() >= 4, 'badges stay saved after a reload and after scores are reset');
  await noScroll(p, 'scores'); await shot('scores');
  await go('book'); ok(await p.locator('.memories li').count() >= 4, 'memory book holds the kept items'); await noScroll(p, 'book'); await shot('book');
  await p.reload(); ok(await p.locator('.memories li').count() >= 4, 'memories survive a reload');
  ok(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.join(' | ') : '')); await b.close();
}

// A stand-in for the shared store: documents in localStorage, change events between the two pages.
const fakeDb = () => {
  const subs = {}, read = k => { const v = localStorage.getItem('fake:' + k); return v ? JSON.parse(v) : undefined; };
  const merge = (t, p) => { for (const k in p) { if (p[k] && typeof p[k] === 'object' && !Array.isArray(p[k])) { t[k] = merge(t[k] && typeof t[k] === 'object' && !Array.isArray(t[k]) ? t[k] : {}, p[k]); } else t[k] = p[k]; } return t; };
  const fire = k => (subs[k] || []).forEach(f => { const d = read(k); f({ exists: d !== undefined, data: () => d, metadata: {} }); });
  window.addEventListener('storage', e => { if (e.key && e.key.startsWith('fake:')) fire(e.key.slice(5)); });
  const doc = k => ({
    set: async d => { localStorage.setItem('fake:' + k, JSON.stringify(d)); fire(k); },
    update: async d => { const cur = read(k); if (cur === undefined) throw { code: 'invalid_argument' }; localStorage.setItem('fake:' + k, JSON.stringify(merge(cur, d))); fire(k); },
    onSnapshot: f => { (subs[k] = subs[k] || []).push(f); setTimeout(() => fire(k), 30); return () => {}; }
  });
  window.claude = { use: async n => (n === 'db' ? { doc } : null) };
};

async function duo() {
  console.log('\n== two devices =='); const b = await chromium.launch(), ctx = await b.newContext({ ...devices['Pixel 7'] }), errors = [];
  await ctx.addInitScript(fakeDb); const a = await ctx.newPage(), s = await ctx.newPage(); watch(a, errors, 'A: '); watch(s, errors, 'B: ');
  await a.goto(url); await s.goto(url); await s.click('#who'); await a.waitForFunction(() => document.querySelector('#sync').dataset.s === 'live');
  ok(await a.textContent('#sync') === 'Synced' && /Sophie/.test(await s.textContent('#who')), 'both devices report Synced, second one plays as Sophie');
  await a.goto(url + '#truths'); await s.goto(url + '#truths');
  await a.fill('#t0', 'One'); await a.fill('#t1', 'Two'); await a.fill('#t2', 'Three'); await a.check('#lie2'); await a.click('form [type=submit]');
  await s.waitForSelector('.option'); await s.locator('.option').nth(0).click(); await a.waitForSelector('.option.lie');
  ok(/fooled/.test(await a.textContent('.turn')), 'two truths: statements and the reveal travel between devices');
  await a.goto(url + '#draw'); await s.goto(url + '#draw'); await a.locator('[data-act="word"]').click(); await a.locator('[data-act="start"]').click(); await s.waitForSelector('#d-guess');
  const box = await a.locator('#d-canvas').boundingBox(), cdp = await ctx.newCDPSession(a), pt = (x, y) => [{ x: box.x + x, y: box.y + y }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(50, 50) });
  for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(50 + i * 18, 50 + i * 14) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await s.waitForFunction(() => { const c = document.querySelector('#d-canvas'); if (!c) return false; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 100) n++; return n > 50; });
  ok(true, 'draw: a finger stroke on one phone appears on the other');
  const word = await a.evaluate(() => JSON.parse(localStorage.getItem('fake:universe/draw')).word);
  await s.fill('#d-guess', word); await s.click('form [type=submit]'); await a.waitForFunction(() => /got it/.test((document.querySelector('.turn') || {}).textContent || ''));
  ok(true, 'draw: the correct guess ends the round on both phones');
  await a.goto(url + '#esm'); await s.goto(url + '#esm'); await a.locator('[data-act="start"]').click(); await s.waitForSelector('#e-name');
  await a.fill('#e-name', 'Anna'); await s.fill('#e-name', 'Ali'); await s.fill('#e-animal', 'Ant'); await a.waitForTimeout(900);
  ok(await a.inputValue('#e-name') === 'Anna' && await s.inputValue('#e-name') === 'Ali', 'esm: each phone keeps its own answers while typing');
  await a.locator('[data-act="stop"]').click(); await s.waitForSelector('.review');
  await a.waitForFunction(() => document.querySelectorAll('.ans')[1] && /Ali/.test(document.querySelectorAll('.ans')[1].textContent));
  ok(/Anna/.test(await s.locator('.ans').nth(0).textContent()), 'esm: stopping ends the round for both and shows both sets of answers');
  ok(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.join(' | ') : '')); await b.close();
}

// A stand-in for the Supabase client: rows in localStorage, broadcasts and presence as storage events between the two pages.
const fakeSupabase = `window.supabase = { createClient: function () {
  var rows = function () { return JSON.parse(localStorage.getItem('sb:rows') || '{}'); }, put = function (r) { localStorage.setItem('sb:rows', JSON.stringify(r)); };
  var merge = function (t, p) { for (var k in p) { if (p[k] && typeof p[k] === 'object' && !Array.isArray(p[k])) t[k] = merge(t[k] && typeof t[k] === 'object' && !Array.isArray(t[k]) ? t[k] : {}, p[k]); else t[k] = p[k]; } return t; };
  return {
    rpc: function (fn, a) { return new Promise(function (res) { setTimeout(function () { var r = rows(), k = a.p_room + '/' + a.p_name;
      if (fn === 'olu_load') return res({ data: Object.keys(r).filter(function (x) { return x.indexOf(a.p_room + '/') === 0; }).map(function (x) { return { name: x.split('/')[1], data: r[x] }; }), error: null });
      if (fn === 'olu_save') r[k] = a.p_data; else r[k] = merge(r[k] || {}, a.p_part); put(r); res({ data: null, error: null }); }, 40); }); },
    channel: function (name, o) { var on = {}, key = o.config.presence.key, people = function () { var out = {}; for (var i = 0; i < localStorage.length; i++) { var x = localStorage.key(i); if (x.indexOf('sb:here:' + name + ':') === 0) out[x] = 1; } return out; };
      window.addEventListener('storage', function (e) { if (e.key === 'sb:bc:' + name && e.newValue && on.op) on.op({ payload: JSON.parse(e.newValue).payload }); if (e.key && e.key.indexOf('sb:here:') === 0 && on.sync) on.sync(); });
      var ch = { on: function (type, f, cb) { on[type === 'broadcast' ? 'op' : 'sync'] = cb; return ch; }, subscribe: function (cb) { setTimeout(function () { cb('SUBSCRIBED'); }, 20); return ch; },
        send: function (m) { localStorage.setItem('sb:bc:' + name, JSON.stringify({ payload: m.payload, n: Math.random() })); }, track: function () { localStorage.setItem('sb:here:' + name + ':' + key, '1'); if (on.sync) on.sync(); }, presenceState: people };
      return ch; } };
} };`;

async function online(mode) {
  console.log(mode === 'server' ? '\n== two phones through the real room server (server/server.js) ==' : '\n== two phones through the Supabase adapter (stand-in server) ==');
  const { spawn } = require('child_process'), srv = spawn('python3', ['-m', 'http.server', '4174', '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' });
  const data = fs.mkdtempSync(path.join(require('os').tmpdir(), 'olu-'));
  const api = mode === 'server' ? spawn('node', [path.resolve(__dirname, '..', 'server', 'server.js')], { env: { ...process.env, PORT: '8788', DATA_DIR: data, ALLOWED_ORIGINS: 'http://127.0.0.1:4174' }, stdio: 'ignore' }) : null;
  await new Promise(r => setTimeout(r, 900)); const base = 'http://127.0.0.1:4174/';
  const b = await chromium.launch(), ctx = await b.newContext({ ...devices['Pixel 7'] }), errors = [];
  try {
    await ctx.route('**/config.js', r => r.fulfill({ contentType: 'text/javascript', body: mode === 'server' ? "window.OLU_CONFIG={serverUrl:'http://127.0.0.1:8788/'};" : "window.OLU_CONFIG={supabaseUrl:'https://example.invalid',supabaseAnonKey:'test'};" }));
    await ctx.route('**/vendor/supabase.js', r => r.fulfill({ contentType: 'text/javascript', body: fakeSupabase }));
    const a = await ctx.newPage(); watch(a, errors, 'A: '); await a.goto(base); await a.waitForFunction(() => document.querySelector('#sync').dataset.s === 'live');
    const link = await a.inputValue('#invite'); ok(/\?room=[A-Za-z0-9]{20}$/.test(link), 'the host gets a private invite link');
    // the guest is a separate browser profile for identity (own "me"), sharing the stand-in server's storage
    const s = await ctx.newPage(); watch(s, errors, 'B: '); await s.addInitScript(() => { const g = Storage.prototype.getItem, st = Storage.prototype.setItem; Storage.prototype.getItem = function (k) { return g.call(this, k.indexOf('olu:') === 0 ? 'guest:' + k : k); }; Storage.prototype.setItem = function (k, v) { return st.call(this, k.indexOf('olu:') === 0 ? 'guest:' + k : k, v); }; });
    await s.goto(link); await s.waitForFunction(() => /both online/.test(document.querySelector('#sync').textContent));
    ok(/Sophie/.test(await s.textContent('#who')) && /Mosi/.test(await a.textContent('#who')), 'opening the link joins the room as player two, and both show online');
    await a.goto(link + '#esm'); await s.goto(link + '#esm'); await a.waitForSelector('[data-act="start"]'); await a.locator('[data-act="start"]').click(); await s.waitForSelector('#e-name');
    ok(await s.textContent('.letter') === await a.textContent('.letter') && Math.abs(+(await s.textContent('#e-time')) - +(await a.textContent('#e-time'))) <= 1, 'esm famil: same letter and the same 90-second clock on both phones');
    await a.fill('#e-name', 'Anna'); await a.fill('#e-city', 'Athens'); await s.fill('#e-name', 'Ali'); await s.waitForTimeout(900);
    await s.locator('[data-act="stop"]').click(); await a.waitForSelector('.review'); await s.waitForFunction(() => /Athens/.test(document.querySelector('.review').textContent));
    await a.locator('[data-act="finish"]').click(); await s.waitForFunction(() => /Round 1/.test((document.querySelector('.turn') || {}).textContent || ''));
    ok((await s.locator('.score b').allTextContents()).join() === '20,10', 'esm famil: the round is scored 20 to 10 on both phones');
    await s.goto(link + '#scores'); await s.waitForSelector('.rounds li'); ok(/Mosi leads 1 to 0/.test(await s.textContent('.big-text')), 'the scoreboard on the other phone shows the winner');
    await a.reload(); await a.waitForFunction(() => document.querySelector('#sync').dataset.s === 'live'); await a.goto(link + '#scores'); await a.waitForSelector('.rounds li');
    ok(await a.locator('.rounds li').count() === 1, 'scores come back from the database after a reload');
    ok(await a.locator('.badge.earned').count() === 1 && /Mosi/.test(await a.textContent('.badge.earned .holders')), 'the First win badge is stored in the database for the winner');
    ok(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
    if (mode === 'server') { await new Promise(r => setTimeout(r, 400)); const files = fs.readdirSync(data).filter(f => f.endsWith('.json')); const saved = JSON.parse(fs.readFileSync(path.join(data, files[0]), 'utf8'));
      ok(files.length === 1 && saved.scores.log.length === 1 && saved.badges.p0.first > 0, 'the server wrote the room to disk: scores, badges and game state'); }
  } finally { await b.close(); srv.kill(); if (api) api.kill(); fs.rmSync(data, { recursive: true, force: true }); }
}

(async () => {
  await solo('phone', { ...devices['Pixel 7'] });
  await solo('desktop', { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, colorScheme: 'light' });
  await duo(); await online('supabase'); await online('server'); console.log('\nALL PASSED');
})().catch(e => { console.error('\nFAILED:', e.message); process.exit(1); });
