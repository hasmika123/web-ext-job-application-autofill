export type SearchSource = Record<string, string | string[] | undefined> | URLSearchParams;

const valueOf = (source: SearchSource | undefined, key: string): string | undefined => {
  if (!source) return undefined;
  if (source instanceof URLSearchParams) return source.get(key) ?? undefined;
  const value = source[key];
  return Array.isArray(value) ? value[0] : value;
};

const numberOf = (source: SearchSource | undefined, key: string, fallback: number, min: number, max: number): number => {
  const value = Number(valueOf(source, key));
  return Number.isInteger(value) && value >= min && value <= max ? value : fallback;
};

const oneOf = <T extends string>(source: SearchSource | undefined, key: string, fallback: T, values: readonly T[]): T => {
  const value = valueOf(source, key) as T | undefined;
  return value && values.includes(value) ? value : fallback;
};

export const TEAM_DEFAULTS = { q: "", status: "ACTIVE", sort: "load", page: 0, size: 20 } as const;
export type TeamState = { q: string; status: "ACTIVE" | "PAUSED" | "ALL"; sort: "load" | "name" | "approvals" | "escalations" | "activity"; page: number; size: number };
export function parseTeamState(source?: SearchSource): TeamState {
  return {
    q: valueOf(source, "q") ?? TEAM_DEFAULTS.q,
    status: oneOf(source, "status", TEAM_DEFAULTS.status, ["ACTIVE", "PAUSED", "ALL"]),
    sort: oneOf(source, "sort", TEAM_DEFAULTS.sort, ["load", "name", "approvals", "escalations", "activity"]),
    page: numberOf(source, "page", TEAM_DEFAULTS.page, 0, 100000),
    size: numberOf(source, "size", TEAM_DEFAULTS.size, 10, 100),
  };
}

export const ASSIGNMENTS_DEFAULTS = { q: "", status: "", priority: "", marketerId: "", availability: "", noBackup: false, page: 0, size: 20 } as const;
export type AssignmentsState = { q: string; status: string; priority: string; marketerId: string; availability: string; noBackup: boolean; page: number; size: number };
export function parseAssignmentsState(source?: SearchSource): AssignmentsState {
  return {
    q: valueOf(source, "q") ?? "",
    status: valueOf(source, "status") ?? "",
    priority: valueOf(source, "priority") ?? "",
    marketerId: valueOf(source, "marketerId") ?? "",
    availability: valueOf(source, "availability") ?? "",
    noBackup: valueOf(source, "noBackup") === "true",
    page: numberOf(source, "page", 0, 0, 100000),
    size: numberOf(source, "size", 20, 10, 100),
  };
}

export const PIPELINE_DEFAULTS = { range: 30, stale: false, marketer: "", consultant: "", client: "", page: 0, size: 50 } as const;
export type PipelineState = { range: 30 | 90; stale: boolean; marketer: string; consultant: string; client: string; page: number; size: number };
export function parsePipelineState(source?: SearchSource): PipelineState {
  return {
    range: numberOf(source, "range", 30, 30, 90) === 90 ? 90 : 30,
    stale: valueOf(source, "stale") === "true",
    marketer: valueOf(source, "marketer") ?? "",
    consultant: valueOf(source, "consultant") ?? "",
    client: valueOf(source, "client") ?? "",
    page: numberOf(source, "page", 0, 0, 100000),
    size: numberOf(source, "size", 50, 20, 200),
  };
}

export const APPROVAL_DEFAULTS = { tab: "PENDING", page: 0, size: 20 } as const;
export type ApprovalState = { tab: "PENDING" | "DECIDED"; page: number; size: number };
export function parseApprovalState(source?: SearchSource): ApprovalState {
  return {
    tab: oneOf(source, "tab", "PENDING", ["PENDING", "DECIDED"]),
    page: numberOf(source, "page", 0, 0, 100000),
    size: numberOf(source, "size", 20, 10, 100),
  };
}

export const ESCALATION_DEFAULTS = { tab: "OPEN", severity: "", kind: "", marketer: "", consultant: "", q: "", page: 0, size: 20 } as const;
export type EscalationState = { tab: "OPEN" | "SNOOZED" | "RESOLVED"; severity: string; kind: string; marketer: string; consultant: string; q: string; page: number; size: number };
export function parseEscalationState(source?: SearchSource): EscalationState {
  return {
    tab: oneOf(source, "tab", "OPEN", ["OPEN", "SNOOZED", "RESOLVED"]),
    severity: valueOf(source, "severity") ?? "",
    kind: valueOf(source, "kind") ?? "",
    marketer: valueOf(source, "marketer") ?? "",
    consultant: valueOf(source, "consultant") ?? "",
    q: valueOf(source, "q") ?? "",
    page: numberOf(source, "page", 0, 0, 100000),
    size: numberOf(source, "size", 20, 10, 100),
  };
}

export type WorkloadState = { view: "ALL" | "OVERLOADED" | "NO_BACKUP"; capacity: string };
export function parseWorkloadState(source?: SearchSource): WorkloadState {
  const rawView = valueOf(source, "view");
  return { view: rawView === "OVERLOADED" || rawView === "NO_BACKUP" ? rawView : "ALL", capacity: valueOf(source, "capacity") ?? "" };
}

export type SearchValue = string | number | boolean | null | undefined;

/** Keep manager filters shareable without turning every control change into a navigation. */
export function writeManagerSearch(values: Record<string, SearchValue>): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null || value === "" || value === false || value === 0) url.searchParams.delete(key);
    else url.searchParams.set(key, String(value));
  }
  const query = url.searchParams.toString();
  window.history.replaceState(window.history.state, "", `${url.pathname}${query ? `?${query}` : ""}${url.hash}`);
}
