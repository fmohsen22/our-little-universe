// Three people play in three browsers against the real server: sign-up, a table, a round, votes, a promotion, the story, the quiz, the leaderboard.
// Run: node tests/play.js   (SHOTS=dir saves screenshots)
const { chromium, devices } = require('playwright'), { spawn } = require('child_process'), path = require('path'), fs = require('fs');
const fx = require('./fixture.js')(), root = path.resolve(__dirname, '..'), site = 'http://127.0.0.1:4174/', apiUrl = 'http://127.0.0.1:8792';
const shots = process.env.SHOTS; if (shots) fs.mkdirSync(shots, { recursive: true });
const ok = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('  ok  ' + m); };
(async () => {
  const web = spawn('python3', ['-m', 'http.server', '4174', '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
  const api = spawn('node', [path.join(root, 'server', 'server.js')], { env: Object.assign({}, process.env, { PORT: '8792', DATA_DIR: fx.dir, LEVELS_FILE: fx.file, LEVEL_SCALE: '0.005', COLLECT_MS: '300', REVIEW_MS: '20000', MIN_PLAY_MS: '0', MIN_REVIEW_MS: '0', ALLOWED_ORIGINS: 'http://127.0.0.1:4174' }), stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 900));
  const browser = await chromium.launch(), errors = [];
  const person = async (name, opts) => { const ctx = await browser.newContext(opts); await ctx.route('**/config.js', r => r.fulfill({ contentType: 'text/javascript', body: "window.WPM_CONFIG={serverUrl:'" + apiUrl + "'};" })); const p = await ctx.newPage();
    p.on('console', m => { if (m.type() === 'error' && !/fonts\.g|net::ERR|409|403|401/.test(m.text())) errors.push(name + ': ' + m.text()); }); p.on('pageerror', e => errors.push(name + ': ' + e)); return p; };
  const shot = async (p, n) => { if (shots) await p.screenshot({ path: path.join(shots, n + '.png'), fullPage: true }); };
  const fits = async (p, w) => ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no sideways scroll: ' + w);
  const dismiss = async p => { for (let i = 0; i < 5 && await p.locator('#ceremony button[data-cer]').isVisible(); i++) await p.locator('#ceremony button[data-cer]').click(); };
  try {
    const a = await person('A', { ...devices['Pixel 7'] }), b = await person('B', { ...devices['iPhone 13'] }), c = await person('C', { viewport: { width: 1280, height: 800 } });
    await a.goto(site); await a.waitForSelector('#w-name'); await fits(a, 'welcome'); await shot(a, 'welcome');
    ok(await a.locator('.map svg').isVisible() && /United Kingdom/.test(await a.textContent('.map figcaption')) && await a.locator('.map-river').count() === 1 && await a.locator('.map circle').count() === 0, 'the welcome screen shows the map of Iran and Turan'); await a.fill('#w-name', 'Mohsey'); await a.fill('#w-pass', 'rostam-123'); await a.locator('[data-f="royal"][data-v="Prince"]').click(); await a.click('form[data-form="register"] [type=submit]');
    await a.waitForSelector('.me-card'); ok(/Prince Mohsey/.test(await a.textContent('.me-name')) && /0 of 40 points to chapter 1/.test(await a.textContent('.me-card')), 'sign-up lands on home with level progress');
    await fits(a, 'home'); await a.locator('[data-act="create"]').click(); await a.waitForSelector('#t-link'); const link = await a.inputValue('#t-link'); const wa = await a.locator('a.wa').getAttribute('href'); ok(wa.startsWith('https://wa.me/?text=') && decodeURIComponent(wa).includes(link), 'the table has a Share on WhatsApp link carrying the invite'); await fits(a, 'lobby'); await shot(a, 'lobby');
    for (const [p, name, k] of [[b, 'Sufi', 'turan'], [c, 'Rudabeh', 'iran']]) { await p.goto(link); await p.waitForSelector('#w-name'); await p.fill('#w-name', name); await p.fill('#w-pass', 'secret-' + name); await p.locator('[data-f="kingdom"][data-v="' + k + '"]').click(); await p.click('form[data-form="register"] [type=submit]'); await p.waitForSelector('#t-people'); }
    await a.waitForFunction(() => document.querySelectorAll('#t-people li').length === 3); ok(/Waiting for the host/.test(await b.textContent('#app')), 'two friends join by invite link and wait for the host');
    await a.locator('[data-act="start"]').click(); for (const p of [a, b, c]) await p.waitForSelector('#e-name');
    const L = await a.textContent('.letter'); ok(L === await b.textContent('.letter') && L === await c.textContent('.letter') && Math.abs(+(await a.textContent('#t-time')) - +(await c.textContent('#t-time'))) <= 1, 'all three see the same letter and clock');
    const cats = ['name', 'surname', 'city', 'country', 'animal', 'food'];
    for (const k of cats) await a.fill('#e-' + k, L + 'a' + k);
    for (const k of cats.slice(0, 4)) await b.fill('#e-' + k, k === 'city' ? L + 'same' : L + 'b' + k);
    for (const k of cats.slice(0, 5)) await c.fill('#e-' + k, k === 'city' ? L + 'same' : k === 'animal' ? L + 'qqqq' : L + 'c' + k);
    await a.waitForFunction(() => /4\/6/.test(document.querySelector('#t-people').textContent) && /5\/6/.test(document.querySelector('#t-people').textContent)); ok(await a.inputValue('#e-food') === L + 'afood', 'progress of the others shows without disturbing what you typed');
    await fits(b, 'play'); await shot(b, 'play');
    await a.locator('[data-act="stop"]').click(); for (const p of [a, b, c]) await p.waitForSelector('.review');
    ok(/shared/.test(await a.textContent('.review')) && /nothing/.test(await a.textContent('.review')), 'review shows everyone’s answers with shared and empty ones marked');
    const rej = sel => '[data-act="vote"][data-cat="animal"]' + sel;
    await a.locator(rej('')).last().click(); await b.locator(rej('')).last().click();
    await c.waitForFunction(() => /rejected/.test(document.querySelector('.review').textContent)); ok(true, 'two votes reject an answer, live on the third screen');
    await fits(a, 'review'); await shot(a, 'review');
    for (const p of [a, b, c]) await p.locator('[data-act="ready"]').click();
    for (const p of [a, b, c]) await p.waitForFunction(() => /wins the round/.test(document.querySelector('#app').textContent));
    await a.waitForSelector('#ceremony .cer-box'); ok(/Young Hero/.test(await a.textContent('#cer-title')) && /Prince Mohsey wins the round/.test(await c.textContent('#app')), 'the winner is announced to all and promoted with a ceremony'); await shot(a, 'ceremony'); await dismiss(a);
    await a.waitForFunction(() => /You scored 60/.test(document.querySelector('#app').textContent)); ok(/You scored 35/.test(await b.textContent('#app')) && /You scored 35/.test(await c.textContent('#app')), 'scores: 60 for six unique answers, 35 and 35 for the others');
    await fits(c, 'results'); await shot(c, 'results-desktop');
    await a.locator('a[href="#level-1"]').first().click(); await a.waitForSelector('.story'); ok(/Test chapter 1/.test(await a.textContent('.story h1')), 'reaching the points opens the chapter story'); await fits(a, 'story');
    await a.locator('[data-act="quiz"]').click(); await a.waitForSelector('fieldset.q'); ok(await a.locator('fieldset.q').count() === 5, 'the quiz has five questions');
    for (let i = 0; i < 5; i++) await a.locator('fieldset.q').nth(i).locator('label', { hasText: 'right' }).click(); await shot(a, 'quiz');
    await a.click('form[data-form="quiz"] [type=submit]'); await a.waitForSelector('#ceremony .cer-box'); ok(/Chapter 1/.test(await a.textContent('#cer-title')), 'passing the quiz unlocks the chapter'); await dismiss(a);
    await a.goto(site + '#journey'); await a.waitForSelector('.chapter'); ok(await a.locator('.chapter.passed').count() === 1 && /0 of 50 points/.test(await a.textContent('.chapter.current')), 'the journey shows chapter 1 passed and chapter 2 needing 30% more'); await fits(a, 'journey'); await shot(a, 'journey');
    await b.goto(site + '#leaders'); await b.waitForSelector('.leaders tbody tr'); const rows = await b.locator('.leaders tbody tr').allTextContents();
    ok(rows.length === 3 && /Mohsey/.test(rows[0]) && /Young Hero/.test(rows[0]) && await b.locator('.leaders tr.you').count() === 1, 'the leaderboard lists all three, Mohsey first, and highlights you'); await fits(b, 'leaderboard'); await shot(b, 'leaders');
    await a.goto(site + '#me'); await a.waitForSelector('.profile'); ok(await a.locator('.medal-card.earned').count() === 1 && await a.locator('.medal-card').count() === 16, 'the profile shows eight ranks and eight achievements, one earned'); await fits(a, 'profile'); await shot(a, 'profile');
    const d = await person('D', { ...devices['Pixel 7'] }); await d.goto(site); await d.waitForSelector('#w-name'); await d.locator('[data-m="login"]').click(); await d.fill('#w-name', 'mohsey'); await d.fill('#w-pass', 'wrong-pass'); await d.click('form[data-form="login"] [type=submit]');
    await d.waitForFunction(() => /do not match/.test(document.querySelector('#toast').textContent)); await d.fill('#w-pass', 'rostam-123'); await d.click('form[data-form="login"] [type=submit]');
    await d.waitForSelector('.me-card'); ok(/Prince Mohsey/.test(await d.textContent('.me-name')) && /chapter 1 of 7/.test(await d.textContent('.me-card')), 'name and password sign the same player in on another device, with all their progress');
    await d.goto(site + '#level-1'); await d.waitForSelector('.story'); ok(/You have passed this chapter/.test(await d.textContent('#app')), 'a chapter that was won can be read again, on any device');
    await d.goto(site + '#me'); await d.waitForSelector('[data-act="signout"]'); await d.locator('[data-act="signout"]').click(); await d.locator('[data-act="signout"]').click(); await d.waitForSelector('#w-name'); ok(true, 'signing out returns to the welcome screen');
    await a.reload(); await a.waitForSelector('.profile'); ok(/Young Hero/.test(await a.textContent('.p-title')), 'everything is still there after a reload');
    ok(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
    console.log('\nALL PASSED');
  } finally { await browser.close(); web.kill(); api.kill(); fs.rmSync(fx.dir, { recursive: true, force: true }); }
})().catch(e => { console.error('\nFAILED:', e.message); process.exit(1); });
