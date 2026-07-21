import { Resend } from "resend";
import { log } from "./index";

// Using verified domain site.kennion.com
const FROM_EMAIL = "BenSync <noreply@site.kennion.com>";

// Last contact-inquiry send failure, surfaced (message text only, truncated)
// on /api/health so a broken form can be diagnosed from a browser.
let lastEmailError: string | null = null;
export function getLastEmailError(): string | null {
  return lastEmailError;
}

function getResendClient() {
  // Accept the legacy Railway variable name "Resend" as well.
  const apiKey = process.env.RESEND_API_KEY || process.env.Resend;
  if (!apiKey) {
    log("ERROR: RESEND_API_KEY environment variable is not set");
    throw new Error("RESEND_API_KEY not configured");
  }
  return new Resend(apiKey);
}

export async function sendMagicLinkEmail(
  toEmail: string,
  magicLinkUrl: string,
  fullName?: string
) {
  try {
    log(`[EMAIL DEBUG] Starting email send to: ${toEmail}`);
    log(`[EMAIL DEBUG] API Key present: ${!!process.env.RESEND_API_KEY}`);

    const client = getResendClient();
    const greeting = fullName ? `Hi ${fullName},` : "Hi,";

    log(`Sending email from: ${FROM_EMAIL} to: ${toEmail}`);

    const result = await client.emails.send({
      from: FROM_EMAIL,
      to: toEmail,
      subject: "Sign in to BenSync",
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
          <div style="text-align: center; margin-bottom: 32px;">
            <h2 style="color: #1e3a5f; margin: 0; font-size: 20px;">BenSync</h2>
          </div>
          <p style="color: #333; font-size: 16px; line-height: 1.5;">${greeting}</p>
          <p style="color: #333; font-size: 16px; line-height: 1.5;">Click the button below to securely sign in to your account:</p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${magicLinkUrl}" style="display: inline-block; background-color: #2563eb; color: #ffffff; padding: 14px 32px; border-radius: 6px; text-decoration: none; font-size: 16px; font-weight: 600;">Sign In</a>
          </div>
          <p style="color: #666; font-size: 14px; line-height: 1.5;">This link expires in 15 minutes and can only be used once.</p>
          <p style="color: #666; font-size: 14px; line-height: 1.5;">If you didn't request this, you can safely ignore this email.</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;" />
          <p style="color: #999; font-size: 12px; text-align: center;">BenSync &middot; Benefits in sync</p>
        </div>
      `,
    });

    if (result.error) {
      log(`[EMAIL ERROR] Resend API error: ${JSON.stringify(result.error)}`);
      throw new Error(`Email delivery failed: ${result.error.message}`);
    }

    log(`[EMAIL SUCCESS] Magic link email sent to ${toEmail} (id: ${result.data?.id})`);
    return true;
  } catch (err: any) {
    log(`[EMAIL ERROR] Failed to send magic link email to ${toEmail}: ${err.message}`);
    log(`[EMAIL ERROR] Full error: ${JSON.stringify(err)}`);
    throw new Error("Failed to send sign-in email. Please try again.");
  }
}

// Proposal-acceptance email sent to Kennion (hunter@kennion.com) when a
// group owner submits the acceptance form. Body mirrors the exact
// template the customer pasted when they specced this feature.
// NOTE: the payload includes ssnLast4, it's part of the email record
// (legitimate business need for onboarding) but MUST NOT appear in
// server logs. We never log the body.
export type ProposalAcceptancePayload = {
  groupId: string;
  submittedAt: Date;
  plans: {
    health: string[];
    dental: string[];
    vision: string[];
    supplemental: string;
    employerPaidLife: string;
  };
  company: {
    legalName: string;
    taxId: string;
    streetAddress: string;
    cityStateZip: string;
  };
  contact: {
    name: string;
    workEmail: string;
    ssnLast4: string;
    ssnLast4Verify: string;
    title: string;
    phone: string;
    reason: string;
  };
  acceptance: {
    additionalComments: string;
  };
};

export async function sendProposalAcceptanceEmail(
  toEmail: string,
  payload: ProposalAcceptancePayload,
) {
  const p = payload;
  const subject = `New Group Sign Up, ${p.company.legalName || "Unnamed Company"}`;

  // Plain-text body, the template the customer pasted verbatim. Resend
  // accepts `text` alongside `html` and clients will show one or the
  // other depending on preferences.
  const text = [
    "New Group Sign Up:",
    "",
    "STEP 1: SELECT YOUR PLANS",
    "Health Plan(s) - Choose Up To 3",
    joinOrDash(p.plans.health),
    "",
    "Dental Plan(s) - Choose Up To 2",
    joinOrDash(p.plans.dental),
    "",
    "Vision Plan(s) - Choose Up To 2",
    joinOrDash(p.plans.vision),
    "",
    "Supplemental Package - (Guardian)",
    p.plans.supplemental || "-",
    "",
    "100% Employer Paid Life Insurance - Guardian",
    p.plans.employerPaidLife || "-",
    "",
    "STEP 2: COMPANY INFO",
    "Company Legal Name",
    p.company.legalName,
    "",
    "Company Tax ID",
    p.company.taxId,
    "",
    "Company Street Address",
    p.company.streetAddress,
    "",
    "City, State & Zip",
    p.company.cityStateZip,
    "",
    "STEP 3: CONTACT DETAILS",
    "Contact Name",
    p.contact.name,
    "",
    "Contact Work Email",
    p.contact.workEmail,
    "",
    "Last 4 Of Social Security Number",
    p.contact.ssnLast4,
    "",
    "Verify Last 4 Of Social Security Number",
    p.contact.ssnLast4Verify,
    "",
    "Title",
    p.contact.title,
    "",
    "Contact Phone Number",
    p.contact.phone,
    "",
    "Why did you decide to move forward with BenSync and our Employee Benefits Program?",
    p.contact.reason,
    "",
    "STEP 4: Acceptance",
    "Do you have any additional comments or feedback for us?",
    p.acceptance.additionalComments,
    "",
    "Acceptance",
    "I ACCEPT",
    "",
    `Submitted: ${p.submittedAt.toISOString()}`,
    `Group ID: ${p.groupId}`,
  ].join("\n");

  // Minimal HTML version preserves line breaks + section headings.
  const html = `<pre style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; line-height: 1.5; color: #1b1b1b; white-space: pre-wrap;">${escapeHtml(text)}</pre>`;

  try {
    const client = getResendClient();
    const result = await client.emails.send({
      from: FROM_EMAIL,
      to: toEmail,
      subject,
      text,
      html,
    });
    if (result.error) {
      log(`[EMAIL ERROR] Acceptance email Resend error: ${JSON.stringify(result.error)}`);
      throw new Error(`Email delivery failed: ${result.error.message}`);
    }
    // Deliberately don't log the body, it contains SSN last-4.
    log(`[EMAIL SUCCESS] Acceptance email sent for group ${p.groupId} (id: ${result.data?.id})`);
    return true;
  } catch (err: any) {
    log(`[EMAIL ERROR] Failed to send acceptance email for group ${p.groupId}: ${err.message}`);
    throw new Error("Failed to send acceptance email. Please try again.");
  }
}

/**
 * Sends Hunter a one-click approve/reject email when a new prospect
 * registers. The token in each URL IS the auth, no login required to
 * click. Tokens expire after 14 days (enforced on the GET endpoint).
 */
export async function sendApprovalRequestEmail(p: {
  prospectName: string;
  prospectEmail: string;
  companyName: string;
  phone: string;
  state: string;
  zipCode: string;
  approveUrl: string;
  rejectUrl: string;
}): Promise<boolean> {
  try {
    const client = getResendClient();
    const result = await client.emails.send({
      from: FROM_EMAIL,
      to: "hunter@kennion.com",
      replyTo: p.prospectEmail,
      subject: `New signup pending approval: ${p.prospectName} - ${p.companyName}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #0f1828;">
          <div style="border-bottom: 1px solid #e5e7eb; padding-bottom: 16px; margin-bottom: 24px;">
            <h2 style="color: #0e4992; margin: 0; font-size: 18px; font-weight: 600;">BenSync · Pending Signup</h2>
            <p style="color: #5b6679; font-size: 13px; margin: 4px 0 0;">A new prospect is awaiting your approval.</p>
          </div>

          <table style="width: 100%; border-collapse: collapse; font-size: 14px; line-height: 1.55;">
            <tr><td style="padding: 6px 0; color: #5b6679; width: 130px;">Name</td><td style="padding: 6px 0; font-weight: 500;">${escapeHtml(p.prospectName)}</td></tr>
            <tr><td style="padding: 6px 0; color: #5b6679;">Company</td><td style="padding: 6px 0; font-weight: 500;">${escapeHtml(p.companyName)}</td></tr>
            <tr><td style="padding: 6px 0; color: #5b6679;">Business email</td><td style="padding: 6px 0;"><a href="mailto:${encodeURIComponent(p.prospectEmail)}" style="color: #0e4992; text-decoration: none;">${escapeHtml(p.prospectEmail)}</a></td></tr>
            <tr><td style="padding: 6px 0; color: #5b6679;">Phone</td><td style="padding: 6px 0;"><a href="tel:${encodeURIComponent(p.phone)}" style="color: #0e4992; text-decoration: none;">${escapeHtml(p.phone)}</a></td></tr>
            <tr><td style="padding: 6px 0; color: #5b6679;">Location</td><td style="padding: 6px 0;">${escapeHtml(p.state)} &middot; ${escapeHtml(p.zipCode)}</td></tr>
          </table>

          <div style="margin-top: 32px;">
            <a href="${p.approveUrl}" style="display: inline-block; background: #0e4992; color: #ffffff; padding: 12px 22px; border-radius: 6px; text-decoration: none; font-weight: 500; font-size: 14px; margin-right: 10px;">Approve &amp; Notify</a>
            <a href="${p.rejectUrl}" style="display: inline-block; background: #ffffff; color: #5b6679; padding: 12px 22px; border-radius: 6px; text-decoration: none; font-weight: 500; font-size: 14px; border: 1px solid #d9dde5;">Reject</a>
          </div>

          <p style="margin-top: 28px; padding-top: 18px; border-top: 1px solid #e5e7eb; font-size: 11.5px; color: #5b6679; line-height: 1.5;">
            One-click action - no login required. Links expire in 14 days. If neither is clicked, the prospect's account stays pending.
          </p>
        </div>
      `,
    });
    if (result.error) {
      log(`[EMAIL ERROR] Approval-request email Resend error: ${JSON.stringify(result.error)}`);
      return false;
    }
    log(`[EMAIL SUCCESS] Approval-request email sent to hunter@ for ${p.prospectEmail} (id: ${result.data?.id})`);
    return true;
  } catch (err: any) {
    log(`[EMAIL ERROR] Failed to send approval-request email for ${p.prospectEmail}: ${err.message}`);
    return false;
  }
}

/**
 * Sends the prospect a "you're in" email after Hunter approves them.
 */
export async function sendApprovalGrantedEmail(p: {
  toEmail: string;
  fullName: string;
  loginUrl: string;
}): Promise<boolean> {
  try {
    const client = getResendClient();
    const firstName = p.fullName ? p.fullName.split(" ")[0] : "";
    const greeting = firstName ? `Hi ${firstName},` : "Hi,";
    const result = await client.emails.send({
      from: FROM_EMAIL,
      to: p.toEmail,
      subject: "You're approved · BenSync",
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px; color: #0f1828;">
          <div style="text-align: center; margin-bottom: 28px;">
            <h2 style="color: #0e4992; margin: 0; font-size: 20px;">BenSync</h2>
          </div>
          <p style="font-size: 16px; line-height: 1.55;">${escapeHtml(greeting)}</p>
          <p style="font-size: 16px; line-height: 1.55;">Your BenSync account has been approved. You can now sign in and submit your group for a quote.</p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${p.loginUrl}" style="display: inline-block; background: #0e4992; color: #ffffff; padding: 13px 28px; border-radius: 6px; text-decoration: none; font-weight: 500; font-size: 15px;">Sign In</a>
          </div>
          <p style="font-size: 13.5px; line-height: 1.55; color: #5b6679;">
            If you have questions, reply to this email and our team will get back to you.
          </p>
          <p style="font-size: 11.5px; color: #5b6679; margin-top: 28px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
            BenSync &middot; Vestavia, AL
          </p>
        </div>
      `,
    });
    if (result.error) {
      log(`[EMAIL ERROR] Approval-granted email Resend error: ${JSON.stringify(result.error)}`);
      return false;
    }
    log(`[EMAIL SUCCESS] Approval-granted email sent to ${p.toEmail} (id: ${result.data?.id})`);
    return true;
  } catch (err: any) {
    log(`[EMAIL ERROR] Failed to send approval-granted email for ${p.toEmail}: ${err.message}`);
    return false;
  }
}

function joinOrDash(items: string[]): string {
  return items.length > 0 ? items.join(", ") : "-";
}

/**
 * Notifies Hunter when a self-service user uploads or replaces a census so
 * he can jump straight into the admin cockpit. Skipped for internal_sales
 * quotes, the rep already knows.
 */
export async function sendCensusUploadedAlertEmail(p: {
  uploaderName: string;
  uploaderEmail: string;
  uploaderCompany: string;
  groupId: string;
  groupCompanyName: string;
  totalLives: number;
  employees: number;
  spouses: number;
  children: number;
  riskScore: number | null;
  riskTier: string | null;
  baseUrl: string;
}): Promise<boolean> {
  try {
    const client = getResendClient();
    const adminUrl = `${p.baseUrl.replace(/\/$/, "")}/admin/groups/${encodeURIComponent(p.groupId)}`;
    const scoreText = p.riskScore != null ? p.riskScore.toFixed(2) : "-";
    const tierText = p.riskTier ? p.riskTier.charAt(0).toUpperCase() + p.riskTier.slice(1) : "-";
    const result = await client.emails.send({
      from: FROM_EMAIL,
      to: "hunter@kennion.com",
      replyTo: p.uploaderEmail,
      subject: `New census uploaded: ${p.groupCompanyName} - ${p.totalLives} lives`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #0f1828;">
          <div style="border-bottom: 1px solid #e5e7eb; padding-bottom: 16px; margin-bottom: 24px;">
            <div style="font-family: ui-monospace, monospace; font-size: 10.5px; letter-spacing: .16em; text-transform: uppercase; color: #0e4992;">BenSync &middot; New Census</div>
            <h2 style="color: #0f1828; margin: 6px 0 0; font-size: 18px; font-weight: 600;">${escapeHtml(p.groupCompanyName)}</h2>
            <p style="color: #5b6679; font-size: 13px; margin: 4px 0 0;">A user just uploaded a census. Quick details below.</p>
          </div>

          <table style="width: 100%; border-collapse: collapse; font-size: 14px; line-height: 1.55;">
            <tr><td style="padding: 6px 0; color: #5b6679; width: 130px;">Uploaded by</td><td style="padding: 6px 0; font-weight: 500;">${escapeHtml(p.uploaderName)}${p.uploaderCompany ? " (" + escapeHtml(p.uploaderCompany) + ")" : ""}</td></tr>
            <tr><td style="padding: 6px 0; color: #5b6679;">Email</td><td style="padding: 6px 0;"><a href="mailto:${encodeURIComponent(p.uploaderEmail)}" style="color: #0e4992; text-decoration: none;">${escapeHtml(p.uploaderEmail)}</a></td></tr>
            <tr><td style="padding: 6px 0; color: #5b6679;">Lives</td><td style="padding: 6px 0; font-weight: 500;">${p.totalLives} total &middot; ${p.employees} EE &middot; ${p.spouses} spouse${p.spouses === 1 ? "" : "s"} &middot; ${p.children} child${p.children === 1 ? "" : "ren"}</td></tr>
            <tr><td style="padding: 6px 0; color: #5b6679;">BenSync Score</td><td style="padding: 6px 0; font-weight: 500;">${escapeHtml(scoreText)} &middot; ${escapeHtml(tierText)}</td></tr>
          </table>

          <div style="margin-top: 32px;">
            <a href="${adminUrl}" style="display: inline-block; background: #0e4992; color: #ffffff; padding: 12px 22px; border-radius: 6px; text-decoration: none; font-weight: 500; font-size: 14px;">Open in admin</a>
          </div>

          <p style="margin-top: 28px; padding-top: 18px; border-top: 1px solid #e5e7eb; font-size: 11.5px; color: #5b6679; line-height: 1.5;">
            Sent at ${new Date().toLocaleString("en-US", { timeZone: "America/Chicago", dateStyle: "medium", timeStyle: "short" })} CT. Self-service uploads only - internal sales quotes do not trigger this alert.
          </p>
        </div>
      `,
    });
    if (result.error) {
      log(`[EMAIL ERROR] Census-uploaded alert Resend error: ${JSON.stringify(result.error)}`);
      return false;
    }
    log(`[EMAIL SUCCESS] Census-uploaded alert sent to hunter@ for group ${p.groupId} (id: ${result.data?.id})`);
    return true;
  } catch (err: any) {
    log(`[EMAIL ERROR] Failed to send census-uploaded alert for group ${p.groupId}: ${err.message}`);
    return false;
  }
}

/**
 * Sends Hunter a lead notification when a prospect submits the public
 * contact / quote-inquiry form on the marketing site. No login, no DB
 * write, the form data flows straight into this email and is gone.
 * replyTo is set to the prospect so Hunter can reply directly. Non-fatal:
 * returns false on any failure so the route can report a clean error.
 */
export async function sendContactInquiryEmail(p: {
  name: string;
  company: string;
  email: string;
  employees: string;
  message: string;
}): Promise<boolean> {
  try {
    const client = getResendClient();
    const employeesText = p.employees?.trim() ? p.employees.trim() : "Not provided";
    const messageHtml = p.message?.trim()
      ? escapeHtml(p.message.trim()).replace(/\n/g, "<br>")
      : "<span style=\"color:#9aa3b2;\">No message provided.</span>";
    const result = await client.emails.send({
      from: FROM_EMAIL,
      to: "hunter@kennion.com",
      replyTo: p.email,
      subject: `New quote inquiry: ${p.company} (${p.name})`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #0f1828;">
          <div style="border-bottom: 1px solid #e5e7eb; padding-bottom: 16px; margin-bottom: 24px;">
            <div style="font-family: ui-monospace, monospace; font-size: 10.5px; letter-spacing: .16em; text-transform: uppercase; color: #0e4992;">BenSync &middot; New Inquiry</div>
            <h2 style="color: #0f1828; margin: 6px 0 0; font-size: 18px; font-weight: 600;">${escapeHtml(p.company)}</h2>
            <p style="color: #5b6679; font-size: 13px; margin: 4px 0 0;">A prospect submitted the contact form on the website.</p>
          </div>

          <table style="width: 100%; border-collapse: collapse; font-size: 14px; line-height: 1.55;">
            <tr><td style="padding: 6px 0; color: #5b6679; width: 130px;">Name</td><td style="padding: 6px 0; font-weight: 500;">${escapeHtml(p.name)}</td></tr>
            <tr><td style="padding: 6px 0; color: #5b6679;">Company</td><td style="padding: 6px 0; font-weight: 500;">${escapeHtml(p.company)}</td></tr>
            <tr><td style="padding: 6px 0; color: #5b6679;">Email</td><td style="padding: 6px 0;"><a href="mailto:${encodeURIComponent(p.email)}" style="color: #0e4992; text-decoration: none;">${escapeHtml(p.email)}</a></td></tr>
            <tr><td style="padding: 6px 0; color: #5b6679;">Employees</td><td style="padding: 6px 0; font-weight: 500;">${escapeHtml(employeesText)}</td></tr>
          </table>

          <div style="margin-top: 20px; padding: 16px 18px; background: #f4f6f9; border-radius: 8px;">
            <div style="font-size: 11.5px; text-transform: uppercase; letter-spacing: .08em; color: #5b6679; margin-bottom: 8px;">Message</div>
            <div style="font-size: 14px; line-height: 1.6; color: #0f1828;">${messageHtml}</div>
          </div>

          <div style="margin-top: 28px;">
            <a href="mailto:${encodeURIComponent(p.email)}" style="display: inline-block; background: #0e4992; color: #ffffff; padding: 12px 22px; border-radius: 6px; text-decoration: none; font-weight: 500; font-size: 14px;">Reply to ${escapeHtml(p.name)}</a>
          </div>

          <p style="margin-top: 28px; padding-top: 18px; border-top: 1px solid #e5e7eb; font-size: 11.5px; color: #5b6679; line-height: 1.5;">
            Submitted ${new Date().toLocaleString("en-US", { timeZone: "America/Chicago", dateStyle: "medium", timeStyle: "short" })} CT via the kennion.com contact form. Reply directly to reach the prospect.
          </p>
        </div>
      `,
      text: [
        "New quote inquiry from the BenSync website.",
        "",
        `Name: ${p.name}`,
        `Company: ${p.company}`,
        `Email: ${p.email}`,
        `Employees: ${employeesText}`,
        "",
        "Message:",
        p.message?.trim() ? p.message.trim() : "(none)",
      ].join("\n"),
    });
    if (result.error) {
      log(`[EMAIL ERROR] Contact inquiry Resend error: ${JSON.stringify(result.error)}`);
      lastEmailError = JSON.stringify(result.error).slice(0, 200);
      return false;
    }
    log(`[EMAIL SUCCESS] Contact inquiry sent to hunter@ from ${p.email} (${p.company}) (id: ${result.data?.id})`);
    lastEmailError = null;
    return true;
  } catch (err: any) {
    log(`[EMAIL ERROR] Failed to send contact inquiry from ${p.email}: ${err.message}`);
    lastEmailError = String(err?.message ?? err).slice(0, 200);
    return false;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
