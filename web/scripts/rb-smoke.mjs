#!/usr/bin/env node
/**
 * Resume Builder walking-skeleton smoke (R0.7): DB -> Spring API -> web BFF -> template -> PDF,
 * against the REAL API (not scripts/mock-api.mjs). DEV ONLY: refuses NODE_ENV=production and any
 * non-local API/web host unless RB_ALLOW_REMOTE=1 (never point it at production).
 *
 * Why not the demo accounts: the API's DemoGuard makes them read-only (POST /built is 403
 * DEMO_READ_ONLY), so the smoke uses a local test account. Its credentials live ONLY in the
 * gitignored `web/.env.rb-smoke` (KEY=VALUE lines RB_USER / RB_PASS). When that file is absent the
 * script registers a fresh account through the API's own `/api/register` and activates it through
 * `/api/activate`; the activation key is read from the throwaway MySQL container
 * (RB_MYSQL_CONTAINER + RB_MYSQL_PASSWORD), because no mail server runs locally.
 *
 * Needs running (see docs/HANDOFF-RESUME-BUILDER.md "Run the walking-skeleton smoke"):
 *   RB_API            Spring API base          default http://127.0.0.1:8080
 *   RB_WEB            Next dev/standalone      default http://127.0.0.1:3000  (DOSSIER_API_URL=RB_API,
 *                                              PDF_BROWSER_URL=ws://... of the chromium sidecar)
 *   RB_STORAGE_ROOT   the API's dossier.storage.local.root (to prove the PDF landed on disk)
 *
 * Usage: RB_STORAGE_ROOT=<dir> node scripts/rb-smoke.mjs
 * Exit code 0 only when every row passes.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webDir = fileURLToPath(new URL("..", import.meta.url));
const ENV_FILE = path.join(webDir, ".env.rb-smoke");

if (process.env.NODE_ENV === "production") {
  console.error("rb-smoke: refusing to run with NODE_ENV=production");
  process.exit(1);
}
const API = (process.env.RB_API ?? "http://127.0.0.1:8080").replace(/\/+$/, "");
const WEB = (process.env.RB_WEB ?? "http://127.0.0.1:3000").replace(/\/+$/, "");
const STORAGE_ROOT = process.env.RB_STORAGE_ROOT ?? "";
for (const u of [API, WEB]) {
  const host = new URL(u).hostname;
  if (!["localhost", "127.0.0.1", "[::1]", "::1"].includes(host) && process.env.RB_ALLOW_REMOTE !== "1") {
    console.error(`rb-smoke: ${u} is not a local address; refusing (this script writes data).`);
    process.exit(1);
  }
}
if (!STORAGE_ROOT) {
  console.error("rb-smoke: set RB_STORAGE_ROOT to the API's local storage root (dossier.storage.local.root).");
  process.exit(1);
}

/* ── tiny helpers ──────────────────────────────────────────────────────────────────────────── */

const rows = [];
function record(name, ok, detail = "") {
  rows.push({ name, ok, detail });
}
async function step(name, fn) {
  try {
    const detail = await fn();
    record(name, true, typeof detail === "string" ? detail : "");
  } catch (e) {
    record(name, false, e instanceof Error ? e.message : String(e));
  }
}
function must(cond, msg) {
  if (!cond) throw new Error(msg);
}

function readEnvFile() {
  if (!existsSync(ENV_FILE)) return null;
  const out = {};
  for (const line of readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) out[m[1]] = m[2];
  }
  return out.RB_USER && out.RB_PASS ? { user: out.RB_USER, pass: out.RB_PASS } : null;
}

/** Register + activate a throwaway local account; writes the gitignored creds file. */
async function createAccount() {
  const suffix = randomBytes(4).toString("hex");
  const user = `rbsmoke${suffix}`;
  const pass = randomBytes(12).toString("base64url");
  const res = await fetch(`${API}/api/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ login: user, email: `${user}@example.test`, password: pass, firstName: "Rb", lastName: "Smoke", langKey: "en" }),
  });
  must(res.status === 201, `register -> ${res.status} ${await res.text()}`);
  const container = process.env.RB_MYSQL_CONTAINER;
  const rootPw = process.env.RB_MYSQL_PASSWORD;
  must(container && rootPw, "set RB_MYSQL_CONTAINER and RB_MYSQL_PASSWORD (to read the activation key), or provide web/.env.rb-smoke");
  const key = execFileSync(
    "docker",
    ["exec", container, "mysql", `-uroot`, `-p${rootPw}`, "-N", "-B", "dossierApi", "-e", `select activation_key from jhi_user where login='${user}'`],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  ).trim();
  must(key && key !== "NULL", "no activation key found for the new account");
  const act = await fetch(`${API}/api/activate?key=${encodeURIComponent(key)}`);
  must(act.ok, `activate -> ${act.status}`);
  writeFileSync(ENV_FILE, `RB_USER=${user}\nRB_PASS=${pass}\n`, { mode: 0o600 });
  return { user, pass };
}

class Jar {
  cookies = new Map();
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
}
const jar = new Jar();
async function web(method, p, { body, headers } = {}) {
  const res = await fetch(`${WEB}${p}`, {
    method,
    headers: { cookie: jar.header(), ...(body !== undefined ? { "content-type": "application/json" } : {}), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  jar.absorb(res);
  return res;
}
let bearer = "";
async function api(method, p, { body } = {}) {
  return fetch(`${API}${p}`, {
    method,
    headers: { authorization: `Bearer ${bearer}`, ...(body !== undefined ? { "content-type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}
/** Counts pages of a PDF from its own page objects (independent of the web's header). */
function pdfPages(buf) {
  const text = buf.toString("latin1");
  return (text.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
}

/* ── the run ───────────────────────────────────────────────────────────────────────────────── */

let creds = readEnvFile();
await step("account (register+activate or reuse local creds)", async () => {
  if (creds) return "reused web/.env.rb-smoke";
  creds = await createAccount();
  return "created + activated (creds in gitignored web/.env.rb-smoke)";
});
if (!creds) finish();

await step("sign in through the web", async () => {
  const res = await web("POST", "/api/auth/login", { body: { username: creds.user, password: creds.pass } });
  must(res.status === 200, `login -> ${res.status} ${await res.text()}`);
  bearer = jar.cookies.get("kiwiply_access") ?? "";
  must(bearer, "no kiwiply_access cookie set");
});
if (!bearer) finish();

const profileVersion = async () => {
  const res = await api("GET", "/api/profile/version");
  must(res.ok, `GET /api/profile/version -> ${res.status}`);
  return (await res.json()).version;
};

let v0, v1, v2;
let resumeId, etag, doc, createdHash;
let editedText;

await step("GET /api/profile/version", async () => {
  v0 = await profileVersion();
  must(typeof v0 === "string" && v0.length > 0, "empty version");
  return v0.slice(0, 10);
});

await step("POST built resume (web BFF)", async () => {
  const res = await web("POST", "/api/resumes/built", { body: { templateId: "modern", label: `rb-smoke ${new Date().toISOString()}` } });
  const text = await res.text();
  must(res.status === 201, `-> ${res.status} ${text.slice(0, 300)}`);
  const dto = JSON.parse(text);
  resumeId = dto.resume?.id;
  must(resumeId, "no resume.id");
  createdHash = dto.doc?.contentHash;
  return `resume ${resumeId}`;
});
if (!resumeId) finish();

await step("GET doc + ETag", async () => {
  const res = await web("GET", `/api/resumes/${resumeId}/doc`);
  must(res.status === 200, `-> ${res.status}`);
  etag = res.headers.get("etag");
  must(etag, "no ETag header");
  const dto = await res.json();
  doc = dto.doc;
  must(dto.docVersion !== undefined && dto.contentHash, "dto missing docVersion/contentHash");
  createdHash = dto.contentHash;
  v1 = await profileVersion();
  return `ETag ${etag}, hash ${String(dto.contentHash).slice(0, 8)}`;
});

let putHash;
await step("PUT doc edit with If-Match", async () => {
  editedText = `rb-smoke edit ${Date.now()}`;
  const edited = structuredClone(doc);
  edited.meta = { ...edited.meta, title: editedText };
  edited.sections = edited.sections ?? [];
  // A brand-new account has no summary yet, so the seeded document may not have the section.
  let summary = edited.sections.find((x) => x && x.kind === "SUMMARY");
  if (!summary) {
    summary = { id: "s_rbsmk001", kind: "SUMMARY", items: [] };
    edited.sections.unshift(summary);
  }
  summary.items = summary.items?.length
    ? [{ ...summary.items[0], text: editedText, src: "user" }, ...summary.items.slice(1)]
    : [{ id: "i_rbsmk001", text: editedText, src: "user" }];
  const res = await web("PUT", `/api/resumes/${resumeId}/doc`, { body: { doc: edited }, headers: { "if-match": etag } });
  const text = await res.text();
  must(res.status === 200, `-> ${res.status} ${text.slice(0, 300)}`);
  const newEtag = res.headers.get("etag");
  must(newEtag && newEtag !== etag, `ETag did not advance (${etag} -> ${newEtag})`);
  const dto = JSON.parse(text);
  putHash = dto.contentHash;
  must(putHash && putHash !== createdHash, "contentHash did not change after the edit");
  etag = newEtag;
  return `ETag ${newEtag}`;
});

await step("PUT with stale If-Match -> 409", async () => {
  const res = await web("PUT", `/api/resumes/${resumeId}/doc`, { body: { doc }, headers: { "if-match": '"0"' } });
  must(res.status === 409, `-> ${res.status}`);
  const body = await res.json();
  must(body.code === "DOC_VERSION_CONFLICT", `code ${body.code}`);
});

await step("ProfileVersion changed after the content PUT", async () => {
  v2 = await profileVersion();
  must(v2 !== v1, "ProfileVersion unchanged by the PUT");
  return `${v1.slice(0, 8)} -> ${v2.slice(0, 8)}`;
});

await step("PATCH template modern -> modern", async () => {
  const res = await web("PATCH", `/api/resumes/${resumeId}/doc/template`, { body: { templateId: "modern" } });
  must(res.status === 200, `-> ${res.status} ${(await res.text()).slice(0, 200)}`);
  const newEtag = res.headers.get("etag");
  must(newEtag, "no ETag");
  etag = newEtag;
});

let pdf;
let pagesHeader;
await step("export PDF (web route): 200 application/pdf", async () => {
  const res = await web("POST", `/api/resumes/${resumeId}/export`, { body: { format: "pdf" } });
  if (res.status !== 200) throw new Error(`-> ${res.status} ${(await res.text()).slice(0, 300)}`);
  const type = res.headers.get("content-type") ?? "";
  must(type.startsWith("application/pdf"), `content-type ${type}`);
  pdf = Buffer.from(await res.arrayBuffer());
  must(pdf.subarray(0, 5).toString("latin1") === "%PDF-", "body is not a PDF");
  pagesHeader = Number(res.headers.get("x-resume-pdf-pages"));
  must(res.headers.get("x-resume-pdf-stored") === "1", "x-resume-pdf-stored != 1 (store or record failed)");
  return `${pdf.length} bytes`;
});

await step("PDF page count >= 1", async () => {
  must(pdf, "no PDF");
  const n = pdfPages(pdf);
  must(n >= 1, `counted ${n} pages`);
  must(pagesHeader === n, `header says ${pagesHeader}, PDF has ${n}`);
  return `${n} page(s)`;
});

let storageKey;
await step("resume.r2ObjectKey set", async () => {
  // (/api/resumes/:id is ADMIN-only; the user-scoped list is the real surface.)
  const res = await api("GET", "/api/profile/resumes");
  must(res.ok, `GET /api/profile/resumes -> ${res.status}`);
  const r = (await res.json()).find((x) => x.id === resumeId);
  must(r, `resume ${resumeId} not in the list`);
  storageKey = r.r2ObjectKey;
  must(storageKey, "r2ObjectKey is null");
  return storageKey;
});

await step("file exists under the local storage root", async () => {
  must(storageKey, "no key");
  const file = path.join(STORAGE_ROOT, ...storageKey.split("/"));
  must(existsSync(file), `missing ${file}`);
  const bytes = readFileSync(file);
  must(bytes.length === pdf.length && bytes.equals(pdf), `on-disk ${bytes.length} bytes != exported ${pdf.length}`);
  must(statSync(file).size > 0, "empty file");
  return `${bytes.length} bytes, identical to the download`;
});

await step("exportedHash == contentHash", async () => {
  const res = await web("GET", `/api/resumes/${resumeId}/doc`);
  must(res.status === 200, `-> ${res.status}`);
  const dto = await res.json();
  must(dto.exportedHash, "exportedHash is null");
  must(dto.exportedHash === dto.contentHash, `exportedHash ${dto.exportedHash} != contentHash ${dto.contentHash}`);
  must(dto.contentHash === putHash, "contentHash moved since the PUT");
  return String(dto.contentHash).slice(0, 8);
});

finish();

function finish() {
  const w = Math.max(...rows.map((r) => r.name.length));
  console.log("");
  for (const r of rows) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name.padEnd(w)}  ${r.detail}`);
  const failed = rows.filter((r) => !r.ok).length;
  console.log(`\n${rows.length - failed}/${rows.length} passed`);
  process.exit(failed ? 1 : 0);
}
