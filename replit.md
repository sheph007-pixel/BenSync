# Kennion Benefit Advisors

## Overview
A professional employee benefits advisory platform for small to mid-sized businesses. Combines brokerage expertise with AI-powered risk analytics. Clients register, upload employee census data (CSV), and receive qualification scores with risk analysis reports. Admin console for managing groups as a simple CRM.

## Architecture
- **Frontend**: React + Vite + TailwindCSS + shadcn/ui components
- **Backend**: Express.js with session-based auth
- **Database**: PostgreSQL with Drizzle ORM
- **Email**: Resend (RESEND_API_KEY secret) for transactional emails
- **Routing**: wouter for client-side routing
- **State**: TanStack React Query for data fetching

## Key Features
- Public landing page (professional corporate look, blue theme, custom people group SVG logo)
- Magic link authentication (passwordless sign-in via email)
- Multi-step census upload with smart column matching and mapping UI
- Client dashboard with group cards showing risk scores and demographics
- Group report page with Kennion Score, risk analysis, age/gender charts, PDF download
- Admin console (CRM) for managing groups, scores, statuses
- Role-based access (client vs admin)

## Data Models
- **users**: fullName, email, password (nullable, for admin), companyName, verified, magicToken, magicTokenExpiry, role (client|admin)
- **groups**: companyName, contact info, employeeCount, spouseCount, dependentCount, totalLives, status, score, riskScore (decimal), riskTier (preferred|standard|high), averageAge, maleCount, femaleCount, groupCharacteristics (jsonb), adminNotes
- **census_entries**: firstName, lastName, dateOfBirth, gender, zipCode, relationship (EE|SP|DEP)

## Auth Flow
- **Clients**: Enter email → receive magic link via Resend email → click link → signed in (no password needed)
- **New users**: If email not found, prompted for name/company → magic link sent → account created on verification
- **Admin**: Password-based login (admin@kennion.com / admin123) via toggle on login page
- Sessions stored in PostgreSQL via connect-pg-simple
- Magic tokens are 64-char hex strings, expire in 15 minutes, single-use

## Census Upload Flow
1. **Upload**: Drag & drop or browse for CSV file. Download template available. Sample data shown.
2. **Parse**: Server parses CSV headers and applies smart matching (fuzzy aliases for each required field)
3. **Map**: UI shows each CSV column matched to Kennion fields. User can edit/change mappings. All 6 required fields must be mapped.
4. **Confirm**: On submit, server validates rows, creates group, runs risk analysis, stores census entries.
5. **Report**: User sees group in dashboard list and can click to view full report with risk score, demographics, and PDF download.

## Required CSV Fields
- First Name, Last Name, Type (EE/SP/DEP), Date of Birth, Gender, Zip Code
- Smart matching aliases: "DOB" → Date of Birth, "Birth Date" → Date of Birth, "Zip" → Zip Code, etc.

## Kennion Risk Score
- 1.0 = average baseline (average expected healthcare costs)
- < 0.85 = Preferred Risk (lower costs)
- 0.85 - 1.15 = Standard Risk
- > 1.15 = High Risk (higher costs)
- Score factors: employee age distribution, gender ratio, group size, older member concentration, dependency ratio
- Placeholder algorithm; will be refined with real actuarial data

## Routes
- `/` - Landing page
- `/login` - Sign-in page (magic link + admin password toggle)
- `/register` - Redirects to /login
- `/auth/verify` - Magic link verification (auto-processes token from URL)
- `/dashboard` - Client portal (census upload wizard, group list)
- `/report/:id` - Group risk analysis report
- `/admin` - Admin console (group management, CRM)

## API Endpoints
- `POST /api/auth/magic-link` - Request magic link
- `POST /api/auth/verify-magic-link` - Verify magic link token
- `POST /api/auth/login` - Admin password login
- `GET /api/auth/me` - Current user
- `POST /api/auth/logout` - Logout
- `GET /api/groups/template` - Download CSV template
- `GET /api/groups/sample` - Sample census data JSON
- `POST /api/groups/parse` - Parse CSV, return headers + smart mappings (step 1)
- `POST /api/groups/confirm` - Confirm mappings and create group with analysis (step 2)
- `POST /api/groups/upload` - Legacy direct upload (skips mapping step)
- `GET /api/groups` - Get user's groups
- `GET /api/groups/:id` - Get single group details
- `GET /api/groups/:id/census` - Get group census data
- `GET /api/admin/groups` - All groups (admin)
- `GET /api/admin/groups/:id/census` - Group census data (admin)
- `PATCH /api/admin/groups/:id` - Update group status (admin)

## Status Flow
pending_review → under_review → analyzing → qualified/not_qualified → rates_available

## Email Service
- Uses Resend with RESEND_API_KEY secret
- server/email.ts handles email sending
- Magic link emails are HTML formatted with Kennion branding
- Currently sends from onboarding@resend.dev (sandbox); verify kennion.com domain in Resend to use custom from address
