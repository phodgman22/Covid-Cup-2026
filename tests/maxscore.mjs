import * as S from "../scoring.js";

let pass = 0, fail = 0;
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n         got  ${JSON.stringify(got)}\n         want ${JSON.stringify(want)}`); }
};

console.log("\ngrossCap");
eq("default is double par", S.grossCap(undefined, 4, 1), 8);
eq("unknown rule falls back to double par", S.grossCap("bogus", 4, 1), 8);
eq("net double bogey explicit", S.grossCap("net-double-bogey", 5, 2), 9);
eq("double par", S.grossCap("double-par", 4, 1), 8);
eq("triple bogey ignores shots", S.grossCap("triple-bogey", 3, 1), 6);
eq("par plus 4", S.grossCap("par-plus", 4, 0, 4), 8);
eq("par plus 2", S.grossCap("par-plus", 5, 0, 2), 7);
eq("par plus arrives as a string from the form", S.grossCap("par-plus", 4, 0, "3"), 7);
eq("no maximum", S.grossCap("none", 4, 1), null);

console.log("\nscoreCell");
eq("under the cap is untouched", S.scoreCell({ v: 6 }, 4, 0, "double-par"),
   { gross: 6, net: 6, pickedUp: false, capped: false });
eq("over the cap counts as the cap", S.scoreCell({ v: 11 }, 4, 0, "double-par"),
   { gross: 8, net: 8, pickedUp: false, capped: true });
eq("cap applies before net", S.scoreCell({ v: 11 }, 4, 1, "double-par"),
   { gross: 8, net: 7, pickedUp: false, capped: true });
eq("pickup scores the cap", S.scoreCell({ x: true }, 4, 0, "triple-bogey"),
   { gross: 7, net: 7, pickedUp: true, capped: false });
eq("pickup under NDB: net is par + 2", S.scoreCell({ x: true }, 4, 1, "net-double-bogey"),
   { gross: 7, net: 6, pickedUp: true, capped: false });
eq("no max: a big number stands", S.scoreCell({ v: 11 }, 4, 0, "none"),
   { gross: 11, net: 11, pickedUp: false, capped: false });
eq("no max: a stray pickup falls back to double par", S.scoreCell({ x: true }, 4, 1, "none"),
   { gross: 8, net: 7, pickedUp: true, capped: false });
eq("default pickup scores double par", S.scoreCell({ x: true }, 5, 0),
   { gross: 10, net: 10, pickedUp: true, capped: false });
eq("empty cell", S.scoreCell(undefined, 4, 0), null);
eq("cleared value", S.scoreCell({ v: null }, 4, 0), null);

console.log("\ncomputeHoleResult honours the round maximum");
const hole = { number: 1, par: 4, si: 1 };
const solo = (rule, plus) => ({ memberIds: ["a"], playerPhs: { a: 0 }, holeCount: 18, maxRule: rule, maxPlus: plus });
eq("individual gross capped at double par",
   S.computeHoleResult("individual-gross", hole, { a: { v: 12 } }, solo("double-par")), { net: 8, gross: 8 });
eq("individual gross with no max",
   S.computeHoleResult("individual-gross", hole, { a: { v: 12 } }, solo("none")), { net: 12, gross: 12 });
eq("total gross accepts a pickup at the cap",
   S.computeHoleResult("total-gross", hole, { a: { v: 5 }, b: { x: true } },
     { memberIds: ["a", "b"], playerPhs: { a: 0, b: 0 }, holeCount: 18, maxRule: "double-par" }),
   { net: 13, gross: null });

console.log("\nroundTotals with a maximum");
const two = [{ number: 1, par: 4, si: 1 }, { number: 2, par: 4, si: 2 }];
eq("typed 10 and a pickup both count as par + 3",
   S.roundTotals("individual-gross", two, { 1: { a: { v: 10 } }, 2: { a: { x: true } } }, solo("par-plus", 3)),
   { total: 14, thru: 2, toPar: 6 });

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
