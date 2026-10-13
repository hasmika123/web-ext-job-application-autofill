#!/usr/bin/env node
/**
 * Server-AI smoke (I1.14): every server-side AI flow, through the REAL web BFF routes, against the REAL API and
 * ledger. DEV ONLY: refuses NODE_ENV=production and any non-local API/web host unless AI_ALLOW_REMOTE=1.
 *
 *   node scripts/ai-smoke.mjs --stub     # default. Needs an API started with the ai-stub profile
 *                                        #   (node scripts/dev/api-local.mjs --stub): no key, no network, no cost.
 *   node scripts/ai-smoke.mjs --live     # the same flows on real Gemini. Exits 0 with SKIP when the API reports no key.
 *
 *   --api <url> / AI_API   Spring API   (default RB_API, else http://127.0.0.1:8080)
 *   --web <url> / AI_WEB   Next web     (default RB_WEB, else http://127.0.0.1:3000)  (DOSSIER_API_URL = the API)
 *
 * It NEVER reads api/.env.ai.local and never prints a key: it only asks the API (GET /api/admin/ai/config) whether
 * a key is present. A stub run refuses to start against a stack that talks to real Gemini, and a live run refuses
 * a stub stack, so neither can silently be the other.
 *
 * Accounts (see web/.env.ai-smoke, gitignored; AI_* variables in the environment win):
 *   AI_ADMIN_USER / AI_ADMIN_PASS   an admin (required; the dev seed admin works on a local dev API)
 *   AI_USER / AI_PASS               the "Pro" user. Missing -> a throwaway is registered, admin-activated and saved.
 *   AI_FREE_USER / AI_FREE_PASS     the Free user. Same.
 * "Pro" is an admin AI-budget override (the API's own dev lever; it opens every budgeted AI task). The two features
 * that gate on a real Pro subscription (ATS score, daily job matches) need a subscription row, which only a Stripe
 * webhook writes, so they run only when AI_MYSQL_CONTAINER + AI_MYSQL_PASSWORD (a local MySQL docker container) are
 * given; otherwise they are reported SKIP with that reason.
 *
 * Every flow asserts: (a) HTTP ok + shape, (b) a new ai_call ledger row (provider, model, success, latency, cost),
 * (c) the meter moved, (d) truth checks held (no invented numbers or employers), (e) the same call as a Free user is
 * 402 PRO_REQUIRED (parse is the free exception), (f) a never-collected value in the input did not reach the provider.
 * Then the route-switch proof: change a route's model through the BFF, the very next call uses it, reset.
 *
 * Exit code 0 only when no row FAILs (SKIP rows are fine). No passwords, keys, prompts or answers are printed
 * beyond a 40-character preview.
 */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webDir = fileURLToPath(new URL("..", import.meta.url));
const ENV_FILE = path.join(webDir, ".env.ai-smoke");

if (process.env.NODE_ENV === "production") {
  console.error("ai-smoke: refusing to run with NODE_ENV=production");
  process.exit(1);
}

/* ── arguments + environment ───────────────────────────────────────────────────────────────── */

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
if (flag("live") && flag("stub")) {
  console.error("ai-smoke: choose --stub or --live, not both");
  process.exit(2);
}
const LIVE = flag("live");
const MODE = LIVE ? "live" : "stub";
const API = (opt("api") ?? process.env.AI_API ?? process.env.RB_API ?? "http://127.0.0.1:8080").replace(/\/+$/, "");
const WEB = (opt("web") ?? process.env.AI_WEB ?? process.env.RB_WEB ?? "http://127.0.0.1:3000").replace(/\/+$/, "");
for (const u of [API, WEB]) {
  const host = new URL(u).hostname;
  if (!["localhost", "127.0.0.1", "[::1]", "::1"].includes(host) && process.env.AI_ALLOW_REMOTE !== "1") {
    console.error(`ai-smoke: ${u} is not a local address; refusing (this script writes data).`);
    process.exit(1);
  }
}

function readEnvFile(file = ENV_FILE) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) out[m[1]] = m[2];
  }
  return out;
}
const fileEnv = readEnvFile();
// The throwaway account rb-smoke already made (web/.env.rb-smoke) is a fine "Pro" user for a demo stack.
const rbEnv = readEnvFile(path.join(webDir, ".env.rb-smoke"));
const FALLBACK = { AI_USER: rbEnv.RB_USER, AI_PASS: rbEnv.RB_PASS };
const cred = (k) => process.env[k] || fileEnv[k] || (fileEnv.AI_USER || process.env.AI_USER ? "" : FALLBACK[k]) || "";
const DB = {
  container: process.env.AI_MYSQL_CONTAINER ?? "",
  password: process.env.AI_MYSQL_PASSWORD ?? "",
  name: process.env.AI_MYSQL_DB ?? "dossierApi",
};
const HAVE_DB = Boolean(DB.container && DB.password);

/* ── tiny helpers ──────────────────────────────────────────────────────────────────────────── */

const rows = [];
const skip = (name, why) => rows.push({ name, status: "SKIP", detail: why });
async function step(name, fn) {
  try {
    const detail = await fn();
    rows.push({ name, status: "PASS", detail: typeof detail === "string" ? detail : "" });
    return true;
  } catch (e) {
    rows.push({ name, status: "FAIL", detail: e instanceof Error ? e.message : String(e) });
    return false;
  }
}
function must(cond, msg) {
  if (!cond) throw new Error(msg);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nonce = randomBytes(3).toString("hex");
const preview = (s) => String(s ?? "").replace(/\s+/g, " ").slice(0, 40);
const microsToUsd = (m) => `$${(m / 1_000_000).toFixed(m < 10_000 ? 5 : 4)}`;

class Session {
  cookies = new Map();
  label;
  constructor(label) {
    this.label = label;
  }
  absorb(res) {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(";");
      const i = pair.indexOf("=");
      if (i > 0) this.cookies.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
  }
  header() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  get bearer() {
    return this.cookies.get("kiwiply_access") ?? "";
  }
  /** A call through the web BFF (what the browser does). */
  async web(method, p, body, headers) {
    const res = await fetch(`${WEB}${p}`, {
      method,
      headers: { cookie: this.header(), ...(body !== undefined ? { "content-type": "application/json" } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      redirect: "manual",
    });
    this.absorb(res);
    return pack(res);
  }
  /** A call straight to Spring with this user's token - only for endpoints that have no web route (the extension's). */
  async api(method, p, body) {
    const res = await fetch(`${API}${p}`, {
      method,
      headers: { authorization: `Bearer ${this.bearer}`, ...(body !== undefined ? { "content-type": "application/json" } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return pack(res);
  }
  async login(user, pass) {
    // the web allows 10 sign-ins per 5 minutes per client IP; a smoke run uses 3, so back-to-back runs may wait here
    let r = await this.web("POST", "/api/auth/login", { username: user, password: pass });
    for (let i = 0; i < 6 && r.status === 429; i++) {
      const wait = Math.min(Number(r.headers.get("retry-after")) || 60, 300);
      console.error(`ai-smoke: the web rate-limited ${this.label}'s sign-in; waiting ${wait}s`);
      await sleep(wait * 1000);
      r = await this.web("POST", "/api/auth/login", { username: user, password: pass });
    }
    must(r.status === 200, `${this.label} sign-in -> ${r.status}`);
    must(this.bearer, `${this.label}: no session cookie`);
    this.login_ = user;
  }
  login_ = "";
}
async function pack(res) {
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { status: res.status, json, text, headers: res.headers };
}

/* ── the ledger, read the way the admin page does (GET /api/admin/ai/calls through the BFF) ────── */

let admin;
const seen = new Map(); // ledger id -> row, for the end-of-run table
async function ledger(extra = "") {
  const r = await admin.web("GET", `/api/admin/ai/calls?hours=2&limit=100${extra}`);
  must(r.status === 200, `GET /api/admin/ai/calls -> ${r.status}`);
  return r.json;
}
async function ledgerMark() {
  const l = await ledger("&limit=1");
  return l.rows[0]?.id ?? 0;
}
/** The ledger rows written after `mark` by `login` for `task` (oldest first). */
async function rowsSince(mark, login, task) {
  const l = await ledger(task ? `&task=${task}` : "");
  const mine = l.rows.filter((r) => r.id > mark && (!login || r.login === login) && (!task || r.task === task));
  mine.forEach((r) => seen.set(r.id, r));
  return mine.sort((a, b) => a.id - b.id);
}
function assertRow(r, { task, model } = {}) {
  must(r.task === task || !task, `task ${r.task}`);
  must(r.provider === "gemini", `provider ${r.provider}`);
  must(r.success === true, `success=${r.success} (${r.errorKind ?? ""})`);
  must(typeof r.model === "string" && r.model.length > 0, "empty model");
  must(typeof r.latencyMs === "number" && r.latencyMs >= 0, `latency ${r.latencyMs}`);
  must(typeof r.costMicros === "number" && r.costMicros >= 0, `cost ${r.costMicros}`);
  must(r.inputTokens + r.outputTokens > 0, "no tokens recorded");
  if (model) must(servedIs(r.model, model), `model ${r.model}, expected ${model}`);
}
/** `served` is the requested model, or the requested model plus a numeric version suffix ("-001"); never "-lite". */
function servedIs(served, requested) {
  return served === requested || new RegExp(`^${requested.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-\\d`).test(served);
}

/* ── truth checks on AI-written text (d) ───────────────────────────────────────────────────── */

const numbersOf = (s) => new Set((String(s).match(/\d[\d,.]*\d|\d/g) ?? []).map((n) => n.replace(/[,]/g, "")));
const INVENTED_EMPLOYERS = ["Google", "Amazon", "Microsoft", "Meta", "Netflix", "Tesla"];
/** Every number in `after` appears in `source`; no famous employer the source never names. */
function truthy(after, source) {
  const allowed = numbersOf(source);
  for (const n of numbersOf(after)) if (!allowed.has(n)) return `invented number "${n}" in "${preview(after)}"`;
  for (const e of INVENTED_EMPLOYERS) if (new RegExp(`\\b${e}\\b`).test(after) && !new RegExp(`\\b${e}\\b`).test(source)) return `invented employer "${e}"`;
  return "";
}

/* ── fixtures ──────────────────────────────────────────────────────────────────────────────── */

const STRUCTURED = {
  summary: "Backend engineer who ships reliable payment services.",
  skills: ["Java", "SQL", "Kubernetes", "Kafka"],
  experience: [
    {
      company: "Acme",
      title: "Backend Engineer",
      location: "Austin, TX",
      startDate: "Jan 2020",
      endDate: "Present",
      current: true,
      bullets: ["Built the billing service handling 1,200 requests per second", "Cut p99 latency by 40% across checkout"],
    },
    { company: "Globex", title: "Engineer", location: "", startDate: "2018", endDate: "2019", current: false, bullets: ["Led a team of 4 engineers on the ledger rewrite"] },
  ],
  education: [{ school: "State University", degree: "BS", field: "Computer Science", startDate: "2014", endDate: "2018", gpa: "", location: "" }],
  languages: [],
  projects: [],
};
const JD = (n) =>
  `Backend Engineer (${n}). We build payment infrastructure. You will design Java services on Kubernetes, own SQL schemas, ` +
  `operate Kafka pipelines and mentor engineers. Requirements: 4+ years of backend experience, strong Java and SQL, GraphQL a plus. ` +
  `Fully remote within the US. We do not sponsor visas.`;

/* ── setup ─────────────────────────────────────────────────────────────────────────────────── */

function sql(statement) {
  return execFileSync("docker", ["exec", DB.container, "mysql", "-uroot", `-p${DB.password}`, "-N", "-B", DB.name, "-e", statement], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

async function ensureAccount(prefix, userKey, passKey) {
  let user = cred(userKey);
  let pass = cred(passKey);
  if (user && pass) return { user, pass, created: false };
  const suffix = randomBytes(4).toString("hex");
  user = `${prefix}${suffix}`;
  pass = randomBytes(12).toString("base64url");
  const res = await fetch(`${API}/api/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ login: user, email: `${user}@example.test`, password: pass, firstName: "Ai", lastName: "Smoke", langKey: "en" }),
  });
  must(res.status === 201, `register ${prefix} -> ${res.status}`);
  const act = await fetch(`${API}/api/admin/users/${encodeURIComponent(user)}/activate`, { method: "POST", headers: { authorization: `Bearer ${admin.bearer}` } });
  must(act.ok, `admin activate ${prefix} -> ${act.status}`);
  appendFileSync(ENV_FILE, `${userKey}=${user}\n${passKey}=${pass}\n`, { mode: 0o600 });
  return { user, pass, created: true };
}

let pro, free, adminName;
const state = { totalRows: 0, dbSeeded: [], overrides: [], budgetCents: LIVE ? 100 : 5 };

async function cleanResumes(sess) {
  // tracked applications pin their resume (409 on delete), so the board goes first
  const apps = await sess.web("GET", "/api/applications");
  must(apps.status === 200, `list applications -> ${apps.status}`);
  for (const a of apps.json.items ?? apps.json ?? []) {
    const d = await sess.web("DELETE", `/api/applications/${a.id}`);
    must(d.status === 200 || d.status === 204, `delete application ${a.id} -> ${d.status}`);
  }
  const list = await sess.api("GET", "/api/profile/resumes");
  must(list.status === 200, `list resumes -> ${list.status}`);
  for (const r of list.json) {
    const d = await sess.web("DELETE", `/api/resumes/${r.id}`);
    must(d.status === 200 || d.status === 204, `delete resume ${r.id} -> ${d.status}`);
  }
  return list.json.length;
}
async function builtResume(sess, label) {
  const r = await sess.web("POST", "/api/resumes/built", {
    source: { kind: "upload", fileName: "smoke.txt", structured: STRUCTURED, bio: { firstName: "Ada", email: "ada@example.test" } },
    label,
    templateId: "modern",
  });
  must(r.status === 201, `create resume -> ${r.status} ${preview(r.text)}`);
  const id = r.json.resume?.id;
  must(id, "no resume id");
  const doc = await sess.web("GET", `/api/resumes/${id}/doc`);
  must(doc.status === 200, `GET doc -> ${doc.status}`);
  const bullets = [];
  for (const s of doc.json.doc.sections ?? []) for (const it of s.items ?? []) for (const b of it.bullets ?? []) bullets.push({ id: b.id, text: b.text });
  must(bullets.length >= 2, `the document has ${bullets.length} bullets`);
  return { id, bullets, docText: JSON.stringify(doc.json.doc) };
}
async function application(sess, resumeId, jd) {
  const r = await sess.web("POST", "/api/applications", { company: "Initech", roleTitle: `Backend Engineer ${nonce}`, status: "SAVED", jobDescription: jd, resumeId });
  must(r.status === 200 || r.status === 201, `create application -> ${r.status} ${preview(r.text)}`);
  const id = r.json.id ?? r.json.application?.id;
  must(id, `no application id in ${preview(r.text)}`);
  return id;
}
const usageOf = async (sess) => {
  const r = await sess.api("GET", "/api/ai/usage");
  must(r.status === 200, `GET /api/ai/usage -> ${r.status}`);
  return r.json;
};
/** The alternatives of one proposed change: the list when the API sends several, else its single `after`. */
const altsOf = (c) => (c?.alternatives?.length ? c.alternatives : c?.after ? [c.after] : []);
const is402 = (r) => r.status === 402 && (r.json?.code === "PRO_REQUIRED" || r.json?.proRequired === true || r.json?.error);

/* ── the run ───────────────────────────────────────────────────────────────────────────────── */

let config;
let skipAll = null;
let envModel = ""; // the env model of the `parse` route
let startMark = 0;
const fixtures = {};

adminName = cred("AI_ADMIN_USER");
const adminPass = cred("AI_ADMIN_PASS");
if (!adminName || !adminPass) {
  console.error("ai-smoke: set AI_ADMIN_USER and AI_ADMIN_PASS (an admin account) in the environment or web/.env.ai-smoke.\n  On a local dev API the seeded admin works; never use a production account.");
  process.exit(2);
}
admin = new Session("admin");

await step("admin signs in through the web", async () => {
  await admin.login(adminName, adminPass);
});
if (!admin.bearer) finish();

await step("GET /api/admin/ai/config: which stack is this?", async () => {
  const r = await admin.web("GET", "/api/admin/ai/config");
  must(r.status === 200, `-> ${r.status}`);
  config = r.json;
  const g = config.providers.find((p) => p.id === "gemini");
  must(g, "no gemini provider in the config");
  const stub = /stub/i.test(g.label);
  if (!LIVE && !stub) throw new Error("this API talks to real Gemini; a --stub run would spend real money. Start it with `node scripts/dev/api-local.mjs --stub`, or pass --live.");
  if (LIVE && stub) throw new Error("this API is the stub; --live needs a real key. Start it with `node scripts/dev/api-local.mjs` (api/.env.ai.local).");
  if (LIVE && (!g.keyPresent || !config.envMasterEnabled)) {
    skipAll = "SKIP: no Gemini key (DOSSIER_AI_API_KEY) — put it in api/.env.ai.local";
    return "key absent";
  }
  must(config.envMasterEnabled, "server AI is off by deployment config (DOSSIER_AI_ENABLED=false)");
  must(g.keyPresent && g.configured, "gemini is not configured");
  envModel = config.routes.find((x) => x.task === "parse").model.value;
  return `${MODE}: ${g.label}, key present, env parse model ${envModel}`;
});
if (rows.some((r) => r.status === "FAIL")) finish();
if (skipAll) {
  console.log(skipAll);
  process.exit(0);
}
const gemini = config.providers.find((p) => p.id === "gemini");
startMark = await ledgerMark();

await step("accounts: Pro user + Free user (registered and admin-activated when missing)", async () => {
  pro = await ensureAccount("aismokepro", "AI_USER", "AI_PASS");
  free = await ensureAccount("aismokefree", "AI_FREE_USER", "AI_FREE_PASS");
  return `${pro.created || free.created ? "created + saved to web/.env.ai-smoke" : "reused web/.env.ai-smoke"}`;
});
const P = new Session("pro");
const F = new Session("free");
await step("sign in as the Pro and the Free user", async () => {
  await P.login(pro.user, pro.pass);
  await F.login(free.user, free.pass);
});
if (!P.bearer || !F.bearer) finish();

await step("entitlements: Pro = admin AI budget override; Free = none", async () => {
  const set = await admin.web("PUT", `/api/admin/users/${encodeURIComponent(pro.user)}/ai-quota`, { budgetCents: state.budgetCents });
  must(set.status === 200, `PUT ai-quota -> ${set.status}`);
  state.overrides.push(pro.user);
  const clr = await admin.web("DELETE", `/api/admin/users/${encodeURIComponent(free.user)}/ai-quota`);
  must(clr.status === 200 || clr.status === 204, `DELETE ai-quota (free) -> ${clr.status}`);
  if (HAVE_DB) {
    sql(
      `insert into subscription (user_id, plan, status, current_period_end, cancel_at_period_end, created_at, updated_at) ` +
        `select id, 'PRO', 'active', now() + interval 30 day, 0, now(), now() from jhi_user where login=${q(pro.user)} ` +
        `on duplicate key update plan='PRO', status='active', current_period_end=now() + interval 30 day`,
    );
    state.dbSeeded.push("subscription");
    return `budget ${state.budgetCents}c + a Pro subscription row (via ${DB.container})`;
  }
  return `budget ${state.budgetCents}c (no AI_MYSQL_CONTAINER: ATS score + job matches will SKIP)`;
});

await step("clean slate + fixtures (resume, application) for both users", async () => {
  const a = (await cleanResumes(P)) + (await cleanResumes(F));
  fixtures.pro = await builtResume(P, `ai-smoke ${nonce}`);
  fixtures.free = await builtResume(F, `ai-smoke ${nonce}`);
  fixtures.proApp = await application(P, fixtures.pro.id, JD(`pro ${nonce}`));
  fixtures.freeApp = await application(F, fixtures.free.id, JD(`free ${nonce}`));
  return `${a} old resumes removed; pro resume ${fixtures.pro.id}, application ${fixtures.proApp}`;
});
if (!fixtures.freeApp) finish();

/* Each flow: (a) call + shape, (b) ledger row, (e) Free 402. `calls` is how many new rows to expect. */
const usageBefore = {};
usageBefore.pro = await usageOf(P).catch(() => null);
usageBefore.free = await usageOf(F).catch(() => null);

/** Run `call` as `sess`, assert the ledger gained exactly `task` rows (>= 1) for it. Returns the response. */
async function ledgered(label, sess, task, call, shape, { model, rowsExpected = 1 } = {}) {
  let resp;
  const mark = await ledgerMark();
  await step(`${label}: HTTP ok + shape`, async () => {
    resp = await call();
    must(resp.status === 200 || resp.status === 201, `-> ${resp.status} ${preview(resp.text)}`);
    return shape(resp) ?? "";
  });
  await step(`${label}: ledger row (provider, model, success, latency, cost)`, async () => {
    const got = await rowsSince(mark, sess.login_, task);
    must(got.length >= rowsExpected, `expected ${rowsExpected} new '${task}' ledger row(s) for ${sess.login_}, saw ${got.length}`);
    const r = got[got.length - 1];
    assertRow(r, { task, model });
    return `#${r.id} ${r.model} ${r.latencyMs}ms ${r.inputTokens}/${r.outputTokens} tok ${microsToUsd(r.costMicros)}`;
  });
  return resp;
}
async function free402(label, call) {
  const mark = await ledgerMark();
  await step(`${label}: Free user -> 402 PRO_REQUIRED, no provider call`, async () => {
    const r = await call();
    must(is402(r), `-> ${r.status} ${preview(r.text)}`);
    const rowsNow = (await ledger(`&limit=5`)).rows.filter((x) => x.id > mark && x.login === free.user && x.success);
    must(rowsNow.length === 0, "a Free 402 still produced a successful ledger row");
    return `${r.json?.code ?? "402"}`;
  });
}

/* ── F1 parse (used by resume upload and onboarding): the free exception ────────────────────── */
{
  const text = `Ada Stub\nada.stub@example.test\nBackend Engineer, Acme Corp, 2020-present\n- Built the billing service ${nonce}\nSkills: Java, SQL`;
  const before = await usageOf(F).catch(() => null);
  const resp = await ledgered(
    "parse (Free user: allowed)",
    F,
    "parse",
    () => F.web("POST", "/api/ai/parse-resume", { text, consent: true }),
    (r) => {
      must(Array.isArray(r.json?.parsed?.experience) && r.json.parsed.experience.length > 0, "parsed.experience is empty");
      must(typeof r.json.used === "number" && typeof r.json.quota === "number", "no used/quota");
      return `${r.json.parsed.experience.length} role(s), used ${r.json.used}/${r.json.quota}`;
    },
  );
  await step("parse: Free meter moved (+1 parse this month)", async () => {
    const after = await usageOf(F);
    must(after.metered === "count", `metered ${after.metered}`);
    must(!before || after.used === before.used + 1, `used ${before?.used} -> ${after.used}`);
    return `${before?.used} -> ${after.used} of ${after.limit}`;
  });
  await step("parse: consent=false -> consentRequired and no ledger row", async () => {
    const mark = await ledgerMark();
    const r = await F.web("POST", "/api/ai/parse-resume", { text, consent: false });
    must(r.status === 200 && r.json?.consentRequired === true, `-> ${r.status} ${preview(r.text)}`);
    must((await rowsSince(mark, free.user, "parse")).length === 0, "a refused parse still wrote a ledger row");
  });
  await step("parse: a never-collected value (fake SSN) is stripped before the provider", async () => {
    const r = await F.web("POST", "/api/ai/parse-resume", { text: `${text}\nSSN: 123-45-6789\nDate of birth: 1990-05-12`, consent: true });
    must(r.status === 200, `-> ${r.status}`);
    must(!r.text.includes("123-45-6789") && !r.text.includes("1990-05-12"), "the value came back out of the parse");
    must(!r.text.includes("STUB-SAW-SENSITIVE"), "the stub provider saw a never-collected value");
    return "no value reached the provider";
  });
  await step("parse: the Pro user parses too (out of the budget)", async () => {
    const mark = await ledgerMark();
    const r = await P.web("POST", "/api/ai/parse-resume", { text, consent: true });
    must(r.status === 200 && r.json?.parsed, `-> ${r.status}`);
    const got = await rowsSince(mark, pro.user, "parse");
    must(got.length === 1, `${got.length} ledger rows`);
    assertRow(got[0], { task: "parse" });
  });
  void resp;
}

/* ── F2 Resume Builder: rewrite → apply, summary, suggestions → apply/dismiss, resume ATS score ─ */
{
  const R = fixtures.pro;
  const refs = [R.bullets[0].id, R.bullets[R.bullets.length - 1].id];
  const before = new Map(R.bullets.map((b) => [b.id, b.text]));
  let proposal;
  await ledgered(
    "rewrite (Resume Builder)",
    P,
    "rewrite",
    () => P.web("POST", `/api/resumes/${R.id}/ai/rewrite`, { refs, mode: "stronger", consent: true }),
    (r) => {
      if (LIVE && r.json?.status === "nothingToChange") return `the model's rewrites were all dropped by the truth checks (dropped=${r.json.dropped})`;
      must(r.json?.status === "ok", `status ${r.json?.status}`);
      proposal = r.json.proposal;
      must(proposal?.id && proposal.changes?.length >= 1, "no changes in the proposal");
      for (const c of proposal.changes) {
        const src = before.get(c.ref) ?? "";
        for (const alt of altsOf(c)) {
          const bad = truthy(alt, src + " " + R.docText);
          must(!bad, bad);
          must(!alt.includes("340%"), "an invented number survived the truth checks");
        }
      }
      return `${proposal.changes.length} change(s) kept, dropped=${r.json.dropped ?? "?"}`;
    },
  );
  if (!LIVE) {
    await step("rewrite: the stub's invented number was dropped by the truth checks", async () => {
      must(proposal.changes.length === 1, `${proposal.changes.length} changes kept; the second (invented-only) change should be dropped`);
      must(altsOf(proposal.changes[0]).length === 1, "the invented alternative was kept");
    });
  }
  if (proposal) await step("rewrite: apply the proposal -> the document has the new text", async () => {
    const c = proposal.changes[0];
    const r = await P.web("POST", `/api/ai/proposals/${proposal.id}/apply`, { keep: [c.ref] });
    must(r.status === 200, `apply -> ${r.status} ${preview(r.text)}`);
    const flat = JSON.stringify(r.json?.doc ?? r.json);
    const want = altsOf(c)[0].replace(/"/g, '\\"');
    must(flat.includes(want.slice(0, 40).replace(/"/g, '\\"')), "the applied text is not in the returned document");
    return `applied ${c.ref}`;
  });
  await free402("rewrite", () => F.web("POST", `/api/resumes/${fixtures.free.id}/ai/rewrite`, { refs: [fixtures.free.bullets[0].id], mode: "stronger", consent: true }));

  await ledgered(
    "summary (Resume Builder)",
    P,
    "summary",
    () => P.web("POST", `/api/resumes/${R.id}/ai/summary`, { tone: "confident", consent: true }),
    (r) => {
      if (LIVE && r.json?.status === "nothingToChange") return `all variants dropped by the truth checks (dropped=${r.json.dropped})`;
      must(r.json?.status === "ok", `status ${r.json?.status}`);
      const alts = altsOf(r.json.proposal?.changes?.[0]);
      must(alts.length >= 1, "no summary alternatives");
      for (const a of alts) {
        const bad = truthy(a, R.docText);
        must(!bad, bad);
      }
      return `${alts.length} variant(s): "${preview(alts[0])}"`;
    },
  );
  await free402("summary", () => F.web("POST", `/api/resumes/${fixtures.free.id}/ai/summary`, { tone: "confident", consent: true }));

  let cards = [];
  await ledgered(
    "suggestions (Resume Builder cards)",
    P,
    "suggest",
    () => P.web("POST", `/api/resumes/${R.id}/ai/suggestions`, { consent: true, refresh: true }),
    (r) => {
      must(["ok", "nothingToChange"].includes(r.json?.status), `status ${r.json?.status}`);
      cards = r.json.suggestions ?? [];
      for (const card of cards)
        for (const c of card.changes ?? []) {
          const bad = truthy(altsOf(c)[0] ?? "", R.docText);
          must(!bad, bad);
        }
      return `${cards.length} card(s)`;
    },
  );
  if (!LIVE) {
    await step("suggestions: the stub's invented card was dropped", async () => {
      must(cards.length === 1, `${cards.length} cards kept; expected exactly the good one`);
    });
  }
  await step("suggestions: GET lists the stored cards (no AI call), apply one, dismiss the rest", async () => {
    const mark = await ledgerMark();
    const list = await P.web("GET", `/api/resumes/${R.id}/ai/suggestions`);
    must(list.status === 200, `GET -> ${list.status}`);
    must((list.json.suggestions ?? []).length === cards.length, "the stored list differs from the POST");
    if (cards.length) {
      const first = cards[0];
      const ap = await P.web("POST", `/api/ai/proposals/${first.id}/apply`, { keep: [first.changes[0].ref] });
      must(ap.status === 200, `apply card -> ${ap.status} ${preview(ap.text)}`);
    }
    for (const c of cards.slice(1)) {
      const d = await P.web("POST", `/api/ai/proposals/${c.id}/dismiss`, {});
      must(d.status === 200 || d.status === 204, `dismiss -> ${d.status}`);
    }
    must((await rowsSince(mark, pro.user)).length === 0, "list/apply/dismiss made an AI call");
    return "no AI call";
  });
  await free402("suggestions", () => F.web("POST", `/api/resumes/${fixtures.free.id}/ai/suggestions`, { consent: true }));

  if (HAVE_DB) {
    await step("resume ATS score: Pro 200 (deterministic, no AI call)", async () => {
      const mark = await ledgerMark();
      const r = await P.web("GET", `/api/resumes/${R.id}/ats-score`);
      must(r.status === 200, `-> ${r.status} ${preview(r.text)}`);
      must(typeof (r.json.score ?? r.json.total) === "number", `no numeric score in ${preview(r.text)}`);
      must((await rowsSince(mark, pro.user)).length === 0, "the structure score made an AI call");
      return `score ${r.json.score ?? r.json.total}`;
    });
    await free402("resume ATS score", () => F.web("GET", `/api/resumes/${fixtures.free.id}/ats-score`));
  } else {
    skip("resume ATS score (Pro 200 / Free 402)", "needs a real Pro subscription: set AI_MYSQL_CONTAINER + AI_MYSQL_PASSWORD");
  }
}

/* ── F3 applications: job fit, resume match, tailor → apply, application ATS score ──────────── */
{
  const R = fixtures.pro;
  await ledgered(
    "job-fit (application)",
    P,
    "fit",
    () => P.web("POST", `/api/applications/${fixtures.proApp}/job-fit`, { resumeId: R.id }),
    (r) => {
      const fit = r.json?.fit ?? r.json;
      must(typeof fit.score === "number" && fit.score >= 0 && fit.score <= 100, `score ${fit?.score}`);
      must(Array.isArray(fit.matched) && Array.isArray(fit.missing), "no matched/missing lists");
      return `score ${fit.score}, ${fit.matched.length} matched, ${fit.missing.length} missing`;
    },
  );
  await step("job-fit: repeat is served from the cache (no new ledger row)", async () => {
    const mark = await ledgerMark();
    const r = await P.web("POST", `/api/applications/${fixtures.proApp}/job-fit`, { resumeId: R.id });
    must(r.status === 200, `-> ${r.status}`);
    must((await rowsSince(mark, pro.user, "fit")).length === 0, "a cached fit still called the provider");
  });
  await free402("job-fit", () => F.web("POST", `/api/applications/${fixtures.freeApp}/job-fit`, { resumeId: fixtures.free.id }));

  await ledgered(
    "resume-match (application)",
    P,
    "match",
    () => P.web("POST", `/api/applications/${fixtures.proApp}/resume-fit`, {}),
    (r) => {
      const scores = r.json?.scores ?? [];
      must(scores.length >= 1 && typeof scores[0].score === "number", "no scores");
      return `${scores.length} resume(s), best ${scores[0].score}`;
    },
  );
  await free402("resume-match", () => F.web("POST", `/api/applications/${fixtures.freeApp}/resume-fit`, {}));

  let proposal;
  await ledgered(
    "tailor (application)",
    P,
    "tailor",
    () => P.web("POST", `/api/applications/${fixtures.proApp}/tailor`, { resumeId: R.id }),
    (r) => {
      proposal = r.json?.proposal;
      must(proposal?.proposalId && Array.isArray(proposal.changes), `no proposal in ${preview(r.text)}`);
      proposal.id = proposal.proposalId;
      if (LIVE && proposal.changes.length === 0) return "nothing to change (every rewrite was dropped by the truth checks)";
      must(proposal.changes.length >= 1, "no kept changes");
      for (const c of proposal.changes) {
        const bad = truthy(c.after, R.docText);
        must(!bad, bad);
        must(!String(c.after).includes("340%"), "an invented number survived the tailor checks");
      }
      return `${proposal.changes.length} change(s) kept`;
    },
  );
  if (proposal?.changes.length) await step("tailor: apply -> a NEW resume (the original is untouched)", async () => {
    const r = await P.web("POST", `/api/tailor/${proposal.id}/apply`, { keep: [proposal.changes[0].ref], label: `ai-smoke tailored ${nonce}`, applicationId: fixtures.proApp });
    must(r.status === 201, `apply -> ${r.status} ${preview(r.text)}`);
    const created = r.json?.resume ?? r.json;
    const newId = created?.resumeId ?? created?.id;
    must(newId && newId !== R.id, `no new resume in ${preview(r.text)}`);
    return `resume ${newId}`;
  });
  await free402("tailor", () => F.web("POST", `/api/applications/${fixtures.freeApp}/tailor`, { resumeId: fixtures.free.id }));

  if (HAVE_DB) {
    await step("application ATS score: Pro 200 (keyword coverage from the cached fit, no extra AI call)", async () => {
      const mark = await ledgerMark();
      const r = await P.web("POST", `/api/applications/${fixtures.proApp}/ats-score`, { resumeId: R.id });
      must(r.status === 200, `-> ${r.status} ${preview(r.text)}`);
      must((await rowsSince(mark, pro.user, "fit")).length === 0, "the score re-ran the fit");
      return `score ${r.json.score ?? r.json.total ?? "?"}`;
    });
    await free402("application ATS score", () => F.web("POST", `/api/applications/${fixtures.freeApp}/ats-score`, { resumeId: fixtures.free.id }));
  } else {
    skip("application ATS score (Pro 200 / Free 402)", "needs a real Pro subscription: set AI_MYSQL_CONTAINER + AI_MYSQL_PASSWORD");
  }
}

/* ── F4 the extension's endpoints (no web route: the browser extension calls Spring with its own token) ── */
{
  const R = fixtures.pro;
  const jd = JD(`paste ${nonce}`);
  await ledgered(
    "ai/job-fit (paste a JD, extension)",
    P,
    "fit",
    () => P.api("POST", "/api/ai/job-fit", { resumeId: R.id, jobDescription: jd + "\nDo not send SSN 123-45-6789 with your application.", role: "Backend Engineer", company: "Initech", consent: true }),
    (r) => {
      const fit = r.json?.fit ?? r.json;
      must(typeof fit.score === "number", `no score in ${preview(r.text)}`);
      must(!r.text.includes("STUB-SAW-SENSITIVE") && !r.text.includes("123-45-6789"), "a never-collected value reached the provider (or came back)");
      return `score ${fit.score}; the SSN in the JD was stripped`;
    },
  );
  await free402("ai/job-fit", () => F.api("POST", "/api/ai/job-fit", { resumeId: fixtures.free.id, jobDescription: jd, role: "Backend Engineer", company: "Initech", consent: true }));
  await ledgered(
    "ai/resume-match (paste a JD, extension)",
    P,
    "match",
    () => P.api("POST", "/api/ai/resume-match", { jobDescription: jd + " (match)", role: "Backend Engineer", company: "Initech", consent: true }),
    (r) => {
      must((r.json?.scores ?? []).length >= 1, `no scores in ${preview(r.text)}`);
      return `${r.json.scores.length} score(s)`;
    },
  );
  await free402("ai/resume-match", () => F.api("POST", "/api/ai/resume-match", { jobDescription: jd + " (match)", role: "Backend Engineer", company: "Initech", consent: true }));

  const bg = "Backend engineer with Java, SQL and Kafka experience at Acme.";
  const draft = (task, question) => P.api("POST", "/api/ai/draft", { task, question, context: task === "draft" ? bg : "", consent: true });
  const dq = `Why do you want this role? (${nonce})`;
  await ledgered("ai/draft task=draft", P, "draft", () => draft("draft", dq), (r) => {
    must(typeof r.json?.answer === "string" && r.json.answer.length > 10, `no answer in ${preview(r.text)}`);
    return `"${preview(r.json.answer)}"`;
  });
  await step("draft: the same question again is served from the answer cache (no new ledger row)", async () => {
    const mark = await ledgerMark();
    const r = await draft("draft", dq);
    must(r.status === 200 && r.json.cached === true, `-> ${r.status} cached=${r.json?.cached}`);
    must((await rowsSince(mark, pro.user, "draft")).length === 0, "a cached draft called the provider");
  });
  await ledgered(
    "ai/draft task=pick",
    P,
    "pick",
    () => draft("pick", `Screening question from a job application:\nAre you authorized to work in the US? (${nonce})\n\nOptions (choose ONE):\n- Yes\n- No\n\nCandidate background:\n${bg}\n\nReply with EXACTLY one option from the list, verbatim, and nothing else.`),
    (r) => {
      must(/^(yes|no|unsure)\b/i.test(String(r.json?.answer).trim()), `answer "${preview(r.json?.answer)}" is not one of the options`);
      return `"${preview(r.json.answer)}"`;
    },
  );
  await ledgered(
    "ai/draft task=map",
    P,
    "map",
    () => draft("map", `Task: map each numbered job-application form field label to EXACTLY ONE key from this vocabulary, or "unknown" if none fits.\nVocabulary: firstName, lastName, email, phone, city\n\nFields:\n1. First name ${nonce}\n2. Your email address\n3. Favourite colour\n\nReply with ONLY a JSON object mapping each number to a key, like {"1":"firstName","2":"unknown"} — no prose, no markdown.`),
    (r) => {
      const m = /\{[\s\S]*?\}/.exec(String(r.json?.answer));
      must(m, "no JSON object in the answer");
      const obj = JSON.parse(m[0]);
      must(Object.keys(obj).length >= 1, "empty mapping");
      return `${JSON.stringify(obj)}`;
    },
  );
  await ledgered(
    "ai/draft task=enrich",
    P,
    "enrich",
    () => draft("enrich", `Task: extract facts from the job posting text below. Reply with ONLY a JSON object with exactly these keys:\n{"jobType": ..., "jobMode": ..., "salaryMin": ..., "salaryMax": ..., "salaryCurrency": ..., "salaryPeriod": ...}\nRules: use null for anything the text does not EXPLICITLY state.\n\nJob posting text:\nBackend Engineer (${nonce}). Full-time, fully remote. Java and SQL.`),
    (r) => {
      const m = /\{[\s\S]*?\}/.exec(String(r.json?.answer));
      must(m && "jobType" in JSON.parse(m[0]), "no jobType in the answer");
      return `${preview(m[0])}`;
    },
  );
  for (const task of ["draft", "pick", "map", "enrich"]) {
    await free402(`ai/draft task=${task}`, () => F.api("POST", "/api/ai/draft", { task, question: `free ${task} ${nonce}`, context: "", consent: true }));
  }
  await step("draft: consent=false -> consentRequired, no ledger row", async () => {
    const mark = await ledgerMark();
    const r = await P.api("POST", "/api/ai/draft", { task: "draft", question: `no consent ${nonce}`, context: "", consent: false });
    must(r.status === 200 && r.json.consentRequired === true, `-> ${r.status} ${preview(r.text)}`);
    must((await rowsSince(mark, pro.user)).length === 0, "a refused draft wrote a ledger row");
  });
  await step("draft: a never-collected value (fake SSN, passport) is stripped before the provider", async () => {
    const r = await P.api("POST", "/api/ai/draft", { task: "draft", question: `Why us? My SSN is 123-45-6789 (${nonce}).`, context: `${bg} Passport number: X1234567`, consent: true });
    must(r.status === 200 && r.json.answer, `-> ${r.status} ${preview(r.text)}`);
    must(!r.json.answer.includes("STUB-SAW-SENSITIVE"), "the stub provider saw a never-collected value");
    must(!r.json.answer.includes("123-45-6789") && !r.json.answer.includes("X1234567"), "the value came back out");
    return "no value reached the provider";
  });
  if (!LIVE) {
    await step("failure ledger row: a provider 503 -> 502 to the caller and a success=false HTTP_5XX row", async () => {
      const mark = await ledgerMark();
      const r = await draft("draft", `please STUB-FAIL-503 ${nonce}`);
      must(r.status === 502, `-> ${r.status}`);
      const got = await rowsSince(mark, pro.user, "draft");
      must(got.length === 1 && got[0].success === false && got[0].errorKind === "HTTP_5XX", `rows ${JSON.stringify(got.map((x) => [x.success, x.errorKind]))}`);
      must(got[0].costMicros === 0, "a failed call was costed");
      return `#${got[0].id} ${got[0].errorKind}, cost 0`;
    });
  }
}

/* ── F5 daily job matches (the nightly /match job, run now) ───────────────────────────────────── */
if (HAVE_DB) {
  await step("job matches: Free user cannot switch matching on (402)", async () => {
    const r = await F.web("PUT", "/api/job-matches/settings", { enabled: true });
    must(is402(r), `-> ${r.status} ${preview(r.text)}`);
  });
  await step("job matches: seed a posting, switch matching on as Pro -> a 'jobs' ledger row, a stored match", async () => {
    const tag = `aismoke-${nonce}`;
    sql(`insert into job_source (ats, board_token, company_name, origin, enabled, consecutive_failures, created_at) values ('greenhouse', ${q(tag)}, 'Initech', 'smoke', 0, 0, now())`);
    state.dbSeeded.push(`source:${tag}`);
    const sid = sql(`select id from job_source where board_token=${q(tag)}`);
    sql(
      `insert into job_posting (source_id, external_id, title, company, location, workplace_type, remote, url, description_text, published_at, dedup_key, first_seen_at) values ` +
        `(${sid}, ${q(tag)}, 'Backend Engineer', 'Initech', 'Remote (US)', 'REMOTE', 1, ${q("https://example.test/" + tag)}, ` +
        `'Java services on Kubernetes, SQL schemas, Kafka pipelines. Requirements: 4+ years of backend experience.', now(), ${q(tag)}, now())`,
    );
    sql(`delete from job_match_setting where user_id = (select id from jhi_user where login=${q(pro.user)})`); // a run inside the min-gap is skipped
    const mark = await ledgerMark();
    const on = await P.web("PUT", "/api/job-matches/settings", { enabled: true });
    must(on.status === 200, `PUT settings -> ${on.status} ${preview(on.text)}`);
    let got = [];
    for (let i = 0; i < 20 && !got.length; i++) {
      await sleep(1500);
      got = await rowsSince(mark, pro.user, "jobs");
    }
    if (!got.length) {
      await admin.web("POST", "/api/admin/job-sources/match", {});
      for (let i = 0; i < 20 && !got.length; i++) {
        await sleep(1500);
        got = await rowsSince(mark, pro.user, "jobs");
      }
    }
    must(got.length >= 1, "no 'jobs' ledger row appeared (the match did not reach the model; check the resume has a title/skills)");
    assertRow(got[got.length - 1], { task: "jobs" });
    const list = await P.api("GET", "/api/profile/job-matches");
    must(list.status === 200, `GET job-matches -> ${list.status}`);
    await P.web("PUT", "/api/job-matches/settings", { enabled: false });
    return `#${got[got.length - 1].id} ${got[got.length - 1].model}; ${(list.json?.matches ?? []).length} shown`;
  });
} else {
  skip("job matches (nightly /match job: Free 402, Pro run, 'jobs' ledger row)", "needs a real Pro subscription and a seeded posting: set AI_MYSQL_CONTAINER + AI_MYSQL_PASSWORD");
}

/* ── F6 inbox ─────────────────────────────────────────────────────────────────────────────────── */
skip(
  "inbox reading (AI step) + suggestions accept/dismiss",
  "the AI step (task 'inbox') only runs inside the IMAP poller on a connected Gmail mailbox; accept/dismiss of suggestions make no AI call. Not reachable without a real mailbox",
);

/* ── meter moved (c) ──────────────────────────────────────────────────────────────────────────── */
await step("meter: the Pro user's budget meter moved (or is unchanged only because a call costs < 1%)", async () => {
  const after = await usageOf(P);
  must(after.metered === "budget", `metered ${after.metered}`);
  const was = usageBefore.pro?.used ?? 0;
  must(after.used >= was, `used went down: ${was} -> ${after.used}`);
  const mine = [...seen.values()].filter((r) => r.login === pro.user && r.success);
  const spent = mine.reduce((a, r) => a + r.costMicros, 0);
  if (!LIVE) must(spent > 0, "the ledger shows no cost for the Pro user");
  return `${was}% -> ${after.used}% of a ${state.budgetCents}c budget; ledger shows ${microsToUsd(spent)} over ${mine.length} call(s)`;
});

/* ── the route-switch proof + Test connection + kill switch ───────────────────────────────────── */
await step("Test connection (Gemini card): ok, a served model, latency, tokens; a 'probe' ledger row", async () => {
  const mark = await ledgerMark();
  const r = await admin.web("POST", "/api/admin/ai/providers/gemini/test", {});
  must(r.status === 200, `-> ${r.status} ${preview(r.text)}`);
  must(r.json.ok === true, `ok=${r.json.ok} ${JSON.stringify(r.json.error ?? {})}`);
  must(r.json.latencyMs > 0, `latency ${r.json.latencyMs}`);
  must(r.json.model, "no served model");
  const got = await rowsSince(mark, adminName, "probe");
  must(got.length === 1, `${got.length} probe rows`);
  assertRow(got[0], { task: "probe" });
  return `${r.json.model} ${r.json.latencyMs}ms ${r.json.inputTokens} in / ${r.json.outputTokens} out`;
});

/** The very next call after a route PATCH runs on the new model: PATCH, call, ledger, reset, call, ledger. */
async function routeSwitch(task, sess, login, callFor) {
  const route = (await admin.web("GET", "/api/admin/ai/config")).json.routes.find((x) => x.task === task);
  const was = route.model.value;
  const alt = gemini.models.value.find((m) => !servedIs(m, was) && !servedIs(was, m)) ?? "gemini-2.5-flash";
  await step(`route switch ${task}: PATCH model ${was} -> ${alt} through the BFF (source=db)`, async () => {
    const r = await admin.web("PATCH", `/api/admin/ai/routes/${task}`, { model: alt });
    must(r.status === 200 && r.json.model.value === alt && r.json.model.source === "db", `-> ${r.status} ${preview(r.text)}`);
  });
  await step(`route switch ${task}: the very next call uses ${alt} (ledger), no restart`, async () => {
    const mark = await ledgerMark();
    const r = await callFor(1);
    must(r.status === 200, `-> ${r.status} ${preview(r.text)}`);
    const got = await rowsSince(mark, login, task);
    must(got.length >= 1, "no ledger row");
    assertRow(got[got.length - 1], { task, model: alt });
    return `#${got[got.length - 1].id} ${got[got.length - 1].model}`;
  });
  await step(`route switch ${task}: history shows the change with the admin as actor`, async () => {
    const h = await admin.web("GET", `/api/admin/ai/config/history?key=ai.route.${task}.model&limit=5`);
    must(h.status === 200 && h.json.some((x) => x.newValue === alt && x.actorLogin === adminName), `history ${preview(h.text)}`);
  });
  await step(`route switch ${task}: reset -> source=env, the next call is back on ${was}`, async () => {
    const d = await admin.web("DELETE", `/api/admin/ai/routes/${task}`);
    must(d.status === 200 && d.json.model.source === "env" && d.json.model.value === was, `-> ${d.status} ${preview(d.text)}`);
    const mark = await ledgerMark();
    const r = await callFor(2);
    must(r.status === 200, `-> ${r.status}`);
    const got = await rowsSince(mark, login, task);
    must(got.length >= 1, "no ledger row");
    assertRow(got[got.length - 1], { task, model: was });
    return `#${got[got.length - 1].id} ${got[got.length - 1].model}`;
  });
}
await routeSwitch("parse", F, free.user, (n) => F.web("POST", "/api/ai/parse-resume", { text: `Ada Stub route switch ${n} ${nonce}\nBackend Engineer, Acme\nSkills: Java`, consent: true }));
{
  const R = fixtures.pro;
  const modes = ["plain", "formal", "grammar", "shorter"];
  await routeSwitch("rewrite", P, pro.user, (n) => P.web("POST", `/api/resumes/${R.id}/ai/rewrite`, { refs: [R.bullets[1].id], mode: modes[n - 1], consent: true }));
}

await step("kill switch: Server AI off (with a reason) -> {disabled:true}; on again -> works", async () => {
  const off = await admin.web("PATCH", "/api/admin/ai/config/global", { enabled: false, reason: `ai-smoke ${nonce}` });
  must(off.status === 200, `off -> ${off.status} ${preview(off.text)}`);
  try {
    const r = await P.api("POST", "/api/ai/draft", { task: "pick", question: `Options (choose ONE):\n- Yes\n- No\n(kill ${nonce})`, context: "", consent: true });
    must(r.status === 200 && r.json.disabled === true, `while off -> ${r.status} ${preview(r.text)}`);
  } finally {
    const on = await admin.web("PATCH", "/api/admin/ai/config/global", { enabled: true });
    must(on.status === 200, `on -> ${on.status}`);
  }
  const r2 = await P.api("POST", "/api/ai/draft", { task: "pick", question: `Options (choose ONE):\n- Yes\n- No\n(back ${nonce})`, context: "", consent: true });
  must(r2.status === 200 && r2.json.answer, `after on -> ${r2.status} ${preview(r2.text)}`);
});

await step("ledger: every row this run wrote, totalled", async () => {
  const l = await ledger("&limit=100");
  const mine = l.rows.filter((r) => r.id > startMark);
  mine.forEach((r) => seen.set(r.id, r));
  must(mine.length > 0, "the ledger gained no rows");
  const failed = mine.filter((r) => !r.success);
  return `${mine.length} rows (${failed.length} deliberate failure${failed.length === 1 ? "" : "s"}), ${microsToUsd(mine.filter((r) => r.success).reduce((a, r) => a + r.costMicros, 0))}`;
});

/* ── cleanup ──────────────────────────────────────────────────────────────────────────────────── */
await step("cleanup: routes reset, overrides + seeded rows removed", async () => {
  for (const t of ["parse", "rewrite"]) await admin.web("DELETE", `/api/admin/ai/routes/${t}`);
  await admin.web("PATCH", "/api/admin/ai/config/global", { enabled: true });
  for (const u of state.overrides) await admin.web("DELETE", `/api/admin/users/${encodeURIComponent(u)}/ai-quota`);
  if (HAVE_DB) {
    for (const s of state.dbSeeded) {
      if (s === "subscription") sql(`delete from job_match_setting where user_id = (select id from jhi_user where login=${q(pro.user)})`);
      if (s === "subscription") sql(`delete from subscription where user_id = (select id from jhi_user where login=${q(pro.user)})`);
      else if (s.startsWith("source:")) {
        const tag = s.slice(7);
        sql(`delete m from job_match m join job_posting p on p.id = m.posting_id where p.external_id=${q(tag)}`);
        sql(`delete from job_posting where external_id=${q(tag)}`);
        sql(`delete from job_source where board_token=${q(tag)}`);
      }
    }
  }
  const cfg = (await admin.web("GET", "/api/admin/ai/config")).json;
  must(cfg.routes.every((r) => r.model.source !== "db" || !["parse", "rewrite"].includes(r.task)), "a route is still overridden");
  must(cfg.global.enabled.value === true, "server AI is still off");
});

finish();

/* ── report ───────────────────────────────────────────────────────────────────────────────────── */
function finish() {
  const w = Math.max(...rows.map((r) => r.name.length), 10);
  console.log(`\nai-smoke (${MODE}) against API ${API} / web ${WEB}\n`);
  rows.forEach((r, i) => console.log(`${String(i + 1).padStart(3)}  ${r.status.padEnd(4)}  ${r.name.padEnd(w)}  ${r.detail ?? ""}`));
  const failed = rows.filter((r) => r.status === "FAIL").length;
  const skipped = rows.filter((r) => r.status === "SKIP").length;
  const ledgerRows = [...seen.values()].sort((a, b) => a.id - b.id);
  const total = ledgerRows.filter((r) => r.success).reduce((a, r) => a + r.costMicros, 0);
  const byTask = new Map();
  for (const r of ledgerRows) if (!byTask.has(r.task)) byTask.set(r.task, r);
  if (ledgerRows.length) {
    console.log(`\nLedger (first row per task, ${ledgerRows.length} rows seen this run):`);
    console.log("  id      task     provider model                      ok    ms   in/out tok    cost");
  }
  for (const r of byTask.values()) {
    console.log(`  ${String(r.id).padEnd(7)} ${r.task.padEnd(8)} ${r.provider.padEnd(8)} ${r.model.padEnd(26)} ${String(r.success).padEnd(5)} ${String(r.latencyMs ?? "").padStart(4)} ${`${r.inputTokens}/${r.outputTokens}`.padStart(11)}  ${microsToUsd(r.costMicros)}`);
  }
  console.log(`\nTotal cost from the ledger this run: ${microsToUsd(total)} (${MODE})`);
  console.log(`${rows.length - failed - skipped} passed, ${failed} failed, ${skipped} skipped`);
  process.exit(failed ? 1 : 0);
}
