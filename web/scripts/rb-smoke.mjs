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
 * The second half ("overnight flow") covers the four ways to start a resume, Save -> stored PDF on disk, cached
 * downloads, reload, rename / primary, share link + revoke, Duplicate and Download original. It needs the web
 * started with RESUME_PDF_WORKER=1 and DOSSIER_INTERNAL_TOKEN (same value on the API), and the API's
 * JHIPSTER_MAIL_BASEURL set to the web origin so share links carry a usable URL.
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

// The account is a throwaway and the Free plan keeps 3 resumes: start every run from an empty list so a
// reused account (web/.env.rb-smoke) behaves like a fresh one.
await step("clean slate: delete the throwaway account's resumes from earlier runs", async () => {
  const res = await api("GET", "/api/profile/resumes");
  must(res.ok, `GET /api/profile/resumes -> ${res.status}`);
  const all = await res.json();
  for (const r of all) {
    const d = await web("DELETE", `/api/resumes/${r.id}`);
    must(d.status === 200 || d.status === 204, `delete ${r.id} -> ${d.status}`);
  }
  return `${all.length} removed`;
});

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

await step("exportedHash == renderHash, PDF READY (R3.7: the stored hash is the render hash)", async () => {
  const res = await web("GET", `/api/resumes/${resumeId}/doc`);
  must(res.status === 200, `-> ${res.status}`);
  const dto = await res.json();
  must(dto.exportedHash, "exportedHash is null");
  must(dto.exportedHash === dto.renderHash, `exportedHash ${dto.exportedHash} != renderHash ${dto.renderHash}`);
  must(dto.pdf?.status === "READY", `pdf ${dto.pdf?.status}`);
  must(dto.contentHash === putHash, "contentHash moved since the PUT");
  return String(dto.renderHash).slice(0, 8);
});

/* ── the overnight flow (R2.6 + R3.3 + R3.9 + R3.10 + R3.11 integration) ─────────────────────────────
 * Four ways to start (profile / scratch / upload / copy), an edit, Save (checkpoint) -> the stored PDF
 * goes READY on disk, cached downloads (PDF + TXT), a reload that returns the saved content and the READY
 * PDF, rename / primary through the metadata, a share link that opens publicly and 404s once revoked,
 * and the header menu's Duplicate + Download original. All over HTTP against the real stack. */
const STRUCTURED = {
  summary: "Backend engineer who ships reliable payment services.",
  skills: ["Java", "SQL", "Kubernetes"],
  experience: [
    { company: "Acme", title: "Engineer", location: "NYC", startDate: "Jan 2020", endDate: "Present", current: true, bullets: ["Built the billing service", "Cut p99 latency by 40%"] },
    { company: "Globex", title: "Intern", location: "", startDate: "2018", endDate: "2019", current: false, bullets: ["Learned a lot"] },
  ],
  education: [{ school: "MIT", degree: "BS", field: "CS", startDate: "2014", endDate: "2018", gpa: "", location: "" }],
  languages: [],
  projects: [],
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const json = async (res) => {
  const t = await res.text();
  try {
    return JSON.parse(t);
  } catch {
    return { _raw: t.slice(0, 200) };
  }
};

async function waitPdf(id, want = "READY", ms = 90_000) {
  const t0 = Date.now();
  let last;
  while (Date.now() - t0 < ms) {
    const res = await web("GET", `/api/resumes/${id}/doc/pdf-status`);
    last = await json(res);
    if (last.status === want) return last;
    if (last.status === "FAILED") throw new Error(`pdf FAILED: ${last.error}`);
    await sleep(1000);
  }
  throw new Error(`pdf never ${want} (last ${last?.status})`);
}

async function createBuilt(body) {
  const res = await web("POST", "/api/resumes/built", { body });
  const dto = await json(res);
  return { status: res.status, dto, id: dto.resume?.id };
}

async function listRow(id) {
  const res = await api("GET", "/api/profile/resumes");
  return (await res.json()).find((x) => x.id === id);
}

/** edit the summary text of a doc and PUT it; returns { etag, text }. */
async function editSummary(id, text) {
  const g = await web("GET", `/api/resumes/${id}/doc`);
  const et = g.headers.get("etag");
  const dto = await g.json();
  const d = structuredClone(dto.doc);
  let s = d.sections.find((x) => x.kind === "SUMMARY");
  if (!s) {
    s = { id: "s_rbov0001", kind: "SUMMARY", title: "Summary", items: [] };
    d.sections.unshift(s);
  }
  s.items = [{ id: s.items[0]?.id ?? "i_rbov0001", text, src: "user" }];
  const put = await web("PUT", `/api/resumes/${id}/doc`, { body: { doc: d }, headers: { "if-match": et } });
  must(put.status === 200, `PUT -> ${put.status} ${(await put.text()).slice(0, 200)}`);
  return put.headers.get("etag");
}

const summaryOf = (doc) => doc.sections.find((x) => x.kind === "SUMMARY")?.items?.[0]?.text;

/** edit -> Save -> READY PDF on disk == cached download; TXT; reload. */
async function saveAndProve(label, id) {
  const text = `overnight ${label} ${Date.now()}`;
  await step(`${label}: edit (PUT) + Save checkpoint`, async () => {
    await editSummary(id, text);
    const cp = await web("POST", `/api/resumes/${id}/doc/checkpoint`, { body: {} });
    const body = await json(cp);
    must(cp.status === 200, `checkpoint -> ${cp.status} ${JSON.stringify(body).slice(0, 200)}`);
    must(typeof body.versionNo === "number", "no versionNo");
    return `v${body.versionNo} ${body.reason}, pdf ${body.pdf?.status}`;
  });
  let key;
  await step(`${label}: stored PDF READY, file in local storage`, async () => {
    const st = await waitPdf(id);
    const row = await listRow(id);
    key = row?.r2ObjectKey;
    must(key, "r2ObjectKey not set");
    const file = path.join(STORAGE_ROOT, ...key.split("/"));
    must(existsSync(file), `missing ${file}`);
    const bytes = readFileSync(file);
    must(bytes.subarray(0, 5).toString("latin1") === "%PDF-", "stored file is not a PDF");
    return `${st.status}, ${bytes.length} bytes at ${key.split("/").slice(-1)[0]}`;
  });
  await step(`${label}: card thumbnail (PNG on disk, served with its ETag, 304 on revalidate, in the list)`, async () => {
    const hash = (await listRow(id))?.thumbHash;
    must(hash, "the list row carries no thumbHash");
    const res = await web("GET", `/api/resumes/${id}/thumbnail?v=${hash}`);
    must(res.status === 200, `thumbnail -> ${res.status}`);
    must(res.headers.get("content-type") === "image/png", `content-type ${res.headers.get("content-type")}`);
    const etag = res.headers.get("etag");
    must(etag === `"${hash}"`, `etag ${etag} != "${hash}"`);
    must((res.headers.get("cache-control") ?? "").includes("max-age=86400"), `cache-control ${res.headers.get("cache-control")}`);
    const png = Buffer.from(await res.arrayBuffer());
    must(png.subarray(1, 4).toString("latin1") === "PNG", "not a PNG");
    const again = await web("GET", `/api/resumes/${id}/thumbnail`, { headers: { "if-none-match": etag } });
    must(again.status === 304, `revalidation -> ${again.status}`);
    const thumbs = path.join(STORAGE_ROOT, "resume-thumbs");
    must(existsSync(thumbs), "no resume-thumbs directory in storage");
    return `${png.length} bytes png, hash ${hash.slice(0, 8)}`;
  });
  await step(`${label}: cached export PDF (no re-render) + TXT`, async () => {
    const res = await web("GET", `/api/resumes/${id}/export?format=pdf&cached=1`);
    must(res.status === 200, `pdf -> ${res.status}`);
    must(res.headers.get("x-resume-pdf-cached") === "1", "not served from the stored PDF (x-resume-pdf-cached != 1)");
    const bytes = Buffer.from(await res.arrayBuffer());
    const disk = readFileSync(path.join(STORAGE_ROOT, ...key.split("/")));
    must(bytes.equals(disk), "download differs from the stored file");
    const tx = await web("GET", `/api/resumes/${id}/export?format=txt`);
    must(tx.status === 200, `txt -> ${tx.status}`);
    const t = await tx.text();
    must(t.includes(text), "txt lacks the edited summary");
    return `${bytes.length} bytes pdf, ${t.length} chars txt`;
  });
  await step(`${label}: reload returns the saved content + READY PDF`, async () => {
    const res = await web("GET", `/api/resumes/${id}/doc`);
    must(res.status === 200, `-> ${res.status}`);
    const dto = await res.json();
    must(summaryOf(dto.doc) === text, `summary is "${summaryOf(dto.doc)}"`);
    must(dto.pdf?.status === "READY", `pdf ${dto.pdf?.status}`);
    must(dto.exportedHash && dto.exportedHash === dto.renderHash, "exportedHash != renderHash after Save (the stored PDF is not this render)");
    return `docVersion ${dto.docVersion}`;
  });
  return text;
}

// 1. profile
let pid;
await step("create via source=profile", async () => {
  const r = await createBuilt({ source: { kind: "profile" }, label: "overnight profile", templateId: "modern" });
  must(r.status === 201, `-> ${r.status} ${JSON.stringify(r.dto).slice(0, 200)}`);
  pid = r.id;
  must(r.dto.doc?.doc?.sections !== undefined, "no document");
  return `resume ${pid}`;
});
let profileText;
if (pid) profileText = await saveAndProve("profile", pid);

// meta: rename + primary, share link
if (pid) {
  await step("rename + set primary through meta, reload shows both", async () => {
    const rn = await web("PATCH", `/api/resumes/${pid}/meta`, { body: { name: "Overnight Primary" } });
    must(rn.status === 200, `rename -> ${rn.status} ${(await rn.text()).slice(0, 200)}`);
    const pr = await web("PATCH", `/api/resumes/${pid}/meta`, { body: { primary: true } });
    must(pr.status === 200, `primary -> ${pr.status}`);
    const m = await json(await web("GET", `/api/resumes/${pid}/meta`));
    must(m.name === "Overnight Primary", `name ${m.name}`);
    must(m.primary === true, "not primary");
    const dto = await (await web("GET", `/api/resumes/${pid}/doc`)).json();
    must(dto.doc.meta.title === "Overnight Primary", `doc title ${dto.doc.meta.title}`);
    must(dto.pdf?.status === "READY", `a rename must not stale the PDF (${dto.pdf?.status})`);
    return "name + primary persisted, PDF still READY";
  });
  let link;
  await step("share link opens publicly, then 404 after revoke", async () => {
    const mk = await web("POST", `/api/resumes/${pid}/access/link`, { body: { label: "smoke", allowDownload: true } });
    const g = await json(mk);
    must(mk.status === 201, `create -> ${mk.status} ${JSON.stringify(g).slice(0, 200)}`);
    link = g;
    const token = /\/r\/([A-Za-z0-9]+)/.exec(g.url ?? "")?.[1];
    must(token, `no token in url ${g.url}`);
    const pub = await fetch(`${WEB}/r/${token}`);
    must(pub.status === 200, `public page -> ${pub.status}`);
    const html = await pub.text();
    must(html.includes(profileText), "public page lacks the saved summary");
    const pp = await fetch(`${WEB}/r/${token}/pdf`);
    must(pp.status === 200 && (await pp.arrayBuffer()).byteLength > 1000, `public pdf -> ${pp.status}`);
    const rv = await web("DELETE", `/api/resumes/${pid}/access/${g.id}`);
    must(rv.status === 200 || rv.status === 204, `revoke -> ${rv.status}`);
    const gone = await fetch(`${WEB}/r/${token}`);
    must(gone.status === 404, `after revoke -> ${gone.status}`);
    return `open 200 (page + pdf), revoked -> 404`;
  });
}

// 2. copy (from the profile resume)
if (pid) {
  let cid;
  await step("create via source=copy", async () => {
    const r = await createBuilt({ source: { kind: "copy", fromResumeId: pid } });
    must(r.status === 201, `-> ${r.status} ${JSON.stringify(r.dto).slice(0, 200)}`);
    cid = r.id;
    must(cid !== pid, "same id");
    must(summaryOf(r.dto.doc.doc) === profileText, "copy lacks the source's summary");
    return `resume ${cid} copied from ${pid}`;
  });
  if (cid) {
    await saveAndProve("copy", cid);
    await step("delete the copy (frees a slot)", async () => {
      const d = await web("DELETE", `/api/resumes/${cid}`);
      must(d.status === 200 || d.status === 204, `-> ${d.status}`);
    });
  }
}

// 3. scratch
{
  let sid;
  await step("create via source=scratch", async () => {
    const r = await createBuilt({ source: { kind: "scratch" }, label: "overnight scratch" });
    must(r.status === 201, `-> ${r.status} ${JSON.stringify(r.dto).slice(0, 200)}`);
    sid = r.id;
    must((r.dto.doc.doc.sections ?? []).length === 0, `scratch should be empty, has ${(r.dto.doc.doc.sections ?? []).length} sections`);
    return `resume ${sid}, empty`;
  });
  if (sid) {
    await saveAndProve("scratch", sid);
    await step("delete the scratch resume (frees a slot)", async () => {
      const d = await web("DELETE", `/api/resumes/${sid}`);
      must(d.status === 200 || d.status === 204, `-> ${d.status}`);
    });
  }
}

// 4. upload (parsed structure) + the original file kept aside
let uid;
await step("create via source=upload (parsed structure)", async () => {
  const r = await createBuilt({ source: { kind: "upload", fileName: "Ada CV.txt", structured: STRUCTURED, bio: { firstName: "Ada", email: "ada@example.test" } } });
  must(r.status === 201, `-> ${r.status} ${JSON.stringify(r.dto).slice(0, 200)}`);
  uid = r.id;
  const kinds = r.dto.doc.doc.sections.map((s) => s.kind);
  must(kinds.includes("EXPERIENCE") && kinds.includes("EDUCATION"), `sections ${kinds}`);
  must(r.dto.resume.label === "Ada CV", `label ${r.dto.resume.label}`);
  return `resume ${uid}: ${kinds.join(", ")}`;
});
if (uid) {
  await step("upload: attach the original file; meta.hasOriginal + Download original", async () => {
    const before = await json(await web("GET", `/api/resumes/${uid}/meta`));
    must(before.hasOriginal === false, `hasOriginal before = ${before.hasOriginal}`);
    const fd = new FormData();
    fd.append("file", new Blob(["Ada Lovelace - resume text fixture"], { type: "text/plain" }), "Ada CV.txt");
    const up = await fetch(`${WEB}/api/resumes/${uid}/file`, { method: "POST", headers: { cookie: jar.header() }, body: fd });
    must(up.status === 200 || up.status === 201 || up.status === 204, `attach -> ${up.status} ${(await up.text()).slice(0, 200)}`);
    const after = await json(await web("GET", `/api/resumes/${uid}/meta`));
    must(after.hasOriginal === true, `hasOriginal after = ${after.hasOriginal}`);
    const dl = await web("GET", `/api/resumes/${uid}/original`);
    must(dl.status === 200, `original -> ${dl.status}`);
    must((await dl.text()).includes("Ada Lovelace"), "original bytes differ");
    return "hasOriginal false -> true, original downloads";
  });
  await saveAndProve("upload", uid);
}

// 5. header menu Duplicate (plan cap, then success)
if (uid) {
  await step("Duplicate at the Free cap -> 402 RESUME_LIMIT", async () => {
    const live = (await (await api("GET", "/api/profile/resumes")).json()).filter((x) => !x.archived).length;
    must(live >= 3, `expected 3 live resumes to hit the cap, have ${live}`);
    const res = await web("POST", `/api/resumes/${uid}/doc/duplicate`, { body: {} });
    const b = await json(res);
    must(res.status === 402 && b.code === "RESUME_LIMIT", `-> ${res.status} ${JSON.stringify(b).slice(0, 160)}`);
    return `${live} live, refused: ${b.plan} limit ${b.limit}`;
  });
  await step("Duplicate after freeing a slot -> a copy named '(copy)'", async () => {
    const del = await web("DELETE", `/api/resumes/${resumeId}`); // the R0 smoke resume
    must(del.status === 200 || del.status === 204, `delete -> ${del.status}`);
    const res = await web("POST", `/api/resumes/${uid}/doc/duplicate`, { body: {} });
    const b = await json(res);
    must(res.status === 201 || res.status === 200, `-> ${res.status} ${JSON.stringify(b).slice(0, 160)}`);
    must(/\(copy\)$/.test(b.resume?.label ?? ""), `label ${b.resume?.label}`);
    const d = await web("DELETE", `/api/resumes/${b.resume.id}`);
    must(d.status === 200 || d.status === 204, `cleanup -> ${d.status}`);
    return `copy ${b.resume.id} "${b.resume.label}"`;
  });
}


finish();

function finish() {
  const w = Math.max(...rows.map((r) => r.name.length));
  console.log("");
  for (const r of rows) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name.padEnd(w)}  ${r.detail}`);
  const failed = rows.filter((r) => !r.ok).length;
  console.log(`\n${rows.length - failed}/${rows.length} passed`);
  process.exit(failed ? 1 : 0);
}
