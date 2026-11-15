/* Where is Prince Mohsey? — the website. Everything that matters (letters, clocks, scores, points,
   levels, badges) is decided by the game server; this file shows it and sends your answers and votes. */
(function () {
  'use strict';
  var API = String((window.WPM_CONFIG || {}).serverUrl || '').replace(/\/+$/, '');
  var art = window.WPM_ART;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var num = function (n) { return Number(n || 0).toLocaleString('en'); };
  function lsGet(k) { try { return window.localStorage.getItem('wpm:' + k); } catch (e) { return null; } }
  function lsSet(k, v) { try { if (v == null) window.localStorage.removeItem('wpm:' + k); else window.localStorage.setItem('wpm:' + k, v); } catch (e) { /* fine */ } }

  var app, key = lsGet('key'), me = null, meta = null, toastTimer = 0;
  var table = null, es = null, offset = 0, mine = {}, sendTimer = 0, lastResults = '', armed = '', mode = 'new';
  var SITE = location.origin + location.pathname;
  function shareRow(text, url) {   // WhatsApp link works everywhere; the phone's own share sheet is offered where it exists
    return '<div class="row"><a class="btn small wa" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent(text + ' ' + url) + '">Share on WhatsApp</a>' + (navigator.share ? '<button type="button" class="btn small ghost" data-act="share" data-text="' + esc(text) + '" data-url="' + esc(url) + '">Share another way</button>' : '') + '</div>';
  }

  /* ---------- server ---------- */
  function api(method, path, body) {
    var h = {}; if (key) h.Authorization = 'Bearer ' + key; if (body) h['Content-Type'] = 'application/json';
    var ctl = window.AbortController ? new AbortController() : null, timer = ctl ? setTimeout(function () { ctl.abort(); }, 15000) : 0;   // never wait forever
    return fetch(API + path, { method: method, headers: h, body: body ? JSON.stringify(body) : undefined, cache: 'no-store', signal: ctl ? ctl.signal : undefined }).then(function (r) {
      clearTimeout(timer);
      return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var e = new Error(j.error || 'The server said no (' + r.status + ').'); e.status = r.status; throw e; } return j; });
    }, function (e) { clearTimeout(timer); throw new Error(e && e.name === 'AbortError' ? 'The game server is not answering. Try again in a moment.' : 'The game server cannot be reached. Check your connection and try again.'); });
  }
  function fail(e) { toast(e.message || 'Something went wrong.'); }
  function setMe(m) { me = m; var w = $('#who'); w.hidden = !me; if (me) { w.textContent = ''; w.appendChild(document.createTextNode(me.name)); } }
  function refreshMe() {
    return api('GET', '/api/me').then(function (j) {
      setMe(j.me);
      if (me.news && me.news.length) { ceremony(me.news); api('POST', '/api/news').catch(function () { /* shown again next time */ }); }   // what the referee's verdict unlocked
      return j.me;
    });
  }
  var clock = function () { return meta && meta.referee ? meta.referee.at : '22:00'; };
  function refereeLine(p) {
    var out = '';
    if (p.pendingRounds) out += '<p class="referee">⚖️ <b>' + num(p.pending) + ' points</b> from ' + p.pendingRounds + (p.pendingRounds === 1 ? ' round are' : ' rounds are') + ' waiting for the referee, who checks every answer tonight at ' + clock() + '. They count after that.</p>';
    var v = p.verdict;
    if (v) out += '<details class="verdict"><summary>Last verdict, ' + new Date(v.at).toLocaleDateString([], { day: 'numeric', month: 'short' }) + ': ' + num(v.points) + ' of ' + num(v.claimed) + ' points accepted' + (v.struck.length ? ', ' + v.struck.length + (v.struck.length === 1 ? ' answer' : ' answers') + ' struck' : '') + '</summary>' +
      (v.struck.length ? '<ul>' + v.struck.map(function (x) { var c = catOf(x.cat); return '<li><b dir="auto">' + esc(x.text) + '</b> <small>' + (c ? c.en : esc(x.cat)) + (x.why ? ': ' + esc(x.why) : '') + '</small></li>'; }).join('') + '</ul>' : '<p class="note">Every answer was accepted.</p>') + '</details>';
    return out;
  }
  function sync(s) { var el = $('#sync'); el.dataset.s = s; el.textContent = s === 'live' ? 'Online' : s === 'error' ? 'Offline' : ''; }

  /* ---------- small ui ---------- */
  function toast(msg) { var t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 3200); }
  function celebrate() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var c = $('#fx'), g = c.getContext('2d'), w = c.width = window.innerWidth, h = c.height = window.innerHeight, cols = ['#F58FA9', '#F3C56E', '#7FD8C4', '#93BBFF', '#BDA3FF'], ps = [], t0 = performance.now();
    for (var i = 0; i < 80; i++) ps.push({ x: w / 2, y: h * .42, vx: (Math.random() - .5) * 12, vy: -Math.random() * 12 - 2, r: 3 + Math.random() * 4, c: cols[i % cols.length] });
    (function step(t) { var age = (t - t0) / 1500; g.clearRect(0, 0, w, h); if (age >= 1) return; ps.forEach(function (p) { p.x += p.vx; p.y += p.vy; p.vy += .32; g.globalAlpha = 1 - age; g.fillStyle = p.c; g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill(); }); requestAnimationFrame(step); })(t0);
  }
  var royalName = function (p) { return (p.royal && p.royal !== 'Champion' ? p.royal + ' ' : '') + p.name; };
  var rankDef = function (id) { return meta.ranks.filter(function (r) { return r.id === id; })[0]; };
  var achDef = function (id) { return meta.achievements.filter(function (a) { return a.id === id; })[0]; };
  var KINGDOMS = [{ id: 'iran', name: 'Iran', heir: 'Iraj', art: 'lion', metal: 'gold' }, { id: 'turan', name: 'Turan', heir: 'Tur', art: 'crown', metal: 'silver' }, { id: 'rum', name: 'Rum', heir: 'Salm', art: 'shield', metal: 'ruby' }];
  var kingdom = function (id) { return KINGDOMS.filter(function (k) { return k.id === id; })[0] || KINGDOMS[0]; };
  var kingdomChips = function (act, cur) { return '<div class="row" role="group" aria-label="Kingdom">' + KINGDOMS.map(function (k) { return '<button type="button" class="chip" data-act="' + act + '" data-f="kingdom" data-v="' + k.id + '" aria-pressed="' + (cur === k.id) + '">' + (act === 'pick' ? 'Kingdom of ' : '') + k.name + '</button>'; }).join('') + '</div>'; };
  var rankTitle = function (r, p) { return r.title.replace('{royal}', p.royal && p.royal !== 'Champion' ? p.royal : 'Champion').replace('{kingdom}', kingdom(p.kingdom).name); };
  var medal = function (p, size) { var r = p.rank && rankDef(p.rank); return r ? art(r.art, r.metal, size, r.badge) : art('lock', 'bronze', size, 'No crown yet', true); };
  var bar = function (v, goal) { return '<div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="' + goal + '" aria-valuenow="' + Math.min(v, goal) + '"><i style="width:' + (goal ? Math.min(100, Math.round(v / goal * 100)) : 100) + '%"></i></div>'; };
  var levelOf = function (n) { return meta.levels[n - 1]; };
  var catOf = function (id) { return meta.categories.filter(function (c) { return c.id === id; })[0]; };
  var back = '<a class="back" href="#home">← Home</a>';
  function levelLine(p) {
    if (p.level >= meta.levels.length) return '<p class="turn">All seven chapters are open. The last one is still being written.</p>';
    var L = levelOf(p.level + 1);
    return bar(p.levelPoints, p.need) + '<p class="note">' + (p.quizReady ? 'Chapter ' + L.n + ' is open. Read the story, then pass the quiz.' : num(p.levelPoints) + ' of ' + num(p.need) + ' points to chapter ' + L.n + ': ' + esc(L.title)) + '</p>';
  }

  /* ---------- ceremony for new ranks and badges ---------- */
  var queue = [];
  function ceremony(list) { (list || []).forEach(function (u) { queue.push(u); }); if ($('#ceremony').hidden) nextCeremony(); }
  function nextCeremony() {
    var u = queue.shift(), box = $('#ceremony'); if (!u) { box.hidden = true; box.textContent = ''; return; }
    var d = u.kind === 'rank' ? rankDef(u.id) : u.kind === 'ach' ? achDef(u.id) : null, title, eyebrow, line, a;
    if (u.kind === 'level') { title = 'Chapter ' + u.n + ': ' + levelOf(u.n).title; eyebrow = '📜 A chapter is yours'; line = 'You passed the quiz. The story stays open to you from now on.'; a = art('book', 'gold', 150, title); }
    else { title = u.kind === 'rank' ? rankTitle(d, me) : d.name; eyebrow = u.kind === 'rank' ? '👑 A new ruler rises' : '✨ A legend is written'; line = u.kind === 'rank' ? d.wins + (d.wins === 1 ? ' victory' : ' victories') + ' achieved!' : d.desc; a = art(d.art, d.metal, 150, title); }
    box.innerHTML = '<div class="cer-box' + (d && d.legendary ? ' legendary' : '') + '" role="dialog" aria-modal="true" aria-labelledby="cer-title"><p class="eyebrow">' + eyebrow + '</p><div class="cer-art">' + a + '</div><p class="cer-name">' + esc(royalName(me)) + '</p><h2 id="cer-title">' + esc(title) + '</h2><p>' + esc(line) + '</p>' +
      '<div class="row mid"><a class="btn" href="#me" data-cer="close">See my badges</a><button class="btn ghost" data-cer="close">Continue</button></div></div>';
    box.hidden = false; celebrate(); var b = box.querySelector('button'); if (b) b.focus();
  }

  /* ---------- views ---------- */
  var views = {};

  views.welcome = function () {
    var isNew = mode === 'new';
    app.innerHTML = '<section class="hero">' + window.WPM_PRINCE(112) + '<p class="eyebrow">A word game from the Book of Kings</p><h1>Where is <em>Prince Mohsey?</em></h1><p class="soft">Play Esm Famil with friends, earn crowns from the Shahnameh, and unlock the life of Rostam chapter by chapter.</p></section>' +
      '<div class="seg" role="group" aria-label="Account"><button class="chip" data-act="mode" data-m="new" aria-pressed="' + isNew + '">New player</button><button class="chip" data-act="mode" data-m="login" aria-pressed="' + !isNew + '">I have an account</button></div>' +
      '<form class="card" data-form="' + (isNew ? 'register' : 'login') + '"><div class="field"><label for="w-name">' + (isNew ? 'Your name in the kingdom' : 'Your name') + '</label><input id="w-name" type="text" maxlength="20" autocomplete="username" placeholder="For example: Sufi"></div>' +
      '<div class="field"><label for="w-pass">Password</label><input id="w-pass" type="password" maxlength="100" autocomplete="' + (isNew ? 'new-password' : 'current-password') + '" placeholder="' + (isNew ? 'At least 6 characters' : '') + '"></div>' +
      (isNew ? '<p><b>Choose your kingdom</b></p>' + window.WPM_MAP() +
        kingdomChips('pick', 'iran') +
        '<div class="row" role="group" aria-label="Title">' + ['Champion', 'Prince', 'Princess'].map(function (t, i) { return '<button type="button" class="chip" data-act="pick" data-f="royal" data-v="' + t + '" aria-pressed="' + (i === 0) + '">' + t + '</button>'; }).join('') + '</div>' +
        '<button class="btn big" type="submit">Enter the kingdom</button><p class="note">Your name and password sign you in on any phone or computer, with all your points, crowns and chapters.</p>'
        : '<button class="btn big" type="submit">Sign in</button><p class="note">Your points, crowns and chapters are waiting.</p>') + '</form>';
  };

  views.home = function () {
    app.innerHTML = '<section class="card me-card"><div class="row split"><div class="row">' + medal(me, 64) + '<div><h1 class="me-name">' + esc(royalName(me)) + '</h1><p class="soft">' + esc(me.title || 'Not yet crowned') + ' · chapter ' + me.level + ' of ' + meta.levels.length + '</p></div></div><a class="btn small ghost" href="#me">Profile</a></div>' +
      levelLine(me) + refereeLine(me) + (me.quizReady ? '<a class="btn" href="#level-' + (me.level + 1) + '">Read chapter ' + (me.level + 1) + ' and take the quiz</a>' : '') +
      '<dl class="stats4"><div><dt>Points</dt><dd>' + num(me.total) + '</dd></div><div><dt>Victories</dt><dd>' + me.wins + '</dd></div><div><dt>Rounds</dt><dd>' + me.rounds + '</dd></div><div><dt>Best streak</dt><dd>' + me.best + '</dd></div></dl></section>' +
      '<section class="card"><h2>Play Esm Famil</h2><p class="soft">One letter, a handful of categories, and a clock. Unique answers score ' + meta.points.unique + ', shared answers ' + meta.points.shared + '.</p><button class="btn big" data-act="create">Start a table</button>' +
      '<form class="inline" data-form="join"><label class="sr" for="h-code">Table code</label><input id="h-code" type="text" maxlength="5" autocapitalize="characters" autocomplete="off" placeholder="Table code"><button class="btn ghost" type="submit">Join</button></form>' +
      '<div id="h-tables"><p class="note">Looking for open tables…</p></div></section>' +
      '<section class="card"><div class="row split"><h2>Leaderboard</h2><a class="btn small ghost" href="#leaders">See everyone</a></div><div id="h-leaders"><p class="note">Loading…</p></div></section>' +
      '<section class="card"><h2>Bring your friends</h2><p class="soft">The more players at the table, the better the game.</p>' + shareRow('Come and play Esm Famil with me in “Where is Prince Mohsey?”', SITE) + '</section>' +
      '<section class="card legend-intro"><p class="eyebrow">How the three kingdoms began</p><h2>Fereydun divides the world</h2>' +
      '<p>In the Shahnameh, the old king Fereydun splits the world among his three sons. Salm, the eldest, receives Rum, the West. Tur receives Turan and China, to the north-east and east. Iraj, the youngest, receives Iran, the heart of it all.</p>' +
      '<p>Jealous of their brother’s share, Salm and Tur murder Iraj, and from that crime grows the long war between Iran and Turan that fills the age of heroes, and the life of Rostam.</p>' +
      '<p class="note">You belong to the Kingdom of ' + kingdom(me.kingdom).name + ', the realm of ' + kingdom(me.kingdom).heir + '.</p>' +
      '<details class="map-more"><summary>Show the map</summary>' + window.WPM_MAP() + '</details></section>' +
      '<a class="book-link hall-link" href="#journey"><span><b>📜 The life of Rostam</b><br><span class="note">Seven chapters to unlock, and one still to come</span></span><span aria-hidden="true">→</span></a>';
    api('GET', '/api/rooms').then(function (j) {
      var box = $('#h-tables'); if (!box) return;
      box.innerHTML = j.tables.length ? '<p class="note">Open tables</p><ul class="tables">' + j.tables.map(function (t) { return '<li><span><b>' + esc(t.players.join(', ')) + '</b><small>' + (t.phase === 'lobby' ? 'Waiting to start' : 'Playing now') + '</small></span><a class="btn small" href="#table-' + t.code + '">Join</a></li>'; }).join('') + '</ul>' : '<p class="note">No open tables right now. Start one and share the link.</p>';
    }).catch(function () { var b = $('#h-tables'); if (b) b.textContent = ''; });
    api('GET', '/api/leaderboard').then(function (j) { var box = $('#h-leaders'); if (box) box.innerHTML = board(j.players.slice(0, 5)); }).catch(function () { /* shown elsewhere */ });
  };

  function board(list) {
    if (!list.length) return '<p class="note">Nobody yet. Be the first name in the book.</p>';
    return '<div class="scroll"><table class="board leaders"><thead><tr><th scope="col">#</th><th scope="col">Player</th><th scope="col">Chapter</th><th scope="col">Points</th><th scope="col">Wins</th></tr></thead><tbody>' +
      list.map(function (p, i) { return '<tr' + (me && p.id === me.id ? ' class="you"' : '') + '><td>' + (p.place || i + 1) + '</td><th scope="row"><span class="who-cell">' + medal(p, 30) + '<span>' + esc(royalName(p)) + '<small>' + esc(p.title || 'Not yet crowned') + ' · ' + kingdom(p.kingdom).name + '</small></span></span></th><td>' + p.level + '</td><td>' + num(p.total) + '</td><td>' + p.wins + '</td></tr>'; }).join('') + '</tbody></table></div>';
  }
  var findTimer = 0;
  function findPlayers() {
    var q = ($('#l-find') || {}).value || '';
    api('GET', '/api/leaderboard' + (q.trim() ? '?q=' + encodeURIComponent(q.trim()) : '')).then(function (j) {
      var b = $('#l-box'); if (!b) return;
      b.innerHTML = '<p class="note">' + (j.query ? (j.players.length ? j.players.length + (j.players.length === 1 ? ' player matches' : ' players match') + ' “' + esc(j.query) + '”' : 'Nobody called “' + esc(j.query) + '” yet.') : j.total + (j.total === 1 ? ' player' : ' players') + ' from every table' + (j.total > j.players.length ? ', top ' + j.players.length + ' shown' : '')) + '</p>' + (j.players.length ? board(j.players) : '');
    }).catch(fail);
  }
  views.leaders = function () {
    app.innerHTML = back + '<h1>Leaderboard</h1><p class="soft">Everyone from every table, ranked by chapter reached, then lifetime points, then victories.</p>' +
      '<div class="field"><label for="l-find">Find a player</label><input id="l-find" type="search" maxlength="20" autocomplete="off" placeholder="Type a name"></div>' +
      '<div class="card" id="l-box"><p class="note">Loading…</p></div>';
    $('#l-find').addEventListener('input', function () { clearTimeout(findTimer); findTimer = setTimeout(findPlayers, 250); });
    findPlayers();
  };

  views.journey = function () {
    app.innerHTML = back + '<h1>The life of Rostam</h1><p class="soft">Earn the points for a chapter, read its story, then pass a quiz of ' + meta.quiz.size + ' questions (' + meta.quiz.pass + ' right) to keep it. Fail the quiz and the points for that chapter are lost.</p><ol class="chapters">' +
      meta.levels.map(function (L) {
        var passed = L.n <= me.level, open = L.n === me.level + 1 && me.quizReady, current = L.n === me.level + 1;
        return '<li class="chapter' + (passed ? ' passed' : open ? ' open' : current ? ' current' : ' locked') + '"><span class="ch-n">' + (passed ? '✓' : L.n) + '</span><div><b>' + esc(L.title) + '</b><small>' + esc(L.teaser) + '</small>' +
          (passed ? '<a class="btn small ghost" href="#level-' + L.n + '">Read again</a>' : open ? '<a class="btn small" href="#level-' + L.n + '">Read the story and take the quiz</a>' : current ? bar(me.levelPoints, me.need) + '<small>' + num(me.levelPoints) + ' of ' + num(L.points) + ' points</small>' : '<small>Needs ' + num(L.points) + ' points after chapter ' + (L.n - 1) + '</small>') + '</div></li>';
      }).join('') + '<li class="chapter locked final">' + window.WPM_PRINCE(56) + '<div><b>Where is Prince Mohsey?</b><small>The last chapter is still being written.</small></div></li></ol>';
  };

  var quiz = null;
  views.level = function (n) {
    app.innerHTML = '<a class="back" href="#journey">← All chapters</a><div class="card"><p class="note">Opening the chapter…</p></div>'; quiz = null;
    api('GET', '/api/story/' + n).then(function (s) {
      if (location.hash !== '#level-' + n) return;
      app.innerHTML = '<a class="back" href="#journey">← All chapters</a><article class="card story"><p class="eyebrow">Chapter ' + s.n + '</p><h1>' + esc(s.title) + '</h1>' +
        (s.video ? '<video controls preload="metadata" src="' + esc(s.video) + '"></video>' : '') + s.story.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('') +
        (s.sources.length ? '<p class="note">Retold from the Shahnameh of Ferdowsi. ' + s.sources.map(esc).join(' · ') + '</p>' : '') + '</article>' +
        (s.passed ? '<p class="turn center">You have passed this chapter.</p>' : '<div class="card center" id="q-box"><h2>Ready for the quiz?</h2><p class="soft">' + meta.quiz.size + ' questions about this story. You need ' + meta.quiz.pass + ' right. If you fall short, the points you gathered for this chapter are lost and you earn them again.</p><div class="row mid"><button class="btn" data-act="quiz">Take the quiz</button></div></div>');
    }).catch(function (e) { app.innerHTML = '<a class="back" href="#journey">← All chapters</a><div class="card feature"><p class="big-text">' + esc(e.message) + '</p></div>'; });
  };
  function showQuiz(q) {
    quiz = q;
    $('#q-box').outerHTML = '<form class="card" id="q-box" data-form="quiz"><h2>Chapter ' + q.level + ' quiz</h2>' + q.questions.map(function (x, i) {
      return '<fieldset class="q"><legend>' + (i + 1) + '. ' + esc(x.q) + '</legend>' + x.options.map(function (o, k) { return '<label><input type="radio" name="q' + i + '" id="q' + i + '-' + k + '" value="' + k + '"> ' + esc(o) + '</label>'; }).join('') + '</fieldset>';
    }).join('') + '<button class="btn" type="submit">Hand in my answers</button></form>';
    $('#q-box').scrollIntoView({ block: 'start' });
  }

  views.me = function () {
    var earnedR = meta.ranks.filter(function (r) { return me.ranks[r.id]; }).length;
    app.innerHTML = back + '<section class="profile k-' + me.kingdom + '"><div class="p-head">' + art(kingdom(me.kingdom).art, kingdom(me.kingdom).metal, 46, 'Kingdom of ' + kingdom(me.kingdom).name) + '<div><p class="p-kingdom">Kingdom of ' + kingdom(me.kingdom).name + ', the realm of ' + kingdom(me.kingdom).heir + '</p><h2>' + esc(royalName(me)) + '</h2></div></div>' +
      '<div class="p-rank">' + medal(me, 104) + '<p class="p-title">' + esc(me.title || 'Not yet crowned') + '</p></div>' +
      '<dl class="stats4"><div><dt>Victories</dt><dd>' + me.wins + '</dd></div><div><dt>Rounds</dt><dd>' + me.rounds + '</dd></div><div><dt>Win streak</dt><dd>' + me.streak + '</dd></div><div><dt>Best streak</dt><dd>' + me.best + '</dd></div></dl>' +
      '<div class="p-edit">' + kingdomChips('profile', me.kingdom) +
      '<div class="row" role="group" aria-label="Title">' + ['Champion', 'Prince', 'Princess'].map(function (t) { return '<button class="chip" data-act="profile" data-f="royal" data-v="' + t + '" aria-pressed="' + (me.royal === t) + '">' + t + '</button>'; }).join('') + '</div></div></section>' +
      '<div class="card"><p><b>Royal ranks</b> <span class="note">' + earnedR + ' of ' + meta.ranks.length + ', earned by victories</span></p><ul class="medals">' + meta.ranks.map(function (r) { var at = me.ranks[r.id]; return '<li class="medal-card' + (at ? ' earned' : '') + (at && r.legendary ? ' legendary' : '') + '">' + art(r.art, r.metal, 64, r.badge, !at) + '<div><b>' + esc(rankTitle(r, me)) + '</b><small>' + r.badge + ' · ' + r.wins + (r.wins === 1 ? ' victory' : ' victories') + '</small>' + (at ? '<small class="got">Unlocked ' + new Date(at).toLocaleDateString() + '</small>' : bar(me.wins, r.wins)) + '</div></li>'; }).join('') + '</ul>' +
      '<p><b>Achievements</b></p><ul class="medals">' + meta.achievements.map(function (a) { var at = me.ach[a.id], hid = a.hidden && !at; return '<li class="medal-card' + (at ? ' earned' : '') + (at && a.legendary ? ' legendary' : '') + '">' + (hid ? art('lock', 'bronze', 64, 'Hidden', true) : art(a.art, a.metal, 64, a.name, !at)) + '<div><b>' + (hid ? 'A hidden achievement' : esc(a.name)) + '</b><small>' + (hid ? 'Keep playing. It is earned at the table, not by luck.' : esc(a.desc)) + '</small>' + (at ? '<small class="got">Unlocked ' + new Date(at).toLocaleDateString() + '</small>' : bar(me.progress[a.id], a.goal) + '<small>' + me.progress[a.id] + ' of ' + a.goal + '</small>') + '</div></li>'; }).join('') + '</ul></div>' +
      '<form class="card" data-form="rename"><div class="field"><label for="p-name">Name</label><div class="inline"><input id="p-name" type="text" maxlength="20" value="' + esc(me.name) + '"><button class="btn small ghost" type="submit">Save</button></div></div></form>' +
      '<div class="card"><p><b>The three kingdoms</b></p>' + window.WPM_MAP() + '</div>' +
      '<form class="card" data-form="password"><p><b>' + (me.hasPassword ? 'Change your password' : 'Set a password') + '</b></p><p class="note">' + (me.hasPassword ? 'Changing it signs you out on your other devices.' : 'With a password you can sign in on any phone or computer.') + '</p>' +
      (me.hasPassword ? '<div class="field"><label for="p-cur">Current password</label><input id="p-cur" type="password" maxlength="100" autocomplete="current-password"></div>' : '') +
      '<div class="field"><label for="p-new">New password</label><input id="p-new" type="password" maxlength="100" autocomplete="new-password" placeholder="At least 6 characters"></div><button class="btn small ghost" type="submit">Save password</button></form>' +
      '<div class="row mid"><button class="linkbtn" data-act="signout">' + (armed === 'signout' ? 'Tap again to sign out' : 'Sign out on this device') + '</button></div>';
  };

  /* ---------- the table ---------- */
  function leaveTable() { if (es) { es.close(); es = null; } table = null; mine = {}; clearTimeout(sendTimer); }
  function openTable(code) {
    leaveTable(); app.innerHTML = back + '<div class="card"><p class="note">Finding the table…</p></div>';
    es = new EventSource(API + '/api/rooms/' + encodeURIComponent(code) + '/events?k=' + encodeURIComponent(key));
    es.addEventListener('state', function (e) { var first = !table; table = JSON.parse(e.data); offset = table.now - Date.now(); sync('live'); onState(first); });
    es.onerror = function () { if (!table) { leaveTable(); app.innerHTML = back + '<div class="card feature"><p class="big-text">That table has closed or is full.</p><div class="row mid"><a class="btn" href="#home">Back home</a></div></div>'; } else sync('error'); };
  }
  var T = function (path, body) { return api('POST', '/api/rooms/' + table.code + '/' + path, body || {}); };
  var seat = function () { return table.players.filter(function (p) { return p.id === me.id; })[0] || {}; };
  var left = function (t) { return Math.max(0, Math.ceil((t - (Date.now() + offset)) / 1000)); };
  function collect() { var a = {}; $$('input[data-cat]').forEach(function (el) { a[el.dataset.cat] = el.value; }); if (Object.keys(a).length) mine = a; return mine; }
  function onState() {
    if (table.phase === 'collect' && $('input[data-cat]')) { clearTimeout(sendTimer); T('answers', { answers: collect() }).catch(function () { /* the round closed first */ }); }
    if (table.phase === 'results') { var id = table.code + ':' + table.round; if (id !== lastResults) { lastResults = id; refreshMe().then(function () { renderTable(); }).catch(function () { /* keep the table */ }); if (table.scores.winner === me.id) celebrate(); } }
    renderTable();
  }
  function people() { return '<ul class="people" id="t-people">' + table.players.map(function (p) { return '<li class="' + (p.online ? '' : 'off') + '">' + medal(p, 28) + '<span>' + esc(p.name) + (p.id === table.host ? ' <small>host</small>' : '') + (table.phase === 'play' && p.inRound ? ' <small>' + p.filled + '/' + table.settings.cats.length + '</small>' : '') + (table.phase === 'review' && p.ready ? ' <small>done</small>' : '') + (p.online ? '' : ' <small>away</small>') + '</span></li>'; }).join('') + '</ul>'; }
  function renderTable() {
    if (!table) return;
    var st = table, s = st.settings, me2 = seat(), host = st.host === me.id || !st.players.some(function (p) { return p.id === st.host && p.online; }), k = [st.code, st.phase, st.round].join('|'), body;
    if (app.dataset.key === k && st.phase === 'play' && $('#t-people')) { $('#t-people').outerHTML = people(); return; }
    app.dataset.key = k;
    var link = location.origin + location.pathname + '#table-' + st.code;
    if (st.phase === 'lobby') {
      body = '<div class="card"><p><b>Invite players</b> <span class="note">up to ' + meta.maxPlayers + ' at a table</span></p><p class="code">' + st.code + '</p><div class="inline"><label class="sr" for="t-link">Invite link</label><input id="t-link" type="text" readonly value="' + esc(link) + '"><button class="btn small" data-act="copylink">Copy</button></div>' + shareRow(me.name + ' invites you to a round of Esm Famil in “Where is Prince Mohsey?”. Table ' + st.code + ':', link) + '</div>' +
        (host ? '<div class="card"><p><b>Table rules</b></p>' +
          '<div class="checks">' + meta.categories.map(function (c) { return '<label><input type="checkbox" id="c-' + c.id + '" data-act="cat" data-id="' + c.id + '"' + (s.cats.indexOf(c.id) >= 0 ? ' checked' : '') + '> ' + c.en + '</label>'; }).join('') + '</div>' +
          '<div class="row" role="group" aria-label="Time">' + [60, 90, 120].map(function (x) { return '<button class="chip" data-act="set" data-f="secs" data-v="' + x + '" aria-pressed="' + (s.secs === x) + '">' + x + ' seconds</button>'; }).join('') + '</div>' +
          
          '<button class="btn big" data-act="start">Start the round</button>' + (st.players.filter(function (p) { return p.online; }).length < meta.minScored ? '<p class="note center">Alone, a round is only practice. Points, victories and chapters need at least ' + meta.minScored + ' players.</p>' : '') + '</div>'
          : '<div class="card feature"><p class="big-text">Waiting for the host to start.</p><p class="soft">' + s.secs + ' seconds · ' + s.cats.map(function (c) { return catOf(c).en; }).join(', ') + '</p></div>');
    } else if (st.phase === 'play' || st.phase === 'collect') {
      body = '<p class="letter" lang="' + s.lang + '">' + esc(st.letter) + '</p><p class="timer" id="t-time">' + (st.phase === 'play' ? left(st.endsAt) : 0) + '</p>' +
        (st.phase === 'collect' ? '<div class="card feature"><p class="big-text">Pens down!</p></div>' : !me2.inRound ? '<div class="card feature"><p class="big-text">A round is running.</p><p class="soft">You join the next one.</p></div>' :
          '<div class="card">' + s.cats.map(function (id) { var c = catOf(id); return '<div class="field"><label for="e-' + id + '">' + c.en + '</label><input id="e-' + id + '" data-cat="' + id + '" type="text" dir="auto" maxlength="40" autocomplete="off" value="' + esc(mine[id] || '') + '"></div>'; }).join('') +
          '<button class="btn" data-act="stop">Stop! I am done</button><p class="note center">Stop ends the round for everyone. Every box must be filled.</p></div>');
    } else {
      var final = st.phase === 'results', sc = st.scores, mineSc = sc.players[me.id];
      body = (final ? '<div class="card feature"><p class="big-text">' + (sc.winner ? esc(st.players.filter(function (p) { return p.id === sc.winner; }).map(royalName)[0] || 'Someone') + ' wins the round' : 'No winner this round') + '</p>' +
          (mineSc ? '<p class="turn">You scored ' + mineSc.total + (!sc.scored ? '. Practice round: nothing was added to your record' : mineSc.capped ? '. You have played more rounds this hour than count: take a break' : '') + '</p>' + (sc.scored && sc.provisional && !mineSc.capped ? '<p class="note">For now. The referee checks every answer tonight at ' + clock() + ', and the points count after that.</p>' : '') + (sc.scored ? levelLine(me) + (me.quizReady ? '<a class="btn" href="#level-' + (me.level + 1) + '">Read chapter ' + (me.level + 1) + ' and take the quiz</a>' : '') : '') : '') + '</div>'
        : '<p class="letter" lang="' + s.lang + '">' + esc(st.letter) + '</p><p class="center soft">Check the answers. Reject one that does not count; it falls if more than half of the other players agree.</p>' +
          '<p class="check-time">Checking closes in <b id="t-time">' + left(st.reviewEndsAt) + '</b> seconds, or as soon as everyone presses Done checking.</p>') +
        '<div class="review">' + (sc.cats || s.cats).map(function (id) { var c = catOf(id);
          return '<div class="review-row"><h3>' + c.en + '</h3>' + sc.order.map(function (pid) {
            var p = st.players.filter(function (x) { return x.id === pid; })[0] || { name: '?' }, a = sc.players[pid].cats[id], votes = ((st.rejects[pid] || {})[id] || []), mineVote = votes.indexOf(me.id) >= 0;
            var why = a.status === 'empty' ? 'nothing' : a.status === 'letter' ? 'wrong letter' : a.status === 'short' ? 'not a word' : a.status === 'country' ? 'not a country' : a.status === 'rejected' ? 'rejected' : a.shared ? 'shared' : '';
            return '<div class="ans' + (a.status === 'ok' ? '' : ' bad') + '"><span dir="auto"><small>' + esc(p.name) + (why ? ' · ' + why : '') + (votes.length && a.status !== 'rejected' ? ' · ' + votes.length + ' against' : '') + '</small><i>' + (esc(a.text) || '—') + '</i></span>' +
              (!final && pid !== me.id && me2.inRound && (a.status === 'ok' || a.status === 'rejected') ? '<button class="chip rej" data-act="vote" data-p="' + pid + '" data-cat="' + id + '" aria-pressed="' + mineVote + '">' + (mineVote ? 'Rejected' : 'Reject') + '</button>' : '') + '<b class="pts" data-v="' + a.pts + '">' + a.pts + '</b></div>'; }).join('') + '</div>'; }).join('') + '</div>' +
        '<div class="card"><table class="board"><thead><tr><th scope="col">Player</th><th scope="col">Round</th><th scope="col">Table total</th></tr></thead><tbody>' + sc.order.map(function (pid) { var p = st.players.filter(function (x) { return x.id === pid; })[0] || { name: '?', session: 0 }; return '<tr' + (pid === me.id ? ' class="you"' : '') + '><th scope="row">' + esc(p.name) + (final && sc.winner === pid ? ' 👑' : '') + '</th><td>' + sc.players[pid].total + '</td><td>' + p.session + '</td></tr>'; }).join('') + '</tbody></table></div>' +
        (final ? (host ? '<button class="btn big" data-act="start">Next round</button>' : '<p class="center soft">Waiting for the host to start the next round.</p>') : me2.inRound ? '<button class="btn big" data-act="ready"' + (me2.ready ? ' disabled' : '') + '>' + (me2.ready ? 'Waiting for the others…' : 'Done checking') + '</button>' : '');
    }
    app.innerHTML = back + '<div class="row split"><h1>Table ' + st.code + '</h1><button class="linkbtn" data-act="leave">Leave table</button></div>' + people() + body;
  }

  /* ---------- actions ---------- */
  var acts = {
    pick: function (el) { $$('[data-f="' + el.dataset.f + '"]').forEach(function (b) { b.setAttribute('aria-pressed', b === el); }); },
    create: function () { api('POST', '/api/rooms', {}).then(function (j) { location.hash = 'table-' + j.code; }).catch(fail); },
    copylink: function () { copy($('#t-link'), 'Link copied. Send it to your friends.'); },
    mode: function (el) { mode = el.dataset.m; views.welcome(); },
    share: function (el) { navigator.share({ text: el.dataset.text, url: el.dataset.url }).catch(function () { /* closed without sharing */ }); },
    signout: function () { if (armed !== 'signout') { armed = 'signout'; route(); setTimeout(function () { armed = ''; }, 5000); return; } armed = ''; api('POST', '/api/logout').catch(function () { /* signed out here either way */ }); key = null; lsSet('key', null); setMe(null); mode = 'login'; location.hash = 'home'; route(); },
    profile: function (el) { var b = {}; b[el.dataset.f] = el.dataset.v; api('POST', '/api/profile', b).then(function (j) { setMe(j.me); route(); }).catch(fail); },
    quiz: function () { api('POST', '/api/quiz/start').then(showQuiz).catch(fail); },
    leave: function () { var t = table; leaveTable(); if (t) api('POST', '/api/rooms/' + t.code + '/leave', {}).catch(function () { /* already gone */ }); location.hash = 'home'; },
    set: function (el) { var b = {}, f = el.dataset.f; b[f] = f === 'secs' ? +el.dataset.v : f === 'open' ? !!el.dataset.v : el.dataset.v; T('settings', b).catch(fail); },
    cat: function () { T('settings', { cats: $$('[data-act="cat"]').filter(function (c) { return c.checked; }).map(function (c) { return c.dataset.id; }) }).catch(fail); },
    start: function () { mine = {}; T('start').catch(fail); },
    stop: function () { T('stop', { answers: collect() }).catch(fail); },
    vote: function (el) { T('vote', { player: el.dataset.p, cat: el.dataset.cat, reject: el.getAttribute('aria-pressed') !== 'true' }).catch(fail); },
    ready: function () { T('ready').catch(fail); }
  };
  function enter(j) { key = j.key; lsSet('key', key); setMe(j.me); route(); }
  function copy(input, msg) { var manual = function () { input.focus(); input.select(); toast('Select the text and copy it'); }; if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(input.value).then(function () { toast(msg); }, manual); else manual(); }
  var forms = {
    register: function () {
      var b = { name: $('#w-name').value, password: $('#w-pass').value, kingdom: ($('[data-f="kingdom"][aria-pressed="true"]') || {}).dataset.v, royal: ($('[data-f="royal"][aria-pressed="true"]') || {}).dataset.v };
      api('POST', '/api/register', b).then(enter).catch(fail);
    },
    login: function () { api('POST', '/api/login', { name: $('#w-name').value, password: $('#w-pass').value }).then(enter).catch(fail); },
    password: function () {
      api('POST', '/api/password', { current: ($('#p-cur') || {}).value, password: $('#p-new').value }).then(function (j) { setMe(j.me); toast('Password saved'); route(); }).catch(fail);
    },
    join: function () { var c = $('#h-code').value.trim().toUpperCase(); if (c) location.hash = 'table-' + c; },
    rename: function () { api('POST', '/api/profile', { name: $('#p-name').value }).then(function (j) { setMe(j.me); toast('Name saved'); route(); }).catch(fail); },
    quiz: function () {
      var a = quiz.questions.map(function (x, i) { var c = $('input[name="q' + i + '"]:checked'); return c ? +c.value : -1; });
      if (a.indexOf(-1) >= 0) { toast('Answer every question first'); return; }
      api('POST', '/api/quiz/answer', { answers: a }).then(function (r) {
        setMe(r.me); quiz = null;
        $('#q-box').outerHTML = '<div class="card feature" id="q-box"><p class="big-text">' + (r.passed ? 'Chapter ' + r.level + ' is yours.' : r.correct + ' of ' + r.of + '. Not this time.') + '</p><p class="soft">' + (r.passed ? 'You got ' + r.correct + ' of ' + r.of + '. The next chapter needs ' + num(r.me.need) + ' points.' : 'The points for this chapter are gone. Win them back at the table and the story will open again.') + '</p><div class="row mid"><a class="btn" href="#' + (r.passed ? 'journey' : 'home') + '">' + (r.passed ? 'See the journey' : 'Back to the table') + '</a></div></div>';
        if (r.passed) ceremony([{ kind: 'level', n: r.level }].concat(r.unlocks || [])); else if (r.unlocks && r.unlocks.length) ceremony(r.unlocks);
      }).catch(fail);
    }
  };

  /* ---------- routing and boot ---------- */
  function route() {
    var h = (location.hash || '').replace(/^#/, ''), m;
    delete app.dataset.key;
    if (!(m = /^table-([A-Za-z]{5})$/.exec(h))) leaveTable();
    if (!meta) return;
    if (!me) { views.welcome(); return; }
    if (m) { if (!table || table.code !== m[1].toUpperCase()) openTable(m[1].toUpperCase()); else renderTable(); }
    else if ((m = /^level-([1-7])$/.exec(h))) views.level(+m[1]);
    else (views[h] && h !== 'welcome' && h !== 'level' ? views[h] : views.home)();
    window.scrollTo(0, 0);
  }
  function boot() {
    app.innerHTML = '<div class="card feature"><p class="big-text">Opening the gates…</p></div>';
    if (!API) { app.innerHTML = '<div class="card feature"><p class="big-text">No game server is configured.</p><p class="soft">Set serverUrl in config.js.</p></div>'; return; }
    api('GET', '/api/meta').then(function (m) { meta = m; sync('live'); return key ? refreshMe().catch(function (e) { if (e.status === 401) { key = null; lsSet('key', null); } else throw e; }) : null; })
      .then(route).catch(function (e) { sync('error'); app.innerHTML = '<div class="card feature"><p class="big-text">' + esc(e.message) + '</p><div class="row mid"><button class="btn" data-act="retry">Try again</button></div></div>'; });
  }
  acts.retry = boot;
  function start() {
    app = $('#app');
    app.addEventListener('click', function (e) { var el = e.target.closest('[data-act]'); if (!el || el.disabled || el.type === 'checkbox') return; var fn = acts[el.dataset.act]; if (fn) fn(el); });
    app.addEventListener('change', function (e) { var el = e.target; if (el.type === 'checkbox' && acts[el.dataset.act]) acts[el.dataset.act](el); });
    app.addEventListener('input', function (e) { if (!e.target.dataset.cat || !table || table.phase !== 'play') return; collect(); clearTimeout(sendTimer); sendTimer = setTimeout(function () { if (table && table.phase === 'play') T('answers', { answers: mine }).catch(function () { /* next keystroke retries */ }); }, 500); });
    app.addEventListener('submit', function (e) { e.preventDefault(); var f = e.target.closest('[data-form]'), fn = f && forms[f.dataset.form]; if (fn) fn(f); });
    $('#ceremony').addEventListener('click', function (e) { if (e.target.closest('[data-cer]') || e.target.id === 'ceremony') nextCeremony(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('#ceremony').hidden) nextCeremony(); });
    window.addEventListener('hashchange', route);
    setInterval(function () { var t = $('#t-time'); if (!t || !table) return; var s = table.phase === 'play' ? left(table.endsAt) : table.phase === 'review' ? left(table.reviewEndsAt) : 0; t.textContent = s; t.classList.toggle('low', s <= 10); }, 250);
    boot();
  }
  start();
})();
