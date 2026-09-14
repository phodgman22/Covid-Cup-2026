// Runs every scoring test file in its own process: `node tests/run.mjs`.
// Needs Node 22.12 or newer, which loads scoring.js as an ES module without a package.json.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
let failed = false;

for (const file of ["core.mjs", "stats.mjs", "maxscore.mjs", "formats.mjs", "matchplay.mjs", "skins.mjs"]){
  const run = spawnSync(process.execPath, [join(here, file)], { encoding: "utf8" });
  const summary = (run.stdout.match(/\d+ passed, \d+ failed/) || ["did not finish"])[0];
  console.log(file.padEnd(14) + summary);
  if (run.status !== 0){
    failed = true;
    process.stdout.write(run.stdout + run.stderr);
  }
}

process.exit(failed ? 1 : 0);
