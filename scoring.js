// Shared scoring math for Covid Cup 2026 — imported by index.html (score entry +
// leaderboard). Handicap formulas follow the same USGA course-handicap and
// stroke-allocation approach the original KHC engine used; this version applies
// the commissioner's chosen allowance % directly to each player's own course
// handicap rather than the old "relative to lowest in the field" scratch model,
// since Covid Cup isn't a match-play format.

export function coursePar(holes){
  return holes.reduce((sum, h) => sum + (+h.par || 0), 0);
}

// Course Handicap = Index x (Slope / 113) + (Rating - Par)
export function courseHandicap(idx, tee, par){
  if (!tee) return 0;
  return idx * (tee.slope / 113) + ((+tee.rating || par) - par);
}

// Playing handicap after the commissioner's allowance %, rounded to a whole stroke.
export function playingHandicap(idx, tee, par, allowancePct){
  return Math.round(courseHandicap(idx, tee, par) * ((allowancePct ?? 100) / 100));
}

// USGA-style combined team handicap for scramble: 35% of the lower playing
// handicap + 15% of the higher.
export function scrambleTeamHandicap(phA, phB){
  return Math.round(0.35 * Math.min(phA, phB) + 0.15 * Math.max(phA, phB));
}

// Standard USGA stroke allocation by hole stroke index: a hole gets a stroke
// once the playing handicap reaches its stroke index, a second past 18 + that
// index, and so on — no cap.
export function strokesOnHole(playingHcp, strokeIndex){
  if (playingHcp == null || playingHcp < strokeIndex) return 0;
  return Math.floor((playingHcp - strokeIndex) / 18) + 1;
}

/**
 * One hole's team result for a given format.
 * entry: { a: grossOrNull, b: grossOrNull, team: grossOrNull }
 * phA/phB: player A/B's playing handicaps. teamPh: scramble's combined handicap.
 * Returns null if there's not enough entered yet to score the hole, else
 * { net, aNet, bNet, aGross, bGross }.
 */
export function computeHoleResult(format, strokeIndex, entry, phA, phB, teamPh){
  if (format === "scramble"){
    if (entry.team == null) return null;
    const strokes = strokesOnHole(teamPh, strokeIndex);
    return { net: entry.team - strokes, gross: entry.team };
  }

  const aStrokes = strokesOnHole(phA, strokeIndex);
  const bStrokes = strokesOnHole(phB, strokeIndex);
  const aNet = entry.a != null ? entry.a - aStrokes : null;
  const bNet = entry.b != null ? entry.b - bStrokes : null;

  if (format === "net-best-ball" || format === "shamble"){
    const nets = [aNet, bNet].filter(n => n != null);
    if (!nets.length) return null;
    return { net: Math.min(...nets), aNet, bNet };
  }
  if (format === "stroke-net"){
    if (aNet == null || bNet == null) return null;
    return { net: aNet + bNet, aNet, bNet };
  }
  if (format === "stroke-gross"){
    if (entry.a == null || entry.b == null) return null;
    return { net: entry.a + entry.b, aGross: entry.a, bGross: entry.b };
  }
  return null;
}

/**
 * A pairing's running total across all holes entered so far.
 * holes: course.holes array. scores: {holeNumber: {a,b,team}}.
 * Returns { total, thru, toPar } — toPar is total net minus par of holes played.
 */
export function pairingTotals(format, holes, scores, phA, phB, teamPh){
  let total = 0, thru = 0, par = 0;
  holes.forEach(h => {
    const entry = scores[h.number];
    if (!entry) return;
    const result = computeHoleResult(format, h.si, entry, phA, phB, teamPh);
    if (!result) return;
    total += result.net;
    par += (+h.par || 0);
    thru += 1;
  });
  return { total, thru, toPar: total - par };
}

export function fmtToPar(toPar){
  if (toPar === 0) return "E";
  return toPar > 0 ? `+${toPar}` : `${toPar}`;
}
