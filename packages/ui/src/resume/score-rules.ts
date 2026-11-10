/**
 * The Resume Score ruleset `v1` as DATA (Resume Builder DESIGN 11.3): the rule table (ids, groups,
 * default weights, tip copy), the published word lists the rules read, the checklist copy and the
 * default score settings. The evaluation lives in `score.ts`.
 *
 * Weights, group weights, the pass threshold and the band copy are SETTINGS (`resume.score.*`,
 * DESIGN 15): the editor reads them from the builder config and passes them to `scoreResume`. The
 * defaults below are what the API declares (`ResumeBuilderSettingKeys`) and what the tests use; a
 * parity test in `web` keeps this table and the web's `DEFAULT_BUILDER_CONFIG.score` equal.
 * Thresholds inside a rule (150 characters, 70 % of bullets ...) are part of the ruleset version and
 * live in `score.ts` next to the rule they belong to; a changed rule bumps `RULESET_VERSION`.
 */

export const RULESET_VERSION = "v1";

export const GROUP_IDS = ["G1", "G2", "G3", "G4", "G5", "G6"] as const;
export type GroupId = (typeof GROUP_IDS)[number];

export type RuleId =
  | "S1" | "S2" | "S3" | "S4" | "S5"
  | "E1" | "E2" | "E3" | "E4" | "E5" | "E6" | "E7"
  | "K1" | "K2" | "K3" | "K4" | "K5"
  | "F1" | "F2" | "F3" | "F4" | "F5" | "F6" | "F7"
  | "M1" | "M2" | "M3"
  | "A1" | "A2" | "A3" | "A4" | "A5";

export interface GroupMeta {
  id: GroupId;
  /** The group's name ("Summary"). */
  label: string;
  /** Default group weight (G6 only counts on ATS templates). */
  weight: number;
  /** The checklist line when the group passes / fails (exact copy, DESIGN 11.4). */
  passLabel: string;
  failLabel: string;
}

export const GROUPS: readonly GroupMeta[] = [
  { id: "G1", label: "Summary", weight: 15, passLabel: "Clear and compelling summary", failLabel: "Make your summary clearer" },
  { id: "G2", label: "Experience", weight: 25, passLabel: "Relevant work experience", failLabel: "Add relevant work experience" },
  { id: "G3", label: "Keywords", weight: 20, passLabel: "Good use of keywords", failLabel: "Add more keywords" },
  { id: "G4", label: "Format", weight: 20, passLabel: "Well-structured format", failLabel: "Fix the structure" },
  { id: "G5", label: "Results", weight: 20, passLabel: "Measurable results included", failLabel: "Add more measurable results" },
  { id: "G6", label: "ATS", weight: 10, passLabel: "ATS-ready formatting", failLabel: "Fix ATS formatting" },
];

export interface RuleMeta {
  id: RuleId;
  group: GroupId;
  /** Short kebab name from the table (for logs and the persisted record). */
  name: string;
  /** Default weight (integer 0-100). */
  weight: number;
  /** The TipsSheet copy. `<names>` (F3) and `N` (F4) are filled in by the evaluator. */
  tip: string;
}

export const RULES: readonly RuleMeta[] = [
  { id: "S1", group: "G1", name: "summary-present", weight: 4, tip: "Add a 2–3 sentence summary saying what you do and for whom." },
  { id: "S2", group: "G1", name: "summary-length", weight: 2, tip: "Keep the summary between 150 and 700 characters." },
  { id: "S3", group: "G1", name: "summary-skills", weight: 3, tip: "Mention two or three of your key skills in the summary." },
  { id: "S4", group: "G1", name: "summary-voice", weight: 2, tip: "Write the summary without 'I' or 'my'." },
  { id: "S5", group: "G1", name: "summary-signal", weight: 2, tip: "Say your role or years of experience in the first sentence." },

  { id: "E1", group: "G2", name: "has-experience", weight: 5, tip: "Add at least one role." },
  { id: "E2", group: "G2", name: "roles-labelled", weight: 3, tip: "Give every role a title and an employer." },
  { id: "E3", group: "G2", name: "roles-dated", weight: 3, tip: "Add start and end dates to every role." },
  { id: "E4", group: "G2", name: "bullets-per-role", weight: 4, tip: "Add 2–3 bullet points to your recent roles." },
  { id: "E5", group: "G2", name: "action-verbs", weight: 4, tip: "Start bullets with an action verb (Led, Built, Reduced…)." },
  { id: "E6", group: "G2", name: "bullet-length", weight: 2, tip: "Keep bullets between 8 and 30 words." },
  { id: "E7", group: "G2", name: "dates-consistent", weight: 2, tip: "Check the dates — a start is after its end." },

  { id: "K1", group: "G3", name: "skills-count", weight: 4, tip: "List at least 8 skills." },
  { id: "K2", group: "G3", name: "skills-in-context", weight: 4, tip: "Show your skills in action — mention them in bullets." },
  { id: "K3", group: "G3", name: "no-cliches", weight: 2, tip: "Replace buzzwords (team player, passionate…) with specifics." },
  { id: "K4", group: "G3", name: "headline", weight: 2, tip: "Add a job title under your name." },
  { id: "K5", group: "G3", name: "job-keywords", weight: 4, tip: "Cover more of the job's key skills." },

  { id: "F1", group: "G4", name: "contact", weight: 3, tip: "Add your email, phone and location." },
  { id: "F2", group: "G4", name: "link", weight: 1, tip: "Add your LinkedIn or portfolio link." },
  { id: "F3", group: "G4", name: "core-sections", weight: 4, tip: "Add the missing section: <names>." },
  { id: "F4", group: "G4", name: "fits-target", weight: 3, tip: "Still N pages — hide a section or shorten bullets." },
  { id: "F5", group: "G4", name: "no-empty", weight: 2, tip: "Remove empty entries and bullets." },
  { id: "F6", group: "G4", name: "date-precision", weight: 1, tip: "Use one date format everywhere (e.g. Mar 2022)." },
  { id: "F7", group: "G4", name: "bullet-max", weight: 2, tip: "Split bullets longer than 300 characters." },

  { id: "M1", group: "G5", name: "roles-with-metrics", weight: 5, tip: "Add a number to at least one bullet in each role." },
  { id: "M2", group: "G5", name: "bullets-with-metrics", weight: 4, tip: "Quantify more bullets — %, $, counts, time saved." },
  { id: "M3", group: "G5", name: "no-duty-phrasing", weight: 3, tip: "Replace 'responsible for' with what you achieved." },

  { id: "A1", group: "G6", name: "standard-headings", weight: 2, tip: "Use standard section headings." },
  { id: "A2", group: "G6", name: "allowed-marks", weight: 2, tip: "Remove italic/underline/links — ATS parsers drop them." },
  { id: "A3", group: "G6", name: "photo-off", weight: 1, tip: "Turn the photo off for ATS templates." },
  { id: "A4", group: "G6", name: "custom-within-limit", weight: 1, tip: "Fold extra custom sections into standard ones." },
  { id: "A5", group: "G6", name: "month-dates", weight: 2, tip: "Use month and year on every date." },
];

export const RULE_BY_ID: Readonly<Record<RuleId, RuleMeta>> = Object.freeze(
  Object.fromEntries(RULES.map((r) => [r.id, r])) as Record<RuleId, RuleMeta>,
);

/** A band of the score: from `min` (inclusive) upward, until the next band's `min`. */
export interface ScoreBand {
  min: number;
  title: string;
  body: string;
}

/** The `resume.score.*` settings (the builder config's `score` block). */
export interface ScoreConfig {
  /** Which ruleset the weights belong to; `scoreResume` evaluates the one it implements (`RULESET_VERSION`). */
  rulesetVersion: string;
  groupWeights: Record<string, number>;
  weights: Record<string, number>;
  /** A group passes (green tick) at `fraction >= passThreshold`. */
  passThreshold: number;
  bands: ScoreBand[];
}

/** The declared defaults of the v1 ruleset (what the API's `ResumeBuilderSettingKeys` declares). */
export const DEFAULT_SCORE_CONFIG: ScoreConfig = {
  rulesetVersion: RULESET_VERSION,
  groupWeights: Object.fromEntries(GROUPS.map((g) => [g.id, g.weight])),
  weights: Object.fromEntries(RULES.map((r) => [r.id, r.weight])),
  passThreshold: 0.7,
  bands: [
    { min: 80, title: "Great match!", body: "Your resume is well-optimized and ready to impress." },
    { min: 60, title: "Good progress", body: "A few fixes will make it stand out." },
    { min: 40, title: "Getting there", body: "Follow the tips below to strengthen it." },
    { min: 0, title: "Needs work", body: "Start with the checklist below." },
  ],
};

/* ── word lists and patterns the rules read ─────────────────────────────────────────────────── */

/** Anything that reads as a number: a digit, %, $, euro, pound. */
export const METRIC = /\d|%|\$|€|£/;

/** A bullet that opens with a duty phrase instead of an achievement. */
export const DUTY = /^(responsible for|duties included|tasked with|worked on)\b/i;

/** Buzzwords that say nothing; matched as whole words/phrases, any case. */
export const CLICHES: readonly string[] = [
  "team player",
  "hard-working",
  "hardworking",
  "results-driven",
  "detail-oriented",
  "go-getter",
  "synergy",
  "think outside the box",
  "self-starter",
  "passionate",
  "dynamic",
  "guru",
  "ninja",
  "rockstar",
];

/** The first-person words S4 refuses in a summary. */
export const FIRST_PERSON = /\b(I|my|me)\b/i;

/** "7+ years", "5 yrs" - S5's years-of-experience signal. */
export const YEARS_SIGNAL = /\d+\+?\s*(years|yrs)/i;

/** The published past-tense action-verb list (E5); lower-case, letters only. */
export const ACTION_VERBS: ReadonlySet<string> = new Set(
  (
    "led drove partnered launched conducted built designed shipped grew reduced increased managed owned delivered created improved " +
    "developed implemented migrated mentored negotiated analysed analyzed optimised optimized automated architected coordinated " +
    "defined established executed generated initiated introduced maintained orchestrated overhauled planned produced published " +
    "redesigned refactored researched resolved scaled secured spearheaded streamlined supported tested trained transformed wrote " +
    "accelerated achieved acquired adapted administered advised advocated aligned allocated amplified applied appraised approved " +
    "arranged assembled assessed assigned assisted attained audited authored boosted brokered budgeted calculated captured " +
    "centralized championed clarified coached collaborated compiled completed composed configured consolidated constructed " +
    "consulted converted convinced cultivated customized debugged decreased delegated demonstrated deployed derived detected " +
    "determined devised diagnosed directed discovered distributed documented doubled drafted earned edited educated eliminated " +
    "enabled encouraged engineered enhanced ensured evaluated exceeded expanded expedited facilitated finalized forecasted " +
    "formulated fostered founded gained governed guided handled headed identified illustrated influenced informed innovated " +
    "inspected installed instituted integrated interpreted interviewed invented investigated joined judged launched leveraged " +
    "lifted mapped marketed maximized measured mediated merged minimized mobilized modeled modernized monitored motivated navigated " +
    "negotiated normalized observed obtained onboarded operated organized outperformed oversaw performed pioneered piloted " +
    "prepared presented prioritized processed procured programmed promoted prototyped provided queried raised ranked rebuilt " +
    "recommended reconciled recruited rectified recovered reengineered refined rehabilitated reinforced rejuvenated renegotiated " +
    "reorganized replaced reported represented restructured retained revamped reviewed revised revitalized rolled saved " +
    "scheduled selected served simplified sold solved sourced standardized steered strengthened structured studied supervised " +
    "surpassed synchronized synthesized targeted taught tracked traded translated tripled troubleshot unified updated upgraded " +
    "validated verified visualized won"
  ).split(/\s+/),
);

/** The `data-field` ref of an "add this section" call to action (a rule whose fix is a missing section). */
export const ADD_REF_PREFIX = "add:";
