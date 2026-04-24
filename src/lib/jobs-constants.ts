/** App-level enums (must match Supabase / blueprint). */
export const EMPLOYMENT_TYPES = [
  "In-Semester Internship",
  "Summer Internship",
  "Full-Time",
  "Contract/Freelance",
] as const;

export const POSITIONS = [
  "Corporate Development",
  "Product Management",
  "Consulting",
  "Engineering",
  "Operations",
  "Finance",
  "Marketing",
  "Other",
] as const;

export const VERTICAL_TAGS = [
  "TradFi",
  "DeFi",
  "Crypto",
  "AI Infrastructure",
  "General Tech",
  "Healthcare",
  "Other",
] as const;

export const VISA_SPONSORSHIP = ["Yes", "No", "Unspecified"] as const;

export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];
export type Position = (typeof POSITIONS)[number];
export type VerticalTag = (typeof VERTICAL_TAGS)[number];
export type VisaSponsorship = (typeof VISA_SPONSORSHIP)[number];
