// Unit tests for the rules (server/game.js). Run: node tests/game.test.js
const G = require('../server/game.js'), assert = require('assert');
let n = 0; const test = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
const cats = ['name', 'city', 'food'];

test('level points: the first chapter is short, the later ones climb', () => {
  assert.deepStrictEqual([1, 2, 3, 4, 5, 6, 7].map(G.levelPoints), [1200, 3600, 4700, 6200, 8000, 10400, 13500]);
});
test('scoring: unique answers 10, shared 5, empty or wrong letter 0', () => {
  const r = G.scoreRound({ letter: 'S', cats, answers: { a: { name: 'Sara', city: 'Shiraz', food: 'Soup' }, b: { name: ' sara ', city: 'Tehran', food: '' }, c: { name: 'Sam', city: 'Sofia', food: 'salad' } } });
  assert.strictEqual(r.players.a.total, 25); assert.strictEqual(r.players.b.total, 5); assert.strictEqual(r.players.c.total, 30);
  assert.strictEqual(r.players.b.cats.city.status, 'letter'); assert.strictEqual(r.players.b.cats.food.status, 'empty'); assert.strictEqual(r.winner, 'c'); assert.deepStrictEqual(r.order, ['c', 'a', 'b']);
});
test('scoring: Persian answers match across Arabic and Persian letter forms', () => {
  const r = G.scoreRound({ letter: 'ک', cats: ['city'], answers: { a: { city: 'كرمان' }, b: { city: 'کرمان' }, c: { city: 'آبادان' } } });
  assert.strictEqual(r.players.a.cats.city.pts, 5); assert.strictEqual(r.players.b.cats.city.pts, 5); assert.strictEqual(r.players.c.cats.city.status, 'letter');
  assert.ok(G.startsWith('آبادان', 'ا')); assert.ok(!G.startsWith('', 'ا'));
});
test('a single letter or one letter repeated is not a word; the table referee can reject any answer', () => {
  const r = G.scoreRound({ letter: 'J', cats: ['name', 'city', 'food'], answers: { a: { name: 'j', city: 'JJJJ', food: 'Jam' }, b: { name: 'Jo', city: 'Jaipur', food: 'Jxqz' } }, invalid: { b: { food: true } } });
  assert.strictEqual(r.players.a.cats.name.status, 'short'); assert.strictEqual(r.players.a.cats.city.status, 'short'); assert.strictEqual(r.players.a.total, 10);
  assert.strictEqual(r.players.b.cats.food.status, 'referee'); assert.strictEqual(r.players.b.total, 20); assert.strictEqual(r.winner, 'b');
});
test('Country answers are checked on the spot against the list of countries', () => {
  ['Japan', 'japan', 'United Kingdom', 'UK', 'Persia', 'Côte d’Ivoire', 'Wales'].forEach(c => assert.ok(!G.notACountry(c), c));
  ['jajaja', 'Jamaicaa', 'Jerusalemland'].forEach(c => assert.ok(G.notACountry(c), c));
  assert.ok(!G.notACountry('ژاپن'), 'Persian script is left to the referee');
  const r = G.scoreRound({ letter: 'J', cats: ['country'], answers: { a: { country: 'jajaja' }, b: { country: 'Japan' } } });
  assert.strictEqual(r.players.a.cats.country.status, 'country'); assert.strictEqual(r.players.b.total, 10);
});
test('votes: an answer falls only when more than half of the other players reject it', () => {
  const answers = { a: { name: 'Sxyz' }, b: { name: 'Sara' }, c: { name: 'Sam' }, d: { name: 'Sue' } };
  const one = G.scoreRound({ letter: 'S', cats: ['name'], answers, rejects: { a: { name: ['b'] } } });
  const two = G.scoreRound({ letter: 'S', cats: ['name'], answers, rejects: { a: { name: ['b', 'c'] } } });
  const self = G.scoreRound({ letter: 'S', cats: ['name'], answers, rejects: { b: { name: ['b', 'b', 'zz'] } } });
  assert.strictEqual(one.players.a.cats.name.status, 'ok'); assert.strictEqual(two.players.a.cats.name.status, 'rejected'); assert.strictEqual(self.players.b.cats.name.status, 'ok');
});
test('winner: a tie or an all-zero round has no winner; a lone player is not scored', () => {
  assert.strictEqual(G.scoreRound({ letter: 'S', cats: ['name'], answers: { a: { name: 'Sa' }, b: { name: 'Su' } } }).winner, null);
  assert.strictEqual(G.scoreRound({ letter: 'S', cats: ['name'], answers: { a: { name: '' }, b: { name: 'x' } } }).winner, null);
  assert.strictEqual(G.scoreRound({ letter: 'S', cats: ['name'], answers: { a: { name: 'Sa' } } }).scored, false);
});
test('ranks unlock at 1, 3, 7, 15, 25, 40, 60 and 100 wins and are never lost', () => {
  const p = G.newPlayer('p', 'A', 1), at = [];
  for (let i = 1; i <= 100; i++) { const got = G.applyRound(p, { points: 10, won: true, hadWinner: true, tableSize: 2 }, i); if (got.some(u => u.kind === 'rank')) at.push(i); }
  assert.deepStrictEqual(at, [1, 3, 7, 15, 25, 40, 60, 100]);
  for (let i = 0; i < 50; i++) G.applyRound(p, { points: 0, won: false, hadWinner: true, tableSize: 2 }, 200);
  assert.strictEqual(G.rankOf(p).id, 'shahanshah'); assert.strictEqual(p.streak, 0); assert.strictEqual(p.best, 100);
});
test('streaks and comeback: five in a row for Rostam; Simurgh needs a win after three straight losses; ties change nothing', () => {
  const p = G.newPlayer('p', 'A', 1), win = () => G.applyRound(p, { points: 10, won: true, hadWinner: true, tableSize: 2 }, 5), lose = () => G.applyRound(p, { points: 0, won: false, hadWinner: true, tableSize: 2 }, 5), tie = () => G.applyRound(p, { points: 5, won: false, hadWinner: false, tableSize: 2 }, 5);
  win(); win(); tie(); win(); win(); assert.ok(!p.ach.rostam); win(); assert.ok(p.ach.rostam);
  lose(); lose(); win(); assert.ok(!p.ach.simurgh); lose(); lose(); tie(); lose(); win(); assert.ok(p.ach.simurgh);
});
test('level progress is capped at what the level needs, lifetime points are not', () => {
  const p = G.newPlayer('p', 'A', 1); for (let i = 0; i < 900; i++) G.applyRound(p, { points: 10, won: false, hadWinner: false, tableSize: 2 }, 5);
  assert.strictEqual(p.levelPoints, 1200); assert.strictEqual(p.total, 9000); assert.ok(G.quizReady(p));
});
test('quiz: 4 of 5 passes and opens the level; fewer costs a fifth of the level points but no lifetime points', () => {
  const p = G.newPlayer('p', 'A', 1); p.levelPoints = 1200; p.total = 8000;
  let r = G.applyQuiz(p, 3, 9); assert.ok(!r.passed); assert.strictEqual(p.level, 0); assert.strictEqual(p.levelPoints, 960); assert.ok(!G.quizReady(p)); assert.strictEqual(p.total, 8000); assert.strictEqual(p.quizFails, 1);
  p.levelPoints = 1200; r = G.applyQuiz(p, 4, 9); assert.ok(r.passed); assert.strictEqual(p.level, 1); assert.strictEqual(p.levelPoints, 0); assert.strictEqual(p.firstTries, 0); assert.strictEqual(G.nextLevelNeed(p), 3600);
  p.levelPoints = 10400; G.applyQuiz(p, 5, 9); assert.strictEqual(p.firstTries, 1);
});
test('leaderboard order: level first, then lifetime points, then wins', () => {
  const mk = (id, level, total, wins) => Object.assign(G.newPlayer(id, id, 1), { level, total, wins });
  assert.deepStrictEqual([mk('a', 0, 900, 9), mk('b', 1, 100, 0), mk('c', 1, 100, 2), mk('d', 0, 950, 0)].sort(G.compareBoard).map(p => p.id), ['c', 'b', 'd', 'a']);
});
test('a table needs three people: a referee and at least two players', () => {
  assert.strictEqual(G.MIN_TABLE, 3); assert.strictEqual(G.MIN_SCORED, 2);
});
test('the Wise Judge badge comes after refereeing 10 rounds', () => {
  const p = G.newPlayer('r', 'Ref', 1); assert.strictEqual(p.refereed, 0);
  p.refereed = 9; assert.ok(!G.checkUnlocks(p, 2).some(u => u.id === 'judge'));
  p.refereed = 10; assert.ok(G.checkUnlocks(p, 3).some(u => u.id === 'judge')); assert.ok(!G.checkUnlocks(p, 4).some(u => u.id === 'judge'), 'only once');
});
test('a word already scored with today scores nothing; other players and other categories are not affected', () => {
  const answers = { a: { name: 'Sara', city: 'Shiraz' }, b: { name: 'Sam', city: 'Shiraz' } };
  const r = G.scoreRound({ letter: 'S', cats: ['name', 'city'], answers, used: { a: { name: [G.key('  SARA ')], city: [G.key('Sari')] } } });
  assert.strictEqual(r.players.a.cats.name.status, 'repeat'); assert.strictEqual(r.players.a.cats.name.pts, 0);
  assert.strictEqual(r.players.a.cats.city.status, 'ok'); assert.strictEqual(r.players.b.cats.name.pts, 10);
  const shared = G.scoreRound({ letter: 'S', cats: ['city'], answers, used: { a: { city: [G.key('Shiraz')] } } });
  assert.strictEqual(shared.players.a.cats.city.status, 'repeat'); assert.strictEqual(shared.players.b.cats.city.pts, 10, 'a repeated word no longer makes the other player share');
});
test('the letter bag: every letter comes once before any comes back, and never twice in a row', () => {
  let x = 7; const rand = k => { x = (x * 1103515245 + 12345) % 2147483648; return x % k; };
  const bag = [], seen = []; let last = '';
  for (let i = 0; i < 66; i++) { const l = G.drawLetter(bag, G.LETTERS.en, last, rand); assert.notStrictEqual(l, last); seen.push(l); last = l; }
  for (let k = 0; k < 3; k++) assert.strictEqual(new Set(seen.slice(k * 22, k * 22 + 22)).size, 22, 'bag ' + (k + 1) + ' has every letter once');
});
test('surprise categories: the asked number, all different, none from the round before', () => {
  let x = 3; const rand = k => { x = (x * 1103515245 + 12345) % 2147483648; return x % k; };
  let last = [];
  for (let i = 0; i < 50; i++) { const e = G.drawExtras(2, last, rand); assert.strictEqual(e.length, 2); assert.notStrictEqual(e[0], e[1]); e.forEach(id => { assert.ok(G.EXTRA.some(c => c.id === id)); assert.ok(!last.includes(id)); }); last = e; }
  assert.deepStrictEqual(G.drawExtras(0, [], rand), []);
});
console.log('rules: ' + n + ' tests passed');
