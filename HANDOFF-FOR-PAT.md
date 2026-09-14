# Covid Cup 2026 — handoff for Pat

Written 2026-09-14 by Andrew (with Claude). Your last commit was `342deb2` on Sep 1, when the app
was a single-round, twosomes-only scorer. Sixteen commits have landed since. This file is the
"what changed and what's left" version; **[HANDOFF.md](HANDOFF.md) is the full technical
reference** and has been kept current alongside the code.

## Short version

- The app is now a general **stroke-play event app**: any number of rounds and courses, 12
  formats (six games, each net or gross), and teams kept separate from tee times.
- **Covid Cup (planned ~Sep 26)** is one round of **2-man team net best ball, double par max**.
  That's the console's default setup.
- **It's live and working** — version `2026-09-14.6` on GitHub Pages.
- **Database rules were published** by Andrew on Sep 9, so the project is off test mode.
- The event itself still needs setting up, and a few things must happen before tournament day.

## Before Sep 26

| # | What | Why |
|---|---|---|
| 1 | **Delete `DEV_PINS` (`ADM1`, `ADM2`) in `admin-pins.js`**, keep `ADMIN_PIN` | Short, guessable codes added for building. The console can rewrite the course, roster and every team. |
| 2 | **Decide the handicap allowance** | Console default is 90%. The USGA recommendation for four-ball stroke play is 85%. |
| 3 | **Check Firebase → Realtime Database → Rules matches `database.rules.json`** | Andrew pasted it in on Sep 9. If they differ, deploy from the file. Editing the file alone deploys nothing. |
| 4 | **Set the event up and dry-run it on real phones** | Steps below. Score a few holes with two teams on one tee time, check the leaderboard, then clear the test scores. |
| 5 | *Optional:* change `ADMIN_PIN` | It's been passed around while building. It's plain text in public source either way. |

## Setting up Covid Cup

In the commissioner console (`admin.html`):

1. **Format** — Best ball, **Net**. That's already the default.
2. **Event** — name and handicap allowance.
3. **Spreadsheet setup** — download the template, fill in the course (tees with rating and slope,
   pars, stroke indexes) and players (name, index, tee, email), upload it. Or type it all in.
4. **Rounds** — add one round, pick the course, leave max score on double par, and tick
   Closest to the pin / Long drive with their hole numbers.
5. **Teams & tee times** — step 1, build the 2-man teams. Step 2, put teams into tee times and
   type each time. Two teams playing together go in the same tee time.
6. **Save all.**
7. Player codes are in the roster table. **Send code** opens your own mail app with the link and
   code filled in.

Players open https://phodgman22.github.io/Covid-Cup-2026/ and enter their code. Whoever keeps the
card for a tee time scores both teams on one phone.

## What changed since your last commit

**Data model.** The single `course` / `pairings` / `settings` shape is gone, replaced by
`event`, `courses`, `roster`, `rounds`, `groups` (teams) and `teeTimes`. It changed while the
database was still empty, so nothing was migrated. Individual formats have no teams: each player
is his own entry, keyed `p-<playerId>`. See HANDOFF.md for the full shape.

**Formats and scoring.**
- **12 formats.** Best ball, scramble, shamble, alternate shot, total and individual, each net or gross.
- **One event format**, which each round can override.
- **Gross formats** use no handicap strokes.
- **Max score per round**, default double par. A pickup scores the max.
- **Best ball and shamble** only count a hole once every partner's score is in.
- **One shared scoring path.** Everything goes through `scoreCell()` in `scoring.js`.

**Handicaps.**
- **Course handicap** is calculated from tee rating and slope, never typed in.
- **Allowance %** is set event-wide, with an optional per-player override.
- **Full or off-lowest** basis.
- **Editable team weightings** for net scramble and alternate shot, ranked lowest to highest handicap.

**Console.**
- **Format picker first.** The sections below adapt to it: handicap settings hide for gross, and weightings only show when needed.
- **`.xlsx` template import and export.** Re-uploading keeps existing players' codes.
- **Editable roster.**
- **Teams and tee times as separate steps.**
- **Closest to the pin and long drive per round.**
- **Stays unlocked per browser tab.** Typing a console code on the player screen redirects there, already unlocked.

**Player app.**
- **Four-character code login.**
- **Hole-by-hole scorecard** on eggshell. One card per tee time, with stroke dots and the max shown.
  You can look at later holes, but you can't score one until the current hole has a score or pickup for everyone.
- **Full card** with birdie and bogey marks.
- **Clubhouse-style leaderboard**, Out / In / Total.
- **Stats tab**, gross and net, including a **Counted** column for best ball: how many holes each player's score was the one his team used.

**Bugs found and fixed along the way:**
- **Pickups scored one stroke too harshly** for anyone getting a shot on that hole.
- **Best ball counted a hole off the first partner's score.**
- **The running total stuck at zero.**
- **The console asked for the code twice** after a redirect.
- **Next and the hole strip stopped working** on look-ahead holes.

## How we're working

- **Push straight to `main`, but always pull first.** Andrew decided against pull requests for
  this repo. PR #1 was closed as superseded. `main` goes live in about a minute.
- **Local testing:** `node serve.js`, then http://localhost:8765. With the real
  `firebase-config.js` this reads and writes the **live** database. To test without touching
  live data, temporarily set `apiKey: "REPLACE_ME"` — the app then runs off browser storage —
  and never commit that change.
- **Tests:** `node tests/run.mjs` runs 133 assertions over the scoring math: formats,
  handicaps, max score, pickups, stats. It needs Node 22.12 or newer and nothing to install.
- **Keep HANDOFF.md current.** Its "don't reintroduce" section lists bugs that were hard to spot.

## Not built, on purpose or not yet

- **No real access control.** Codes are name tags, and anyone with the link can edit any team's
  scores. The cheap next step is anonymous Firebase Auth. Enable Anonymous sign-in in the console
  **before** tightening the rules, or the app stops working.
- **No match play.** "Holes won" doesn't exist in a stroke-play leaderboard; Counted is the
  closest equivalent.
- **No round submit / attest / lock step**, unlike the Michigan app.
- **Contest winners aren't recorded** — closest to the pin and long drive are only flagged on the hole.
- **No SMS.** Email goes through the commissioner's own mail app.
- **A player uses the same tee name on every course.** Per-course tee choice isn't supported.
