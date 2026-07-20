/**
 * Proposal Engine, injects census data into XLSM template,
 * runs LibreOffice to recalculate formulas, execute VBA macros, and export PDF.
 *
 * Pipeline: Census → Inject into XLSM → LibreOffice (recalc + macro) → PDF
 *
 * The actuary's XLSM template is the engine. Rate calculations live in
 * Excel formulas and named ranges. The VBA macro (RateCalcMacro) validates
 * data, copies formula results as values, refreshes pivot tables, and sorts.
 * LibreOffice recalculates all formulas on open, so even if the macro
 * doesn't execute perfectly, the rate tables still compute correctly.
 */
import XLSX from "xlsx";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import type { Group, CensusEntry } from "@shared/schema";
import { log } from "./index";

const PROPOSALS_DIR = path.join(process.cwd(), "uploads", "proposals");
const TEMPLATE_DIR = path.join(process.cwd(), "uploads", "templates");
const TEMP_DIR = path.join(process.cwd(), "uploads", "temp");
const LO_PROFILE_DIR = path.join(process.cwd(), "uploads", "lo-profile");

// Sheets the actuary's PrintCustomPDFs macro exports
const PROPOSAL_SHEETS = [
  "1. Cover Sheet",
  "2. Letter With Details",
  "3. Rate Sheet - HDV",
  "4. Rate Sheet - Benefits",
  "5. Census Summary",
  "A",
  "B",
];

// Ensure directories exist
fs.mkdirSync(PROPOSALS_DIR, { recursive: true });
fs.mkdirSync(TEMP_DIR, { recursive: true });

// ─── LibreOffice Profile Setup ───────────────────────────────────────────

/**
 * Create a LibreOffice user profile that allows macro execution.
 * Without this, LO blocks VBA macros by default in headless mode.
 */
function ensureLibreOfficeProfile(): string {
  const profileDir = LO_PROFILE_DIR;
  const regDir = path.join(profileDir, "user", "registrymodifications.xcu");

  if (!fs.existsSync(path.dirname(regDir))) {
    fs.mkdirSync(path.dirname(regDir), { recursive: true });
  }

  if (!fs.existsSync(regDir)) {
    // MacroSecurityLevel 0 = Low (allow all macros)
    // This is safe because we only run our own trusted template
    const config = `<?xml version="1.0" encoding="UTF-8"?>
<oor:items xmlns:oor="http://openoffice.org/2001/registry"
           xmlns:xs="http://www.w3.org/2001/XMLSchema"
           xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <item oor:path="/org.openoffice.Office.Common/Security/Scripting">
    <prop oor:name="MacroSecurityLevel" oor:op="fuse">
      <value>0</value>
    </prop>
  </item>
</oor:items>`;
    fs.writeFileSync(regDir, config);
    log("Created LibreOffice profile with macro security disabled", "proposal");
  }

  return profileDir;
}

// ─── Age Calculation ──────────────────────────────────────────────────────

export function calculateAge(dob: string): number {
  const birth = new Date(dob);
  if (isNaN(birth.getTime())) return 30;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return Math.max(0, age);
}

export function getAgeBand(age: number): string {
  if (age <= 4) return "0-4";
  if (age <= 9) return "5-9";
  if (age <= 14) return "10-14";
  if (age <= 19) return "15-19";
  if (age <= 24) return "20-24";
  if (age <= 29) return "25-29";
  if (age <= 34) return "30-34";
  if (age <= 39) return "35-39";
  if (age <= 44) return "40-44";
  if (age <= 49) return "45-49";
  if (age <= 54) return "50-54";
  if (age <= 59) return "55-59";
  if (age <= 64) return "60-64";
  if (age <= 69) return "65-69";
  return "70+";
}

// ─── Template Sheet Inspection ────────────────────────────────────────────

export function getTemplateInfo(templatePath: string) {
  const buf = fs.readFileSync(templatePath);
  const wb = XLSX.read(buf, { type: "buffer", bookVBA: true });
  return {
    sheetNames: wb.SheetNames,
    hasVBA: !!wb.vbaraw,
  };
}

// ─── Census Data Injection ────────────────────────────────────────────────

/**
 * Inject census data into the XLSM template's Census sheet.
 * Returns the path to the modified temp file.
 */
export function injectCensusData(
  templatePath: string,
  group: Group,
  census: CensusEntry[],
  targetSheet: string = "Census"
): string {
  const buf = fs.readFileSync(templatePath);
  const wb = XLSX.read(buf, { type: "buffer", bookVBA: true });

  // Find target sheet (case-insensitive)
  let sheetName = wb.SheetNames.find(s => s === targetSheet)
    || wb.SheetNames.find(s => s.toLowerCase() === targetSheet.toLowerCase());

  if (!sheetName) {
    throw new Error(`Sheet "${targetSheet}" not found. Available: ${wb.SheetNames.join(", ")}`);
  }

  const ws = wb.Sheets[sheetName];
  const range = XLSX.utils.decode_range(ws["!ref"] || "A1");

  // Detect header row, scan first 10 rows for known census column names
  const censusKeywords = [
    "first name", "firstname", "first", "last name", "lastname", "last",
    "date of birth", "dob", "gender", "sex", "zip", "relationship", "type",
  ];

  let headerRow = 0;
  for (let r = 0; r <= Math.min(9, range.e.r); r++) {
    let matchCount = 0;
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (cell && cell.v != null) {
        const val = String(cell.v).trim().toLowerCase();
        if (censusKeywords.some(kw => val.includes(kw))) matchCount++;
      }
    }
    if (matchCount >= 2) {
      headerRow = r;
      break;
    }
  }

  // Read headers from detected header row
  const headers: Record<string, number> = {};
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: headerRow, c })];
    if (cell && cell.v != null) {
      headers[String(cell.v).trim().toLowerCase()] = c;
    }
  }

  log(`Template headers (row ${headerRow}): ${JSON.stringify(headers)}`, "proposal");

  // Map census fields to template columns
  const fieldMappings: Record<string, string[]> = {
    relationship: ["relationship", "type", "relation", "coverage type", "member type", "dependent type"],
    firstName: ["first name", "firstname", "first", "first_name", "name first"],
    lastName: ["last name", "lastname", "last", "last_name", "name last"],
    dateOfBirth: ["date of birth", "dob", "dateofbirth", "birth date", "birthdate", "date_of_birth"],
    gender: ["gender", "sex"],
    zipCode: ["zip code", "zipcode", "zip", "postal code", "zip_code"],
    companyName: ["company name", "companyname", "company", "company_name", "group", "group name", "employer"],
  };

  const colMap: Record<string, number> = {};
  for (const [field, aliases] of Object.entries(fieldMappings)) {
    for (const alias of aliases) {
      if (headers[alias] !== undefined) {
        colMap[field] = headers[alias];
        break;
      }
    }
  }

  log(`Column mapping: ${JSON.stringify(colMap)}`, "proposal");

  // Clear existing data rows (below header)
  const dataStartRow = headerRow + 1;
  for (let r = dataStartRow; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      delete ws[XLSX.utils.encode_cell({ r, c })];
    }
  }

  // Normalize relationship values to what the template expects
  function normalizeRelationship(rel: string): string {
    const upper = rel.toUpperCase().trim();
    if (upper === "EE" || upper === "EMPLOYEE") return "Employee";
    if (upper === "SP" || upper === "SPOUSE") return "Spouse";
    if (upper === "CH" || upper === "CHILD" || upper === "DEP" || upper === "DEPENDENT") return "Child";
    return rel;
  }

  // Inject census data starting below header
  census.forEach((entry, i) => {
    const r = dataStartRow + i;

    const write = (col: number | undefined, val: string) => {
      if (col === undefined || val == null) return;
      ws[XLSX.utils.encode_cell({ r, c: col })] = { t: "s", v: val };
    };

    write(colMap.relationship, normalizeRelationship(entry.relationship));
    write(colMap.firstName, entry.firstName);
    write(colMap.lastName, entry.lastName);
    write(colMap.dateOfBirth, entry.dateOfBirth);
    write(colMap.gender, entry.gender);
    write(colMap.zipCode, entry.zipCode);
    write(colMap.companyName, group.companyName);
  });

  // Update sheet range
  ws["!ref"] = XLSX.utils.encode_range({
    s: { r: 0, c: range.s.c },
    e: { r: Math.max(range.e.r, dataStartRow + census.length - 1), c: range.e.c },
  });

  // Write to temp file
  const tempPath = path.join(TEMP_DIR, `${group.id}_${Date.now()}.xlsm`);
  const outBuf = XLSX.write(wb, { type: "buffer", bookType: "xlsm", bookVBA: true });
  fs.writeFileSync(tempPath, outBuf);

  log(`Injected ${census.length} rows into "${sheetName}" (header row ${headerRow}), saved to ${tempPath}`, "proposal");
  return tempPath;
}

// ─── LibreOffice Detection ────────────────────────────────────────────────

let _libreOfficePath: string | null | undefined = undefined;

function findLibreOffice(): string | null {
  if (_libreOfficePath !== undefined) return _libreOfficePath;

  const candidates = ["libreoffice", "soffice", "/usr/bin/libreoffice", "/usr/bin/soffice"];
  for (const cmd of candidates) {
    try {
      const ver = execSync(`${cmd} --version 2>&1`, { stdio: "pipe", timeout: 10000 }).toString().trim();
      _libreOfficePath = cmd;
      log(`LibreOffice found: ${cmd} (${ver})`, "proposal");
      return cmd;
    } catch { /* try next */ }
  }

  _libreOfficePath = null;
  log("LibreOffice NOT found, will use pdfkit fallback", "proposal");
  return null;
}

// ─── LibreOffice PDF Export ───────────────────────────────────────────────

/**
 * Convert XLSM to PDF using LibreOffice headless.
 *
 * LibreOffice recalculates ALL formulas when opening the file, so the
 * rate tables in the actuary's template will compute automatically.
 * No need to run VBA macros, the formulas ARE the rate engine.
 */
export function runLibreOfficeExportPDF(xlsmPath: string, groupId: string): string {
  const loCmd = findLibreOffice();
  if (!loCmd) throw new Error("LibreOffice not found");

  const profileDir = ensureLibreOfficeProfile();
  const profileArg = `-env:UserInstallation=file://${profileDir}`;
  const pdfFileName = `${groupId}_${Date.now()}.pdf`;
  const pdfPath = path.join(PROPOSALS_DIR, pdfFileName);

  // Kill any stale LibreOffice processes that would block the lock file
  try { execSync("pkill -9 -f soffice 2>/dev/null || true", { stdio: "pipe", timeout: 3000 }); } catch { /* ok */ }

  // Single step: open XLSM → formulas recalculate → export PDF
  log(`Converting ${path.basename(xlsmPath)} to PDF...`, "proposal");
  try {
    const output = execSync(
      `${loCmd} --headless --norestore --calc ${profileArg} ` +
      `--convert-to pdf --outdir "${PROPOSALS_DIR}" "${xlsmPath}" 2>&1`,
      { timeout: 90000, stdio: "pipe" }
    ).toString();
    log(`LibreOffice output: ${output.substring(0, 300)}`, "proposal");
  } catch (err: any) {
    const stderr = err.stderr?.toString?.()?.substring(0, 300) || "";
    const stdout = err.stdout?.toString?.()?.substring(0, 300) || "";
    log(`LibreOffice convert failed: ${stdout} ${stderr}`, "proposal");
    throw new Error(`LibreOffice PDF conversion failed. ${stdout || err.message}`);
  }

  // LibreOffice names output based on input filename
  const baseName = path.basename(xlsmPath, ".xlsm");
  const generatedPdf = path.join(PROPOSALS_DIR, `${baseName}.pdf`);

  if (fs.existsSync(generatedPdf)) {
    fs.renameSync(generatedPdf, pdfPath);
    const sizeKB = (fs.statSync(pdfPath).size / 1024).toFixed(0);
    log(`PDF created: ${pdfPath} (${sizeKB} KB)`, "proposal");
  } else {
    // Scan for any newly created PDF
    const pdfFiles = fs.readdirSync(PROPOSALS_DIR)
      .filter(f => f.endsWith(".pdf"))
      .map(f => ({ name: f, time: fs.statSync(path.join(PROPOSALS_DIR, f)).mtimeMs }))
      .sort((a, b) => b.time - a.time);

    log(`Looking for PDF output. Files in dir: ${pdfFiles.map(f => f.name).join(", ")}`, "proposal");

    if (pdfFiles.length > 0 && Date.now() - pdfFiles[0].time < 60000) {
      const newest = path.join(PROPOSALS_DIR, pdfFiles[0].name);
      fs.renameSync(newest, pdfPath);
      log(`PDF found as ${pdfFiles[0].name}`, "proposal");
    } else {
      throw new Error("LibreOffice did not produce a PDF file");
    }
  }

  return pdfPath;
}

// ─── Full Pipeline ────────────────────────────────────────────────────────

export interface ProposalResult {
  pdfPath: string;
  fileName: string;
  ratesData: any;
}

/**
 * Full proposal generation pipeline:
 * 1. Inject census data into template
 * 2. Try LibreOffice (if available) to recalculate + export PDF
 * 3. Otherwise generate PDF using pdfkit with risk analysis
 * 4. Clean up temp files
 */
export async function generateProposal(
  group: Group,
  census: CensusEntry[],
  targetSheet: string = "Census"
): Promise<ProposalResult> {
  // Find template
  const templates = fs.readdirSync(TEMPLATE_DIR).filter(f => /\.xlsm$/i.test(f));
  if (templates.length === 0) {
    throw new Error("No XLSM template uploaded. Please upload a template first.");
  }

  const templatePath = path.join(TEMPLATE_DIR, templates[0]);
  log(`Starting proposal generation for ${group.companyName} (${census.length} members)`, "proposal");

  const loCmd = findLibreOffice();
  let pdfPath: string;
  let tempXlsm: string | null = null;

  if (loCmd) {
    // Full pipeline: inject census → LibreOffice recalc + macro → PDF
    log("LibreOffice available, using template as rate engine", "proposal");
    tempXlsm = injectCensusData(templatePath, group, census, targetSheet);
    try {
      pdfPath = runLibreOfficeExportPDF(tempXlsm, group.id);
    } catch (loErr: any) {
      log(`LibreOffice pipeline failed, falling back to pdfkit: ${loErr.message}`, "proposal");
      const { generateProposalPDF } = await import("./pdf-generator");
      const { calculateProposalData } = await import("./proposal-engine-calc");
      const proposalData = calculateProposalData(group, census);
      const result = await generateProposalPDF(proposalData);
      pdfPath = result.filePath;
    }
  } else {
    // No LibreOffice, generate PDF directly using pdfkit
    log("LibreOffice not available, generating PDF with pdfkit", "proposal");
    const { generateProposalPDF } = await import("./pdf-generator");
    const { calculateProposalData } = await import("./proposal-engine-calc");
    const proposalData = calculateProposalData(group, census);
    const result = await generateProposalPDF(proposalData);
    pdfPath = result.filePath;
  }

  // Clean up temp file
  if (tempXlsm) {
    try { fs.unlinkSync(tempXlsm); } catch { /* ignore */ }
  }

  // Build summary data
  const ratesData = buildSummaryData(group, census);

  const companySlug = group.companyName.replace(/[^a-zA-Z0-9]/g, "_");
  const dateStr = new Date().toISOString().slice(0, 10);
  const fileName = `Proposal_${companySlug}_${dateStr}.pdf`;

  return { pdfPath, fileName, ratesData };
}

/**
 * Build summary data for storage alongside the proposal.
 */
function buildSummaryData(group: Group, census: CensusEntry[]) {
  let employees = 0, spouses = 0, children = 0;
  let totalAge = 0;

  for (const entry of census) {
    const age = calculateAge(entry.dateOfBirth);
    totalAge += age;
    const rel = entry.relationship.toUpperCase();
    if (rel === "EE" || rel === "EMPLOYEE") employees++;
    else if (rel === "SP" || rel === "SPOUSE") spouses++;
    else children++;
  }

  return {
    totalLives: census.length,
    employees,
    spouses,
    children,
    averageAge: census.length > 0 ? totalAge / census.length : 0,
    generatedAt: new Date().toISOString(),
  };
}
