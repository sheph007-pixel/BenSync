import { callOpenAIWithFallback } from "./ai-client";
import { OPENAI_MODEL_CHAIN, OPENAI_MODEL_CHAIN_FAST } from "./model-config";

interface CleanedRow {
  firstName: string;
  lastName: string;
  relationship: "EE" | "SP" | "CH";
  dob: string;
  gender: "Male" | "Female";
  zip: string;
  originalRow: Record<string, any>;
  issues?: string[];
}

interface CSVCleaningResult {
  cleanedData: CleanedRow[];
  confidence: "high" | "medium" | "low";
  summary: string;
  warnings: string[];
  columnMapping: Record<string, string>; // CSV Header -> Required Field
}

/**
 * Standardize relationship value using simple rules.
 *
 * Returns `recognized: false` when the value doesn't match any known
 * relationship vocabulary. Callers MUST treat the fallback "EE" as a
 * placeholder and surface the unrecognized case to the user, silently
 * defaulting dependents to "Employee" produces wildly wrong rates
 * because the rate engine multiplies the per-EE composite by the
 * (inflated) employee count.
 */
function standardizeRelationship(value: string): { code: "EE" | "SP" | "CH"; recognized: boolean } {
  const normalized = value.trim().toUpperCase();
  if (!normalized) return { code: "EE", recognized: false };

  // Employee / primary subscriber patterns
  if (["EE", "E", "EMP", "EMPLOYEE", "STAFF", "WORKER", "MEMBER",
       "SELF", "PRIMARY", "SUBSCRIBER", "INSURED", "ENROLLEE"].includes(normalized)) {
    return { code: "EE", recognized: true };
  }

  // Spouse / domestic partner patterns
  if (["SP", "S", "SPOUSE", "PARTNER", "WIFE", "HUSBAND",
       "DP", "DOMESTIC PARTNER", "DOMESTIC-PARTNER",
       "CIVIL UNION", "CU"].includes(normalized)) {
    return { code: "SP", recognized: true };
  }

  // Child / dependent patterns
  if (["CH", "C", "CHILD", "CHILDREN", "DEP", "DEPENDENT", "DEPENDANT",
       "KID", "SON", "DAUGHTER", "STEPCHILD", "STEP-CHILD",
       "ADOPTED", "FOSTER", "WARD"].includes(normalized)) {
    return { code: "CH", recognized: true };
  }

  // Loose prefix matches catch trailing qualifiers ("Spouse of John",
  // "Child 1", "Dependent, Disabled") without paving over typos.
  if (normalized.startsWith("SPOUS") || normalized.startsWith("HUSBAN") || normalized.startsWith("WIFE")) {
    return { code: "SP", recognized: true };
  }
  if (normalized.startsWith("CHILD") || normalized.startsWith("DEPEND") ||
      normalized.startsWith("SON") || normalized.startsWith("DAUGHT")) {
    return { code: "CH", recognized: true };
  }
  if (normalized.startsWith("EMPLOY") || normalized.startsWith("SUBSCR")) {
    return { code: "EE", recognized: true };
  }

  return { code: "EE", recognized: false };
}

/**
 * Standardize gender value using simple rules
 */
function standardizeGender(value: string): "Male" | "Female" {
  const normalized = value.trim().toUpperCase();

  // Female patterns
  if (["F", "FEMALE", "WOMAN", "W", "GIRL"].includes(normalized)) {
    return "Female";
  }

  // Male patterns
  if (["M", "MALE", "MAN", "BOY"].includes(normalized)) {
    return "Male";
  }

  // Default to Male if unrecognized
  return "Male";
}

/**
 * Intelligently maps CSV columns using AI
 * Detects column purposes even if names don't match exactly
 */
async function mapColumnsWithAI(headers: string[]): Promise<Record<string, string>> {
  const prompt = `You are a data mapping expert. Analyze these CSV column headers and map them to our required fields.

CSV Headers: ${headers.join(", ")}

Required Fields:
- First Name (person's first/given name)
- Last Name (person's last/family/surname)
- Type (FAMILY relationship to the employee: Employee/EE/Spouse/SP/Child/CH/Dependent, values like "Employee", "Spouse", "Child", "EE", "SP", "CH", "Self", "Dependent". Common header names: "Relationship", "Tier", "Member Type", "Role", "Relation")
- Date of Birth (DOB, birthday, birth date)
- Gender (sex, M/F/Male/Female)
- Zip Code (postal code, zip)

CRITICAL: For "Type", ONLY map a column that distinguishes employees from their spouse/children. Do NOT map columns about employment status ("Full-Time/Part-Time"), coverage tier ("EE Only/Family"), enrollment status ("Active/Cancelled"), or job title, map those to "ignore".

CRITICAL: Use the headers EXACTLY as provided, character-for-character, do NOT abbreviate, reformat, strip parentheses, or remove punctuation. If the header is "Relationship (EE / SP / CH)" your JSON key MUST be "Relationship (EE / SP / CH)", not "Relationship".

Return ONLY a JSON object mapping each header to ONE of these fields. If a header doesn't match any field, map it to "ignore".
Format: {"Header Name": "First Name", "Another Header": "Last Name", ...}

Be flexible - match variations like "FirstName", "first_name", "fname", "DOB", "BirthDate", etc.`;

  try {
    const completion = await callOpenAIWithFallback({
      messages: [
        {
          role: "system",
          content: "You are a data mapping expert. Return ONLY valid JSON, no explanations."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.1,
      max_tokens: 500,
      response_format: { type: "json_object" }
    }, OPENAI_MODEL_CHAIN_FAST);

    const mapping = JSON.parse(completion.choices[0].message.content || "{}");
    return mapping;
  } catch (error) {
    // Fallback: try simple fuzzy matching
    const mapping: Record<string, string> = {};
    for (const header of headers) {
      const lower = header.toLowerCase().replace(/[_\s-]/g, "");
      if (lower.includes("first") || lower.includes("fname")) mapping[header] = "First Name";
      else if (lower.includes("last") || lower.includes("lname") || lower.includes("surname")) mapping[header] = "Last Name";
      else if (lower.includes("type") || lower.includes("relation")) mapping[header] = "Type";
      else if (lower.includes("dob") || lower.includes("birth") || lower.includes("bday")) mapping[header] = "Date of Birth";
      else if (lower.includes("gender") || lower.includes("sex")) mapping[header] = "Gender";
      else if (lower.includes("zip") || lower.includes("postal")) mapping[header] = "Zip Code";
      else mapping[header] = "ignore";
    }
    return mapping;
  }
}

/**
 * Clean CSV data using intelligent AI-powered column mapping
 * Automatically detects columns and standardizes values
 *
 * @param headers - CSV column headers
 * @param rows - CSV data rows
 * @param userMapping - Optional pre-defined column mapping (CSV Header -> Required Field)
 */
export async function cleanCSVWithAI(
  headers: string[],
  rows: Record<string, any>[],
  userMapping?: Record<string, string>
): Promise<CSVCleaningResult> {
  const cleanedData: CleanedRow[] = [];
  const warnings: string[] = [];

  // Use provided mapping or detect with AI
  const columnMapping = userMapping || await mapColumnsWithAI(headers);

  // Reverse mapping: Required Field -> CSV Header
  const fieldToHeader: Record<string, string | null> = {
    "First Name": null,
    "Last Name": null,
    "Type": null,
    "Date of Birth": null,
    "Gender": null,
    "Zip Code": null
  };

  // Belt-and-suspenders: even if the parse layer normalizes headers,
  // the AI mapper occasionally echoes a header with subtle drift
  // (BOM, trailing space, case) or, more dangerously, SHORTENS the
  // header in its response. Real example: a column actually named
  // "Relationship (EE / SP / CH)" comes back from the model as just
  // "Relationship". Resolve each AI-returned header back to the
  // closest actual row key so `row[fieldToHeader[field]]` hits the
  // real column instead of returning undefined for every row.
  const actualRowKeys = rows.length > 0 ? Object.keys(rows[0]) : headers;
  const normalizeKey = (s: string) => s.replace(/^﻿/, "").trim().toLowerCase();
  const keyByNormalized = new Map<string, string>();
  for (const k of actualRowKeys) {
    keyByNormalized.set(normalizeKey(k), k);
  }

  const resolveHeader = (aiHeader: string): string => {
    const normAi = normalizeKey(aiHeader);
    if (!normAi) return aiHeader;
    // 1. Exact normalized match, the common case.
    const exact = keyByNormalized.get(normAi);
    if (exact) return exact;
    // 2. Fuzzy: the AI returned a shortened / paraphrased form. Find
    // actual keys that either contain the AI's normalized string or
    // are contained by it. Only commit if exactly one candidate
    // matches, ambiguity falls through so the missing-fields check
    // fires with a clear error rather than silently picking a wrong
    // column.
    const candidates = actualRowKeys.filter((k) => {
      const normK = normalizeKey(k);
      return normK.includes(normAi) || normAi.includes(normK);
    });
    if (candidates.length === 1) return candidates[0];
    return aiHeader;
  };

  for (const [header, field] of Object.entries(columnMapping)) {
    if (field === "ignore") continue;
    fieldToHeader[field] = resolveHeader(header);
  }

  // Check for missing required fields
  const missingFields = Object.entries(fieldToHeader)
    .filter(([_, header]) => !header)
    .map(([field, _]) => field);

  if (missingFields.length > 0) {
    throw new Error(`Could not detect required columns: ${missingFields.join(", ")}. Please ensure your CSV contains columns for first name, last name, relationship type, date of birth, gender, and zip code.`);
  }

  let unrecognizedRelCount = 0;
  const unrecognizedRawSamples = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    try {
      // Extract values using mapped column names
      const firstName = row[fieldToHeader["First Name"]!]?.toString().trim() || "";
      const lastName = row[fieldToHeader["Last Name"]!]?.toString().trim() || "";
      const rawType = row[fieldToHeader["Type"]!]?.toString().trim() || "";
      const dob = row[fieldToHeader["Date of Birth"]!]?.toString().trim() || "";
      const rawGender = row[fieldToHeader["Gender"]!]?.toString().trim() || "";
      const zip = row[fieldToHeader["Zip Code"]!]?.toString().trim() || "";

      // Standardize using simple rules
      const relResult = standardizeRelationship(rawType);
      const relationship = relResult.code;
      const gender = standardizeGender(rawGender);

      const issues: string[] = [];
      if (!firstName) issues.push("Missing first name");
      if (!lastName) issues.push("Missing last name");
      if (!dob) issues.push("Missing date of birth");
      if (!zip) issues.push("Missing zip code");
      if (!relResult.recognized) {
        unrecognizedRelCount++;
        if (rawType) {
          unrecognizedRawSamples.add(rawType);
          issues.push(`Unrecognized relationship "${rawType}", defaulted to Employee`);
        } else {
          issues.push("Missing relationship, defaulted to Employee");
        }
      }

      if (issues.length > 0) {
        warnings.push(`Row ${i + 1}: ${issues.join(", ")}`);
      }

      cleanedData.push({
        firstName,
        lastName,
        relationship,
        dob,
        gender,
        zip,
        originalRow: row,
        issues: issues.length > 0 ? issues : undefined
      });
    } catch (err) {
      warnings.push(`Row ${i + 1}: Failed to process - ${err}`);
    }
  }

  // If we couldn't recognize the relationship for any row at all, the
  // "Type" column we mapped is almost certainly the wrong one (or its
  // values use a vocabulary we don't know). Defaulting everything to
  // "Employee" produces nonsensical pricing, fail loudly so the user
  // sees it and can fix the CSV.
  if (cleanedData.length > 0 && unrecognizedRelCount === cleanedData.length) {
    const typeHeader = fieldToHeader["Type"];
    const sample = Array.from(unrecognizedRawSamples).slice(0, 5);

    if (sample.length > 0) {
      throw new Error(
        `Couldn't read the relationship/dependent column. We treated "${typeHeader}" as the relationship column, ` +
        `but none of its values match known formats (Employee/EE, Spouse/SP, Child/CH, Dependent). ` +
        `Found values like ${sample.map((s) => `"${s}"`).join(", ")}. ` +
        `Please update your CSV so the relationship column uses values like "EE", "SP", "CH" (or "Employee", "Spouse", "Child"), ` +
        `or rename your real relationship column to "Relationship" so the importer can find it.`
      );
    }

    // Empty-column path: surface per-column fill counts so the user can
    // see WHICH columns actually have data and which look empty. This
    // turns "the column appears to be empty" into actionable info, if
    // the rep sees that another column has the relationship values,
    // they know to rename it; if every column is empty, they know the
    // upload is genuinely blank.
    const detectedCols = actualRowKeys.slice(0, 10);
    const fillCounts = detectedCols.map((k) => {
      const filled = rows.reduce(
        (n, r) => n + (r[k] != null && String(r[k]).trim() !== "" ? 1 : 0),
        0,
      );
      return `"${k}" (${filled}/${rows.length} filled)`;
    });
    throw new Error(
      `Couldn't read the relationship/dependent column. We tried column "${typeHeader}" but every cell in it was empty across all ${rows.length} rows. ` +
      `Detected columns in your CSV: ${fillCounts.join(", ")}. ` +
      `If your relationship values are in a different column, rename it to "Relationship" (or "Type") and re-upload. ` +
      `If the relationship column really is blank, fill it with "EE" / "SP" / "CH" (or "Employee" / "Spouse" / "Child") for each row.`
    );
  }

  const eeRows = cleanedData.filter((c) => c.relationship === "EE").length;
  const spRows = cleanedData.filter((c) => c.relationship === "SP").length;
  const chRows = cleanedData.filter((c) => c.relationship === "CH").length;

  // Mixed-but-suspicious: some rows classified, many fell through to
  // the EE default. Surface as a top-level warning rather than blocking
  //, a small all-employee group is legitimate, but the user should
  // see this before confirming.
  if (unrecognizedRelCount > 0 && unrecognizedRelCount < cleanedData.length) {
    warnings.unshift(
      `${unrecognizedRelCount} of ${cleanedData.length} rows had unrecognized relationship values and were defaulted to Employee. ` +
      `Result: ${eeRows} Employee / ${spRows} Spouse / ${chRows} Child. Please verify before confirming.`
    );
  }

  let confidence: "high" | "medium" | "low" = "high";
  if (unrecognizedRelCount > 0) confidence = "medium";
  if (unrecognizedRelCount > cleanedData.length / 2) confidence = "low";

  return {
    cleanedData,
    confidence,
    summary: `AI detected and mapped ${headers.length} columns. Processed ${cleanedData.length} rows: ${eeRows} Employee, ${spRows} Spouse, ${chRows} Child.`,
    warnings,
    columnMapping
  };
}

/**
 * Generate AI-powered validation error messages
 * Helps users understand what's wrong and how to fix it
 */
export async function generateValidationGuidance(
  errors: string[],
  matchRate: number
): Promise<string> {
  const prompt = `You are a helpful data quality assistant. A user uploaded employee census data that failed validation with a ${matchRate}% match rate.

Validation errors:
${errors.map((e, i) => `${i + 1}. ${e}`).join('\n')}

Generate a clear, helpful message that:
1. Explains what went wrong in simple terms
2. Provides specific steps to fix the issues
3. Is encouraging and supportive (not technical/scary)
4. Mentions they can download the template or use AI cleaning to help

Keep it under 150 words. Be friendly and solution-focused.`;

  try {
    const completion = await callOpenAIWithFallback({
      messages: [
        {
          role: "system",
          content: "You are a helpful data quality assistant. Be clear, friendly, and solution-focused."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 300
    }, OPENAI_MODEL_CHAIN);

    return completion.choices[0].message.content || "Please review and correct the data validation errors before uploading.";
  } catch (error) {
    // Fallback if AI fails
    return "Your census data has validation errors. Please ensure all records have valid dates of birth and gender values (Male/Female). Download our template for the correct format.";
  }
}
