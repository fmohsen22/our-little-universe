// "Where is Prince Mohsey?" game rules. Pure functions and configuration: no I/O, so everything here is unit-tested.
'use strict';

/* ---------- configuration ---------- */
const CATEGORIES = [
  { id: 'name', en: 'Name', fa: 'اسم' }, { id: 'surname', en: 'Surname', fa: 'فامیل' }, { id: 'city', en: 'City', fa: 'شهر' },
  { id: 'country', en: 'Country', fa: 'کشور' }, { id: 'animal', en: 'Animal', fa: 'حیوان' }, { id: 'food', en: 'Food', fa: 'غذا' },
  { id: 'thing', en: 'Object', fa: 'اشیا' }, { id: 'color', en: 'Colour', fa: 'رنگ' }
];
const LETTERS = { en: 'ABCDEFGHIJKLMNOPRSTUVW'.split(''), fa: 'ا ب پ ت ج چ خ د ر ز س ش ع ف ق ک گ ل م ن و ه ی'.split(' ') };
const DEFAULT_SETTINGS = { lang: 'en', cats: ['name', 'surname', 'city', 'country', 'animal', 'food'], secs: 90 };
const POINTS = { unique: 10, shared: 5 };
const MAX_PLAYERS = 12, MIN_SCORED = 2;      // a round only counts for points, wins and levels with at least two players

// Levels. Level 1 is sized for about 10 hours of play (2 hours a day for 5 days); each next level needs 30% more.
// Assumption: a round with checking takes about 3 minutes and a typical player scores about 40 points, so about 800 points an hour.
const LEVELS = { count: 7, pointsPerHour: 800, firstLevelHours: 10, growth: 1.3, quizSize: 5, quizPass: 4 };
const SCALE = +(process.env.LEVEL_SCALE || 1);   // tests shrink the levels; leave unset in real use
function levelPoints(n) { const raw = LEVELS.pointsPerHour * LEVELS.firstLevelHours * Math.pow(LEVELS.growth, n - 1) * SCALE, step = raw >= 1000 ? 100 : 10; return Math.max(step, Math.round(raw / step) * step); }

const RANKS = [
  { id: 'hero', wins: 1, title: 'Young Hero', badge: 'Bronze Shield', art: 'shield', metal: 'bronze' },
  { id: 'zabol', wins: 3, title: 'Guardian of Zabol', badge: 'Bronze Lion', art: 'lion', metal: 'bronze' },
  { id: 'sistan', wins: 7, title: '{royal} of Sistan', badge: 'Silver Crown', art: 'crown', metal: 'silver' },
  { id: 'champion', wins: 15, title: 'Champion of Rostam', badge: 'Golden Mace', art: 'mace', metal: 'gold' },
  { id: 'heir', wins: 25, title: 'Royal Heir', badge: 'Ruby Crown', art: 'rubycrown', metal: 'ruby' },
  { id: 'crown', wins: 40, title: 'Crown of {kingdom}', badge: 'Royal Crown', art: 'royalcrown', metal: 'gold' },
  { id: 'simurgh', wins: 60, title: 'Chosen of the Simurgh', badge: 'Legendary Feather', art: 'feather', metal: 'emerald', legendary: true },
  { id: 'shahanshah', wins: 100, title: 'Shahanshah of Legends', badge: 'Imperial Crown', art: 'imperial', metal: 'gold', legendary: true }
];
// value(player) is the progress, goal the target. All are derived from stats the server itself records.
const ACHIEVEMENTS = [
  { id: 'rostam', name: 'Unstoppable Rostam', art: 'flame', metal: 'gold', legendary: true, goal: 5, desc: 'Win five rounds in a row.', value: p => p.best },
  { id: 'simurgh', name: 'Blessing of the Simurgh', art: 'feather', metal: 'emerald', legendary: true, goal: 1, desc: 'Win a round straight after losing three in a row.', value: p => p.comebacks },
  { id: 'words', name: 'Master of Words', art: 'book', metal: 'silver', goal: 15, desc: 'Win 15 rounds.', value: p => p.wins },
  { id: 'rakhsh', name: 'Swift as Rakhsh', art: 'swords', metal: 'sapphire', goal: 10, desc: 'Ten times, be the one who calls Stop with every answer accepted.', value: p => p.cleanStops },
  { id: 'rivalry', name: 'The Great Rivalry', art: 'mask', metal: 'ruby', goal: 50, desc: 'Play 50 scored rounds.', value: p => p.rounds },
  { id: 'keeper', name: 'Keeper of the Book of Kings', art: 'planet', metal: 'gold', legendary: true, goal: 300, desc: 'Play 300 scored rounds.', value: p => p.rounds },
  { id: 'scholar', name: 'Scholar of the Shahnameh', art: 'palette', metal: 'sapphire', goal: 3, desc: 'Pass three level quizzes at the first attempt.', value: p => p.firstTries },
  { id: 'cup', name: 'The Cup of Kay Khosrow', art: 'cup', metal: 'gold', legendary: true, hidden: true, goal: 1, desc: 'Win a round at a table of five or more.', value: p => p.bigWins }
];

/* ---------- text ---------- */
const ARABIC = { 'ي': 'ی', 'ى': 'ی', 'ك': 'ک', 'آ': 'ا', 'أ': 'ا', 'إ': 'ا', 'ٱ': 'ا', 'ة': 'ه', 'ۀ': 'ه', 'ؤ': 'و', 'ئ': 'ی' };
function fold(s) {
  return String(s == null ? '' : s).normalize('NFKC').replace(/[ً-ٰٟـ‌‍‎‏]/g, '')
    .replace(/[يىكآأإٱةۀؤئ]/g, c => ARABIC[c]).toLowerCase();
}
// The key two answers are compared by: letters and digits only.
function key(s) { return fold(s).replace(/[^\p{L}\p{N}]+/gu, ''); }
function clean(s) { return String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40); }
function startsWith(answer, letter) { const k = key(answer); return k.length > 0 && k[0] === key(letter)[0]; }

/* ---------- scoring a round ----------
   answers: { playerId: { cat: text } }, rejects: { playerId: { cat: [voterIds] } }.
   An answer is refused automatically when it is empty or starts with the wrong letter, and by vote when
   more than half of the other players reject it. Accepted answers score 10 if nobody else gave the same, else 5. */
function scoreRound(round) {
  const ids = Object.keys(round.answers), out = {}, others = Math.max(1, ids.length - 1);
  ids.forEach(id => { out[id] = { total: 0, cats: {} }; });
  round.cats.forEach(cat => {
    const seen = {};
    ids.forEach(id => {
      const text = clean((round.answers[id] || {})[cat]);
      const votes = ((round.rejects || {})[id] || {})[cat] || [];
      let status = 'ok';
      if (!key(text)) status = 'empty'; else if (!startsWith(text, round.letter)) status = 'letter';
      else if (votes.filter(v => v !== id && ids.includes(v)).length * 2 > others) status = 'rejected';
      out[id].cats[cat] = { text, status, pts: 0 };
      if (status === 'ok') { const k = key(text); (seen[k] = seen[k] || []).push(id); }
    });
    Object.keys(seen).forEach(k => seen[k].forEach(id => { const pts = seen[k].length === 1 ? POINTS.unique : POINTS.shared; out[id].cats[cat].pts = pts; out[id].cats[cat].shared = seen[k].length > 1; out[id].total += pts; }));
  });
  let best = -1, winners = [];
  ids.forEach(id => { if (out[id].total > best) { best = out[id].total; winners = [id]; } else if (out[id].total === best) winners.push(id); });
  const order = ids.slice().sort((a, b) => out[b].total - out[a].total);
  return { players: out, order, winner: best > 0 && winners.length === 1 ? winners[0] : null, scored: ids.length >= MIN_SCORED };
}

/* ---------- players ---------- */
function newPlayer(id, name, now) {
  return { id, name, kingdom: 'iran', royal: 'Champion', createdAt: now, lastSeen: now,
    total: 0, level: 0, levelPoints: 0, rounds: 0, wins: 0, streak: 0, best: 0, lossStreak: 0, comebacks: 0, cleanStops: 0, bigWins: 0, firstTries: 0,
    quizFails: 0, quiz: null, ranks: {}, ach: {} };
}
function rankOf(p) { let cur = null; RANKS.forEach(r => { if (p.ranks[r.id]) cur = r; }); return cur; }
function rankTitle(r, p) { return r.title.replace('{royal}', p.royal && p.royal !== 'Champion' ? p.royal : 'Champion').replace('{kingdom}', p.kingdom === 'turan' ? 'Turan' : 'Iran'); }
function checkUnlocks(p, now) {
  const got = [];
  RANKS.forEach(r => { if (!p.ranks[r.id] && p.wins >= r.wins) { p.ranks[r.id] = now; got.push({ kind: 'rank', id: r.id }); } });
  ACHIEVEMENTS.forEach(a => { if (!p.ach[a.id] && a.value(p) >= a.goal) { p.ach[a.id] = now; got.push({ kind: 'ach', id: a.id }); } });
  return got;
}
// Level progress is capped at the amount the next level needs: after that, the quiz is the only way forward.
function nextLevelNeed(p) { return p.level >= LEVELS.count ? 0 : levelPoints(p.level + 1); }
function quizReady(p) { return p.level < LEVELS.count && p.levelPoints >= nextLevelNeed(p); }

/* Apply one finished, scored round to a player's lifetime record. Returns what it unlocked. */
function applyRound(p, r, now) {
  p.rounds += 1; p.total += r.points; p.lastSeen = now;
  if (p.level < LEVELS.count) p.levelPoints = Math.min(nextLevelNeed(p), p.levelPoints + r.points);
  if (r.won) {
    if (p.lossStreak >= 3) p.comebacks += 1;
    p.wins += 1; p.streak += 1; p.lossStreak = 0; if (p.streak > p.best) p.best = p.streak;
    if (r.tableSize >= 5) p.bigWins += 1;
  } else if (r.hadWinner) { p.streak = 0; p.lossStreak += 1; }
  if (r.cleanStop) p.cleanStops += 1;
  return checkUnlocks(p, now);
}
/* Apply a graded quiz. Passing opens the level; failing costs the points gathered for it. */
function applyQuiz(p, correct, now) {
  const passed = correct >= LEVELS.quizPass, level = p.level + 1;
  if (passed) { p.level = level; if (!p.quizFails) p.firstTries += 1; }
  p.quizFails = passed ? 0 : p.quizFails + 1; p.levelPoints = 0; p.quiz = null;
  return { passed, level, correct, unlocks: checkUnlocks(p, now) };
}
// Leaderboard order: highest level, then lifetime points, then wins, then who got there first.
function compareBoard(a, b) { return b.level - a.level || b.total - a.total || b.wins - a.wins || a.createdAt - b.createdAt; }

module.exports = { CATEGORIES, LETTERS, DEFAULT_SETTINGS, POINTS, MAX_PLAYERS, MIN_SCORED, LEVELS, RANKS, ACHIEVEMENTS,
  levelPoints, fold, key, clean, startsWith, scoreRound, newPlayer, rankOf, rankTitle, checkUnlocks, nextLevelNeed, quizReady, applyRound, applyQuiz, compareBoard };
