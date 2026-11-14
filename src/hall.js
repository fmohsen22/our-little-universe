/* The Crowns of Shahnameh: badge art, the Royal Hall, the promotion ceremony and royal challenges.
   All numbers come from the engine in royal.js; this file only draws them. */
(function () {
  'use strict';
  var O = window.OLU, R = window.OLU_ROYAL, S = O.S, esc = O.esc, N = O.N, T = O.T, $ = O.$;

  /* ---------- original badge illustrations (inline SVG, one medallion frame, one glyph each) ---------- */
  function star(cx, cy, n, r1, r2, rot) { var p = []; for (var i = 0; i < n * 2; i++) { var a = Math.PI * i / n + (rot || 0), r = i % 2 ? r2 : r1; p.push((cx + r * Math.sin(a)).toFixed(1) + ',' + (cy - r * Math.cos(a)).toFixed(1)); } return p.join(' '); }
  var D = '#2B1B12', CROWN = '<path d="M36 80 32 48l14 13 14-23 14 23 14-13-4 32z"/><rect x="36" y="80" width="48" height="7" rx="2"/>';
  var heart = function (x, y, k, fill) { return '<path transform="translate(' + x + ' ' + y + ') scale(' + k + ')" d="M0 10c-9-7-14-12-14-18 0-5 4-8 8-8 3 0 5 2 6 4 1-2 3-4 6-4 4 0 8 3 8 8 0 6-5 11-14 18z"' + (fill ? ' fill="' + fill + '"' : '') + '/>'; };
  var GLYPH = {
    shield: '<path d="M60 30 84 39v21c0 16-11 27-24 32-13-5-24-16-24-32V39z"/><path d="M60 38v46M42 57h36" fill="none" stroke-width="2.4"/><circle cx="60" cy="57" r="5" fill="#FFF3C9"/>',
    lion: function () { return '<polygon points="' + star(60, 60, 12, 31, 24) + '"/><circle cx="60" cy="61" r="17"/><circle cx="53" cy="57" r="2.2" fill="' + D + '"/><circle cx="67" cy="57" r="2.2" fill="' + D + '"/><path d="M56 64h8l-4 5zM60 69c-3 4-7 4-9 2M60 69c3 4 7 4 9 2" fill="' + D + '" stroke-width="1.4"/>'; },
    crown: CROWN + '<circle cx="32" cy="46" r="3.6"/><circle cx="60" cy="36" r="4.2"/><circle cx="88" cy="46" r="3.6"/><circle cx="60" cy="70" r="3" fill="#FFF3C9"/>',
    rubycrown: CROWN + '<circle cx="32" cy="46" r="3.6" fill="#FFD766"/><circle cx="60" cy="36" r="4.2" fill="#FFD766"/><circle cx="88" cy="46" r="3.6" fill="#FFD766"/><path d="M60 60l7 8-7 8-7-8z" fill="#FFE1E6"/>',
    royalcrown: '<path d="M38 66c3-36 41-36 44 0z" fill="#8E1B3A"/>' + CROWN + '<circle cx="32" cy="46" r="3.6" fill="#3FBF8A"/><circle cx="60" cy="36" r="4.4" fill="#E0284A"/><circle cx="88" cy="46" r="3.6" fill="#5B8DF5"/><circle cx="48" cy="83.500" r="2" fill="#E0284A"/><circle cx="60" cy="83.500" r="2" fill="#3FBF8A"/><circle cx="72" cy="83.500" r="2" fill="#5B8DF5"/>',
    imperial: '<path d="M60 32V22M46 35l-5-9M74 35l5-9M36 42l-8-6M84 42l8-6" fill="none" stroke-width="3" stroke-linecap="round"/><path d="M38 68c3-34 41-34 44 0z" fill="#5A1F7A"/><g transform="translate(0 4)">' + CROWN + '</g><circle cx="60" cy="40" r="5" fill="#FFF3C9"/><circle cx="32" cy="50" r="3.4" fill="#E0284A"/><circle cx="88" cy="50" r="3.4" fill="#E0284A"/><path d="M60 62l6 7-6 7-6-7z" fill="#E0284A"/>',
    mace: '<path d="M42 92 66 54" stroke-width="9" stroke-linecap="round"/><path d="M61 39c-7-8-3-17 4-19M85 52c9 3 15-3 14-10" fill="none" stroke-width="4.5" stroke-linecap="round"/><circle cx="73" cy="45" r="15"/><circle cx="68" cy="42" r="2" fill="' + D + '"/><circle cx="78" cy="42" r="2" fill="' + D + '"/><path d="M68 51c3 3 7 3 10 0" fill="none"/>',
    feather: '<path d="M38 92c2-28 18-52 48-62-2 30-18 52-48 62z"/><path d="M38 92C52 70 66 50 84 32M50 74l-7-10M58 64l-8-11M66 54l-8-11M56 77l13 1M64 67l13 0M72 56l10-1" fill="none" stroke-width="1.5"/>',
    flame: '<path d="M60 26c4 14 22 22 22 42 0 14-10 24-22 24S38 82 38 68c0-10 6-14 8-24 4 4 6 8 6 12 2-10 2-20 8-30z"/><path d="M60 90c-8 0-13-6-12-14 1-7 7-9 9-16 6 6 15 12 14 20-1 6-5 10-11 10z" fill="#FFF1B8" stroke="none"/>',
    hearts: function () { return heart(50, 56, 1.5) + heart(71, 62, 1.25, '#FFD9E0'); },
    globe: '<circle cx="60" cy="60" r="29"/><path d="M31 60h58M60 31v58M60 31c-17 15-17 43 0 58M60 31c17 15 17 43 0 58M37 45h46M37 75h46" fill="none" stroke-width="1.4"/><g fill="#FFF3C9" stroke="none"><circle cx="46" cy="52" r="2.300"/><circle cx="72" cy="50" r="2.300"/><circle cx="60" cy="60" r="2.300"/><circle cx="50" cy="70" r="2.300"/><circle cx="70" cy="70" r="2.300"/><circle cx="42" cy="62" r="2.300"/><circle cx="78" cy="62" r="2.300"/></g>',
    swords: '<path d="M38 86C60 74 78 54 86 30 70 44 46 66 32 80z"/><path d="M82 86C60 74 42 54 34 30c16 14 40 36 54 50z"/><path d="M30 78l12 12M90 78 78 90" fill="none" stroke-width="5" stroke-linecap="round"/>',
    palette: '<path d="M60 32c18 0 30 12 30 26 0 10-8 14-16 12-6-2-10 2-8 8 2 6-2 10-8 10-16 0-28-12-28-28s14-28 30-28z"/><circle cx="48" cy="48" r="4.500" fill="#E0284A"/><circle cx="63" cy="43" r="4.500" fill="#3FBF8A"/><circle cx="77" cy="52" r="4.500" fill="#5B8DF5"/><circle cx="42" cy="63" r="4.500" fill="#FFD766"/>',
    book: '<path d="M60 44c-8-6-18-7-26-5v40c8-2 18-1 26 5 8-6 18-7 26-5V39c-8-2-18-1-26 5z"/><path d="M60 44v40M40 50c5-1 10 0 14 2M40 59c5-1 10 0 14 2M40 68c5-1 10 0 14 2M66 52c4-2 9-3 14-2M66 61c4-2 9-3 14-2M66 70c4-2 9-3 14-2" fill="none" stroke-width="1.4"/>',
    mask: '<path d="M36 40c16-6 32-6 48 0 2 26-8 46-24 52-16-6-26-26-24-52z"/><path d="M44 54c4-4 9-4 12 0-4 3-8 3-12 0zM64 54c3-4 8-4 12 0-4 3-9 3-12 0z" fill="' + D + '"/><path d="M48 72c8 8 16 8 24 0" fill="none" stroke-width="2.2" stroke-linecap="round"/>',
    planet: function () { return heart(60, 56, 1.9) + '<ellipse cx="60" cy="62" rx="36" ry="11" fill="none" stroke-width="3.2" transform="rotate(-20 60 62)"/><circle cx="88" cy="40" r="3" fill="#FFF3C9"/>'; },
    cup: '<path d="M40 36h40c0 20-8 30-16 33v10h10v7H46v-7h10V69c-8-3-16-13-16-33z"/><path d="M44 46c10 4 22 4 32 0" fill="none"/><polygon points="' + star(60, 26, 4, 7, 2.800) + '" fill="#FFF3C9"/>',
    lock: '<rect x="44" y="56" width="32" height="26" rx="5"/><path d="M50 56v-8a10 10 0 0 1 20 0v8" fill="none" stroke-width="4"/>'
  };
  var FRAME = star(60, 60, 8, 57, 47);
  function art(name, metal, size, label, locked) {
    var g = GLYPH[name] || GLYPH.lock, F = 'url(#m-' + (metal || 'gold') + ')';
    return '<svg class="medal' + (locked ? ' locked' : '') + '" viewBox="0 0 120 120" width="' + size + '" height="' + size + '" role="img" aria-label="' + esc(label || '') + '">' +
      '<polygon points="' + FRAME + '" fill="' + F + '" stroke="' + D + '" stroke-width="2"/><circle cx="60" cy="60" r="42" fill="#1E1535" stroke="' + D + '" stroke-width="2"/>' +
      '<circle cx="60" cy="60" r="38" fill="none" stroke="' + F + '" stroke-width="1.6" stroke-dasharray="0.100 6.530" stroke-linecap="round"/>' +
      '<g fill="' + F + '" stroke="' + D + '" stroke-width="1.6" stroke-linejoin="round" transform="translate(60 60) scale(.86) translate(-60 -60)">' + (typeof g === 'function' ? g() : g) + '</g></svg>';
  }

  /* ---------- short stories. "book" is what the Shahnameh tells; "game" is what we invented. ---------- */
  var STORIES = {
    rostam: { title: 'Rostam', book: 'The greatest hero of the Shahnameh, son of Zal and Rudabeh, from Sistan. He rides the horse Rakhsh, wears a tiger-skin coat and carries an ox-headed mace. He survives seven deadly trials to rescue his king, and in the poem’s most famous tragedy he kills his own son Sohrab in battle without knowing who he is.', game: 'The mace badge and the five-in-a-row streak are our own invention in his honour.' },
    zal: { title: 'Zal', book: 'Zal is born with snow-white hair. His father Sam, ashamed, leaves the baby on Mount Alborz, where the Simurgh finds him and raises him in her nest. Sam later repents and brings him home, and Zal grows into the wise ruler of Zabolestan.', game: 'Our couple’s badge borrows his name for everything you finish together.' },
    rudabeh: { title: 'Rudabeh', book: 'A princess of Kabul, daughter of King Mehrab. She and Zal fall in love by reputation before they ever meet. When he comes to her tower at night she lets down her long hair for him to climb; he refuses to hurt her and throws up a rope instead. Their son is Rostam.', game: 'Zal & Rudabeh is one of the great love stories of the poem, which is why the cooperative badge carries both names.' },
    simurgh: { title: 'The Simurgh', book: 'A vast, wise and kind bird who nests on Mount Alborz. She raises the abandoned Zal and gives him feathers to burn if he ever needs her. She comes at Rostam’s difficult birth, and again, many years later, to heal Rostam and Rakhsh and tell him how his rival Esfandiyar can be defeated.', game: 'Her feather marks our rarest moments: a comeback, and sixty victories.' },
    khosrow: { title: 'Kay Khosrow', book: 'Son of the murdered prince Siavash and of Farangis, daughter of Afrasiab, so he carries the blood of both Iran and Turan. Raised in hiding in Turan and brought to Iran by the hero Giv, he becomes the poem’s model of a just king. He owns a cup in which the whole world can be seen, and at the height of his power he gives up the throne and vanishes into a mountain snowstorm.', game: 'The hidden cup badge and the royal heir ranks are our own nod to him.' },
    afrasiab: { title: 'Afrasiab', book: 'King of Turan and the great adversary of Iran through much of the poem: powerful, clever and ruthless. He has his own son-in-law Siavash put to death, which starts the long war of revenge that ends when Kay Khosrow finally captures him.', game: 'We borrowed his cunning for the Trickster badge. No in-laws were harmed.' },
    irantu: { title: 'Iran and Turan', book: 'King Fereydun divides the world between his three sons: Salm receives the west, Tur the lands of the east beyond the river Oxus, and Iraj, the youngest, Iran. Out of envy Salm and Tur murder Iraj. From that crime grows the feud between Iran and Turan that fills the heroic part of the Shahnameh.', game: 'In our game the two kingdoms are equal, and the rivalry is settled with word games.' },
    sistan: { title: 'Sistan and Zabol', book: 'Sistan, also called Zabolestan in the poem, lies in the south-east around the Helmand river. It is the home of Sam, Zal and Rostam: a family of champions who rule their own land and ride out, again and again, to save the kings of Iran.', game: 'Guardian of Zabol and Prince or Princess of Sistan are titles we made up for the game.' },
    ferdowsi: { title: 'Ferdowsi and the Shahnameh', book: 'Abolqasem Ferdowsi of Tus finished the Shahnameh, the Book of Kings, around the year 1010 after some thirty years of work. It runs to roughly fifty thousand couplets, from the first king of the world to the Arab conquest of Iran, and it did more than any other book to keep the Persian language alive.', game: 'A fitting patron for whoever wins the most Esm Famil.' },
    miniature: { title: 'Painting the Book of Kings', book: 'For centuries rulers commissioned lavishly illustrated copies of the Shahnameh. The most famous, made for Shah Tahmasp in the sixteenth century, held 258 paintings by the best artists of the royal workshop.', game: 'Our badges are original drawings in that spirit, not copies of any manuscript.' }
  };
  function story(key) { var s = STORIES[key]; return s ? '<details class="lore"><summary>The story behind it</summary><p><b>' + s.title + ', in the Shahnameh.</b> ' + s.book + '</p><p class="note"><b>In our game.</b> ' + s.game + '</p></details>' : ''; }

  /* ---------- helpers ---------- */
  var KINGDOM = { iran: { name: 'Kingdom of Iran', art: 'lion', metal: 'gold' }, turan: { name: 'Kingdom of Turan', art: 'crown', metal: 'silver' } };
  var prof = function (i) { return { royal: S.players.royals[i], kingdom: S.players.kingdoms[i] === 'turan' ? 'turan' : 'iran' }; };
  var day = function (t) { return new Date(t).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }); };
  var when = function (t) { return new Date(t).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };
  var gameName = function (g) { return (O.views[g] || {}).title || g; };
  var bar = function (v, goal) { return '<div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="' + goal + '" aria-valuenow="' + Math.min(v, goal) + '"><i style="width:' + Math.min(100, Math.round(v / goal * 100)) + '%"></i></div>'; };
  function unlockName(u) { return u.kind === 'rank' ? R.rankTitle(R.rank(u.id), prof(u.p)) : R.achievement(u.id).name; }
  function describe(h) {
    if (h.t === 'unlock') return h.u.p < 0 ? 'Together you unlocked ' + unlockName(h.u) : T(h.u.p) + (h.u.kind === 'rank' ? ' rose to ' : ' earned ') + unlockName(h.u);
    if (h.t === 'match') return h.w < 0 ? gameName(h.g) + ' ended in a tie' + (h.sums ? ', ' + h.sums[0] + ' all' : '') : T(h.w) + ' won ' + gameName(h.g) + (h.sums ? ' ' + h.sums[h.w] + ' to ' + h.sums[1 - h.w] : '') + (h.fooled ? ' with a perfect lie' : '') + (h.comeback ? ' in a comeback' : '');
    if (h.t === 'coop') return 'You completed a secret mission together';
    if (h.t === 'adventure') return 'You finished an imaginary life in ' + h.country;
    if (h.t === 'draw') return T(h.drawer) + '’s drawing was guessed';
    return 'You answered a question card';
  }

  /* ---------- the Royal Hall ---------- */
  var tab = 'hall', TABS = [['hall', 'Royal Hall'], ['glory', 'My Achievements'], ['shared', 'Shared Glory'], ['history', 'Royal History'], ['legends', 'Legends']];

  function profile(i, s) {
    var p = s.players[i], pr = prof(i), k = KINGDOM[pr.kingdom], rank = R.rankOf(p), next = R.nextRank(p), mine = i === O.me();
    var earned = s.unlocks.filter(function (u) { return u.p === i || u.p < 0; });
    return '<section class="profile k-' + pr.kingdom + '" aria-label="' + esc(T(i)) + '"><div class="p-head">' + art(k.art, k.metal, 46, k.name) +
      '<div><p class="p-kingdom">' + k.name + '</p><h2>' + esc(T(i)) + (s.leader === i ? ' <span class="holder" title="Crown Holder: leading the head-to-head">👑</span>' : '') + '</h2></div></div>' +
      '<div class="p-rank">' + (rank ? art(rank.art, rank.metal, 104, rank.badge) : art('lock', 'bronze', 104, 'No crown yet', true)) +
      '<p class="p-title">' + (rank ? esc(R.rankTitle(rank, pr)) : 'Not yet crowned') + '</p><p class="p-sub">' + (rank ? rank.badge : 'Win a competitive round to earn the Bronze Shield') + '</p></div>' +
      '<dl class="stats4"><div><dt>Victories</dt><dd>' + p.wins + '</dd></div><div><dt>Losses</dt><dd>' + p.losses + '</dd></div><div><dt>Win streak</dt><dd>' + p.streak + '</dd></div><div><dt>Best streak</dt><dd>' + p.best + '</dd></div></dl>' +
      (next ? bar(p.wins, next.wins) + '<p class="p-sub">' + (next.wins - p.wins) + ' more ' + (next.wins - p.wins === 1 ? 'victory' : 'victories') + ' to ' + esc(R.rankTitle(next, pr)) + '</p>' : '<p class="p-sub">Every crown is won. The poets take over from here.</p>') +
      '<p class="p-sub">' + earned.length + ' ' + (earned.length === 1 ? 'badge' : 'badges') + ' unlocked</p><div class="thumbs">' + earned.slice(-8).map(function (u) { var d = u.kind === 'rank' ? R.rank(u.id) : R.achievement(u.id); return art(d.art, d.metal, 34, unlockName(u)); }).join('') + '</div>' +
      (mine ? '<div class="p-edit"><div class="row" role="group" aria-label="Your kingdom"><button class="chip" data-act="kingdom" data-k="iran" aria-pressed="' + (pr.kingdom === 'iran') + '">Iran</button><button class="chip" data-act="kingdom" data-k="turan" aria-pressed="' + (pr.kingdom === 'turan') + '">Turan</button></div>' +
        '<div class="row" role="group" aria-label="Your title">' + ['Prince', 'Princess', 'Champion'].map(function (t) { return '<button class="chip" data-act="royal" data-r="' + t + '" aria-pressed="' + (pr.royal === t) + '">' + t + '</button>'; }).join('') + '</div></div>' : '') + '</section>';
  }
  function medalCard(def, at, value, goal, title, extra) {
    var hid = def.hidden && !at;
    return '<li class="medal-card' + (at ? ' earned' : '') + (def.legendary && at ? ' legendary' : '') + '">' + (hid ? art('lock', 'bronze', 64, 'Hidden achievement', true) : art(def.art, def.metal, 64, title, !at)) +
      '<div><b>' + (hid ? 'A hidden achievement' : esc(title)) + '</b><small>' + (hid ? 'Keep playing together. It unlocks by doing something real, not by luck.' : esc(extra)) + '</small>' +
      (at ? '<small class="got">Unlocked ' + day(at) + '</small>' : bar(value, goal) + '<small>' + Math.min(value, goal) + ' of ' + goal + '</small>') + (hid ? '' : story(def.story)) + '</div></li>';
  }
  function glory(i, s) {
    var p = s.players[i], pr = prof(i);
    return '<div class="card"><p><b>' + esc(T(i)) + '</b> <span class="note">royal ranks</span></p><ul class="medals">' + R.RANKS.map(function (r) { return medalCard(r, p.ranks[r.id], p.wins, r.wins, R.rankTitle(r, pr), r.badge + ' · ' + r.wins + (r.wins === 1 ? ' victory' : ' victories')); }).join('') + '</ul>' +
      '<p><b>Individual glory</b></p><ul class="medals">' + R.ACHIEVEMENTS.filter(function (a) { return a.scope === 'individual'; }).map(function (a) { return medalCard(a, p.ach[a.id], a.value(s, i), a.goal, a.name, a.desc); }).join('') + '</ul></div>';
  }

  O.views.hall = {
    emoji: '👑', title: 'The Royal Hall', sub: '', accent: 'gold', deps: ['events', 'players', 'challenge'],
    how: 'The Crowns of Shahnameh: two rival kingdoms, one long and friendly war.',
    render: function (root) {
      var s = O.royal(), me = O.me(), body;
      var tabs = '<div class="tabs" role="tablist">' + TABS.map(function (t) { return '<button role="tab" class="tab" data-act="tab" data-t="' + t[0] + '" aria-selected="' + (tab === t[0]) + '">' + t[1] + '</button>'; }).join('') + '</div>';
      if (tab === 'glory') body = glory(me, s) + glory(1 - me, s);
      else if (tab === 'shared') body = '<div class="card"><p><b>Shared glory</b> <span class="note">earned together, unlocked for both of you</span></p><dl class="stats4"><div><dt>Adventures together</dt><dd>' + s.shared.activities + '</dd></div><div><dt>Cooperative</dt><dd>' + s.shared.coop + '</dd></div><div><dt>Matches</dt><dd>' + s.shared.matches + '</dd></div><div><dt>Countries</dt><dd>' + s.shared.countries.length + '</dd></div></dl><ul class="medals">' +
        R.ACHIEVEMENTS.filter(function (a) { return a.scope === 'shared'; }).map(function (a) { return medalCard(a, s.shared.ach[a.id], a.value(s, 0), a.goal, a.name, a.desc); }).join('') + '</ul></div>';
      else if (tab === 'history') { var h = s.history.slice(-80).reverse(); body = '<div class="card">' + (h.length ? '<ol class="chron">' + h.map(function (x) { return '<li class="' + (x.t === 'unlock' ? 'unlock' : '') + '"><span>' + esc(describe(x)) + '</span><small>' + when(x.at) + '</small></li>'; }).join('') + '</ol>' : '<p class="soft center">The chronicle is empty. Play a round and the scribes will start writing.</p>') + '</div>'; }
      else if (tab === 'legends') body = '<p class="note center">Short introductions to the people and places behind the badges. The stories are from Ferdowsi’s Shahnameh; the ranks, badges and rules are fiction made for this game.</p>' + ['irantu', 'sistan', 'zal', 'rudabeh', 'simurgh', 'rostam', 'khosrow', 'afrasiab', 'ferdowsi', 'miniature'].map(function (k) { var x = STORIES[k]; return '<div class="card legend"><h2>' + x.title + '</h2><p>' + x.book + '</p><p class="note"><b>In our game.</b> ' + x.game + '</p></div>'; }).join('');
      else {
        var wins = s.history.filter(function (x) { return x.t === 'match' && x.w >= 0; }).slice(-5).reverse(), ul = s.unlocks.slice(-5).reverse();
        body = '<div class="profiles">' + profile(0, s) + profile(1, s) + '</div>' +
          '<div class="card"><p><b>Head to head</b> <span class="note">' + (s.leader < 0 ? (s.shared.matches ? 'Level. The crown waits.' : 'No battles yet') : esc(T(s.leader)) + ' holds the crown') + '</span></p><table class="board"><thead><tr><th scope="col">Battle</th><th scope="col">' + esc(N(0)) + '</th><th scope="col">' + esc(N(1)) + '</th><th scope="col">Ties</th></tr></thead><tbody>' +
          R.COMPETITIVE.map(function (g) { var b = s.h2h.byGame[g]; return '<tr><th scope="row">' + O.views[g].emoji + ' ' + gameName(g) + '</th><td>' + b.wins[0] + '</td><td>' + b.wins[1] + '</td><td>' + b.ties + '</td></tr>'; }).join('') +
          '<tr class="total"><th scope="row">All battles</th><td>' + s.h2h.wins[0] + '</td><td>' + s.h2h.wins[1] + '</td><td>' + s.h2h.ties + '</td></tr></tbody></table>' +
          '<p class="note">Issue a royal challenge:</p><div class="row">' + R.COMPETITIVE.map(function (g) { return '<button class="btn small ghost" data-act="challenge" data-g="' + g + '">' + O.views[g].emoji + ' ' + gameName(g) + '</button>'; }).join('') + '</div></div>' +
          '<div class="card"><p><b>Together</b></p><dl class="stats4"><div><dt>Adventures together</dt><dd>' + s.shared.activities + '</dd></div><div><dt>Cooperative</dt><dd>' + s.shared.coop + '</dd></div><div><dt>Shared badges</dt><dd>' + Object.keys(s.shared.ach).length + '</dd></div><div><dt>Countries</dt><dd>' + s.shared.countries.length + '</dd></div></dl></div>' +
          '<div class="card"><p><b>Recent victories</b></p>' + (wins.length ? '<ol class="chron">' + wins.map(function (x) { return '<li><span>' + esc(describe(x)) + '</span><small>' + when(x.at) + '</small></li>'; }).join('') + '</ol>' : '<p class="soft">None yet. Two Truths, versus Missions and Esm Famil count.</p>') +
          '<p><b>Recent badges</b></p>' + (ul.length ? '<ul class="trophies">' + ul.map(function (u) { var d = u.kind === 'rank' ? R.rank(u.id) : R.achievement(u.id); return '<li>' + art(d.art, d.metal, 56, unlockName(u)) + '<span>' + esc(unlockName(u)) + '<small>' + (u.p < 0 ? 'Both of you' : esc(N(u.p))) + ' · ' + day(u.at) + '</small></span></li>'; }).join('') + '</ul>' : '<p class="soft">Your trophy shelf is still empty.</p>') + '</div>';
      }
      root.innerHTML = O.shell(this, tabs + body);
    },
    acts: {
      tab: function (el) { tab = el.dataset.t; O.render(); },
      kingdom: function (el) { var k = S.players.kingdoms.slice(); k[O.me()] = el.dataset.k; O.patch('players', { kingdoms: k }); },
      royal: function (el) { var r = S.players.royals.slice(); r[O.me()] = el.dataset.r; O.patch('players', { royals: r }); }
    }
  };

  /* ---------- the Royal Promotion Ceremony ---------- */
  var queue = [], showing = false, cur = null, RECENT = 10 * 60 * 1000;
  function checkUnlocks() {
    var s = O.royal(), seen = O.lsGet('seen', null), first = !seen, map = {};
    (seen || []).forEach(function (k) { map[k] = 1; });
    s.unlocks.forEach(function (u) { if (map[u.key]) return; map[u.key] = 1; if (!first && Date.now() - u.at < RECENT) queue.push(u); });
    O.lsSet('seen', Object.keys(map)); if (!showing) nextCeremony();
  }
  function nextCeremony() {
    var u = queue.shift(), box = $('#ceremony'); if (!u) { showing = false; box.hidden = true; box.textContent = ''; return; }
    showing = true; cur = u;
    var rank = u.kind === 'rank', d = rank ? R.rank(u.id) : R.achievement(u.id), me = O.me();
    var eyebrow = u.p < 0 ? '💞 Shared glory' : u.p !== me ? 'News from the rival kingdom' : rank ? '👑 A new ruler rises' : '✨ A legend is written';
    var line = rank ? d.wins + (d.wins === 1 ? ' victory' : ' victories') + ' achieved!' : d.desc;
    var cheer = rank ? d.cheer : u.p < 0 ? 'Both kingdoms celebrate. For one evening, there is peace.' : 'The scribes have added a new page to your legend.';
    box.innerHTML = '<div class="cer-box' + (d.legendary ? ' legendary' : '') + '" role="dialog" aria-modal="true" aria-labelledby="cer-title"><p class="eyebrow">' + eyebrow + '</p><div class="cer-art">' + art(d.art, d.metal, 150, unlockName(u)) + '</div>' +
      '<p class="cer-name">' + (u.p < 0 ? esc(N(0)) + ' & ' + esc(N(1)) : esc(T(u.p))) + '</p><h2 id="cer-title">' + esc(unlockName(u)) + '</h2><p>' + esc(line) + '</p><p class="soft">' + esc(u.p >= 0 && u.p !== me ? T(u.p) + ' will be unbearable about this.' : cheer) + '</p>' +
      '<div class="row mid"><button class="btn" data-cer="view">View in the Royal Hall</button><button class="btn ghost" data-cer="close">Continue playing</button></div></div>';
    box.hidden = false; if (u.p === me || u.p < 0) O.celebrate();
    var b = box.querySelector('[data-cer="close"]'); if (b) b.focus();
  }
  function closeCeremony(view) { if (view) { tab = view; queue.length = 0; if (window.location.hash === '#hall') O.render(); else window.location.hash = 'hall'; } nextCeremony(); }

  /* ---------- royal challenges and rematches ---------- */
  var OPEN = 15 * 60 * 1000;
  O.banner = function () {
    var c = S.challenge, me = O.me(); if (!c || !c.id || Date.now() - c.at > OPEN || !O.views[c.game]) return '';
    var g = O.views[c.game].emoji + ' ' + gameName(c.game), inner = '';
    if (c.state === 'open' && c.from !== me) inner = '<p><b>' + (c.rematch ? '“Your Majesty, your kingdom demands revenge!” ' + esc(T(c.from)) + ' wants a rematch.' : esc(T(c.from)) + ' challenges ' + esc(T(me)) + ' to a battle for the crown!') + '</b></p><p class="note">' + g + '</p><div class="row"><button class="btn small" data-act="accept">Accept the challenge</button><button class="btn small ghost" data-act="decline">Not now</button></div>';
    else if (c.state === 'open') inner = '<p><b>Your challenge has been sent to ' + esc(T(1 - me)) + '.</b></p><p class="note">' + g + ' · waiting for an answer</p><div class="row"><button class="btn small ghost" data-act="withdraw">Withdraw</button></div>';
    else if (c.state === 'accepted' && c.from === me) inner = '<p><b>' + esc(T(1 - me)) + ' accepts your challenge!</b></p><div class="row"><a class="btn small" href="#' + c.game + '" data-act="withdraw">To the battlefield</a></div>';
    else if (c.state === 'declined' && c.from === me) inner = '<p><b>' + esc(T(1 - me)) + ' declines, for now.</b></p><div class="row"><button class="btn small ghost" data-act="withdraw">Very well</button></div>';
    return inner ? '<div id="banner" class="banner" role="status">' + inner + '</div>' : '';
  };
  O.rematchRow = function (game) {
    var s = O.royal(), last = null, c = S.challenge;
    s.history.forEach(function (h) { if (h.t === 'match' && h.g === game) last = h; });
    if (!last || last.w !== 1 - O.me() || (c.id && c.state === 'open' && Date.now() - c.at < OPEN)) return '';
    return '<div class="revenge"><p>“Your Majesty, your kingdom demands revenge!”</p><button class="btn small" data-act="challenge" data-g="' + game + '" data-rematch="1">Demand a rematch</button></div>';
  };
  O.acts = {
    challenge: function (el) { O.save('challenge', { id: O.uid(), from: O.me(), game: el.dataset.g, rematch: !!el.dataset.rematch, at: Date.now(), state: 'open' }); O.toast('Challenge sent to ' + T(1 - O.me())); },
    accept: function () { var g = S.challenge.game; O.patch('challenge', { state: 'accepted' }); window.location.hash = g; },
    decline: function () { O.patch('challenge', { state: 'declined' }); },
    withdraw: function () { O.patch('challenge', { state: '' }); }
  };

  O.onDoc = function (name) { if (name === 'events') checkUnlocks(); };
  O.boot = function () {
    $('#ceremony').addEventListener('click', function (e) { var b = e.target.closest('[data-cer]'); if (b) closeCeremony(b.dataset.cer === 'view' ? (cur && cur.p < 0 ? 'shared' : 'glory') : null); else if (e.target.id === 'ceremony') closeCeremony(null); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && showing) closeCeremony(null); });
    checkUnlocks();
  };
  O.art = art;
})();
