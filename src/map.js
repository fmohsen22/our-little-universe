/* The map of the game's three kingdoms, drawn from real coastlines (src/map-data.js), after Fereydun's division of
   the world in the Shahnameh: Iran for Iraj, Turan and China for Tur, Rum (the West) for Salm. The Oxus divides
   Iran from Turan. window.WPM_MAP() returns the SVG markup. */
(function () {
  'use strict';
  window.WPM_MAP = function () {
    var M = window.WPM_MAP_DATA, at = M.at;
    var label = function (p, text, cls) { return '<text x="' + p[0] + '" y="' + p[1] + '" class="' + cls + '" text-anchor="middle">' + text + '</text>'; };
    // a faint golden road from Persia to Britain, from Iran to Rum: the prince and the princess will find each other
    var a = at.persia, b = at.uk, mx = (a[0] + b[0]) / 2, my = Math.min(a[1], b[1]) - 70;
    var road = '<path d="M' + a[0] + ' ' + a[1] + 'Q' + mx + ' ' + my + ' ' + b[0] + ' ' + b[1] + '" class="map-road"/>' +
      '<path transform="translate(' + (b[0] + 2) + ' ' + (b[1] - 16) + ') scale(.55)" d="M0 10c-9-7-14-12-14-18 0-5 4-8 8-8 3 0 5 2 6 4 1-2 3-4 6-4 4 0 8 3 8 8 0 6-5 11-14 18z" class="map-heart"/>';
    return '<figure class="map"><svg viewBox="0 0 ' + M.w + ' ' + M.h + '" role="img" aria-label="Map of the three kingdoms: Iran at the centre, Turan and China to the north-east and east beyond the river Oxus, and Rum, the West, from the Levant and Anatolia across Europe to the United Kingdom">' +
      '<rect width="' + M.w + '" height="' + M.h + '" class="map-sea"/>' +
      '<path d="' + M.land + '" class="map-land"/><path d="' + M.rum + '" class="map-rum"/><path d="' + M.turan + '" class="map-turan"/><path d="' + M.iran + '" class="map-iran"/>' +
      '<path d="' + M.oxus + '" class="map-river"/>' + road +
      label(at.rum, 'RUM', 'map-name map-name-r') + label(at.turan, 'TURAN', 'map-name map-name-t') + label(at.iran, 'IRAN', 'map-name map-name-i') + label(at.oxus, 'Oxus', 'map-oxus') +
      '</svg><figcaption>When the old king Fereydun divided the world among his three sons, <b class="r">Salm</b> received <b class="r">Rum</b>, the West; <b class="t">Tur</b> received <b class="t">Turan</b> and China; and the youngest, <b class="i">Iraj</b>, received <b class="i">Iran</b>, the heart of it all. His brothers murdered him out of envy, and the long war between the kingdoms began. Where the borders fall today is our own approximation; the Shahnameh draws none.</figcaption></figure>';
  };
})();
