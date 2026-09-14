import * as S from "../scoring.js";

let pass = 0, fail = 0;
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n         got  ${JSON.stringify(got)}\n         want ${JSON.stringify(want)}`); }
};

console.log("\nformat table");
eq("twelve formats", Object.keys(S.FORMATS).length, 12);
eq("every game has a net and a gross version",
   Object.keys(S.FORMAT_FAMILIES).every(fam =>
     Object.values(S.FORMATS).some(f => f.family === fam && !f.gross) &&
     Object.values(S.FORMATS).some(f => f.family === fam && f.gross)), true);
eq("default is best ball net", S.DEFAULT_FORMAT, "best-ball-net");
eq("gross formats never carry a team handicap",
   Object.values(S.FORMATS).filter(f => f.gross).every(f => !f.teamHcp), true);

console.log("\nformatFor / formatOf");
eq("scramble gross", S.formatFor("scramble", true), "scramble-gross");
eq("best ball net", S.formatFor("best-ball", false), "best-ball-net");
eq("alternate shot net keeps its old key", S.formatFor("alternate-shot", false), "alternate-shot");
eq("unknown game falls back to default", S.formatFor("bogus", false), "best-ball-net");
eq("round follows event", S.formatOf({ format: "" }, { format: "scramble" }), "scramble");
eq("round override wins", S.formatOf({ format: "total-net" }, { format: "scramble" }), "total-net");
eq("nothing set -> default", S.formatOf(undefined, undefined), "best-ball-net");
eq("isGrossFormat", [S.isGrossFormat("shamble-gross"), S.isGrossFormat("shamble")], [true, false]);

console.log("\ngross formats give no handicap shots");
const hole = { number: 1, par: 4, si: 1 };
const pair = { memberIds: ["a", "b"], playerPhs: { a: 0, b: 18 }, holeCount: 18, maxRule: "double-par" };
eq("best ball net: b's shot makes his 5 a 4",
   S.computeHoleResult("best-ball-net", hole, { a: { v: 5 }, b: { v: 5 } }, pair), { net: 4, gross: null });
eq("best ball gross: no shot, best is 5",
   S.computeHoleResult("best-ball-gross", hole, { a: { v: 5 }, b: { v: 5 } }, pair), { net: 5, gross: null });
eq("shamble gross waits for both partners",
   S.computeHoleResult("shamble-gross", hole, { a: { v: 4 } }, pair), null);
const team = { memberIds: ["a", "b"], playerPhs: { a: 0, b: 18 }, teamPh: 9, holeCount: 18, maxRule: "double-par" };
eq("scramble net nets the team stroke",
   S.computeHoleResult("scramble", hole, { team: { v: 5 } }, team), { net: 4, gross: 5 });
eq("scramble gross ignores the team handicap",
   S.computeHoleResult("scramble-gross", hole, { team: { v: 5 } }, team), { net: 5, gross: 5 });
eq("alternate shot gross",
   S.computeHoleResult("alternate-shot-gross", hole, { team: { v: 4 } }, team), { net: 4, gross: 4 });
eq("total gross sums raw strokes",
   S.computeHoleResult("total-gross", hole, { a: { v: 5 }, b: { v: 6 } }, pair), { net: 11, gross: null });
eq("individual gross",
   S.computeHoleResult("individual-gross", hole, { a: { v: 6 } }, { memberIds: ["a"], playerPhs: { a: 18 }, holeCount: 18 }),
   { net: 6, gross: 6 });

console.log("\ncounted — whose score the team used");
const holes = [{ number: 1, par: 4, si: 1 }, { number: 2, par: 4, si: 2 }, { number: 3, par: 4, si: 3 }];
const groups = { g1: { playerIds: ["a", "b"] } };
const phs = { a: 0, b: 18 };
const rs = { g1: {
  1: { a: { v: 5 }, b: { v: 5 } },  // a net 5, b net 4 -> b counts
  2: { a: { v: 4 }, b: { v: 5 } },  // a net 4, b net 4 -> tie, both count
  3: { a: { v: 4 } }                // b missing -> nobody counts yet
} };
const bb = S.collectPlayerHoles("best-ball-net", holes, groups, rs, phs, {}, 18, "double-par");
eq("hole 1: partner's net 4 beats a's 5", [bb.a[0].counted, bb.b[0].counted], [false, true]);
eq("hole 2: a tie counts for both", [bb.a[1].counted, bb.b[1].counted], [true, true]);
eq("hole 3: incomplete hole counts for nobody", bb.a[2].counted, false);
const bbGross = S.collectPlayerHoles("best-ball-gross", holes, groups, rs, phs, {}, 18, "double-par");
eq("gross best ball: hole 1 is a 5-5 tie", [bbGross.a[0].counted, bbGross.b[0].counted], [true, true]);
eq("gross best ball: net equals gross", bbGross.b[0].net, bbGross.b[0].gross);
const tot = S.collectPlayerHoles("total-net", holes, groups, rs, phs, {}, 18, "double-par");
eq("total: every score counts", tot.a.every(r => r.counted), true);
const scr = S.collectPlayerHoles("scramble", holes, groups, { g1: { 1: { team: { v: 4 } } } }, phs, { g1: 3 }, 18, "double-par");
eq("scramble: counted not applicable", "counted" in scr.a[0], false);

console.log("\nsummarisePlayer counted");
const s = S.summarisePlayer(bb.b);
eq("b carried 2 of his 2 holes", [s.counted, s.countable], [2, 2]);
eq("a counted once in 3", [S.summarisePlayer(bb.a).counted, S.summarisePlayer(bb.a).countable], [1, 3]);
eq("no counted field -> zero", S.summarisePlayer(scr.a).counted, 0);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
