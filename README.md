# Our Little Universe

A private game night for two: Question Cards, Imaginary Life, Two Truths & One Lie, Secret Missions, Draw & Guess and Esm Famil, plus a Surprise Us picker and a Memory Book.

Plain HTML, CSS and JavaScript. No backend and no build step needed to host it.

## Hosting

`index.html` at the root is the whole site. GitHub Pages serves it at **game.mosi-app.com** (see `CNAME`):

1. Settings → Pages → Deploy from a branch → `main`, `/ (root)`.
2. At the domain provider, add a DNS record: type `CNAME`, name `game`, value `fmohsen22.github.io`.
3. When the certificate is ready, tick "Enforce HTTPS".

## How playing works

**One phone.** With no room server configured, the site runs on one device. Tap "Playing as" at the top to hand over. Everything is kept in that browser.

**Two phones, live.** With a room server configured, the home page shows a private invite link. Whoever opens it joins the same room as player two, and every game, crown and memory stays in step on both phones. The status at the top reads "Synced · both online" when you are both there.

## The Crowns of Shahnameh

The 👑 at the top opens the Royal Hall: two rival kingdoms (Iran and Turan), eight royal ranks earned by lifetime victories, individual and shared achievements, a head-to-head record with a Crown Holder, royal challenges and rematches, a chronicle, and short stories from the Shahnameh behind each badge.

How it counts:

- **Competitive, with a winner:** Two Truths & One Lie, versus Secret Missions, Esm Famil. Only these give victories, streaks and ranks.
- **Cooperative, shared glory:** Question Cards, finished Imaginary Life adventures, shared Secret Missions, guessed drawings.
- **Blessing of the Simurgh** (comeback) is defined only for Esm Famil: win a round that takes you from 20 or more points behind in the series to level or ahead.

How it stays honest:

- Each finished round is stored once as an event under the round's own id. Ranks, streaks, badges and unlock dates are recomputed from that log (`src/royal.js`), never stored as totals, so refreshes, reconnects and replays cannot count twice, and ranks are never revoked.
- With your own server the log is append-only: the server checks every event with the same rules, ignores ids it already has, and refuses to overwrite or clear the log.
- The server records what the two of you report; it does not replay the games to re-judge who won.

All ranks, thresholds and achievement rules are configuration at the top of `src/royal.js`. The badge drawings are original SVG. The titles and badges are fiction for this game, not historical titles.

### Switching on two-phone play with your own server

`server/server.js` is the whole backend: no dependencies, Node 18 or newer. It keeps each room as a JSON file.

1. On your server:

   ```
   git clone https://github.com/fmohsen22/our-little-universe.git
   cd our-little-universe
   bash server/install-service.sh
   ```

   That installs a systemd service on port 8787 that restarts by itself. To run it by hand instead: `PORT=8787 DATA_DIR=$HOME/our-little-universe-data ALLOWED_ORIGINS=https://game.mosi-app.com node server/server.js`. With Docker: `docker build -f server/Dockerfile -t olu-server .`

2. Give it a public HTTPS address, for example `game-api.mosi-app.com`, pointing at `http://localhost:8787` (a Cloudflare Tunnel public hostname works). `https://game-api.mosi-app.com/health` should answer `{"ok":true}`.
3. Put that address in `config.js` as `serverUrl` and commit. GitHub Pages redeploys by itself.

To update the server later: `git pull && sudo systemctl restart our-little-universe`. Back up the data folder to keep your crowns.

### Or with Supabase

1. Create a project at supabase.com, open the SQL Editor, paste all of `supabase/schema.sql`, and press Run.
2. Copy the **Project URL** and the **anon public** key (Project Settings → API) into `config.js`. Never use the `service_role` key.

### Privacy

A room is named by a 20-character random code that exists only in the invite link. Anyone who has the link can join the room, so share it only with each other.

## Changing it

- `src/content.js`: every question, mission, drawing word and list. Edit freely.
- `src/app.js`: the store, router and the six games.
- `src/royal.js`: the achievement engine and its configuration. `src/hall.js`: badge art, the Royal Hall, ceremony and challenges.
- `src/backend.js`: the room connection, for your own server or Supabase. `vendor/supabase.js` is the Supabase browser library (v2.118.0).
- `src/app.css`, `src/body.html`: look and page skeleton.

After editing, rebuild `index.html`:

```
node build.js
```

## Tests

`node tests/royal.test.js` checks the engine: rank thresholds, streaks, duplicate events, shared unlocks and the comeback rule.

`tests/play.js` plays all six games in Chromium with Playwright, on one device at phone and desktop size, as two devices against stand-ins for the shared store and for Supabase, and as two devices against the real `server/server.js`:

```
node tests/play.js
```
