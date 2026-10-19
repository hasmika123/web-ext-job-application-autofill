/**
 * The Marketing Home board's data (design: Talent Marketing Dashboard). One call to
 * `GET /api/orgs/{orgId}/mkt/home` (through the BFF) draws the page. It is ASSIGNED-scope: only the
 * consultants the marketer is assigned to. A section the API leaves out is drawn as an honest empty state, never a made-up row.
 * E1: every action here prepares or records; nothing submits for a consultant.
 */

export type KpiKey = "assigned" | "newMatches" | "pendingSubmissions" | "overdueFollowups";
export const KPI_KEYS: KpiKey[] = ["assigned", "newMatches", "pendingSubmissions", "overdueFollowups"];
export const KPI_TITLES: Record<KpiKey, string> = {
  assigned: "Assigned consultants",
  newMatches: "New job matches",
  pendingSubmissions: "Pending submissions",
  overdueFollowups: "Overdue follow-ups",
};

export interface Kpi {
  key: KpiKey;
  value: number;
  /** Percent change against the same window last month; null = nothing to compare (no chip is drawn). */
  deltaPct: number | null;
  sparkline: number[];
}
export type Tone = "green" | "amber" | "blue" | "red" | "violet";
export interface AssignedTalent {
  id: number;
  name: string;
  avatarUrl: string | null;
  primarySkill: string;
  availability: { label: string; tone: Tone };
  resume: { label: string; state: "UPDATED" | "NEEDS_UPDATE" };
  activeApps: number;
  nextAction: { label: string; tone: Tone };
}
export interface StreamRow { source: string; status: string; newOpenings: number; lastSyncAt: string | null }
export interface Opening { id: number; title: string; client: string; location: string; matchPct: number }
export interface PipelineStage { key: string; label: string; count: number; pct: number }
export interface PipelineView { total: number; deltaPct: number | null; stages: PipelineStage[] }
export interface FollowupTask { id: number; title: string; sub: string; dueAt: string; kind: "CALL" | "EMAIL" | "CHAT" | "NOTE" | "DOC"; done: boolean }
export interface InterviewRow { id: number; startsAt: string; consultant: string; avatarUrl: string | null; role: string; client: string; type: string; status: string }
export interface ActivityRow { id: number; actor: string; avatarUrl: string | null; text: string; detail: string | null; at: string }

export interface MarketingHomeView {
  kpis: Kpi[];
  talent: AssignedTalent[];
  streams: StreamRow[];
  openings: Opening[];
  pipeline: PipelineView | null;
  tasks: FollowupTask[];
  interviews: InterviewRow[];
  activity: ActivityRow[];
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const str = (x: unknown, d = ""): string => (typeof x === "string" ? x : d);
const num = (x: unknown, d = 0): number => (typeof x === "number" && Number.isFinite(x) ? x : d);
const arr = (x: unknown): Record<string, unknown>[] => (Array.isArray(x) ? x.filter(isObj) : []);
const tone = (x: unknown): Tone => (x === "green" || x === "amber" || x === "blue" || x === "red" || x === "violet" ? x : "blue");

/** Lenient: a malformed section becomes empty, a malformed document becomes null (the page shows "couldn't load"). */
export function parseHome(raw: unknown): MarketingHomeView | null {
  if (!isObj(raw)) return null;
  const kpis: Kpi[] = arr(raw.kpis)
    .filter((k) => (KPI_KEYS as string[]).includes(str(k.key)))
    .map((k) => ({ key: str(k.key) as KpiKey, value: num(k.value), deltaPct: typeof k.deltaPct === "number" && Number.isFinite(k.deltaPct) ? k.deltaPct : null, sparkline: Array.isArray(k.sparkline) ? k.sparkline.filter((n): n is number => typeof n === "number") : [] }));
  const p = raw.pipeline;
  return {
    kpis,
    talent: arr(raw.talent).map((t) => {
      const a = isObj(t.availability) ? t.availability : {};
      const r = isObj(t.resume) ? t.resume : {};
      const n = isObj(t.nextAction) ? t.nextAction : {};
      return {
        id: num(t.id), name: str(t.name), avatarUrl: typeof t.avatarUrl === "string" ? t.avatarUrl : null, primarySkill: str(t.primarySkill),
        availability: { label: str(a.label), tone: tone(a.tone) },
        resume: { label: str(r.label), state: r.state === "NEEDS_UPDATE" ? "NEEDS_UPDATE" : "UPDATED" },
        activeApps: num(t.activeApps), nextAction: { label: str(n.label), tone: tone(n.tone) },
      } satisfies AssignedTalent;
    }),
    streams: arr(raw.streams).map((s) => ({ source: str(s.source), status: str(s.status, "Active"), newOpenings: num(s.newOpenings), lastSyncAt: typeof s.lastSyncAt === "string" ? s.lastSyncAt : null })),
    openings: arr(raw.openings).map((o) => ({ id: num(o.id), title: str(o.title), client: str(o.client), location: str(o.location), matchPct: num(o.matchPct) })),
    pipeline: isObj(p)
      ? { total: num(p.total), deltaPct: typeof p.deltaPct === "number" ? p.deltaPct : null, stages: arr(p.stages).map((s) => ({ key: str(s.key), label: str(s.label), count: num(s.count), pct: num(s.pct) })) }
      : null,
    tasks: arr(raw.tasks).map((t) => ({ id: num(t.id), title: str(t.title), sub: str(t.sub), dueAt: str(t.dueAt), kind: (["CALL", "EMAIL", "CHAT", "NOTE", "DOC"].includes(str(t.kind)) ? str(t.kind) : "NOTE") as FollowupTask["kind"], done: t.done === true })),
    interviews: arr(raw.interviews).map((i) => ({ id: num(i.id), startsAt: str(i.startsAt), consultant: str(i.consultant), avatarUrl: typeof i.avatarUrl === "string" ? i.avatarUrl : null, role: str(i.role), client: str(i.client), type: str(i.type), status: str(i.status) })),
    activity: arr(raw.activity).map((a) => ({ id: num(a.id), actor: str(a.actor), avatarUrl: typeof a.avatarUrl === "string" ? a.avatarUrl : null, text: str(a.text), detail: typeof a.detail === "string" ? a.detail : null, at: str(a.at) })),
  };
}

export type HomeFetch = { kind: "OK"; view: MarketingHomeView } | { kind: "DENIED" } | { kind: "FAILED" };

export async function fetchMarketingHome(orgId: number | string, signal?: AbortSignal): Promise<HomeFetch> {
  try {
    const res = await fetch(`/api/orgs/${orgId}/mkt/home`, { headers: { accept: "application/json" }, cache: "no-store", signal });
    if (res.status === 403 || res.status === 404) return { kind: "DENIED" };
    if (!res.ok) return { kind: "FAILED" };
    const view = parseHome(await res.json().catch(() => null));
    return view ? { kind: "OK", view } : { kind: "FAILED" };
  } catch {
    return { kind: "FAILED" };
  }
}

export function clockText(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
/** Whole days from today's date to `iso`'s date in the viewer's clock (0 = today, 1 = tomorrow, negative = past); null for a bad date. */
export function dayOffset(iso: string, now: number = Date.now()): number | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const a = new Date(now);
  const start = (x: Date) => Date.UTC(x.getFullYear(), x.getMonth(), x.getDate());
  return Math.round((start(d) - start(a)) / 86_400_000);
}
export function matchTone(pct: number): "green" | "amber" {
  return pct >= 80 ? "green" : "amber";
}

/** Board art served from `public/ent/marketer` (cropped from the approved board). A real `avatarUrl` from the API always wins. */
export const MARKETER_ART_BASE = "/ent/marketer";
const PEOPLE: Record<string, string> = { "alex morgan": "alex-morgan", "priya sharma": "priya-sharma", "michael park": "michael-park", "emily lawson": "emily-lawson", "david kim": "david-kim" };
const LOGOS: Record<string, string> = { "linkedin jobs": "linkedin", linkedin: "linkedin", indeed: "indeed", dice: "dice", ziprecruiter: "zip", "client portal": "portal" };
export const photoFor = (name: string, url: string | null): string | null => url ?? (PEOPLE[name.trim().toLowerCase()] ? `${MARKETER_ART_BASE}/${PEOPLE[name.trim().toLowerCase()]}.png` : null);
export const logoFor = (source: string): string | null => (LOGOS[source.trim().toLowerCase()] ? `${MARKETER_ART_BASE}/logo-${LOGOS[source.trim().toLowerCase()]}.png` : null);
export const HELP_BANNER = `${MARKETER_ART_BASE}/help-banner.png`;
