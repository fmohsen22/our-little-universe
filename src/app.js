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
  function api(method, path, body, as) {
    var h = {}, k = as || key; if (k) h.Authorization = 'Bearer ' + k; if (body) h['Content-Type'] = 'application/json';
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
    app.innerHTML = '<section class="hero">' + window.WPM_PRINCE(112) + '<p class="eyebrow">A word game from the Book of Kings</p><h1>Where is <em>Prince Mohsey?</em></h1><p class="soft">Play Esm Famil with friends, earn crowns from the Shahnameh, and unlock the life of Rostam chapter by chapter.</p><a class="btn small ghost" href="#guide">How to play</a></section>' +
      '<div class="seg" role="group" aria-label="Account"><button class="chip" data-act="mode" data-m="new" aria-pressed="' + isNew + '">New player</button><button class="chip" data-act="mode" data-m="login" aria-pressed="' + !isNew + '">I have an account</button></div>' +
      (meta.googleClientId ? '<div class="card g-card"><div id="g-btn" class="g-btn"></div><p class="note center">' + (isNew ? 'The quickest way: no password to remember.' : 'If you joined with Google, continue with Google.') + '</p></div><div class="or" role="separator"><span>or ' + (isNew ? 'choose a name and password' : 'sign in with your name and password') + '</span></div>' : '') +
      '<form class="card" data-form="' + (isNew ? 'register' : 'login') + '"><div class="field"><label for="w-name">' + (isNew ? 'Your name in the kingdom' : 'Your name') + '</label><input id="w-name" type="text" maxlength="20" autocomplete="username" placeholder="For example: Sufi"></div>' +
      '<div class="field"><label for="w-pass">Password</label><input id="w-pass" type="password" maxlength="100" autocomplete="' + (isNew ? 'new-password' : 'current-password') + '" placeholder="' + (isNew ? 'At least 6 characters' : '') + '"></div>' +
      (isNew ? '<p><b>Choose your kingdom</b></p>' + window.WPM_MAP() +
        kingdomChips('pick', 'iran') +
        '<div class="row" role="group" aria-label="Title">' + ['Champion', 'Prince', 'Princess'].map(function (t, i) { return '<button type="button" class="chip" data-act="pick" data-f="royal" data-v="' + t + '" aria-pressed="' + (i === 0) + '">' + t + '</button>'; }).join('') + '</div>' +
        '<button class="btn big" type="submit">Enter the kingdom</button><p class="note">Your name and password sign you in on any phone or computer, with all your points, crowns and chapters.</p>'
        : '<button class="btn big" type="submit">Sign in</button><p class="note">Your points, crowns and chapters are waiting.</p>') + '</form>';
    if (meta.googleClientId) googleButton(isNew);
  };
  /* "Continue with Google": Google's own button and script, loaded only when the server has a client ID */
  var gLoading = false, gCred = null;
  function googleButton(isNew) {
    var draw = function () {
      var box = $('#g-btn'); if (!box || !window.google || !google.accounts) return;
      google.accounts.id.initialize({ client_id: meta.googleClientId, callback: googleDone, ux_mode: 'popup', auto_select: false, cancel_on_tap_outside: true });
      google.accounts.id.renderButton(box, { type: 'standard', theme: document.documentElement.dataset.theme === 'light' || (!document.documentElement.dataset.theme && window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches) ? 'outline' : 'filled_black', size: 'large', shape: 'pill', locale: 'en', text: isNew ? 'signup_with' : 'continue_with', width: Math.min(360, box.clientWidth || 320) });
    };
    if (window.google && google.accounts) return draw();
    if (gLoading) return; gLoading = true;
    var s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.onload = draw; s.onerror = function () { gLoading = false; var b = $('#g-btn'); if (b) b.innerHTML = '<p class="note center">Google sign-in could not be loaded.</p>'; };
    document.head.appendChild(s);
  }
  function googleDone(resp) {
    gCred = resp.credential;
    api('POST', '/api/google', { credential: gCred }).then(function (j) { if (j.needName) googleName(j.suggestion); else { gCred = null; enter(j); } }).catch(fail);
  }
  function googleName(suggestion) {
    app.innerHTML = '<form class="card" data-form="gname"><p class="eyebrow">Signed in with Google</p><h1>Choose your name in the kingdom</h1><p class="soft">This is the name other players see. Your email is not shown or kept.</p>' +
      '<div class="field"><label for="g-name">Your name in the kingdom</label><input id="g-name" type="text" maxlength="20" autocomplete="nickname" value="' + esc(suggestion || '') + '"></div>' +
      '<p><b>Choose your kingdom</b></p>' + window.WPM_MAP() + kingdomChips('pick', 'iran') +
      '<div class="row" role="group" aria-label="Title">' + ['Champion', 'Prince', 'Princess'].map(function (t, i) { return '<button type="button" class="chip" data-act="pick" data-f="royal" data-v="' + t + '" aria-pressed="' + (i === 0) + '">' + t + '</button>'; }).join('') + '</div>' +
      '<button class="btn big" type="submit">Enter the kingdom</button></form>';
    window.scrollTo(0, 0);
  }

  /* ---------- how to play: open to everyone, signed in or not ---------- */
  views.guide = function () {
    var P = meta.points, first = meta.levels[0].points, ex = [['Name', 'Sara'], ['Surname', 'Smith'], ['City', 'Shiraz'], ['Country', 'Spain'], ['Animal', 'Snake'], ['Food', 'Soup'], ['Object', 'Spoon'], ['Colour', 'Silver']];
    var step = function (n, icon, title, body) { return '<section class="card guide-step"><p class="eyebrow">' + n + '</p><h2><span aria-hidden="true">' + icon + '</span> ' + title + '</h2>' + body + '</section>'; };
    app.innerHTML = (me ? back : '<a class="back" href="#">← Back</a>') + '<h1>How to play</h1><p class="soft">Everything you need, in two minutes.</p>' +
      step('The game', '✍️', 'Esm Famil in one minute',
        '<p>Everyone gets the same <b>letter</b> and the same clock. Write one word for each category, starting with that letter.</p>' +
        '<div class="guide-sheet"><p class="letter-mini">S</p><dl>' + ex.map(function (e) { return '<div><dt>' + e[0] + '</dt><dd>' + e[1] + '</dd></div>'; }).join('') + '</dl></div>' +
        '<p>The first player to fill <b>every</b> box can press <b>Stop</b>, which ends the round for everyone. Otherwise the round ends when the clock runs out.</p>') +
      step('Getting together', '👥', 'Start or join a table',
        '<p>Press <b>Start a table</b> and send the link to your friends (there is a WhatsApp button), or join a table that is already open. A table needs <b>' + meta.minTable + ' to ' + meta.maxPlayers + ' people</b>: a referee and at least two players.</p>') +
      step('The referee', '⚖️', 'One person judges the answers',
        '<p>Before the round, anyone can tap <b>Volunteer as referee</b>, and the others vote. The referee does not play that round.</p>' +
        '<p>When the round ends, the referee sees every answer and taps <b>✓</b> or <b>✗</b> on each one. Is “Snake” an animal? ✓. Is “Sxyz” a city? ✗. Then they press <b>Give the verdict</b>.</p>' +
        '<p class="note">The game already refuses empty boxes, wrong first letters, nonsense like “sss”, and countries that do not exist. Take turns: be a fair referee and the table will vote for you again.</p>') +
      step('Points', '⭐', 'How a round is scored',
        '<ul class="guide-points"><li><b class="pts" data-v="10">' + P.unique + '</b> an answer nobody else wrote</li><li><b class="pts" data-v="5">' + P.shared + '</b> an answer someone else also wrote</li><li><b class="pts" data-v="0">0</b> empty, wrong or rejected</li></ul>' +
        '<p>The highest score wins the round. Your points and victories are kept in your account, on any phone.</p>') +
      step('Crowns and badges', '👑', 'Rise through the ranks',
        '<p>Every victory counts toward a royal title from the Shahnameh, from <b>' + esc(meta.ranks[0].title.replace('{royal}', 'Prince')) + '</b> after your first win to <b>' + esc(meta.ranks[meta.ranks.length - 1].title) + '</b> after ' + meta.ranks[meta.ranks.length - 1].wins + '. There are also badges for streaks, comebacks, refereeing and more. See them all in your profile.</p>') +
      step('The life of Rostam', '📜', 'Seven chapters to unlock',
        '<p>Your points also open the seven chapters of Rostam’s life. The first chapter needs ' + num(first) + ' points, about 10 hours of play, and each one after needs a little more.</p>' +
        '<p>When a chapter opens, read its story and take a short quiz: <b>' + meta.quiz.size + ' questions, ' + meta.quiz.pass + ' right to pass</b>. If you fail, the points for that chapter are lost and you win them again at the table, so read carefully.</p>') +
      step('The last chapter', '🪶', 'Where is Prince Mohsey?',
        '<p>At the end of every chapter the Simurgh leaves you <b>one line of a riddle</b>. Remember them. After all seven chapters, the last one asks a single question: where is Prince Mohsey? Find the answer and he will be waiting for you at his own table.</p>') +
      (me ? '<div class="row mid"><a class="btn big" href="#home">Let’s play</a></div>' : '<div class="row mid"><a class="btn big" href="#">Create my account</a></div>');
  };

  views.home = function () {
    app.innerHTML = '<section class="card me-card"><div class="row split"><div class="row">' + medal(me, 64) + '<div><h1 class="me-name">' + esc(royalName(me)) + '</h1><p class="soft">' + esc(me.title || 'Not yet crowned') + ' · chapter ' + me.level + ' of ' + meta.levels.length + '</p></div></div><div class="row">' + '<a class="btn small ghost" href="#me">Profile</a></div></div>' +
      levelLine(me) + (me.quizReady ? '<a class="btn" href="#level-' + (me.level + 1) + '">Read chapter ' + (me.level + 1) + ' and take the quiz</a>' : '') +
      '<dl class="stats4"><div><dt>Points</dt><dd>' + num(me.total) + '</dd></div><div><dt>Victories</dt><dd>' + me.wins + '</dd></div><div><dt>Rounds</dt><dd>' + me.rounds + '</dd></div><div><dt>Best streak</dt><dd>' + me.best + '</dd></div></dl></section>' +
      (me.rounds === 0 && !me.refereed ? '<a class="book-link hall-link guide-link" href="#guide"><span><b>👋 New here? How to play</b><br><span class="note">The rules, the referee, points and chapters, in two minutes</span></span><span aria-hidden="true">→</span></a>' : '') +
      '<section class="card"><h2>Play Esm Famil</h2><p class="soft">One letter, eight categories, and a clock. A referee chosen by the table decides which answers count. Unique answers score ' + meta.points.unique + ', shared answers ' + meta.points.shared + '. A table needs at least ' + meta.minTable + ' people.</p><button class="btn big" data-act="create">Start a table</button>' +
      '<p class="note"><a href="#guide">How to play</a></p><form class="inline" data-form="join"><label class="sr" for="h-code">Table code</label><input id="h-code" type="text" maxlength="5" autocapitalize="characters" autocomplete="off" placeholder="Table code"><button class="btn ghost" type="submit">Join</button></form>' +
      '<div id="h-tables"><p class="note">Looking for open tables…</p></div></section>' +
      '<section class="card"><div class="row split"><h2>Leaderboard</h2><a class="btn small ghost" href="#leaders">See everyone</a></div><div id="h-leaders"><p class="note">Loading…</p></div></section>' +
      '<section class="card"><h2>Bring your friends</h2><p class="soft">The more players at the table, the better the game.</p>' + shareRow('Come and play Esm Famil with me in “Where is Prince Mohsey?”', SITE) + '</section>' +
      '<section class="card legend-intro"><p class="eyebrow">How the three kingdoms began</p><h2>Fereydun divides the world</h2>' +
      '<p>In the Shahnameh, the old king Fereydun splits the world among his three sons. Salm, the eldest, receives Rum, the West. Tur receives Turan and China, to the north-east and east. Iraj, the youngest, receives Iran, the heart of it all.</p>' +
      '<p>Jealous of their brother’s share, Salm and Tur murder Iraj, and from that crime grows the long war between Iran and Turan that fills the age of heroes, and the life of Rostam.</p>' +
      '<p class="note">You belong to the Kingdom of ' + kingdom(me.kingdom).name + ', the realm of ' + kingdom(me.kingdom).heir + '.</p>' +
      '<details class="map-more"><summary>Show the map</summary>' + window.WPM_MAP() + '</details></section>' +
      (me.finale ? '<a class="book-link hall-link" href="#mohsey"><span><b>👑 Play Prince Mohsey</b><br><span class="note">You found him in Vienna. Now beat him at Esm Famil.</span></span><span aria-hidden="true">→</span></a>'
        : me.level >= meta.levels.length ? '<a class="book-link hall-link" href="#finale"><span><b>🪶 The last chapter is open</b><br><span class="note">Solve the Simurgh’s riddle: where is Prince Mohsey?</span></span><span aria-hidden="true">→</span></a>' : '') +
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
      list.map(function (p, i) { return '<tr' + (me && p.id === me.id ? ' class="you"' : '') + '><td>' + (p.place || i + 1) + '</td><th scope="row"><span class="who-cell">' + medal(p, 30) + '<span>' + esc(royalName(p)) + '<small>' + esc(p.title || 'Not yet crowned') + ' · ' + kingdom(p.kingdom).name + '</small></span></span></th><td>' + (p.finale ? '8 🪶' : p.level) + '</td><td>' + num(p.total) + '</td><td>' + p.wins + '</td></tr>'; }).join('') + '</tbody></table></div>';
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
          (passed ? '<a class="btn small ghost" href="#level-' + L.n + '">Read again</a>' : open ? '<a class="btn small" href="#level-' + L.n + '">Read the story and take the quiz</a>' : current ? bar(me.levelPoints, me.need) + '<small>' + num(me.levelPoints) + ' of ' + num(L.points) + ' points</small>' : '<small>Needs ' + num(L.points) + ' points after chapter ' + (L.n - 1) + '</small>') + '</div>' + pic(L.n, true) + '</li>';
      }).join('') + '<li class="chapter final' + (me.finale ? ' passed' : me.level >= meta.levels.length ? ' open' : ' locked') + '">' + window.WPM_PRINCE(56) + '<div><b>8. Where is Prince Mohsey?</b>' +
        (me.finale ? '<small>You found him. He is waiting at his table.</small><div class="row"><a class="btn small ghost" href="#finale">Read again</a><a class="btn small" href="#mohsey">Play Prince Mohsey</a></div>'
          : me.level >= meta.levels.length ? '<small>The last chapter is open. Solve the Simurgh’s riddle.</small><a class="btn small" href="#finale">Open the last chapter</a>'
          : '<small>Pass all seven chapters to open the last one. Collect the Simurgh’s riddle along the way.</small>') + '</div></li></ol>';
  };

  // The chapter pictures (assets/levels), with a description for people who cannot see them.
  var PICS = ['', 'The Simorgh, a great bird with peacock feathers, lifts a white-haired baby from the snowy slopes of Mount Alborz',
    'Young Rostam throws his lasso over the red-and-gold colt Rakhsh while an old herdsman watches',
    'Rostam wrestles the White Div, a horned white demon holding a millstone, in a cave; Rakhsh waits outside',
    'Rostam and the young Sohrab face each other on horseback between the armies of Iran and Turan',
    'Prince Siavash, dressed in white on a black horse, rides unharmed out of the fire as the king and court watch',
    'By moonlight beside the sea, the Simorgh watches as grey-bearded Rostam cuts a branch from a tamarisk tree',
    'Old Rostam’s horse Rakhsh rears and refuses to go on, while a man watches from inside a hollow tree'];
  var pic = function (n, small) { return '<img class="' + (small ? 'ch-pic' : 'story-pic') + '" src="assets/levels/level-' + n + (small ? '-small' : '') + '.jpg" alt="' + (small ? '' : PICS[n]) + '" width="' + (small ? 360 : 1080) + '" height="' + (small ? 240 : 720) + '"' + (small ? ' loading="lazy"' : '') + ' onerror="this.remove()">'; };

  /* ---------- chapter 8: the Simurgh's riddle ---------- */
  function finaleEnding(f) {
    return '<article class="card story"><p class="eyebrow">The answer</p><h2>' + esc(f.riddle) + '</h2>' + f.ending.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('') + '</article>' +
      '<div class="card feature center mohsey">' + window.WPM_PRINCE(96) + '<p class="big-text">Prince Mohsey is waiting at his table.</p><div class="row mid"><a class="btn big" href="#mohsey">Play Prince Mohsey</a></div></div>';
  }
  views.finale = function () {
    app.innerHTML = '<a class="back" href="#journey">← All chapters</a><div class="card"><p class="note">Opening the last chapter…</p></div>';
    api('GET', '/api/finale').then(function (f) {
      if (location.hash !== '#finale') return;
      app.innerHTML = '<a class="back" href="#journey">← All chapters</a><article class="card story"><p class="eyebrow">Chapter 8 · the last chapter</p><h1>' + esc(f.title) + '</h1>' +
        '<img class="story-pic" src="assets/levels/level-8.jpg" alt="Prince Mohsey and Princess Softolli in the great library" width="1080" height="720" onload="var p = document.querySelector(\'.f-portrait\'); if (p) p.remove();" onerror="this.remove()">' +
        '<div class="center f-portrait">' + window.WPM_PRINCE(120) + '</div>' + f.story.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('') + '</article>' +
        (f.solved ? '<div id="f-box">' + finaleEnding(f) + '</div>' :
          '<div id="f-box"><form class="card riddle" data-form="riddle"><p class="eyebrow">🪶 The Simurgh’s riddle</p><h2>' + esc(f.riddle) + '</h2><ol class="clues">' + f.clues.map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('') + '</ol>' +
          '<div class="field"><label for="f-answer">Name the city</label><input id="f-answer" type="text" maxlength="60" autocomplete="off" autocapitalize="words" placeholder="The city is…"></div><p class="note" id="f-hint" aria-live="polite"></p>' +
          '<button class="btn big" type="submit">Answer the Simurgh</button><p class="note center">No points are lost for a wrong answer. Take your time.</p></form></div>');
    }).catch(function (e) { app.innerHTML = '<a class="back" href="#journey">← All chapters</a><div class="card feature"><p class="big-text">' + esc(e.message) + '</p></div>'; });
  };

  /* ---------- the last reward: a game against Prince Mohsey ---------- */
  var duel = null, duelTimer = 0, CATNAME = function (id) { return catOf(id).en; };
  var record = function (j) { var lost = j.games - j.wins - (j.draws || 0); return 'You ' + j.wins + ' · Prince Mohsey ' + lost + (j.draws ? ' · ' + j.draws + (j.draws === 1 ? ' draw' : ' draws') : ''); };
  function duelIntro(j, line) {
    app.innerHTML = back + '<div class="card feature center mohsey">' + window.WPM_PRINCE(120) + '<h1>Prince Mohsey’s table</h1><p class="big-text">“' + esc(line || 'Ah, my guest! Sit down. One letter, eight categories, two minutes. Shall we?') + '”</p>' +
      '<p class="soft">' + record(j) + '</p><div class="row mid"><button class="btn big" data-act="duelstart">' + (j.games ? 'Play again' : 'Sit down and play') + '</button></div>' +
      '<p class="note">Prince Mohsey is played by the computer, from his own word lists. These games are just for fun: they do not change the leaderboard.</p></div>';
  }
  function duelPlay(d) {
    duel = d; duel.offset = d.now - Date.now(); var t = function () { return Math.max(0, Math.ceil((duel.endsAt - (Date.now() + duel.offset)) / 1000)); };
    app.innerHTML = back + '<h1>Against Prince Mohsey</h1><p class="soft center">“' + esc(d.hello) + '”</p><p class="letter">' + esc(d.letter) + '</p><p class="timer" id="d-time">' + t() + '</p>' +
      '<form class="card" data-form="duel">' + d.cats.map(function (id) { return '<div class="field"><label for="d-' + id + '">' + CATNAME(id) + '</label><input id="d-' + id + '" data-duel="' + id + '" type="text" dir="auto" maxlength="40" autocomplete="off"></div>'; }).join('') +
      '<button class="btn" type="submit">Done! Show me his answers</button><p class="note center">When the clock runs out, your answers are handed in.</p></form>';
    clearInterval(duelTimer);
    duelTimer = setInterval(function () { var el = $('#d-time'); if (!el || !duel) { clearInterval(duelTimer); return; } var s = t(); el.textContent = s; el.classList.toggle('low', s <= 10); if (s <= 0) { clearInterval(duelTimer); duelSend(); } }, 250);
  }
  function duelSend() {
    if (!duel) return; var a = {}; $$('input[data-duel]').forEach(function (el) { a[el.dataset.duel] = el.value; }); duel = null; clearInterval(duelTimer);
    api('POST', '/api/mohsey/answer', { answers: a }).then(function (r) {
      setMe(r.me);
      var side = function (a) { return '<div class="duel-ans' + (a.status === 'ok' ? '' : ' bad') + '"><span dir="auto">' + (esc(a.text) || '—') + '</span><b class="pts" data-v="' + a.pts + '">' + a.pts + '</b></div>'; };
      var row = function (id) { return '<li><p class="duel-cat">' + CATNAME(id) + (r.unknown.indexOf(id) >= 0 ? ' <small title="He did not know this word">?</small>' : '') + '</p>' + side(r.you.cats[id]) + side(r.mohsey.cats[id]) + '</li>'; };
      app.innerHTML = back + '<div class="card feature center mohsey">' + window.WPM_PRINCE(96) + '<p class="big-text">' + (r.winner === 'you' ? 'You beat Prince Mohsey!' : r.winner === 'mohsey' ? 'Prince Mohsey wins' : 'A draw') + '</p><p class="turn">' + r.you.total + ' to ' + r.mohsey.total + '</p><p class="soft">“' + esc(r.line) + '”</p></div>' +
        (r.notes.length ? '<p class="soft center">“' + r.notes.map(esc).join(' ') + '”</p>' : '') +
        '<div class="card"><ul class="duel-board"><li class="duel-head"><p class="duel-cat">Letter ' + esc(r.letter) + '</p><b>You</b><b>Prince Mohsey</b></li>' + r.cats.map(row).join('') +
        '<li class="duel-head total"><p class="duel-cat">Total</p><b>' + r.you.total + '</b><b>' + r.mohsey.total + '</b></li></ul></div>' +
        '<div class="row mid"><button class="btn big" data-act="duelstart">Play again</button></div><p class="soft center">' + record(r) + '</p>';
      if (r.winner === 'you') celebrate(); if (r.unlocks && r.unlocks.length) ceremony(r.unlocks);
      window.scrollTo(0, 0);
    }).catch(fail);
  }
  views.mohsey = function () {
    if (!me.finale) { location.hash = 'journey'; return; }
    app.innerHTML = back + '<div class="card"><p class="note">Prince Mohsey is pulling up a chair…</p></div>';
    api('GET', '/api/mohsey').then(function (j) { if (location.hash !== '#mohsey') return; if (j.duel) duelPlay(j.duel); else duelIntro(j); }).catch(fail);
  };

  var quiz = null;
  views.level = function (n) {
    app.innerHTML = '<a class="back" href="#journey">← All chapters</a><div class="card"><p class="note">Opening the chapter…</p></div>'; quiz = null;
    api('GET', '/api/story/' + n).then(function (s) {
      if (location.hash !== '#level-' + n) return;
      app.innerHTML = '<a class="back" href="#journey">← All chapters</a><article class="card story"><p class="eyebrow">Chapter ' + s.n + '</p><h1>' + esc(s.title) + '</h1>' + pic(s.n) +
        (s.video ? '<video controls preload="metadata" src="' + esc(s.video) + '"></video>' : '') + s.story.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('') +
        (s.clue ? '<aside class="clue"><p class="eyebrow">🪶 The Simurgh’s riddle · fragment ' + s.n + ' of 7</p><p>' + esc(s.clue) + '</p></aside>' : '') +
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
      '<form class="card" data-form="password"><p><b>' + (me.hasPassword ? 'Change your password' : 'Set a password') + '</b></p><p class="note">' + (me.hasPassword ? 'Changing it signs you out on your other devices.' : (me.google ? 'You signed up with Google. ' : '') + 'With a password you can sign in on any phone or computer.') + '</p>' +
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
  var nameOf = function (id) { return (table.players.filter(function (p) { return p.id === id; })[0] || { name: 'Someone' }).name; };
  function people() {
    var ref = table.referee;
    return '<ul class="people" id="t-people">' + table.players.map(function (p) {
      return '<li class="' + (p.online ? '' : 'off') + (p.id === ref ? ' ref' : '') + '">' + medal(p, 28) + '<span>' + esc(p.name) + (p.id === ref ? ' <small>⚖️ referee</small>' : '') + (p.id === table.host ? ' <small>host</small>' : '') +
        (table.phase === 'play' && p.inRound ? ' <small>' + p.filled + '/' + table.settings.cats.length + '</small>' : '') + (p.online ? '' : ' <small>away</small>') + '</span></li>';
    }).join('') + '</ul>';
  }
  // Volunteering and voting for the referee, between rounds.
  function election() {
    var st = table, vols = st.volunteers, mineVote = st.votes[me.id], iVol = vols.indexOf(me.id) >= 0, ref = st.referee;
    var count = function (id) { return Object.keys(st.votes).filter(function (v) { return st.votes[v] === id && v !== id; }).length; };
    return '<div class="card election"><p><b>⚖️ The referee</b> <span class="note">plays no round but decides which answers count</span></p>' +
      (ref ? '<p class="turn">' + esc(nameOf(ref)) + (ref === me.id ? ' (you)' : '') + ' is the referee.</p>' : '<p class="note">' + (vols.length ? 'Vote for one of the volunteers.' : 'Nobody has volunteered yet.') + '</p>') +
      (vols.length ? '<ul class="tables">' + vols.map(function (id) {
        var n = count(id), mine = mineVote === id;
        return '<li><span><b>' + esc(nameOf(id)) + (id === me.id ? ' (you)' : '') + '</b><small>' + n + (n === 1 ? ' vote' : ' votes') + (id === ref ? ' · elected' : '') + '</small></span>' +
          (id === me.id ? '' : '<button class="btn small' + (mine ? '' : ' ghost') + '" data-act="elect" data-p="' + id + '" aria-pressed="' + mine + '">' + (mine ? 'Your vote' : 'Vote') + '</button>') + '</li>';
      }).join('') + '</ul>' : '') +
      '<div class="row"><button class="btn small ghost" data-act="volunteer" data-on="' + (iVol ? '' : '1') + '">' + (iVol ? 'Step down as a volunteer' : 'Volunteer as referee') + '</button></div></div>';
  }
  function renderTable() {
    if (!table) return;
    var st = table, s = st.settings, me2 = seat(), host = st.host === me.id || !st.players.some(function (p) { return p.id === st.host && p.online; }), k = [st.code, st.phase, st.round].join('|'), body;
    var iRef = st.referee === me.id, onlineN = st.players.filter(function (p) { return p.online; }).length;
    if (app.dataset.key === k && st.phase === 'play' && $('#t-people')) { $('#t-people').outerHTML = people(); return; }
    app.dataset.key = k;
    var link = location.origin + location.pathname + '#table-' + st.code;
    var notice = st.notice ? '<p class="referee">' + esc(st.notice) + '</p>' : '';
    var startBlock = function (label) {
      if (!host) return '<p class="center soft">Waiting for the host to start' + (st.phase === 'results' ? ' the next round' : '') + '.</p>';
      var why = onlineN < meta.minTable ? 'A table needs at least ' + meta.minTable + ' people: a referee and two players.' : !st.referee ? 'Choose a referee first: someone volunteers, and the others vote.' : '';
      return (why ? '<p class="note center">' + why + '</p>' : '') + '<button class="btn big" data-act="start"' + (why ? ' disabled' : '') + '>' + label + '</button>';
    };
    if (st.phase === 'lobby') {
      body = notice + '<div class="card"><p><b>Invite players</b> <span class="note">' + meta.minTable + ' to ' + meta.maxPlayers + ' at a table</span></p><p class="code">' + st.code + '</p><div class="inline"><label class="sr" for="t-link">Invite link</label><input id="t-link" type="text" readonly value="' + esc(link) + '"><button class="btn small" data-act="copylink">Copy</button></div>' + shareRow(me.name + ' invites you to a round of Esm Famil in “Where is Prince Mohsey?”. Table ' + st.code + ':', link) + '</div>' +
        election() +
        (host ? '<div class="card"><p><b>Table rules</b></p>' +
          '<div class="checks">' + meta.categories.map(function (c) { return '<label><input type="checkbox" id="c-' + c.id + '" data-act="cat" data-id="' + c.id + '"' + (s.cats.indexOf(c.id) >= 0 ? ' checked' : '') + '> ' + c.en + '</label>'; }).join('') + '</div>' +
          '<div class="row" role="group" aria-label="Time">' + [60, 90, 120].map(function (x) { return '<button class="chip" data-act="set" data-f="secs" data-v="' + x + '" aria-pressed="' + (s.secs === x) + '">' + x + ' seconds</button>'; }).join('') + '</div>' +
          startBlock('Start the round') + '</div>'
          : '<div class="card feature"><p class="big-text">Waiting for the host to start.</p><p class="soft">' + s.secs + ' seconds · ' + s.cats.map(function (c) { return catOf(c).en; }).join(', ') + '</p></div>');
    } else if (st.phase === 'play' || st.phase === 'collect') {
      body = '<p class="letter" lang="' + s.lang + '">' + esc(st.letter) + '</p><p class="timer" id="t-time">' + (st.phase === 'play' ? left(st.endsAt) : 0) + '</p>' +
        (st.phase === 'collect' ? '<div class="card feature"><p class="big-text">Pens down!</p></div>'
          : iRef ? '<div class="card feature"><p class="big-text">⚖️ You are the referee.</p><p class="soft">Watch the others fill in their answers. When time is up, you decide which ones count.</p></div>'
          : !me2.inRound ? '<div class="card feature"><p class="big-text">A round is running.</p><p class="soft">You join the next one.</p></div>' :
          '<div class="card">' + s.cats.map(function (id) { var c = catOf(id); return '<div class="field"><label for="e-' + id + '">' + c.en + '</label><input id="e-' + id + '" data-cat="' + id + '" type="text" dir="auto" maxlength="40" autocomplete="off" value="' + esc(mine[id] || '') + '"></div>'; }).join('') +
          '<button class="btn" data-act="stop">Stop! I am done</button><p class="note center">Stop ends the round for everyone. Every box must be filled.</p></div>');
    } else {
      var final = st.phase === 'results', sc = st.scores, mineSc = sc.players[me.id], refName = esc(nameOf(final ? sc.referee : st.referee));
      body = (final ? '<div class="card feature"><p class="big-text">' + (sc.winner ? esc(st.players.filter(function (p) { return p.id === sc.winner; }).map(royalName)[0] || 'Someone') + ' wins the round' : 'No winner this round') + '</p><p class="note">Referee: ' + refName + '</p>' +
          (mineSc ? '<p class="turn">You scored ' + mineSc.total + (!sc.scored ? '. Nothing was added to your record' : mineSc.capped ? '. You have played more rounds this hour than count: take a break' : '') + '</p>' + (sc.scored ? levelLine(me) + (me.quizReady ? '<a class="btn" href="#level-' + (me.level + 1) + '">Read chapter ' + (me.level + 1) + ' and take the quiz</a>' : '') : '') : sc.referee === me.id ? '<p class="turn">Thank you for refereeing.</p>' : '') + '</div>'
        : '<p class="letter" lang="' + s.lang + '">' + esc(st.letter) + '</p>' +
          (iRef ? '<div class="card feature judge-help"><p class="big-text">⚖️ You are the referee</p><p>Every answer counts <b class="ok-t">✓</b> unless you tap it to make it <b class="no-t">✗</b>. Tap again to change your mind. Then press <b>Give the verdict</b> at the bottom.</p><p class="note" id="j-count">' + judgeCount(sc) + '</p></div>' : '<p class="center soft">⚖️ ' + refName + ' is judging the answers. Watch the decisions come in.</p>') +
          '<p class="check-time">The referee has <b id="t-time">' + left(st.reviewEndsAt) + '</b> seconds.</p>') +
        (final ? '<h2 class="center">All the answers</h2><p class="note center">As the referee ' + refName + ' judged them.</p>' : '') +
        '<div class="review">' + (sc.cats || s.cats).map(function (id) { var c = catOf(id);
          return '<div class="review-row"><h3>' + c.en + '</h3>' + sc.order.map(function (pid) {
            var a = sc.players[pid].cats[id], judged = a.status === 'referee';
            var why = a.status === 'empty' ? 'nothing' : a.status === 'letter' ? 'wrong letter' : a.status === 'short' ? 'not a word' : a.status === 'country' ? 'not a country' : judged ? 'rejected by the referee' : a.shared ? 'shared' : '';
            return '<div class="ans' + (a.status === 'ok' ? '' : ' bad') + '"><span dir="auto"><small>' + esc(nameOf(pid)) + (why ? ' · ' + why : '') + '</small><i>' + (esc(a.text) || '—') + '</i></span>' +
              (!final && iRef && (a.status === 'ok' || judged) ? '<button class="judge-btn" data-act="judge" data-p="' + pid + '" data-cat="' + id + '" aria-pressed="' + judged + '" aria-label="' + (judged ? 'Rejected. Tap to accept ' : 'Accepted. Tap to reject ') + esc(a.text) + '">' + (judged ? '✗' : '✓') + '</button>' : '') + '<b class="pts" data-v="' + a.pts + '">' + a.pts + '</b></div>'; }).join('') + '</div>'; }).join('') + '</div>' +
        '<div class="card"><table class="board"><thead><tr><th scope="col">Player</th><th scope="col">Round</th><th scope="col">Table total</th></tr></thead><tbody>' + sc.order.map(function (pid) { var p = st.players.filter(function (x) { return x.id === pid; })[0] || { name: '?', session: 0 }; return '<tr' + (pid === me.id ? ' class="you"' : '') + '><th scope="row">' + esc(p.name) + (final && sc.winner === pid ? ' 👑' : '') + '</th><td>' + sc.players[pid].total + '</td><td>' + p.session + '</td></tr>'; }).join('') + '</tbody></table></div>' +
        (final ? election() + startBlock('Next round') : iRef ? '<div class="verdict-bar"><button class="btn big" data-act="verdict">Give the verdict</button></div>' : '');
    }
    app.innerHTML = back + '<div class="row split"><h1>Table ' + st.code + '</h1><button class="linkbtn" data-act="leave">Leave table</button></div>' + people() + body;
  }

  function judgeCount(sc) {   // how many answers the referee has rejected so far
    var n = 0, all = 0; sc.order.forEach(function (pid) { var c = sc.players[pid].cats; Object.keys(c).forEach(function (k) { if (c[k].status === 'ok' || c[k].status === 'referee') { all++; if (c[k].status === 'referee') n++; } }); });
    return (all - n) + ' accepted · ' + n + ' rejected';
  }

  /* ---------- actions ---------- */
  /* ---------- the owner's dashboard (game.mosi-app.com/#owner): a separate login, not a player ---------- */
  var adminTimer = 0, adminList = [], ownerKey = lsGet('owner'), ownerTimer = 0;
  var ago = function (t) { if (!t) return '—'; var m = Math.round((Date.now() - t) / 60000); return m < 2 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' days ago'; };
  var day = function (t) { return t ? new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'; };
  var O = function (method, path, body) { return api(method, '/api/owner/' + path, body, ownerKey).catch(function (e) { if (e.status === 401) { ownerKey = null; lsSet('owner', null); if (location.hash === '#owner') views.owner(); } throw e; }); };
  function adminRow(p) {
    var armedHere = armed === 'rm:' + p.id;
    return '<li class="adm" data-id="' + p.id + '"><div class="row split"><span><b>' + p.place + '. ' + esc(p.name) + '</b>' + (p.google ? ' <small class="tag">Google</small>' : '') + (p.online ? ' <small class="tag on">at a table</small>' : '') +
      '<small>' + kingdom(p.kingdom).name + ' · chapter ' + (p.finale ? '8 🪶' : p.level) + ' · ' + esc(p.title || 'not yet crowned') + '</small></span></div>' +
      '<dl class="adm-stats"><div><dt>Points</dt><dd>' + num(p.total) + '</dd></div><div><dt>Wins</dt><dd>' + p.wins + '</dd></div><div><dt>Rounds</dt><dd>' + p.rounds + '</dd></div><div><dt>Refereed</dt><dd>' + p.refereed + '</dd></div></dl>' +
      '<p class="note">Joined ' + day(p.createdAt) + ' · last seen ' + ago(p.lastSeen) + ' · signed in on ' + p.devices + (p.devices === 1 ? ' device' : ' devices') + '</p>' +
      '<div class="row"><button class="btn small ghost" data-act="admpw" data-id="' + p.id + '">' + (p.hasPassword ? 'New password' : 'Set a password') + '</button><button class="btn small ' + (armedHere ? 'danger' : 'ghost') + '" data-act="admrm" data-id="' + p.id + '">' + (armedHere ? 'Tap again to remove ' + esc(p.name) : 'Remove account') + '</button></div></li>';
  }
  function adminLoad() {
    var q = ($('#a-find') || {}).value || '';
    O('GET', 'players' + (q.trim() ? '?q=' + encodeURIComponent(q.trim()) : '')).then(function (j) {
      adminList = j.players; var b = $('#a-box'); if (!b) return;
      b.innerHTML = '<p class="note">' + (q.trim() ? j.players.length + ' of ' + j.total + ' players match' : j.total + (j.total === 1 ? ' player' : ' players') + ', in leaderboard order') + '</p>' + (j.players.length ? '<ul class="adm-list">' + j.players.map(adminRow).join('') + '</ul>' : '');
    }).catch(fail);
  }
  var tile = function (label, value, sub) { return '<div class="tile"><dt>' + label + '</dt><dd>' + value + '</dd>' + (sub ? '<small>' + sub + '</small>' : '') + '</div>'; };
  function roundsChart(days) {   // one series, so no legend: the heading names it. Every column has a tooltip; the busiest day and today carry a label.
    var max = Math.max.apply(null, days.map(function (d) { return d.rounds; })), top = Math.max(1, max), busiest = days.map(function (d) { return d.rounds; }).lastIndexOf(max);
    var label = function (d) { return new Date(d.date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }); };
    return '<div class="cols" role="img" aria-label="Rounds played on each of the last 14 days; the table below has every value">' + days.map(function (d, i) {
      var tip = label(d) + ': ' + d.rounds + (d.rounds === 1 ? ' round, ' : ' rounds, ') + d.players + (d.players === 1 ? ' player, ' : ' players, ') + d.signups + ' new';
      return '<div class="col" tabindex="0" data-tip="' + esc(tip) + '"><span class="col-v">' + ((i === busiest && max > 0) || i === days.length - 1 ? d.rounds : '') + '</span><span class="col-bar" style="height:' + (d.rounds ? Math.max(2, 100 * d.rounds / top) : 0) + '%"></span><span class="col-x">' + (i === days.length - 1 ? 'Today' : i % 2 === 1 ? '' : new Date(d.date + 'T12:00:00').getDate()) + '</span></div>';
    }).join('') + '</div><div class="tip" id="o-tip" role="status" hidden></div>' +
      '<details class="table-view"><summary>Show as a table</summary><table class="board"><thead><tr><th scope="col">Day</th><th scope="col">Rounds</th><th scope="col">Players</th><th scope="col">New</th></tr></thead><tbody>' +
      days.slice().reverse().map(function (d) { return '<tr><th scope="row">' + label(d) + '</th><td>' + d.rounds + '</td><td>' + d.players + '</td><td>' + d.signups + '</td></tr>'; }).join('') + '</tbody></table></details>';
  }
  function chaptersChart(p) {
    var rows = p.chapters.map(function (n, i) { return [i === 0 ? 'Not started' : 'Chapter ' + i + ' passed', n]; }).concat([['Found Prince Mohsey 🪶', p.finale]]), top = Math.max(1, Math.max.apply(null, rows.map(function (r) { return r[1]; })));
    return '<ul class="hbars">' + rows.map(function (r) { return '<li data-tip="' + esc(r[0] + ': ' + r[1] + (r[1] === 1 ? ' player' : ' players')) + '" tabindex="0"><span class="hb-l">' + r[0] + '</span><span class="hb-track"><span class="hb-bar" style="width:' + (r[1] ? Math.max(1, 100 * r[1] / top) : 0) + '%"></span><span class="hb-v">' + r[1] + '</span></span></li>'; }).join('') + '</ul>';
  }
  function ownerStats() {
    O('GET', 'stats').then(function (s) {
      var box = $('#o-stats'); if (!box) return;
      box.innerHTML =
        '<section class="card"><h2>Right now</h2><dl class="tiles">' + tile('People online', s.now.online) + tile('Tables open', s.now.tables) + tile('Rounds being played', s.now.playing) + '</dl></section>' +
        '<section class="card"><h2>Players</h2><dl class="tiles">' + tile('Accounts', num(s.players.total), s.players.google + ' with Google') + tile('New this week', s.players.newWeek, s.players.newToday + ' today') + tile('Active today', s.players.activeToday) + tile('Active this week', s.players.activeWeek) + '</dl></section>' +
        '<section class="card"><h2>Rounds</h2><dl class="tiles">' + tile('Today', s.rounds.today, s.rounds.playersToday + (s.rounds.playersToday === 1 ? ' player' : ' players')) + tile('This week', s.rounds.week, s.rounds.playersWeek + (s.rounds.playersWeek === 1 ? ' player' : ' players')) + '</dl>' +
          '<h3 class="chart-h">Rounds played, last 14 days</h3>' + roundsChart(s.days) + '<p class="note">Counting since ' + day(new Date(s.rounds.since + 'T12:00:00').getTime()) + '.</p></section>' +
        '<section class="card"><h2>Progress through Rostam’s life</h2><p class="note">How many players are at each point of the story.</p>' + chaptersChart(s.progress) +
          '<dl class="tiles">' + tile('Quizzes passed', s.progress.quizzesPassed) + tile('Riddle solved', s.progress.finale) + tile('Games vs Mohsey', s.progress.mohseyGames, s.progress.mohseyWins + ' won by players') + '</dl></section>' +
        '<section class="card"><h2>Newest players</h2>' + (s.recent.length ? '<ul class="tables">' + s.recent.map(function (r) { return '<li><span><b>' + esc(r.name) + '</b><small>' + ago(r.createdAt) + (r.google ? ' · Google' : '') + '</small></span></li>'; }).join('') + '</ul>' : '<p class="note">Nobody yet.</p>') + '</section>' +
        '<section class="card"><h2>Top 10</h2>' + board(s.top) + '</section>';
      $('#o-when').textContent = 'Updated ' + new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }).catch(fail);
  }
  views.owner = function () {
    clearInterval(ownerTimer);
    var backLink = me ? back : '<a class="back" href="#">← Back</a>';
    if (!ownerKey) {
      app.innerHTML = backLink + '<form class="card" data-form="owner"><h1>Owner</h1><p class="soft">The dashboard for the game’s owner.</p>' +
        '<div class="field"><label for="o-user">Name</label><input id="o-user" type="text" maxlength="60" autocomplete="username" autocapitalize="none"></div>' +
        '<div class="field"><label for="o-pass">Password</label><input id="o-pass" type="password" maxlength="200" autocomplete="current-password"></div>' +
        '<button class="btn big" type="submit">Open the dashboard</button></form>';
      return;
    }
    app.innerHTML = backLink + '<div class="row split"><h1>Dashboard</h1><div class="row"><button class="btn small ghost" data-act="ownerrefresh">Refresh</button><button class="btn small ghost" data-act="ownerout">Sign out</button></div></div><p class="note" id="o-when"></p>' +
      '<div id="o-stats" class="stack"><p class="note">Loading…</p></div>' +
      '<section class="card"><h2>Accounts</h2><p class="soft">Every account, in leaderboard order. Removing an account deletes its points and badges for good.</p>' +
      '<div class="field"><label for="a-find">Find a player</label><input id="a-find" type="search" maxlength="20" autocomplete="off" placeholder="Type a name"></div><div id="a-box"><p class="note">Loading…</p></div></section>';
    $('#a-find').addEventListener('input', function () { clearTimeout(adminTimer); adminTimer = setTimeout(adminLoad, 250); });
    ownerStats(); adminLoad();
    ownerTimer = setInterval(function () { if (location.hash === '#owner' && ownerKey && !document.hidden) ownerStats(); else if (location.hash !== '#owner') clearInterval(ownerTimer); }, 30000);
  };
  // the tooltips on the dashboard charts: hover, tap or keyboard focus
  function showTip(el) { var tip = $('#o-tip'), t = el && el.closest('[data-tip]'); if (!tip) return; if (!t) { tip.hidden = true; return; } tip.textContent = t.dataset.tip; tip.hidden = false; var r = t.getBoundingClientRect(); tip.style.left = Math.max(8, Math.min(window.innerWidth - tip.offsetWidth - 8, r.left + r.width / 2 - tip.offsetWidth / 2)) + 'px'; tip.style.top = (r.top + window.scrollY - tip.offsetHeight - 8) + 'px'; }
  document.addEventListener('mouseover', function (e) { if (location.hash === '#owner') showTip(e.target); });
  document.addEventListener('focusin', function (e) { if (location.hash === '#owner') showTip(e.target); });

  var acts = {
    ownerrefresh: function () { ownerStats(); adminLoad(); },
    ownerout: function () { O('POST', 'logout').catch(function () { /* signed out here either way */ }); ownerKey = null; lsSet('owner', null); views.owner(); },
    duelstart: function () { api('POST', '/api/mohsey/start').then(duelPlay).catch(fail); },
    admrm: function (el) {
      var id = el.dataset.id, p = adminList.filter(function (x) { return x.id === id; })[0]; if (!p) return;
      if (armed !== 'rm:' + id) { armed = 'rm:' + id; el.closest('li').outerHTML = adminRow(p); setTimeout(function () { if (armed === 'rm:' + id) { armed = ''; var li = $('li[data-id="' + id + '"]'); if (li) li.outerHTML = adminRow(p); } }, 5000); return; }
      armed = ''; O('POST', 'remove', { id: id }).then(function (j) { toast(j.removed + ' was removed'); adminLoad(); }).catch(fail);
    },
    admpw: function (el) {
      var p = adminList.filter(function (x) { return x.id === el.dataset.id; })[0]; if (!p) return;
      var pw = window.prompt('New password for ' + p.name + ' (at least 6 characters). Tell them yourself; they will be signed out everywhere.');
      if (pw === null) return;
      O('POST', 'password', { id: p.id, password: pw }).then(function () { toast('New password set for ' + p.name); }).catch(fail);
    },
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
    judge: function (el) { T('judge', { player: el.dataset.p, cat: el.dataset.cat, accept: el.getAttribute('aria-pressed') === 'true' }).catch(fail); },
    verdict: function () { T('verdict').catch(fail); },
    volunteer: function (el) { T('volunteer', { on: !!el.dataset.on }).catch(fail); },
    elect: function (el) { T('elect', { player: el.getAttribute('aria-pressed') === 'true' ? null : el.dataset.p }).catch(fail); }
  };
  function enter(j) { key = j.key; lsSet('key', key); setMe(j.me); route(); }
  function copy(input, msg) { var manual = function () { input.focus(); input.select(); toast('Select the text and copy it'); }; if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(input.value).then(function () { toast(msg); }, manual); else manual(); }
  var forms = {
    owner: function () { api('POST', '/api/owner/login', { user: $('#o-user').value, password: $('#o-pass').value }).then(function (j) { ownerKey = j.key; lsSet('owner', ownerKey); views.owner(); }).catch(fail); },
    duel: function () { duelSend(); },
    riddle: function () {
      var v = $('#f-answer').value; if (!v.trim()) { toast('Type the name of a city'); return; }
      api('POST', '/api/finale/answer', { answer: v }).then(function (r) {
        if (!r.correct) { var h = $('#f-hint'); h.textContent = r.hint; h.classList.remove('shake'); void h.offsetWidth; h.classList.add('shake'); $('#f-answer').select(); return; }
        setMe(r.me); $('#f-box').innerHTML = finaleEnding(r); $('#f-box').scrollIntoView({ behavior: 'smooth' }); celebrate(); if (r.unlocks && r.unlocks.length) ceremony(r.unlocks);
      }).catch(fail);
    },
    register: function () {
      var b = { name: $('#w-name').value, password: $('#w-pass').value, kingdom: ($('[data-f="kingdom"][aria-pressed="true"]') || {}).dataset.v, royal: ($('[data-f="royal"][aria-pressed="true"]') || {}).dataset.v };
      api('POST', '/api/register', b).then(enter).catch(fail);
    },
    gname: function () {
      if (!gCred) { mode = 'new'; views.welcome(); return; }
      api('POST', '/api/google', { credential: gCred, name: $('#g-name').value, kingdom: ($('[data-f="kingdom"][aria-pressed="true"]') || {}).dataset.v, royal: ($('[data-f="royal"][aria-pressed="true"]') || {}).dataset.v })
        .then(function (j) { gCred = null; enter(j); }).catch(function (e) { if (e.status === 401) { gCred = null; toast('Your Google sign-in timed out. Please continue with Google again.'); mode = 'new'; views.welcome(); } else fail(e); });
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
    if (h === 'guide' || h === 'owner') { views[h](); window.scrollTo(0, 0); return; }
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
