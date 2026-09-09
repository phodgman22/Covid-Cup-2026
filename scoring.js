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

// A picked-up ball scores net double bogey — par, plus two, plus any strokes received.
export function netDoubleBogey(par, strokes){
  return (+par || 0) + 2 + strokes;
}

/* ---------- hole scoring ---------- */

// One player's gross and net on a hole. Returns null if nothing was entered.
// A picked-up ball (x) always resolves to net double bogey.
function playerHole(entry, par, strokes, holeCount){
  if (!entry) return null;
  if (entry.x) {
    const net = netDoubleBogey(par, strokes);
    return { gross: null, net, pickedUp: true };
  }
  if (entry.v == null) return null;
  return { gross: entry.v, net: entry.v - strokes, pickedUp: false };
}

/**
 * One hole's result for a group (or for a single player, in individual formats).
 *
 * hole:  { number, par, si }
 * entry: { <playerId>: {v, x}, team: {v, x} }
 * ctx:   { memberIds, playerPhs, teamPh, holeCount }
 *
 * Returns null when not enough has been entered to score the hole yet, otherwise
 * { net, gross } — gross is null for formats that only make sense net.
 */
export function computeHoleResult(format, hole, entry, ctx){
  const { memberIds = [], playerPhs = {}, teamPh = 0, holeCount = 18 } = ctx || {};
  const par = +hole.par || 0;
  const si = +hole.si || 0;

  if (FORMATS[format]?.entry === "team"){
    const teamStrokes = strokesOnHole(teamPh, si, holeCount);
    const res = playerHole(entry?.team, par, teamStrokes, holeCount);
    if (!res) return null;
    return { net: res.net, gross: res.gross };
  }

  const results = memberIds
    .map(id => playerHole(entry?.[id], par, strokesOnHole(playerPhs[id], si, holeCount), holeCount))
    .filter(Boolean);

  if (!results.length) return null;

  if (format === "best-ball-net" || format === "shamble"){
    return { net: Math.min(...results.map(r => r.net)), gross: null };
  }
  if (format === "total-net"){
    if (results.length < memberIds.length) return null;
    return { net: results.reduce((s, r) => s + r.net, 0), gross: null };
  }
  if (format === "total-gross"){
    if (results.length < memberIds.length) return null;
    if (results.some(r => r.gross == null)) return null;
    return { net: results.reduce((s, r) => s + r.gross, 0), gross: null };
  }
  if (format === "individual-net"){
    return { net: results[0].net, gross: results[0].gross };
  }
  if (format === "individual-gross"){
    if (results[0].gross == null) return null;
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
