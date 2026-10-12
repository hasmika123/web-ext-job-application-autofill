/**
 * Static, READ-ONLY fixture for `/api/admin/ai/*` in the mock API (I1.12; AI-ADMIN-CONFIG-DESIGN Q1 default), so
 * `npm run dev:demo` renders /admin/ai/providers. Writes are refused by the mock with a friendly 403. Shapes follow the
 * real API (AdminAiConfigService). Nothing here is a secret: the provider reports only that a key is present and the
 * NAME of the env var.
 */
const R = (value, source = "default", envDefault = null) => ({ value, source, envDefault, codeDefault: value });

const TASKS = [
  ["parse", "Resume parsing", "HIGH", 4000],
  ["draft", "Answer drafting", "MEDIUM", 400],
  ["pick", "Option picks", "MEDIUM", 400],
  ["map", "Field mapping", "MEDIUM", 400],
  ["enrich", "Job enrichment", "MEDIUM", 800],
  ["match", "Resume match", "MEDIUM", 1200],
  ["fit", "Job fit", "MEDIUM", 1200],
  ["tailor", "Resume tailoring", "MEDIUM", 2000],
  ["jobs", "Daily job matches", "MEDIUM", 800],
  ["inbox", "Inbox reading", "MEDIUM", 600],
  ["rewrite", "Rewrite", "MEDIUM", 600],
  ["summary", "Summary", "MEDIUM", 600],
  ["suggest", "Suggestions", "MEDIUM", 800],
  ["cover", "Cover letter", "MEDIUM", 1200],
  ["translate", "Translate", "MEDIUM", 1200],
];

const LITE = "gemini-2.5-flash-lite";
const FLASH = "gemini-2.5-flash";

export function aiConfigFixture(now = Date.now()) {
  const routes = TASKS.map(([task, label, risk, tokens]) => {
    const flash = task === "map";
    return {
      task,
      label,
      enabled: R(true),
      provider: R("gemini", "env", "gemini"),
      model: flash ? R(FLASH, "db", LITE) : R(LITE, "env", LITE),
      fallbackProvider: R("none"),
      fallbackModel: R(""),
      maxOutputTokens: task === "draft" ? R(tokens + 200, "db", tokens) : R(tokens, "env", tokens),
      risk,
    };
  });
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
        baseUrl: R("https://generativelanguage.googleapis.com/v1beta", "env", "https://generativelanguage.googleapis.com/v1beta"),
        timeoutMs: R(30000, "db", 20000),
        models: R([LITE, FLASH]),
        capabilities: ["STRUCTURED_OUTPUT", "FILES"],
        configured: true,
        usedByTasks: TASKS.map(([t]) => t),
        lastProbe: { at: new Date(now - 2 * 60_000).toISOString(), ok: true, model: `${LITE}-001`, latencyMs: 412, inputTokens: 9, outputTokens: 1, costMicros: 4, errorKind: null },
      },
    ],
    routes,
    prices: [
      { model: FLASH, inputPerMtokMicros: R(300000), cachedPerMtokMicros: R(30000), outputPerMtokMicros: R(2500000), custom: false, builtin: true },
      { model: LITE, inputPerMtokMicros: R(100000), cachedPerMtokMicros: R(10000), outputPerMtokMicros: R(400000), custom: false, builtin: true },
      { model: "qwen3:8b", inputPerMtokMicros: R(0, "db"), cachedPerMtokMicros: R(0, "db"), outputPerMtokMicros: R(0, "db"), custom: true, builtin: false },
    ],
    limits: { testPerHour: R(30), callsWindowHours: R(24) },
  };
}

const PICK = [
  ["sophie.lee", "parse", LITE, 2310, 3100, 900, 1300],
  ["daniel.kim", "draft", LITE, 880, 420, 120, 200],
  ["ava.patel", "fit", FLASH, 1900, 2100, 300, 1400],
  [null, "jobs", LITE, 30004, 0, 0, 0],
  ["ravi.k", "map", FLASH, 760, 380, 60, 400],
  ["priya.s", "tailor", FLASH, 2750, 1900, 700, 2300],
  ["admin", "probe", `${LITE}-001`, 412, 9, 1, 4],
  ["maya.chen", "pick", LITE, 540, 220, 20, 90],
];

/** Newest-first ledger rows, 130 of them so the panel's paging has something to page. */
function rows(now) {
  const out = [];
  for (let i = 0; i < 130; i++) {
    const [login, task, model, ms, inTok, outTok, cost] = PICK[i % PICK.length];
    const failed = login === null || i % 17 === 5;
    out.push({
      id: 1000 - i,
      createdAt: new Date(now - (i * 11 + 3) * 60_000).toISOString(),
      login,
      task,
      provider: "gemini",
      model,
      success: !failed,
      errorKind: failed ? (i % 2 ? "TIMEOUT" : "UPSTREAM_5XX") : null,
      latencyMs: ms + (i % 7) * 13,
      inputTokens: failed ? 0 : inTok,
      cachedTokens: 0,
      outputTokens: failed ? 0 : outTok,
      costMicros: failed ? 0 : cost,
    });
  }
  return out;
}

const p95 = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.max(0, Math.min(s.length - 1, Math.ceil(0.95 * s.length) - 1))];
};

/** GET /calls with the real endpoint's filters (hours, task, provider, failed, limit, before). */
export function aiCallsFixture(q, now = Date.now()) {
  const hours = Math.min(168, Math.max(1, Number(q.get("hours")) || 24));
  const limit = Math.min(200, Math.max(1, Number(q.get("limit")) || 100));
  const task = q.get("task") || "";
  const provider = q.get("provider") || "";
  const failedOnly = q.get("failed") === "true";
  const before = Number(q.get("before")) || Infinity;
  const since = now - hours * 3_600_000;

  const inWindow = rows(now).filter((r) => new Date(r.createdAt).getTime() >= since && (!task || r.task === task) && (!provider || r.provider === provider));
  const failed = inWindow.filter((r) => !r.success);
  const costMicros = inWindow.reduce((n, r) => n + r.costMicros, 0);
  const summary = {
    calls: inWindow.length,
    failed: failed.length,
    failedPct: inWindow.length ? Math.round((failed.length * 1000) / inWindow.length) / 10 : 0,
    p95LatencyMs: p95(inWindow.map((r) => r.latencyMs)),
    costMicros,
    byProvider: [{ provider: "gemini", calls: inWindow.length, failed: failed.length, p95LatencyMs: p95(inWindow.map((r) => r.latencyMs)) }],
  };
  const found = inWindow.filter((r) => (!failedOnly || !r.success) && r.id < before);
  const page = found.slice(0, limit);
  return { summary, rows: page, nextBefore: found.length > limit ? page[page.length - 1].id : null };
}

export function aiHistoryFixture(now = Date.now()) {
  const row = (id, key, oldValue, newValue, reason, minutes) => ({ id, key, oldValue, newValue, actorLogin: "admin", reason, changedAt: new Date(now - minutes * 60_000).toISOString() });
  return [
    row(4, "ai.route.map.model", null, FLASH, null, 25),
    row(3, "ai.provider.gemini.timeout_ms", null, "30000", null, 90),
    row(2, "ai.route.draft.max_output_tokens", null, "600", null, 300),
    row(1, "ai.enabled", "false", "true", "Back after the Gemini 5xx spike", 1500),
  ];
}
