import * as S from "../scoring.js";

let pass = 0, fail = 0;
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n         got  ${JSON.stringify(got)}\n         want ${JSON.stringify(want)}`); }
};

// ---- course setup: par 72, SI 1..18 ----
const holes = [];
for (let i = 1; i <= 18; i++) holes.push({ number: i, par: 4, si: i });
const tees = [{ name: "White", rating: 71.2, slope: 125 }];
const course = { holes, tees };

console.log("\ncoursePar / courseHandicap");
eq("par 72", S.coursePar(holes), 72);
// 10.4 * (125/113) + (71.2 - 72) = 11.504 - 0.8 = 10.70
eq("CH 10.4 idx", Math.round(S.courseHandicap(10.4, tees[0], 72) * 100) / 100, 10.7);

console.log("\nstrokesOnHole (18 holes)");
eq("hcp 10, SI 1", S.strokesOnHole(10, 1), 1);
eq("hcp 10, SI 11 (none)", S.strokesOnHole(10, 11), 0);
eq("hcp 20, SI 1 (two)", S.strokesOnHole(20, 1), 2);
eq("hcp 0, SI 1 (none)", S.strokesOnHole(0, 1), 0);

console.log("\nstrokesOnHole (9 holes)");
eq("hcp 12, SI 1, 9 holes", S.strokesOnHole(12, 1, 9), 2);
eq("hcp 12, SI 4, 9 holes", S.strokesOnHole(12, 4, 9), 1);

console.log("\nplayingHandicaps: full vs off-lowest");
const roster = {
  a: { name: "A", index: 5.0,  tee: "White" },
  b: { name: "B", index: 15.0, tee: "White" },
  c: { name: "C", index: 25.0, tee: "White" }
};
const full100 = S.playingHandicaps(roster, course, { allowancePct: 100, allowanceMode: "full" });
eq("full 100% a", full100.a, Math.round(5.0 * 125/113 + (71.2-72)));
const offLow = S.playingHandicaps(roster, course, { allowancePct: 100, allowanceMode: "off-lowest" });
eq("off-lowest: best plays scratch", offLow.a, 0);
eq("off-lowest preserves gaps", offLow.b - offLow.a, full100.b - full100.a);

console.log("\nper-player allowance override");
const rosterOverride = { ...roster, b: { ...roster.b, allowancePct: 50 } };
const ov = S.playingHandicaps(rosterOverride, course, { allowancePct: 100, allowanceMode: "full" });
eq("b halved by override", ov.b, Math.round((15.0 * 125/113 + (71.2-72)) * 0.5));
eq("a untouched by b's override", ov.a, full100.a);

console.log("\nteam handicap formulas");
eq("scramble 2 (35/15) of [10,20]", S.teamHandicapFormula("scramble", [10, 20]), Math.round(0.35*10 + 0.15*20));
eq("scramble 4 (25/20/15/10)", S.teamHandicapFormula("scramble", [4, 8, 12, 20]), Math.round(0.25*4 + 0.20*8 + 0.15*12 + 0.10*20));
eq("scramble 3 (20/15/10)", S.teamHandicapFormula("scramble", [6, 12, 18]), Math.round(0.20*6 + 0.15*12 + 0.10*18));
eq("alt shot = 50% combined", S.teamHandicapFormula("alternate-shot", [10, 20]), 15);
eq("sorts before weighting", S.teamHandicapFormula("scramble", [20, 10]), S.teamHandicapFormula("scramble", [10, 20]));

console.log("\nteamHandicaps off-lowest");
const groups = { g1: { playerIds: ["a","b"] }, g2: { playerIds: ["b","c"] } };
const phs = { a: 4, b: 14, c: 24 };
const tFull = S.teamHandicaps("scramble", groups, phs, "formula");
const tLow  = S.teamHandicaps("scramble", groups, phs, "off-lowest");
eq("lowest team plays scratch", Math.min(...Object.values(tLow)), 0);
eq("gap preserved", tLow.g2 - tLow.g1, tFull.g2 - tFull.g1);

// ---- hole scoring ----
const hole = { number: 1, par: 4, si: 1 };
const ctx2 = { memberIds: ["a","b"], playerPhs: { a: 0, b: 18 }, holeCount: 18 };

console.log("\nbest ball (net)");
// a: 5 gross, 0 strokes -> net 5.  b: 6 gross, 1 stroke -> net 5.  best = 5
eq("best of two", S.computeHoleResult("best-ball-net", hole, { a:{v:5}, b:{v:6} }, ctx2), { net: 5, gross: null });
// only one entered so far -> still scoreable (best ball needs just one)
eq("best ball waits for both partners", S.computeHoleResult("best-ball-net", hole, { a:{v:4} }, ctx2), null);
eq("nothing entered -> null", S.computeHoleResult("best-ball-net", hole, {}, ctx2), null);

console.log("\npicked-up ball");
// b picks up: net double bogey = par 4 + 2 + 1 stroke = 7. a made 5 -> best 5
eq("pickup ignored when partner scores", S.computeHoleResult("best-ball-net", hole, { a:{v:5}, b:{x:true} }, ctx2), { net: 5, gross: null });
// both pick up: a NDB = 4+2+0 = 6, b NDB = 4+2+1 = 7 -> best 6
eq("both pick up -> better double-par net", S.computeHoleResult("best-ball-net", hole, { a:{x:true}, b:{x:true} }, ctx2), { net: 7, gross: null });
eq("netDoubleBogey", S.netDoubleBogey(4, 1), 7);

console.log("\ntotal net / total gross");
// a net 5 + b net 5 = 10
eq("total net sums", S.computeHoleResult("total-net", hole, { a:{v:5}, b:{v:6} }, ctx2), { net: 10, gross: null });
eq("total net waits for all", S.computeHoleResult("total-net", hole, { a:{v:5} }, ctx2), null);
eq("total gross sums", S.computeHoleResult("total-gross", hole, { a:{v:5}, b:{v:6} }, ctx2), { net: 11, gross: null });
eq("total gross counts a pickup at double par", S.computeHoleResult("total-gross", hole, { a:{v:5}, b:{x:true} }, ctx2), { net: 13, gross: null });

console.log("\nteam formats (one score)");
const ctxTeam = { memberIds: ["a","b"], playerPhs: phs, teamPh: 9, holeCount: 18 };
// team 5 gross, teamPh 9 -> 1 stroke on SI 1 -> net 4
eq("scramble nets team stroke", S.computeHoleResult("scramble", hole, { team:{v:5} }, ctxTeam), { net: 4, gross: 5 });
eq("scramble needs team score", S.computeHoleResult("scramble", hole, { a:{v:4} }, ctxTeam), null);

console.log("\nindividual formats");
const ctxSolo = { memberIds: ["a"], playerPhs: { a: 18 }, holeCount: 18 };
eq("individual net", S.computeHoleResult("individual-net", hole, { a:{v:5} }, ctxSolo), { net: 4, gross: 5 });
eq("individual gross ignores strokes", S.computeHoleResult("individual-gross", hole, { a:{v:5} }, ctxSolo), { net: 5, gross: 5 });

console.log("\nroundTotals");
const scores = { 1: { a:{v:4}, b:{v:5} }, 2: { a:{v:5}, b:{v:4} } };
const rt = S.roundTotals("best-ball-net", holes, scores, ctx2);
// hole1: a net 4 (0 strokes), b net 4 (1 stroke) -> 4. hole2: a 5, b 4-1=3 -> 3. total 7, par 8
eq("thru 2", rt.thru, 2);
eq("total 7", rt.total, 7);
eq("toPar -1", rt.toPar, -1);
eq("unplayed holes ignored", S.roundTotals("best-ball-net", holes, {}, ctx2), { total:0, thru:0, toPar:0 });

console.log("\neventTotals across rounds");
eq("sums rounds", S.eventTotals([{total:70,thru:18,toPar:-2},{total:75,thru:18,toPar:3}]),
   { total:145, thru:36, toPar:1, roundsPlayed:2 });
eq("counts only played rounds", S.eventTotals([{total:70,thru:18,toPar:-2},{total:0,thru:0,toPar:0}]).roundsPlayed, 1);

console.log("\nfmtToPar");
eq("E", S.fmtToPar(0), "E");
eq("+3", S.fmtToPar(3), "+3");
eq("-3", S.fmtToPar(-3), "-3");


// ---- custom team weightings ----
console.log("\ncustom team weightings");

const ceq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n         got  ${JSON.stringify(got)}\n         want ${JSON.stringify(want)}`); }
};

ceq("defaults unchanged: scramble 4", S.teamHandicapFormula("scramble", [4,8,12,20]),
    Math.round(0.25*4 + 0.20*8 + 0.15*12 + 0.10*20));
ceq("alt shot default = 50% combined", S.teamHandicapFormula("alternate-shot", [10,20]), 15);
ceq("alt shot default, foursome", S.teamHandicapFormula("alternate-shot", [4,8,12,20]),
    Math.round(0.5*(4+8+12+20)));

// Andrew's example: 15% of one, 35% of the other.
const custom = { "scramble": { 2: [15, 35] } };
ceq("custom 15/35 applies by rank", S.teamHandicapFormula("scramble", [10, 20], custom),
    Math.round(0.15*10 + 0.35*20));
ceq("custom sorts low first regardless of input order",
    S.teamHandicapFormula("scramble", [20, 10], custom),
    S.teamHandicapFormula("scramble", [10, 20], custom));

const custom4 = { "scramble": { 4: [50, 30, 20, 10] } };
ceq("custom four-man weighting", S.teamHandicapFormula("scramble", [6, 10, 14, 30], custom4),
    Math.round(0.50*6 + 0.30*10 + 0.20*14 + 0.10*30));

ceq("falls back to default for an unconfigured size",
    S.teamHandicapFormula("scramble", [4,8,12,20], custom),
    S.teamHandicapFormula("scramble", [4,8,12,20]));
ceq("even split when no weighting exists at all",
    S.teamHandicapFormula("scramble", [10,10,10,10,10]), 10);

ceq("weightsFor prefers the override", S.weightsFor("scramble", 2, custom), [15, 35]);
ceq("weightsFor falls back to default", S.weightsFor("scramble", 3, custom), [20, 15, 10]);

// Custom weights must flow through teamHandicaps into the group table.
const g = { g1: { playerIds: ["a","b"] } };
const ph = { a: 10, b: 20 };
ceq("teamHandicaps honours the table",
    S.teamHandicaps("scramble", g, ph, "formula", custom).g1,
    Math.round(0.15*10 + 0.35*20));
ceq("teamHandicaps without a table uses defaults",
    S.teamHandicaps("scramble", g, ph, "formula").g1,
    Math.round(0.35*10 + 0.15*20));

console.log(`
${pass} passed, ${fail} failed
`);
process.exit(fail ? 1 : 0);
