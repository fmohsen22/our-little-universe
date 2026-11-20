// The whole game at its real defaults, switching the way rounds are judged all the time: a referee the game
// picks, an elected referee, and no referee at all (the table votes). Four players win chapter after chapter of the
// real book: before the points a chapter is locked, with them the story opens, the real quiz unlocks the next one.
// Then the riddle and a game against the prince. Chapters are shrunk to a few points each.
// Run: node tests/mixed.test.js
process.env.LEVEL_SCALE = '0.001';
const { spawn } = require('child_process'), path = require('path'), assert = require('assert'), fs = require('fs'), os = require('os');
const G = require('../server/game.js'), BOOK = require('../server/levels.json'), root = path.resolve(__dirname, '..');
const PORT = 8813, base = 'http://127.0.0.1:' + PORT, dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpm-mixed-'));
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; console.log('  ok  ' + m); };
const call = async (method, p, key, body) => { const r = await fetch(base + p, { method, headers: Object.assign({ 'Content-Type': 'application/json' }, key ? { Authorization: 'Bearer ' + key } : {}), body: body ? JSON.stringify(body) : undefined }); return { status: r.status, json: await r.json().catch(() => ({})) }; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, what) => { for (let i = 0; i < 250; i++) { if (f()) return; await sleep(30); } throw new Error('timed out: ' + what); };
async function listen(code, key) { const ctl = new AbortController(), box = { state: null, close: () => ctl.abort() }; const r = await fetch(base + '/api/rooms/' + code + '/events?k=' + key, { signal: ctl.signal });
  (async () => { const dec = new TextDecoder(); let buf = ''; try { for await (const ch of r.body) { buf += dec.decode(ch, { stream: true }); let i; while ((i = buf.indexOf('\n\n')) >= 0) { const m = /data: (.*)/.exec(buf.slice(0, i)); buf = buf.slice(i + 2); if (m) box.state = JSON.parse(m[1]); } } } catch (e) { /* closed */ } })(); return box; }
const env = Object.assign({}, process.env, { PORT, DATA_DIR: dir, LEVEL_SCALE: '0.001', COLLECT_MS: '50', MIN_PLAY_MS: '0', ROUNDS_PER_HOUR: '1000' }); delete env.REPEAT_RULE; delete env.SURPRISE_DEFAULT; delete env.REFEREE_POINTS;
const rightIndex = (level, q) => { const Q = BOOK.levels[level - 1].quiz.find(x => x.q === q.q); return q.options.indexOf(Q.options[Q.answer]); };

(async () => {
  const srv = spawn('node', [path.join(root, 'server', 'server.js')], { env, stdio: 'ignore' });
  try {
    await sleep(700);
    const names = ['Arash', 'Bahar', 'Cyrus', 'Dorna'], P = {}, E = {}; for (const nm of names) { P[nm] = (await call('POST', '/api/register', null, { name: nm, password: 'pw-' + nm + '-1' })).json; E[nm] = { total: 0, rounds: 0, refereed: 0 }; }
    const idName = id => names.find(nm => P[nm].me.id === id), me = async nm => (await call('GET', '/api/me', P[nm].key)).json.me;
    const code = (await call('POST', '/api/rooms', P.Arash.key, {})).json.code, eyes = {}, R = p => '/api/rooms/' + code + '/' + p; for (const nm of names) eyes[nm] = await listen(code, P[nm].key);
    const eye = eyes.Arash; await until(() => eye.state && eye.state.players.filter(p => p.online).length === 4, 'table');
    ok(eye.state.settings.surprise === 1 && eye.state.settings.cats.length === 8, 'four players sit down at a table with everything at its defaults');

    // the three ways to judge a round, set up before each round
    const modes = ['picked', 'none', 'elected'], used = { picked: 0, none: 0, elected: 0 }; let roundNo = 0, electTurn = 0;
    async function setup(mode) {
      const all = async on => { for (const nm of names) await call('POST', R('noref'), P[nm].key, { on }); };
      if (mode === 'none') { await all(true); await until(() => eye.state.noRef.active, 'no referee'); return; }
      await all(false); await until(() => !eye.state.noRef.active && eye.state.noRef.agreed.length === 0, 'referee wanted');
      if (mode === 'picked') { await call('POST', R('pickref'), P.Arash.key, { on: true }); await until(() => eye.state.auto && eye.state.referee, 'picked'); return; }
      const ref = names[electTurn++ % 4]; for (const nm of names) await call('POST', R('volunteer'), P[nm].key, { on: nm === ref });
      for (const nm of names) if (nm !== ref) await call('POST', R('elect'), P[nm].key, { player: P[ref].me.id });
      await until(() => eye.state.referee === P[ref].me.id && !eye.state.auto, 'elected ' + ref);
    }
    async function round() {
      const mode = modes[roundNo % 3]; roundNo++; used[mode]++; await setup(mode);
      const before = eye.state.round, st0 = await call('POST', R('start'), P.Arash.key); assert.strictEqual(st0.status, 200, mode + ': ' + JSON.stringify(st0.json));
      await until(() => eye.state.phase === 'play' && eye.state.round === before + 1, 'play');
      const st = eye.state, L = st.letter, cats = st.cats, players = st.players.filter(p => p.inRound).map(p => p.name), ref = idName(st.referee);
      assert.strictEqual(st.tableRound, mode === 'none'); assert.strictEqual(players.length, mode === 'none' ? 4 : 3); assert.strictEqual(cats.length, 9);
      const sheet = nm => Object.fromEntries(cats.map(c => [c, c === 'country' ? '' : L + nm.toLowerCase() + 'r' + roundNo + c]));   // new words every round; the country box stays empty
      for (const nm of players) await call('POST', R('answers'), P[nm].key, { answers: sheet(nm) });
      await sleep(60); await call('POST', R('stop'), P[players[0]].key, { answers: Object.assign(sheet(players[0]), { country: L + 'land' }) });   // not a country: refused by the game, but the box is filled
      await until(() => eye.state.phase === 'review', 'review');
      // one answer is thrown out each round: by the referee, or by the table's votes
      const victim = players[1], voters = players.filter(nm => nm !== victim);
      if (ref) { await call('POST', R('judge'), P[ref].key, { player: P[victim].me.id, cat: 'food', accept: false }); await call('POST', R('verdict'), P[ref].key); }
      else { for (const nm of voters.slice(0, 2)) await call('POST', R('vote'), P[nm].key, { player: P[victim].me.id, cat: 'food', reject: true }); for (const nm of players) await call('POST', R('ready'), P[nm].key); }
      await until(() => eye.state.phase === 'results', 'results (' + mode + ')');
      const sc = eye.state.scores;
      players.forEach(nm => { const want = nm === victim ? 70 : 80; assert.strictEqual(sc.players[P[nm].me.id].total, want, nm + ' in a ' + mode + ' round'); E[nm].total += want; E[nm].rounds++; });
      assert.strictEqual(sc.players[P[victim].me.id].cats.food.status, ref ? 'referee' : 'rejected');
      if (ref) { assert.strictEqual(sc.refereePoints, 20); E[ref].total += 20; E[ref].refereed++; } else assert.ok(!sc.refereePoints && sc.referee === null);
      return mode;
    }

    const log = [];
    for (let ch = 1; ch <= 7; ch++) {
      // before the points: the chapter is locked, and so is its quiz
      for (const nm of names) { const m = await me(nm); if (!m.quizReady) { assert.strictEqual((await call('GET', '/api/story/' + ch, P[nm].key)).status, 403, 'chapter ' + ch + ' locked for ' + nm); assert.strictEqual((await call('POST', '/api/quiz/start', P[nm].key)).status, 409); } if (ch < 7) assert.strictEqual((await call('GET', '/api/story/' + (ch + 1), P[nm].key)).status, 403); }
      const played = []; let guard = 0;
      while (guard++ < 12 && !(await Promise.all(names.map(me))).every(m => m.quizReady)) played.push(await round());
      for (const nm of names) {
        const story = await call('GET', '/api/story/' + ch, P[nm].key);
        assert.strictEqual(story.status, 200, nm + ' reads chapter ' + ch); assert.strictEqual(story.json.title, BOOK.levels[ch - 1].title); assert.strictEqual(story.json.clue, BOOK.levels[ch - 1].clue); assert.ok(story.json.story.length >= 3);
        const q = (await call('POST', '/api/quiz/start', P[nm].key)).json, r = (await call('POST', '/api/quiz/answer', P[nm].key, { answers: q.questions.map(x => rightIndex(ch, x)) })).json;
        assert.ok(r.passed && r.me.level === ch, nm + ' passes chapter ' + ch);
      }
      log.push(ch + ' (' + (played.join(', ') || 'points already there') + ')');
      if (ch === 1) ok(true, 'chapter 1: locked at first; after a few rounds everyone has the points, the story “' + BOOK.levels[0].title + '” opens with its clue, and the real quiz unlocks chapter 2');
      if (ch === 3) ok((await Promise.all(names.map(me))).every(m => m.level === 3), 'chapters 2 and 3 open the same way for all four');
    }
    ok((await Promise.all(names.map(me))).every(m => m.level === 7), 'all four win all seven chapters, each one locked until its points were earned');
    ok(used.picked >= 2 && used.none >= 2 && used.elected >= 2, 'along the way the table kept switching: ' + used.picked + ' rounds with a referee the game picked, ' + used.none + ' with no referee, ' + used.elected + ' with an elected referee');
    console.log('      rounds played for each chapter: ' + log.join(' · '));
    const recs = await Promise.all(names.map(me)), wrong = [];
    names.forEach((nm, i) => { ['total', 'rounds', 'refereed'].forEach(f => { if (recs[i][f] !== E[nm][f]) wrong.push(nm + ' ' + f + ' ' + recs[i][f] + ', expected ' + E[nm][f]); }); });
    ok(wrong.length === 0 && names.every(nm => E[nm].refereed >= 1), 'every record is right, whichever way each round was judged: points (with 20 for each round refereed), rounds played and rounds refereed' + (wrong.length ? '\n      ' + wrong.join('\n      ') : ''));
    ok(recs.some((m, i) => E[names[i]].refereed * 20 > 0 && m.total === E[names[i]].total), 'the points a referee earns counted toward their chapters like any others');

    // the riddle and the prince
    const f = (await call('GET', '/api/finale', P.Arash.key)).json;
    ok(f.clues.length === 7 && f.story.some(p => /Softolli/.test(p)) && !f.ending, 'after chapter 7 the last chapter opens, with the seven clues collected on the way');
    const win = (await call('POST', '/api/finale/answer', P.Arash.key, { answer: 'Vienna' })).json;
    ok(win.correct && win.ending.some(p => /Vienna/.test(p)) && win.unlocks.some(u => u.id === 'feather'), 'the riddle is solved, the ending is told and the Last Feather is won');
    const g = (await call('POST', '/api/mohsey/start', P.Arash.key)).json, r = (await call('POST', '/api/mohsey/answer', P.Arash.key, { answers: Object.fromEntries(g.cats.map(c => [c, c === 'country' ? '' : g.letter + 'prince' + c])) })).json;
    ok(r.you && r.mohsey && ['you', 'mohsey', null].includes(r.winner), 'and a game against the prince can be played');
    // one more round of each kind after all that: the game simply goes on
    for (let i = 0; i < 3; i++) await round();
    ok(eye.state.phase === 'results', 'after the last chapter the table keeps playing, with and without a referee');
    Object.values(eyes).forEach(e => e.close());
    console.log('\nmixed: ' + n + ' checks passed');
  } finally { srv.kill(); fs.rmSync(dir, { recursive: true, force: true }); }
})().catch(e => { console.error('FAILED: ' + e.message); process.exit(1); });
