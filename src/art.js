/* Original badge illustrations: one medallion frame and one glyph per badge, drawn as inline SVG.
   window.WPM_ART(name, metal, size, label, locked) returns the SVG markup. */
(function () {
  'use strict';
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
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
  /* Prince Mohsey. The picture named by princeImage in config.js is shown when it exists;
     until then, or if it fails to load, this drawn stand-in is shown instead. */
  window.WPM_PRINCE = function (size) {
    var src = (window.WPM_CONFIG || {}).princeImage || 'assets/prince-mohsey.jpg';
    return '<span class="prince-wrap" style="width:' + size + 'px;height:' + size + 'px"><img class="prince" src="' + esc(src) + '" width="' + size + '" height="' + size + '" alt="Prince Mohsey" onerror="this.hidden=true;this.nextElementSibling.hidden=false">' +
      '<span hidden>' + drawn(size) + '</span></span>';
  };
  function drawn(size) {
    var curls = [[38,40,13],[50,30,13],[64,28,13],[77,33,13],[86,44,12],[32,54,11],[89,57,10],[44,24,9],[72,22,9],[58,20,9],[30,66,8],[91,68,7]].map(function (c) { return '<circle cx="' + c[0] + '" cy="' + c[1] + '" r="' + c[2] + '"/>'; }).join('');
    return '<svg class="prince" viewBox="0 0 120 120" width="' + size + '" height="' + size + '" role="img" aria-label="Prince Mohsey"><defs><clipPath id="prince-clip"><circle cx="60" cy="60" r="54"/></clipPath></defs>' +
      '<circle cx="60" cy="60" r="58" fill="url(#m-gold)"/><circle cx="60" cy="60" r="54" fill="#1E2A5A"/><g clip-path="url(#prince-clip)">' +
      '<path d="M14 120c2-22 20-30 46-30s44 8 46 30z" fill="#1B2A63"/><path d="M40 92c6 8 34 8 40 0l-4 28H44z" fill="#F1E3B8"/><path d="M38 90c8 10 36 10 44 0l3 6c-10 12-40 12-50 0z" fill="url(#m-gold)"/>' +
      '<rect x="52" y="74" width="16" height="18" rx="6" fill="#B9763F"/><ellipse cx="60" cy="58" rx="22" ry="26" fill="#C98A52"/>' +
      '<g fill="#17110F">' + curls + '</g>' +
      '<path d="M46 52c4-3 8-3 11-1M63 51c3-2 7-2 11 1" fill="none" stroke="#17110F" stroke-width="2.6" stroke-linecap="round"/><ellipse cx="51" cy="58" rx="2.600" ry="3" fill="#2A1A12"/><ellipse cx="69" cy="58" rx="2.600" ry="3" fill="#2A1A12"/>' +
      '<path d="M60 60c-1 4-2 6 0 8" fill="none" stroke="#9A5F33" stroke-width="1.8" stroke-linecap="round"/><path d="M50 71c6 7 14 7 20 0-6 3-14 3-20 0z" fill="#FFF8F0" stroke="#7A3F25" stroke-width="1.4" stroke-linejoin="round"/></g></svg>';
}
  window.WPM_ART = art;
})();
