// Unit tests for the rules (server/game.js). Run: node tests/game.test.js
const G = require('../server/game.js'), assert = require('assert');
let n = 0; const test = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
const cats = ['name', 'city', 'food'];

test('level points: level 1 is 10 hours of play, each next level 30% more', () => {
  assert.deepStrictEqual([1, 2, 3, 4, 5, 6, 7].map(G.levelPoints), [8000, 10400, 13500, 17600, 22800, 29700, 38600]);
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
  assert.strictEqual(p.levelPoints, 8000); assert.strictEqual(p.total, 9000); assert.ok(G.quizReady(p));
});
test('quiz: 4 of 5 passes and opens the level; fewer loses the level points but not lifetime points', () => {
  const p = G.newPlayer('p', 'A', 1); p.levelPoints = 8000; p.total = 8000;
  let r = G.applyQuiz(p, 3, 9); assert.ok(!r.passed); assert.strictEqual(p.level, 0); assert.strictEqual(p.levelPoints, 0); assert.strictEqual(p.total, 8000); assert.strictEqual(p.quizFails, 1);
  p.levelPoints = 8000; r = G.applyQuiz(p, 4, 9); assert.ok(r.passed); assert.strictEqual(p.level, 1); assert.strictEqual(p.levelPoints, 0); assert.strictEqual(p.firstTries, 0); assert.strictEqual(G.nextLevelNeed(p), 10400);
  p.levelPoints = 10400; G.applyQuiz(p, 5, 9); assert.strictEqual(p.firstTries, 1);
});
test('leaderboard order: level first, then lifetime points, then wins', () => {
  const mk = (id, level, total, wins) => Object.assign(G.newPlayer(id, id, 1), { level, total, wins });
  assert.deepStrictEqual([mk('a', 0, 900, 9), mk('b', 1, 100, 0), mk('c', 1, 100, 2), mk('d', 0, 950, 0)].sort(G.compareBoard).map(p => p.id), ['c', 'b', 'd', 'a']);
});
console.log('rules: ' + n + ' tests passed');
