/**
 * Answer lists and profile keys shared by the profile editor (`BioEditor`) and onboarding
 * (`/welcome`). The values are what the extension fills into application forms, so both
 * surfaces must write the same strings (the dossier "no guessing" rule).
 */

export type Bio = Record<string, unknown>;

export const YESNO = ["Yes", "No"];

// Job preferences (Phase 10.3a). Fixed lists where the answer is a choice, so the value the
// extension fills is one an application's own dropdown is likely to offer word for word.
export const NOTICE = ["Immediately", "1 week", "2 weeks", "3 weeks", "1 month", "2 months", "3 months"];
export const WORK_PREFERENCE = ["Remote", "Hybrid", "On-site"];

export const GENDERS = ["Male", "Female", "Non-binary", "Prefer not to say"];
export const HISPANIC = ["Yes", "No", "Prefer not to say"];
export const RACES = [
  "American Indian or Alaska Native", "Asian", "Black or African American",
  "Hispanic or Latino", "Native Hawaiian or Other Pacific Islander", "White",
  "Two or More Races", "Prefer not to say",
];
export const VETERAN = [
  "I am not a protected veteran",
  "I identify as one or more classifications of a protected veteran",
  "Prefer not to say",
];
export const DISABILITY = [
  "Yes, I have a disability (or previously had one)",
  "No, I do not have a disability",
  "Prefer not to answer",
];

/** Human names for the profile fields a suggestion can be about (Phase 10.3e). */
export const FIELD_LABELS: Record<string, string> = {
  firstName: "First name",
  lastName: "Last name",
  preferredName: "Preferred name",
  email: "Email",
  phone: "Phone",
  addressLine1: "Address",
  addressLine2: "Address line 2",
  city: "City",
  state: "State / Province",
  postalCode: "Postal code",
  country: "Country",
  linkedin: "LinkedIn",
  github: "GitHub",
  website: "Website",
  authorizedToWork: "Authorized to work",
  requireSponsorship: "Needs sponsorship",
  desiredSalary: "Desired salary",
  noticePeriod: "Notice period",
  earliestStartDate: "Earliest start date",
  workPreference: "Work preference",
  willingToRelocate: "Willing to relocate",
  referralSource: "How you usually hear about jobs",
};

/** Fields answered from a fixed list — editing a suggestion for one offers the same list. */
export const FIELD_OPTIONS: Record<string, string[]> = {
  authorizedToWork: YESNO,
  requireSponsorship: YESNO,
  willingToRelocate: YESNO,
  noticePeriod: NOTICE,
  workPreference: WORK_PREFERENCE,
};

/**
 * Set (ISO time) when the user finishes OR skips onboarding. Lives in the bio payload like
 * everything else; the extension ignores it (its fill whitelist doesn't include it).
 */
export const ONBOARDED_KEY = "onboardedAt";

/** Parse the server's opaque `payload` into a bio object; anything unreadable is an empty bio. */
export function parseBioPayload(dto: { payload?: string } | null): Bio {
  if (!dto?.payload) return {};
  try {
    const parsed = JSON.parse(dto.payload);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Bio) : {};
  } catch {
    return {};
  }
}

// ---- "Start fresh" guided profile setup (Resume Builder R1.5) ------------------------------------

/** What the person is looking for: the first question of the guided setup (chips, one pick). */
export const FRESH_GOALS = [
  { id: "internship", label: "An internship" },
  { id: "first-job", label: "My first job" },
  { id: "switch", label: "Switching to a new kind of role" },
  { id: "same", label: "The same role at a new company" },
] as const;

export type FreshGoalId = (typeof FRESH_GOALS)[number]["id"];

/** Goals for people with little or no work history: study comes before work in the guided order. */
export const STUDY_FIRST_GOALS: readonly FreshGoalId[] = ["internship", "first-job"];

/** One-tap headline starters per goal; the person can type anything instead. */
export const HEADLINE_SUGGESTIONS: Record<FreshGoalId, string[]> = {
  internship: ["Student seeking an internship", "Computer science student looking for a summer internship", "Business student seeking a marketing internship"],
  "first-job": ["Recent graduate seeking an entry-level role", "Motivated graduate looking for a first role", "Entry-level candidate with customer service experience"],
  switch: ["Career changer moving into a new field", "Experienced professional exploring a new direction", "Transferable skills, ready for a new role"],
  same: ["Experienced professional looking for a new opportunity", "Results-driven specialist open to new roles", "Team player with a track record of delivery"],
};

/**
 * Skill suggestions by what the headline (and the roles) talk about: a family matches when any of its
 * keywords starts a word in the text. Curated, short and generic on purpose; they are offered as
 * one-tap chips and nothing is added unless the person taps it.
 */
export const SKILL_FAMILIES: { keywords: string[]; skills: string[] }[] = [
  { keywords: ["software", "developer", "engineer", "programmer", "computer science", "web", "frontend", "backend", "full stack"], skills: ["JavaScript", "Python", "Git", "SQL", "HTML & CSS", "REST APIs", "Problem solving", "Debugging"] },
  { keywords: ["data", "analyst", "analytics", "statistic", "research"], skills: ["SQL", "Excel", "Python", "Data visualization", "Tableau", "Statistics", "Reporting", "Attention to detail"] },
  { keywords: ["design", "ux", "ui", "creative", "graphic"], skills: ["Figma", "Wireframing", "Prototyping", "User research", "Adobe Creative Suite", "Typography", "Visual design"] },
  { keywords: ["market", "social media", "content", "brand", "seo", "copywrit"], skills: ["Social media", "Content writing", "SEO", "Email marketing", "Google Analytics", "Canva", "Copywriting"] },
  { keywords: ["sales", "account executive", "business development", "retail", "store"], skills: ["Customer relationships", "Negotiation", "CRM software", "Cold outreach", "Product knowledge", "Upselling"] },
  { keywords: ["customer", "support", "service", "barista", "server", "cashier", "hospitality", "front desk"], skills: ["Customer service", "Communication", "Conflict resolution", "Cash handling", "Teamwork", "Time management"] },
  { keywords: ["finance", "accountant", "accounting", "bookkeep", "audit", "bank"], skills: ["Excel", "Bookkeeping", "Financial reporting", "QuickBooks", "Budgeting", "Attention to detail"] },
  { keywords: ["project", "product", "operations", "program", "coordinator", "administrat", "assistant"], skills: ["Project planning", "Scheduling", "Stakeholder communication", "Microsoft Office", "Organization", "Documentation"] },
  { keywords: ["teach", "tutor", "educat", "instructor"], skills: ["Lesson planning", "Public speaking", "Mentoring", "Classroom management", "Curriculum design"] },
  { keywords: ["nurs", "health", "caregiver", "clinic", "medical", "patient"], skills: ["Patient care", "Medical records", "Compassion", "Teamwork", "CPR", "Time management"] },
];

/** Skills that suit almost any first resume; offered when nothing in the text matches a family. */
export const GENERAL_SKILLS = ["Communication", "Teamwork", "Problem solving", "Time management", "Microsoft Office", "Adaptability"];

/**
 * Skills to offer for some free text (the headline plus the role titles). Every family with a keyword
 * that starts a word in the text contributes; with no match the general list is offered.
 * Case-insensitive, de-duplicated, in family order.
 */
export function suggestSkills(text: string): string[] {
  const t = text.toLowerCase();
  const startsAWord = (kw: string) => new RegExp(`(^|[^a-z])${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(t);
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (s: string) => {
    if (!seen.has(s.toLowerCase())) {
      seen.add(s.toLowerCase());
      out.push(s);
    }
  };
  for (const family of SKILL_FAMILIES) if (family.keywords.some(startsAWord)) family.skills.forEach(add);
  if (out.length === 0) GENERAL_SKILLS.forEach(add);
  return out;
}
