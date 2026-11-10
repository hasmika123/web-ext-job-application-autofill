import type { AiCallsView, AiConfig, AiRouteItem, Resolved, Source } from "@/lib/ai-admin";

/** Fixtures for the AI admin tests (the same shapes `GET /api/admin/ai/config` and `/calls` return). */
export const R = <T,>(value: T, source: Source = "default", envDefault: T | null = null): Resolved<T> => ({ value, source, envDefault, codeDefault: value });

const TASKS: [string, string, "HIGH" | "MEDIUM"][] = [
  ["parse", "Resume parsing", "HIGH"],
  ["draft", "Answer drafting", "MEDIUM"],
  ["pick", "Option picks", "MEDIUM"],
  ["map", "Field mapping", "MEDIUM"],
  ["enrich", "Job enrichment", "MEDIUM"],
  ["match", "Resume match", "MEDIUM"],
  ["fit", "Job fit", "MEDIUM"],
  ["tailor", "Resume tailoring", "MEDIUM"],
  ["jobs", "Daily job matches", "MEDIUM"],
  ["inbox", "Inbox reading", "MEDIUM"],
  ["rewrite", "Rewrite", "MEDIUM"],
  ["summary", "Summary", "MEDIUM"],
  ["suggest", "Suggestions", "MEDIUM"],
  ["cover", "Cover letter", "MEDIUM"],
  ["translate", "Translate", "MEDIUM"],
];

export function route(task: string, label: string, risk: "HIGH" | "MEDIUM" = "MEDIUM", over: Partial<AiRouteItem> = {}): AiRouteItem {
  return {
    task,
    label,
    enabled: R(true),
    provider: R("gemini", "env", "gemini"),
    model: R("gemini-2.5-flash-lite", "env", "gemini-2.5-flash-lite"),
    fallbackProvider: R("none"),
    fallbackModel: R(""),
    maxOutputTokens: R(400, "env", 400),
    risk,
    ...over,
  };
}

export function config(over: Partial<AiConfig> = {}): AiConfig {
  return {
    envMasterEnabled: true,
    global: { enabled: R(true, "env", true) },
    economy: { model: R("", "env", ""), softCapPct: R(80, "env", 80) },
    providers: [
      {
        id: "gemini",
        label: "Google Gemini",
        kind: "cloud",
        enabled: R(true),
        keyPresent: true,
        keyRequired: true,
        keyEnvVar: "DOSSIER_AI_API_KEY",
        baseUrl: R("https://generativelanguage.googleapis.com/v1beta", "env"),
        timeoutMs: R(30000, "env"),
        models: R(["gemini-2.5-flash-lite", "gemini-2.5-flash"]),
        capabilities: ["STRUCTURED_OUTPUT"],
        configured: true,
        usedByTasks: TASKS.map(([t]) => t),
        lastProbe: null,
      },
    ],
    routes: TASKS.map(([t, l, r]) => route(t, l, r)),
    prices: [
      { model: "gemini-2.5-flash", inputPerMtokMicros: R(300000), cachedPerMtokMicros: R(30000), outputPerMtokMicros: R(2500000), custom: false, builtin: true },
      { model: "gemini-2.5-flash-lite", inputPerMtokMicros: R(100000), cachedPerMtokMicros: R(10000), outputPerMtokMicros: R(400000), custom: false, builtin: true },
    ],
    limits: { testPerHour: R(30), callsWindowHours: R(24) },
    ...over,
  };
}

export function calls(over: Partial<AiCallsView> = {}): AiCallsView {
  return {
    summary: { calls: 1284, failed: 7, failedPct: 0.5, p95LatencyMs: 1900, costMicros: 410000, byProvider: [{ provider: "gemini", calls: 1284, failed: 7, p95LatencyMs: 1900 }] },
    rows: [
      { id: 12, createdAt: "2026-10-12T16:04:11Z", login: "sophie.lee", task: "parse", provider: "gemini", model: "gemini-2.5-flash-lite-001", success: true, errorKind: null, latencyMs: 2310, inputTokens: 3100, cachedTokens: 0, outputTokens: 900, costMicros: 1300 },
      { id: 11, createdAt: "2026-10-12T15:58:02Z", login: null, task: "jobs", provider: "gemini", model: "gemini-2.5-flash-lite", success: false, errorKind: "TIMEOUT", latencyMs: 30004, inputTokens: 0, cachedTokens: 0, outputTokens: 0, costMicros: 0 },
    ],
    nextBefore: null,
    ...over,
  };
}
