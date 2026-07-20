// Reassembles "Kennion Actuarial Rater.xlsm" from rater-parts/*.
// The workbook is 13.9 MB; it is stored split so pushes stay small.
// Runs via npm prebuild/prestart. No-op if the file already exists with
// the right size. The assembled file is gitignored.
import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "Kennion Actuarial Rater.xlsm");
const PARTS_DIR = path.join(ROOT, "rater-parts");

if (!fs.existsSync(PARTS_DIR)) {
  console.log("[assemble-rater] no rater-parts directory; skipping");
  process.exit(0);
}

const parts = fs
  .readdirSync(PARTS_DIR)
  .filter((f) => f.startsWith("rater.xlsm.part-"))
  .sort();

if (parts.length === 0) {
  console.log("[assemble-rater] no parts found; skipping");
  process.exit(0);
}

const totalSize = parts.reduce(
  (sum, f) => sum + fs.statSync(path.join(PARTS_DIR, f)).size,
  0,
);

if (fs.existsSync(OUT) && fs.statSync(OUT).size === totalSize) {
  console.log("[assemble-rater] workbook already assembled");
  process.exit(0);
}

const out = fs.openSync(OUT, "w");
for (const f of parts) {
  fs.writeSync(out, fs.readFileSync(path.join(PARTS_DIR, f)));
}
fs.closeSync(out);
console.log(
  `[assemble-rater] assembled ${OUT} from ${parts.length} parts (${totalSize} bytes)`,
);
