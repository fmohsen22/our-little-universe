// The agent referee: with REFEREE_TOKEN set, a scheduled Claude session fetches the waiting answers and sends verdicts.
// Run: node tests/agent.test.js
const { spawn } = require('child_process'), path = require('path'), assert = require('assert'), fs = require('fs');
const fx = require('./fixture.js')(), PORT = 8799, base = 'http://127.0.0.1:' + PORT, TOKEN = 'referee-test-token';
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; console.log('  ok  ' + m); };
const call = async (method, p, key, body, extra) => { const r = await fetch(base + p, { method, headers: Object.assign({ 'Content-Type': 'application/json' }, key ? { Authorization: 'Bearer ' + key } : {}, extra || {}), body: body ? JSON.stringify(body) : undefined }); return { status: r.status, json: await r.json().catch(() => ({})) }; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function listen(code, key) { const ctl = new AbortController(), box = { state: null, close: () => ctl.abort() }; const r = await fetch(base + '/api/rooms/' + code + '/events?k=' + key, { signal: ctl.signal });
  (async () => { const dec = new TextDecoder(); let buf = ''; try { for await (const ch of r.body) { buf += dec.decode(ch, { stream: true }); let i; while ((i = buf.indexOf('\n\n')) >= 0) { const m = /data: (.*)/.exec(buf.slice(0, i)); buf = buf.slice(i + 2); if (m) box.state = JSON.parse(m[1]); } } } catch (e) { /* closed */ } })(); return box; }
const until = async (f, what) => { for (let i = 0; i < 200; i++) { if (f()) return; await sleep(40); } throw new Error('timed out: ' + what); };
const REF = h => ({ 'X-Referee-Token': h });
(async () => {
  const srv = spawn('node', [path.join(__dirname, '..', 'server', 'server.js')], { env: Object.assign({}, process.env, { PORT, DATA_DIR: fx.dir, LEVELS_FILE: fx.file, LEVEL_SCALE: '0.02', COLLECT_MS: '100', REVIEW_MS: '4000', MIN_PLAY_MS: '0', MIN_REVIEW_MS: '0', REFEREE_TOKEN: TOKEN, REFEREE_AT: '00:00' }), stdio: 'ignore' });
  try {
    await sleep(700);
    ok((await call('GET', '/api/meta')).json.referee.mode === 'agent', 'with a referee token the server waits for the agent referee');
    const A = (await call('POST', '/api/register', null, { name: 'Mohsey', password: 'secret-1' })).json, B = (await call('POST', '/api/register', null, { name: 'Sufi', password: 'secret-2' })).json;
    const code = (await call('POST', '/api/rooms', A.key, {})).json.code, a = await listen(code, A.key), b = await listen(code, B.key);
    await until(() => a.state && a.state.players.filter(p => p.online).length === 2, 'two seated');
    await call('POST', '/api/rooms/' + code + '/settings', A.key, { cats: ['name', 'animal', 'color'] }); await until(() => a.state.settings.cats.length === 3, 'cats');
    const round = async (bAnimal) => {
      await call('POST', '/api/rooms/' + code + '/start', A.key); await until(() => a.state.phase === 'play', 'play'); const L = a.state.letter;
      await call('POST', '/api/rooms/' + code + '/answers', B.key, { answers: { name: L + 'ara', animal: L + bAnimal, color: L + 'olour' } });
      await call('POST', '/api/rooms/' + code + '/stop', A.key, { answers: { name: L + 'ohsey', animal: L + 'ear', color: L + 'lue' } }); await until(() => a.state.phase === 'review', 'review');
      await call('POST', '/api/rooms/' + code + '/ready', A.key); await call('POST', '/api/rooms/' + code + '/ready', B.key); await until(() => a.state.phase === 'results', 'results');
      return a.state.letter;
    };
    const L1 = await round('xqzw'); await sleep(1200);
    ok((await call('GET', '/api/me', B.key)).json.me.pendingRounds === 1, 'the round waits; the server does not judge it on its own, even after its usual time');
    ok((await call('GET', '/api/referee/pending')).status === 401 && (await call('GET', '/api/referee/pending', null, null, REF('wrong'))).status === 401 && (await call('GET', '/api/referee/pending', A.key)).status === 401, 'only the referee token opens the referee endpoints; a player key does not');
    const pend = (await call('GET', '/api/referee/pending', null, null, REF(TOKEN))).json;
    ok(pend.rounds === 1 && pend.items.length === 6 && pend.items.every(x => x.key && x.cat && x.letter && x.answer) && !JSON.stringify(pend).includes('Mohsey"'), 'the agent gets the six answers to judge, without player names');
    await round('eagle-late');                                      // a round played after the agent looked
    const verdicts = pend.items.map(x => ({ key: x.key, valid: !/xqzw/.test(x.answer), why: /xqzw/.test(x.answer) ? 'not an animal' : '' }));
    const done = (await call('POST', '/api/referee/verdicts', null, { verdicts }, REF(TOKEN))).json;
    ok(done.rounds === 1 && done.by === 'agent' && done.waiting === 1, 'the verdicts settle the round the agent saw; the later round waits for the next night');
    const mb = (await call('GET', '/api/me', B.key)).json.me, ma = (await call('GET', '/api/me', A.key)).json.me;
    ok(mb.total === 20 && mb.verdict.struck.length === 1 && mb.verdict.struck[0].text === L1 + 'xqzw' && mb.verdict.struck[0].why === 'not an animal' && ma.total === 30 && ma.wins === 1, 'the made-up animal is struck: Sufi keeps 20, Mohsey 30 and the win, and the verdict says why');
    ok((await call('POST', '/api/referee/verdicts', null, { verdicts: [{ key: 1 }] }, REF(TOKEN))).status === 400, 'malformed verdicts are refused');
    const next = (await call('GET', '/api/referee/pending', null, null, REF(TOKEN))).json;
    const done2 = (await call('POST', '/api/referee/verdicts', null, { verdicts: next.items.map(x => ({ key: x.key, valid: true, why: '' })) }, REF(TOKEN))).json;
    ok(done2.rounds === 1 && done2.waiting === 0 && (await call('GET', '/api/me', B.key)).json.me.total === 50, 'the next night the waiting round is judged too');
    a.close(); b.close(); console.log('agent: ' + n + ' checks passed');
  } finally { srv.kill(); fs.rmSync(fx.dir, { recursive: true, force: true }); }
})().catch(e => { console.error('FAILED: ' + e.message); process.exit(1); });
