import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean, jsonb, real, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fullName: text("full_name").notNull(),
  email: text("email").notNull().unique(),
  password: text("password"),
  companyName: text("company_name"),
  phone: text("phone"),
  state: text("state"),
  zipCode: text("zip_code"),
  verified: boolean("verified").default(false).notNull(),
  magicToken: text("magic_token"),
  magicTokenExpiry: timestamp("magic_token_expiry"),
  // Manual gatekeeper approval. Default 'approved' so existing rows
  // auto-approve on db:push; new signups are explicitly set to 'pending'
  // by /api/auth/register. Values: 'pending' | 'approved' | 'rejected'.
  approvalStatus: text("approval_status").default("approved").notNull(),
  approvalToken: text("approval_token"),
  approvalTokenExpiry: timestamp("approval_token_expiry"),
  approvedAt: timestamp("approved_at"),
  // Account type. 'employer' (default) and 'broker' are the two public
  // self-signup roles; 'admin' is internal. Legacy rows may carry
  // 'client' — treated as an employer everywhere (see isEmployerRole).
  role: text("role").default("employer").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Public self-signup roles. 'admin' is never settable through registration.
export const PUBLIC_USER_ROLES = ["employer", "broker"] as const;
export type PublicUserRole = (typeof PUBLIC_USER_ROLES)[number];
// Legacy 'client' rows predate the employer/broker split; treat them as employers.
export function isEmployerRole(role: string | null | undefined): boolean {
  return role === "employer" || role === "client";
}

export const groups = pgTable("groups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // Owner user. Self-service customer groups always have one;
  // internal_sales quotes have NULL until/unless an admin attaches an
  // owner later. The /api/groups customer listing filters by exact
  // userId match, so NULL rows naturally never appear there.
  userId: varchar("user_id").references(() => users.id),
  // For internal_sales quotes: the admin who created the quote on
  // behalf of a prospect. NULL for self_service rows.
  createdByAdminId: varchar("created_by_admin_id").references(() => users.id),
  // The broker (users.role='broker') this group is attributed to.
  // Set when a broker creates the group in their dashboard, or when an
  // employer self-submits on the broker's branded page. NULL for legacy
  // rows and admin/internal_sales quotes. Broker dashboards are scoped
  // to this column; a broker only ever sees groups where brokerId = them.
  brokerId: varchar("broker_id").references(() => users.id),
  // Discriminator: 'self_service' (customer-uploaded) or
  // 'internal_sales' (sales-rep-driven). Drives admin list filtering
  // and whether a public link is minted.
  source: text("source").default("self_service").notNull(),
  // Unguessable token used in /q/:token public links. NULL for
  // self_service rows; rotated/revoked by admins on internal_sales.
  publicToken: text("public_token"),
  firstViewedAt: timestamp("first_viewed_at"),
  lastViewedAt: timestamp("last_viewed_at"),
  viewCount: integer("view_count").default(0).notNull(),
  // Set when the prospect submits the accept modal via the public
  // route. The acceptance email + status flip happen the same way as
  // self_service; this field just lets the quotes list distinguish
  // 'Sent / Viewed / Accepted' status without re-deriving from logs.
  publicAcceptedAt: timestamp("public_accepted_at"),
  companyName: text("company_name").notNull(),
  // Contact fields are optional for internal_sales quotes (rep
  // creates the quote first, prospect fills their own info on
  // accept). Self-service rows always have them populated from
  // the logged-in user's profile in /api/groups/confirm.
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  employeeCount: integer("employee_count").default(0),
  childrenCount: integer("dependent_count").default(0),
  spouseCount: integer("spouse_count").default(0),
  totalLives: integer("total_lives").default(0),
  status: text("status").default("census_uploaded").notNull(),
  score: integer("score"),
  riskScore: real("risk_score"),
  riskTier: text("risk_tier"),
  averageAge: real("average_age"),
  maleCount: integer("male_count").default(0),
  femaleCount: integer("female_count").default(0),
  groupCharacteristics: jsonb("group_characteristics"),
  adminNotes: text("admin_notes"),
  // Two-letter state (e.g. "AL") + ZIP that identifies this group's
  // primary business address. Used as the authoritative input to the
  // rate engine's rating-area inference, overriding per-employee
  // census zips.
  state: text("state"),
  zipCode: text("zip_code"),
  // When true, the owner can no longer edit or replace the census -
  // the proposal is frozen as-is. Only admins can toggle this.
  locked: boolean("locked").default(false).notNull(),
  // Deprecated: previously stored dual-AI audit verdicts. The audit
  // feature was removed (the rate pipeline is deterministic, there
  // was nothing per-proposal for an LLM to catch). Column kept to
  // avoid a destructive db:push; safe to drop in a future migration.
  auditResults: jsonb("audit_results"),
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const censusEntries = pgTable("census_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  groupId: varchar("group_id").notNull().references(() => groups.id, { onDelete: "cascade" }),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  dateOfBirth: text("date_of_birth").notNull(),
  gender: text("gender").notNull(),
  zipCode: text("zip_code").notNull(),
  relationship: text("relationship").default("EE").notNull(),
});

export const proposals = pgTable("proposals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  groupId: varchar("group_id").notNull().references(() => groups.id, { onDelete: "cascade" }),
  pdfPath: text("pdf_path").notNull(),
  pdfBase64: text("pdf_base64"),
  fileName: text("file_name").notNull(),
  ratesData: jsonb("rates_data"),
  // Deprecated: previously stored dual-AI audit verdicts. The audit
  // feature was removed; column kept to avoid a destructive db:push.
  auditResults: jsonb("audit_results"),
  status: text("status").default("generated").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const riskScreens = pgTable("risk_screens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  groupId: varchar("group_id").notNull().references(() => groups.id, { onDelete: "cascade" }),
  modelVersion: varchar("model_version").notNull(),
  modelHash: varchar("model_hash").notNull(),
  kri: real("kri").notNull(),
  tier: text("tier").notNull(),       // Preferred | Standard | High Risk
  decision: text("decision").notNull(),  // QUOTE | QUOTE_WITH_REVIEW | DECLINE
  resultJson: jsonb("result_json").notNull(),
  pdfBase64: text("pdf_base64"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  verified: true,
  magicToken: true,
  magicTokenExpiry: true,
  approvalStatus: true,
  approvalToken: true,
  approvalTokenExpiry: true,
  approvedAt: true,
  createdAt: true,
});

export const magicLinkRequestSchema = z.object({
  email: z.string().email("Valid email required"),
  fullName: z.string().min(2, "Full name is required").optional(),
  companyName: z.string().optional(),
  phone: z.string().optional(),
});

// Personal email domains blocklist
const BLOCKED_EMAIL_DOMAINS = [
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com',
  'icloud.com', 'me.com', 'mac.com', 'live.com', 'msn.com',
  'ymail.com', 'rocketmail.com', 'protonmail.com', 'mail.com',
  'gmx.com', 'zoho.com', 'inbox.com', 'hey.com'
];

// Validate US phone number (accepts multiple formats)
function isValidUSPhone(phone: string): boolean {
  // Strip all non-digit characters
  const digits = phone.replace(/\D/g, '');

  // Accept 10 digits (e.g., 5551234567)
  // Or 11 digits starting with 1 (e.g., 15551234567)
  if (digits.length === 10) {
    return true;
  }
  if (digits.length === 11 && digits[0] === '1') {
    return true;
  }

  return false;
}

// Ordered list of US state codes + names. The 2-letter code is what's
// stored; the name is for UI display (dropdowns, labels). Client and
// server share this list so validation and the picker can't drift.
export const US_STATES: ReadonlyArray<{ code: string; name: string }> = [
  { code: "AL", name: "Alabama" },
  { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" },
  { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" },
  { code: "DE", name: "Delaware" },
  { code: "DC", name: "District of Columbia" },
  { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" },
  { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" },
  { code: "IL", name: "Illinois" },
  { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" },
  { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" },
  { code: "ME", name: "Maine" },
  { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" },
  { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" },
  { code: "MO", name: "Missouri" },
  { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" },
  { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" },
  { code: "NM", name: "New Mexico" },
  { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" },
  { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" },
  { code: "OR", name: "Oregon" },
  { code: "PA", name: "Pennsylvania" },
  { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" },
  { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" },
  { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" },
  { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" },
  { code: "WI", name: "Wisconsin" },
  { code: "WY", name: "Wyoming" },
];

const US_STATE_CODES = new Set(US_STATES.map((s) => s.code));

export const registerSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Valid email required").refine(
    (email) => {
      const domain = email.split('@')[1]?.toLowerCase();
      return !BLOCKED_EMAIL_DOMAINS.includes(domain);
    },
    { message: "Please use your business email address (not Gmail, Yahoo, Hotmail, etc.)" }
  ),
  password: z.string().min(8, "Password must be at least 8 characters"),
  phone: z.string().min(1, "Phone number is required").refine(
    isValidUSPhone,
    { message: "Please enter a valid US phone number (10 digits)" }
  ),
  companyName: z.string().min(1, "Company name is required"),
  state: z
    .string()
    .transform((s) => s.trim().toUpperCase())
    .refine((s) => US_STATE_CODES.has(s), { message: "Enter a valid 2-letter state (e.g. AL)" }),
  zipCode: z
    .string()
    .transform((s) => s.trim())
    .refine((s) => /^\d{5}(-\d{4})?$/.test(s), { message: "Enter a 5-digit ZIP (or ZIP+4)" }),
  // Public role selector. Only employer/broker are accepted here; an
  // 'admin' value in the request body is rejected by the enum.
  role: z.enum(["employer", "broker"]).default("employer"),
});

// Required details when creating an additional group under an existing
// login. Reused by the server's pending-group-details session stash
// and by the confirm endpoint.
export const newGroupDetailsSchema = z.object({
  companyName: z.string().min(1, "Company name is required"),
  state: z
    .string()
    .transform((s) => s.trim().toUpperCase())
    .refine((s) => US_STATE_CODES.has(s), { message: "Enter a valid 2-letter state" }),
  zipCode: z
    .string()
    .transform((s) => s.trim())
    .refine((s) => /^\d{5}(-\d{4})?$/.test(s), { message: "Enter a 5-digit ZIP" }),
});

// Internal sales rep creates a quote on behalf of a prospect. Only
// company basics are required up-front so the rep can crank quotes
// fast; contact info is optional (rep can fill it later, or the
// prospect supplies it themselves on the Accept modal).
export const internalSalesQuoteInputSchema = z.object({
  companyName: z.string().min(1, "Company name is required").max(120),
  state: z
    .string()
    .transform((s) => s.trim().toUpperCase())
    .refine((s) => US_STATE_CODES.has(s), { message: "Enter a valid 2-letter state" }),
  zipCode: z
    .string()
    .transform((s) => s.trim())
    .refine((s) => /^\d{5}(-\d{4})?$/.test(s), { message: "Enter a 5-digit ZIP" }),
  contactName: z.string().max(120).optional().nullable(),
  contactEmail: z
    .string()
    .optional()
    .nullable()
    .refine(
      (v) => v == null || v === "" || /^\S+@\S+\.\S+$/.test(v),
      { message: "Enter a valid email or leave blank" },
    ),
  contactPhone: z.string().optional().nullable(),
});
export type InternalSalesQuoteInput = z.infer<typeof internalSalesQuoteInputSchema>;

export const magicLinkVerifySchema = z.object({
  token: z.string().min(1, "Token is required"),
});

export const loginSchema = z.object({
  email: z.string().email("Valid email required"),
  password: z.string().min(1, "Password is required"),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email("Valid email required"),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

// Public contact / quote-inquiry form on the marketing site. Posts to
// /api/contact, which emails hunter@kennion.com. No login, no DB write.
// `website` is a honeypot: a hidden field real users never fill, if it
// arrives non-empty we silently drop the submission as bot spam.
export const contactInquirySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  company: z.string().trim().min(1, "Company is required").max(160),
  email: z.string().trim().email("Valid email required").max(160),
  phone: z.string().trim().max(40).optional().default(""),
  employees: z.string().trim().max(40).optional().default(""),
  message: z.string().trim().max(4000).optional().default(""),
  website: z.string().max(200).optional().default(""), // honeypot, real users leave this empty
});
export type ContactInquiry = z.infer<typeof contactInquirySchema>;

export const insertGroupSchema = createInsertSchema(groups).omit({
  id: true,
  status: true,
  score: true,
  riskScore: true,
  riskTier: true,
  averageAge: true,
  maleCount: true,
  femaleCount: true,
  groupCharacteristics: true,
  adminNotes: true,
  submittedAt: true,
  updatedAt: true,
});

export const insertCensusEntrySchema = createInsertSchema(censusEntries).omit({
  id: true,
});

export const updateGroupStatusSchema = z.object({
  status: z.enum(["census_uploaded", "approved", "proposal_sent", "proposal_accepted", "client", "not_approved"]),
  score: z.number().min(0).max(100).optional(),
  riskScore: z.number().optional(),
  riskTier: z.enum(["preferred", "standard", "high"]).optional(),
  adminNotes: z.string().optional(),
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Group = typeof groups.$inferSelect;
export type InsertGroup = z.infer<typeof insertGroupSchema>;
export type CensusEntry = typeof censusEntries.$inferSelect;
export type InsertCensusEntry = z.infer<typeof insertCensusEntrySchema>;
export type Proposal = typeof proposals.$inferSelect;

export type RiskScreen = typeof riskScreens.$inferSelect;
export type InsertRiskScreen = typeof riskScreens.$inferInsert;

// ── BenSync Captive Analytics (isolated /captive module) ──────────────────
// Namespaced captive_* tables. Declared here so drizzle-kit push (run with
// --force on every deploy) treats them as MANAGED and never drops them — the
// same reason every other table lives in this file. Nothing else in the app
// references these; the module in server/captive/ owns them.
export const captiveUsers = pgTable("captive_users", {
  email: text("email").primaryKey(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const captivePeriods = pgTable("captive_periods", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  data: jsonb("data").notNull(),
  committedAt: timestamp("committed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const captiveNotes = pgTable("captive_notes", {
  id: serial("id").primaryKey(),
  groupCode: text("group_code").notNull(),
  author: text("author").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const captiveSettings = pgTable("captive_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
});
