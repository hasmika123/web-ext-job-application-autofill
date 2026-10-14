// WP5 — JAF.workspace (pure logic): URL keys (golden fixture shared with the server team), page ->
// assigned-job matching, the marketer's trim + BOARD RULE (against real captureJob output), the
// save payload/validation/result copy, mode selection, the assigned-jobs cache, and the
// post-submit opportunity link. No network; the provider is a fake.
const fs = require("fs");
const path = require("path");
const { makeWindow, load } = require("./harness");
let pass = 0, fail = 0;
const fails = [];
const tag = "[workspace]";
function ok(n, c, e) { if (c) pass++; else { fail++; fails.push(n + (e ? "  ->  " + e : "")); } }
function eq(n, g, w) { ok(n, JSON.stringify(g) === JSON.stringify(w), `got ${JSON.stringify(g)} want ${JSON.stringify(w)}`); }

function win(html, url) {
  const w = makeWindow(html, url ? { url } : undefined);
  load(w, "src/lib/job-capture.js");
  load(w, "src/lib/storage.js");
  load(w, "src/lib/app-tracking.js");
  load(w, "src/lib/workspace.js");
  return w;
}

(async function run() {
  const w = win();
  const WS = w.JAF.workspace;

  /* ---- URL keys: the shared golden file ---- */
  const golden = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "url-keys.json"), "utf8"));
  ok("golden file has cases", golden.cases.length >= 10);
  for (const c of golden.cases) eq("urlKey: " + c.name, WS.urlKey(c.input), c.key);
  // the server's url_key_hash is the SHA-256 hex of the key: the fixture carries it so both sides check the same bytes
  const sha = (k) => require("crypto").createHash("sha256").update(k, "utf8").digest("hex");
  for (const c of golden.cases) if (c.key) eq("urlKey hash: " + c.name, sha(WS.urlKey(c.input)), c.hash);
  ok("golden has the port, encoding and unsafe-character cases",
    ["non-default https port is kept", "non-ASCII path and query are percent-encoded as UTF-8", "pipe, caret and braces are encoded (never rejected)"]
      .every((n) => golden.cases.some((c) => c.name === n)));
  eq("urlKey: null/undefined -> ''", [WS.urlKey(null), WS.urlKey(undefined)], ["", ""]);
  const long = "https://example.com/jobs?x=" + "a".repeat(1500);
  eq("urlKey: capped at the golden maxLength", WS.urlKey(long).length, golden.maxLength);
  eq("urlKey: golden maxLength is 1000", golden.maxLength, 1000);
  ok("urlKey: idempotent", golden.cases.every((c) => WS.urlKey(WS.urlKey(c.input)) === WS.urlKey(c.input)));

  /* ---- matching a page to an assigned job ---- */
  const jobs = [
    { id: 1, atsPlatform: "greenhouse", externalJobId: "4012345", jobUrl: "https://boards.greenhouse.io/acme/jobs/4012345" },
    { id: 2, atsPlatform: "linkedin", externalJobId: "3856789012", jobUrl: "https://www.linkedin.com/jobs/view/3856789012/" },
    { id: 3, atsPlatform: null, externalJobId: null, jobUrl: "https://careers.initech.com/openings/77?utm_source=x" },
  ];
  eq("match: by (ats, externalJobId)", (WS.matchOpportunity(jobs, { atsPlatform: "greenhouse", externalJobId: "4012345", urls: [] }) || {}).job.id, 1);
  eq("match: id match reports 'id'", WS.matchOpportunity(jobs, { atsPlatform: "greenhouse", externalJobId: "4012345" }).by, "id");
  eq("match: ats compare is case-insensitive", WS.matchOpportunity(jobs, { atsPlatform: "LinkedIn", externalJobId: "3856789012" }).job.id, 2);
  eq("match: LinkedIn COLLECTION url (currentJobId) -> same job via the id", WS.matchOpportunity(jobs, { atsPlatform: "linkedin", externalJobId: "3856789012", urls: ["https://www.linkedin.com/jobs/collections/recommended/?currentJobId=3856789012"] }).job.id, 2);
  eq("match: same id under ANOTHER platform does not match", WS.matchOpportunity(jobs, { atsPlatform: "indeed", externalJobId: "4012345" }), null);
  const byUrl = WS.matchOpportunity(jobs, { atsPlatform: null, urls: ["https://careers.initech.com/openings/77/?trk=abc#top"] });
  ok("match: by normalised url when there is no id", byUrl && byUrl.job.id === 3 && byUrl.by === "url");
  eq("match: id wins over url", WS.matchOpportunity(jobs, { atsPlatform: "greenhouse", externalJobId: "4012345", urls: ["https://careers.initech.com/openings/77"] }).job.id, 1);
  eq("match: unrelated page -> null", WS.matchOpportunity(jobs, { atsPlatform: null, externalJobId: undefined, urls: ["https://example.com/x"] }), null);
  eq("match: empty list / junk ctx -> null", [WS.matchOpportunity([], { urls: ["https://a.com"] }), WS.matchOpportunity(jobs, null)], [null, null]);
  ok("match: never matches on company/title alone", WS.matchOpportunity([{ id: 9, title: "Eng", company: "Acme" }], { urls: [], company: "Acme", role: "Eng" }) === null);

  /* ---- unsupported-ATS copy ---- */
  ok("manual 'I applied' where nothing is auto-detected", WS.needsManualApplied("linkedin") && WS.needsManualApplied("dice") && WS.needsManualApplied("indeed") && WS.needsManualApplied(null) && WS.needsManualApplied("google"));
  ok("no manual hint where the extension detects a submit", !WS.needsManualApplied("greenhouse") && !WS.needsManualApplied("workday") && !WS.needsManualApplied("lever"));
  eq("copy", WS.MANUAL_APPLIED_COPY, "Press I applied after you submit.");

  /* ---- trimCapture: a LinkedIn page that only has og: tags ---- */
  const LI_COLL = "https://www.linkedin.com/jobs/collections/recommended/?currentJobId=3856789012";
  const liDoc = win(
    '<head><meta property="og:title" content="Staff Engineer"><meta property="og:site_name" content="LinkedIn">' +
    '<meta name="description" content="A very long description that must never be sent to the server."></head>',
    LI_COLL
  );
  const liCap = liDoc.JAF.jobCapture.captureJob({ doc: liDoc.document, loc: { href: LI_COLL }, adapter: null });
  eq("fixture sanity: og-only LinkedIn capture has company 'LinkedIn' from generic", [liCap.company, liCap.sources.company], ["LinkedIn", "generic"]);
  const liTrim = liDoc.JAF.workspace.trimCapture(liCap);
  ok("BOARD RULE: LinkedIn og-only company is blanked, never 'LinkedIn'", !("company" in liTrim), JSON.stringify(liTrim));
  eq("LinkedIn og-only: role kept as title", liTrim.title, "Staff Engineer");
  eq("LinkedIn: identity kept", [liTrim.atsPlatform, liTrim.externalJobId], ["linkedin", "3856789012"]);
  eq("LinkedIn collection url is sent as the canonical view url", liTrim.jobUrl, "https://www.linkedin.com/jobs/view/3856789012/");
  ok("jobDescription is dropped", !("jobDescription" in liTrim) && JSON.stringify(liTrim).indexOf("very long description") === -1);
  eq("missingFields asks the marketer for the company", WS.missingFields(liTrim), ["company"]);

  // LinkedIn with real JSON-LD: the company is real, so it is kept.
  const liLd = win(
    '<head><script type="application/ld+json">' +
    JSON.stringify({ "@type": "JobPosting", title: "Staff Engineer", hiringOrganization: { name: "Acme" }, description: "Build things.", jobLocationType: "TELECOMMUTE", employmentType: "FULL_TIME", baseSalary: { "@type": "MonetaryAmount", currency: "USD", value: { minValue: 150000, maxValue: 180000, unitText: "YEAR" } } }) +
    "</script></head>"
  );
  const ldCap = liLd.JAF.jobCapture.captureJob({ doc: liLd.document, loc: { href: "https://www.linkedin.com/jobs/view/3856789012/" }, adapter: null });
  const ldTrim = liLd.JAF.workspace.trimCapture(ldCap);
  eq("JSON-LD company on a board is kept", ldTrim.company, "Acme");
  eq("jobMode -> workMode, jobType -> employmentType", [ldTrim.workMode, ldTrim.employmentType], ["REMOTE", "FULL_TIME"]);
  eq("salaryParsed -> pay fields", [ldTrim.payMin, ldTrim.payMax, ldTrim.payPeriod], [150000, 180000, "YEAR"]);
  ok("salary string -> payLabel", /150,000/.test(ldTrim.payLabel), ldTrim.payLabel);
  eq("a /jobs/view url is left alone", ldTrim.jobUrl, "https://www.linkedin.com/jobs/view/3856789012/");

  // Other boards with a generic-only company
  for (const ats of ["indeed", "dice", "google"]) {
    const t = WS.trimCapture({ role: "Dev", company: "Indeed", atsPlatform: ats, jobUrl: "https://x.test/", sources: { company: "generic" } });
    ok("BOARD RULE: " + ats + " generic company blanked", !("company" in t));
  }
  // A non-board page with only og:site_name: that IS the employer's own site -> keep
  eq("non-board generic company kept", WS.trimCapture({ role: "Dev", company: "Initech", atsPlatform: null, sources: { company: "generic" } }).company, "Initech");
  eq("ATS adapter company kept", WS.trimCapture({ role: "Dev", company: "Acme", atsPlatform: "greenhouse", sources: { company: "adapter" } }).company, "Acme");
  eq("board with jsonld source keeps company", WS.trimCapture({ role: "Dev", company: "Acme", atsPlatform: "dice", sources: { company: "jsonld" } }).company, "Acme");

  // Never guess / never invent
  eq("empty capture trims to nothing", WS.trimCapture({}), {});
  eq("weekly pay is sent as a label only", Object.keys(WS.trimCapture({ salaryParsed: { min: 10, max: 20, period: "WEEK" }, salary: "$10-20/wk" })), ["payLabel"]);
  eq("pay numbers need a known period", "payMin" in WS.trimCapture({ salaryParsed: { min: 10, max: 20 } }), false);
  eq("junk workMode dropped", "workMode" in WS.trimCapture({ jobMode: "WHATEVER" }), false);
  eq("postedOn normalised to a date", WS.trimCapture({ postedOn: "2026-10-01T09:00:00Z" }).postedOn, "2026-10-01");
  eq("payLabel capped at 80", WS.trimCapture({ salary: "x".repeat(200) }).payLabel.length, 80);

  /* ---- buildSavePayload / validateSave ---- */
  const trimmed = { title: "Staff Engineer", jobUrl: "https://www.linkedin.com/jobs/view/3856789012/", atsPlatform: "linkedin", externalJobId: "3856789012" };
  const body = WS.buildSavePayload(trimmed, { company: " Acme ", keyInfo: "  Great fit.  ", consultantIds: ["4", 5], priority: "HIGH", dueOn: "2026-11-01" });
  eq("payload: typed company + trimmed keyInfo + numeric ids", [body.company, body.keyInfo, body.consultantIds, body.priority, body.dueOn], ["Acme", "Great fit.", [4, 5], "HIGH", "2026-11-01"]);
  ok("payload: never state/appliedAt/jobDescription", !("state" in body) && !("appliedAt" in body) && !("jobDescription" in body));
  eq("valid payload has no problems", WS.validateSave(body), []);
  const mk = (extra) => WS.validateSave(WS.buildSavePayload(trimmed, Object.assign({ company: "A", keyInfo: "k", consultantIds: [1] }, extra)));
  ok("missing company flagged", WS.validateSave(WS.buildSavePayload(trimmed, { keyInfo: "x", consultantIds: [1] })).some((p) => /company/i.test(p)));
  ok("missing note flagged", mk({ keyInfo: "" }).some((p) => /note/i.test(p)));
  ok("keyInfo over 1000 flagged", mk({ keyInfo: "k".repeat(1001) }).some((p) => /1000/.test(p)));
  ok("no consultant flagged", mk({ consultantIds: [] }).some((p) => /consultant/i.test(p)));
  ok("more than 20 consultants flagged", mk({ consultantIds: Array.from({ length: 21 }, (_, i) => i + 1) }).some((p) => /20/.test(p)));
  const mkUrl = (jobUrl) => WS.validateSave(WS.buildSavePayload({ title: "T", jobUrl }, { company: "A", keyInfo: "k", consultantIds: [1] }));
  ok("http (not https) link flagged", mkUrl("http://x.com/a").some((p) => /https/.test(p)));
  ok("localhost and ip links flagged", mkUrl("https://localhost/a").length > 0 && mkUrl("https://10.0.0.1/a").length > 0);
  ok("a normal https link passes", mkUrl("https://x.com/a").length === 0);
  ok("bad priority / date flagged", WS.validateSave(Object.assign({}, body, { priority: "URGENT" })).length === 1 && WS.validateSave(Object.assign({}, body, { dueOn: "tomorrow" })).length === 1);

  /* ---- result copy ---- */
  const names = { 4: "Ada", 5: "Grace", 6: "Linus" };
  const created = WS.describeSaveResult({ results: [{ consultantId: 4, existing: false }, { consultantId: 5, existing: true }, { consultantId: 6, reason: "CONSULTANT_INACTIVE" }] }, names);
  eq("result: created variant/title", [created.variant, created.title], ["success", "Saved for consultant"]);
  ok("result: names created / existing / reason", /Sent to Ada/.test(created.description) && /Already assigned to Grace/.test(created.description) && /Linus isn't active/.test(created.description), created.description);
  eq("result: all existing is a success 'Already saved'", WS.describeSaveResult({ results: [{ consultantId: 4, existing: true }] }, names).title, "Already saved");
  eq("result: nothing saved is an error", WS.describeSaveResult({ results: [{ consultantId: 6, reason: "NOT_IN_SCOPE" }] }, names).variant, "error");
  ok("error copy: 422 / 409 / offline", /sensitive/i.test(WS.describeSaveError({ status: 422 })) && /closed/i.test(WS.describeSaveError({ status: 409 })) && /reach/i.test(WS.describeSaveError({ status: 0 })));

  /* ---- idempotency key: crypto.randomUUID only, no guessable fallback ---- */
  const wk = win();
  Object.defineProperty(wk, "crypto", { configurable: true, value: { randomUUID: () => "11111111-2222-3333-4444-555555555555" } });
  eq("newIdempotencyKey uses crypto.randomUUID", wk.JAF.workspace.newIdempotencyKey(), "11111111-2222-3333-4444-555555555555");
  Object.defineProperty(wk, "crypto", { configurable: true, value: {} });
  let threw = false;
  try { wk.JAF.workspace.newIdempotencyKey(); } catch (e) { threw = /randomUUID/.test(e.message); }
  ok("no guessable fallback when crypto.randomUUID is missing", threw);

  /* ---- mode selection ---- */
  const orgs = [
    { orgId: 7, name: "Acme Staffing", consultant: false, marketer: true },
    { orgId: 8, name: "Initech", consultant: true, marketer: false },
    { orgId: 9, name: "Both Co", consultant: true, marketer: true },
    { orgId: 10, name: "Empty Co", consultant: false, marketer: false },
  ];
  eq("mode: personal by default", WS.modeOf(orgs, undefined).kind, "personal");
  eq("mode: 'personal' literal", WS.modeOf(orgs, "personal").kind, "personal");
  eq("mode: no orgs at all", WS.modeOf([], 7).kind, "personal");
  eq("mode: marketer && !consultant -> marketer", WS.modeOf(orgs, 7).kind, "marketer");
  eq("mode: consultant -> consultant", WS.modeOf(orgs, 8).kind, "consultant");
  eq("mode: marketer AND consultant -> consultant (fill + Jobs tab)", WS.modeOf(orgs, 9).kind, "consultant");
  eq("mode: neither role -> org (plain drawer)", WS.modeOf(orgs, 10).kind, "org");
  eq("mode: stale org id falls back to personal, never another org", WS.modeOf(orgs, 99).kind, "personal");
  eq("mode: numeric string id", WS.modeOf(orgs, "7").kind, "marketer");
  eq("surfaces: marketer has no fill/profile/resumes", WS.surfacesOf("marketer"), { fill: false, profile: false, resumes: false, jobsTab: false, saveForConsultant: true });
  eq("surfaces: consultant gets the Jobs tab", WS.surfacesOf("consultant").jobsTab, true);
  eq("surfaces: personal unchanged", WS.surfacesOf("personal"), { fill: true, profile: true, resumes: true, jobsTab: false, saveForConsultant: false });

  /* ---- assigned jobs: fetch + cache under ws:<orgId>:assignedJobs ---- */
  const S = w.JAF.storage;
  const prov = { assignedJobs: async (orgId) => { prov.last = orgId; return [{ id: 1, title: "A" }]; } };
  const first = await WS.loadAssignedJobs(prov, S, 42);
  eq("loadAssignedJobs: fresh", [first.stale, first.items.length, prov.last], [false, 1, 42]);
  const raw = await new Promise((r) => w.chrome.storage.local.get(null, r));
  ok("loadAssignedJobs: cached under ws:42:assignedJobs", raw["ws:42:assignedJobs"] && raw["ws:42:assignedJobs"].items.length === 1, Object.keys(raw).join(","));
  const offline = await WS.loadAssignedJobs({ assignedJobs: async () => { throw new Error("offline"); } }, S, 42);
  eq("loadAssignedJobs: offline -> last cached, flagged stale", [offline.stale, offline.items.length], [true, 1]);
  let rejected = false;
  try { await WS.loadAssignedJobs({ assignedJobs: async () => { throw new Error("offline"); } }, S, 43); } catch (e) { rejected = true; }
  ok("loadAssignedJobs: offline with no cache -> rejects", rejected);

  /* ---- consultant: opportunity ref + best-effort link after the confirmed submit ---- */
  const AT = w.JAF.appTracking;
  eq("opportunityRef: keeps two positive ints only", AT.opportunityRef({ orgId: "5", id: 9, evil: "../x" }), { orgId: 5, id: 9 });
  eq("opportunityRef: junk -> null", [AT.opportunityRef(null), AT.opportunityRef({ orgId: 0, id: 1 }), AT.opportunityRef({ orgId: 1, id: "a" }), AT.opportunityRef({ orgId: 1.5, id: 1 }), AT.opportunityRef("x")], [null, null, null, null, null]);
  const calls = [];
  const linker = { linkOpportunity: async (o, i, b) => { calls.push([o, i, b]); return {}; } };
  eq("link after submit: sends applicationId", [await AT.linkOpportunityAfterSubmit(linker, { serverId: 99, opportunity: { orgId: 5, id: 9 } }), calls[0]], [true, [5, 9, { applicationId: 99 }]]);
  eq("link after submit: no opportunity -> nothing sent", [await AT.linkOpportunityAfterSubmit(linker, { serverId: 99 }), calls.length], [false, 1]);
  const boom = { linkOpportunity: async () => { throw new Error("500"); } };
  let leaked = false, r;
  try { r = await AT.linkOpportunityAfterSubmit(boom, { serverId: 1, opportunity: { orgId: 5, id: 9 } }); } catch (e) { leaked = true; }
  ok("link after submit: a failing link never throws into the user's flow", !leaked && r === false);
  eq("link after submit: provider without the method is a no-op", await AT.linkOpportunityAfterSubmit({}, { opportunity: { orgId: 5, id: 9 } }), false);

  report();
})().catch((e) => { fail++; fails.push("async run threw -> " + (e && e.stack || e)); report(); });

function report() {
  console.log(`${tag} ${pass} passed, ${fail} failed`);
  if (fails.length) { console.log(`${tag} Failures:`); fails.forEach((f) => console.log("  x " + f)); process.exit(1); }
  console.log(`${tag} All green.`);
}
