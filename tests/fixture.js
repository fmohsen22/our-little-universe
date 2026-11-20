// A tiny set of level stories for tests, so they do not depend on the real stories.
const fs = require('fs'), os = require('os'), path = require('path');
module.exports = function () {
  const levels = Array.from({ length: 7 }, (_, i) => ({ n: i + 1, id: 'l' + (i + 1), title: 'Test chapter ' + (i + 1), teaser: 'Teaser ' + (i + 1), story: ['Story paragraph for chapter ' + (i + 1) + '.', 'The hero is Rostam.'], video: '', sources: ['Test source'],
    quiz: Array.from({ length: 10 }, (_, q) => ({ q: 'Question ' + (q + 1) + '?', options: ['right', 'wrong a', 'wrong b', 'wrong c'].map((o, k) => k === q % 4 ? 'right' : k === 0 ? 'wrong z' : o), answer: q % 4 })) }));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpm-')), file = path.join(dir, 'levels.json');
  levels.forEach(L => { L.clue = 'Clue ' + L.n + ' about the city.'; });
  const finale = { title: 'Where is the Prince?', story: ['Test finale story.', 'Mohsey rides west.'], riddle: 'Where is the Prince?', answers: ['vienna', 'wien', 'vienne'],
    near: { austria: 'The right land, but name the city.' }, hints: ['Hint one.', 'Hint two.', 'Hint three.'], ending: ['Vienna, of course.', 'He is waiting at his table.'] };
  fs.writeFileSync(file, JSON.stringify({ levels, finale })); return { dir, file };
};
