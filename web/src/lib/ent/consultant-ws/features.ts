import { shortDate, type Tone } from "./home";

/**
 * "My Features" client logic (design/enterprise-consultant/features.webp): the wire types of
 * `GET /api/orgs/{orgId}/me-workspace/features`, a tolerant parser and the pure helpers the page uses. Nothing here touches React.
 *
 * Rules the page keeps:
 *   - every figure comes from the API's answer; there is no fallback number in this file;
 *   - status and allowance are admin inputs in the real product (EntitlementService); until that admin catalog and this role merge they are
 *     demo stand-ins the API flags `sample`, drawn with a "Sample" marker. Usage is real where the product records the action; a feature
 *     with no metered action reports `used: null` and the page says so instead of inventing a number;
 *   - the consultant never sees a price, a margin or a billing figure.
 */

export type FeatureStatus = "ENABLED" | "DISABLED" | "NOT_AVAILABLE";
export type FeatureTone = "accent" | "violet" | "green" | "amber" | "coral" | "pink" | "teal";
export type FeatureIcon = "search" | "file" | "video" | "mail" | "sparkles";

export interface FeatureRow {
  key: string;
  title: string;
  description: string;
  tone: FeatureTone;
  icon: FeatureIcon;
  status: FeatureStatus;
  premium: boolean;
  allowance: number | null;
  used: number | null;
  usedLastMonth: number | null;
  unit: string;
  usedNote: string;
  resetsOn: string | null;
  href: string;
  actionLabel: string;
  overview: boolean;
  sample: boolean;
}

export interface FeatureTiles {
  active: number;
  activeSample: boolean;
  creditsLeft: number | null;
  creditsTotal: number | null;
  creditsSample: boolean;
  usedThisMonth: number;
  usedDeltaPct: number | null;
  premium: number;
  premiumSample: boolean;
  expiringSoon: number;
  renewsOn: string | null;
  expiringSample: boolean;
}

export interface FeaturesView {
  orgId: number;
  generatedAt: string;
  name: string;
  entitlementsSample: boolean;
  tiles: FeatureTiles;
  features: FeatureRow[];
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown, d = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : d);
const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown, d = ""): string => (typeof v === "string" ? v : d);
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

const STATUSES: readonly string[] = ["ENABLED", "DISABLED", "NOT_AVAILABLE"];
const TONES_OK: readonly string[] = ["accent", "violet", "green", "amber", "coral", "pink", "teal"];
const ICONS_OK: readonly string[] = ["search", "file", "video", "mail", "sparkles"];

function parseFeature(o: unknown): FeatureRow | null {
  if (!isObj(o) || typeof o.key !== "string" || typeof o.title !== "string") return null;
  const href = str(o.href);
  return {
    key: o.key,
    title: o.title,
    description: str(o.description),
    tone: (TONES_OK.includes(str(o.tone)) ? o.tone : "accent") as FeatureTone,
    icon: (ICONS_OK.includes(str(o.icon)) ? o.icon : "sparkles") as FeatureIcon,
    status: (STATUSES.includes(str(o.status)) ? o.status : "NOT_AVAILABLE") as FeatureStatus,
    premium: o.premium === true,
    allowance: numOrNull(o.allowance),
    used: numOrNull(o.used),
    usedLastMonth: numOrNull(o.usedLastMonth),
    unit: str(o.unit),
    usedNote: str(o.usedNote),
    resetsOn: strOrNull(o.resetsOn),
    href: href.startsWith("/w/consultant/") ? href : "/w/consultant/features",
    actionLabel: str(o.actionLabel, "View"),
    overview: o.overview === true,
    sample: o.sample === true,
  };
}

/** The body as a view, or null when it is not the contract. Rows that do not match are dropped, never guessed. */
export function parseFeatures(body: unknown): FeaturesView | null {
  if (!isObj(body) || typeof body.orgId !== "number" || !isObj(body.tiles) || !Array.isArray(body.features)) return null;
  const t = body.tiles;
  return {
    orgId: body.orgId,
    generatedAt: str(body.generatedAt),
    name: str(body.name),
    entitlementsSample: body.entitlementsSample === true,
    tiles: {
      active: num(t.active),
      activeSample: t.activeSample === true,
      creditsLeft: numOrNull(t.creditsLeft),
      creditsTotal: numOrNull(t.creditsTotal),
      creditsSample: t.creditsSample === true,
      usedThisMonth: num(t.usedThisMonth),
      usedDeltaPct: numOrNull(t.usedDeltaPct),
      premium: num(t.premium),
      premiumSample: t.premiumSample === true,
      expiringSoon: num(t.expiringSoon),
      renewsOn: strOrNull(t.renewsOn),
      expiringSample: t.expiringSample === true,
    },
    features: body.features.map(parseFeature).filter((f): f is FeatureRow => f !== null),
  };
}

/* ── pure helpers ───────────────────────────────────────────────────────────────────── */

export const STATUS_PILL: Record<FeatureStatus, { label: string; tone: Tone }> = {
  ENABLED: { label: "Enabled", tone: "green" },
  DISABLED: { label: "Disabled", tone: "slate" },
  NOT_AVAILABLE: { label: "Not available", tone: "amber" },
};

/** Share of the allowance used, 0..1; null when unlimited or not tracked. */
export function usedShare(f: Pick<FeatureRow, "allowance" | "used">): number | null {
  if (f.allowance === null || f.allowance <= 0 || f.used === null) return null;
  return Math.min(1, Math.max(0, f.used / f.allowance));
}

export const percentUsed = (f: Pick<FeatureRow, "allowance" | "used">): number | null => {
  const s = usedShare(f);
  return s === null ? null : Math.round(s * 100);
};

/** The allowance cell's two lines: the headline ("32 / 50 credits", "Unlimited") and the small line under it. */
export function allowanceText(f: FeatureRow): { headline: string; detail: string | null } {
  if (f.status !== "ENABLED") return { headline: "No allowance", detail: null };
  if (f.allowance === null)
    return { headline: "Unlimited", detail: f.used === null ? "Usage not tracked yet" : `${f.used} ${f.usedNote || "used"}` };
  if (f.used === null) return { headline: `${f.allowance} ${f.unit}`, detail: "Usage tracking arrives with this tool" };
  return { headline: `${f.used} / ${f.allowance} ${f.unit}`, detail: null };
}

/** "Resets Nov 1, 2024" or "Included in plan" or "Not in your plan". */
export function renewalText(f: Pick<FeatureRow, "status" | "resetsOn">): string {
  if (f.status !== "ENABLED") return f.status === "DISABLED" ? "Turned off" : "Not in your plan";
  return f.resetsOn ? `Resets ${shortDate(f.resetsOn)}` : "Included in plan";
}

export type FeatureFilter = "all" | "enabled" | "attention" | "premium";
export const FILTERS: { value: FeatureFilter; label: string }[] = [
  { value: "all", label: "All Features" },
  { value: "enabled", label: "Enabled" },
  { value: "attention", label: "Needs attention" },
  { value: "premium", label: "Premium" },
];

/** A feature needs attention when it is not enabled, or 80 % or more of its allowance is used. */
export const needsAttention = (f: FeatureRow): boolean => f.status !== "ENABLED" || (usedShare(f) ?? 0) >= 0.8;

export function filterFeatures(rows: FeatureRow[], filter: FeatureFilter): FeatureRow[] {
  switch (filter) {
    case "enabled":
      return rows.filter((f) => f.status === "ENABLED");
    case "attention":
      return rows.filter(needsAttention);
    case "premium":
      return rows.filter((f) => f.premium);
    default:
      return rows;
  }
}

/** Features drawn as Usage Overview cards. */
export const overviewRows = (rows: FeatureRow[]): FeatureRow[] => rows.filter((f) => f.overview && f.status === "ENABLED");

/** Static defaults (they should become admin config). */
export interface Recommended {
  key: string;
  title: string;
  body: string;
  action: string;
  href: string;
  icon: FeatureIcon;
  tone: FeatureTone;
}
export const RECOMMENDED: Recommended[] = [
  { key: "review", title: "Try AI Resume Review", body: "Get detailed feedback and suggestions to make your resume stand out.", action: "Run Review", href: "/w/consultant/resumes", icon: "file", tone: "violet" },
  { key: "practice", title: "Practice Interview Questions", body: "Build confidence with role-specific questions and AI feedback.", action: "Start Practicing", href: "/w/consultant/interview-prep", icon: "video", tone: "green" },
  { key: "matches", title: "Explore More Job Matches", body: "Find new opportunities based on your updated profile and skills.", action: "View Job Matches", href: "/w/consultant/matches", icon: "search", tone: "accent" },
];

export const TIPS: { text: string; href: string }[] = [
  { text: "Keep your career profile up to date for better job matches.", href: "/w/consultant/profile" },
  { text: "Use AI resume tailoring for each application to improve your chances.", href: "/w/consultant/resumes" },
  { text: "Practice interview questions regularly to build confidence.", href: "/w/consultant/interview-prep" },
];

/* ── the BFF call (the browser talks to Next, Next to the API) ───────────────────── */

export interface FeaturesFetch {
  kind: "OK" | "DENIED" | "FAILED";
  view?: FeaturesView;
}

export async function fetchFeatures(orgId: number | string, signal?: AbortSignal): Promise<FeaturesFetch> {
  try {
    const res = await fetch(`/api/orgs/${orgId}/me-workspace/features`, { headers: { accept: "application/json" }, cache: "no-store", signal });
    if (res.status === 403 || res.status === 404) return { kind: "DENIED" };
    if (!res.ok) return { kind: "FAILED" };
    const view = parseFeatures(await res.json().catch(() => null));
    return view ? { kind: "OK", view } : { kind: "FAILED" };
  } catch {
    return { kind: "FAILED" };
  }
}
