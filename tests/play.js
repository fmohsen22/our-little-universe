// Four people on four different phones play against the real server: sign-up, a table, electing a referee, a round,
// the referee's one-tap judging, a promotion, the story, the quiz, the leaderboard. Every screen is checked to fit the phone.
// Run: node tests/play.js   (SHOTS=dir saves screenshots)
process.env.REPEAT_RULE = '0'; process.env.SURPRISE_DEFAULT = '0'; process.env.REFEREE_POINTS = '0';   // these rules have their own tests (challenge.test.js, referee.test.js)
const { chromium, devices } = require('playwright'), { spawn } = require('child_process'), path = require('path'), fs = require('fs');
const fx = require('./fixture.js')(), root = path.resolve(__dirname, '..'), site = 'http://127.0.0.1:4174/', apiUrl = 'http://127.0.0.1:8792';
const shots = process.env.SHOTS; if (shots) fs.mkdirSync(shots, { recursive: true });
const ok = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('  ok  ' + m); };
(async () => {
  const web = spawn('python3', ['-m', 'http.server', '4174', '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
  const api = spawn('node', [path.join(root, 'server', 'server.js')], { env: Object.assign({}, process.env, { PORT: '8792', DATA_DIR: fx.dir, LEVELS_FILE: fx.file, LEVEL_SCALE: '0.005', COLLECT_MS: '300', REVIEW_MS: '60000', MIN_PLAY_MS: '0', ALLOWED_ORIGINS: 'http://127.0.0.1:4174' }), stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 900));
  const browser = await chromium.launch(), errors = [];
  const person = async (name, opts) => { const ctx = await browser.newContext(opts); await ctx.route('**/config.js', r => r.fulfill({ contentType: 'text/javascript', body: "window.WPM_CONFIG={serverUrl:'" + apiUrl + "',princeImage:'assets/prince-mohsey.jpg'};" }));
    await ctx.route('**/assets/prince-mohsey.jpg', r => r.fulfill({ contentType: 'image/jpeg', body: fs.readFileSync(path.join(root, 'assets', 'prince-mohsey.jpg')) })); /* a stand-in for the uploaded picture */ const p = await ctx.newPage();
    p.on('console', m => { if (m.type() === 'error' && !/fonts\.g|net::ERR|409|403|401/.test(m.text())) errors.push(name + ': ' + m.text()); }); p.on('pageerror', e => errors.push(name + ': ' + e)); return p; };
  const shot = async (p, n) => { if (shots) await p.screenshot({ path: path.join(shots, n + '.png'), fullPage: true }); };
  const fits = async (p, w) => ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no sideways scroll: ' + w);
  const dismiss = async p => { for (let i = 0; i < 5 && await p.locator('#ceremony button[data-cer]').isVisible(); i++) await p.locator('#ceremony button[data-cer]').click(); };
  try {
    const a = await person('A', { ...devices['Pixel 7'] }), b = await person('B', { ...devices['iPhone 13'] }), c = await person('C', { ...devices['Galaxy S9+'] }), r = await person('R', { ...devices['iPhone SE'] });
    const phones = [[a, 'Pixel 7'], [b, 'iPhone 13'], [c, 'Galaxy S9+'], [r, 'iPhone SE']], allFit = async w => { for (const [p, n] of phones) await fits(p, w + ' on ' + n); };
    await a.goto(site); await a.waitForSelector('#w-name'); await fits(a, 'welcome'); await shot(a, 'welcome');
    await a.locator('.hero a[href="#guide"]').tap(); await a.waitForSelector('.guide-step');
    ok(await a.locator('.guide-step').count() === 7 && /Esm Famil in one minute/.test(await a.textContent('#app')) && /Volunteer as referee/.test(await a.textContent('#app')) && /5 questions, 4 right/.test(await a.textContent('#app')), 'before signing up, How to play explains the game, the referee, points, crowns, chapters and the riddle');
    await fits(a, 'how to play'); await shot(a, 'guide'); await a.locator('a.back').tap(); await a.waitForSelector('#w-name');
    ok(await a.locator('.hero img.prince').isVisible() && await a.locator('.hero .prince-wrap svg').isHidden(), 'the uploaded picture of Prince Mohsey is shown instead of the drawing');
    ok(await a.locator('.map svg').isVisible() && /Salm/.test(await a.textContent('.map figcaption')) && await a.locator('.map-rum').count() === 1 && await a.locator('.map-river').count() === 1 && await a.locator('.map circle').count() === 0, 'the welcome screen shows the map of the three kingdoms'); await a.fill('#w-name', 'Mohsey'); await a.fill('#w-pass', 'rostam-123'); await a.locator('[data-f="royal"][data-v="Prince"]').tap(); await a.locator('form[data-form="register"] [type=submit]').tap();
    await a.waitForSelector('.me-card'); ok(/Fereydun divides the world/.test(await a.textContent('.legend-intro')) && /realm of Iraj/.test(await a.textContent('.legend-intro')), 'the home page tells the story of the three kingdoms'); ok(/Prince Mohsey/.test(await a.textContent('.me-name')) && /0 of 40 points to chapter 1/.test(await a.textContent('.me-card')), 'sign-up (by tapping, on a phone) lands on home with level progress');
    ok(await a.locator('.guide-link').isVisible(), 'a new player sees “New here? How to play” on the home page');
    await fits(a, 'home'); await a.locator('.map-more summary').tap(); await shot(a, 'home'); await a.locator('[data-act="create"]').tap(); await a.waitForSelector('#t-link'); const link = await a.inputValue('#t-link'); const wa = await a.locator('a.wa').getAttribute('href'); ok(wa.startsWith('https://wa.me/?text=') && decodeURIComponent(wa).includes(link), 'the table has a Share on WhatsApp link carrying the invite'); await fits(a, 'lobby');
    for (const [p, name, k] of [[b, 'Sufi', 'rum'], [c, 'Rudabeh', 'turan'], [r, 'Zal', 'iran']]) { await p.goto(link); await p.waitForSelector('#w-name'); await p.fill('#w-name', name); await p.fill('#w-pass', 'secret-' + name); await p.locator('[data-f="kingdom"][data-v="' + k + '"]').tap(); await p.locator('form[data-form="register"] [type=submit]').tap(); await p.waitForSelector('#t-people'); }
    await a.waitForFunction(() => document.querySelectorAll('#t-people li').length === 4); ok(/Waiting for the host/.test(await b.textContent('#app')), 'three friends join by invite link on their phones and wait for the host');
    ok(await a.locator('.checks input:checked').count() === 8 && !/فارسی|Invite link only/.test(await a.textContent('#app')), 'a new table has all eight categories, English only, open to everyone');
    ok(await a.locator('[data-act="start"]').isDisabled() && /Choose a referee first/.test(await a.textContent('#app')), 'the round cannot start until the table has a referee');
    for (const id of ['country', 'color']) { const n = await a.locator('.checks input:checked').count(); await a.locator('#c-' + id).tap(); await a.waitForFunction(k => document.querySelectorAll('.checks input:checked').length === k, n - 1); }

    // electing the referee
    await r.locator('[data-act="volunteer"]').tap(); for (const p of [a, b, c]) await p.waitForSelector('[data-act="elect"]');
    ok(await r.locator('[data-act="elect"]').count() === 0 && /Step down/.test(await r.textContent('[data-act="volunteer"]')), 'Zal volunteers as referee, and cannot vote for themself');
    await shot(b, 'election');
    for (const p of [a, b, c]) await p.locator('[data-act="elect"]').tap();
    for (const p of [a, b, c, r]) await p.waitForFunction(() => /Zal( \(you\))? is the referee/.test(document.querySelector('#app').textContent) && /3 votes/.test(document.querySelector('.election').textContent));
    ok(/Your vote/.test(await b.textContent('.election')) && /⚖️ referee/.test(await a.textContent('#t-people')), 'the others vote with one tap; Zal is elected with 3 votes and marked ⚖️ referee for everyone');
    await allFit('the election'); await shot(r, 'lobby-referee');

    await a.locator('[data-act="start"]').tap(); for (const p of [a, b, c]) await p.waitForSelector('#e-name');
    await r.waitForFunction(() => /You are the referee/.test(document.querySelector('#app').textContent)); ok(await r.locator('#e-name').count() === 0, 'the referee gets no answer sheet: they watch, then judge');
    const L = await a.textContent('.letter'); ok(L === await b.textContent('.letter') && L === await c.textContent('.letter') && L === await r.textContent('.letter') && Math.abs(+(await a.textContent('#t-time')) - +(await c.textContent('#t-time'))) <= 1, 'all four phones see the same letter and clock');
    const cats = ['name', 'surname', 'city', 'animal', 'food', 'thing'];
    await a.locator('#e-name').tap(); await a.keyboard.type(L + 'aname'); ok(await a.inputValue('#e-name') === L + 'aname', 'typing into a box works with the phone keyboard');
    for (const k of cats.slice(1)) await a.fill('#e-' + k, L + 'a' + k);
    for (const k of ['name', 'surname', 'city', 'food']) await b.fill('#e-' + k, k === 'city' ? L + 'same' : L + 'b' + k);
    for (const k of cats.slice(0, 5)) await c.fill('#e-' + k, k === 'city' ? L + 'same' : k === 'animal' ? L.repeat(4) : L + 'c' + k);
    await a.waitForFunction(() => /4\/6/.test(document.querySelector('#t-people').textContent) && /5\/6/.test(document.querySelector('#t-people').textContent)); ok(await a.inputValue('#e-food') === L + 'afood', 'progress of the others shows without disturbing what you typed');
    await allFit('the round'); await shot(b, 'play'); await shot(r, 'play-referee');
    await a.locator('[data-act="stop"]').tap(); for (const p of [a, b, c, r]) await p.waitForSelector('.review');

    // the referee judges: one tap per answer
    ok(/shared/.test(await a.textContent('.review')) && /nothing/.test(await a.textContent('.review')) && /not a word/.test(await a.textContent('.review')), 'everyone sees all the answers, with shared, empty and junk ones already marked');
    ok(await a.locator('.judge-btn').count() === 0 && /Zal is judging/.test(await a.textContent('#app')) && await a.locator('[data-act="verdict"]').count() === 0, 'players cannot judge: they see that Zal is judging');
    const okCount = await r.locator('.judge-btn').count();
    ok(okCount === 14 && await r.locator('.judge-btn[aria-pressed="true"]').count() === 0 && new RegExp(okCount + ' accepted · 0 rejected').test(await r.textContent('#j-count')), 'the referee gets a ✓ button on each of the 14 answers that could count, all accepted to begin with');
    const bFood = r.locator('.ans', { hasText: L + 'bfood' }).locator('.judge-btn'); await bFood.tap();
    await r.waitForFunction(() => /13 accepted · 1 rejected/.test(document.querySelector('#j-count').textContent));
    ok(await bFood.getAttribute('aria-pressed') === 'true' && await bFood.textContent() === '✗', 'one tap turns an answer to ✗ rejected, and the counter updates');
    await b.waitForFunction(() => /rejected by the referee/.test(document.querySelector('.review').textContent)); ok(true, 'the player sees the referee’s decision on their own phone at once');
    await bFood.tap(); await r.waitForFunction(() => /14 accepted · 0 rejected/.test(document.querySelector('#j-count').textContent)); await bFood.tap(); await r.waitForFunction(() => /13 accepted · 1 rejected/.test(document.querySelector('#j-count').textContent));
    ok(true, 'a second tap accepts it back: changing your mind is one tap');
    const box = await r.locator('.judge-btn').first().boundingBox(); ok(box.width >= 44 && box.height >= 44, 'the ✓/✗ buttons are big enough for a thumb (' + Math.round(box.width) + ' px)');
    ok(await r.locator('.verdict-bar [data-act="verdict"]').isVisible(), 'Give the verdict stays in reach at the bottom of the screen');
    await allFit('the review'); await shot(r, 'review-referee'); await shot(b, 'review-player');
    await r.locator('[data-act="verdict"]').tap();
    for (const p of [a, b, c, r]) await p.waitForFunction(() => /wins the round/.test(document.querySelector('#app').textContent));
    ok(/Prince Mohsey wins the round/.test(await c.textContent('#app')) && /Referee: Zal/.test(await c.textContent('#app')), 'the winner is announced to all, naming the referee');
    await a.waitForSelector('#ceremony .cer-box'); ok(/Young Hero/.test(await a.textContent('#cer-title')), 'the verdict counts at once: the winner gets the Young Hero ceremony straight away'); await shot(a, 'ceremony'); await dismiss(a);
    await a.waitForFunction(() => /You scored 60/.test(document.querySelector('#app').textContent)); ok(/You scored 25/.test(await b.textContent('#app')) && /You scored 35/.test(await c.textContent('#app')), 'scores: 60 for six unique answers, 25 (one answer rejected) and 35');
    ok(/Thank you for refereeing/.test(await r.textContent('#app')) && /All the answers/.test(await r.textContent('#app')) && /rejected by the referee/.test(await r.textContent('.review')) && await r.locator('.review .ans').count() === 18 && await r.locator('.judge-btn').count() === 0, 'after the round the referee (and everyone) can look through all 18 answers and how each was judged');
    await allFit('the results'); await shot(r, 'results-referee');
    await a.goto(site + '#home'); await a.waitForSelector('.me-card'); ok(/Chapter 1 is open/.test(await a.textContent('.me-card')) && await a.locator('.guide-link').count() === 0, 'home shows chapter 1 open, and no longer the beginners’ link');
    await a.locator('a[href="#level-1"]').first().click(); await a.waitForSelector('.story'); ok(/Test chapter 1/.test(await a.textContent('.story h1')), 'reaching the points opens the chapter story');
    await a.waitForFunction(() => { const i = document.querySelector('.story-pic'); return i && i.complete && i.naturalWidth === 1080; }); ok(/Simorgh/.test(await a.getAttribute('.story-pic', 'alt')), 'the chapter opens with its picture, described for screen readers'); await shot(a, 'story'); await fits(a, 'story');
    await a.locator('[data-act="quiz"]').click(); await a.waitForSelector('fieldset.q'); ok(await a.locator('fieldset.q').count() === 5, 'the quiz has five questions');
    for (let i = 0; i < 5; i++) await a.locator('fieldset.q').nth(i).locator('label', { hasText: 'right' }).click(); await shot(a, 'quiz');
    await a.click('form[data-form="quiz"] [type=submit]'); await a.waitForSelector('#ceremony .cer-box'); ok(/Chapter 1/.test(await a.textContent('#cer-title')), 'passing the quiz unlocks the chapter'); await dismiss(a);
    await a.goto(site + '#journey'); await a.waitForSelector('.chapter'); await a.waitForFunction(() => Array.from(document.querySelectorAll('.ch-pic')).slice(0, 2).every(i => i.complete && i.naturalWidth > 0), null, { timeout: 8000 }); ok(await a.locator('.ch-pic').count() === 7, 'every chapter on the journey has its small picture');
    ok(await a.locator('.chapter.passed').count() === 1 && /0 of 50 points/.test(await a.textContent('.chapter.current')), 'the journey shows chapter 1 passed and chapter 2 needing 30% more'); await fits(a, 'journey'); await shot(a, 'journey');
    await b.goto(site + '#leaders'); await b.waitForSelector('.leaders tbody tr'); const rows = await b.locator('.leaders tbody tr').allTextContents();
    await b.fill('#l-find', 'rud'); await b.waitForFunction(() => document.querySelectorAll('.leaders tbody tr').length === 1); ok(/Rudabeh/.test(await b.textContent('.leaders tbody')) && /1 player matches/.test(await b.textContent('#l-box')), 'the leaderboard search finds a player by part of their name'); await b.fill('#l-find', ''); await b.waitForFunction(() => document.querySelectorAll('.leaders tbody tr').length === 4);
    ok(rows.length === 4 && /Mohsey/.test(rows[0]) && /Young Hero/.test(rows[0]) && await b.locator('.leaders tr.you').count() === 1, 'the leaderboard lists all four, Mohsey first, and highlights you'); await fits(b, 'leaderboard'); await shot(b, 'leaders');
    await a.goto(site + '#me'); await a.waitForSelector('.profile'); ok(await a.locator('.medal-card.earned').count() === 1 && await a.locator('.medal-card').count() === 19, 'the profile shows eight ranks and eleven achievements, one earned'); await fits(a, 'profile'); await shot(a, 'profile');
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
