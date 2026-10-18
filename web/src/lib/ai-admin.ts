/**
 * Admin "AI providers & routing" (I1.12 / I1.13; docs/AI-ADMIN-CONFIG-DESIGN.md): the shapes of
 * `/api/admin/ai/**`, the browser-side fetch helper that talks to the Next BFF, and the small money / time
 * formatters the page shares. Keys never appear here: the API reports only "present" and the NAME of the env var.
 */
import { SOURCE_LABEL, adminFetchIn } from "@/lib/admin-client";
import type { AdminFail, AdminHistoryRow, AdminResult, Resolved, Source } from "@/lib/admin-client";

/** `Source` / `Resolved` / `SOURCE_LABEL` moved to the admin kit's client (every settings-style page shares them). */
export { SOURCE_LABEL };
export type { Resolved, Source };

export interface LastProbe {
  at: string;
  ok: boolean;
  model: string | null;
  latencyMs: number | null;
  inputTokens: number;
  outputTokens: number;
  costMicros: number;
  errorKind: string | null;
}

export interface AiProviderItem {
  id: string;
  label: string;
  kind: "cloud" | "local";
  enabled: Resolved<boolean>;
  keyPresent: boolean;
  keyRequired: boolean;
  keyEnvVar: string;
  baseUrl: Resolved<string>;
  timeoutMs: Resolved<number>;
  models: Resolved<string[]>;
  capabilities: string[];
  configured: boolean;
  usedByTasks: string[];
  lastProbe: LastProbe | null;
}

export interface AiRouteItem {
  task: string;
  label: string;
  enabled: Resolved<boolean>;
  provider: Resolved<string>;
  model: Resolved<string>;
  fallbackProvider: Resolved<string>;
  fallbackModel: Resolved<string>;
  maxOutputTokens: Resolved<number>;
  risk: "HIGH" | "MEDIUM";
}

export interface AiPriceItem {
  model: string;
  inputPerMtokMicros: Resolved<number>;
  cachedPerMtokMicros: Resolved<number>;
  outputPerMtokMicros: Resolved<number>;
  custom: boolean;
  builtin: boolean;
}

export interface AiConfig {
  envMasterEnabled: boolean;
  global: { enabled: Resolved<boolean> };
  economy: { model: Resolved<string>; softCapPct: Resolved<number> };
  providers: AiProviderItem[];
  routes: AiRouteItem[];
  prices: AiPriceItem[];
  limits: { testPerHour: Resolved<number>; callsWindowHours: Resolved<number> };
}

export interface AiCallRow {
  id: number;
  createdAt: string;
  login: string | null;
  task: string;
  provider: string | null;
  model: string | null;
  success: boolean;
  errorKind: string | null;
  latencyMs: number | null;
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
  costMicros: number;
}

export interface AiCallsSummary {
  calls: number;
  failed: number;
  failedPct: number;
  p95LatencyMs: number;
  costMicros: number;
  byProvider: { provider: string; calls: number; failed: number; p95LatencyMs: number }[];
}

export interface AiCallsView {
  summary: AiCallsSummary;
  rows: AiCallRow[];
  nextBefore: number | null;
}

/** One row of the settings change history (the shape every admin page shares: `AdminHistoryRow`). */
export type AiHistoryRow = AdminHistoryRow;

export interface AiTestResult {
  ok: boolean;
  model: string | null;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  costMicros: number;
  error: { kind: string; message: string } | null;
}

/* ── Calling the BFF (browser side) ─────────────────────────────────────────────── */

/** The AI page's names for the admin kit's types (`lib/admin-client.ts`, E2E-A15.0). */
export type AiFail = AdminFail;
export type AiResult<T> = AdminResult<T>;

/** One call to `/api/admin/ai/...`; never throws. A network failure is a 0-status fail. */
export const aiFetch = adminFetchIn("/ai");

/* ── Formatting ─────────────────────────────────────────────────────────────────── */

const MICROS_PER_DOLLAR = 1_000_000;

/** Dollars from millionths of a dollar. Under $1 keeps 4 decimals so a $0.0013 call is not "$0.00". */
export function usd(micros: number): string {
  const d = micros / MICROS_PER_DOLLAR;
  return `$${d.toFixed(d !== 0 && Math.abs(d) < 1 ? 4 : 2)}`;
}

/** A per-million-token price in dollars without the "$" (10^5 micros -> "0.10"). Keeps up to 6 decimals when needed. */
export function pricePerMtok(micros: number): string {
  const d = micros / MICROS_PER_DOLLAR;
  const s = d.toFixed(6).replace(/0+$/, "");
  const [whole, frac = ""] = s.split(".");
  return `${whole}.${frac.padEnd(2, "0")}`;
}

/** Dollars typed by the admin ("0.10") -> whole micros; null when it is not a number >= 0. */
export function parseUsdToMicros(text: string): number | null {
  const t = text.trim().replace(/^\$/, "");
  if (!/^\d+(\.\d{1,6})?$/.test(t)) return null;
  return Math.round(Number(t) * MICROS_PER_DOLLAR);
}

/** 412 -> "412 ms", 1900 -> "1.9 s". */
export function latency(ms: number | null | undefined): string {
  if (ms == null) return "-";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`;
}

/** 3100 -> "3.1k", 900 -> "900". */
export function compactTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(n);
}

/** Matches the API's model-id rule (AiSettingKeys.MODEL_ID). */
export const MODEL_ID_RE = /^[a-z0-9][a-z0-9._:/-]{1,60}$/;
export const MODEL_ID_MESSAGE = "Not a model id (letters, digits, . _ : / -).";
export function isModelId(s: string): boolean {
  return MODEL_ID_RE.test(s) && !s.includes("..");
}

/** The lowest source a group of settings comes from: any db row makes the group "Admin". */
export function groupSource(...rs: Resolved<unknown>[]): Source {
  if (rs.some((r) => r.source === "db")) return "db";
  if (rs.some((r) => r.source === "env")) return "env";
  return "default";
}

/** What an Undo sends to put a field back: the old value when the admin had set it, else null (back to env). */
export function undoValue<T>(prev: Resolved<T>): T | null {
  return prev.source === "db" ? prev.value : null;
}

/** Task wire names in the order the API lists them. */
export const TASK_ORDER = [
  "parse",
  "draft",
  "pick",
  "map",
  "enrich",
  "match",
  "fit",
  "tailor",
  "jobs",
  "inbox",
  "rewrite",
  "summary",
  "suggest",
  "cover",
  "translate",
] as const;
