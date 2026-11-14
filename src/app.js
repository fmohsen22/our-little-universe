/* Our Little Universe: shared state store, router and six games.
   State lives in eight small documents. With a shared store (the Artifact `db` capability) both
   devices see the same documents live; without one, everything runs on this device from localStorage. */
(function () {
  'use strict';
  var C = window.OLU_CONTENT;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var clone = function (o) { return JSON.parse(JSON.stringify(o)); };
  var rand = function (a) { return a[Math.floor(Math.random() * a.length)]; };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var norm = function (s) { return String(s || '').trim().toLowerCase().replace(/^(a|an|the)\s+/, '').replace(/[^\p{L}\p{N}]+/gu, ''); };
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function merge(t, p) {
    Object.keys(p || {}).forEach(function (k) {
      var v = p[k];
      if (v && typeof v === 'object' && !Array.isArray(v)) { if (!t[k] || typeof t[k] !== 'object' || Array.isArray(t[k])) t[k] = {}; merge(t[k], v); }
      else t[k] = v;
    });
    return t;
  }
  function lsGet(k, d) { try { var v = window.localStorage.getItem('olu:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function lsSet(k, v) { try { window.localStorage.setItem('olu:' + k, JSON.stringify(v)); } catch (e) { /* fine without it */ } }

  /* ---------- store ---------- */
  var DEFAULTS = {
    players: { names: ['Mosi', 'Sophie'] },
    questions: { cat: 'all', order: [], pos: 0, turn: 0, score: [0, 0] },
    life: { scene: null, lines: [], score: [0, 0] },
    truths: { phase: 'write', author: 0, items: [], lie: 0, guess: -1, score: [0, 0] },
    missions: { mode: 'coop', current: '', done: 0, wins: [0, 0] },
    draw: { phase: 'idle', drawer: 0, word: '', endsAt: 0, strokes: [], guesses: [], solved: false, score: [0, 0] },
    esm: { phase: 'setup', lang: 'en', cats: ['name', 'surname', 'city', 'country', 'animal', 'food'], secs: 90, letter: '', endsAt: 0, answers: { p0: {}, p1: {} }, marks: { p0: {}, p1: {} }, total: [0, 0], round: 0, last: null },
    book: { items: [] },
    scores: { log: [] },
    badges: { p0: {}, p1: {} }
  };
  var S = {}, db = null, chains = {}, syncState = 'local', peers = 0;
  Object.keys(DEFAULTS).forEach(function (k) { S[k] = merge(clone(DEFAULTS[k]), lsGet('doc:' + k, {})); });

  function push(name, op) {
    if (!db) return;
    var ref = db.doc('universe/' + name);
    chains[name] = (chains[name] || Promise.resolve()).then(function () { return op(ref); }).catch(function () { setSync('error'); });
  }
  function save(name, val, quiet) {
    S[name] = val; lsSet('doc:' + name, val);
    var body = clone(val); push(name, function (ref) { return ref.set(body); });
    if (!quiet) refresh(name);
  }
  function patch(name, part, quiet) {
    merge(S[name], clone(part)); lsSet('doc:' + name, S[name]);
    var body = clone(part);
    push(name, function (ref) { return ref.update(body).catch(function () { return ref.set(clone(S[name])); }); });
    if (!quiet) refresh(name);
  }
  function setSync(s) {
    syncState = s; var el = $('#sync'); if (!el) return;
    el.dataset.s = s;
    el.textContent = s === 'live' ? (peers >= 2 ? 'Synced · both online' : 'Synced') : s === 'error' ? 'Not syncing' : 'This device';
    el.title = s === 'live' ? 'Both of you see the same game.' : s === 'error' ? 'This device could not save to the shared room, so changes stay here.' : 'Games are saved on this device only.';
  }
  function connect() {
    // Supabase room first (your own site), otherwise the Artifact's shared store, otherwise this device only.
    var first = window.OLU_BACKEND ? window.OLU_BACKEND({ onPeers: function (n) { peers = n; setSync(syncState); } }) : Promise.resolve(null);
    first.then(function (d) { return d || (window.claude && window.claude.use ? window.claude.use('db') : null); }).then(function (d) {
      if (!d) return;
      db = d; var answered = false;
      var slow = setTimeout(function () { if (!answered) setSync('error'); }, 10000);
      Object.keys(DEFAULTS).forEach(function (name) {
        d.doc('universe/' + name).onSnapshot(function (snap) {
          if (!answered) { answered = true; clearTimeout(slow); setSync('live'); }
          if (!snap.exists) return;
          var next = merge(clone(DEFAULTS[name]), clone(snap.data()));
          if (JSON.stringify(next) === JSON.stringify(S[name])) return;
          S[name] = next; lsSet('doc:' + name, next); refresh(name);
        }, function () { clearTimeout(slow); setSync('error'); });
      });
    }).catch(function () { /* stay local */ });
  }

  /* ---------- shell ---------- */
  var app, me = lsGet('me', 0) === 1 ? 1 : 0, current = null, toastTimer = 0, surprise = null;
  var N = function (i) { return S.players.names[i] || (i ? 'Player two' : 'Player one'); };
  var other = function () { return 1 - me; };
  var left = function (t) { return Math.max(0, Math.ceil((t - Date.now()) / 1000)); };

  function toast(msg) {
    var t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 2600);
  }
  function addMemory(kind, text) {
    var items = S.book.items.concat([{ id: Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36), kind: kind, text: String(text).slice(0, 4000), at: Date.now() }]).slice(-200);
    save('book', { items: items }); toast('Saved to the Memory Book');
  }
  // Every decided round is written to the shared scoreboard: who won, the points, and when.
  function logRound(game, winner, pts) {
    save('scores', { log: S.scores.log.concat([{ at: Date.now(), g: game, w: winner, p: pts }]).slice(-300) });
    if (winner >= 0) checkBadges(winner);
  }
  /* Badges: earned from the round log, then stored in their own document so they stay even if scores are reset. */
  var BADGES = [
    { id: 'first', icon: '🌟', name: 'First win', how: 'Win a round', test: function (c) { return c.wins >= 1; } },
    { id: 'five', icon: '🖐️', name: 'High five', how: 'Win 5 rounds', test: function (c) { return c.wins >= 5; } },
    { id: 'ten', icon: '🔟', name: 'Double digits', how: 'Win 10 rounds', test: function (c) { return c.wins >= 10; } },
    { id: 'twentyfive', icon: '👑', name: 'Royalty', how: 'Win 25 rounds', test: function (c) { return c.wins >= 25; } },
    { id: 'hattrick', icon: '🎩', name: 'Hat-trick', how: 'Win 3 rounds in a row', test: function (c) { return c.streak >= 3; } },
    { id: 'fire', icon: '🔥', name: 'On fire', how: 'Win 5 rounds in a row', test: function (c) { return c.streak >= 5; } },
    { id: 'allround', icon: '🪐', name: 'All-rounder', how: 'Win at least once in all six games', test: function (c) { return GAMES.every(function (g) { return c.by[g] >= 1; }); } },
    { id: 'questions', icon: '💬', name: 'Silver tongue', how: 'Give the better answer 3 times', test: function (c) { return c.by.questions >= 3; } },
    { id: 'life', icon: '📚', name: 'Storyteller', how: 'Have the best idea 3 times', test: function (c) { return c.by.life >= 3; } },
    { id: 'truths', icon: '🧐', name: 'Poker face', how: 'Win Two Truths 3 times', test: function (c) { return c.by.truths >= 3; } },
    { id: 'missions', icon: '🕶️', name: 'Secret agent', how: 'Win 3 missions', test: function (c) { return c.by.missions >= 3; } },
    { id: 'draw', icon: '🔮', name: 'Mind reader', how: 'Guess 3 drawings', test: function (c) { return c.by.draw >= 3; } },
    { id: 'esm', icon: '🧙', name: 'Word wizard', how: 'Win Esm Famil 3 times', test: function (c) { return c.by.esm >= 3; } },
    { id: 'fullhouse', icon: '💯', name: 'Full house', how: 'Score 50 or more in one Esm Famil round', test: function (c) { return c.bestEsm >= 50; } }
  ];
  function badgeStats(p) {
    var c = { wins: 0, streak: 0, by: {}, bestEsm: 0 }; GAMES.forEach(function (g) { c.by[g] = 0; });
    S.scores.log.forEach(function (r) {
      if (r.g === 'esm' && r.p[p] > c.bestEsm) c.bestEsm = r.p[p];
      if (r.w < 0) return;
      if (r.w === p) { c.wins += 1; c.streak += 1; c.by[r.g] = (c.by[r.g] || 0) + 1; } else c.streak = 0;
    });
    return c;
  }
  function checkBadges(p) {
    var c = badgeStats(p), have = S.badges['p' + p] || {}, got = BADGES.filter(function (b) { return !have[b.id] && b.test(c); });
    if (!got.length) return;
    var mine = {}, part = {}; got.forEach(function (b) { mine[b.id] = Date.now(); }); part['p' + p] = mine;
    patch('badges', part); celebrate();
    var msg = N(p) + ' earned ' + got.map(function (b) { return b.icon + ' ' + b.name; }).join(', ');
    setTimeout(function () { toast(msg); }, 600);   // after the game's own message
  }
  function awardRow(label) { return '<div class="row mid"><span class="soft">' + label + '</span><button class="chip" data-act="award" data-i="0">' + esc(N(0)) + ' +1</button><button class="chip" data-act="award" data-i="1">' + esc(N(1)) + ' +1</button></div>'; }
  function award(name, i) { var st = clone(S[name]); st.score[i] += 1; save(name, st); logRound(name, i, i ? [0, 1] : [1, 0]); toast('Point for ' + N(i)); }
  function celebrate() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var c = $('#fx'), g = c.getContext('2d'), w = c.width = window.innerWidth, h = c.height = window.innerHeight;
    var cs = getComputedStyle(document.documentElement), cols = ['--rose', '--gold', '--mint', '--sky', '--lilac'].map(function (n) { return cs.getPropertyValue(n).trim(); });
    var ps = [], t0 = performance.now();
    for (var i = 0; i < 70; i++) ps.push({ x: w / 2, y: h * .45, vx: (Math.random() - .5) * 11, vy: -Math.random() * 11 - 2, r: 3 + Math.random() * 4, c: rand(cols) });
    (function step(t) {
      var age = (t - t0) / 1400; g.clearRect(0, 0, w, h); if (age >= 1) return;
      ps.forEach(function (p) { p.x += p.vx; p.y += p.vy; p.vy += .32; g.globalAlpha = 1 - age; g.fillStyle = p.c; g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill(); });
      requestAnimationFrame(step);
    })(t0);
  }
  var seen = {};
  function once(key, fn) { if (seen[key]) return; seen[key] = 1; fn(); }

  function shell(v, inner) {
    return '<a class="back" href="#home">← All games</a>' +
      '<div class="ghead"><span class="tile-emoji" aria-hidden="true">' + v.emoji + '</span><div><h1>' + v.title + '</h1><p class="soft">' + v.how + '</p></div></div>' + inner;
  }
  function scoreRow(sc) { return '<div class="score"><span>' + esc(N(0)) + ' <b>' + sc[0] + '</b></span><span>' + esc(N(1)) + ' <b>' + sc[1] + '</b></span></div>'; }

  function render() {
    if (!current) return;
    var keep = {}, focus = document.activeElement && document.activeElement.id, sel = null;
    $$('input[id], textarea[id]', app).forEach(function (el) { keep[el.id] = (el.type === 'radio' || el.type === 'checkbox') ? { c: el.checked } : { v: el.value }; });
    if (focus && document.activeElement.selectionStart != null) { try { sel = [document.activeElement.selectionStart, document.activeElement.selectionEnd]; } catch (e) { sel = null; } }
    app.className = 'stack'; app.style.setProperty('--accent', 'var(--' + (current.accent || 'gold') + ')');
    current.render(app);
    Object.keys(keep).forEach(function (id) {
      var el = document.getElementById(id); if (!el || el.dataset.fresh) return;
      if ('c' in keep[id]) { if (!el.dataset.bound) el.checked = keep[id].c; } else if (el.value === '') el.value = keep[id].v;
    });
    if (focus) { var f = document.getElementById(focus); if (f && f !== document.activeElement) { f.focus({ preventScroll: true }); if (sel) { try { f.setSelectionRange(sel[0], sel[1]); } catch (e) { /* not a text field */ } } } }
    var who = $('#who'); who.innerHTML = 'Playing as <b></b>'; who.querySelector('b').textContent = N(me);
    who.setAttribute('aria-label', 'Playing as ' + N(me) + '. Tap to switch to ' + N(other()) + '.');
  }
  function refresh(name) { if (current && (name === 'players' || current.deps.indexOf(name) >= 0)) render(); }
  function route() {
    var id = (window.location.hash || '').replace(/^#/, '');
    current = views[id] || views.home;
    app.textContent = ''; delete app.dataset.key;
    document.title = current === views.home ? 'Our Little Universe' : current.title + ' · Our Little Universe';
    render(); window.scrollTo(0, 0);
  }

  /* ---------- views ---------- */
  var views = {};
  var GAMES = ['questions', 'life', 'truths', 'missions', 'draw', 'esm'];

  views.home = {
    deps: ['book', 'scores'],
    render: function (root) {
      var tiles = GAMES.map(function (id) {
        var v = views[id];
        return '<li><a class="tile" href="#' + id + '" style="--accent: var(--' + v.accent + ')"><span class="tile-emoji" aria-hidden="true">' + v.emoji + '</span><h2>' + v.title + '</h2><p>' + v.sub + '</p></a></li>';
      }).join('');
      var sp = '';
      if (surprise) {
        var v = views[surprise.game];
        sp = '<div class="surprise" style="--accent: var(--' + v.accent + ')"><span class="tile-emoji" aria-hidden="true">' + v.emoji + '</span><p class="eyebrow">Tonight you play</p><h2>' + v.title + '</h2><p class="soft">' + esc(surprise.dare) + '</p><a class="btn" href="#' + surprise.game + '">Let’s play</a></div>';
      }
      root.innerHTML = '<section class="hero"><p class="eyebrow">Our Little Universe</p><h1>What shall we play <em>tonight?</em></h1><p class="soft">A little adventure for two ✨</p></section>' +
        '<ul class="tiles">' + tiles + '</ul>' + sp +
        '<button type="button" class="btn big" data-act="surprise">🎲 Surprise Us!</button>' +
        '<a class="book-link" href="#scores"><span><b>🏆 Scoreboard</b><br><span class="note">' + (S.scores.log.length ? esc(N(0)) + ' ' + roundsWon(0) + ' · ' + esc(N(1)) + ' ' + roundsWon(1) + ' rounds won' : 'Every round you finish is counted here') + '</span></span><span aria-hidden="true">→</span></a>' +
        (window.OLU_ROOM ? '<div class="card"><p><b>Play from two phones</b></p><p class="note">Send this private link to ' + esc(N(1)) + '. Whoever opens it joins your room, and every game stays in step.</p><div class="inline"><label class="sr" for="invite">Invite link</label><input id="invite" data-fresh="1" type="text" readonly value="' + esc(window.OLU_ROOM.link) + '"><button type="button" class="btn small" data-act="copy">Copy</button></div></div>' : '') +
        '<a class="book-link" href="#book"><span><b>📖 Memory Book</b><br><span class="note">' + (S.book.items.length ? S.book.items.length + ' saved so far' : 'Favourite questions, stories and missions land here') + '</span></span><span aria-hidden="true">→</span></a>' +
        '<details class="setup"><summary>Names and how playing together works</summary><form class="stack" data-form="names">' +
        '<div class="inline"><div class="field"><label for="n0">Player one</label><input id="n0" type="text" maxlength="20" value="' + esc(S.players.names[0]) + '"></div>' +
        '<div class="field"><label for="n1">Player two</label><input id="n1" type="text" maxlength="20" value="' + esc(S.players.names[1]) + '"></div></div>' +
        '<button class="btn small ghost" type="submit">Save names</button>' +
        '<p class="note">On one phone: tap “Playing as” at the top to hand over to the other person. On two devices: each of you picks who you are once, and the games stay in step while the status at the top says Synced.</p></form></details>';
    },
    acts: {
      surprise: function () { surprise = { game: rand(GAMES), dare: rand(C.dares) }; render(); },
      copy: function () {
        var i = $('#invite'), done = function () { toast('Link copied. Send it to ' + N(1) + '.'); }, manual = function () { i.focus(); i.select(); toast('Select the link and copy it'); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(i.value).then(done, manual); else manual();
      }
    },
    forms: { names: function () { save('players', { names: [$('#n0').value.trim() || 'Player one', $('#n1').value.trim() || 'Player two'] }); toast('Names saved'); } }
  };

  /* 1. Question Cards */
  function qIds(cat) { var out = []; Object.keys(C.questions).forEach(function (c) { if (cat === 'all' || cat === c) C.questions[c].forEach(function (q, i) { out.push(c + ':' + i); }); }); return out; }
  function qText(id) { var p = id.split(':'); return { cat: p[0], text: (C.questions[p[0]] || [])[+p[1]] || '' }; }
  views.questions = {
    emoji: '💌', title: 'Question Cards', sub: 'Surprise me', accent: 'rose', deps: ['questions'], scoreOf: function () { return S.questions.score; },
    how: 'Flip a card, answer honestly, then pass the turn.',
    render: function (root) {
      var st = S.questions, chips = '<button class="chip" data-act="cat" data-cat="all" aria-pressed="' + (st.cat === 'all') + '">All</button>' +
        Object.keys(C.cats).map(function (c) { return '<button class="chip" data-act="cat" data-cat="' + c + '" aria-pressed="' + (st.cat === c) + '">' + C.cats[c] + '</button>'; }).join('');
      var card;
      if (!st.order.length) card = '<div class="card feature"><p class="big-text">One hundred questions, face down.</p><p class="soft">Pick a category above or play them all.</p><div class="row mid"><button class="btn" data-act="deal">Flip the first card</button></div></div>';
      else {
        var q = qText(st.order[st.pos]), flip = root.dataset.key !== st.order[st.pos]; root.dataset.key = st.order[st.pos];
        card = '<div class="card feature' + (flip ? ' flip' : '') + '"><span class="tag">' + C.cats[q.cat] + '</span><p class="big-text" id="q-text">' + esc(q.text) + '</p>' +
          '<p class="turn">' + esc(N(st.turn)) + ' answers first</p><p class="note">Card ' + (st.pos + 1) + ' of ' + st.order.length + '</p></div>' +
          '<div class="row mid"><button class="btn ghost" data-act="prev"' + (st.pos ? '' : ' disabled') + '>Previous</button><button class="btn ghost" data-act="skip">Skip</button><button class="btn" data-act="next">Next card</button></div>' +
          awardRow('Better answer?') + '<div class="row mid"><button class="btn small ghost" data-act="keep">♡ Keep this question</button></div>';
      }
      root.innerHTML = shell(this, scoreRow(st.score) + '<div class="row mid" role="group" aria-label="Category">' + chips + '</div>' + card);
    },
    acts: {
      cat: function (el) { save('questions', merge(clone(S.questions), { cat: el.dataset.cat, order: shuffle(qIds(el.dataset.cat)), pos: 0 })); },
      deal: function () { save('questions', merge(clone(S.questions), { order: shuffle(qIds(S.questions.cat)), pos: 0 })); },
      award: function (el) { award('questions', +el.dataset.i); },
      next: function () { move(1, true); }, skip: function () { move(1, false); }, prev: function () { move(-1, true); },
      keep: function () { addMemory('Question', qText(S.questions.order[S.questions.pos]).text); }
    }
  };
  function move(d, swap) {
    var st = clone(S.questions); st.pos += d;
    if (st.pos >= st.order.length) { st.order = shuffle(qIds(st.cat)); st.pos = 0; toast('That was the whole deck. Reshuffled.'); }
    if (st.pos < 0) st.pos = 0;
    if (swap) st.turn = 1 - st.turn;
    save('questions', st);
  }

  /* 2. Imaginary Life */
  function newScene() { var j = shuffle(C.life.jobs); return { country: rand(C.life.countries), jobs: [j[0], j[1]], home: rand(C.life.homes), pet: rand(C.life.pets), event: rand(C.life.events) }; }
  function sceneText(s) { return 'You live in ' + s.country + ', in ' + s.home + '. ' + N(0) + ' is ' + s.jobs[0] + ' and ' + N(1) + ' is ' + s.jobs[1] + '. You have ' + s.pet + '. And then ' + s.event + '.'; }
  views.life = {
    emoji: '🌍', title: 'Imaginary Life', sub: 'Build our story', accent: 'mint', deps: ['life'], scoreOf: function () { return S.life.score; },
    how: 'Roll a life, then take turns adding what happens next.',
    render: function (root) {
      var st = S.life, s = st.scene, m = function (t) { return '<mark>' + esc(t) + '</mark>'; };
      if (!s) { root.innerHTML = shell(this, '<div class="card feature"><p class="big-text">Somewhere, another version of you two is living a very different life.</p><div class="row mid"><button class="btn" data-act="roll">Roll our life</button></div></div>'); return; }
      var lines = st.lines.map(function (l) { return l.twist ? '<li class="twist"><b>Plot twist</b>' + esc(l.text) + '</li>' : '<li><b>' + esc(N(l.by)) + '</b>' + esc(l.text) + '</li>'; }).join('');
      root.innerHTML = shell(this, scoreRow(st.score) + '<div class="card"><p class="scene">You live in ' + m(s.country) + ', in ' + m(s.home) + '. ' + esc(N(0)) + ' is ' + m(s.jobs[0]) + ' and ' + esc(N(1)) + ' is ' + m(s.jobs[1]) + '. You have ' + m(s.pet) + '. And then ' + m(s.event) + '.</p></div>' +
        (lines ? '<ol class="story">' + lines + '</ol>' : '<p class="note center">No story yet. Someone has to say what happens first.</p>') +
        '<form class="stack" data-form="line"><div class="field"><label for="l-text">' + esc(N(me)) + ', what happens next?</label><textarea id="l-text" maxlength="400" placeholder="One or two sentences"></textarea></div>' +
        '<div class="row"><button class="btn" type="submit">Add to the story</button><button class="btn ghost" type="button" data-act="twist">⚡ Plot twist</button></div></form>' +
        awardRow('Best idea so far?') + '<div class="row split"><button class="btn small ghost" data-act="keep">♡ Save this story</button><button class="btn small ghost" data-act="roll">Roll a new life</button></div>');
    },
    acts: {
      roll: function () { save('life', merge(clone(S.life), { scene: newScene(), lines: [] })); },
      award: function (el) { award('life', +el.dataset.i); },
      twist: function () { save('life', merge(clone(S.life), { lines: S.life.lines.concat([{ twist: true, text: rand(C.life.twists) }]).slice(-60) })); },
      keep: function () { addMemory('Imaginary life', sceneText(S.life.scene) + S.life.lines.map(function (l) { return '\n' + (l.twist ? 'Plot twist: ' : N(l.by) + ': ') + l.text; }).join('')); }
    },
    forms: { line: function () {
      var t = $('#l-text'), v = t.value.trim(); if (!v) { toast('Write a sentence first'); return; }
      t.value = ''; save('life', merge(clone(S.life), { lines: S.life.lines.concat([{ by: me, text: v }]).slice(-60) }));
    } }
  };

  /* 3. Two Truths & One Lie */
  views.truths = {
    emoji: '🎭', title: 'Two Truths & One Lie', sub: 'Guess the lie', accent: 'lilac', deps: ['truths'], scoreOf: function () { return S.truths.score; },
    how: 'One of you writes three statements. The other finds the false one.',
    render: function (root) {
      var st = S.truths, a = st.author, mine = me === a, body;
      if (st.phase === 'write') {
        body = mine ? '<form class="card" data-form="send"><p class="turn">' + esc(N(a)) + ', write two truths and one lie. Keep the screen to yourself.</p>' +
          [0, 1, 2].map(function (i) { return '<div class="field"><label for="t' + i + '">Statement ' + (i + 1) + '</label><input id="t' + i + '" type="text" maxlength="160" autocomplete="off"><label class="lie-pick"><input type="radio" name="lie" id="lie' + i + '" value="' + i + '"' + (i === 0 ? ' checked' : '') + '> This one is the lie</label></div>'; }).join('') +
          '<button class="btn" type="submit">Hand over to ' + esc(N(1 - a)) + '</button></form>'
          : '<div class="card feature"><p class="big-text">' + esc(N(a)) + ' is writing three statements.</p><p class="soft">No peeking. They will appear here when ready.</p></div>';
      } else if (st.phase === 'guess') {
        body = mine ? '<div class="card feature"><p class="big-text">' + esc(N(1 - a)) + ' is studying your face.</p><p class="soft">Stay calm. Say nothing.</p></div>'
          : '<div class="card"><p class="turn">' + esc(N(1 - a)) + ', which one is the lie?</p><div class="options">' + st.items.map(function (t, i) { return '<button class="option" data-act="guess" data-i="' + i + '">' + esc(t) + '</button>'; }).join('') + '</div></div>';
      } else {
        var right = st.guess === st.lie;
        if (right) once('truths' + st.items.join('|'), celebrate);
        body = '<div class="card"><p class="turn center">' + (right ? esc(N(1 - a)) + ' found the lie!' : esc(N(a)) + ' fooled ' + esc(N(1 - a)) + '!') + '</p><div class="options">' +
          st.items.map(function (t, i) { var lie = i === st.lie; return '<div class="option ' + (lie ? 'lie' : 'truth') + '">' + esc(t) + '<small>' + (lie ? 'The lie' : 'True') + (i === st.guess ? ' · guessed' : '') + '</small></div>'; }).join('') +
          '</div><p class="soft center">' + esc(N(a)) + ', now tell the real story behind the surprising one.</p><div class="row mid"><button class="btn" data-act="swap">Switch turns</button></div></div>';
      }
      root.innerHTML = shell(this, scoreRow(st.score) + body);
    },
    acts: {
      guess: function (el) { var st = clone(S.truths), g = +el.dataset.i; st.guess = g; st.phase = 'reveal'; var w = g === st.lie ? 1 - st.author : st.author; st.score[w] += 1; save('truths', st); logRound('truths', w, w ? [0, 1] : [1, 0]); },
      swap: function () { save('truths', { phase: 'write', author: 1 - S.truths.author, items: [], lie: 0, guess: -1, score: S.truths.score }); }
    },
    forms: { send: function () {
      var items = [0, 1, 2].map(function (i) { return $('#t' + i).value.trim(); });
      if (items.some(function (t) { return !t; })) { toast('Fill in all three statements'); return; }
      var lie = +($('input[name="lie"]:checked') || { value: 0 }).value;
      [0, 1, 2].forEach(function (i) { $('#t' + i).value = ''; });
      save('truths', { phase: 'guess', author: S.truths.author, items: items, lie: lie, guess: -1, score: S.truths.score });
    } }
  };

  /* 4. Secret Missions */
  views.missions = {
    emoji: '🕵️', title: 'Secret Missions', sub: 'Go exploring', accent: 'gold', deps: ['missions'], scoreOf: function () { return S.missions.wins; },
    how: 'A small challenge for a walk or a date. No tracking, just the two of you.',
    render: function (root) {
      var st = S.missions, coop = st.mode === 'coop';
      var card = st.current ? '<div class="card feature flip"><span class="tag">' + (coop ? 'Together' : 'Against each other') + '</span><p class="big-text">' + esc(st.current) + '</p></div>' +
        (coop ? '<div class="row mid"><button class="btn" data-act="done">We did it</button><button class="btn ghost" data-act="deal">Another one</button></div>'
          : '<p class="center soft">Who won?</p><div class="row mid"><button class="btn" data-act="win" data-i="0">' + esc(N(0)) + '</button><button class="btn" data-act="win" data-i="1">' + esc(N(1)) + '</button><button class="btn ghost" data-act="deal">Another one</button></div>')
        : '<div class="card feature"><p class="big-text">Your mission, should you both choose to accept it.</p><div class="row mid"><button class="btn" data-act="deal">Give us a mission</button></div></div>';
      root.innerHTML = shell(this, '<div class="row mid" role="group" aria-label="Mission type"><button class="chip" data-act="mode" data-m="coop" aria-pressed="' + coop + '">Together</button><button class="chip" data-act="mode" data-m="versus" aria-pressed="' + !coop + '">Against each other</button></div>' +
        card + '<div class="score"><span>Done together <b>' + st.done + '</b></span><span>' + esc(N(0)) + ' <b>' + st.wins[0] + '</b></span><span>' + esc(N(1)) + ' <b>' + st.wins[1] + '</b></span></div>');
    },
    acts: {
      mode: function (el) { var st = clone(S.missions); st.mode = el.dataset.m; st.current = ''; save('missions', st); },
      deal: function () { var st = clone(S.missions), pool = C.missions[st.mode].filter(function (m) { return m !== st.current; }); st.current = rand(pool); save('missions', st); },
      done: function () { var st = clone(S.missions), text = st.current; st.done += 1; st.current = ''; save('missions', st); celebrate(); addMemory('Mission completed', text); },
      win: function (el) { var st = clone(S.missions), i = +el.dataset.i, text = st.current; st.wins[i] += 1; st.current = ''; save('missions', st); logRound('missions', i, i ? [0, 1] : [1, 0]); celebrate(); addMemory('Mission won by ' + N(i), text); }
    }
  };

  /* 5. Draw & Guess */
  var INKS = ['#23183A', '#E5484D', '#F2A33A', '#2F9E77', '#3E7BE0', '#B05AD9'], ink = INKS[0], stroke = null;
  function paintDraw() {
    var c = $('#d-canvas'); if (!c) return;
    var g = c.getContext('2d'), w = c.width;
    g.fillStyle = '#FFFDF8'; g.fillRect(0, 0, w, w); g.lineCap = 'round'; g.lineJoin = 'round';
    S.draw.strokes.concat(stroke ? [stroke] : []).forEach(function (s) {
      g.strokeStyle = s.c; g.lineWidth = s.w * w / 1000; g.beginPath();
      for (var i = 0; i < s.p.length; i += 2) { var x = s.p[i] * w / 1000, y = s.p[i + 1] * w / 1000; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
      if (s.p.length === 2) g.lineTo(s.p[0] * w / 1000 + .01, s.p[1] * w / 1000);
      g.stroke();
    });
  }
  function guessList() { var l = $('#d-guesses'); if (l) l.innerHTML = S.draw.guesses.map(function (x) { return '<li>' + esc(x.text) + '</li>'; }).join(''); }
  function bindCanvas(c) {
    var at = function (e) { var r = c.getBoundingClientRect(); return [Math.round((e.clientX - r.left) / r.width * 1000), Math.round((e.clientY - r.top) / r.height * 1000)]; };
    c.addEventListener('pointerdown', function (e) {
      if (S.draw.strokes.reduce(function (n, s) { return n + s.p.length; }, 0) > 12000) { toast('The page is full. Clear it to keep drawing.'); return; }
      e.preventDefault(); try { c.setPointerCapture(e.pointerId); } catch (x) { /* ok */ }
      stroke = { c: ink, w: ink === '#FFFDF8' ? 46 : 9, p: at(e) }; paintDraw();
    });
    c.addEventListener('pointermove', function (e) {
      if (!stroke) return; var p = at(e), n = stroke.p.length;
      if (Math.abs(p[0] - stroke.p[n - 2]) + Math.abs(p[1] - stroke.p[n - 1]) < 5) return;
      stroke.p.push(p[0], p[1]); paintDraw();
    });
    var end = function () { if (!stroke) return; var s = stroke; stroke = null; patch('draw', { strokes: S.draw.strokes.concat([s]) }, true); paintDraw(); };
    c.addEventListener('pointerup', end); c.addEventListener('pointercancel', end);
  }
  views.draw = {
    emoji: '🎨', title: 'Draw & Guess', sub: 'Creative chaos', accent: 'peach', deps: ['draw'], scoreOf: function () { return S.draw.score; },
    how: 'Sixty seconds. One of you draws, the other guesses.',
    render: function (root) {
      var st = S.draw, d = st.drawer, iDraw = me === d, live = st.phase === 'draw' && Date.now() < st.endsAt, over = st.phase === 'done' || (st.phase === 'draw' && !live);
      var key = ['draw', st.phase, over, d, me].join('|');
      if (root.dataset.key === key && $('#d-canvas')) { paintDraw(); guessList(); return; }
      root.dataset.key = key; stroke = null;
      var body, pad = '<div class="pad"><canvas id="d-canvas" aria-label="Drawing"></canvas></div>';
      if (st.phase === 'idle') {
        body = iDraw ? '<div class="card feature"><p class="turn">' + esc(N(d)) + ', you are drawing. Keep the screen to yourself.</p>' +
          (st.word ? '<p class="secret" id="d-word">' + esc(st.word) + '</p><div class="row mid"><button class="btn" data-act="start">Start 60 seconds</button><button class="btn ghost" data-act="word">Different word</button></div>'
            : '<div class="row mid"><button class="btn" data-act="word">Show me a word</button></div>') + '</div>'
          : '<div class="card feature"><p class="big-text">' + esc(N(d)) + ' is choosing what to draw.</p><p class="soft">Get your guessing face on.</p></div>';
      } else if (live) {
        body = '<p class="timer" id="d-time">' + left(st.endsAt) + '</p>' + pad + (iDraw
          ? '<p class="center">Draw: <b>' + esc(st.word) + '</b></p><div class="swatches">' + INKS.map(function (c) { return '<button class="swatch" data-act="ink" data-c="' + c + '" style="background:' + c + '" aria-label="Colour" aria-pressed="' + (c === ink) + '"></button>'; }).join('') +
            '<button class="chip" data-act="ink" data-c="#FFFDF8" aria-pressed="' + (ink === '#FFFDF8') + '">Eraser</button><button class="chip" data-act="undo">Undo</button><button class="chip" data-act="clear">Clear</button></div>'
          : '<form class="inline" data-form="guess"><label class="sr" for="d-guess">Your guess</label><input id="d-guess" type="text" maxlength="60" autocomplete="off" placeholder="What is it?"><button class="btn" type="submit">Guess</button></form>') +
          '<ul class="guesses" id="d-guesses" aria-label="Guesses so far"></ul>';
      } else {
        if (st.solved) once('draw' + st.endsAt, celebrate);
        body = '<div class="card center"><p class="turn">' + (st.solved ? esc(N(1 - d)) + ' got it!' : 'Time is up.') + '</p><p class="secret">' + esc(st.word) + '</p></div>' + pad +
          '<div class="row mid"><button class="btn" data-act="again">Next round, ' + esc(N(1 - d)) + ' draws</button><button class="btn small ghost" data-act="keep">♡ Keep the word</button></div>';
      }
      root.innerHTML = shell(this, scoreRow(st.score) + body);
      var c = $('#d-canvas');
      if (c) { var dpr = Math.min(window.devicePixelRatio || 1, 2); c.width = c.height = Math.max(200, Math.round(c.clientWidth * dpr)); paintDraw(); guessList(); if (iDraw && live) bindCanvas(c); }
    },
    tick: function () {
      var st = S.draw, t = $('#d-time'); if (st.phase !== 'draw') return;
      if (Date.now() >= st.endsAt) { if (t) render(); return; }
      if (t) { var s = left(st.endsAt); t.textContent = s; t.classList.toggle('low', s <= 10); }
    },
    acts: {
      word: function () { patch('draw', { word: rand(C.drawWords.filter(function (w) { return w !== S.draw.word; })) }); },
      start: function () { patch('draw', { phase: 'draw', endsAt: Date.now() + 60000, strokes: [], guesses: [], solved: false }); },
      ink: function (el) { ink = el.dataset.c; $$('[data-act="ink"]').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.c === ink); }); },
      undo: function () { patch('draw', { strokes: S.draw.strokes.slice(0, -1) }, true); paintDraw(); },
      clear: function () { patch('draw', { strokes: [] }, true); paintDraw(); },
      again: function () { save('draw', merge(clone(DEFAULTS.draw), { drawer: 1 - S.draw.drawer, score: S.draw.score })); },
      keep: function () { addMemory('Drawing', N(S.draw.drawer) + ' drew “' + S.draw.word + '”' + (S.draw.solved ? ' and ' + N(1 - S.draw.drawer) + ' guessed it.' : ' and nobody guessed it.')); }
    },
    forms: { guess: function () {
      var i = $('#d-guess'), v = i.value.trim(), st = S.draw; if (!v) return; i.value = '';
      var ok = norm(v) === norm(st.word), p = { guesses: st.guesses.concat([{ by: me, text: v }]).slice(-12) };
      if (ok) { var sc = st.score.slice(); sc[me] += 2; sc[st.drawer] += 1; p.solved = true; p.phase = 'done'; p.score = sc; }
      patch('draw', p);
      if (ok) { var pts = [0, 0]; pts[me] = 2; pts[st.drawer] = 1; logRound('draw', me, pts); }
    } }
  };

  /* 6. Esm Famil */
  function esmCat(id) { return C.esmCats.filter(function (c) { return c.id === id; })[0]; }
  function esmAnswer(p, cat) { return ((S.esm.answers['p' + p] || {})[cat] || '').trim(); }
  function esmMark(p, cat) {
    var m = (S.esm.marks['p' + p] || {})[cat]; if (typeof m === 'number') return m;
    var a = esmAnswer(p, cat), b = esmAnswer(1 - p, cat);
    return !a ? 0 : (norm(a) === norm(b) ? 5 : 10);
  }
  function esmCollect() { var out = {}; $$('input[data-cat]').forEach(function (el) { out[el.dataset.cat] = el.value.slice(0, 60); }); return out; }
  var esmTimer = 0;
  views.esm = {
    emoji: '🔤', title: 'Esm Famil', sub: 'Word battle', accent: 'sky', deps: ['esm'], scoreOf: function () { return S.esm.total; },
    how: 'اسم فامیل. One letter, a handful of categories, and a clock.',
    render: function (root) {
      var st = S.esm, live = st.phase === 'play' && Date.now() < st.endsAt, review = st.phase === 'review' || (st.phase === 'play' && !live), body;
      if (!live && $('input[data-cat]')) { var mineNow = esmCollect(); if (JSON.stringify(mineNow) !== JSON.stringify(st.answers['p' + me] || {})) { var a0 = {}; a0['p' + me] = mineNow; patch('esm', { answers: a0 }, true); } }
      if (live) {
        body = '<p class="letter" lang="' + st.lang + '">' + esc(st.letter) + '</p><p class="timer" id="e-time">' + left(st.endsAt) + '</p>' +
          '<div class="card">' + st.cats.map(function (id) { var c = esmCat(id); return '<div class="field"><label for="e-' + id + '">' + c.en + ' <span class="soft" lang="fa">' + c.fa + '</span></label><input id="e-' + id + '" data-cat="' + id + '" type="text" dir="auto" maxlength="60" autocomplete="off" value="' + esc((st.answers['p' + me] || {})[id] || '') + '"></div>'; }).join('') +
          '<button class="btn" data-act="stop">Stop! I am done</button><p class="note center">Stopping ends the round for both of you.</p></div>';
      } else if (review) {
        body = '<p class="letter" lang="' + st.lang + '">' + esc(st.letter) + '</p><p class="center soft">Check each other’s answers. Tap a score to change it: 10 for a good one, 5 if you wrote the same, 0 if it does not count.</p><div class="review">' +
          st.cats.map(function (id) { var c = esmCat(id);
            return '<div class="review-row"><h3>' + c.en + ' · <span lang="fa">' + c.fa + '</span></h3>' + [0, 1].map(function (p) { var m = esmMark(p, id);
              return '<div class="ans"><span dir="auto"><small>' + esc(N(p)) + '</small>' + (esc(esmAnswer(p, id)) || '<span class="soft">nothing</span>') + '</span><button class="pts" data-act="mark" data-p="' + p + '" data-cat="' + id + '" data-v="' + m + '" aria-label="' + esc(N(p)) + ', ' + c.en + ': ' + m + ' points. Tap to change.">' + m + '</button></div>'; }).join('') + '</div>'; }).join('') +
          '</div><div class="row mid"><button class="btn" data-act="finish">Add up the points</button></div>';
      } else {
        body = (st.last ? '<p class="center turn">Round ' + st.round + ', letter ' + esc(st.last.letter) + ': ' + esc(N(0)) + ' ' + st.last.sums[0] + ', ' + esc(N(1)) + ' ' + st.last.sums[1] + '</p>' : '') +
          '<div class="card"><div class="row" role="group" aria-label="Alphabet"><button class="chip" data-act="lang" data-l="en" aria-pressed="' + (st.lang === 'en') + '">English letters</button><button class="chip" data-act="lang" data-l="fa" aria-pressed="' + (st.lang === 'fa') + '">حروف فارسی</button></div>' +
          '<div class="checks">' + C.esmCats.map(function (c) { return '<label><input type="checkbox" id="c-' + c.id + '" data-bound="1" data-act="cat" data-id="' + c.id + '"' + (st.cats.indexOf(c.id) >= 0 ? ' checked' : '') + '> ' + c.en + ' <span class="soft" lang="fa">' + c.fa + '</span></label>'; }).join('') + '</div>' +
          '<div class="row" role="group" aria-label="Time">' + [60, 90, 120].map(function (s) { return '<button class="chip" data-act="secs" data-s="' + s + '" aria-pressed="' + (st.secs === s) + '">' + s + ' seconds</button>'; }).join('') + '</div>' +
          '<button class="btn" data-act="start">Pick a letter and start</button><p class="note center">Answers in English or Persian both work.</p></div>' +
          (st.round ? '<div class="row mid"><button class="linkbtn" data-act="reset">Reset the scores</button></div>' : '');
      }
      root.innerHTML = shell(this, scoreRow(st.total) + body);
    },
    tick: function () {
      var st = S.esm, t = $('#e-time'); if (st.phase !== 'play') return;
      if (Date.now() >= st.endsAt) { if (t) render(); return; }
      if (t) { var s = left(st.endsAt); t.textContent = s; t.classList.toggle('low', s <= 10); }
    },
    // On a shared phone, save the current player's answers before the other one takes over.
    handover: function () { clearTimeout(esmTimer); if (S.esm.phase === 'play' && $('input[data-cat]')) { var a = {}; a['p' + me] = esmCollect(); patch('esm', { answers: a }, true); } },
    input: function (el) {
      if (!el.dataset.cat) return;
      clearTimeout(esmTimer); esmTimer = setTimeout(function () { if (S.esm.phase !== 'play' || !$('input[data-cat]')) return; var a = {}; a['p' + me] = esmCollect(); patch('esm', { answers: a }, true); }, 700);
    },
    acts: {
      lang: function (el) { patch('esm', { lang: el.dataset.l }); },
      secs: function (el) { patch('esm', { secs: +el.dataset.s }); },
      cat: function (el) { var cats = C.esmCats.map(function (c) { return c.id; }).filter(function (id) { return id === el.dataset.id ? el.checked : S.esm.cats.indexOf(id) >= 0; }); if (cats.length < 2) { el.checked = true; toast('Keep at least two categories'); return; } patch('esm', { cats: cats }); },
      start: function () { var st = clone(S.esm); st.phase = 'play'; st.letter = rand(C.letters[st.lang].filter(function (l) { return l !== st.letter; })); st.endsAt = Date.now() + st.secs * 1000; st.answers = { p0: {}, p1: {} }; st.marks = { p0: {}, p1: {} }; save('esm', st); },
      stop: function () { clearTimeout(esmTimer); var a = {}; a['p' + me] = esmCollect(); patch('esm', { phase: 'review', answers: a }); },
      mark: function (el) { var m = {}, p = {}; p[el.dataset.cat] = { 10: 5, 5: 0, 0: 10 }[el.dataset.v]; m['p' + el.dataset.p] = p; patch('esm', { marks: m }); },
      finish: function () {
        var st = clone(S.esm), sums = [0, 1].map(function (p) { return st.cats.reduce(function (n, id) { return n + esmMark(p, id); }, 0); });
        st.total = [st.total[0] + sums[0], st.total[1] + sums[1]]; st.round += 1; st.phase = 'setup'; st.last = { letter: st.letter, sums: sums }; save('esm', st); logRound('esm', sums[0] === sums[1] ? -1 : (sums[0] > sums[1] ? 0 : 1), sums);
        if (sums[0] !== sums[1]) celebrate();
        toast(sums[0] === sums[1] ? 'A tie!' : N(sums[0] > sums[1] ? 0 : 1) + ' wins the round');
      },
      reset: function () { var st = clone(S.esm); st.total = [0, 0]; st.round = 0; st.last = null; save('esm', st); }
    }
  };

  /* Scoreboard */
  function roundsWon(p, g) { return S.scores.log.filter(function (r) { return r.w === p && (!g || r.g === g); }).length; }
  var resetArmed = false;
  views.scores = {
    emoji: '🏆', title: 'Scoreboard', sub: '', accent: 'gold', deps: ['scores', 'badges', 'questions', 'life', 'truths', 'missions', 'draw', 'esm'],
    how: 'Points in every game and every round you have decided, saved for both of you.',
    render: function (root) {
      var a = roundsWon(0), b = roundsWon(1), log = S.scores.log.slice(-12).reverse();
      var head = !S.scores.log.length ? 'No rounds played yet.' : a === b ? 'All square at ' + a + ' rounds each.' : N(a > b ? 0 : 1) + ' leads ' + Math.max(a, b) + ' to ' + Math.min(a, b) + '.';
      root.innerHTML = shell(this, '<div class="card feature"><p class="big-text" id="lead">' + esc(head) + '</p><div class="score"><span>' + esc(N(0)) + ' <b>' + a + '</b></span><span>' + esc(N(1)) + ' <b>' + b + '</b></span></div><p class="note">Rounds won across all games</p></div>' +
        '<div class="card"><table class="board"><thead><tr><th scope="col">Game</th><th scope="col">' + esc(N(0)) + '</th><th scope="col">' + esc(N(1)) + '</th></tr></thead><tbody>' +
        GAMES.map(function (id) { var v = views[id], sc = v.scoreOf(); return '<tr><th scope="row"><a href="#' + id + '">' + v.emoji + ' ' + v.title + '</a><small>rounds won ' + roundsWon(0, id) + ' : ' + roundsWon(1, id) + '</small></th><td>' + sc[0] + '</td><td>' + sc[1] + '</td></tr>'; }).join('') +
        '</tbody></table><p class="note">The numbers are each game’s own points.</p></div>' +
        '<div class="card"><p><b>Badges</b> <span class="note">' + esc(N(0)) + ' ' + Object.keys(S.badges.p0).length + ' · ' + esc(N(1)) + ' ' + Object.keys(S.badges.p1).length + ' of ' + BADGES.length + '</span></p><ul class="badges">' +
        BADGES.map(function (bd) { var who = [0, 1].filter(function (i) { return S.badges['p' + i][bd.id]; });
          return '<li class="badge' + (who.length ? ' earned' : '') + '"><span class="badge-icon" aria-hidden="true">' + bd.icon + '</span><span><b>' + bd.name + '</b><small>' + bd.how + '</small>' + (who.length ? '<span class="holders">' + who.map(function (i) { return '<i>' + esc(N(i)) + '</i>'; }).join('') + '</span>' : '') + '</span></li>'; }).join('') + '</ul></div>' +
        (log.length ? '<div class="card"><p><b>Latest rounds</b></p><ul class="rounds">' + log.map(function (r) { var v = views[r.g] || { emoji: '', title: r.g };
          return '<li><span>' + v.emoji + ' ' + esc(v.title) + '<small>' + new Date(r.at).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + '</small></span><span>' + (r.w < 0 ? 'Tie' : esc(N(r.w)) + ' won') + '<small>' + r.p[0] + ' : ' + r.p[1] + '</small></span></li>'; }).join('') + '</ul></div>' : '') +
        '<div class="row mid"><button class="linkbtn" data-act="reset">' + (resetArmed ? 'Tap again to erase every score' : 'Reset all scores') + '</button></div>');
    },
    acts: { reset: function () {
      if (!resetArmed) { resetArmed = true; render(); setTimeout(function () { resetArmed = false; if (current === views.scores) render(); }, 4000); return; }
      resetArmed = false;
      ['questions', 'life', 'truths', 'draw'].forEach(function (n) { save(n, merge(clone(S[n]), { score: [0, 0] }), true); });
      save('missions', merge(clone(S.missions), { wins: [0, 0], done: 0 }), true);
      save('esm', merge(clone(S.esm), { total: [0, 0], round: 0, last: null }), true);
      save('scores', { log: [] }); toast('Scores reset');
    } }
  };

  /* Memory Book */
  views.book = {
    emoji: '📖', title: 'Memory Book', sub: '', accent: 'rose', deps: ['book'],
    how: 'The questions, stories and missions you chose to keep.',
    render: function (root) {
      var items = S.book.items.slice().reverse();
      root.innerHTML = shell(this, items.length ? '<ul class="memories">' + items.map(function (m) {
        return '<li><div class="meta"><span>' + esc(m.kind) + ' · ' + new Date(m.at).toLocaleDateString() + '</span><button class="linkbtn" data-act="remove" data-id="' + esc(m.id) + '">Remove</button></div><pre>' + esc(m.text) + '</pre></li>';
      }).join('') + '</ul>' : '<div class="card feature"><p class="big-text">Nothing saved yet.</p><p class="soft">Tap ♡ on a question, a story or a drawing, or finish a mission, and it lands here.</p><div class="row mid"><a class="btn" href="#home">Find a game</a></div></div>');
    },
    acts: { remove: function (el) { save('book', { items: S.book.items.filter(function (m) { return m.id !== el.dataset.id; }) }); toast('Removed'); } }
  };

  /* ---------- boot ---------- */
  function start() {
    app = $('#app'); setSync('local');
    app.addEventListener('click', function (e) {
      var el = e.target.closest('[data-act]'); if (!el || el.disabled || el.type === 'checkbox') return;
      var fn = current.acts && current.acts[el.dataset.act]; if (fn) fn(el);
    });
    app.addEventListener('change', function (e) { var el = e.target; if (el.type === 'checkbox' && el.dataset.act && current.acts[el.dataset.act]) current.acts[el.dataset.act](el); });
    app.addEventListener('input', function (e) { if (current.input) current.input(e.target); });
    app.addEventListener('submit', function (e) {
      e.preventDefault(); var f = e.target.closest('[data-form]'), fn = f && current.forms && current.forms[f.dataset.form]; if (fn) fn(f);
    });
    $('#who').addEventListener('click', function () {
      if (current.handover) current.handover();
      me = 1 - me; lsSet('me', me); app.textContent = ''; delete app.dataset.key; render(); toast('Now playing as ' + N(me));
    });
    window.addEventListener('hashchange', route);
    window.addEventListener('resize', function () { if (current === views.draw) { delete app.dataset.key; render(); } });
    setInterval(function () { if (current && current.tick) current.tick(); }, 250);
    route(); connect();
  }
  start();
})();
