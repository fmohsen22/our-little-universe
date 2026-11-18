// The owner's dashboard and Google sign-in, against the real server, then on a phone.
// Google is replaced by a stand-in that signs tokens with a test key, so the server's signature check is real.
// Run: node tests/owner.test.js
const { spawn, execFileSync } = require('child_process'), path = require('path'), assert = require('assert'), fs = require('fs'), http = require('http'), crypto = require('crypto');
const fx = require('./fixture.js')(), root = path.resolve(__dirname, '..');
const PORT = 8803, base = 'http://127.0.0.1:' + PORT, site = 'http://127.0.0.1:4180/', CERTS = PORT + 1, CLIENT = '1234-test.apps.googleusercontent.com';
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; console.log('  ok  ' + m); };
const call = async (method, p, key, body) => { const r = await fetch(base + p, { method, headers: Object.assign({ 'Content-Type': 'application/json' }, key ? { Authorization: 'Bearer ' + key } : {}), body: body ? JSON.stringify(body) : undefined }); return { status: r.status, json: await r.json().catch(() => ({})) }; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, what) => { for (let i = 0; i < 150; i++) { if (f()) return; await sleep(40); } throw new Error('timed out: ' + what); };
async function listen(code, key) { const ctl = new AbortController(), box = { state: null, close: () => ctl.abort() }; const r = await fetch(base + '/api/rooms/' + code + '/events?k=' + key, { signal: ctl.signal });
  (async () => { const dec = new TextDecoder(); let buf = ''; try { for await (const ch of r.body) { buf += dec.decode(ch, { stream: true }); let i; while ((i = buf.indexOf('\n\n')) >= 0) { const m = /data: (.*)/.exec(buf.slice(0, i)); buf = buf.slice(i + 2); if (m) box.state = JSON.parse(m[1]); } } } catch (e) { /* closed */ } })(); return box; }

// the owner's password hashed exactly as server/set-owner.sh does it (the same node snippet, password on standard input)
const script = fs.readFileSync(path.join(root, 'server', 'set-owner.sh'), 'utf8'), snippet = Array.from(script.matchAll(/node -e '([\s\S]*?)'\)"/g)).map(m => m[1]).find(x => x.includes('scrypt'));
const OWNER_HASH = execFileSync('node', ['-e', snippet], { input: 'correct horse battery' }).toString();

// a stand-in for Google: its public key at a "certs" address, and tokens signed with the private key
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }), other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = Object.assign(publicKey.export({ format: 'jwk' }), { kid: 'k1', alg: 'RS256', use: 'sig' });
const certs = http.createServer((q, s) => { s.writeHead(200, { 'Content-Type': 'application/json' }); s.end(JSON.stringify({ keys: [jwk] })); }).listen(CERTS, '127.0.0.1');
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
function token(claims, opts = {}) {
  const head = b64({ alg: 'RS256', kid: opts.kid || 'k1', typ: 'JWT' }), body = b64(Object.assign({ iss: 'https://accounts.google.com', aud: CLIENT, exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000) }, claims));
  return head + '.' + body + '.' + crypto.sign('RSA-SHA256', Buffer.from(head + '.' + body), opts.key || privateKey).toString('base64url');
}

// a stand-in mail server: it checks the login and keeps every email it is given
const net = require('net'), SMTP = PORT + 2, mails = [], MAILENV = { MAIL_HOST: '127.0.0.1', MAIL_PORT: String(SMTP), MAIL_TLS: '0', MAIL_TO: 'owner.private@secret-mail.test', MAIL_USER: 'sender.private@secret-mail.test', MAIL_PASS: 'abcd efgh ijkl mnop' };
const smtp = net.createServer(sock => {
  let buf = '', mode = 'cmd', data = '', step = 0, user = '';
  sock.write('220 test ready\r\n');
  sock.on('data', d => { buf += d; let i;
    while ((i = buf.indexOf('\r\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 2);
      if (mode === 'data') { if (line === '.') { mode = 'cmd'; mails.push({ user, data }); sock.write('250 queued\r\n'); } else data += line + '\n'; continue; }
      if (/^EHLO/.test(line)) sock.write('250-test\r\n250 AUTH LOGIN\r\n');
      else if (line === 'AUTH LOGIN') { step = 1; sock.write('334 VXNlcm5hbWU6\r\n'); }
      else if (step === 1) { user = Buffer.from(line, 'base64').toString(); step = 2; sock.write('334 UGFzc3dvcmQ6\r\n'); }
      else if (step === 2) { step = 0; sock.write(Buffer.from(line, 'base64').toString() === 'abcdefghijklmnop' && user === MAILENV.MAIL_USER ? '235 ok\r\n' : '535 bad\r\n'); }
      else if (/^MAIL FROM|^RCPT TO/.test(line)) { data += line + '\n'; sock.write('250 ok\r\n'); }
      else if (line === 'DATA') { mode = 'data'; sock.write('354 go\r\n'); }
      else if (line === 'QUIT') { sock.write('221 bye\r\n'); sock.end(); } } });
}).listen(SMTP, '127.0.0.1');
const decode = m => { const [head, body] = m.data.split('\n\n'); return { head, body: Buffer.from(body.replace(/\s+/g, ''), 'base64').toString() }; };

const start = env => spawn('node', [path.join(root, 'server', 'server.js')], { env: Object.assign({}, process.env, { PORT, DATA_DIR: fx.dir, LEVELS_FILE: fx.file, LEVEL_SCALE: '0.005', COLLECT_MS: '60', MIN_PLAY_MS: '0', ALLOWED_ORIGINS: 'http://127.0.0.1:4180', GOOGLE_CERTS_URL: 'http://127.0.0.1:' + CERTS }, env), stdio: 'ignore' });

(async () => {
  let srv = start({}), web;
  try {
    await sleep(700);
    ok((await call('POST', '/api/owner/login', null, { user: 'boss', password: 'x' })).status === 503 && (await call('GET', '/api/meta')).json.googleClientId === '' && (await call('POST', '/api/google', null, { credential: 'x' })).status === 503, 'with nothing set up, the owner login and Google sign-in are simply off');
    srv.kill(); await sleep(300);
    srv = start({ GOOGLE_CLIENT_ID: 'GOCSPX-thisLooksLikeASecret123' }); await sleep(700);
    ok((await call('GET', '/api/meta')).json.googleClientId === '' && !JSON.stringify((await call('GET', '/api/meta')).json).includes('GOCSPX'), 'a client secret put in by mistake is never shown, and Google sign-in stays off');
    srv.kill(); await sleep(300);
    srv = start(Object.assign({ OWNER_USER: 'Mosi', OWNER_HASH, GOOGLE_CLIENT_ID: CLIENT }, MAILENV)); await sleep(700);

    // the owner
    ok((await call('POST', '/api/owner/login', null, { user: 'Mosi', password: 'wrong password' })).status === 401 && (await call('POST', '/api/owner/login', null, { user: 'someone', password: 'correct horse battery' })).status === 401, 'a wrong password or a wrong name is refused');
    const own = (await call('POST', '/api/owner/login', null, { user: ' mosi ', password: 'correct horse battery' })).json;
    ok(own.key && own.key.startsWith('owner.'), 'the owner signs in with the name and password set by set-owner.sh (the name in any letter case)');
    ok((await call('GET', '/api/owner/stats')).status === 401 && (await call('GET', '/api/owner/stats', 'owner.' + 'f'.repeat(48))).status === 401 && (await call('GET', '/api/me', own.key)).status === 401, 'without the owner key the dashboard is closed; the owner key is not a player key');
    const P = {}; for (const nm of ['Rudaba', 'Sindokht', 'Mehrab', 'Kaveh']) { const r = (await call('POST', '/api/register', null, { name: nm, password: 'pw-' + nm + '1' })).json; P[nm] = r; }
    ok((await call('GET', '/api/owner/stats', P.Rudaba.key)).status === 401, 'a player key does not open the dashboard');
    let s = (await call('GET', '/api/owner/stats', own.key)).json;
    ok(s.players.total === 4 && s.players.newToday === 4 && s.players.newWeek === 4 && s.rounds.today === 0 && s.days.length === 14 && s.days[13].signups === 4, 'the dashboard counts the four new accounts today, and no rounds yet');

    // a round, with three playing and one referee, while the dashboard watches
    const code = (await call('POST', '/api/rooms', P.Rudaba.key, {})).json.code, eyes = {};
    for (const nm of Object.keys(P)) eyes[nm] = await listen(code, P[nm].key);
    await until(() => eyes.Rudaba.state && eyes.Rudaba.state.players.filter(p => p.online).length === 4, 'four at the table');
    s = (await call('GET', '/api/owner/stats', own.key)).json;
    ok(s.now.online === 4 && s.now.tables === 1 && s.now.playing === 0, 'right now: four people online at one table, no round running yet');
    await call('POST', '/api/rooms/' + code + '/volunteer', P.Kaveh.key, { on: true }); for (const nm of ['Rudaba', 'Sindokht', 'Mehrab']) await call('POST', '/api/rooms/' + code + '/elect', P[nm].key, { player: P.Kaveh.me.id });
    await until(() => eyes.Rudaba.state.referee === P.Kaveh.me.id, 'referee');
    await call('POST', '/api/rooms/' + code + '/settings', P.Rudaba.key, { cats: ['name', 'city', 'food'] });
    await call('POST', '/api/rooms/' + code + '/start', P.Rudaba.key); await until(() => eyes.Rudaba.state.phase === 'play', 'play');
    ok((await call('GET', '/api/owner/stats', own.key)).json.now.playing === 1, 'while the round runs, the dashboard shows one round being played');
    const L = eyes.Rudaba.state.letter; for (const nm of ['Sindokht', 'Mehrab']) await call('POST', '/api/rooms/' + code + '/answers', P[nm].key, { answers: { name: L + nm, city: L + 'c' + nm, food: L + 'f' + nm } });
    await call('POST', '/api/rooms/' + code + '/stop', P.Rudaba.key, { answers: { name: L + 'aa', city: L + 'bb', food: L + 'cc' } }); await until(() => eyes.Rudaba.state.phase === 'review', 'review');
    await call('POST', '/api/rooms/' + code + '/verdict', P.Kaveh.key); await until(() => eyes.Rudaba.state.phase === 'results', 'results');
    s = (await call('GET', '/api/owner/stats', own.key)).json;
    ok(s.rounds.today === 1 && s.rounds.playersToday === 4 && s.days[13].rounds === 1 && s.days[13].players === 4 && s.rounds.week === 1, 'after the round: one round today, with four people taking part (the referee too)');
    ok(s.progress.chapters[0] === 4 && s.progress.finale === 0 && s.top.length === 4 && s.recent[0].name === 'Kaveh' && s.players.activeToday === 4, 'progress, the top 10 and the newest players are listed');
    const list = (await call('GET', '/api/owner/players?q=meh', own.key)).json;
    ok(list.players.length === 1 && list.players[0].name === 'Mehrab' && list.players[0].hasPassword === true && !/"pw"|sessions/.test(JSON.stringify(list)), 'the owner can search the accounts; no passwords are ever sent');
    const rm = await call('POST', '/api/owner/remove', own.key, { id: P.Mehrab.me.id });
    ok(rm.json.removed === 'Mehrab' && (await call('GET', '/api/me', P.Mehrab.key)).status === 401 && (await call('GET', '/api/owner/stats', own.key)).json.players.total === 3, 'the owner removes an account');
    ok((await call('POST', '/api/owner/password', own.key, { id: P.Sindokht.me.id, password: 'new-pass-1' })).status === 200 && (await call('POST', '/api/login', null, { name: 'Sindokht', password: 'new-pass-1' })).status === 200, 'and can give a player a new password');

    // Google
    const gA = token({ sub: 'g-111', given_name: 'Tahmineh', email: 'secret@example.com', email_verified: true });
    const first = (await call('POST', '/api/google', null, { credential: gA })).json;
    ok(first.needName === true && first.suggestion === 'Tahmineh' && !first.key, 'a first Google sign-in asks for a name in the kingdom, suggesting the first name');
    ok((await call('POST', '/api/google', null, { credential: gA, name: 'Rudaba' })).status === 409, 'a name that is taken is refused');
    const made = (await call('POST', '/api/google', null, { credential: gA, name: 'Tahmineh', kingdom: 'turan', royal: 'Princess' })).json;
    ok(made.key && made.me.name === 'Tahmineh' && made.me.kingdom === 'turan' && made.me.google === true && made.me.hasPassword === false, 'with a name, the Google account is created and signed in, without a password');
    const again = (await call('POST', '/api/google', null, { credential: token({ sub: 'g-111', given_name: 'T' }) })).json;
    ok(again.key && again.me.id === made.me.id && again.key !== made.key, 'the next Google sign-in, on any device, opens the same account');
    await sleep(400); const saved = fs.readFileSync(path.join(fx.dir, 'players.json'), 'utf8');
    ok(saved.includes('g-111') && !saved.includes('secret@example.com'), 'only Google’s account number is stored, never the email');
    const bad = [token({ sub: 'g-2' }, { key: other.privateKey }), token({ sub: 'g-2', aud: 'someone-else.apps.googleusercontent.com' }), token({ sub: 'g-2', exp: Math.floor(Date.now() / 1000) - 10 }), token({ sub: 'g-2', iss: 'https://evil.example' }), token({ sub: 'g-2' }, { kid: 'nope' }), 'a.b.c', 'not a token', gA.slice(0, -4) + 'AAAA'];
    const codes = []; for (const t of bad) codes.push((await call('POST', '/api/google', null, { credential: t })).status);
    ok(codes.every(c => c === 401), 'forged, foreign, expired, wrongly issued, unknown-key and broken tokens are all refused (' + codes.join(', ') + ')');
    ok((await call('POST', '/api/password', made.key, { password: 'also-a-pass' })).status === 200 && (await call('POST', '/api/login', null, { name: 'Tahmineh', password: 'also-a-pass' })).status === 200, 'a Google player can add a password and then also sign in by name');
    ok((await call('GET', '/api/owner/stats', own.key)).json.players.google === 1, 'the dashboard counts the accounts made with Google');

    // the contact form: open to everyone; the messages reach the owner's dashboard
    ok((await call('POST', '/api/contact', null, { topic: 'password', message: 'hi' })).status === 400 && (await call('POST', '/api/contact', null, { topic: 'password', message: 'I forgot my password, please help' })).status === 400, 'a message needs a few words, and someone who is not signed in must say who they are');
    ok((await call('POST', '/api/contact', null, { topic: 'password', name: 'Kaveh', message: 'I forgot my password.\nMy name is Kaveh.', reply: '+43 660 000000' })).status === 200, 'someone who forgot their password can write without signing in');
    ok((await call('POST', '/api/contact', made.key, { topic: 'player', message: 'The referee at my table rejected everything.', name: 'Someone Else' })).status === 200, 'a signed-in player writes too, and is always named by their own account');
    ok((await call('POST', '/api/contact', null, { topic: { x: 1 }, name: 'Rudaba', message: '<script>alert(1)</script> weird \u0000 text' })).status === 200, 'odd input is stored as plain text');
    for (let i = 0; i < 60 && mails.length < 3; i++) await sleep(50);
    const kav = mails.map(decode).find(x => /Kaveh/.test(x.body)), tah = mails.map(decode).find(x => /Tahmineh/.test(x.body));
    ok(mails.length === 3 && mails.every(m => m.user === MAILENV.MAIL_USER && /RCPT TO:<owner\.private@secret-mail\.test>/.test(m.data)), 'each message is emailed to the owner, through the owner’s own mail account');
    ok(/Forgot password/.test(kav.head + kav.body) && /I forgot my password\.\nMy name is Kaveh\./.test(kav.body) && /Answer them at: \+43 660 000000/.test(kav.body) && !/Reply-To/.test(kav.head) && /not signed in/.test(kav.body), 'the email says what it is about, who wrote, the message itself and how to answer them');
    ok(/signed in as this player/.test(tah.body) && /referee at my table/.test(tah.body), 'a message from a signed-in player says so');
    let ms = (await call('GET', '/api/owner/messages', own.key)).json;
    ok(ms.open === 3 && ms.messages[0].topic === 'other' && ms.messages[1].playerName === 'Tahmineh' && ms.messages[1].name === 'Tahmineh' && ms.messages[2].reply === '+43 660 000000' && ms.messages[2].text.includes('\n') && !ms.messages[0].text.includes('\u0000'), 'the owner sees all three, newest first, with who sent them and how to answer');
    const pub = JSON.stringify([(await call('GET', '/api/meta')).json, (await call('GET', '/api/me', made.key)).json, ms, (await call('GET', '/api/owner/stats', own.key)).json, (await call('GET', '/api/leaderboard')).json]) + fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    ok(!/secret-mail|private@/.test(pub) && ms.email === true && ms.messages.every(m => m.mailed), 'the owner’s email address appears nowhere: not on the website, not in anything the server sends, not even on the dashboard');
    ok((await call('GET', '/api/owner/messages', made.key)).status === 401 && (await call('GET', '/api/owner/stats', own.key)).json.messages === 3, 'only the owner can read them, and the dashboard counts the new ones');
    ok((await call('POST', '/api/owner/message', own.key, { id: ms.messages[2].id })).json.open === 2 && (await call('POST', '/api/owner/message', own.key, { id: ms.messages[0].id, remove: true })).json.open === 1 && (await call('POST', '/api/owner/message', own.key, { id: 'nope' })).status === 404, 'the owner marks a message done or deletes it');
    let spam = 0; for (let i = 0; i < 8; i++) spam = (await call('POST', '/api/contact', null, { topic: 'idea', name: 'Spammer', message: 'buy buy buy ' + i })).status;
    ok(spam === 429, 'one person cannot flood the owner with messages');

    // the stats survive a restart; the owner signs in again
    Object.values(eyes).forEach(e => e.close()); await sleep(800); srv.kill(); await sleep(300); srv = start(Object.assign({ OWNER_USER: 'Mosi', OWNER_HASH, GOOGLE_CLIENT_ID: CLIENT }, MAILENV)); await sleep(700);
    const own2 = (await call('POST', '/api/owner/login', null, { user: 'Mosi', password: 'correct horse battery' })).json;
    s = (await call('GET', '/api/owner/stats', own2.key)).json;
    ok(s.rounds.today === 1 && s.days[13].signups === 5 && s.players.total === 4, 'after a restart the daily numbers are still there');
    ms = (await call('GET', '/api/owner/messages', own2.key)).json; ok(ms.total === 5 && ms.messages.some(m => m.name === 'Kaveh' && m.done), 'and so are the messages, with what was marked done');
    srv.kill(); await sleep(300);
    const persianHash = execFileSync('node', ['-e', snippet], { input: 'Rostam1385' }).toString();
    srv = start({ OWNER_USER: 'Mosi', OWNER_HASH: persianHash, GOOGLE_CLIENT_ID: CLIENT }); await sleep(700);
    ok((await call('POST', '/api/owner/login', null, { user: 'Mosi', password: 'Rostam1385 ' })).json.key && (await call('POST', '/api/owner/login', null, { user: 'Mosi', password: 'Rostam۱۳۸۵' })).json.key && (await call('POST', '/api/owner/login', null, { user: 'Mosi', password: 'Rostam1386' })).status === 401,
      'the password works typed with Latin or Persian digits and with a stray space from a phone keyboard; a different one does not');
    srv.kill(); await sleep(300); srv = start(Object.assign({ OWNER_USER: 'Mosi', OWNER_HASH, GOOGLE_CLIENT_ID: CLIENT }, MAILENV)); await sleep(700);
    let locked = 0; for (let i = 0; i < 10; i++) locked = (await call('POST', '/api/owner/login', null, { user: 'Mosi', password: 'guess ' + i })).status;
    ok(locked === 429, 'guessing the owner password is locked out after a few wrong tries');

    // on a phone
    web = spawn('python3', ['-m', 'http.server', '4180', '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' }); await sleep(500);
    srv.kill(); await sleep(300); srv = start(Object.assign({ OWNER_USER: 'Mosi', OWNER_HASH, GOOGLE_CLIENT_ID: CLIENT }, MAILENV)); await sleep(700);
    const { chromium, devices } = require('playwright'), browser = await chromium.launch(), errors = [];
    try {
      const ctx = await browser.newContext({ ...devices['Pixel 7'] });
      await ctx.route('**/config.js', q => q.fulfill({ contentType: 'text/javascript', body: "window.WPM_CONFIG={serverUrl:'" + base + "',princeImage:'assets/prince-mohsey.jpg'};" }));
      // Google's script, replaced by a stand-in button that hands the page a signed test token
      const gB = token({ sub: 'g-222', given_name: 'Manizheh' });
      await ctx.route('https://accounts.google.com/gsi/client', q => q.fulfill({ contentType: 'text/javascript', body:
        'window.google={accounts:{id:{initialize:function(o){window.__g=o;},renderButton:function(el,o){window.__gopts=o;var b=document.createElement("button");b.type="button";b.id="fake-google";b.textContent=o.text==="signup_with"?"Sign up with Google":"Continue with Google";b.onclick=function(){window.__g.callback({credential:' + JSON.stringify(gB) + '});};el.appendChild(b);}}}};' }));
      const p = await ctx.newPage(); p.on('pageerror', e => errors.push(String(e))); p.on('console', m => { if (m.type() === 'error' && !/fonts\.g|net::ERR|40\d/.test(m.text())) errors.push(m.text()); });
      await p.goto(site); await p.waitForSelector('#fake-google');
      const gTop = await p.locator('.g-card').boundingBox(), formTop = await p.locator('form[data-form="register"]').boundingBox();
      ok(/Sign up with Google/.test(await p.textContent('#g-btn')) && /quickest way/.test(await p.textContent('.g-card')) && gTop.y < formTop.y && gTop.y < 900, 'the welcome screen offers Google sign-up at the top, above the name and password form');
      ok(await p.evaluate(() => window.__gopts.locale === 'en'), 'Google’s button is asked to speak English, like the rest of the site');
      if (process.env.SHOTS) await p.screenshot({ path: path.join(process.env.SHOTS, 'welcome-google.png') });
      await p.locator('#fake-google').tap(); await p.waitForSelector('#g-name');
      ok(await p.inputValue('#g-name') === 'Manizheh' && /Your email is not shown or kept/.test(await p.textContent('#app')), 'after Google, the player chooses a name in the kingdom (Google’s first name suggested)');
      await p.locator('[data-f="kingdom"][data-v="rum"]').tap(); await p.locator('[data-f="royal"][data-v="Princess"]').tap(); await p.locator('form[data-form="gname"] [type=submit]').tap();
      await p.waitForSelector('.me-card'); ok(/Princess Manizheh/.test(await p.textContent('.me-name')), 'and lands on the home page, signed in');
      await p.goto(site + '#me'); await p.waitForSelector('.profile'); ok(/You signed up with Google/.test(await p.textContent('#app')), 'the profile offers to add a password too');
      await p.evaluate(() => localStorage.clear()); await p.goto(site); await p.waitForSelector('[data-m="login"]'); await p.locator('[data-m="login"]').tap(); await p.waitForSelector('#fake-google');
      await p.locator('#fake-google').tap(); await p.waitForSelector('.me-card'); ok(/Princess Manizheh/.test(await p.textContent('.me-name')), 'signing in again with Google goes straight in');

      // forgot password -> contact -> the owner's dashboard; the privacy page from the footer
      await p.evaluate(() => localStorage.clear()); await p.goto(site); await p.waitForSelector('[data-m="login"]'); await p.locator('[data-m="login"]').tap();
      await p.locator('a[href="#contact-password"]').tap(); await p.waitForSelector('#c-text');
      ok(await p.locator('input[name="c-topic"][value="password"]').isChecked() && await p.locator('#c-name').isVisible(), 'Forgot your password? opens the contact form, already on “I forgot my password”');
      await p.fill('#c-name', 'Gordafarid'); await p.fill('#c-text', 'I forgot my password, my name in the game is Gordafarid.'); await p.fill('#c-reply', 'gordafarid@example.org');
      await p.locator('form[data-form="contact"] [type=submit]').tap(); await p.waitForFunction(() => /Your message was sent/.test(document.querySelector('#app').textContent));
      ok(/answer you at gordafarid@example.org/.test(await p.textContent('#app')) && !/secret-mail/.test(await p.content()), 'the message is sent, the player is told how the owner will answer, and never sees the owner’s address');
      for (let i = 0; i < 60 && !mails.some(m => /Gordafarid/.test(decode(m).body)); i++) await sleep(50);
      ok(/Reply-To: <gordafarid@example\.org>/.test(decode(mails.find(m => /Gordafarid/.test(decode(m).body))).head), 'when the player leaves an email, the owner can simply press Reply');
      await p.locator('.foot a[href="#privacy"]').tap(); await p.waitForSelector('h1');
      const priv = await p.textContent('#app'); ok(/What the game keeps/.test(priv) && /does not store it/.test(priv) && /Deleting your account/.test(priv), 'the privacy page opens from the footer without signing in');
      if (process.env.SHOTS) await p.screenshot({ path: path.join(process.env.SHOTS, 'privacy.png'), fullPage: true });
      await p.goto(site + '#owner'); await p.waitForSelector('#o-user');
      ok(await p.locator('a[href="#owner"]').count() === 0, 'the owner page is not linked anywhere on the site; it opens only by its address');
      await p.fill('#o-user', 'Mosi'); await p.fill('#o-pass', 'correct horse battery'); await p.locator('form[data-form="owner"] [type=submit]').tap();
      await p.waitForSelector('.tiles'); await p.waitForSelector('.adm');
      const dash = await p.textContent('#app');
      ok(/Right now/.test(dash) && /People online/.test(dash) && /Accounts/.test(dash) && /Rounds played, last 14 days/.test(dash) && /Found Prince Mohsey/.test(dash) && /Newest players/.test(dash), 'the dashboard shows who is online, players, rounds per day, progress through the chapters and the newest players');
      ok(await p.locator('.cols .col').count() === 14 && await p.locator('.hbars li').count() === 9 && await p.locator('.adm').count() === 5, 'the 14-day chart, the chapter chart and all five accounts are there');
      await p.waitForSelector('.msg'); ok(/Gordafarid/.test(await p.textContent('#m-box')) && /gordafarid@example.org/.test(await p.textContent('#m-box')), 'the owner reads the new message on the dashboard');
      await p.locator('.msg', { hasText: 'Gordafarid' }).locator('[data-act="msgfind"]').tap(); await p.waitForFunction(() => document.querySelector('#a-find').value === 'Gordafarid'); ok(true, 'Find the account jumps to the account search with that name');
      await p.locator('.msg', { hasText: 'Gordafarid' }).locator('[data-act="msgdone"]').tap(); await p.waitForFunction(() => document.querySelector('.msg.done') && /Gordafarid/.test(document.querySelector('.msg.done').textContent)); ok(true, 'and marks it done');
      await p.locator('.cols .col').last().focus(); await p.waitForSelector('#o-tip:not([hidden])'); ok(/: 1 round, 4 players, \d+ new/.test(await p.textContent('#o-tip')), 'each day in the chart has a tooltip with its numbers');
      if (process.env.SHOTS) await p.screenshot({ path: path.join(process.env.SHOTS, 'owner.png'), fullPage: true });
      ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no sideways scroll on the phone');
      await p.reload(); await p.waitForSelector('.tiles'); ok(true, 'the owner stays signed in after a reload');
      await p.locator('[data-act="ownerout"]').tap(); await p.waitForSelector('#o-user'); ok(true, 'and can sign out');
      ok(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
    } finally { await browser.close(); }
    console.log('\nowner: ' + n + ' checks passed');
  } finally { srv.kill(); if (web) web.kill(); certs.close(); smtp.close(); fs.rmSync(fx.dir, { recursive: true, force: true }); }
})().catch(e => { console.error('FAILED: ' + e.message); process.exit(1); });
