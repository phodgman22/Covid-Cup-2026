import * as S from "../scoring.js";

let pass = 0, fail = 0;
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n         got  ${JSON.stringify(got)}\n         want ${JSON.stringify(want)}`); }
};

const holes = [];
for (let i = 1; i <= 18; i++) holes.push({ number: i, par: 4, si: i });

console.log("\ncollectPlayerHoles — per-player format (default max = double par)");
const groups = { g1: { playerIds: ["a", "b"] } };
const roundScores = {
  g1: {
    1: { a: { v: 3 }, b: { v: 5 } },
    2: { a: { v: 4 }, b: { x: true } }
  }
};
const recs = S.collectPlayerHoles("best-ball-net", holes, groups, roundScores, { a: 0, b: 18 }, {}, 18);
eq("a has 2 holes", recs.a.length, 2);
eq("a hole 1 gross 3 net 3", [recs.a[0].gross, recs.a[0].net], [3, 3]);
eq("b hole 1 net takes his shot", recs.b[0].net, 4);
eq("b pickup flagged", recs.b[1].pickedUp, true);
eq("b pickup gross = double par", recs.b[1].gross, 8);
eq("b pickup net = gross minus his shot", recs.b[1].net, 7);

console.log("\ncollectPlayerHoles — team format credits BOTH partners");
const teamScores = { g1: { 1: { team: { v: 3 } } } };
const teamRecs = S.collectPlayerHoles("scramble", holes, groups, teamScores, { a: 0, b: 18 }, { g1: 6 }, 18);
eq("both partners get a record", [teamRecs.a.length, teamRecs.b.length], [1, 1]);
eq("both credited the same gross", [teamRecs.a[0].gross, teamRecs.b[0].gross], [3, 3]);
eq("team score netted off TEAM handicap", [teamRecs.a[0].net, teamRecs.b[0].net], [2, 2]);

console.log("\ncollectPlayerHoles — round maximum applied");
const capped = S.collectPlayerHoles("individual-gross", holes, { g1: { playerIds: ["a"] } },
  { g1: { 1: { a: { v: 11 } } } }, { a: 0 }, {}, 18, "double-par");
eq("typed 11 counts as double par 8", capped.a[0].gross, 8);
eq("flagged as capped", capped.a[0].capped, true);

console.log("\nsummarisePlayer");
const sum = S.summarisePlayer([
  { hole: 1, par: 4, gross: 2, net: 2, pickedUp: false },
  { hole: 2, par: 4, gross: 3, net: 3, pickedUp: false },
  { hole: 3, par: 4, gross: 4, net: 4, pickedUp: false },
  { hole: 4, par: 4, gross: 5, net: 5, pickedUp: false },
  { hole: 5, par: 4, gross: 8, net: 8, pickedUp: false },  // quad -> ONE hole over
  { hole: 6, par: 4, gross: 6, net: 6, pickedUp: true }    // pickup at the max
]);
eq("holes played", sum.holesPlayed, 6);
eq("pickedUp counted", sum.pickedUp, 1);
eq("gross now covers the pickup too", sum.gross.holes, 6);
eq("gross eagles", sum.gross.eagles, 1);
eq("gross birdies", sum.gross.birdies, 1);
eq("gross pars", sum.gross.pars, 1);
eq("gross bogeys", sum.gross.bogeys, 1);
eq("doubles counts HOLES (quad + pickup)", sum.gross.doubles, 2);
eq("gross toPar", sum.gross.toPar, (2-4)+(3-4)+(4-4)+(5-4)+(8-4)+(6-4));
eq("net covers same holes", sum.net.holes, 6);

console.log("\nedge cases");
eq("empty records", S.summarisePlayer([]), {
  gross: { toPar:0, holes:0, eagles:0, birdies:0, pars:0, bogeys:0, doubles:0 },
  net:   { toPar:0, holes:0, eagles:0, birdies:0, pars:0, bogeys:0, doubles:0 },
  pickedUp: 0, counted: 0, countable: 0, holesPlayed: 0
});
eq("undefined records", S.summarisePlayer(undefined).holesPlayed, 0);
eq("no groups", S.collectPlayerHoles("best-ball-net", holes, {}, {}, {}, {}, 18), {});
eq("unscored holes ignored", S.collectPlayerHoles("best-ball-net", holes, groups, { g1: {} }, {a:0,b:0}, {}, 18), {});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
