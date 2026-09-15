# Covid Cup 2026 — handoff notes

Context for whoever (or whichever Claude) picks this up next. Read this before making
changes — a couple of the design choices below aren't obvious from the code alone.

For what changed recently and what's left before the event, see
[HANDOFF-FOR-PAT.md](HANDOFF-FOR-PAT.md).

## What this is

A static, no-build web app for scoring golf events. It was forked from a much larger KHC
Outing app (Ryder Cup match play, two rival teams, mascot animations) and deliberately
does **not** carry over its fixed two-sided structure or its animations. A round is either
**stroke play** (one flat leaderboard) or **match play** (entries paired into matches, scored
hole by hole for points), chosen per round.

It started as a single-round, twosomes-only app. It is now generalised: **any number of
rounds, any number of courses, and teams of any size** (twosomes, threesomes, foursomes,
mixed). That generalisation is deliberate — Covid Cup is a real event, but it doubles as
the test bed for a customisable tournament framework, so hard-coding one event's shape is
the thing to avoid.

**Covid Cup itself is 2-man team net best ball, stroke play, double par maximum.** Set it
up as one round in Best ball (net), build the 2-man teams, then put teams into tee times.
Two teams playing together are two teams in one tee time, and one phone keeps both cards.

## Live URLs

- Player view: https://phodgman22.github.io/Covid-Cup-2026/
- Commissioner console: https://phodgman22.github.io/Covid-Cup-2026/admin.html
  (codes are in `admin-pins.js` — `ADMIN_PIN` plus `DEV_PINS`. They're plain text in public
  source, so this is a "keep casual players out" gate, not real security)

> **Before the event: delete `DEV_PINS` in `admin-pins.js`.** `ADM1` and `ADM2` are short
> codes added so Andrew and Pat could get in quickly while building. Unlike the real PIN
> they're guessable without viewing source, and this console can rewrite the course, the
> roster and every team. They are fine now and a liability on tournament day.

Once a code is accepted, commissioner access is remembered on that device (`covidcup_admin` in
localStorage, shared by the console and the player app), so a refresh, or moving between the
two, doesn't ask again. Typing a console code on the player login turns on **commissioner mode**
(below); Exit in the commissioner bar forgets it. The code box is plain text on purpose: browsers autofill
saved passwords into password fields, which mangles what gets typed.

Deployed via GitHub Pages from `main`/root — any push to `main` goes live within a
minute or two, no build step, no CI.

## Architecture

No bundler, no framework:

- **`index.html`** — player-facing. Code-gated login, then four tabs: Home (rounds, contests,
  tee times and matches), Scorecard (the player's own card only, hole by hole or the full card),
  Leaderboard (the clubhouse board — tap any row for that card in a pop-up), and Stats. Reads
  everything from Firebase via `onValue`.
- **`admin.html`** — commissioner-facing, code-gated. Event and handicap settings, team
  weightings, spreadsheet import, courses, players (with each player's game handicap), and
  rounds — each holding its format, play, max score, contests, teams, tee times and matches.
  Writes to Firebase on "Save all".
- **`scoring.js`** — pure functions, no DOM or Firebase. Formats, handicap math, stroke
  allocation, max score, hole scoring and statistics. If you're checking or extending the
  scoring math, this is the only file that should need touching.
- **`admin-pins.js`** — the console codes, shared by both pages so a code typed on the player
  screen can redirect to the console.
- **`firebase-config.js`** — shared Firebase client config. The API key here is meant to
  be public (Firebase security is enforced by database rules, not by hiding this file).
- **`serve.js`** — minimal static server for local testing (`node serve.js`, then
  http://localhost:8765). Needed because module scripts and `fetch()` won't work off
  `file://`.
- **`tests/`** — the scoring test suite. See Testing below.

## Design

Both pages now share one clubhouse look — cream stock, Pirata One for page titles, Georgia
small-caps for section headings, Kalam reserved for status text and subtitles, same as the
leaderboard always kept it off the dense functional copy. Same CSS custom-property structure
throughout (`--bg`, `--surface`, `--accent`, `--navy`, etc.) with the same values in both
files, so re-theming either one is `:root` plus a sweep for colors that got hardcoded instead
of using a variable — button text on `--accent`, zebra-stripe tints, warning/status banners.
Check for those before assuming the variables alone will catch everything if this moves again.

**index.html used to be the odd one out** — a dark navy/gold app with one cream tab (the
leaderboard) that deliberately didn't follow it. Re-theming `:root` to cream made the
leaderboard finally match its surroundings instead of standing out, but three other spots
had their own separate hardcoded palettes that needed reconciling by hand: the scorecard
card and its pop-up (`#tab-score .card`, `.modal-box`) used to fully swap to a distinct
"eggshell stock" palette so a light card would read against the old dark app — now the whole
app is that color, so they just set `--surface:#ffffff` for a crisp "fill this in" surface a
shade whiter than the page, keeping everything else (accent, borders) inherited and
consistent. The commissioner-mode bar (`.adminbar`) was a hardcoded dark amber "warning"
look; recolored to `--navy` — reads as "different mode," not "something's wrong."

**Needs-review highlighting.** Every genuine either/or default in Event and each round —
handicap allowance and its basis, team handicap mode, net/gross, stroke/match, the format
card grid, maximum score, and (when skins is on) its own net/gross, team/individual, and
carry-over — gets a loud amber alert treatment (`.needs-review`): cream-gold fill, a pulsing
amber ring, and a small "NEEDS REVIEW" tag (the tag is skipped on `.seg-admin` toggles, which
clip it via their own `overflow:hidden`; the pulsing ring alone carries those) — until it's
been interacted with *this session*. **Any interaction confirms it, even one that leaves the
default in place** — deliberate, so a commissioner who's fine with the default has a way to
say so without being forced to bounce the value away and back. For the toggle-button fields
(net/gross, stroke/match, the format cards, skins net/gross/unit/carry) a click always
confirms, even a click that re-picks the value already showing. For the select/input fields
(handicap allowance %, allowance basis, team handicap mode, max score) a `click` listener
confirms the same way *in addition to* the existing `input`/`change` listener that updates
the stored value — needed because a native `<select>` fires no event at all when you open it,
look, and close it on the same option, so relying on `change` alone left no way to dismiss the
alert without actually picking a different option. This is `pendingReview`, a plain `Set` in
admin.html — **never written to Firebase, and reseeded from scratch on every load**
(`seedPendingReview()`, called right after `loadAll()` populates `state`). That's deliberate:
it says "you haven't looked at this yet this visit," not "this was never configured," so a
returning commissioner re-confirming settings he already chose correctly isn't a bug, it's the
point — same as re-initialing each section of a paper form rather than trusting a signature
from last time. A freshly added round gets seeded the same way (`seedRoundReview()`, called
from the "+ Add round" handler). Free-text fields (names, CTP/LD hole numbers) and the opt-in
checkboxes themselves (Skins/CTP/LD on or off) are deliberately left out — an unchecked
optional extra is a legitimate resting state, not a default waiting to be confirmed.

## Formats

Twelve, defined in one place — the `FORMATS` table at the top of `scoring.js`. Six games
(`FORMAT_FAMILIES`), each playable **net or gross**. Gross versions give no handicap shots,
so net and gross come out the same.

| Game | Leaderboard row | Scores entered per hole |
|---|---|---|
| Best ball | the team | one per player, best counts |
| Scramble | the team | one team score |
| Shamble | the team | one per player, best counts |
| Alternate shot | the team | one team score |
| Aggregate | the team | one per player, all count |
| Individual | each player | one per player |

**Format and play are set on each round** in the console: a Net / Gross switch, a Stroke play /
Match play switch, then the six games as cards (`round.format`, `round.play`; defaults Best ball
(net), stroke play). Older saves kept a format on the event instead; the console moves it onto the
rounds, and the player app reads either through `formatOf()`. The "total" game is shown as
**Aggregate** — every player's score on the hole is added up for the team. The console adapts to
the formats in play: allowance settings hide when everything is gross, and team weightings only
show when a net scramble or alternate shot is being played.

Two independent axes are kept separate on purpose: **what a format does to a hole**
(`entry`) versus **who ends up on the leaderboard** (`unit`). The original KHC app fused
them, which is exactly what made it impossible to reuse. A net or gross version of an existing
game is just a row in `FORMATS`; a genuinely new game also needs a branch in
`computeHoleResult`, which branches on `family`.

Every round has its own format, so a five-round trip can be scramble on day one and singles on
day five. Teams, tee times and matches are set inside each round, so they can change day to day.

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

Teams can be given a **name** (`groups/<roundId>/<teamId>/name`); the leaderboard and scorecard
use it, with the players' surnames underneath. The console lays teams, tee times and matches out
as spreadsheet-style tables inside each round.

**The scorecard shows only the logged-in player's own card** — his tee time if he's in one (so a
foursome of two teams is one card, each team's boxes under its name), otherwise just his team.
Other groups are for the leaderboard: tapping a team, player or match opens its full card in a
read-only pop-up. Tee times and matches are filtered for display, not rewritten, when a round's
format changes, so switching back and forth doesn't wipe them.

## Match play

A round set to match play pairs entries into **matches** (`matches/<roundId>/<matchId>/unitIds`,
exactly two). The console builds them by hand or from tee times (any tee time with exactly two
entries). Each hole goes to the side with the lower net score — `matchStatus()` in `scoring.js`,
built on `computeHoleResult()`, so best ball still waits for every partner. A match is decided the
moment one side leads by more holes than remain, and its result is frozen there ("3&2") even
though the group keeps scoring for statistics. Points: 1 for a win, ½ each for a halved match,
counted only once a match is over. The leaderboard shows each match's status and a points table;
stats add holes won, halved and lost, credited to every player on the side.

## Handicaps

- Course handicap is always **calculated**, never typed: `index x (slope/113) + (rating - par)`.
  The commissioner enters the course's tees (rating/slope) and each player's index.
- The event-wide **allowance %** applies to every player — one number for the whole event,
  no per-player override. (There was one — a roster-row `allowancePct` — removed because it
  went unused and was confusing more than it helped.)
- **Allowance basis** is a choice: `full` (each player off his own handicap) or `off-lowest`.
  **Off lowest depends on the round's play:** stroke play plays off the low man in the whole
  field; match play plays off the low man in each match, so a player's shots depend on who he's
  up against. Team-ball formats do the same with the team handicap. `gameHandicaps()` is the one
  place this is worked out — the console's Game hcp column and the player app both use it.
- **Team handicaps** (net scramble / alternate shot only) are a separate choice: `formula` or
  `off-lowest` (every team drops by the lowest team's). The formula weightings are editable in
  the console (`event.teamWeights`), ranked lowest handicap to highest; defaults are 35/15 for a
  pair, 20/15/10 for three, 25/20/15/10 for four, and alternate shot is 50% of combined.
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
  /event    { name, allowancePct, allowanceMode, teamHcpMode, teamWeights? }
  /courses  { <courseId>: { name, location, holesCount,
                            holes: [{number, par, si}], tees: [{name, rating, slope, yards}] } }
  /roster   { <playerId>: { name, index, tee, email, code, commissioner? } }
  /rounds   { <roundId>: { name, courseId, format, play, order, maxScore, maxPlus?,
                           ctpOn, ctpHoles, ldOn, ldHoles,
                           skinsOn?, skinsGross?, skinsUnit? } }
  /groups   { <roundId>: { <teamId>: { name, playerIds: [...] } } }    teams (team formats)
  /teeTimes { <roundId>: { <teeTimeId>: { start, unitIds: [...] } } }  who goes out together
  /matches  { <roundId>: { <matchId>: { unitIds: [a, b] } } }          match play only

/covidcup_attest
  /<roundId>/<teamId or p-playerId>   { by: playerId or "commissioner", name, at }   a submitted card

/covidcup_scores
  /<roundId>/<teamId or p-playerId>/<holeNumber>
    { <playerId>: { v, x } }        player-entry formats
    { team:       { v, x } }        scramble / alternate shot
```

`v` is the gross strokes (or null). `x` is a boolean — the ball was picked up. Scores are
keyed by **real player id**, and `scoring.js` takes real ids directly (via `memberIds` plus
`playerPhs`), so the old generic `{a, b}` remapping is gone along with the class of bug it
caused.

Firebase project is `covid-cup-2026`, owned by Patrick's Google account
(phodgman22@gmail.com); Andrew has Editor access.

## Database rules

`database.rules.json` was **published to the live project by Andrew on 2026-09-09** (pasted
into Firebase console → Realtime Database → Rules), replacing the wide-open test-mode default.
That means the Oct 1, 2026 test-mode expiry no longer applies — as long as the console still
shows these rules. Deploy changes with `firebase deploy --only database`, or paste into the
Rules tab. **Editing or merging the file does not deploy it** — that's a separate, manual step.

What it does:

- Confines all access to `/covidcup` and `/covidcup_scores`; nothing else is granted.
- `/covidcup` requires the write to still look like a real config (`hasChild('event')`),
  which blocks an accidental full wipe without blocking admin's whole-object "Save all".
  Deliberately does *not* require `courses`/`roster`/`rounds`/`groups` to be present —
  they start as `{}`, and **Firebase never persists an empty object as a child**, so
  requiring them would reject the very first legitimate save. This is easy to get wrong.
- `/covidcup_scores` grants write only at the per-hole level, matching how
  `queueScoreWrite()` writes. Nobody can replace a whole team's card or the scores tree
  in one shot.
- Hole scores validate as numbers 1–15; `x` validates as a boolean; anything else is refused.
- `/covidcup_attest` (added 2026-09-14 — **publish it**) allows one team's submission at a time,
  carrying `by`, `name` and a numeric `at`, or its removal. Until it's published, Submit card
  fails with a permission error; scoring and everything else keep working.

**There is still no real access control.** Without Firebase Auth, rules cannot tell the
commissioner from a player, or one player from another. Anyone with the link can edit any
team's scores. This stops accidents, not a determined person.

## Spreadsheet setup

admin.html can download an `.xlsx` template and read a filled one back — four sheets: a
**Read me first** sheet (opened first) explaining how the other three link together, plus
three flat data sheets, one row per thing, so they stay obvious to someone editing them in
Excel:

- **Courses** — Course, Location, Holes (9 or 18), Tee, Rating, Slope, Yards.
  One row per *tee*, with the course name repeated.
- **Holes** — Course, Hole, Par, Stroke index.
- **Players** — Player, Handicap index, Tee, Email, Commissioner (Y/N).

The download always has one clearly-marked `EXAMPLE — delete this row` row on each of the
three data sheets, showing the expected shape, instead of a bare header row. The `EXAMPLE`
name makes a row left in by accident easy to spot afterward rather than becoming a real
course or player silently.

**Commissioner (Y/N)** on Players sets `roster[pid].commissioner` — see Commissioner mode
above. Blank means "leave it as it was", same as Email; only `Y`/`Yes`/`True`/`1`
(case-insensitive) turns it on, so re-uploading a sheet that never touched this column can't
accidentally take commissioner access away from someone it's already on for.

The download is always a blank template. Uploading **replaces** courses and players wholesale.

Things that are load-bearing here:

- **Players are matched by name** (case- and punctuation-insensitive, trimmed), and a
  match **keeps that player's existing login code** and per-player allowance. Without
  this, re-uploading a corrected spreadsheet would silently invalidate everyone's login
  the morning of the event. Same idea for courses, matched by name so rounds keep pointing
  at the right one.
- The name itself is taken **from the sheet**, so fixing a spelling there fixes it here.
- A course listed in Courses but absent from Holes still gets a default card, so it's
  scoreable rather than silently broken.
- Players dropped from the sheet are removed from any teams they were in, and a round
  whose course disappeared falls back to the first remaining course.
- Header matching is deliberately loose — real files come back with different casing and
  stray punctuation once a human has been in them.

SheetJS is loaded from cdnjs as a plain (non-module) script, so it must stay *above* the
module script that uses it.

## Scorecard

On eggshell stock rather than the dark theme, so it reads clearly outdoors. The palette is
redefined on the scorecard card, so everything inside flips together.

**Scoring moves one hole at a time:** any hole can be looked at, but holes after the first one
missing a score are view-only until every player on that hole has a score or Picked up. Going
back to fix a hole is always allowed. View-only holes render no scoring buttons at all.

## Closest to the pin and long drive

Set per round in the console: tick the contest and type the hole(s) (`ctpOn`/`ctpHoles`,
`ldOn`/`ldHoles`). Holes are free text like "2, 8", and only numbers that exist on the
round's course are used. The player app lists them on Home, badges the hole, dots it on the
strip, notes it on the hole before, and marks it on the full card. It does not record who won —
like Michigan, that's still settled on the course.

## Skins

Opt in per round in the console (`round.skinsOn`) — one checkbox, right next to closest to
the pin and long drive. Low score on a hole wins the skin; a tie carries it, and everything
already riding on it, to the next hole. `skinsForRound()` in scoring.js does the actual
counting and is format-agnostic — it runs on whatever `computeHoleResult` returns for each
unit, so it works the same in stroke or match play, team or individual formats.

**A hole only resolves once every unit in the round has a score on it**, not just the ones
on a given tee time — skins is a whole-field game, so one slow team holds up the whole thing
the same way one slow foursome would on the actual course. `perHole` stops at the first
unresolved hole rather than guessing; `carry` says how many skins are riding into it. The
player app shows a Skins table under the normal leaderboard (or under match play's
standings) once at least one skin's been won — nothing renders while every hole is still
tied or the field hasn't finished one yet.

**Skins runs its own gross/net and team/individual, independent of the round's own format**
(`round.skinsGross`, `round.skinsUnit`) — a net best ball round can still play its skins
gross, or as individuals instead of teams. **Defaults to gross and individual** — a
deliberate choice, not "whatever the round already is" — until the commissioner picks
otherwise; admin.html and index.html apply this default identically, since a round saved
before these fields existed has neither one set. Individual only shows as an option when the
round's own format actually enters individual scores (`FORMATS[format].entry === "player"`
— everything except scramble and alternate shot, which only ever have one team score to
work with). When skins runs individual, `skinsSectionHtml()` in index.html maps each player
back to his real team unit to find his stored score cell (storage is always keyed by the
round's real unit, whether or not skins is scoring it that way) and to decide what a tap on
his leaderboard row should open — there's no separate "skins unit" stored anywhere, it's
derived fresh every render.

**Ties can either carry or void** (`round.skinsCarry`, third toggle next to gross/net and
team/individual) — **defaults to carry**, matching how skins is normally played. With carry
on, a halved hole rolls its skin forward and stacks with whatever's already riding, same as
described above. With carry off, a halved hole is simply void: nobody wins it, it never
stacks onto the next hole, and every hole not tied is worth exactly one skin. `skinsForRound()`
takes this as an options arg (`{ carryOver }`, default `true`) — index.html passes
`round.skinsCarry ?? true` through on every call, same default-fallback pattern as gross/unit
above.

## Statistics

Gross and net, per round or Overall, and they follow the formats in view: a gross-only view
drops the net toggle, and best ball and shamble add **Counted** — how many holes a player's
score was the one his team used (both players on a tie). Match play rounds add **Won**,
**Halved** and **Lost** — holes, credited to every player on the side.

## Leaderboard

Styled as a hand-lettered clubhouse board — cream stock, blackletter surnames with a green
drop cap, first names small underneath, red numbers under par. It is a deliberate single
look and does not follow the app's dark theme. Fonts come from Google Fonts (Pirata One for
names and title, Kalam for numbers) with system fallbacks. A round shows Out, In and Total
to par, with ties shown as "T2" and "F" once all 18 are in. With more than one round there
is also an Overall board by player; with one round the round picker is hidden. Match play rounds
show a match board (each match's status) and a points table instead. Tapping any row opens that
team's, player's or match's full card in a pop-up.

## Commissioner mode

The commissioner uses the player app as well as the console. A console code typed on the player
login — or into "Commissioner login" at the bottom of a player's screen — turns on commissioner
mode (`isAdmin` in index.html):

- A bar across the top links to the console and sets **Playing as**, so a commissioner who is
  also playing still gets his own card by default. The console has a Player app link back.
- The Scorecard tab gets a card picker: every tee time, plus any team not in one.
- Every card can be edited, **including submitted ones**, and a submitted card can be reopened.
- The leaderboard pop-up has **Edit this card**, which opens that card on the Scorecard tab.

Players still only ever see their own card.

**A player can also be flagged as the commissioner** (`roster[pid].commissioner`, a checkbox
in admin.html's roster table — "Commish" — and a `Commissioner (Y/N)` column in the
spreadsheet template) so he doesn't have to carry a separate console PIN around on the
course. Logging in with just his own player code both sets `meId` to himself and calls the
same `unlockAdmin()` a console code does — one code, both. Covered from both sides: the
first-login path in the code-submit handler, and `trySavedLogin()` for a phone that already
had a plain player login saved before he was flagged. There's no way to un-flag yourself from
inside the player app — that's deliberate, it's a console setting.

## Submitting a card

Once every hole on a card has a score or pickup, the card offers **Review & submit** — as a banner
above the hole buttons, and in place of the Next button on the last hole. The review shows the full
card and totals, a "checked every score" tick box, and Submit. Submitting writes
`covidcup_attest/<roundId>/<teamId>` = `{ by, name, at }` for every team on the card.

- A submitted team is **locked for players**: no score boxes or buttons, and `queueScoreWrite()`
  refuses the write as well. The commissioner can still edit it, or **Reopen card**, which deletes
  the submission so the card has to be submitted again.
- The leaderboard shows a ✓ beside Thru for submitted cards, and the pop-up says who submitted.
- The lock lives in the app, not the rules — without auth the rules can't tell the commissioner
  from a player, and locking in the rules would lock him out too.

## Player codes

Each player gets a four-character code, generated in admin.html when he's added. Ambiguous
characters (0/O, 1/I/L, etc.) are excluded so codes are easy to read off a screen. "Send code"
on a roster row opens the commissioner's own mail app with the link and code filled in — one
player at a time, and only if he has an email on file.

**Export codes** (top of the Players card) downloads a small `.xlsx` — Name, Code, Email, one
row per player, sorted by name — for everyone at once: print it, paste it into a group text,
whatever's faster than clicking Send down the whole roster. `downloadCodes()` in admin.html,
next to `downloadTemplate()`; same `XLSX.writeFile` mechanism, its own status span
(`codesStatus`) rather than the Spreadsheet setup card's, since that one's far enough up the
page to go unnoticed from a button all the way down in Players.

**Codes are name tags, not passwords.** The whole roster ships to every phone, so anyone
can read all of them out of the page. They solve "which player am I", nothing more.

## Bugs already found and fixed here — don't reintroduce them

1. **Shared debounce timer dropped writes.** The original `queueScoreWrite()` used one
   `writeTimer` for every field, so entering hole 1 then hole 2 cancelled hole 1's pending
   write before it reached Firebase. Fixed by keying the debounce per
   `${roundId}|${groupId}|${hole}|${field}` (see `writeTimers` in index.html).

2. **Stale scores reference left the running total at zero.** The scorecard once captured
   `scores[roundId][groupId]`, but the first entry on a fresh card *creates* that object,
   so the captured reference stayed empty forever and "thru" never moved off 0. The
   scorecard now reads the live scores object every time (`cellFor()`, `unitScores()`).
   Don't reintroduce a captured copy.

3. **Key mismatch between storage and scoring.js** (historical). Storage was keyed by real
   player id while scoring.js expected generic `{a, b}`, which silently produced `thru: 0`.
   Structurally gone now that scoring.js takes real ids — keep it that way.

4. **Look-ahead holes killed navigation.** View-only holes render no Picked up or Clear
   buttons, but the Clear button was still wired up unconditionally; that threw, and Next and
   the hole strip never got their handlers. Anything wiring up the hole view must tolerate a
   missing button.

## Known gaps (not bugs, just not built yet)

- **No anonymous auth.** Locking rules to `auth != null` would keep out anyone not using
  the app, and costs nothing. Requires enabling Anonymous sign-in in the Firebase console
  **before** the tightened rules deploy, or the app breaks.
- **No SMS.** A static app can't send messages on its own. Email works through `mailto:` —
  "Send code" hands a pre-filled message to the commissioner's own mail app.
- **Submitted cards are locked in the app only** (see Submitting a card).
- **No per-course tee selection** for a player (see Handicaps above).
- **No admin-side leaderboard** — the commissioner uses the player-facing one.

## Testing

- **App:** `node serve.js`, then http://localhost:8765. With the real `firebase-config.js`
  this reads and writes the **live** database. To test without touching live data,
  temporarily set `apiKey: "REPLACE_ME"` — the app then runs off browser storage — and never
  commit that change.
- **Scoring:** `node tests/run.mjs` runs every assertion over `scoring.js` — formats, gross vs
  net, handicaps, team weightings, match play, max score, pickups, Counted and stats. No install needed;
  it requires Node 22.12 or newer, which loads `scoring.js` as an ES module without a
  `package.json`. Run it after any change to the scoring math.
