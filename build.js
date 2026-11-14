// Builds two files from src/:
//   dist/our-little-universe.html  the fragment the Artifact host publishes
//   index.html                     the same page as a complete standalone file; this is what game.mosi-app.com serves
const fs = require('fs'), path = require('path');
const r = f => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');
const fonts = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&family=Fraunces:ital,opsz,wght@0,9..144,600;1,9..144,600&display=swap">';
const page = `<title>Our Little Universe</title>
<meta name="claude:viewport-fit-sides" content="cover">
${fonts}
<style>
${r('app.css')}</style>
${r('body.html')}<script>
${r('content.js')}
${r('app.js')}</script>
`;
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist', 'our-little-universe.html'), page);
fs.writeFileSync(path.join(__dirname, 'index.html'),
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#17122B"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="Universe"><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"><link rel="manifest" href="manifest.webmanifest"><link rel="icon" href="icon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="apple-touch-icon.png"><style>[hidden]{display:none!important}:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}</style></head><body>' + page + '</body></html>');
console.log('built', page.length, 'bytes');
