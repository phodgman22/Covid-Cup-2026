# Covid Cup 2026 — handoff notes

Context for whoever (or whichever Claude) picks this up next. Read this before making
changes — a couple of the design choices below aren't obvious from the code alone.

## What this is

A static, no-build web app for scoring golf events. It was forked from a much larger KHC
Outing app (Ryder Cup match play, two rival teams, mascot animations) and deliberately
does **not** carry any of that over — everything here scores onto **one flat leaderboard**.
There is no match play and no team-vs-team. If you're tempted to add them, that's almost
certainly the wrong direction.

It started as a single-round, twosomes-only app. It is now generalised: **any number of
rounds, any number of courses, and groups of any size** (twosomes, threesomes, foursomes,
mixed). That generalisation is deliberate — Covid Cup is a real event, but it doubles as
the test bed for a customisable tournament framework, so hard-coding one event's shape is
the thing to avoid.

**Covid Cup itself is 2-man team net best ball, stroke play, double par maximum.** Set it
up as one round, format Best ball (net), with every group a 2-man team. Two teams playing
together on the course are still two groups — give them the same tee time, and either
player's phone can keep both cards using "Scoring for" on the scorecard.

## Live URLs

- Player view: https://phodgman22.github.io/Covid-Cup-2026/
- Commissioner console: https://phodgman22.github.io/Covid-Cup-2026/admin.html
  (PIN is the `ADMIN_PIN` constant near the top of the `<script type="module">` in
  admin.html — it's plain text in public source, so it's a "keep casual players out"
  gate, not real security)

> **Before the event: delete `DEV_PINS` in admin.html.** `ADM1` and `ADM2` are short
> codes added so Andrew and Pat could get in quickly while building. Unlike the real PIN
> they're guessable without viewing source, and this console can rewrite the course, the
> roster and every pairing. They are fine now and a liability on tournament day.

Once a code is accepted the console stays unlocked for that browser tab (sessionStorage), so
a refresh doesn't ask again. Typing a console code on the player screen unlocks it too before
redirecting — previously it redirected straight into a second code prompt, which looked
exactly like the code being refused. The code box is plain text on purpose: browsers autofill
saved passwords into password fields, which mangles what gets typed.

Deployed via GitHub Pages from `main`/root — any push to `main` goes live within a
minute or two, no build step, no CI.

## Architecture

No bundler, no framework:

- **`index.html`** — player-facing. Code-gated login, then three tabs: Home (rounds and
  groups), Scorecard (enter your group's hole-by-hole scores for a chosen round), and
  Leaderboard (per round, or Overall). Reads everything from Firebase via `onValue`.
- **`admin.html`** — commissioner-facing, PIN-gated. Event settings, courses, roster,
  rounds, and per-round groups. Writes to Firebase on "Save all".
- **`scoring.js`** — pure functions, no DOM or Firebase. Handicap math, stroke allocation,
  and per-format hole scoring. If you're checking or extending the scoring math, this is
  the only file that should need touching.
- **`firebase-config.js`** — shared Firebase client config. The API key here is meant to
  be public (Firebase security is enforced by database rules, not by hiding this file).
- **`serve.js`** — minimal static server for local testing (`node serve.js`, then
  http://localhost:8765). Needed because module scripts and `fetch()` won't work off
  `file://`.

## Formats

Eight, defined in one place — the `FORMATS` table at the top of `scoring.js`:

| Format | Leaderboard row | Scores entered per hole |
|---|---|---|
| Scramble | the group | one team score |
| Alternate shot | the group | one team score |
| Best ball (net) | the group | one per player, best net counts |
| Shamble | the group | one per player, best net counts |
| Total net | the group | one per player, all count |
| Total gross | the group | one per player, all count |
| Individual (net) | each player | one per player |
| Individual (gross) | each player | one per player |

Two independent axes are kept separate on purpose: **what a format does to a hole**
(`entry`) versus **who ends up on the leaderboard** (`unit`). The original KHC app fused
them, which is exactly what made it impossible to reuse. Adding a format should mean
adding a row to `FORMATS` and a branch in `computeHoleResult` — nothing else.

Format is **per round**, so a five-round trip can be scramble on day one and singles on
day five. Groups are per round too, so pairings can change day to day.

**Best ball and shamble wait for every partner** before a hole counts. The first score in
can look like the team's result and then change when the partner's lands, so nothing is
decided off a half-filled hole — the same rule the Michigan app uses.

## Teams and tee times

Two separate things, set per round in the console, on purpose:

- **Teams** (`groups`) are who scores together, and depend on the format. Team formats use the
  teams the commissioner builds. **Individual formats have no teams** — every roster player is
  his own entry, keyed `"p-<playerId>"` (see `unitsFor()`). Scores are filed under that entry,
  so `covidcup_scores/<roundId>/<teamId or p-playerId>/...`.
- **Tee times** (`teeTimes`) are only who's on the course together. A tee time lists entries
  (teams, or players in an individual format) and never changes the teams. Two 2-man teams can
  share a tee time and still score separately.

The scorecard follows the tee time: one phone keeps the whole card, with each team's boxes under
its name and a running total per team. Anything not yet in a tee time can still be scored on its
own card, so the app works before the tee sheet is done. Tee times are filtered for display, not
rewritten, when a round's format changes, so switching back and forth doesn't wipe the tee sheet.

## Handicaps

- Course handicap is always **calculated**, never typed: `index x (slope/113) + (rating - par)`.
  The commissioner enters the course's tees (rating/slope) and each player's index.
- The event-wide **allowance %** applies to every player. A player can carry his own
  `allowancePct`, which overrides it.
- **Allowance basis** is a choice: `full` (each player off his own handicap) or
  `off-lowest` (everyone drops by the lowest in the field, so the best player plays scratch).
- **Team handicaps** (scramble / alternate shot only) are a separate choice: `formula`
  (standard weightings — 35/15 for a pair, 20/15/10 for three, 25/20/15/10 for four;
  alternate shot is 50% of combined) or `off-lowest` (every team drops by the lowest team's).
- **Maximum score is set per round** (`round.maxScore`, plus `round.maxPlus` for
  "par-plus"): double par (the default), net double bogey, triple bogey, par plus N, or
  none. Every rule resolves to a *gross* cap for one player on one hole — see `grossCap()`.
  A typed score above the cap counts as the cap; a picked-up ball scores the cap. What
  was typed stays in storage, so changing a round's rule later re-scores it correctly.
  With "none" the Picked up button is hidden, since real stroke play has no pickup.
- **All scoring goes through `scoreCell()`** — leaderboard, scorecard, full card and
  stats. Keep it that way; the next bug below is what happens when two places each
  work out a pickup for themselves.
- **Net double bogey's net value is par + 2.** `netDoubleBogey()` returns par + 2 +
  shots, which is its *gross* equivalent. An earlier version stored that gross figure as
  the net score, so every pickup by a player receiving a shot on the hole was scored one
  stroke too harshly. Net is always gross minus shots.

Player tees are matched **by name** across courses, so use the same tee name (e.g. "White")
on every course. A player who plays different tees on different courses isn't supported yet.

## Firebase data model (Realtime Database)

```
/covidcup
  /event    { name, allowancePct, allowanceMode, teamHcpMode }
  /courses  { <courseId>: { name, location, holesCount,
                            holes: [{number, par, si}], tees: [{name, rating, slope, yards}] } }
  /roster   { <playerId>: { name, index, tee, code, allowancePct? } }
  /rounds   { <roundId>: { name, courseId, format, order, maxScore, maxPlus?,
                           ctpOn, ctpHoles, ldOn, ldHoles } }
  /groups   { <roundId>: { <teamId>: { playerIds: [...] } } }          teams (team formats)
  /teeTimes { <roundId>: { <teeTimeId>: { start, unitIds: [...] } } }  who goes out together

/covidcup_scores
  /<roundId>/<groupId>/<holeNumber>
    { <playerId>: { v, x } }        player-entry formats
    { team:       { v, x } }        scramble / alternate shot
```

`v` is the gross strokes (or null). `x` is a boolean — the ball was picked up. Scores are
keyed by **real player id**, and `scoring.js` now takes real ids directly (via `memberIds`
plus `playerPhs`), so the old generic `{a, b}` remapping is gone along with the class of
bug it caused.

Firebase project is `covid-cup-2026`, owned by Patrick's Google account
(phodgman22@gmail.com); Andrew has Editor access.

## Database rules

`database.rules.json` replaces the wide-open test-mode default, which Firebase
auto-expires on **Oct 1, 2026** (at which point it denies everything and the app silently
stops working). Deploy with `firebase deploy --only database`, or paste into the console's
Realtime Database → Rules tab. **Merging the file does not deploy it** — that's a separate,
manual step.

What it does:

- Confines all access to `/covidcup` and `/covidcup_scores`; nothing else is granted.
- `/covidcup` requires the write to still look like a real config (`hasChild('event')`),
  which blocks an accidental full wipe without blocking admin's whole-object "Save all".
  Deliberately does *not* require `courses`/`roster`/`rounds`/`groups` to be present —
  they start as `{}`, and **Firebase never persists an empty object as a child**, so
  requiring them would reject the very first legitimate save. This is easy to get wrong.
- `/covidcup_scores` grants write only at the per-hole level, matching how
  `queueScoreWrite()` writes. Nobody can replace a whole group's card or the scores tree
  in one shot.
- Hole scores validate as numbers 1–15; `x` validates as a boolean; anything else is refused.

**There is still no real access control.** Without Firebase Auth, rules cannot tell the
commissioner from a player, or one player from another. Anyone with the link can edit any
group's scores. This stops accidents, not a determined person.

## Spreadsheet setup

admin.html can download an `.xlsx` template and read a filled one back — three flat
sheets, one row per thing, so it stays obvious to someone editing it in Excel:

- **Courses** — Course, Location, Holes (9 or 18), Tee, Rating, Slope, Yards.
  One row per *tee*, with the course name repeated.
- **Holes** — Course, Hole, Par, Stroke index.
- **Players** — Player, Handicap index, Tee.

The download includes whatever is already entered, so it doubles as an export. Uploading
**replaces** courses and players wholesale.

Things that are load-bearing here:

- **Players are matched by name** (case- and punctuation-insensitive, trimmed), and a
  match **keeps that player's existing login code** and per-player allowance. Without
  this, re-uploading a corrected spreadsheet would silently invalidate everyone's login
  the morning of the event. Same idea for courses, matched by name so rounds keep pointing
  at the right one.
- The name itself is taken **from the sheet**, so fixing a spelling there fixes it here.
- A course listed in Courses but absent from Holes still gets a default card, so it's
  scoreable rather than silently broken.
- Players dropped from the sheet are removed from any groups they were in, and a round
  whose course disappeared falls back to the first remaining course.
- Header matching is deliberately loose — real files come back with different casing and
  stray punctuation once a human has been in them.

SheetJS is loaded from cdnjs as a plain (non-module) script, so it must stay *above* the
module script that uses it.

## Scorecard

On eggshell stock rather than the dark theme, so it reads clearly outdoors. The palette is
redefined on the scorecard card, so everything inside flips together. **A hole can't be left
until every player on it has a score or Picked up:** Next stays disabled and holes past the
first blank one are locked in the strip. Going back to fix a hole is always allowed. Same rule
as the Michigan app.

## Closest to the pin and long drive

Set per round in the console: tick the contest and type the hole(s) (`ctpOn`/`ctpHoles`,
`ldOn`/`ldHoles`). Holes are free text like "2, 8", and only numbers that exist on the
round's course are used. The player app lists them on Home, badges the hole, dots it on the
strip, notes it on the hole before, and marks it on the full card. It does not record who won —
like Michigan, that's still settled on the course.

## Leaderboard

Styled as a hand-lettered clubhouse board — cream stock, blackletter surnames with a green
drop cap, first names small underneath, red numbers under par. It is a deliberate single
look and does not follow the app's dark theme. Fonts come from Google Fonts (Pirata One for
names and title, Kalam for numbers) with system fallbacks. A round shows Out, In and Total
to par, with ties shown as "T2" and "F" once all 18 are in. With more than one round there
is also an Overall board by player; with one round the round picker is hidden.

## Player codes

Each player gets a four-character code, generated in admin.html when he's added. Ambiguous
characters (0/O, 1/I/L, etc.) are excluded so codes are easy to read off a screen.

**Codes are name tags, not passwords.** The whole roster ships to every phone, so anyone
can read all of them out of the page. They solve "which player am I", nothing more.

## Bugs already found and fixed here — don't reintroduce them

1. **Shared debounce timer dropped writes.** The original `queueScoreWrite()` used one
   `writeTimer` for every field, so entering hole 1 then hole 2 cancelled hole 1's pending
   write before it reached Firebase. Fixed by keying the debounce per
   `${roundId}|${groupId}|${hole}|${field}` (see `writeTimers` in index.html).

2. **Stale scores reference left the running total at zero.** The scorecard captured
   `scores[roundId][groupId]`, but the first entry on a fresh card *creates* that object,
   so the captured reference stayed empty forever and "thru" never moved off 0.
   `updateScoreTotals()` now reads the live object each time. If you refactor it, don't
   reintroduce a captured copy.

3. **Key mismatch between storage and scoring.js** (historical). Storage was keyed by real
   player id while scoring.js expected generic `{a, b}`, which silently produced `thru: 0`.
   Structurally gone now that scoring.js takes real ids — keep it that way.

## Known gaps (not bugs, just not built yet)

- **No anonymous auth.** Locking rules to `auth != null` would keep out anyone not using
  the app, and costs nothing. Requires enabling Anonymous sign-in in the Firebase console
  **before** the tightened rules deploy, or the app breaks.
- **No invites.** A static app can't send SMS or email — that needs a server and a paid
  service. The cheap version is a "text this player" button that opens the commissioner's
  own messaging app with the code and link pre-filled.
- **No per-course tee selection** for a player (see Handicaps above).
- **No admin-side leaderboard** — the commissioner uses the player-facing one.

## Testing

`node serve.js`, then http://localhost:8765. The scoring math has no DOM or network
dependency, so it can be exercised directly by importing `scoring.js` in Node — worth
doing for any change to handicaps, allowances, or a format.
