/* Two-phone play through Supabase. Active only when config.js holds a project URL and anon key.
   Each couple plays in a room named by a long random code carried in the invite link (?room=...).
   Moves travel instantly over a Realtime broadcast channel and are saved through three database
   functions (see supabase/schema.sql). The object returned looks like the store app.js expects:
   doc(path) with set, update and onSnapshot. */
(function () {
  'use strict';
  var cfg = window.OLU_CONFIG || {};
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) return;
  function lsGet(k) { try { var v = window.localStorage.getItem('olu:' + k); return v == null ? null : JSON.parse(v); } catch (e) { return null; } }
  function lsSet(k, v) { try { window.localStorage.setItem('olu:' + k, JSON.stringify(v)); } catch (e) { /* fine */ } }
  function code(n) { var a = new Uint8Array(n), s = '', abc = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; window.crypto.getRandomValues(a); for (var i = 0; i < n; i++) s += abc[a[i] % abc.length]; return s; }
  function merge(t, p) { Object.keys(p || {}).forEach(function (k) { var v = p[k]; if (v && typeof v === 'object' && !Array.isArray(v)) { if (!t[k] || typeof t[k] !== 'object' || Array.isArray(t[k])) t[k] = {}; merge(t[k], v); } else t[k] = v; }); return t; }

  var ok = /^[A-Za-z0-9_-]{12,64}$/, fromLink = new URLSearchParams(window.location.search).get('room');
  var invited = !!fromLink && ok.test(fromLink) && fromLink !== lsGet('room');
  var room = (fromLink && ok.test(fromLink)) ? fromLink : (lsGet('room') || code(20));
  if (invited && lsGet('me') === null) lsSet('me', 1);   // the person who receives the link is player two
  lsSet('room', room);
  try { window.history.replaceState(null, '', window.location.pathname + '?room=' + room + window.location.hash); } catch (e) { /* keep the address as is */ }
  window.OLU_ROOM = { id: room, link: window.location.origin + window.location.pathname + '?room=' + room };

  function loadScript(src) { return new Promise(function (res, rej) { if (window.supabase && window.supabase.createClient) return res(); var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }

  window.OLU_BACKEND = function (opts) {
    return loadScript('vendor/supabase.js').then(function () {
      var sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } });
      var cache = {}, subs = {}, fails = [], loaded = false, me = code(8);
      var snap = function (name) { var d = cache[name]; return { exists: d !== undefined, data: function () { return d; }, metadata: {} }; };
      var emit = function (name) { (subs[name] || []).forEach(function (f) { f(snap(name)); }); };
      var fail = function (e) { fails.forEach(function (f) { if (f) f(e); }); };
      var check = function (r) { if (r && r.error) throw r.error; };
      var ch = sb.channel('olu-' + room, { config: { broadcast: { self: false }, presence: { key: me } } });
      function load() {
        return sb.rpc('olu_load', { p_room: room }).then(function (r) {
          check(r); (r.data || []).forEach(function (d) { cache[d.name] = d.data; });
          loaded = true; Object.keys(subs).forEach(emit);
        });
      }
      ch.on('broadcast', { event: 'op' }, function (m) {
        var p = m && m.payload; if (!p || !p.name) return;
        cache[p.name] = p.kind === 'set' ? p.body : merge(cache[p.name] || {}, p.body); emit(p.name);
      });
      ch.on('presence', { event: 'sync' }, function () { if (opts && opts.onPeers) opts.onPeers(Object.keys(ch.presenceState()).length); });
      ch.subscribe(function (status) { if (status === 'SUBSCRIBED') { ch.track({ at: Date.now() }); load().catch(fail); } });
      document.addEventListener('visibilitychange', function () { if (!document.hidden && loaded) load().catch(function () { /* keep what we have */ }); });
      var send = function (name, kind, body) { try { ch.send({ type: 'broadcast', event: 'op', payload: { name: name, kind: kind, body: body } }); } catch (e) { /* saved below anyway */ } };
      return {
        doc: function (path) {
          var name = path.split('/').pop();
          return {
            set: function (body) { cache[name] = body; send(name, 'set', body); return sb.rpc('olu_save', { p_room: room, p_name: name, p_data: body }).then(check); },
            update: function (body) { cache[name] = merge(cache[name] || {}, JSON.parse(JSON.stringify(body))); send(name, 'patch', body); return sb.rpc('olu_patch', { p_room: room, p_name: name, p_part: body }).then(check); },
            onSnapshot: function (next, err) { (subs[name] = subs[name] || []).push(next); fails.push(err); if (loaded) next(snap(name)); return function () {}; }
          };
        }
      };
    }).catch(function () { return null; });
  };
})();
