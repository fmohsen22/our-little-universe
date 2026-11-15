# Where is Prince Mohsey?

Esm Famil (اسم فامیل) for a table of friends, with crowns and badges from the Shahnameh and the life of Rostam to unlock, chapter by chapter.

- **Website:** plain HTML, CSS and JavaScript, served by GitHub Pages at game.mosi-app.com.
- **Game server:** `server/server.js`, one Node file with no dependencies, on your own machine at game-api.mosi-app.com. It is the referee and the database.

## How the game works

1. Choose a name, a kingdom (Iran or Turan) and a title. No email or password: the device remembers you, and a player key on your profile signs you in elsewhere.
2. Start a table and share its link or 5-letter code, or join an open table. Up to 12 players.
3. The host starts a round. Everyone gets the same letter and clock, and fills in the categories. The first to fill every box can call Stop.
4. Everyone checks the answers. Empty answers and wrong letters are refused automatically. Any other answer falls if more than half of the other players reject it.
5. A unique answer scores 10, an answer shared with someone else 5. The highest score wins the round; a tie has no winner.

A round counts only with at least two players. Alone it is practice.

## Points, crowns and chapters

- **Lifetime points** only ever grow. They rank you on the leaderboard after your chapter.
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
- Player keys are stored only as a hash.

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

- `src/app.js`: all screens. `src/art.js`: the badge drawings. `src/app.css`, `src/body.html`: look and skeleton.
- `config.js`: the server address.
- After editing, run `node build.js` to regenerate `index.html`, then commit.

## Tests

```
node tests/game.test.js      # the rules: scoring, votes, ranks, streaks, levels, quiz
node tests/server.test.js    # the real server over HTTP with three players
node tests/play.js           # three browsers playing a full round, the story, the quiz and the leaderboard (needs Playwright)
```
