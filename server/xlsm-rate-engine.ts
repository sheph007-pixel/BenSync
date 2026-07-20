/**
 * xlsm-backed rate engine.
 *
 * Spawns `scripts/xlsm_rate.py`, which:
 *   1. Copies Kennion Actuarial Rater.xlsm to a temp file
 *   2. Writes the group's census + inputs into it
 *   3. Forces full recalc via python-uno doc.calculateAll()
 *      (or openpyxl + soffice --convert-to xlsx fallback)
 *   4. Reads the final rates back from `3. Rate Sheet - HDV`
 *   5. Emits JSON on stdout
 *
 * This guarantees rates exactly match the actuary's xlsm, because the
 * xlsm IS the calc engine.
 *
 * Requires: Python 3, openpyxl (apt: python3-openpyxl), python-uno
 * (apt: python3-uno), libreoffice-calc (apt). See nixpacks.toml.
 */
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import type { CensusEntry } from "@shared/schema";

const REPO_ROOT = path.resolve(process.cwd());
const TEMPLATE_PATH = path.resolve(REPO_ROOT, "Kennion Actuarial Rater.xlsm");
const PY_SCRIPT = path.resolve(REPO_ROOT, "scripts", "xlsm_rate.py");

/**
 * Which Python to use. We must use a python that can `import uno` AND
 * `import openpyxl`. On Railway/nixpacks+apt, these are installed under
 * /usr/bin/python3 (the system Python). nixpacks' default python3 is a
 * Nix-store python that can't see apt-installed site-packages.
 */
function resolvePython(): string {
  const env = process.env.XLSM_PYTHON?.trim();
  if (env && fs.existsSync(env)) return env;
  for (const candidate of ["/usr/bin/python3.10", "/usr/bin/python3", "/usr/bin/python"]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return "python3";
}

/** Rolling log of the last pipeline stderr, surfaced by /api/_diag/xlsm */
const LAST_LOG_PATH = path.join(os.tmpdir(), "xlsm_last.log");
export function readLastXlsmLog(): string {
  try { return fs.readFileSync(LAST_LOG_PATH, "utf8"); }
  catch { return ""; }
}

export interface XlsmRateInput {
  census: Array<{
    relationship: string;
    firstName?: string | null;
    lastName?: string | null;
    dob: string | Date;
    sex?: string | null;
    zip?: string | null;
  }>;
  effectiveDate: string | Date;
  ratingArea?: string;
  admin?: string;
  group?: string;
}

export interface XlsmRateResult {
  engine_version: string;
  group?: string;
  effective_date: string;
  rating_area: string;
  admin: string;
  n_members: number;
  n_employees: number;
  avg_age: number;
  plan_rates: Record<string, { EE: number | null; EC: number | null; ES: number | null; EF: number | null }>;
  timings_sec?: { total?: number; inject?: number; recalc?: number; extract?: number };
  diagnostics?: Record<string, unknown>;
}

function isoDate(d: string | Date): string {
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  const s = String(d).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s);
  if (us) {
    let y = +us[3];
    if (y < 100) y += y < 30 ? 2000 : 1900;
    return `${y}-${String(+us[1]).padStart(2, "0")}-${String(+us[2]).padStart(2, "0")}`;
  }
  const p = new Date(s);
  if (!isNaN(p.getTime())) return p.toISOString().slice(0, 10);
  return s;
}

export async function priceGroupViaXlsm(input: XlsmRateInput): Promise<XlsmRateResult> {
  if (!fs.existsSync(TEMPLATE_PATH)) {
    throw new Error(`xlsm template not found at ${TEMPLATE_PATH}`);
  }
  if (!fs.existsSync(PY_SCRIPT)) {
    throw new Error(`xlsm_rate.py helper not found at ${PY_SCRIPT}`);
  }

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "xrate_"));

  const req = {
    template_path: TEMPLATE_PATH,
    work_dir: workDir,
    group: input.group ?? "",
    effective_date: isoDate(input.effectiveDate),
    rating_area: input.ratingArea ?? "Birmingham",
    admin: input.admin ?? "EBPA",
    census: input.census.map((m) => ({
      relationship: m.relationship,
      first_name: m.firstName ?? "",
      last_name: m.lastName ?? "",
      dob: m.dob instanceof Date ? m.dob.toISOString().slice(0, 10) : String(m.dob),
      sex: m.sex ?? null,
      zip: m.zip ?? null,
    })),
  };

  try {
    const out = await runPy(req);
    const result = JSON.parse(out) as XlsmRateResult & { error?: string };
    if (result.error) throw new Error(`xlsm_rate.py: ${result.error}`);
    return result;
  } finally {
    fs.rm(workDir, { recursive: true, force: true }, () => {});
  }
}

function runPy(req: unknown): Promise<string> {
  return new Promise((resolve, reject) => {
    const pyBin = resolvePython();
    const py = spawn(pyBin, [PY_SCRIPT], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
    });
    let stdout = "";
    let stderr = "";
    py.stdout.on("data", (b: Buffer) => { stdout += b.toString(); });
    py.stderr.on("data", (b: Buffer) => { stderr += b.toString(); });
    py.on("error", (e) => reject(new Error(`spawn ${pyBin} failed: ${e.message}`)));
    py.on("close", (code) => {
      // Always persist last run's stderr for /api/_diag/xlsm
      try {
        const header = `[xlsm_rate] pyBin=${pyBin} exit=${code} ts=${new Date().toISOString()}\n`;
        fs.writeFileSync(LAST_LOG_PATH, header + stderr);
      } catch {/*non-fatal*/}
      if (stderr) {
        for (const line of stderr.split(/\r?\n/)) {
          if (line.trim()) console.log(`[xlsm_rate.py] ${line}`);
        }
      }
      if (code !== 0) {
        reject(new Error(`${pyBin} exit=${code} stderr=${stderr.slice(-500)} stdout=${stdout.slice(-300)}`));
        return;
      }
      resolve(stdout);
    });
    const killer = setTimeout(() => {
      py.kill("SIGKILL");
      reject(new Error("xlsm_rate.py timed out after 180s"));
    }, 180_000);
    py.on("close", () => clearTimeout(killer));
    py.stdin.write(JSON.stringify(req));
    py.stdin.end();
  });
}

export async function priceGroupFromCensusEntries(
  rows: CensusEntry[],
  opts: { effectiveDate: string | Date; ratingArea?: string; admin?: string; group?: string }
): Promise<XlsmRateResult> {
  const census = rows.map((r) => ({
    relationship: r.relationship,
    firstName: r.firstName,
    lastName: r.lastName,
    dob: r.dateOfBirth,
    sex: r.gender,
    zip: r.zipCode ?? null,
  }));
  return priceGroupViaXlsm({ census, ...opts });
}

/** Lightweight environment probe for /api/_diag/xlsm. Does NOT run the pipeline. */
export async function probeXlsmEnv(): Promise<Record<string, unknown>> {
  const pyBin = resolvePython();
  const out: Record<string, unknown> = {
    pyBin,
    pyBin_exists: fs.existsSync(pyBin),
    template_path: TEMPLATE_PATH,
    template_exists: fs.existsSync(TEMPLATE_PATH),
    template_size: fs.existsSync(TEMPLATE_PATH) ? fs.statSync(TEMPLATE_PATH).size : null,
    py_script: PY_SCRIPT,
    py_script_exists: fs.existsSync(PY_SCRIPT),
    last_log_head: readLastXlsmLog().slice(0, 3000),
  };
  const probe = (cmd: string, args: string[]) =>
    new Promise<string>((resolve) => {
      const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
      let o = ""; let e = "";
      p.stdout.on("data", (b: Buffer) => { o += b.toString(); });
      p.stderr.on("data", (b: Buffer) => { e += b.toString(); });
      p.on("error", (err) => resolve(`ERR:${err.message}`));
      p.on("close", (code) => resolve(`rc=${code} out=${o.trim().slice(0, 200)} err=${e.trim().slice(0, 200)}`));
      setTimeout(() => { try { p.kill("SIGKILL"); } catch {} ; resolve(o + e + " TIMEOUT"); }, 8000);
    });
  out.py_version = await probe(pyBin, ["-c", "import sys;print(sys.version)"]);
  out.py_uno = await probe(pyBin, ["-c", "import uno;print('OK uno @', uno.__file__)"]);
  out.py_openpyxl = await probe(pyBin, ["-c", "import openpyxl;print('OK openpyxl', openpyxl.__version__)"]);
  out.soffice = await probe("soffice", ["--version"]);
  out.which_soffice = await probe("which", ["soffice"]);
  out.which_python = await probe("which", ["-a", "python3"]);
  out.ls_usr_bin_python = await probe("ls", ["-la", "/usr/bin/python3"]);
  return out;
}
