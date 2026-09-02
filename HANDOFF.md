# Covid Cup 2026 — handoff notes

Context for whoever (or whichever Claude) picks this up next. Read this before making
changes — a couple of the design choices below aren't obvious from the code alone.

## What this is

A static, no-build web app for scoring Covid Cup 2026, a twosomes-format golf outing.
It was forked from a much larger KHC Outing app (Ryder Cup match play + foursome stroke
play, two rival teams, mascot animations). This app deliberately does **not** carry any
of that over — Covid Cup is a flat field of twosomes competing on one leaderboard, not
team-vs-team. If you're tempted to add team-vs-team concepts, that's almost certainly
the wrong direction for this event.

## Live URLs

- Player view: https://phodgman22.github.io/Covid-Cup-2026/
- Commissioner console: https://phodgman22.github.io/Covid-Cup-2026/admin.html
  (PIN is the `ADMIN_PIN` constant near the top of the `<script type="module">` in
  admin.html — it's plain text in public source, so it's a "keep casual players out"
  gate, not real security)

Deployed via GitHub Pages from `main`/root — any push to `main` goes live within a
minute or two, no build step, no CI.

## Architecture

Four files, no bundler, no framework:

- **`index.html`** — player-facing. Three tabs: Home (course/format/pairings, read-only),
  Scorecard (enter your pairing's hole-by-hole scores), Leaderboard (live ranking).
  Reads everything from Firebase via `onValue` (live-updating).
- **`admin.html`** — commissioner-facing, PIN-gated. Course info, roster, pairings,
  format settings. Writes to Firebase on "Save all".
- **`scoring.js`** — pure functions, no DOM/Firebase dependency. Course/playing
  handicap math (standard USGA formula), stroke allocation by stroke index, and
  per-format hole scoring for all five formats (net best ball, shamble, scramble,
  stroke net, stroke gross). If you're checking or extending the scoring math, this
  is the only file that should need touching.
- **`firebase-config.js`** — shared Firebase client config, imported by both HTML
  files. The API key here is meant to be public (Firebase security is enforced by
  database rules, not by hiding this file) — don't treat it as a secret.

## Firebase data model (Realtime Database)

```
/covidcup
  /course    { name, location, holesCount, holes: [{number, par, si}], tees: [{name, rating, slope}] }
  /roster    { <playerId>: { name, hcp, tee } }
  /pairings  { <pairingId>: { playerIds: [idA, idB], start } }
  /settings  { scoringType, hcpAllowance, shotgun }

/covidcup_scores
  /<pairingId>/<holeNumber>
    net-best-ball / shamble / stroke-net / stroke-gross: { <idA>: gross, <idB>: gross }
    scramble: { team: gross }
```

Scores are keyed by **real player id**, not generic `a`/`b` — that's deliberate, so
either partner's entry is unambiguous regardless of who's looking at the data. `scoring.js`
works in generic `{a, b, team}` terms though, so `index.html` remaps between the two
(see `mapForScoring()`). This mismatch caused a real bug once already — see below.

Firebase project is `covid-cup-2026`, owned by Patrick's Google account
(phodgman22@gmail.com); Andrew has Editor access. Database rules are wide open
(test mode) until **October 1, 2026** — fine for the event, but tighten before then
if the app lives on past this outing.

## Two real bugs already found and fixed here — don't reintroduce them

1. **Key mismatch between storage and scoring.js.** Scores are stored keyed by real
   player id (`{alice: 5, bob: 4}`), but `computeHoleResult()`/`pairingTotals()` in
   scoring.js expect `{a, b, team}`. Always go through `mapForScoring(rawScores, idA, idB)`
   before calling into scoring.js — calling it directly with raw stored data silently
   produces `thru: 0` for every pairing.

2. **Shared debounce timer dropped writes.** The original `queueScoreWrite()` used one
   `writeTimer` variable for every field, so typing scores for hole 1 then immediately
   hole 2 would cancel hole 1's pending write before it ever reached Firebase — only
   the last-edited field survived. Fixed by keying the debounce per
   `${pairingId}|${hole}|${field}` (see `writeTimers` Map in index.html). If you touch
   `queueScoreWrite`, keep the per-field keying.

## Known gaps (not bugs, just not built yet)

- No support for a picked-up ball ("X" / max score). Every hole needs a real number.
- No access control on score entry — anyone with the player link can edit any
  pairing's scores, not just their own. Fine for a casual outing; would need actual
  auth (Firebase Auth or similar) to lock down properly.
- No admin-side visibility into live scores/leaderboard from admin.html — the
  commissioner has to use the same player-facing Leaderboard tab as everyone else.

## Testing locally

No dev server config is checked in. A quick static file server (Python's
`http.server`, or any equivalent) pointed at this directory works fine — just make
sure you're loading it over `http://`, not `file://`, since the module scripts and
`fetch()` calls need a real origin.
