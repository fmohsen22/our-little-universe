// Builds index.html, the whole website in one file, from src/. GitHub Pages serves it at game.mosi-app.com.
const fs = require('fs'), path = require('path');
const r = f => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');
const head = '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Where is Prince Mohsey?</title>' +
  '<meta name="description" content="Play Esm Famil with friends, earn crowns from the Shahnameh and unlock the life of Rostam.">' +
  '<meta name="theme-color" content="#17122B"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="Prince Mohsey"><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">' +
  '<link rel="manifest" href="manifest.webmanifest"><link rel="icon" href="icon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="apple-touch-icon.png">' +
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&family=Fraunces:ital,opsz,wght@0,9..144,600;1,9..144,600&display=swap">';
const page = `<!doctype html><html lang="en"><head>${head}<style>[hidden]{display:none!important}:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}
${r('app.css')}</style></head><body>
${r('body.html')}<script src="config.js"></script>
<script>
${r('art.js')}
${r('app.js')}</script>
</body></html>
`;
fs.writeFileSync(path.join(__dirname, 'index.html'), page);
console.log('built', page.length, 'bytes');
