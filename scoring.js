// Shared scoring math for Covid Cup 2026. Pure functions — no DOM, no Firebase.
//
// Groups are any size (twosome, threesome, foursome, ...), not just pairs, and an
// event can run any number of rounds. Every format below is scored onto ONE flat
// leaderboard — there is deliberately no match play or team-vs-team here.

/* ---------- formats ---------- */

// unit  — what appears as a leaderboard row: the whole group, or each player
// entry — how many scores get entered per hole: one for the team, or one per player
export const FORMATS = {
  "scramble":         { label: "Scramble",              unit: "group",  entry: "team",   teamHcp: true },
  "alternate-shot":   { label: "Alternate shot",        unit: "group",  entry: "team",   teamHcp: true },
  "best-ball-net":    { label: "Best ball (net)",       unit: "group",  entry: "player", teamHcp: false },
  "shamble":          { label: "Shamble",               unit: "group",  entry: "player", teamHcp: false },
  "total-net":        { label: "Total net (all count)", unit: "group",  entry: "player", teamHcp: false },
  "total-gross":      { label: "Total gross",           unit: "group",  entry: "player", teamHcp: false },
  "individual-net":   { label: "Individual (net)",      unit: "player", entry: "player", teamHcp: false },
  "individual-gross": { label: "Individual (gross)",    unit: "player", entry: "player", teamHcp: false }
};

export const isGrossFormat = f => f === "total-gross" || f === "individual-gross";

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
 * A player can carry his own allowancePct, which overrides the event-wide one.
 */
export function playingHandicaps(roster, course, { allowancePct = 100, allowanceMode = "full" } = {}){
  const par = coursePar(course.holes);
  const teeByName = new Map((course.tees || []).map(t => [t.name, t]));

  const out = {};
  Object.entries(roster || {}).forEach(([id, p]) => {
    const pct = (p.allowancePct ?? allowancePct) / 100;
    out[id] = Math.round(courseHandicap(p.index, teeByName.get(p.tee), par) * pct);
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
  const par = +hole.par || 0;
  const si = +hole.si || 0;

  if (FORMATS[format]?.entry === "team"){
    const res = scoreCell(entry?.team, par, strokesOnHole(teamPh, si, holeCount), maxRule, maxPlus);
    if (!res) return null;
    return { net: res.net, gross: res.gross };
  }

  const results = memberIds
    .map(id => scoreCell(entry?.[id], par, strokesOnHole(playerPhs[id], si, holeCount), maxRule, maxPlus))
    .filter(Boolean);

  if (!results.length) return null;

  if (format === "best-ball-net" || format === "shamble"){
    // Wait for every partner. Nothing is decided off a half-filled hole: the first score
    // in can look like the team's result and then change when the partner's lands.
    if (results.length < memberIds.length) return null;
    return { net: Math.min(...results.map(r => r.net)), gross: null };
  }
  if (format === "total-net"){
    if (results.length < memberIds.length) return null;
    return { net: results.reduce((s, r) => s + r.net, 0), gross: null };
  }
  if (format === "total-gross"){
    if (results.length < memberIds.length) return null;
    return { net: results.reduce((s, r) => s + r.gross, 0), gross: null };
  }
  if (format === "individual-net"){
    return { net: results[0].net, gross: results[0].gross };
  }
  if (format === "individual-gross"){
    return { net: results[0].gross, gross: results[0].gross };
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
 * { playerId: [{ hole, par, gross, net, pickedUp, capped }] }, with the round's maximum
 * score already applied — the same numbers the leaderboard counts.
 *
 * In scramble and alternate shot the pair share a single score, so that score is
 * credited to BOTH partners — otherwise a man who played four team rounds would show
 * no statistics at all.
 */
export function collectPlayerHoles(format, holes, groups, roundScores, playerPhs, teamPhs, holeCount = 18, maxRule, maxPlus){
  const out = {};
  const teamEntry = FORMATS[format]?.entry === "team";

  Object.entries(groups || {}).forEach(([gid, g]) => {
    const memberIds = g.playerIds || [];
    const groupScores = roundScores?.[gid] || {};

    (holes || []).forEach(h => {
      const entry = groupScores[h.number];
      if (!entry) return;

      memberIds.forEach(pid => {
        const cell = teamEntry ? entry.team : entry[pid];
        // A team score is netted off the team handicap, an individual one off his own.
        const ph = teamEntry ? (teamPhs?.[gid] ?? 0) : (playerPhs?.[pid] ?? 0);
        const res = scoreCell(cell, h.par, strokesOnHole(ph, h.si, holeCount), maxRule, maxPlus);
        if (!res) return;
        (out[pid] = out[pid] || []).push({ hole: h.number, par: h.par, ...res });
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
  let pickedUp = 0;

  (records || []).forEach(r => {
    if (r.pickedUp) pickedUp += 1;
    addToBucket(gross, r.gross, r.par);
    addToBucket(net, r.net, r.par);
  });

  return { gross, net, pickedUp, holesPlayed: (records || []).length };
}
