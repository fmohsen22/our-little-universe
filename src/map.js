/* The map of the game's two kingdoms, drawn from real coastlines (src/map-data.js).
   It is a game map, not a history map: Turan is the north, from the United Kingdom across Russia to the steppe;
   Iran is the band from Egypt to China. The Oxus, the border in the Shahnameh, is drawn between them.
   window.WPM_MAP() returns the SVG markup. */
(function () {
  'use strict';
  window.WPM_MAP = function () {
    var M = window.WPM_MAP_DATA, at = M.at;
    var label = function (p, text, cls) { return '<text x="' + p[0] + '" y="' + p[1] + '" class="' + cls + '" text-anchor="middle">' + text + '</text>'; };
    // a faint golden road from Persia to Britain: the two kingdoms are not as far apart as they look
    var a = at.persia, b = at.uk, mx = (a[0] + b[0]) / 2, my = Math.min(a[1], b[1]) - 70;
    var road = '<path d="M' + a[0] + ' ' + a[1] + 'Q' + mx + ' ' + my + ' ' + b[0] + ' ' + b[1] + '" class="map-road"/>' +
      '<path transform="translate(' + (b[0] + 2) + ' ' + (b[1] - 16) + ') scale(.55)" d="M0 10c-9-7-14-12-14-18 0-5 4-8 8-8 3 0 5 2 6 4 1-2 3-4 6-4 4 0 8 3 8 8 0 6-5 11-14 18z" class="map-heart"/>';
    return '<figure class="map"><svg viewBox="0 0 ' + M.w + ' ' + M.h + '" role="img" aria-label="Map of the game: Turan covers the north, from the United Kingdom across Russia to the steppe; Iran runs from Egypt to China; the river Oxus lies between them">' +
      '<rect width="' + M.w + '" height="' + M.h + '" class="map-sea"/>' +
      '<path d="' + M.land + '" class="map-land"/><path d="' + M.turan + '" class="map-turan"/><path d="' + M.iran + '" class="map-iran"/>' +
      '<path d="' + M.oxus + '" class="map-river"/>' + road +
      label(at.turan, 'TURAN', 'map-name map-name-t') + label(at.iran, 'IRAN', 'map-name map-name-i') + label(at.oxus, 'Oxus', 'map-oxus') +
      '</svg><figcaption><b class="t">Turan</b> is the north, from the United Kingdom across to the steppe. <b class="i">Iran</b> runs from Egypt to China. Between them flows the Oxus, the river that divides the two kingdoms in the Shahnameh. The rest of this map is our own invention.</figcaption></figure>';
  };
})();
