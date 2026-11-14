# Our Little Universe

A private game night for two: Question Cards, Imaginary Life, Two Truths & One Lie, Secret Missions, Draw & Guess and Esm Famil, plus a Surprise Us picker and a Memory Book.

Plain HTML, CSS and JavaScript. No backend and no build step needed to host it.

## Hosting

`index.html` at the root is the whole site. GitHub Pages serves it at **game.mosi-app.com** (see `CNAME`):

1. Settings → Pages → Deploy from a branch → `main`, `/ (root)`.
2. At the domain provider, add a DNS record: type `CNAME`, name `game`, value `fmohsen22.github.io`.
3. When the certificate is ready, tick "Enforce HTTPS".

## How playing works

Without a shared database the site runs on one device: tap "Playing as" at the top to hand over to the other person. Names, scores and the Memory Book are kept in that browser's localStorage.

All game state goes through three functions in `src/app.js` (`save`, `patch`, `connect`), so a real database can be added there for two-device play.

## Changing it

- `src/content.js`: every question, mission, drawing word and list. Edit freely.
- `src/app.js`: the store, router and the six games.
- `src/app.css`, `src/body.html`: look and page skeleton.

After editing, rebuild `index.html`:

```
node build.js
```

## Tests

`tests/play.js` plays all six games in Chromium with Playwright, on one device at phone and desktop size and as two devices against a stand-in store:

```
node tests/play.js
```
