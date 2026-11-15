# Where is Prince Mohsey?

Esm Famil (اسم فامیل) for a table of friends, with crowns and badges from the Shahnameh and the life of Rostam to unlock, chapter by chapter.

- **Website:** plain HTML, CSS and JavaScript, served by GitHub Pages at game.mosi-app.com.
- **Game server:** `server/server.js`, one Node file with no dependencies, on your own machine at game-api.mosi-app.com. It is the referee and the database.

## How the game works

1. Create an account with a name and password (every table is open to everyone with an account), and choose a kingdom (Iran, Turan or Rum, shown on a map after Fereydun's division of the world in the Shahnameh) and a title. The same name and password sign you in on any phone or computer.
2. Start a table and share it on WhatsApp (or copy the link or 5-letter code), or join an open table. Up to 12 players.
3. The host starts a round. Everyone gets the same letter and clock, and fills in the categories. The first to fill every box can call Stop.
4. Everyone checks the answers. Empty answers and wrong letters are refused automatically. Any other answer falls if more than half of the other players reject it.
5. A unique answer scores 10, an answer shared with someone else 5. The highest score wins the round; a tie has no winner.

A round counts only with at least two players. Alone it is practice.

## The nightly referee

Every round's points wait for the referee. Each night at 22:00 it checks every answer that got past the table, strikes the ones that are not real examples of their category, and only then adds points, wins, crowns and chapter progress to each player's record. Players see what is waiting, and the next day a short verdict listing any answers that were struck.

- **Instant checks:** a single letter or one letter repeated ("jjjj") never scores. A Country answer must be a real country (the list is `server/countries.js`); "jajaja" scores nothing on the spot.
- **The referee is a scheduled Claude session.** At 22:00 it fetches the waiting answers from `GET /api/referee/pending`, judges them, and sends verdicts to `POST /api/referee/verdicts`. Both need the `X-Referee-Token` header, matching `REFEREE_TOKEN` in `/etc/our-little-universe.env` (the installer creates it and prints it once). No API key is needed.
- **Rounds played after the referee looked** wait for the next night. If the referee does not come, rounds simply wait.
- **Privacy:** only the answers, letters and categories are sent, never player names.

Alternatives, if you ever want them: with no `REFEREE_TOKEN` but an `ANTHROPIC_API_KEY` (and Node 20+), the server judges by itself through the Anthropic SDK at `REFEREE_AT`; with neither, only the instant checks apply.

Pending rounds are kept in `rounds.json` beside `players.json`.

## Points, crowns and chapters

- **Lifetime points** only ever grow, and only after the referee has checked them. They rank you on the leaderboard after your chapter.
- **Royal ranks** come from victories: 1, 3, 7, 15, 25, 40, 60 and 100 wins, from Young Hero to Shahanshah of Legends. They are never lost.
- **Achievements:** eight badges for streaks, comebacks, clean Stops, rounds played and quizzes passed. One is hidden.
- **Chapters:** seven chapters of Rostam's life. Each needs points gathered since the last chapter:

  | Chapter | Points | About |
  |---|---|---|
  | 1 | 8,000 | 10 hours |
  | 2 | 10,400 | 13 hours |
  | 3 | 13,500 | 17 hours |
  | 4 | 17,600 | 22 hours |
  | 5 | 22,800 | 29 hours |
  | 6 | 29,700 | 37 hours |
  | 7 | 38,600 | 48 hours |

  The hours assume about 800 points an hour (a 3-minute round worth about 40 points). Change `LEVELS` at the top of `server/game.js` to retune: `pointsPerHour`, `firstLevelHours`, `growth`.

- **The quiz:** when the points are there, the chapter's story opens. Then 5 questions drawn from 10; 4 right keeps the chapter. Fail, and the points gathered for that chapter are lost (lifetime points are not) and the story closes until you earn them again.
- **Chapter 8** is reserved for "Where is Prince Mohsey?" and is not written yet.

## The stories

`server/levels.json` holds the seven stories and their quizzes. Each level has `title`, `teaser`, `story` (paragraphs), `video` (a URL, empty for now), `quiz` and `sources`. To add a video, put its address in `video`; to add chapter 8, raise `LEVELS.count` in `server/game.js` and add an eighth entry.

The stories were written from memory of Ferdowsi's narrative as told in the Davis and Warner translations, without access to the sources at the time. Check them against a published translation before relying on them.

## What the server guarantees

- It picks the letter, runs the clock and scores the round. Browsers send only their own answers and votes.
- Nobody receives another player's answers while a round is running.
- Points, wins, chapters and badges change only through rounds the server scored and quizzes it graded.
- Quiz answers never leave the server. A quiz is drawn once and can be answered once.
- Passwords are stored only as salted scrypt hashes, and sign-in tokens only as SHA-256 hashes. Wrong passwords are locked out after 10 tries in 15 minutes. Changing a password signs out the other devices.

There is no password reset by email, because there is no email. If someone forgets their password, the server owner can remove the `pw` field from their entry in `players.json` (with the server stopped); they can then set a new one from a device where they are still signed in.

- Pace limits keep points honest: Stop opens 20 seconds into a round, checking takes at least 8 seconds, a player sits at one table at a time, and at most 40 rounds an hour count.
- It listens on 127.0.0.1 only; the tunnel on the same machine is the way in.

It does not judge whether "Wxyz" is a real city; that is what the table's votes are for. And it cannot tell one person with two accounts from two people.

## Running the server

On the server:

```
git clone https://github.com/fmohsen22/our-little-universe.git
cd our-little-universe
bash server/install-service.sh
```

That installs a systemd service on port 8787. A Cloudflare Tunnel public hostname (`game-api.mosi-app.com` → `http://localhost:8787`) makes it reachable. `https://game-api.mosi-app.com/health` should answer `{"ok":true,...}`.

**To update after a change here:**

```
cd ~/our-little-universe && git pull && sudo systemctl restart our-little-universe
```

Players are stored in `players.json` in the data folder (`~/our-little-universe-data` by default). Back it up. Tables live in memory and end when the server restarts.

Settings (environment): `PORT`, `HOST` (default `127.0.0.1`), `DATA_DIR`, `ALLOWED_ORIGINS`, and the pace limits `MIN_PLAY_MS`, `MIN_REVIEW_MS`, `ROUNDS_PER_HOUR`.

If `players.json` cannot be read at start, the server refuses to start instead of overwriting it; the previous good save is `players.json.bak`.

## Changing the website

- `src/app.js`: all screens. `src/art.js`: the badge drawings and the Prince Mohsey portrait. `src/map.js`: the map of the two kingdoms; its outlines in `src/map-data.js` are generated by `tools/make-map.js` from Natural Earth (public domain). Which countries belong to which kingdom is the `KINGDOMS` list at the top of that script. `src/app.css`, `src/body.html`: look and skeleton.
- `config.js`: the server address.
- `assets/prince-mohsey.jpg`: the picture of Prince Mohsey, shown in a round gold frame. Replace the file (a square crop of the face) to change it; if it is missing, a drawn stand-in is shown.
- After editing, run `node build.js` to regenerate `index.html`, then commit.

## Tests

```
node tests/game.test.js      # the rules: scoring, votes, ranks, streaks, levels, quiz
node tests/server.test.js    # the real server over HTTP with three players
node tests/play.js           # three browsers playing a full round, the story, the quiz and the leaderboard (needs Playwright)
node tests/scenario.test.js  # nine players at three tables at once, sign-ins, two server restarts, and every record cross-checked
node tests/agent.test.js     # the agent referee: token, fetching answers, verdicts, late rounds waiting
node tests/crowd.test.js     # thirty players at four tables at once, the referee striking made-up answers, every score cross-checked
```
