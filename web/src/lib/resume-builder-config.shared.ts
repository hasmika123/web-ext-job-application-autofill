/**
 * The Resume Builder's settings TYPES and DECLARED DEFAULTS (Resume Builder DESIGN 9.1 / 15.1) - the
 * part of `resume-builder-config.ts` that is safe in the browser bundle. Client code (the editor reducer
 * reads its default limits here) imports this file; server code imports `@/lib/resume-builder-config`,
 * which re-exports all of it and adds the fetch. Nothing here reaches `@/lib/api` (it needs cookies).
 */
export type ResumeBuilderPlan = "FREE" | "PRO" | "AUTOPILOT";

/**
 * What this builder session may do, decided by the API for the request (personal, a consultant inside an organization, or a marketer acting for a consultant).
 * The ONE builder reads it and hides or disables controls accordingly; the API refuses the same actions (404 / 409 / 402), so this is never the only wall.
 */
export type BuilderCapabilities = {
  mode: "personal" | "consultant" | "marketer-act-for";
  /** Recruiter links and named people. */
  shareLinks: boolean;
  deleteResume: boolean;
  archiveResume: boolean;
  setPrimary: boolean;
  rename: boolean;
  duplicate: boolean;
  /** Restore a version, save a named version. */
  versionRestore: boolean;
  downloadOriginal: boolean;
  /** AI rewrite / summary / suggestions. When false the controls are not drawn at all (no upsell either). */
  ai: boolean;
  tailor: boolean;
  /** Shown next to the save state ("Pending consultant approval"), or null. */
  approvalNotice: string | null;
};

/** The personal product: everything the builder has always offered (an API that predates `capabilities` is the personal product too). */
export const PERSONAL_CAPABILITIES: BuilderCapabilities = {
  mode: "personal",
  shareLinks: true,
  deleteResume: true,
  archiveResume: true,
  setPrimary: true,
  rename: true,
  duplicate: true,
  versionRestore: true,
  downloadOriginal: true,
  ai: true,
  tailor: true,
  approvalNotice: null,
};

export const capabilitiesOf = (config: { capabilities?: BuilderCapabilities | null }): BuilderCapabilities => config.capabilities ?? PERSONAL_CAPABILITIES;

export type ResumeBuilderBand = { min: number; title: string; body: string };

export type ResumeBuilderConfig = {
  templates: {
    /** Template ids offered in the picker. */
    enabled: string[];
    default: string;
    /** Per-template partial `TemplateCapabilities`; they may only tighten (DESIGN 6.3). */
    overrides: Record<string, Record<string, unknown>>;
    /** Template ids the Popular Templates strip shows first, in this order (`resume.templates.popular`). */
    popular: string[];
  };
  limits: {
    sections: number;
    items: number;
    bullets: number;
    bulletChars: number;
    summaryChars: number;
    marks: number;
    docBytes: number;
  };
  score: {
    rulesetVersion: string;
    /** Rule id to weight. */
    weights: Record<string, number>;
    /** Group id (G1..G6) to weight. */
    groupWeights: Record<string, number>;
    passThreshold: number;
    bands: ResumeBuilderBand[];
  };
  match: {
    weights: { skills: number; title: number; years: number; industry: number; education: number };
    keySkillsCount: number;
    thresholds: { keySkills: number; experience: number; industry: number };
    maxJdChars: number;
    embeddings: boolean;
  };
  theme: { accentPalette: string[] };
  features: {
    photo: boolean;
    docx: boolean;
    aiSuggestions: boolean;
    jobMatch: boolean;
    tailor: boolean;
    printLayout: boolean;
    pdfView: boolean;
    /** Revocable share links are on (R3.11): the header hides "Shared with Recruiters" when off. */
    shareLinks: boolean;
  };
  ai: { suggestAutoRefresh: boolean; suggestStaleMinutes: number; rewriteMaxRefs: number };
  plan: ResumeBuilderPlan;
  /** Role-based restrictions of this session (absent on an API that predates them: the personal product). */
  capabilities?: BuilderCapabilities;
  /** The plan has builder AI. The web shows locks from this, never from plan names. */
  aiAllowed: boolean;
  /** Live (non-archived) resumes and the plan's cap. */
  resumes: { count: number; max: number };
  /**
   * Common Profile limits (R1.1, R1.4): bytes per item, live items per user, items per import call;
   * characters per bio value / summary an import writes; the dashboard setup card's completeness
   * threshold (percent); the resume file upload cap in bytes.
   */
  profile: {
    itemMaxBytes: number;
    maxItemsPerUser: number;
    maxImportItems: number;
    bioValueMaxChars: number;
    bioSummaryMaxChars: number;
    setupPromptBelowPercent: number;
    uploadMaxBytes: number;
  };
  /** The My Resumes page (R2.6): Quick Tips lines, and the card count above which the grid shows a page at a time. */
  list: { quickTips: string[]; virtualizeAbove: number };
  /** PDF settings the editor reads (R3.3): how long Save & Download waits for the stored PDF (ms); whether the PDF view re-renders by itself. */
  pdf: { waitMs: number; viewAutoRefresh: boolean };
  /**
   * Sharing limits and defaults (R3.10, R3.12): active links and named people per resume; a new link's lifetime in days
   * (0 = no expiry) and whether a new link allows the PDF download.
   */
  share: { maxLinks: number; maxGrants: number; linkDefaultDays: number; allowDownloadDefault: boolean };
  /** Version history retention (R3.10): automatic versions kept per resume; named ones are kept always. */
  versions: { retentionAuto: number };
  /**
   * Onboarding v2 (R1.8, ONBOARDING-V2-DESIGN 9 / 11): the `feature.onboarding_v2.enabled` switch, the "~N min" label,
   * seconds per step (hello, source, review, skills, you, prefs) behind "about N min left", the draft cap in bytes, the
   * dashboard card's timings, the flair switches, whether the persona step is asked and the payoff screen's next actions.
   */
  onboarding: {
    enabled: boolean;
    estimateMinutes: number;
    stepSeconds: Record<string, number>;
    draftMaxBytes: number;
    card: { snoozeDays: number; resurfaceBelowPercent: number; resurfaceAfterDays: number; maxResurfaces: number };
    confetti: boolean;
    mascot: boolean;
    personaStep: boolean;
    payoffActions: string[];
    /**
     * The delight layer (R1.14, ONBOARDING-DELIGHT-DESIGN 8): `enabled` is the whole layer (off gives the plain v2 flow); the
     * other switches gate one feature each; `interstitialMs` is the interstitial's wait (0 = none) and `interstitials` which
     * sections get it; `copy` overrides the copy deck by key. Absent on an API that predates it: read through `delightOf`.
     */
    delight?: OnboardingDelightConfig;
  };
};

/** `config.onboarding.delight` (DELIGHT 8). */
export type OnboardingDelightConfig = {
  enabled: boolean;
  haptics: boolean;
  combo: boolean;
  highlights: boolean;
  milestones: boolean;
  interstitialMs: number;
  interstitials: string[];
  barRider: boolean;
  share: boolean;
  copy: Record<string, string | string[]>;
};

/** The API's declared delight defaults (`ResumeBuilderSettingKeys`). */
export const DEFAULT_DELIGHT_CONFIG: OnboardingDelightConfig = {
  enabled: true,
  haptics: true,
  combo: true,
  highlights: true,
  milestones: true,
  interstitialMs: 1200,
  interstitials: ["review"],
  barRider: false,
  share: true,
  copy: {},
};

/** The delight settings of a config, field by field over the defaults (an older API, or a test config, may omit some). */
export function delightOf(config: { onboarding?: { delight?: Partial<OnboardingDelightConfig> } } | null | undefined): OnboardingDelightConfig {
  return { ...DEFAULT_DELIGHT_CONFIG, ...(config?.onboarding?.delight ?? {}) };
}

/** The API's declared defaults (`ResumeBuilderSettingKeys`), for when the API is unreachable. */
export const DEFAULT_BUILDER_CONFIG: ResumeBuilderConfig = {
  templates: { enabled: ["modern", "classic", "compact", "simple", "engineer", "consultant", "scholar", "executive", "statement", "sidebar"], default: "modern", overrides: {}, popular: ["modern"] },
  limits: { sections: 20, items: 40, bullets: 12, bulletChars: 600, summaryChars: 2000, marks: 64, docBytes: 262144 },
  score: {
    rulesetVersion: "v1",
    weights: {
      S1: 4, S2: 2, S3: 3, S4: 2, S5: 2,
      E1: 5, E2: 3, E3: 3, E4: 4, E5: 4, E6: 2, E7: 2,
      K1: 4, K2: 4, K3: 2, K4: 2, K5: 4,
      F1: 3, F2: 1, F3: 4, F4: 3, F5: 2, F6: 1, F7: 2,
      M1: 5, M2: 4, M3: 3,
      A1: 2, A2: 2, A3: 1, A4: 1, A5: 2,
    },
    groupWeights: { G1: 15, G2: 25, G3: 20, G4: 20, G5: 20, G6: 10 },
    passThreshold: 0.7,
    bands: [
      { min: 80, title: "Great match!", body: "Your resume is well-optimized and ready to impress." },
      { min: 60, title: "Good progress", body: "A few fixes will make it stand out." },
      { min: 40, title: "Getting there", body: "Follow the tips below to strengthen it." },
      { min: 0, title: "Needs work", body: "Start with the checklist below." },
    ],
  },
  match: {
    weights: { skills: 50, title: 15, years: 10, industry: 15, education: 10 },
    keySkillsCount: 10,
    thresholds: { keySkills: 0.7, experience: 0.6, industry: 0.6 },
    maxJdChars: 8000,
    embeddings: false,
  },
  theme: { accentPalette: ["#16a34a", "#2563eb", "#7c3aed", "#ec4899", "#f97316", "#eab308"] },
  features: { photo: true, docx: false, aiSuggestions: true, jobMatch: true, tailor: true, printLayout: true, pdfView: true, shareLinks: true },
  ai: { suggestAutoRefresh: false, suggestStaleMinutes: 10, rewriteMaxRefs: 12 },
  plan: "FREE",
  aiAllowed: false,
  resumes: { count: 0, max: 3 },
  profile: {
    itemMaxBytes: 16384,
    maxItemsPerUser: 500,
    maxImportItems: 200,
    bioValueMaxChars: 500,
    bioSummaryMaxChars: 2000,
    setupPromptBelowPercent: 40,
    uploadMaxBytes: 10485760,
  },
  list: {
    quickTips: [
      "Create different resumes for different roles",
      "Tailor your resume for each job application",
      "Use AI suggestions to improve your content",
      "Keep one primary resume for quick applications",
    ],
    virtualizeAbove: 60,
  },
  pdf: { waitMs: 30000, viewAutoRefresh: false },
  share: { maxLinks: 3, maxGrants: 20, linkDefaultDays: 30, allowDownloadDefault: false },
  versions: { retentionAuto: 30 },
  onboarding: {
    enabled: true,
    estimateMinutes: 2,
    stepSeconds: { hello: 10, source: 40, review: 45, skills: 20, you: 15, prefs: 30 },
    draftMaxBytes: 262144,
    card: { snoozeDays: 3, resurfaceBelowPercent: 20, resurfaceAfterDays: 14, maxResurfaces: 2 },
    confetti: true,
    mascot: true,
    personaStep: true,
    payoffActions: ["build_resume", "install_extension", "find_jobs"],
    delight: {
      enabled: true,
      haptics: true,
      combo: true,
      highlights: true,
      milestones: true,
      interstitialMs: 1200,
      interstitials: ["review"],
      barRider: false,
      share: true,
      copy: {},
    },
  },
};
