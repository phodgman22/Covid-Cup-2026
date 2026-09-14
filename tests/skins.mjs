import * as S from "../scoring.js";

let pass = 0, fail = 0;
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n         got  ${JSON.stringify(got)}\n         want ${JSON.stringify(want)}`); }
};

const holes = [1, 2, 3, 4].map(n => ({ number: n, par: 4, si: n }));
const format = "individual-net";
// Scratch players — gross in, gross out, so the numbers below are exactly what's compared.
const ctxs = { a: { memberIds: ["a"], playerPhs: { a: 0 }, holeCount: 18 },
               b: { memberIds: ["b"], playerPhs: { b: 0 }, holeCount: 18 },
               c: { memberIds: ["c"], playerPhs: { c: 0 }, holeCount: 18 } };
const box = (pid, v) => ({ [pid]: { v } });

console.log("\nskinsForRound — outright win, a halve, a carry, then a hole nobody's finished");
const scores1 = {
  a: { 1: box("a", 4), 2: box("a", 5), 3: box("a", 6) },
  b: { 1: box("b", 5), 2: box("b", 5), 3: box("b", 4) },
  c: { 1: box("c", 5), 2: box("c", 6), 3: box("c", 7) }
  // nobody has a hole 4 yet
};
const r1 = S.skinsForRound(format, holes, scores1, ctxs);
eq("hole 1: a wins it outright", r1.perHole[0], { hole: 1, winnerUnitId: "a", skins: 1 });
eq("hole 2: a and b tie low, it carries", r1.perHole[1], { hole: 2, winnerUnitId: null, skins: 1 });
eq("hole 3: b wins the hole plus the carry", r1.perHole[2], { hole: 3, winnerUnitId: "b", skins: 2 });
eq("hole 4 isn't resolved — c hasn't posted", r1.perHole.length, 3);
eq("totals", r1.totals, { a: 1, b: 2, c: 0 });
eq("nothing left riding after hole 3 settled", r1.carry, 0);

console.log("\nskinsForRound — two carries in a row before someone takes it");
const scores2 = {
  a: { 1: box("a", 4), 2: box("a", 5), 3: box("a", 4) },
  b: { 1: box("b", 4), 2: box("b", 5), 3: box("b", 5) }
};
const r2 = S.skinsForRound(format, holes, scores2, { a: ctxs.a, b: ctxs.b });
eq("hole 1 halved", r2.perHole[0].winnerUnitId, null);
eq("hole 2 halved too — carry keeps building", r2.perHole[1], { hole: 2, winnerUnitId: null, skins: 2 });
eq("hole 3: a takes both carried skins plus its own", r2.perHole[2], { hole: 3, winnerUnitId: "a", skins: 3 });
eq("totals", r2.totals, { a: 3, b: 0 });

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
