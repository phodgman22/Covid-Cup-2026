import * as S from "../scoring.js";

let pass = 0, fail = 0;
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n         got  ${JSON.stringify(got)}\n         want ${JSON.stringify(want)}`); }
};

// Slope 113 and rating = par, so course handicap = index; 100% allowance.
const holes = [];
for (let i = 1; i <= 18; i++) holes.push({ number: i, par: 4, si: i });
const course = { holes, tees: [{ name: "White", rating: 72, slope: 113 }] };
const P = index => ({ index, tee: "White" });
const roster = { a: P(4), b: P(10), c: P(18), d: P(20), e: P(1), f: P(2) };
const units = { t1: { playerIds: ["a", "b"] }, t2: { playerIds: ["c", "d"] }, t3: { playerIds: ["e", "f"] } };
const t1vt2 = [{ unitIds: ["t1", "t2"] }];
const base = { roster, course, format: "best-ball-net", allowancePct: 100, units };

console.log("\ngameHandicaps — stroke play plays off the field");
eq("stroke, full handicaps",
   S.gameHandicaps({ ...base, play: "stroke", allowanceMode: "full" }).playerPhs,
   { a: 4, b: 10, c: 18, d: 20, e: 1, f: 2 });
eq("stroke, off the low man in the field (e, 1)",
   S.gameHandicaps({ ...base, play: "stroke", allowanceMode: "off-lowest" }).playerPhs,
   { a: 3, b: 9, c: 17, d: 19, e: 0, f: 1 });

console.log("\ngameHandicaps — match play plays off the low man in each match");
eq("match, off the low man in t1 v t2 (a, 4); e and f aren't in a match",
   S.gameHandicaps({ ...base, play: "match", allowanceMode: "off-lowest", matches: t1vt2 }).playerPhs,
   { a: 0, b: 6, c: 14, d: 16, e: 1, f: 2 });
eq("match, full handicaps",
   S.gameHandicaps({ ...base, play: "match", allowanceMode: "full", matches: t1vt2 }).playerPhs,
   { a: 4, b: 10, c: 18, d: 20, e: 1, f: 2 });
eq("match with no matches yet gives full handicaps",
   S.gameHandicaps({ ...base, play: "match", allowanceMode: "off-lowest", matches: [] }).playerPhs,
   { a: 4, b: 10, c: 18, d: 20, e: 1, f: 2 });
eq("a half-built match is ignored",
   S.gameHandicaps({ ...base, play: "match", allowanceMode: "off-lowest", matches: [{ unitIds: ["t1", ""] }] }).playerPhs,
   { a: 4, b: 10, c: 18, d: 20, e: 1, f: 2 });

console.log("\ngameHandicaps — team ball");
// Scramble 35/15: t1 [4,10] -> 3, t2 [18,20] -> 9, t3 [1,2] -> 1
eq("scramble match, off the low team in the match",
   S.gameHandicaps({ ...base, format: "scramble", play: "match", teamHcpMode: "off-lowest", matches: t1vt2 }).teamPhs,
   { t1: 0, t2: 6, t3: 1 });
eq("scramble match, formula",
   S.gameHandicaps({ ...base, format: "scramble", play: "match", teamHcpMode: "formula", matches: t1vt2 }).teamPhs,
   { t1: 3, t2: 9, t3: 1 });
eq("scramble stroke, off the low team in the field",
   S.gameHandicaps({ ...base, format: "scramble", play: "stroke", allowanceMode: "full", teamHcpMode: "off-lowest" }).teamPhs,
   { t1: 2, t2: 8, t3: 0 });
eq("gross gives nobody anything",
   S.gameHandicaps({ ...base, format: "best-ball-gross", play: "match", allowanceMode: "off-lowest", matches: t1vt2 }),
   { playerPhs: { a: 0, b: 0, c: 0, d: 0, e: 0, f: 0 }, teamPhs: { t1: 0, t2: 0, t3: 0 } });

console.log("\nmatchStatus — singles, gross");
const g = "individual-gross";
const solo = [{ memberIds: ["a"], playerPhs: { a: 0 }, holeCount: 18 }, { memberIds: ["b"], playerPhs: { b: 0 }, holeCount: 18 }];
const card = fn => {
  const A = {}, B = {};
  holes.forEach(h => {
    const r = fn(h.number);
    if (!r) return;
    A[h.number] = { a: { v: r[0] } };
    B[h.number] = { b: { v: r[1] } };
  });
  return [A, B];
};

const s1 = S.matchStatus(g, holes, card(n => n <= 4 ? [3, 4] : [4, 4]), solo);
eq("decided once the lead beats the holes left", s1.label, "4&3");
eq("winner and points", [s1.winner, s1.points], ["A", [1, 0]]);
eq("the group keeps scoring after it's decided", s1.thru, 18);

const s2 = S.matchStatus(g, holes, card(n => n <= 4 ? [3, 4] : n >= 16 ? [5, 4] : [4, 4]), solo);
eq("result frozen at the moment it was decided", s2.label, "4&3");
eq("holes after that still count as won", s2.won, [4, 3]);

const s3 = S.matchStatus(g, holes, card(n => n === 1 ? [3, 4] : null), solo);
eq("in progress, 1 UP, no points yet", [s3.label, s3.leader, s3.finished, s3.points], ["1 UP", "A", false, null]);

const s4 = S.matchStatus(g, holes, card(n => n === 1 ? [3, 4] : n === 2 ? [5, 4] : null), solo);
eq("all square", [s4.label, s4.leader], ["AS", null]);

const s5 = S.matchStatus(g, holes, card(() => [4, 4]), solo);
eq("halved over 18", [s5.label, s5.points], ["Halved", [0.5, 0.5]]);

const s6 = S.matchStatus(g, holes, card(n => n === 18 ? [3, 4] : [4, 4]), solo);
eq("won on the last hole", [s6.label, s6.winner, s6.points], ["1 UP", "A", [1, 0]]);

const s7 = S.matchStatus(g, holes, card(n => n === 18 ? [5, 4] : [4, 4]), solo);
eq("side B wins", [s7.label, s7.winner, s7.points], ["1 UP", "B", [0, 1]]);

const s8 = S.matchStatus(g, holes, [{}, {}], solo);
eq("not started", [s8.thru, s8.label, s8.points], [0, "", null]);

console.log("\nmatch play — best ball");
const pairs = (phA, phB) => [
  { memberIds: ["a", "b"], playerPhs: phA, holeCount: 18 },
  { memberIds: ["c", "d"], playerPhs: phB, holeCount: 18 }
];
eq("a hole waits for both partners",
   S.matchStatus("best-ball-net", holes, [{ 1: { a: { v: 4 } } }, { 1: { c: { v: 4 }, d: { v: 4 } } }],
     pairs({ a: 0, b: 0 }, { c: 0, d: 0 })).thru, 0);
// A's best is 5; c gets a shot on stroke index 1, so B's best is 4.
eq("handicap shots decide the hole",
   S.matchHoleResult("best-ball-net", holes[0], [{ a: { v: 5 }, b: { v: 5 } }, { c: { v: 5 }, d: { v: 6 } }],
     pairs({ a: 0, b: 0 }, { c: 1, d: 0 })), "B");
eq("same scores gross are halved",
   S.matchHoleResult("best-ball-gross", holes[0], [{ a: { v: 5 }, b: { v: 5 } }, { c: { v: 5 }, d: { v: 6 } }],
     pairs({ a: 0, b: 0 }, { c: 1, d: 0 })), "H");

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
