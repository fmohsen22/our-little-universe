# Where is Prince Mohsey?

Esm Famil (اسم فامیل) for a table of friends, with crowns and badges from the Shahnameh and the life of Rostam to unlock, chapter by chapter.

- **Website:** plain HTML, CSS and JavaScript, served by GitHub Pages at game.mosi-app.com.
- **Game server:** `server/server.js`, one Node file with no dependencies, on your own machine at game-api.mosi-app.com. It keeps the clock, applies the rules and stores everything.

## How the game works

1. Create an account with a name and password, and choose a kingdom (Iran, Turan or Rum, shown on a map after Fereydun's division of the world in the Shahnameh). The same name and password sign you in on any phone or computer.
2. Start a table and share it on WhatsApp (or copy the link or 5-letter code), or join an open table. Every table is open to everyone with an account. A table needs 3 to 12 people.
3. **Choose a referee.** Anyone can volunteer; everyone else votes for one volunteer. The online volunteer with the most votes is the referee (a tie goes to whoever volunteered first). Votes can change between rounds.
4. The host starts a round. Everyone except the referee gets the same letter and clock and fills in the categories (Name, Surname, City, Country, Animal, Food, Object, Colour). The first to fill every box can call Stop (from 20 seconds in).
5. **The referee judges.** The referee sees every player's answers in one list and taps an answer to reject it (tap again to accept it back); everyone watches the scores change live. Then the referee taps "Give the verdict".
6. A unique answer scores 10, an answer someone else also gave 5. The highest score wins the round; a tie has no winner. Points, wins, crowns and chapter progress count at once.

Before the referee even looks, the server refuses empty answers, answers with the wrong letter, a single letter or one letter repeated ("jjjj"), and a Country that is not a real country (the list is `server/countries.js`).

If the referee leaves during a round and is not back within 20 seconds, the round is cancelled (nobody scores) and the table chooses a new referee. Refereeing earns the "Wise Judge of the Court" badge after 10 rounds.

## Points, crowns and chapters

- **Lifetime points** only ever grow, and They rank you on the leaderboard after your chapter.
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

## Chapter 8: Where is Prince Mohsey?

After the seven chapters of Rostam's life comes the last one, about Prince Mohsey of Iran: the Simurgh's last feather, his journey west into Rum, the King of Rum who sends him to study, and Princess Softolli.

- **The riddle:** each of chapters 1 to 7 ends with a fragment of the Simurgh's riddle (`clue` in `levels.json`). Chapter 8 opens when all seven are passed and asks: where is Prince Mohsey? Wrong answers get a hint (`hints`, `near`), never a penalty. The right answer (`answers`: Vienna, Wien, Vienne…) tells the ending and earns the Last Feather badge. The answer and the ending are never sent to the browser before the riddle is solved.
- **Prince Mohsey's table:** players who solved the riddle can play Esm Famil against Prince Mohsey, played by the server (`server/mohsey.js`): his own word lists for every letter, a few lines in character, and no outside service. He trusts answers he does not know. Beating him once earns Equal of the Prince. These games do not change points or the leaderboard.
- **The leaderboard** ranks players who found Prince Mohsey above others at the same chapter.

All the text of chapter 8 is in `levels.json` under `finale`; change it there and restart the server.

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

It does not judge whether "Wxyz" is a real city; that is the referee's job. And it cannot tell one person with two accounts from two people.

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
cd ~/our-little-universe && git pull && bash server/install-service.sh
```

**The owner dashboard** (`https://game.mosi-app.com/#owner`): one login for you that is not a player. The name is `admin`. Set the password once on the server:

```
cd ~/our-little-universe && bash server/set-owner.sh            # makes a strong password and shows it once
cd ~/our-little-universe && bash server/set-owner.sh --choose   # or type your own (shown while you type)
```

Only a hash of the password is stored, in `/etc/our-little-universe.env`. The script restarts the server and tests the login before it finishes.

The dashboard shows who is online right now, open tables and rounds in progress, accounts (new today and this week, active today and this week, how many joined with Google), rounds per day for the last 14 days, how many players are at each chapter, and the newest players. Below it, every account: search, give a new password, or remove one (two taps; it cannot be undone). The page is not linked anywhere on the site. Daily numbers are kept in `stats.json` in the data folder, for 90 days. Run `set-owner.sh` again for a new password. If signing in does not work, `bash server/check-owner.sh` finds out why (it prints no secrets).

**Continue with Google** (optional). Players can create an account with their Google account instead of a password; they still choose a name in the kingdom, and only Google's account number is stored, never the email. To turn it on:

1. Go to https://console.cloud.google.com, create a project (any name), then **APIs & Services → OAuth consent screen**: choose External, fill in the app name and your email, and publish it.
2. **APIs & Services → Credentials → Create credentials → OAuth client ID**: type *Web application*; under **Authorised JavaScript origins** add `https://game.mosi-app.com`. Create, and copy the **Client ID** (it ends in `.apps.googleusercontent.com`; it is not a secret).
3. On the server: `cd ~/our-little-universe && bash server/set-google.sh YOUR-CLIENT-ID.apps.googleusercontent.com`

The Google button appears on the welcome screen as soon as the server has the ID. `bash server/set-google.sh off` turns it off.

Players are stored in `players.json` in the data folder (`~/our-little-universe-data` by default). Back it up. Tables live in memory and end when the server restarts.

Settings (environment): `OWNER_USER` and `OWNER_HASH` (set by `set-owner.sh`), `GOOGLE_CLIENT_ID` (set by `set-google.sh`), `PORT`, `HOST` (default `127.0.0.1`), `DATA_DIR`, `ALLOWED_ORIGINS`, and the pace limits `MIN_PLAY_MS`, `REVIEW_MS` (how long the referee has, default 5 minutes), `ROUNDS_PER_HOUR`.

If `players.json` cannot be read at start, the server refuses to start instead of overwriting it; the previous good save is `players.json.bak`.

## Changing the website

- `src/app.js`: all screens. `src/art.js`: the badge drawings and the Prince Mohsey portrait. `src/map.js`: the map of the three kingdoms; its outlines in `src/map-data.js` are generated by `tools/make-map.js` from Natural Earth (public domain). Which countries belong to which kingdom is the `KINGDOMS` list at the top of that script. `src/app.css`, `src/body.html`: look and skeleton.
- `config.js`: the server address.
- `assets/levels/level-1.jpg` to `level-7.jpg` (1080×720) and `level-N-small.jpg` (360×240): the chapter pictures, shown at the top of each story and on the journey page. Replace a file to change a picture.
- `assets/prince-mohsey.jpg`: the picture of Prince Mohsey, shown in a round gold frame. Replace the file (a square crop of the face) to change it; if it is missing, a drawn stand-in is shown.
- After editing, run `node build.js` to regenerate `index.html`, then commit.

## Tests

```
node tests/game.test.js      # the rules: scoring, referee rejections, ranks, streaks, levels, quiz
node tests/server.test.js    # the real server over HTTP with three players
node tests/play.js           # four phone-sized browsers electing a referee, playing and judging a full round, the story, the quiz and the leaderboard (needs Playwright)
node tests/scenario.test.js  # nine players at three tables at once, sign-ins, two server restarts, and every record cross-checked
node tests/journey.test.js   # five accounts play the whole game with the real stories and quizzes: every chapter, a failed quiz, the riddle, Prince Mohsey, a restart
node tests/owner.test.js     # the owner dashboard and Google sign-in (with a stand-in for Google), over the API and on a phone
node tests/finale.test.js    # chapter 8: the riddle, hints, the ending, and games against Prince Mohsey, over the API and on a phone
node tests/crowd.test.js     # thirty players at four tables at once, each table with an elected referee rejecting made-up answers, every score cross-checked
```
