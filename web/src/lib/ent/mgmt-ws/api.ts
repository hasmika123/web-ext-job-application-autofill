import { newKey } from "@/lib/ent/members";

/* The manager API is deliberately parsed at the browser boundary. A malformed
 * section becomes an honest empty section instead of taking the whole workspace
 * down, while authorization failures remain distinct from network failures. */
const isObj = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const list = (value: unknown): Record<string, unknown>[] => (Array.isArray(value) ? value.filter(isObj) : []);
const text = (value: unknown): string => (typeof value === "string" ? value : "");
const nullableText = (value: unknown): string | null => (typeof value === "string" && value.length > 0 ? value : null);
const num = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);
const id = (value: unknown): number => (typeof value === "number" && Number.isSafeInteger(value) ? value : 0);
const bool = (value: unknown): boolean => value === true;

export interface Person {
  id: number;
  name: string;
}

export interface HomeStat {
  thisWeek: number;
  lastWeek: number;
  deltaPct: number | null;
}

export interface HomeView {
  empty: boolean;
  generatedAt: string;
  tiles: {
    marketersActive: number;
    marketersPaused: number;
    consultantsCovered: number;
    openOpportunities: number;
    approvalsWaiting: number;
    escalations: { open: number; high: number; medium: number; low: number; snoozed: number };
  };
  pipeline: { assigned: HomeStat; interested: HomeStat; submitted: HomeStat; interviews: HomeStat };
  workload: { memberId: number; name: string; assigned: number; capacity: number; percent: number; overloaded: boolean }[];
  needsYou: { type: string; id: number; title: string; severity: string | null; who: string | null; since: string; link: string }[];
  activity: { id: number; type: string; text: string; consultant: string; actor: string; at: string }[];
}

export interface TeamRow {
  memberId: number;
  name: string;
  title: string;
  status: string;
  capacity: number;
  assigned: number;
  percent: number;
  overloaded: boolean;
  openApprovals: number;
  openEscalations: number;
  lastActiveAt: string | null;
  canManage: boolean;
}

export interface TeamPage {
  items: TeamRow[];
  page: number;
  size: number;
  total: number;
  hasMore: boolean;
}

export interface TeamMember {
  row: TeamRow;
  consultants: { consultantId: number; name: string; priority: string; status: string; backup: boolean }[];
  weeks: { weekStart: string; assigned: number; submitted: number; interviews: number }[];
  approvals: Approval[];
  escalations: Escalation[];
}

export interface AssignmentRow {
  consultantId: number;
  name: string;
  jobTitle: string | null;
  email: string | null;
  availability: string | null;
  marketer: Person | null;
  backup: Person | null;
  status: string | null;
  priority: string | null;
  activeApps: number;
  lastActivityAt: string | null;
  assignedAt: string | null;
}

export interface AssignmentsPage {
  items: AssignmentRow[];
  page: number;
  size: number;
  total: number;
  hasMore: boolean;
}

export interface WorkloadRow {
  marketer: { memberId: number; name: string; title: string | null; status: string; capacity: number; assigned: number; percent: number; overloaded: boolean; highPriority: number; paused: number; withoutBackup: number; activeApps: number; backupFor: number };
  series: number[];
}

export interface WorkloadPage {
  items: WorkloadRow[];
  summary: { marketers: number; totalAssigned: number; avgPerMarketer: number | null; overloaded: number; unassigned: number };
  generatedAt: string;
  weekEnds: string[];
}

export interface PipelineCard {
  id: number;
  consultantId: number;
  consultant: string;
  requirementId: number;
  job: string;
  clientId: number;
  client: string;
  marketer: Person | null;
  column: string;
  priority: string;
  lastActivityAt: string | null;
  ageDays: number;
  stale: boolean;
}

export interface PipelineColumn {
  key: string;
  label: string;
  count: number;
  items: PipelineCard[];
}

export interface PipelineBoard {
  columns: PipelineColumn[];
  total: number;
  page: number;
  size: number;
  staleDays: number;
  rangeDays: number;
  empty: boolean;
  generatedAt: string;
}

export interface PipelineSummary {
  columns: { key: string; label: string; count: number }[];
  stale: number;
  staleDays: number;
  rangeDays: number;
  windows: { days: number; steps: { key: string; label: string; count: number; conversionPct: number | null }[] }[];
  empty: boolean;
  generatedAt: string;
}

export interface Approval {
  id: number;
  kind: string;
  subjectType: string;
  subjectId: number;
  consultant: Person | null;
  requestedBy: Person | null;
  requestedAt: string;
  title: string;
  note: string | null;
  status: string;
  decidedBy: Person | null;
  decidedAt: string | null;
  decisionNote: string | null;
  expiresAt: string | null;
  payload: Record<string, unknown>;
}

export interface ApprovalPage {
  items: Approval[];
  page: number;
  size: number;
  total: number;
  hasMore: boolean;
}

export interface Escalation {
  id: number;
  kind: string;
  severity: string;
  subjectType: string;
  subjectId: number;
  consultant: Person | null;
  marketer: Person | null;
  title: string;
  detail: string;
  ruleKey: string;
  raisedBy: Person | null;
  raisedAt: string;
  status: string;
  assignee: Person | null;
  snoozedUntil: string | null;
  resolvedBy: Person | null;
  resolvedAt: string | null;
  resolution: string | null;
  ageHours: number;
  events: { id: number; kind: string; actor: Person | null; note: string | null; at: string }[];
}

export interface EscalationPage {
  items: Escalation[];
  page: number;
  size: number;
  total: number;
  hasMore: boolean;
}

export interface BulkRowResult {
  consultantId: number;
  ok: boolean;
  reason: string | null;
  previous: Record<string, unknown> | null;
}

export interface BulkResult {
  action: string;
  requested: number;
  ok: number;
  skipped: { consultantId: number; reason: string }[];
  results: BulkRowResult[];
}

export type ApiResult<T> = { kind: "OK"; data: T } | { kind: "DENIED" } | { kind: "FAILED"; message: string };

const person = (value: unknown): Person | null => {
  if (!isObj(value)) return null;
  return { id: id(value.id), name: text(value.name) };
};

const assignmentPerson = (value: unknown): Person | null => {
  if (!isObj(value)) return null;
  return { id: id(value.memberId ?? value.id), name: text(value.name) };
};

const stat = (value: unknown): HomeStat => {
  const row = isObj(value) ? value : {};
  return { thisWeek: num(row.thisWeek), lastWeek: num(row.lastWeek), deltaPct: typeof row.deltaPct === "number" ? row.deltaPct : null };
};

export function parseHome(body: unknown): HomeView | null {
  if (!isObj(body) || !isObj(body.tiles) || !isObj(body.pipeline)) return null;
  const tiles = body.tiles;
  const escalations = isObj(tiles.escalations) ? tiles.escalations : {};
  const pipeline = body.pipeline;
  return {
    empty: bool(body.empty),
    generatedAt: text(body.generatedAt),
    tiles: {
      marketersActive: num(tiles.marketersActive), marketersPaused: num(tiles.marketersPaused), consultantsCovered: num(tiles.consultantsCovered),
      openOpportunities: num(tiles.openOpportunities), approvalsWaiting: num(tiles.approvalsWaiting),
      escalations: { open: num(escalations.open), high: num(escalations.high), medium: num(escalations.medium), low: num(escalations.low), snoozed: num(escalations.snoozed) },
    },
    pipeline: { assigned: stat(pipeline.assigned), interested: stat(pipeline.interested), submitted: stat(pipeline.submitted), interviews: stat(pipeline.interviews) },
    workload: list(body.workload).map((row) => ({ memberId: id(row.memberId), name: text(row.name), assigned: num(row.assigned), capacity: num(row.capacity), percent: num(row.percent), overloaded: bool(row.overloaded) })),
    needsYou: list(body.needsYou).map((row) => ({ type: text(row.type), id: id(row.id), title: text(row.title), severity: nullableText(row.severity), who: nullableText(row.who), since: text(row.since), link: text(row.link) })),
    activity: list(body.activity).map((row) => ({ id: id(row.id), type: text(row.type), text: text(row.text), consultant: text(row.consultant), actor: text(row.actor), at: text(row.at) })),
  };
}

const parseTeamRow = (value: unknown): TeamRow => {
  const row = isObj(value) ? value : {};
  return { memberId: id(row.memberId), name: text(row.name), title: text(row.title), status: text(row.status), capacity: num(row.capacity), assigned: num(row.assigned), percent: num(row.percent), overloaded: bool(row.overloaded), openApprovals: num(row.openApprovals), openEscalations: num(row.openEscalations), lastActiveAt: nullableText(row.lastActiveAt), canManage: bool(row.canManage) };
};

export function parseTeam(body: unknown): TeamPage | null {
  if (!isObj(body) || !Array.isArray(body.items)) return null;
  return { items: list(body.items).map(parseTeamRow), page: num(body.page), size: num(body.size), total: num(body.total), hasMore: bool(body.hasMore) };
}

export function parseTeamMember(body: unknown): TeamMember | null {
  if (!isObj(body) || !isObj(body.row)) return null;
  return {
    row: parseTeamRow(body.row),
    consultants: list(body.consultants).map((row) => ({ consultantId: id(row.consultantId), name: text(row.name), priority: text(row.priority), status: text(row.status), backup: bool(row.backup) })),
    weeks: list(body.weeks).map((row) => ({ weekStart: text(row.weekStart), assigned: num(row.assigned), submitted: num(row.submitted), interviews: num(row.interviews) })),
    approvals: list(body.approvals).map(parseApproval),
    escalations: list(body.escalations).map(parseEscalation),
  };
}

export function parseAssignments(body: unknown): AssignmentsPage | null {
  if (!isObj(body) || !Array.isArray(body.items)) return null;
  return {
    items: list(body.items).map((row) => ({
      consultantId: id(row.consultantId), name: text(row.name), jobTitle: nullableText(row.jobTitle), email: nullableText(row.email), availability: nullableText(row.availability),
      marketer: assignmentPerson(row.marketer), backup: assignmentPerson(row.backup), status: nullableText(row.status), priority: nullableText(row.priority), activeApps: num(row.activeApps), lastActivityAt: nullableText(row.lastActivityAt), assignedAt: nullableText(row.assignedAt),
    })),
    page: num(body.page), size: num(body.size), total: num(body.total), hasMore: bool(body.hasMore),
  };
}

export function parseWorkload(body: unknown): WorkloadPage | null {
  if (!isObj(body) || !isObj(body.summary) || !Array.isArray(body.items)) return null;
  return {
    items: list(body.items).map((row) => {
      const m = isObj(row.marketer) ? row.marketer : {};
      return { marketer: { memberId: id(m.memberId), name: text(m.name), title: nullableText(m.title), status: text(m.status), capacity: num(m.capacity), assigned: num(m.assigned), percent: num(m.percent), overloaded: bool(m.overloaded), highPriority: num(m.highPriority), paused: num(m.paused), withoutBackup: num(m.withoutBackup), activeApps: num(m.activeApps), backupFor: num(m.backupFor) }, series: Array.isArray(row.series) ? row.series.map(num) : [] };
    }),
    summary: { marketers: num(body.summary.marketers), totalAssigned: num(body.summary.totalAssigned), avgPerMarketer: typeof body.summary.avgPerMarketer === "number" ? body.summary.avgPerMarketer : null, overloaded: num(body.summary.overloaded), unassigned: num(body.summary.unassigned) },
    generatedAt: text(body.generatedAt), weekEnds: Array.isArray(body.weekEnds) ? body.weekEnds.map(text) : [],
  };
}

const parsePipelineCard = (value: unknown): PipelineCard => {
  const row = isObj(value) ? value : {};
  return { id: id(row.id), consultantId: id(row.consultantId), consultant: text(row.consultant), requirementId: id(row.requirementId), job: text(row.job), clientId: id(row.clientId), client: text(row.client), marketer: assignmentPerson(row.marketer), column: text(row.column), priority: text(row.priority), lastActivityAt: nullableText(row.lastActivityAt), ageDays: num(row.ageDays), stale: bool(row.stale) };
};

export function parsePipeline(body: unknown): PipelineBoard | null {
  if (!isObj(body) || !Array.isArray(body.columns)) return null;
  return { columns: list(body.columns).map((row) => ({ key: text(row.key), label: text(row.label), count: num(row.count), items: list(row.items).map(parsePipelineCard) })), total: num(body.total), page: num(body.page), size: num(body.size), staleDays: num(body.staleDays), rangeDays: num(body.rangeDays), empty: bool(body.empty), generatedAt: text(body.generatedAt) };
}

export function parsePipelineSummary(body: unknown): PipelineSummary | null {
  if (!isObj(body) || !Array.isArray(body.columns)) return null;
  return { columns: list(body.columns).map((row) => ({ key: text(row.key), label: text(row.label), count: num(row.count) })), stale: num(body.stale), staleDays: num(body.staleDays), rangeDays: num(body.rangeDays), windows: list(body.windows).map((window) => ({ days: num(window.days), steps: list(window.steps).map((step) => ({ key: text(step.key), label: text(step.label), count: num(step.count), conversionPct: typeof step.conversionPct === "number" ? step.conversionPct : null })) })), empty: bool(body.empty), generatedAt: text(body.generatedAt) };
}

export function parseApproval(value: unknown): Approval {
  const row = isObj(value) ? value : {};
  return { id: id(row.id), kind: text(row.kind), subjectType: text(row.subjectType), subjectId: id(row.subjectId), consultant: person(row.consultant), requestedBy: person(row.requestedBy), requestedAt: text(row.requestedAt), title: text(row.title), note: nullableText(row.note), status: text(row.status), decidedBy: person(row.decidedBy), decidedAt: nullableText(row.decidedAt), decisionNote: nullableText(row.decisionNote), expiresAt: nullableText(row.expiresAt), payload: isObj(row.payload) ? row.payload : {} };
}

export function parseApprovals(body: unknown): ApprovalPage | null {
  if (!isObj(body) || !Array.isArray(body.items)) return null;
  return { items: list(body.items).map(parseApproval), page: num(body.page), size: num(body.size), total: num(body.total), hasMore: bool(body.hasMore) };
}

export function parseEscalation(value: unknown): Escalation {
  const row = isObj(value) ? value : {};
  return { id: id(row.id), kind: text(row.kind), severity: text(row.severity), subjectType: text(row.subjectType), subjectId: id(row.subjectId), consultant: person(row.consultant), marketer: person(row.marketer), title: text(row.title), detail: text(row.detail), ruleKey: text(row.ruleKey), raisedBy: person(row.raisedBy), raisedAt: text(row.raisedAt), status: text(row.status), assignee: person(row.assignee), snoozedUntil: nullableText(row.snoozedUntil), resolvedBy: person(row.resolvedBy), resolvedAt: nullableText(row.resolvedAt), resolution: nullableText(row.resolution), ageHours: num(row.ageHours), events: list(row.events).map((event) => ({ id: id(event.id), kind: text(event.kind), actor: person(event.actor), note: nullableText(event.note), at: text(event.at) })) };
}

export function parseEscalations(body: unknown): EscalationPage | null {
  if (!isObj(body) || !Array.isArray(body.items)) return null;
  return { items: list(body.items).map(parseEscalation), page: num(body.page), size: num(body.size), total: num(body.total), hasMore: bool(body.hasMore) };
}

export function parseBulkResult(body: unknown): BulkResult | null {
  if (!isObj(body) || !Array.isArray(body.results)) return null;
  return {
    action: text(body.action),
    requested: num(body.requested),
    ok: num(body.ok),
    skipped: list(body.skipped).map((row) => ({ consultantId: id(row.consultantId), reason: text(row.reason) })),
    results: list(body.results).map((row) => ({ consultantId: id(row.consultantId), ok: bool(row.ok), reason: nullableText(row.reason), previous: isObj(row.previous) ? row.previous : null })),
  };
}

async function call<T>(url: string, parse: (body: unknown) => T | null, init?: RequestInit): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, headers: { accept: "application/json", ...(init?.headers ?? {}) }, cache: "no-store" });
  } catch {
    return { kind: "FAILED", message: "We couldn't reach the server. Check your connection." };
  }
  if (response.status === 403 || response.status === 404) return { kind: "DENIED" };
  const body = await response.json().catch(() => null);
  if (!response.ok) return { kind: "FAILED", message: isObj(body) && typeof body.error === "string" ? body.error : "Something went wrong." };
  const data = parse(body);
  return data === null ? { kind: "FAILED", message: "The server returned an unexpected response." } : { kind: "OK", data };
}

const base = (orgId: number | string) => `/api/orgs/${orgId}/mgmt`;
const write = (method: string, body: unknown, key = newKey()): RequestInit => ({ method, headers: { "content-type": "application/json", "idempotency-key": key }, body: JSON.stringify(body) });
const pageQuery = (values: Record<string, string | number | boolean | null | undefined>) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  const query = params.toString();
  return query ? `?${query}` : "";
};

export const mgmtApi = {
  home: (orgId: number | string) => call(`${base(orgId)}/home`, parseHome),
  team: (orgId: number | string, query: { q?: string; status?: string; sort?: string; page?: number; size?: number } = {}) => call(`${base(orgId)}/team${pageQuery(query)}`, parseTeam),
  teamMember: (orgId: number | string, memberId: number) => call(`${base(orgId)}/team/${memberId}`, parseTeamMember),
  updateTeam: (orgId: number | string, memberId: number, body: { capacity?: number; status?: string; title?: string }, key?: string) => call(`${base(orgId)}/team/${memberId}`, (value) => (isObj(value) ? parseTeamRow(value) : null), write("PATCH", body, key)),
  assignments: (orgId: number | string, query: Record<string, string | number | boolean | null | undefined> = {}) => call(`${base(orgId)}/assignments${pageQuery(query)}`, parseAssignments),
  assignmentAction: (orgId: number | string, action: "assign" | "update" | "unassign" | "restore", body: unknown, key?: string) => call(`${base(orgId)}/assignments/${action}`, parseBulkResult, write("POST", body, key)),
  workload: (orgId: number | string) => call(`${base(orgId)}/workload`, parseWorkload),
  rebalance: (orgId: number | string, body: unknown, key?: string) => call(`${base(orgId)}/workload/rebalance`, parseBulkResult, write("POST", body, key)),
  pipeline: (orgId: number | string, query: Record<string, string | number | boolean | null | undefined> = {}) => call(`${base(orgId)}/pipeline${pageQuery(query)}`, parsePipeline),
  pipelineSummary: (orgId: number | string, range?: number) => call(`${base(orgId)}/pipeline/summary${pageQuery({ range })}`, parsePipelineSummary),
  approvals: (orgId: number | string, query: Record<string, string | number | null | undefined> = {}) => call(`${base(orgId)}/approvals${pageQuery(query)}`, parseApprovals),
  approval: (orgId: number | string, approvalId: number) => call(`${base(orgId)}/approvals/${approvalId}`, parseApproval),
  decide: (orgId: number | string, approvalId: number, decision: "approve" | "reject", note: string, key?: string) => call(`${base(orgId)}/approvals/${approvalId}/${decision}`, parseApproval, write("POST", { note }, key)),
  escalations: (orgId: number | string, query: Record<string, string | number | null | undefined> = {}) => call(`${base(orgId)}/escalations${pageQuery(query)}`, parseEscalations),
  escalation: (orgId: number | string, escalationId: number) => call(`${base(orgId)}/escalations/${escalationId}`, parseEscalation),
  escalationAction: (orgId: number | string, escalationId: number, action: "acknowledge" | "assign" | "snooze" | "resolve" | "dismiss" | "reopen" | "comment", body: unknown = {}, key?: string) => call(`${base(orgId)}/escalations/${escalationId}/${action}`, parseEscalation, write("POST", body, key)),
  raiseEscalation: (orgId: number | string, body: unknown, key?: string) => call(`/api/orgs/${orgId}/mkt/escalations`, parseEscalation, write("POST", body, key)),
};
