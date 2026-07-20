// Mock data modeled on Kennion admin schema: groups (companies w/ census submissions) + users
window.MOCK = {
  currentUser: {
    fullName: "Jordan Reyes",
    email: "jordan@kennionadvisors.com",
    role: "admin",
  },
  // Each entry is one census submission (multiple can share a companyName)
  groups: [
    { id: "a1b2c3d4e5", companyName: "Cedar Ridge Dental", contactName: "Priya Shah", contactEmail: "priya@cedarridgedental.com", contactPhone: "(248) 555-0142", submittedAt: "2026-04-18T14:22:00Z", totalLives: 24, employeeCount: 18, spouseCount: 4, childrenCount: 2, maleCount: 10, femaleCount: 14, averageAge: 38.2, riskScore: 0.74, riskTier: "preferred", status: "proposal_sent", adminNotes: "Current carrier renewal at +18%. Looking at cost-sharing alternatives." },
    { id: "f6g7h8i9j0", companyName: "Cedar Ridge Dental", contactName: "Priya Shah", contactEmail: "priya@cedarridgedental.com", contactPhone: "(248) 555-0142", submittedAt: "2026-03-12T09:04:00Z", totalLives: 22, employeeCount: 17, spouseCount: 3, childrenCount: 2, maleCount: 9, femaleCount: 13, averageAge: 37.8, riskScore: 0.71, riskTier: "preferred", status: "census_uploaded" },
    { id: "k1l2m3n4o5", companyName: "Northfield Manufacturing", contactName: "Kai Alvarez", contactEmail: "kai.alvarez@northfieldmfg.com", contactPhone: "(734) 555-0198", submittedAt: "2026-04-15T11:30:00Z", totalLives: 214, employeeCount: 142, spouseCount: 48, childrenCount: 24, maleCount: 118, femaleCount: 96, averageAge: 42.1, riskScore: 1.08, riskTier: "standard", status: "proposal_accepted" },
    { id: "p6q7r8s9t0", companyName: "Harper & Dean Legal", contactName: "Jules Harper", contactEmail: "jharper@harperdean.law", contactPhone: "(212) 555-0167", submittedAt: "2026-04-10T16:45:00Z", totalLives: 58, employeeCount: 42, spouseCount: 12, childrenCount: 4, maleCount: 26, femaleCount: 32, averageAge: 41.5, riskScore: 0.92, riskTier: "preferred", status: "proposal_sent" },
    { id: "u1v2w3x4y5", companyName: "Brightline Logistics", contactName: "Sam Ohene", contactEmail: "s.ohene@brightlinelog.com", contactPhone: "(312) 555-0184", submittedAt: "2026-04-05T08:12:00Z", totalLives: 520, employeeCount: 380, spouseCount: 98, childrenCount: 42, maleCount: 312, femaleCount: 208, averageAge: 39.8, riskScore: 1.24, riskTier: "high", status: "census_uploaded" },
    { id: "z6a7b8c9d0", companyName: "Meridian Software Co.", contactName: "Alex Thal", contactEmail: "alex.thal@meridiansoft.io", contactPhone: "(415) 555-0179", submittedAt: "2026-03-28T13:20:00Z", totalLives: 96, employeeCount: 74, spouseCount: 16, childrenCount: 6, maleCount: 54, femaleCount: 42, averageAge: 34.6, riskScore: 0.68, riskTier: "preferred", status: "client" },
    { id: "e1f2g3h4i5", companyName: "Pine Valley Schools", contactName: "Dana Mbeki", contactEmail: "d.mbeki@pinevalley.edu", contactPhone: "(503) 555-0121", submittedAt: "2026-03-20T10:05:00Z", totalLives: 142, employeeCount: 108, spouseCount: 24, childrenCount: 10, maleCount: 48, femaleCount: 94, averageAge: 45.2, riskScore: 1.15, riskTier: "standard", status: "not_approved", adminNotes: "Loss ratio above threshold for preferred tier." },
    { id: "j6k7l8m9n0", companyName: "Oakwood Home Services", contactName: "Ren Tanaka", contactEmail: "ren@oakwoodhome.com", contactPhone: "(602) 555-0156", submittedAt: "2026-04-02T15:40:00Z", totalLives: 38, employeeCount: 28, spouseCount: 8, childrenCount: 2, maleCount: 22, femaleCount: 16, averageAge: 36.4, riskScore: 0.88, riskTier: "preferred", status: "proposal_sent" },
  ],
  users: [
    { id: "u-1", fullName: "Priya Shah", email: "priya@cedarridgedental.com", companyName: "Cedar Ridge Dental", phone: "(248) 555-0142", role: "client", verified: true, createdAt: "2025-11-04" },
    { id: "u-2", fullName: "Kai Alvarez", email: "kai.alvarez@northfieldmfg.com", companyName: "Northfield Manufacturing", phone: "(734) 555-0198", role: "client", verified: true, createdAt: "2025-09-12" },
    { id: "u-3", fullName: "Jules Harper", email: "jharper@harperdean.law", companyName: "Harper & Dean Legal", phone: "(212) 555-0167", role: "client", verified: true, createdAt: "2025-10-22" },
    { id: "u-4", fullName: "Sam Ohene", email: "s.ohene@brightlinelog.com", companyName: "Brightline Logistics", phone: "(312) 555-0184", role: "client", verified: false, createdAt: "2026-01-18" },
    { id: "u-5", fullName: "Alex Thal", email: "alex.thal@meridiansoft.io", companyName: "Meridian Software Co.", phone: "(415) 555-0179", role: "client", verified: true, createdAt: "2025-08-03" },
    { id: "u-6", fullName: "Jordan Reyes", email: "jordan@kennionadvisors.com", companyName: "Kennion Benefit Advisors", phone: "(801) 555-0100", role: "admin", verified: true, createdAt: "2024-03-15" },
    { id: "u-7", fullName: "Morgan Liu", email: "morgan@kennionadvisors.com", companyName: "Kennion Benefit Advisors", phone: "(801) 555-0101", role: "admin", verified: true, createdAt: "2024-05-02" },
  ],
  template: {
    uploaded: true,
    fileName: "Kennion_Rate_Calculator_v14.xlsm",
    fileSize: 2_458_112,
    uploadedAt: "2026-04-10T09:00:00Z",
    sheets: ["Summary", "Census", "Rates", "Proposal Output", "Actuarial Notes"],
  },
};

// Status config mirrors admin.tsx STATUS_OPTIONS
window.STATUS_OPTIONS = [
  { value: "census_uploaded", label: "Census Uploaded", badge: "blue", icon: "clock" },
  { value: "proposal_sent", label: "Proposal Sent", badge: "purple", icon: "alert" },
  { value: "proposal_accepted", label: "Proposal Accepted", badge: "green", icon: "check" },
  { value: "client", label: "Client", badge: "green", icon: "trending" },
  { value: "not_approved", label: "Not Approved", badge: "red", icon: "x" },
];
window.TIER_CONFIG = {
  preferred: { label: "Preferred Risk", color: "var(--green-700)" },
  standard: { label: "Standard Risk", color: "var(--blue-700)" },
  high: { label: "High Risk", color: "var(--red-700)" },
};
