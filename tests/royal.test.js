// Unit tests for the achievement engine (src/royal.js). Run: node tests/royal.test.js
const R = require('../src/royal.js'), assert = require('assert');
let n = 0; const test = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
let clock = 1000; const log = () => ({});
const add = (ev, id, e) => { ev['ev-' + id] = Object.assign({ at: clock++ }, e); return ev; };
const win = (ev, i, w, g = 'missions') => add(ev, 'm' + i, g === 'truths' ? { t: 'match', g, w, author: w } : g === 'esm' ? { t: 'match', g, w, sums: w ? [10, 20] : [20, 10] } : { t: 'match', g, w });

test('rank thresholds unlock at exactly 1, 3, 7, 15, 25, 40, 60 and 100 wins', () => {
  const ev = log(); const at = {};
  for (let i = 1; i <= 100; i++) { win(ev, i, 0); const s = R.compute(ev); at[i] = Object.keys(s.players[0].ranks).length; }
  const steps = Object.keys(at).filter(i => i == 1 || at[i] > at[i - 1]).map(Number);
  assert.deepStrictEqual(steps, [1, 3, 7, 15, 25, 40, 60, 100]);
  assert.strictEqual(R.rankOf(R.compute(ev).players[0]).id, 'shahanshah');
  assert.strictEqual(Object.keys(R.compute(ev).players[1].ranks).length, 0);
});
test('ranks are never revoked by later losses, and keep their unlock time', () => {
  const ev = log(); for (let i = 1; i <= 3; i++) win(ev, i, 0);
  const when = R.compute(ev).players[0].ranks.zabol;
  for (let i = 4; i <= 30; i++) win(ev, i, 1);
  const s = R.compute(ev); assert.strictEqual(s.players[0].ranks.zabol, when); assert.strictEqual(R.rankOf(s.players[0]).id, 'zabol');
});
test('streaks: current resets on a loss, best is kept, ties change neither', () => {
  const ev = log(); [0, 0, 0, 1, 0, 0].forEach((w, i) => win(ev, i, w)); add(ev, 'tie', { t: 'match', g: 'esm', w: -1, sums: [30, 30] }); win(ev, 9, 0);
  const s = R.compute(ev); assert.strictEqual(s.players[0].best, 3); assert.strictEqual(s.players[0].streak, 3); assert.strictEqual(s.players[1].streak, 0); assert.strictEqual(s.players[0].ties, 1);
});
test('Unstoppable Rostam needs five in a row, not five in total', () => {
  let ev = log(); [0, 0, 0, 0, 1, 0, 0].forEach((w, i) => win(ev, i, w)); assert.ok(!R.compute(ev).players[0].ach.rostam);
  [0, 0, 0].forEach((w, i) => win(ev, 20 + i, w)); assert.ok(R.compute(ev).players[0].ach.rostam);
});
test('duplicate and replayed events are counted once; order of arrival does not matter', () => {
  const ev = log(); for (let i = 1; i <= 5; i++) win(ev, i, 0);
  const again = Object.assign({}, ev, JSON.parse(JSON.stringify(ev)));           // the same ids delivered twice
  const shuffled = {}; Object.keys(ev).reverse().forEach(k => { shuffled[k] = ev[k]; });
  assert.strictEqual(R.compute(again).players[0].wins, 5); assert.deepStrictEqual(R.compute(shuffled).unlocks, R.compute(ev).unlocks);
});
test('invalid events are ignored: unknown game, question "wins", bad winner, mismatched Esm score', () => {
  const ev = log(); add(ev, 'bad1', { t: 'match', g: 'questions', w: 0 }); add(ev, 'bad2', { t: 'match', g: 'missions', w: 2 });
  add(ev, 'bad3', { t: 'match', g: 'esm', w: 0, sums: [10, 50] }); add(ev, 'bad4', { t: 'match', g: 'draw', w: 0 }); add(ev, 'x', { t: 'match', g: 'missions', w: 0 }); ev['no time'] = { t: 'coop', g: 'missions' };
  const s = R.compute(ev); assert.strictEqual(s.count, 1); assert.strictEqual(s.players[0].wins, 1);
});
test('cooperative play never counts as a win', () => {
  const ev = log(); for (let i = 0; i < 30; i++) { add(ev, 'c' + i, { t: 'coop', g: 'missions' }); add(ev, 'q' + i, { t: 'question', g: 'questions' }); add(ev, 'd' + i, { t: 'draw', g: 'draw', drawer: 0 }); }
  const s = R.compute(ev); assert.strictEqual(s.players[0].wins + s.players[1].wins, 0); assert.strictEqual(s.unlocks.filter(u => u.kind === 'rank').length, 0);
});
test('shared achievements unlock once, for both: Zal & Rudabeh at 20 cooperative activities', () => {
  const ev = log(); for (let i = 0; i < 19; i++) add(ev, 'c' + i, { t: 'coop', g: 'missions' });
  assert.ok(!R.compute(ev).shared.ach.zal); add(ev, 'd1', { t: 'draw', g: 'draw', drawer: 1 });
  const s = R.compute(ev); assert.ok(s.shared.ach.zal); assert.strictEqual(s.unlocks.filter(u => u.id === 'zal').length, 1); assert.strictEqual(s.unlocks.find(u => u.id === 'zal').p, -1);
});
test('Rulers of Seven Lands counts distinct countries only', () => {
  const ev = log(); ['Iran', 'Iran', 'Peru', 'Japan', 'Italy', 'Kenya', 'Norway'].forEach((c, i) => add(ev, 'a' + i, { t: 'adventure', g: 'life', country: c }));
  assert.strictEqual(R.compute(ev).shared.countries.length, 6); assert.ok(!R.compute(ev).shared.ach.sevenlands);
  add(ev, 'a9', { t: 'adventure', g: 'life', country: 'Greece' }); assert.ok(R.compute(ev).shared.ach.sevenlands);
});
test('Blessing of the Simurgh: only a real comeback in the Esm Famil series', () => {
  let ev = log(); add(ev, 'e1', { t: 'match', g: 'esm', w: 1, sums: [10, 40] });                 // player 0 is 30 behind
  add(ev, 'e2', { t: 'match', g: 'esm', w: 0, sums: [30, 20] });                                  // wins, still 20 behind: no blessing
  assert.strictEqual(R.compute(ev).players[0].comebacks, 0);
  add(ev, 'e3', { t: 'match', g: 'esm', w: 0, sums: [50, 20] });                                  // from 20 behind to 10 ahead
  let s = R.compute(ev); assert.strictEqual(s.players[0].comebacks, 1); assert.ok(s.players[0].ach.simurgh); assert.ok(!s.players[1].ach.simurgh);
  ev = log(); add(ev, 'e1', { t: 'match', g: 'esm', w: 1, sums: [20, 30] }); add(ev, 'e2', { t: 'match', g: 'esm', w: 0, sums: [60, 10] });   // only 10 behind: not significant
  assert.strictEqual(R.compute(ev).players[0].comebacks, 0);
});
test('game milestones: Trickster counts only fooled guesses, Master of Words only Esm wins, Royal Artist only as the drawer', () => {
  const ev = log(); for (let i = 0; i < 10; i++) add(ev, 't' + i, { t: 'match', g: 'truths', w: 0, author: 1 });      // player 0 guessed right: no fooling
  assert.strictEqual(R.compute(ev).players[0].fooled, 0);
  for (let i = 0; i < 10; i++) add(ev, 'f' + i, { t: 'match', g: 'truths', w: 1, author: 1 });
  for (let i = 0; i < 15; i++) win(ev, 100 + i, 1, 'esm'); for (let i = 0; i < 20; i++) add(ev, 'd' + i, { t: 'draw', g: 'draw', drawer: 1 });
  const s = R.compute(ev); assert.ok(s.players[1].ach.trickster && s.players[1].ach.words && s.players[1].ach.artist); assert.ok(!s.players[0].ach.trickster && !s.players[0].ach.artist);
});
test('head-to-head, crown holder, the hidden cup and the 100-activity badge', () => {
  const ev = log(); win(ev, 1, 0); win(ev, 2, 1, 'truths'); win(ev, 3, 1, 'esm');
  let s = R.compute(ev); assert.strictEqual(s.leader, 1); assert.deepStrictEqual(s.h2h.byGame.esm.wins, [0, 1]); assert.ok(!s.shared.ach.cup);
  add(ev, 'q', { t: 'question', g: 'questions' }); add(ev, 'a', { t: 'adventure', g: 'life', country: 'Iran' }); add(ev, 'd', { t: 'draw', g: 'draw', drawer: 0 });
  assert.ok(R.compute(ev).shared.ach.cup);
  for (let i = 0; i < 93; i++) add(ev, 'qq' + i, { t: 'question', g: 'questions' }); assert.ok(!R.compute(ev).shared.ach.universe);
  add(ev, 'last', { t: 'question', g: 'questions' }); assert.ok(R.compute(ev).shared.ach.universe);
});
test('titles follow the chosen royal style and kingdom', () => {
  assert.strictEqual(R.rankTitle(R.rank('sistan'), { royal: 'Princess', kingdom: 'turan' }), 'Princess of Sistan');
  assert.strictEqual(R.rankTitle(R.rank('crown'), { royal: 'Princess', kingdom: 'turan' }), 'Crown of Turan');
  assert.strictEqual(R.rankTitle(R.rank('crown'), { royal: 'Prince', kingdom: 'iran' }), 'Crown of Iran');
});
console.log('engine: ' + n + ' tests passed');
