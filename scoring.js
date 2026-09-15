// Shared scoring math for Covid Cup 2026. Pure functions — no DOM, no Firebase.
//
// Groups are any size (twosome, threesome, foursome, ...), not just pairs, and an
// event can run any number of rounds. Every format below is scored onto ONE flat
// leaderboard — there is deliberately no match play or team-vs-team here.

/* ---------- formats ---------- */

// family  — the game being played; a game's net and gross versions share a family
// gross   — scored off actual strokes, with no handicap shots at all
// unit    — what appears as a leaderboard row: the whole team, or each player
// entry   — how many scores get entered per hole: one for the team, or one per player
// teamHcp — a single team ball, netted off a combined team handicap
export const FORMATS = {
  "best-ball-net":        { label: "Best ball (net)",         family: "best-ball",      gross: false, unit: "group",  entry: "player", teamHcp: false },
  "best-ball-gross":      { label: "Best ball (gross)",       family: "best-ball",      gross: true,  unit: "group",  entry: "player", teamHcp: false },
  "scramble":             { label: "Scramble (net)",          family: "scramble",       gross: false, unit: "group",  entry: "team",   teamHcp: true  },
  "scramble-gross":       { label: "Scramble (gross)",        family: "scramble",       gross: true,  unit: "group",  entry: "team",   teamHcp: false },
  "shamble":              { label: "Shamble (net)",           family: "shamble",        gross: false, unit: "group",  entry: "player", teamHcp: false },
  "shamble-gross":        { label: "Shamble (gross)",         family: "shamble",        gross: true,  unit: "group",  entry: "player", teamHcp: false },
  "alternate-shot":       { label: "Alternate shot (net)",    family: "alternate-shot", gross: false, unit: "group",  entry: "team",   teamHcp: true  },
  "alternate-shot-gross": { label: "Alternate shot (gross)",  family: "alternate-shot", gross: true,  unit: "group",  entry: "team",   teamHcp: false },
  "total-net":            { label: "Aggregate (net)",         family: "total",          gross: false, unit: "group",  entry: "player", teamHcp: false },
  "total-gross":          { label: "Aggregate (gross)",       family: "total",          gross: true,  unit: "group",  entry: "player", teamHcp: false },
  "individual-net":       { label: "Individual (net)",        family: "individual",     gross: false, unit: "player", entry: "player", teamHcp: false },
  "individual-gross":     { label: "Individual (gross)",      family: "individual",     gross: true,  unit: "player", entry: "player", teamHcp: false }
};

// The games, in the order the console offers them, with the plain-English line a
// commissioner needs to pick one.
export const FORMAT_FAMILIES = {
  "best-ball":      { label: "Best ball",      blurb: "Everyone plays his own ball. The team takes the best score on each hole." },
  "scramble":       { label: "Scramble",       blurb: "Everyone hits, the team picks the best shot and all play from there. One team score." },
  "shamble":        { label: "Shamble",        blurb: "Pick the best drive, then everyone plays his own ball in. The team takes the best score." },
  "alternate-shot": { label: "Alternate shot", blurb: "Partners take turns hitting one ball. One team score." },
  "total":          { label: "Aggregate",      blurb: "Everyone plays his own ball, and every player's score on the hole is added up for the team." },
  "individual":     { label: "Individual",     blurb: "Classic stroke play. Every player is on his own." }
};

export const DEFAULT_FORMAT = "best-ball-net";

// The format key for a game played net or gross.
export const formatFor = (family, gross) =>
  Object.keys(FORMATS).find(k => FORMATS[k].family === family && FORMATS[k].gross === !!gross) || DEFAULT_FORMAT;

// A round follows the event's format unless it has been given its own.
export const formatOf = (round, event) => round?.format || event?.format || DEFAULT_FORMAT;

export const isGrossFormat = f => !!FORMATS[f]?.gross;

/* ---------- course + handicap math ---------- */

export function coursePar(holes){
  return (holes || []).reduce((sum, h) => sum + (+h.par || 0), 0);
}

// Course Handicap = Index x (Slope / 113) + (Rating - Par)
export function courseHandicap(index, tee, par){
  if (!tee) return 0;
  return (+index || 0) * ((+tee.slope || 113) / 113) + ((+tee.rating || par) - par);
}

/**
 * Every player's playing handicap for one round, as { playerId: strokes }.
 *
 * allowanceMode:
 *   "full"       — each player plays off his own allowance-adjusted course handicap
 *   "off-lowest" — the same, then everyone drops by the lowest in the field, so the
 *                  best player plays off scratch and everyone else off the difference
 *
 * maxStrokes caps each player's course handicap before allowanceMode is applied — a null
 * or undefined maxStrokes means no cap. Capping first (rather than after off-lowest) keeps
 * the cap meaning "nobody's course handicap counts for more than this," independent of how
 * the field's strokes get redistributed afterward.
 */
export function playingHandicaps(roster, course, { allowancePct = 100, allowanceMode = "full", maxStrokes } = {}){
  const par = coursePar(course.holes);
  const teeByName = new Map((course.tees || []).map(t => [t.name, t]));
  const pct = allowancePct / 100;
  const cap = maxStrokes == null || maxStrokes === "" ? null : +maxStrokes;

  const out = {};
  Object.entries(roster || {}).forEach(([id, p]) => {
    const raw = Math.round(courseHandicap(p.index, teeByName.get(p.tee), par) * pct);
    out[id] = cap != null ? Math.min(raw, cap) : raw;
  });

  if (allowanceMode === "off-lowest"){
    const values = Object.values(out);
    if (values.length){
      const lowest = Math.min(...values);
      Object.keys(out).forEach(id => { out[id] -= lowest; });
    }
  }
  return out;
}

// Default weightings by team size, best player first. Percentages, so they read the
// same way a commissioner says them out loud: "35 of the low, 15 of the high."
// The console can override any of these per format — see event.teamWeights.
export const DEFAULT_TEAM_WEIGHTS = {
  "scramble":       { 2: [35, 15], 3: [20, 15, 10], 4: [25, 20, 15, 10] },
  // Foursomes is 50% of the combined handicap, which is 50% of each player whatever
  // the group size, so the same number repeats across the row.
  "alternate-shot": { 2: [50, 50], 3: [50, 50, 50], 4: [50, 50, 50, 50] }
};

export const weightsFor = (format, size, table) =>
  table?.[format]?.[size] || DEFAULT_TEAM_WEIGHTS[format]?.[size] || null;

/**
 * One team's combined handicap, for the formats that play a single team ball.
 * Members are sorted by handicap first, so weights[0] is always the LOWEST handicap
 * in the group, weights[1] the next, and so on up to the highest.
 * `table` is the commissioner's override; omit it to use the defaults above.
 */
export function teamHandicapFormula(format, memberPhs, table){
  const phs = [...memberPhs].sort((a, b) => a - b);
  if (!phs.length) return 0;

  const weights = weightsFor(format, phs.length, table);
  if (!weights){
    // No weighting configured for this group size — split evenly rather than
    // silently handing the team a zero.
    return Math.round(phs.reduce((a, b) => a + b, 0) / phs.length);
  }
  return Math.round(phs.reduce((sum, ph, i) => sum + ph * ((+weights[i] || 0) / 100), 0));
}

/**
 * Team handicaps for every group, as { groupId: strokes }.
 * mode "off-lowest" drops every team by the lowest team's handicap, so the best
 * team plays off scratch — the team-level equivalent of the player option above.
 */
export function teamHandicaps(format, groups, playerPhs, mode = "formula", table){
  const out = {};
  Object.entries(groups || {}).forEach(([gid, g]) => {
    const phs = (g.playerIds || []).map(id => playerPhs[id] ?? 0);
    out[gid] = teamHandicapFormula(format, phs, table);
  });

  if (mode === "off-lowest"){
    const values = Object.values(out);
    if (values.length){
      const lowest = Math.min(...values);
      Object.keys(out).forEach(gid => { out[gid] -= lowest; });
    }
  }
  return out;
}

/**
 * What every player (and team) actually receives for one round's game, as
 * { playerPhs: { playerId: strokes }, teamPhs: { unitId: strokes } }.
 *
 * Stroke play plays off the low man in the whole field. Match play plays off the low man in
 * each match, so the same player gets different shots depending on who he's up against.
 * "full" skips the subtraction either way. Team-ball formats apply the same idea to the team
 * handicap (teamHcpMode), and gross formats give nothing to anybody. The console's Game hcp
 * column and the player app both come through here, so they can't disagree.
 */
export function gameHandicaps({ roster = {}, course, format, play = "stroke", allowancePct = 100,
                                allowanceMode = "full", teamHcpMode = "formula", teamWeights,
                                maxStrokes, units = {}, matches = [] } = {}){
  const f = FORMATS[format] || FORMATS[DEFAULT_FORMAT];
  const playerPhs = {};
  const teamPhs = {};

  if (f.gross){
    Object.keys(roster).forEach(id => { playerPhs[id] = 0; });
    Object.keys(units).forEach(u => { teamPhs[u] = 0; });
    return { playerPhs, teamPhs };
  }

  if (play !== "match"){
    Object.assign(playerPhs, playingHandicaps(roster, course, { allowancePct, allowanceMode, maxStrokes }));
    if (f.teamHcp) Object.assign(teamPhs, teamHandicaps(format, units, playerPhs, teamHcpMode, teamWeights));
    return { playerPhs, teamPhs };
  }

  const full = playingHandicaps(roster, course, { allowancePct, allowanceMode: "full", maxStrokes });
  Object.assign(playerPhs, full);
  const baseTeam = f.teamHcp ? teamHandicaps(format, units, full, "formula", teamWeights) : {};
  Object.assign(teamPhs, baseTeam);

  (matches || []).forEach(m => {
    const sides = (m.unitIds || []).filter(u => units[u]);
    if (sides.length !== 2 || sides[0] === sides[1]) return;
    if (f.teamHcp){
      if (teamHcpMode !== "off-lowest") return;
      const low = Math.min(...sides.map(u => baseTeam[u] ?? 0));
      sides.forEach(u => { teamPhs[u] = (baseTeam[u] ?? 0) - low; });
    } else if (allowanceMode === "off-lowest"){
      const ids = sides.flatMap(u => units[u].playerIds || []);
      const low = Math.min(...ids.map(id => full[id] ?? 0));
      ids.forEach(id => { playerPhs[id] = (full[id] ?? 0) - low; });
    }
  });
  return { playerPhs, teamPhs };
}


/**
 * Strokes received on one hole. A hole gives a stroke once the handicap reaches its
 * stroke index, a second past holeCount + that index, and so on — no cap.
 * holeCount is 18 or 9, so a 9-hole card with stroke indexes 1-9 allocates correctly.
 */
export function strokesOnHole(playingHcp, strokeIndex, holeCount = 18){
  const ph = +playingHcp || 0;
  if (ph < strokeIndex) return 0;
  return Math.floor((ph - strokeIndex) / holeCount) + 1;
}

// Net double bogey expressed as a GROSS score: par, plus two, plus any strokes received.
export function netDoubleBogey(par, strokes){
  return (+par || 0) + 2 + strokes;
}

/* ---------- maximum score ---------- */

// Every rule resolves to a GROSS cap for one player on one hole, since that's what gets
// compared with the number somebody typed. `plus` only matters for "par-plus".
export const MAX_SCORE_RULES = {
  "double-par":       { label: "Double par" },
  "net-double-bogey": { label: "Net double bogey (par + 2 + shots)" },
  "triple-bogey":     { label: "Triple bogey (par + 3)" },
  "par-plus":         { label: "Par plus a set number" },
  "none":             { label: "No maximum — every hole holed out" }
};
export const DEFAULT_MAX_RULE = "double-par";

export function grossCap(rule = DEFAULT_MAX_RULE, par, shots = 0, plus = 4){
  const p = +par || 0;
  switch (rule){
    case "none":             return null;
    case "net-double-bogey": return netDoubleBogey(p, shots);
    case "triple-bogey":     return p + 3;
    case "par-plus":         return p + (+plus || 0);
    default:                 return p * 2;   // double par, the default
  }
}

/**
 * One entered cell ({v, x}) as the score that actually counts on the hole, for whoever
 * receives `shots` there. Returns null if nothing usable has been entered.
 *
 * - A picked-up ball scores the round's maximum. With no maximum set there is nothing to
 *   give it, so it falls back to double par rather than silently scoring zero.
 * - A typed score above the maximum counts as the maximum. The typed number stays in
 *   storage, so changing a round's rule later re-scores the card correctly.
 * - Net is always gross minus shots. Net double bogey's NET value is par + 2; the
 *   par + 2 + shots figure is its gross equivalent. Treating that gross figure as net
 *   scored every pickup one stroke too harshly for anyone getting a shot on the hole.
 */
export function scoreCell(cell, par, shots, maxRule, maxPlus){
  if (!cell) return null;
  const cap = grossCap(maxRule, par, shots, maxPlus);

  if (cell.x){
    const gross = cap ?? (+par || 0) * 2;
    return { gross, net: gross - shots, pickedUp: true, capped: false };
  }
  if (cell.v == null) return null;
  const capped = cap != null && cell.v > cap;
  const gross = capped ? cap : cell.v;
  return { gross, net: gross - shots, pickedUp: false, capped };
}

/* ---------- hole scoring ---------- */

/**
 * One hole's result for a group (or for a single player, in individual formats).
 *
 * hole:  { number, par, si }
 * entry: { <playerId>: {v, x}, team: {v, x} }
 * ctx:   { memberIds, playerPhs, teamPh, holeCount, maxRule, maxPlus }
 *
 * Returns null when not enough has been entered to score the hole yet, otherwise
 * { net, gross } — gross is null for formats that only make sense net.
 */
export function computeHoleResult(format, hole, entry, ctx){
  const { memberIds = [], playerPhs = {}, teamPh = 0, holeCount = 18, maxRule, maxPlus } = ctx || {};
  const f = FORMATS[format];
  if (!f) return null;
  const par = +hole.par || 0;
  const si = +hole.si || 0;
  // Gross formats give no handicap shots, so net and gross come out the same.
  const shotsFor = ph => f.gross ? 0 : strokesOnHole(ph, si, holeCount);

  if (f.entry === "team"){
    const res = scoreCell(entry?.team, par, shotsFor(teamPh), maxRule, maxPlus);
    if (!res) return null;
    return { net: res.net, gross: res.gross };
  }

  const results = memberIds
    .map(id => scoreCell(entry?.[id], par, shotsFor(playerPhs[id]), maxRule, maxPlus))
    .filter(Boolean);

  if (!results.length) return null;

  if (f.family === "individual"){
    return { net: results[0].net, gross: results[0].gross };
  }

  // Wait for every partner. Nothing is decided off a half-filled hole: the first score in
  // can look like the team's result and then change when the partner's lands.
  if (results.length < memberIds.length) return null;

  if (f.family === "best-ball" || f.family === "shamble"){
    return { net: Math.min(...results.map(r => r.net)), gross: null };
  }
  if (f.family === "total"){
    return { net: results.reduce((s, r) => s + r.net, 0), gross: null };
  }
  return null;
}

/**
 * A scoring unit's running total for one round.
 * scores: { <holeNumber>: entry } for this group.
 * Returns { total, thru, toPar }.
 */
export function roundTotals(format, holes, scores, ctx){
  let total = 0, thru = 0, par = 0;
  (holes || []).forEach(h => {
    const entry = scores?.[h.number];
    if (!entry) return;
    const result = computeHoleResult(format, h, entry, ctx);
    if (!result) return;
    total += result.net;
    par += (+h.par || 0);
    thru += 1;
  });
  return { total, thru, toPar: total - par };
}

/* ---------- match play ---------- */

// Who took one hole: "A", "B", "H" for halved, or null until both sides have a result.
// Each side is scored exactly as it would be in stroke play, so best ball still waits for
// every partner before the hole can be decided.
export function matchHoleResult(format, hole, entries, ctxs){
  const a = computeHoleResult(format, hole, entries?.[0], ctxs?.[0]);
  const b = computeHoleResult(format, hole, entries?.[1], ctxs?.[1]);
  if (!a || !b) return null;
  return a.net < b.net ? "A" : b.net < a.net ? "B" : "H";
}

/* ---------- skins ---------- */

/**
 * A round's skins game, straight through in hole order: outright low score on a hole wins
 * it. A hole only resolves once every unit in the round has a result on it — one unit still
 * out means nobody can be declared low yet — so this stops at the first hole that isn't
 * fully in and leaves the rest unresolved rather than guessing.
 *
 * carryOver (default true) decides what a tie does:
 *   true  — the skin (and everything already riding on it) carries to the next hole
 *   false — a tied hole is just void. Nobody gets it, ever, and it does not add to the next
 *           hole's stakes — every hole is worth exactly one skin, win it outright or lose it.
 *
 * unitScores: { unitId: { holeNumber: entry } }, one entry per unit for every unit playing.
 * ctxs:       { unitId: ctx } — same per-unit ctx shape computeHoleResult takes.
 *
 * Returns { perHole: [{hole, winnerUnitId, skins}], totals: {unitId: skinsWon}, carry }.
 * `winnerUnitId` is null on a halved hole. `carry` is however many skins are still
 * unclaimed, riding into the first unresolved hole — always 0 when carryOver is false.
 */
export function skinsForRound(format, holes, unitScores, ctxs, { carryOver = true } = {}){
  const unitIds = Object.keys(unitScores || {});
  const totals = {};
  unitIds.forEach(u => { totals[u] = 0; });

  const perHole = [];
  let carry = 0;

  for (const h of (holes || [])){
    const results = {};
    let allIn = unitIds.length > 0;
    for (const u of unitIds){
      const entry = unitScores[u]?.[h.number];
      const res = entry ? computeHoleResult(format, h, entry, ctxs?.[u]) : null;
      if (!res){ allIn = false; break; }
      results[u] = res.net;
    }
    if (!allIn) break;

    if (carryOver) carry += 1;
    const low = Math.min(...Object.values(results));
    const winners = unitIds.filter(u => results[u] === low);

    if (winners.length === 1){
      const skins = carryOver ? carry : 1;
      totals[winners[0]] += skins;
      perHole.push({ hole: h.number, winnerUnitId: winners[0], skins });
      carry = 0;
    } else {
      perHole.push({ hole: h.number, winnerUnitId: null, skins: carry });
    }
  }

  return { perHole, totals, carry };
}

/**
 * The state of one match, from each side's scores ({ holeNumber: entry }) and hole context.
 *
 * A match is decided the moment one side leads by more holes than remain, and its result is
 * frozen there ("3&2") — the group keeps scoring for statistics, but those holes can't change
 * who won. `points` is [a, b]: 1 for a win, ½ each for a halve, null until the match is over.
 */
export function matchStatus(format, holes, sideScores, ctxs){
  const list = holes || [];
  const total = list.length;
  let a = 0, b = 0, thru = 0, decided = null;
  const results = [];

  list.forEach(h => {
    const r = matchHoleResult(format, h, [sideScores?.[0]?.[h.number], sideScores?.[1]?.[h.number]], ctxs);
    if (!r) return;
    thru += 1;
    if (r === "A") a += 1;
    else if (r === "B") b += 1;
    results.push({ hole: h.number, result: r });
    if (!decided && Math.abs(a - b) > total - thru) decided = { up: a - b, remaining: total - thru };
  });

  const up = decided ? decided.up : a - b;
  const finished = !!decided || (total > 0 && thru === total);
  const leader = up > 0 ? "A" : up < 0 ? "B" : null;

  let label = "";
  if (thru){
    if (decided && decided.remaining > 0) label = Math.abs(up) + "&" + decided.remaining;
    else if (finished) label = up === 0 ? "Halved" : Math.abs(up) + " UP";
    else label = up === 0 ? "AS" : Math.abs(up) + " UP";
  }

  const points = finished && thru ? (up > 0 ? [1, 0] : up < 0 ? [0, 1] : [0.5, 0.5]) : null;
  return { thru, total, won: [a, b], up, leader, finished, winner: finished ? leader : null, label, points, results };
}


// Adds up per-round totals into one event-wide line for the leaderboard.
export function eventTotals(roundResults){
  return (roundResults || []).reduce((acc, r) => ({
    total: acc.total + r.total,
    thru:  acc.thru  + r.thru,
    toPar: acc.toPar + r.toPar,
    roundsPlayed: acc.roundsPlayed + (r.thru > 0 ? 1 : 0)
  }), { total: 0, thru: 0, toPar: 0, roundsPlayed: 0 });
}

export function fmtToPar(toPar){
  if (toPar === 0) return "E";
  return toPar > 0 ? `+${toPar}` : `${toPar}`;
}

/* ---------- statistics ---------- */

/**
 * Every hole a player has a score on in one round, as
 * { playerId: [{ hole, par, gross, net, pickedUp, capped, counted }] }, with the round's
 * maximum already applied — the same numbers the leaderboard counts.
 *
 * In scramble and alternate shot the pair share a single score, so that score is
 * credited to BOTH partners — otherwise a man who played four team rounds would show
 * no statistics at all.
 *
 * `counted` answers "did his score count for the team on this hole?" — the stroke-play
 * answer to holes won. In best ball and shamble it is true for whoever made the team's
 * score (both players on a tie), once every partner has a score in. In total formats every
 * score counts. Team-ball and individual formats leave it out.
 */
export function collectPlayerHoles(format, holes, groups, roundScores, playerPhs, teamPhs, holeCount = 18, maxRule, maxPlus){
  const out = {};
  const f = FORMATS[format];
  if (!f) return out;
  const teamEntry = f.entry === "team";
  const bestOf = f.family === "best-ball" || f.family === "shamble";

  Object.entries(groups || {}).forEach(([gid, g]) => {
    const memberIds = g.playerIds || [];
    const groupScores = roundScores?.[gid] || {};

    (holes || []).forEach(h => {
      const entry = groupScores[h.number];
      if (!entry) return;

      const scored = memberIds.map(pid => {
        const cell = teamEntry ? entry.team : entry[pid];
        // A team score is netted off the team handicap, an individual one off his own;
        // gross formats give no shots at all.
        const ph = teamEntry ? (teamPhs?.[gid] ?? 0) : (playerPhs?.[pid] ?? 0);
        const shots = f.gross ? 0 : strokesOnHole(ph, h.si, holeCount);
        return { pid, res: scoreCell(cell, h.par, shots, maxRule, maxPlus) };
      });

      const complete = scored.every(s => s.res);
      const best = complete && bestOf ? Math.min(...scored.map(s => s.res.net)) : null;

      scored.forEach(({ pid, res }) => {
        if (!res) return;
        let counted;
        if (bestOf) counted = complete && res.net === best;
        else if (f.family === "total") counted = true;
        (out[pid] = out[pid] || []).push({
          hole: h.number, par: h.par, ...res,
          ...(counted === undefined ? {} : { counted })
        });
      });
    });
  });
  return out;
}

const emptyBucket = () => ({ toPar: 0, holes: 0, eagles: 0, birdies: 0, pars: 0, bogeys: 0, doubles: 0 });

function addToBucket(bucket, strokes, par){
  const d = strokes - par;
  bucket.toPar += d;
  bucket.holes += 1;
  if (d <= -2) bucket.eagles += 1;
  else if (d === -1) bucket.birdies += 1;
  else if (d === 0) bucket.pars += 1;
  else if (d === 1) bucket.bogeys += 1;
  else bucket.doubles += 1;
}

/**
 * Roll a player's hole records into gross and net summaries.
 *
 * A picked-up ball scores the round's maximum in both, so gross and net always cover the
 * same holes. "Doubles" counts HOLES at double bogey or worse, not strokes dropped.
 */
export function summarisePlayer(records){
  const gross = emptyBucket();
  const net = emptyBucket();
  let pickedUp = 0, counted = 0, countable = 0;

  (records || []).forEach(r => {
    if (r.pickedUp) pickedUp += 1;
    if (r.counted !== undefined){ countable += 1; if (r.counted) counted += 1; }
    addToBucket(gross, r.gross, r.par);
    addToBucket(net, r.net, r.par);
  });

  return { gross, net, pickedUp, counted, countable, holesPlayed: (records || []).length };
}
