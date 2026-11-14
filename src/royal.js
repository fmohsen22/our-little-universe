/* The Crowns of Shahnameh: achievement engine.
   Pure and deterministic. It turns the room's log of completed game events into ranks, achievements,
   statistics and history. Nothing here is stored as a total: every number is recomputed from the
   events, so a refreshed page, a reconnect or a replayed message can never count a win twice.
   Runs in the browser (window.OLU_ROYAL) and in Node (the room server and the tests). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.OLU_ROYAL = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var GAMES = ['questions', 'life', 'truths', 'missions', 'draw', 'esm'];
  // Only these have a defined winner. Question Cards, Imaginary Life, Draw & Guess and shared missions are cooperative.
  var COMPETITIVE = ['truths', 'missions', 'esm'];
  var COMEBACK_GAP = 20;   // Esm Famil: points behind in the running series before the round that turns it

  /* ----- configuration: ranks ----- */
  var RANKS = [
    { id: 'hero', wins: 1, title: 'Young Hero', badge: 'Bronze Shield', art: 'shield', metal: 'bronze', story: 'rostam', cheer: 'Every legend starts with one small, slightly lucky victory.' },
    { id: 'zabol', wins: 3, title: 'Guardian of Zabol', badge: 'Bronze Lion', art: 'lion', metal: 'bronze', story: 'sistan', cheer: 'The gates of Zabol are safe. The biscuits are not.' },
    { id: 'sistan', wins: 7, title: '{royal} of Sistan', badge: 'Silver Crown', art: 'crown', metal: 'silver', story: 'sistan', cheer: 'Sistan bows. Please try to look modest.' },
    { id: 'champion', wins: 15, title: 'Champion of Rostam', badge: 'Golden Mace', art: 'mace', metal: 'gold', story: 'rostam', cheer: 'Rakhsh is saddled. Your rival is nervous.' },
    { id: 'heir', wins: 25, title: 'Royal Heir', badge: 'Ruby Crown', art: 'rubycrown', metal: 'ruby', story: 'khosrow', cheer: 'The throne is being dusted for you.' },
    { id: 'crown', wins: 40, title: 'Crown of {kingdom}', badge: 'Royal Crown', art: 'royalcrown', metal: 'gold', story: 'irantu', cheer: 'A whole kingdom now does what you say. In theory.' },
    { id: 'simurgh', wins: 60, title: 'Chosen of the Simurgh', badge: 'Legendary Feather', art: 'feather', metal: 'emerald', story: 'simurgh', legendary: true, cheer: 'A feather drifts down from Mount Alborz with your name on it.' },
    { id: 'shahanshah', wins: 100, title: 'Shahanshah of Legends', badge: 'Imperial Crown', art: 'imperial', metal: 'gold', story: 'khosrow', legendary: true, cheer: 'One hundred victories. Poets are sharpening their pens.' }
  ];

  /* ----- configuration: achievements. value(state, player) is the progress, goal the target. ----- */
  var ACHIEVEMENTS = [
    { id: 'rostam', scope: 'individual', name: 'Unstoppable Rostam', icon: '🔥', art: 'flame', metal: 'gold', legendary: true, story: 'rostam', goal: 5,
      desc: 'Win five competitive games in a row.', value: function (s, p) { return s.players[p].best; } },
    { id: 'simurgh', scope: 'individual', name: 'Blessing of the Simurgh', icon: '🪽', art: 'feather', metal: 'emerald', legendary: true, story: 'simurgh', goal: 1,
      desc: 'Win an Esm Famil round that brings you back from ' + COMEBACK_GAP + ' or more points behind in the series to level or ahead.', value: function (s, p) { return s.players[p].comebacks; } },
    { id: 'artist', scope: 'individual', name: 'Royal Artist', icon: '🎨', art: 'palette', metal: 'sapphire', story: 'miniature', goal: 20,
      desc: 'Have 20 of your drawings guessed in Draw & Guess.', value: function (s, p) { return s.players[p].drawn; } },
    { id: 'words', scope: 'individual', name: 'Master of Words', icon: '🧠', art: 'book', metal: 'silver', story: 'ferdowsi', goal: 15,
      desc: 'Win 15 rounds of Esm Famil.', value: function (s, p) { return s.players[p].esmWins; } },
    { id: 'trickster', scope: 'individual', name: 'The Great Trickster', icon: '🎭', art: 'mask', metal: 'ruby', story: 'afrasiab', goal: 10,
      desc: 'Fool your partner ten times in Two Truths & One Lie.', value: function (s, p) { return s.players[p].fooled; } },
    { id: 'zal', scope: 'shared', name: 'Zal & Rudabeh', icon: '💞', art: 'hearts', metal: 'ruby', legendary: true, story: 'zal', goal: 20,
      desc: 'Complete 20 cooperative activities together: shared missions, finished adventures and guessed drawings.', value: function (s) { return s.shared.coop; } },
    { id: 'sevenlands', scope: 'shared', name: 'Rulers of Seven Lands', icon: '🗺️', art: 'globe', metal: 'emerald', story: 'irantu', goal: 7,
      desc: 'Finish imaginary-life adventures in seven different countries.', value: function (s) { return s.shared.countries.length; } },
    { id: 'rivalry', scope: 'shared', name: 'The Great Rivalry', icon: '⚔️', art: 'swords', metal: 'silver', story: 'irantu', goal: 50,
      desc: 'Complete 50 competitive matches against each other.', value: function (s) { return s.shared.matches; } },
    { id: 'universe', scope: 'shared', name: 'Our Little Universe', icon: '❤️', art: 'planet', metal: 'gold', legendary: true, story: null, goal: 100,
      desc: 'Complete 100 shared activities across the website.', value: function (s) { return s.shared.activities; } },
    { id: 'cup', scope: 'shared', hidden: true, name: 'The Cup of Kay Khosrow', icon: '🏆', art: 'cup', metal: 'gold', legendary: true, story: 'khosrow', goal: 6,
      desc: 'See the whole world: complete at least one activity in all six games.', value: function (s) { return Object.keys(s.shared.played).length; } }
  ];

  /* ----- events ----- */
  var TYPES = { match: 1, coop: 1, adventure: 1, draw: 1, question: 1 };
  var isP = function (v) { return v === 0 || v === 1; };
  // The only shapes the engine accepts. Anything else is ignored, here and on the server.
  function validEvent(id, e) {
    if (typeof id !== 'string' || !/^[a-z0-9:_-]{3,80}$/i.test(id) || !e || typeof e !== 'object') return false;
    if (!TYPES[e.t] || typeof e.at !== 'number' || !isFinite(e.at) || e.at <= 0) return false;
    if (e.t === 'match') {
      if (COMPETITIVE.indexOf(e.g) < 0 || !(isP(e.w) || e.w === -1)) return false;
      if (e.g === 'esm' && !(Array.isArray(e.sums) && e.sums.length === 2 && e.sums.every(function (n) { return typeof n === 'number' && n >= 0 && n <= 1000; }))) return false;
      if (e.g === 'esm' && (e.w === -1) !== (e.sums[0] === e.sums[1])) return false;
      if (e.g === 'esm' && e.w !== -1 && e.sums[e.w] < e.sums[1 - e.w]) return false;
      if (e.g === 'truths' && !(isP(e.author) && isP(e.w))) return false;
      if (e.g === 'missions' && !isP(e.w)) return false;
      return true;
    }
    if (e.t === 'coop') return e.g === 'missions';
    if (e.t === 'adventure') return e.g === 'life' && typeof e.country === 'string' && e.country.length > 0 && e.country.length <= 40;
    if (e.t === 'draw') return e.g === 'draw' && isP(e.drawer);
    return e.g === 'questions';
  }

  function blankPlayer() { return { wins: 0, losses: 0, ties: 0, streak: 0, best: 0, fooled: 0, drawn: 0, esmWins: 0, comebacks: 0, ranks: {}, ach: {} }; }

  /* Fold the event log into the full royal state. `byId` is the stored map of event id -> event. */
  function compute(byId) {
    var s = {
      players: [blankPlayer(), blankPlayer()],
      shared: { activities: 0, coop: 0, matches: 0, countries: [], played: {}, ach: {} },
      h2h: { wins: [0, 0], ties: 0, byGame: {} }, esm: [0, 0],
      unlocks: [], history: [], count: 0
    };
    COMPETITIVE.forEach(function (g) { s.h2h.byGame[g] = { wins: [0, 0], ties: 0 }; });
    var ids = Object.keys(byId || {}).filter(function (id) { return validEvent(id, byId[id]); });
    ids.sort(function (a, b) { return byId[a].at - byId[b].at || (a < b ? -1 : a > b ? 1 : 0); });

    ids.forEach(function (id) {
      var e = byId[id];
      s.count += 1; s.shared.activities += 1; s.shared.played[e.g] = true;
      var entry = { id: id, at: e.at, t: e.t, g: e.g };
      if (e.t === 'match') {
        s.shared.matches += 1; var hg = s.h2h.byGame[e.g];
        entry.w = e.w; if (e.sums) entry.sums = e.sums;
        if (e.w === -1) { s.players[0].ties += 1; s.players[1].ties += 1; s.h2h.ties += 1; hg.ties += 1; }
        else {
          var W = s.players[e.w], L = s.players[1 - e.w];
          W.wins += 1; W.streak += 1; if (W.streak > W.best) W.best = W.streak;
          L.losses += 1; L.streak = 0; s.h2h.wins[e.w] += 1; hg.wins[e.w] += 1;
          if (e.g === 'truths' && e.w === e.author) { W.fooled += 1; entry.fooled = true; }
          if (e.g === 'esm') W.esmWins += 1;
        }
        if (e.g === 'esm') {
          var before = e.w === -1 ? 0 : s.esm[e.w] - s.esm[1 - e.w];
          s.esm = [s.esm[0] + e.sums[0], s.esm[1] + e.sums[1]];
          if (e.w !== -1 && before <= -COMEBACK_GAP && s.esm[e.w] - s.esm[1 - e.w] >= 0) { s.players[e.w].comebacks += 1; entry.comeback = true; }
        }
      } else if (e.t === 'coop') { s.shared.coop += 1; }
      else if (e.t === 'adventure') { s.shared.coop += 1; entry.country = e.country; if (s.shared.countries.indexOf(e.country) < 0) s.shared.countries.push(e.country); }
      else if (e.t === 'draw') { s.shared.coop += 1; s.players[e.drawer].drawn += 1; entry.drawer = e.drawer; }
      s.history.push(entry);

      // unlocks earned by this event keep this event's time, so they are stable and never revoked
      [0, 1].forEach(function (p) {
        RANKS.forEach(function (r) { if (!s.players[p].ranks[r.id] && s.players[p].wins >= r.wins) { s.players[p].ranks[r.id] = e.at; unlock('rank', r.id, p, e.at, id); } });
        ACHIEVEMENTS.forEach(function (a) { if (a.scope === 'individual' && !s.players[p].ach[a.id] && a.value(s, p) >= a.goal) { s.players[p].ach[a.id] = e.at; unlock('ach', a.id, p, e.at, id); } });
      });
      ACHIEVEMENTS.forEach(function (a) { if (a.scope === 'shared' && !s.shared.ach[a.id] && a.value(s, 0) >= a.goal) { s.shared.ach[a.id] = e.at; unlock('ach', a.id, -1, e.at, id); } });
    });
    function unlock(kind, id, p, at, ev) { var u = { key: kind + ':' + id + ':' + p, kind: kind, id: id, p: p, at: at, ev: ev }; s.unlocks.push(u); s.history.push({ id: u.key, at: at, t: 'unlock', u: u }); }

    s.leader = s.h2h.wins[0] === s.h2h.wins[1] ? -1 : (s.h2h.wins[0] > s.h2h.wins[1] ? 0 : 1);   // the temporary Crown Holder
    return s;
  }

  function rankOf(player) { var cur = null; RANKS.forEach(function (r) { if (player.ranks[r.id]) cur = r; }); return cur; }
  function nextRank(player) { for (var i = 0; i < RANKS.length; i++) if (!player.ranks[RANKS[i].id]) return RANKS[i]; return null; }
  // profile: { royal: 'Prince' | 'Princess' | 'Champion', kingdom: 'iran' | 'turan' }
  function rankTitle(rank, profile) {
    return rank.title.replace('{royal}', (profile && profile.royal) || 'Champion').replace('{kingdom}', profile && profile.kingdom === 'turan' ? 'Turan' : 'Iran');
  }
  function find(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }

  return {
    GAMES: GAMES, COMPETITIVE: COMPETITIVE, COMEBACK_GAP: COMEBACK_GAP, RANKS: RANKS, ACHIEVEMENTS: ACHIEVEMENTS,
    validEvent: validEvent, compute: compute, rankOf: rankOf, nextRank: nextRank, rankTitle: rankTitle,
    rank: function (id) { return find(RANKS, id); }, achievement: function (id) { return find(ACHIEVEMENTS, id); }
  };
});
