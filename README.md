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

**Two phones, live.** With a Supabase project configured, the home page shows a private invite link. Whoever opens it joins the same room as player two, and every game, score and memory stays in step on both phones. The status at the top reads "Synced · both online" when you are both there.

### Switching on two-phone play

1. Create a free project at supabase.com.
2. Open the SQL Editor, paste all of `supabase/schema.sql`, and press Run.
3. Open Project Settings → API and copy the **Project URL** and the **anon public** key into `config.js`. Both are meant to be public. Never use the `service_role` key.
4. Commit `config.js`. GitHub Pages redeploys by itself.

The table is closed to direct access. The site reaches it only through three database functions, and each needs the room code: a 20-character random string that exists only in the invite link. Anyone who has the link can join the room, so share it only with each other.

## Changing it

- `src/content.js`: every question, mission, drawing word and list. Edit freely.
- `src/app.js`: the store, router, the six games and the scoreboard.
- `src/backend.js`: the Supabase room connection. `vendor/supabase.js` is the Supabase browser library (v2.118.0).
- `src/app.css`, `src/body.html`: look and page skeleton.

After editing, rebuild `index.html`:

```
node build.js
```

## Tests

`tests/play.js` plays all six games in Chromium with Playwright, on one device at phone and desktop size, and as two devices against stand-ins for the shared store and for Supabase:

```
node tests/play.js
```
