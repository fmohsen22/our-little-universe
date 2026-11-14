# Our Little Universe

A private game night for two: Question Cards, Imaginary Life, Two Truths & One Lie, Secret Missions, Draw & Guess and Esm Famil, plus a Surprise Us picker and a Memory Book.

Plain HTML, CSS and JavaScript. No backend and no build step needed to host it.

## Hosting

`index.html` at the root is the whole site. GitHub Pages serves it at **game.mosi-app.com** (see `CNAME`):

1. Settings → Pages → Deploy from a branch → `main`, `/ (root)`.
2. At the domain provider, add a DNS record: type `CNAME`, name `game`, value `fmohsen22.github.io`.
3. When the certificate is ready, tick "Enforce HTTPS".

## How playing works

Every decided round is saved to a scoreboard: who won, the points, and when.

**One phone.** With no database configured, the site runs on one device. Tap "Playing as" at the top to hand over. Names, scores and the Memory Book are kept in that browser.

**Two phones, live.** With a room server configured, the home page shows a private invite link. Whoever opens it joins the same room as player two, and every game, score, badge and memory stays in step on both phones. The status at the top reads "Synced · both online" when you are both there.

**Badges.** Winning rounds earns badges (first win, streaks, three wins in a game, and more). They are stored with the room and stay even if scores are reset.

### Switching on two-phone play with your own server

`server/server.js` is the whole backend: one file, no dependencies, Node 18 or newer. It keeps each room as a JSON file.

1. Copy the `server/` folder to your server and start it:

   ```
   PORT=8787 DATA_DIR=/var/lib/our-little-universe ALLOWED_ORIGINS=https://game.mosi-app.com node server.js
   ```

   Or with Docker, from inside `server/`:

   ```
   docker build -t olu-server .
   docker run -d --restart unless-stopped -p 8787:8787 -v olu-data:/data -e ALLOWED_ORIGINS=https://game.mosi-app.com olu-server
   ```

2. Give it a public HTTPS address, for example `game-api.mosi-app.com`, pointing at port 8787 (a Cloudflare Tunnel public hostname works). Check it: `https://game-api.mosi-app.com/health` should answer `{"ok":true}`.
3. Put that address in `config.js` as `serverUrl` and commit. GitHub Pages redeploys by itself.

Back up `DATA_DIR` to keep scores and badges.

### Or with Supabase

1. Create a project at supabase.com, open the SQL Editor, paste all of `supabase/schema.sql`, and press Run.
2. Copy the **Project URL** and the **anon public** key (Project Settings → API) into `config.js`. Never use the `service_role` key.

### Privacy

A room is named by a 20-character random code that exists only in the invite link. Anyone who has the link can join the room, so share it only with each other.

## Changing it

- `src/content.js`: every question, mission, drawing word and list. Edit freely.
- `src/app.js`: the store, router, the six games and the scoreboard.
- `src/backend.js`: the room connection, for your own server or Supabase. `vendor/supabase.js` is the Supabase browser library (v2.118.0).
- `src/app.css`, `src/body.html`: look and page skeleton.

After editing, rebuild `index.html`:

```
node build.js
```

## Tests

`tests/play.js` plays all six games in Chromium with Playwright, on one device at phone and desktop size, as two devices against stand-ins for the shared store and for Supabase, and as two devices against the real `server/server.js`:

```
node tests/play.js
```
