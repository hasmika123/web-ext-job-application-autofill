// WP5a — the org-workspace methods on the TrackingProvider seam (docs/enterprise-v2/60 §4/§6),
// against a scripted fetch: paths, headers (user token only; no workspace header, no tenant id),
// bodies, DTO mapping, tolerance of absent fields, and error mapping.
const { makeWindow, load } = require("./harness");
let pass = 0, fail = 0;
const fails = [];
const tag = "[org_provider]";
function ok(n, c, e) { if (c) pass++; else { fail++; fails.push(n + (e ? "  ->  " + e : "")); } }
function eq(n, g, w) { ok(n, JSON.stringify(g) === JSON.stringify(w), `got ${JSON.stringify(g)} want ${JSON.stringify(w)}`); }

const w = makeWindow();
load(w, "src/lib/tracking.js");
const T = w.JAF.tracking;

function mockFetch(handler) {
  const calls = [];
  const fn = async (url, opts) => {
    const u = new URL(url);
    const call = {
      method: (opts && opts.method) || "GET",
      path: u.pathname,
      search: u.search,
      full: u.pathname + u.search,
      headers: (opts && opts.headers) || {},
      body: opts && opts.body ? JSON.parse(opts.body) : undefined,
    };
    calls.push(call);
    const r = handler(call) || { status: 200, json: null };
    const text = r.json === null || r.json === undefined ? "" : JSON.stringify(r.json);
    return { ok: r.status >= 200 && r.status < 300, status: r.status, text: async () => text };
  };
  fn.calls = calls;
  return fn;
}
const provider = (handler) => {
  const f = mockFetch(handler);
  return { p: T.createKiwiplyProvider({ baseUrl: "https://api.test", fetch: f, tokenStore: T.memoryTokenStore({ access: "ACC", refresh: "REF" }) }), f };
};
const conDto = (over) => Object.assign({
  id: 11, state: "ASSIGNED",
  job: { id: 5, title: "Staff Engineer", company: "Acme", location: "Remote", workMode: "REMOTE", employmentType: "FULL_TIME", payLabel: "$150k", jobUrl: "https://www.linkedin.com/jobs/view/3856789012/", atsPlatform: "linkedin", externalJobId: "3856789012", postedOn: "2026-10-01", skills: ["go"] },
  marketerNote: "Great fit", assignedBy: { memberId: 3, name: "Sarah" }, assignedAt: "2026-10-02T10:00:00Z", priority: "HIGH", dueOn: "2026-10-20",
  infoRequest: null, infoAnswer: null, appliedAt: null, linkedApplicationId: null, allowedActions: ["VIEWED", "INTEREST", "APPLIED"], version: 2,
}, over || {});

(async function run() {
  /* ---- base class declares the new seam methods ---- */
  const base = new T.TrackingProvider();
  for (const m of ["getAccount", "assignedJobs", "listMarketerConsultants", "saveForConsultant", "linkOpportunity", "respondOpportunity"]) {
    let name = null; try { await base[m](1); } catch (e) { name = e.name; }
    eq("base provider: " + m + " is NotSupported until implemented", name, "NotSupportedError");
  }

  /* ---- workspace DTO mapper ---- */
  eq("dtoToWorkspaces: maps, drops junk, defaults flags to false", T.dtoToWorkspaces([{ orgId: 7, name: "Acme", consultant: true, marketer: "yes" }, { orgId: "x" }, null, { name: "no id" }, { orgId: 8 }]),
    [{ orgId: 7, name: "Acme", consultant: true, marketer: false }, { orgId: 8, name: "Organization", consultant: false, marketer: false }]);
  eq("dtoToWorkspaces: absent / non-array -> []", [T.dtoToWorkspaces(undefined), T.dtoToWorkspaces({})], [[], []]);

  /* ---- profileVersion -> account (doc 19 §6.2), getAccount ---- */
  const ENT = { kind: "ENTERPRISE", orgId: 7, name: "Acme", consultant: false, marketer: true };
  let c = provider(() => ({ status: 200, json: { version: "v1", plan: "PRO", account: ENT, workspaces: [{ orgId: 7, name: "Acme", consultant: false, marketer: true }] } }));
  eq("getAccount: reads account off /api/profile/version", await c.p.getAccount(), ENT);
  eq("getAccount: GET /api/profile/version", [c.f.calls[0].method, c.f.calls[0].path], ["GET", "/api/profile/version"]);
  ok("profileVersion sends no workspace/tenant header", !Object.keys(c.f.calls[0].headers).some((k) => /workspace|tenant|tid/i.test(k)), Object.keys(c.f.calls[0].headers).join(","));
  c = provider(() => ({ status: 200, json: { version: "v1", plan: "FREE", account: { kind: "PERSONAL", orgId: null, name: null, consultant: false, marketer: false }, workspaces: [] } }));
  const pv = await c.p.profileVersion();
  eq("profileVersion: {version, plan, account} for a personal account", [pv.version, pv.plan, pv.account], ["v1", "FREE", { kind: "PERSONAL", orgId: null, name: null, consultant: false, marketer: false }]);
  ok("profileVersion no longer returns a workspaces list", !("workspaces" in pv));

  /* ---- old server: no `account`, only workspaces[] (kept one release) ---- */
  const OLD = [{ orgId: 7, name: "Acme", consultant: false, marketer: true }];
  c = provider(() => ({ status: 200, json: { version: "v1", plan: "PRO", workspaces: OLD } }));
  eq("old workspaces[]-only payload still yields a usable account", await c.p.getAccount(), ENT);
  c = provider(() => ({ status: 200, json: { version: "v1", plan: "FREE" } }));
  eq("no account and no workspaces -> personal", (await c.p.getAccount()).kind, "PERSONAL");
  c = provider(() => ({ status: 200, json: { version: "v1", workspaces: [{ orgId: 7, name: "Acme" }, { orgId: 9, name: "Beta", consultant: true }] } }));
  eq("workspaces-only: the entry the session names wins (hint.orgId)", T.dtoToAccount({ workspaces: [{ orgId: 7, name: "Acme" }, { orgId: 9, name: "Beta", consultant: true }] }, { kind: "ENTERPRISE", orgId: 9 }),
    { kind: "ENTERPRISE", orgId: 9, name: "Beta", consultant: true, marketer: false });
  eq("workspaces-only: otherwise the first entry", T.dtoToAccount({ workspaces: [{ orgId: 7, name: "Acme" }, { orgId: 9, name: "Beta" }] }, {}).orgId, 7);
  eq("workspaces-only but the session says PERSONAL -> personal", T.dtoToAccount({ workspaces: OLD }, { kind: "PERSONAL" }).kind, "PERSONAL");
  eq("a usable account beats the legacy list", T.dtoToAccount({ account: { kind: "PERSONAL" }, workspaces: OLD }, {}).kind, "PERSONAL");
  eq("an enterprise account with no org id is not trusted -> falls back", T.dtoToAccount({ account: { kind: "ENTERPRISE", orgId: null }, workspaces: [] }, {}).kind, "PERSONAL");
  eq("flags must be real booleans", T.dtoToAccount({ account: { kind: "ENTERPRISE", orgId: 7, name: "Acme", consultant: "yes", marketer: 1 } }, {}),
    { kind: "ENTERPRISE", orgId: 7, name: "Acme", consultant: false, marketer: false });
  eq("absent / junk payloads -> personal", [T.dtoToAccount(undefined).kind, T.dtoToAccount(null).kind, T.dtoToAccount({ account: "x" }).kind], ["PERSONAL", "PERSONAL", "PERSONAL"]);

  /* ---- auth: user token + path orgId, no workspace header, no tenant ---- */
  c = provider(() => ({ status: 200, json: { items: [conDto()], total: 1 } }));
  const jobs = await c.p.assignedJobs(42);
  const call = c.f.calls[0];
  eq("assignedJobs: path + state filter", call.full, "/api/orgs/42/con/opportunities?state=ASSIGNED,VIEWED,INTERESTED,NEEDS_INFO".replace(/,/g, ","));
  eq("assignedJobs: GET", call.method, "GET");
  eq("assignedJobs: bearer user token", call.headers.Authorization, "Bearer ACC");
  const hk = Object.keys(call.headers).map((k) => k.toLowerCase());
  ok("no workspace header, no tenant header", !hk.some((k) => /workspace|tenant|tid/.test(k)), hk.join(","));
  eq("assignedJobs: canonical mapping", [jobs.length, jobs[0].id, jobs[0].title, jobs[0].company, jobs[0].atsPlatform, jobs[0].externalJobId, jobs[0].assignedBy, jobs[0].marketerNote, jobs[0].allowedActions], [1, 11, "Staff Engineer", "Acme", "linkedin", "3856789012", "Sarah", "Great fit", ["VIEWED", "INTEREST", "APPLIED"]]);
  ok("assignedJobs: the DTO carries no forbidden marketer-internal fields", !("ownerMemberId" in jobs[0]) && !("clientContacts" in jobs[0]));
  c = provider(() => ({ status: 200, json: [conDto()] }));
  eq("assignedJobs: tolerates a bare array", (await c.p.assignedJobs(42)).length, 1);
  c = provider(() => ({ status: 200, json: { items: [{ id: 1, state: "ASSIGNED" }] } }));
  const thin = (await c.p.assignedJobs(42))[0];
  eq("assignedJobs: tolerates a thin DTO", [thin.id, thin.title, thin.skills, thin.allowedActions, thin.assignedBy], [1, undefined, [], [], ""]);
  c = provider(() => ({ status: 200, json: null }));
  eq("assignedJobs: empty body -> []", await c.p.assignedJobs(42), []);
  for (const bad of ["../x", 0, -1, 1.5, "abc", null, undefined]) {
    c = provider(() => ({ status: 200, json: [] }));
    let st = null; try { await c.p.assignedJobs(bad); } catch (e) { st = e.status; }
    ok("assignedJobs: refuses org id " + JSON.stringify(bad) + " (no request made)", st === 400 && c.f.calls.length === 0);
  }

  /* ---- marketer: consultant options ---- */
  c = provider(() => ({ status: 200, json: { consultants: [{ id: 4, name: "Ada" }, { id: "5", name: "Grace" }, { name: "no id" }], jobs: [{ id: 1 }] } }));
  eq("listMarketerConsultants: id + name only, junk dropped", await c.p.listMarketerConsultants(42), [{ id: 4, name: "Ada" }, { id: 5, name: "Grace" }]);
  eq("listMarketerConsultants: GET mkt/opportunities/options", [c.f.calls[0].method, c.f.calls[0].full], ["GET", "/api/orgs/42/mkt/opportunities/options"]);
  c = provider(() => ({ status: 200, json: {} }));
  await c.p.listMarketerConsultants(42, "ad a");
  eq("listMarketerConsultants: q is URL-encoded", c.f.calls[0].full, "/api/orgs/42/mkt/opportunities/options?q=ad%20a");

  /* ---- marketer: saveForConsultant ---- */
  const KEY = "9f0d7c3e-0000-4000-8000-000000000001";
  const resp = { jobId: 77, existingJob: true, results: [{ consultantId: 4, opportunityId: 100, existing: false }, { consultantId: 5, existing: false, reason: "CONSULTANT_INACTIVE" }] };
  c = provider(() => ({ status: 200, json: resp }));
  const body = { jobUrl: "https://x.com/j/1", title: "T", company: "Acme", keyInfo: "note", consultantIds: [4, 5], priority: "HIGH", jobDescription: "SECRET LONG TEXT", state: "APPLIED", appliedAt: "2026-01-01", bogus: 1, location: "", payMin: null };
  const out = await c.p.saveForConsultant(42, body, KEY);
  const sc = c.f.calls[0];
  eq("saveForConsultant: POST from-extension", [sc.method, sc.path], ["POST", "/api/orgs/42/mkt/opportunities/from-extension"]);
  eq("saveForConsultant: Idempotency-Key header", sc.headers["Idempotency-Key"], KEY);
  eq("saveForConsultant: bearer + json", [sc.headers.Authorization, sc.headers["Content-Type"]], ["Bearer ACC", "application/json"]);
  eq("saveForConsultant: body is the whitelist only (no description/state/appliedAt/unknown/blank)", sc.body, { jobUrl: "https://x.com/j/1", title: "T", company: "Acme", keyInfo: "note", priority: "HIGH", consultantIds: [4, 5] });
  eq("saveForConsultant: mapped result", out, { jobId: 77, existingJob: true, results: [{ consultantId: 4, opportunityId: 100, existing: false, reason: undefined }, { consultantId: 5, opportunityId: undefined, existing: false, reason: "CONSULTANT_INACTIVE" }] });
  c = provider(() => ({ status: 200, json: resp }));
  let missing = null; try { await c.p.saveForConsultant(42, body, ""); } catch (e) { missing = [e.status, e.code]; }
  eq("saveForConsultant: refuses to send without an Idempotency-Key", [missing, c.f.calls.length], [[400, "IDEMPOTENCY_KEY_MISSING"], 0]);
  for (const [status, code] of [[422, "SENSITIVE_CONTENT"], [409, "JOB_NOT_OPEN"], [400, "VALIDATION"], [404, null]]) {
    c = provider(() => ({ status, json: { detail: "nope", code: code || undefined } }));
    let err = null; try { await c.p.saveForConsultant(42, body, KEY); } catch (e) { err = e; }
    ok("saveForConsultant: " + status + " -> ApiError " + (code || ""), err && err.name === "ApiError" && err.status === status && err.code === (code || null), String(err));
  }

  /* ---- consultant: linkOpportunity ---- */
  c = provider(() => ({ status: 200, json: conDto({ state: "APPLIED", linkedApplicationId: 99 }) }));
  const linked = await c.p.linkOpportunity(42, 11, { applicationId: 99 });
  eq("linkOpportunity: POST .../con/opportunities/{id}/applied with applicationId", [c.f.calls[0].method, c.f.calls[0].path, c.f.calls[0].body], ["POST", "/api/orgs/42/con/opportunities/11/applied", { applicationId: 99 }]);
  eq("linkOpportunity: returns the updated job", [linked.state, linked.linkedApplicationId], ["APPLIED", 99]);
  c = provider(() => ({ status: 204 }));
  eq("linkOpportunity: without an application id sends {} and tolerates 204", [await c.p.linkOpportunity(42, 11), c.f.calls[0].body], [null, {}]);
  c = provider(() => ({ status: 404, json: { detail: "not found" } }));
  let nf = null; try { await c.p.linkOpportunity(42, 11, { applicationId: 1 }); } catch (e) { nf = e.status; }
  eq("linkOpportunity: 404 (not the caller's application) maps to ApiError(404)", nf, 404);

  /* ---- consultant: respondOpportunity ---- */
  for (const [action, expectBody, sent] of [
    ["viewed", {}, undefined],
    ["interest", {}, {}],
    ["decline", { reason: "RATE", note: "too low" }, { reason: "RATE", note: "too low" }],
    ["request-info", { question: "Visa?" }, { question: "Visa?" }],
  ]) {
    c = provider(() => ({ status: 200, json: conDto({ state: "VIEWED" }) }));
    await c.p.respondOpportunity(42, 11, action, sent);
    eq("respondOpportunity: " + action, [c.f.calls[0].method, c.f.calls[0].path, c.f.calls[0].body], ["POST", "/api/orgs/42/con/opportunities/11/" + action, expectBody]);
  }
  c = provider(() => ({ status: 200, json: {} }));
  let unk = null; try { await c.p.respondOpportunity(42, 11, "applied-by-marketer", {}); } catch (e) { unk = e.status; }
  eq("respondOpportunity: unknown action refused, no request", [unk, c.f.calls.length], [400, 0]);
  c = provider(() => ({ status: 200, json: {} }));
  let unk2 = null; try { await c.p.respondOpportunity(42, 11, "../applied", {}); } catch (e) { unk2 = e.status; }
  ok("respondOpportunity: path-ish action refused", unk2 === 400 && c.f.calls.length === 0);
  c = provider(() => ({ status: 409, json: { detail: "conflict", code: "VERSION_CONFLICT" } }));
  let vc = null; try { await c.p.respondOpportunity(42, 11, "interest", {}); } catch (e) { vc = e.code; }
  eq("respondOpportunity: 409 VERSION_CONFLICT surfaces as ApiError.code", vc, "VERSION_CONFLICT");

  /* ---- 401 -> refresh -> retry still works, and keeps the Idempotency-Key ---- */
  let first = true;
  c = provider((call) => {
    if (call.path === "/api/refresh") return { status: 200, json: { accessToken: "ACC2", refreshToken: "REF2" } };
    if (first) { first = false; return { status: 401, json: {} }; }
    return { status: 200, json: resp };
  });
  await c.p.saveForConsultant(42, body, KEY);
  const retried = c.f.calls.filter((x) => x.path.endsWith("from-extension"));
  eq("401: retried once with the refreshed token and the SAME Idempotency-Key", [retried.length, retried[1].headers.Authorization, retried[1].headers["Idempotency-Key"]], [2, "Bearer ACC2", KEY]);

  /* ---- the seam stays the one backend path ---- */
  const fs = require("fs");
  const path = require("path");
  for (const f of ["src/lib/workspace.js", "entrypoints/panel/workspace-actions.ts", "entrypoints/panel/MarketerView.tsx", "entrypoints/panel/AssignedJobs.tsx"]) {
    const src = fs.readFileSync(path.join(__dirname, "..", f), "utf8");
    ok("no fetch() outside tracking.js: " + f, !/\bfetch\s*\(/.test(src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")));
  }

  report();
})().catch((e) => { fail++; fails.push("async run threw -> " + (e && e.stack || e)); report(); });

function report() {
  console.log(`${tag} ${pass} passed, ${fail} failed`);
  if (fails.length) { console.log(`${tag} Failures:`); fails.forEach((f) => console.log("  x " + f)); process.exit(1); }
  console.log(`${tag} All green.`);
}
