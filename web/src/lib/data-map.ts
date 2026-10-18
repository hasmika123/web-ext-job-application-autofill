/**
 * "What we store" (E2E-U14.0): the typed data map behind Settings > Privacy. Each entry names what is kept, why, who can
 * see it and for how long, in plain words. It mirrors the Privacy Policy (`/privacy`), which stays the legal text; when a
 * table or a retention rule changes, this list changes with it (`panels.test.tsx` checks that every entry is rendered
 * and says all four things).
 *
 * Retention is stated as a rule, not a number, unless the policy itself states one (mail: 12 months; job matches: 7 days),
 * because the tunable periods are admin settings and a copy of them here would drift.
 */

export interface DataMapEntry {
  /** Stable id, used as the React key and in tests. */
  id: string;
  /** What the user calls it. */
  label: string;
  /** The database tables behind it (for the team; not shown to the user). */
  tables: readonly string[];
  /** Why we keep it. */
  purpose: string;
  /** Who can see it. */
  whoSees: string;
  /** How long it is kept. */
  retention: string;
}

export const DATA_MAP: readonly DataMapEntry[] = [
  {
    id: "account",
    label: "Your account",
    tables: ["jhi_user", "refresh_token"],
    purpose: "Your username, email and name, so you can sign in and we can reach you.",
    whoSees: "You. Kiwiply admins see labels and status, not your content.",
    retention: "Until you delete your account.",
  },
  {
    id: "profile",
    label: "Your profile",
    tables: ["bio", "profile_item", "onboarding_draft"],
    purpose: "The details autofill uses: contact info, links, work history, education, skills and your setup in progress.",
    whoSees: "You, and the Kiwiply extension on your devices. Nobody else unless you share a resume.",
    retention: "Until you delete your account. An unfinished setup clears itself if you never come back.",
  },
  {
    id: "resumes",
    label: "Resumes",
    tables: ["resume", "resume_doc", "resume_doc_version", "resume_access", "resume_view_event"],
    purpose: "The files you save, the resumes you build here, their earlier versions, and who you shared them with.",
    whoSees: "You, plus the people or organization you choose to share a resume with.",
    retention: "Until you delete the resume or your account. Share links stop working when you turn them off.",
  },
  {
    id: "applications",
    label: "Applications",
    tables: ["application", "application_event", "fill_event"],
    purpose: "The jobs you saved or applied to, their status and notes, so your board stays up to date, and who changed what and when.",
    whoSees: "You. Kiwiply admins see counts and status.",
    retention: "Until you delete them or your account. The history of an application is kept as long as the application exists, unless Kiwiply sets a shorter limit.",
  },
  {
    id: "learned",
    label: "Answers autofill learned",
    tables: ["field_cache", "ai_answer", "profile_suggestion"],
    purpose: "Answers you gave on applications, so the next one is faster, and suggestions to add them to your profile.",
    whoSees: "You only. We never store the address of the page, and never self-identification answers.",
    retention: "Until you remove them or delete your account.",
  },
  {
    id: "ai-reports",
    label: "AI reports (Pro)",
    tables: ["job_match", "resume_match", "job_fit", "resume_tailor"],
    purpose: "Scores, one-line reasons and rewording suggestions you asked for. Never the job text or your resume text.",
    whoSees: "You.",
    retention: "Until you delete your account. Job matches go after at most 7 days.",
  },
  {
    id: "ai-usage",
    label: "AI usage",
    tables: ["ai_usage", "ai_call"],
    purpose: "How much AI you used, so the meter on this page is right. Counts and cost only, never what was said.",
    whoSees: "You see your meter. Kiwiply admins see totals.",
    retention: "Counts go with your account. The cost record stays, with your name removed.",
  },
  {
    id: "inbox",
    label: "Inbox (Pro)",
    tables: ["inbox_connection", "inbox_folder_state", "inbox_message"],
    purpose: "If you connect a Gmail: its address, an encrypted app password, and mail about your job search, to update your board. Never attachments. We only read.",
    whoSees: "You. Nobody at Kiwiply reads your mail.",
    retention: "Mail is kept for 12 months after it was sent. Disconnecting deletes everything we read.",
  },
  {
    id: "notifications",
    label: "Notifications and preferences",
    tables: ["notification", "notification_preference"],
    purpose: "The notices in your bell and the switches, quiet hours and time zone you set here.",
    whoSees: "You.",
    retention: "Until you delete your account.",
  },
  {
    id: "organization",
    label: "Organization membership",
    tables: ["org_member"],
    purpose: "If you join a school or company: your seat, your role and when you joined.",
    whoSees: "You and that organization's admins. Only what you consent to share, nothing more.",
    retention: "While you are a member. Your name is removed from the record when you leave or delete your account.",
  },
  {
    id: "billing",
    label: "Plan and billing status",
    tables: ["subscription", "stripe_event"],
    purpose: "Your plan, its status and renewal date. Cards are handled by Stripe, so we never see or keep a card number.",
    whoSees: "You, Kiwiply admins (plan and status), and Stripe for the payment itself.",
    retention: "While your account exists. Payment records can be kept longer where tax rules require it, without your profile.",
  },
  {
    id: "bug-reports",
    label: "Reports you send us",
    tables: ["bug_report"],
    purpose: "Your message, and the page address and browser details only if you leave that box ticked.",
    whoSees: "The Kiwiply team.",
    retention: "No longer than needed to fix and improve the product.",
  },
];

/** What we never collect (product-wide rule); stated plainly beside the map. */
export const NEVER_COLLECTED: readonly string[] = [
  "Social Security or tax ID numbers",
  "Bank account or routing numbers",
  "Passport, visa or ID document numbers",
  "Your date of birth",
  "Card numbers (Stripe holds those, not us)",
];
