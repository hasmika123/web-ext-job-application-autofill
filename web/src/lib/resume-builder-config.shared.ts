/**
 * The Resume Builder's settings TYPES and DECLARED DEFAULTS (Resume Builder DESIGN 9.1 / 15.1) - the
 * part of `resume-builder-config.ts` that is safe in the browser bundle. Client code (the editor reducer
 * reads its default limits here) imports this file; server code imports `@/lib/resume-builder-config`,
 * which re-exports all of it and adds the fetch. Nothing here reaches `@/lib/api` (it needs cookies).
 */
export type ResumeBuilderPlan = "FREE" | "PRO" | "AUTOPILOT";

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
  };
  ai: { suggestAutoRefresh: boolean; suggestStaleMinutes: number; rewriteMaxRefs: number };
  plan: ResumeBuilderPlan;
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
};

/** The API's declared defaults (`ResumeBuilderSettingKeys`), for when the API is unreachable. */
export const DEFAULT_BUILDER_CONFIG: ResumeBuilderConfig = {
  templates: { enabled: ["modern"], default: "modern", overrides: {}, popular: ["modern"] },
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
  features: { photo: true, docx: false, aiSuggestions: true, jobMatch: true, tailor: true, printLayout: true, pdfView: true },
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
};
