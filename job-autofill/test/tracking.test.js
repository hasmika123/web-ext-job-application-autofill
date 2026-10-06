// Tests for the TrackingProvider seam + DossierApiProvider (Task 1.6).
// A mock fetch records requests and returns scripted responses, so we verify the
// extension speaks the right endpoints/DTOs and that 401 triggers a refresh+retry
// — without any real network. This is the ONLY layer allowed to touch the backend.
const { makeWindow, load } = require("./harness");
let pass = 0, fail = 0;
const fails = [];
function ok(n, c, e) { if (c) pass++; else { fail++; fails.push(n + (e ? "  ->  " + e : "")); } }
function eq(n, g, w) { ok(n, JSON.stringify(g) === JSON.stringify(w), `got ${JSON.stringify(g)} want ${JSON.stringify(w)}`); }
const tick = () => new Promise((r) => setTimeout(r, 0));

const w = makeWindow();
load(w, "src/lib/tracking.js");
const T = w.JAF.tracking;

// --- a scriptable mock fetch -------------------------------------------------
// routes: array of { method, path, status, json } matched in order of first hit.
function mockFetch(handler) {
  const calls = [];
  const fn = async (url, opts) => {
    const u = new URL(url);
    const call = { method: (opts && opts.method) || "GET", path: u.pathname, headers: (opts && opts.headers) || {}, body: opts && opts.body ? JSON.parse(opts.body) : undefined };
    calls.push(call);
    const r = handler(call) || { status: 200, json: null };
    const text = r.json === null || r.json === undefined ? "" : JSON.stringify(r.json);
    return { ok: r.status >= 200 && r.status < 300, status: r.status, text: async () => text };
  };
  fn.calls = calls;
  return fn;
}

(async function run() {
  /* ---- pure DTO mappers ---- */
  eq("bioToPayload/payloadToBio round-trip", T.payloadToBio(T.bioToPayload({ firstName: "Ada", email: "a@x.com" })), { firstName: "Ada", email: "a@x.com" });
  ok("payloadToBio tolerates junk", T.payloadToBio("not json") === null);
  const rt = T.dtoToResume(T.resumeToDto({ serverId: 5, label: "Eng", skills: ["go"], r2ObjectKey: "k", status: "CONFIRMED" }));
  ok("resume round-trip keeps content", Array.isArray(rt.skills) && rt.skills[0] === "go");
  ok("resume round-trip keeps server fields", rt.serverId === 5 && rt.label === "Eng" && rt.status === "CONFIRMED");
  ok("dtoToResume maps the archived flag (3.5)", T.dtoToResume({ id: 1, label: "X", parsedJson: "{}", archived: true }).archived === true);
  ok("resumeToDto doesn't leak archived into parsedJson", JSON.parse(T.resumeToDto({ label: "X", archived: true, skills: ["a"] }).parsedJson).archived === undefined);
  const rMeta = T.dtoToResume({ id: 2, label: "Y", parsedJson: "{}", starred: true, defaultResume: true });
  ok("dtoToResume maps starred + defaultResume", rMeta.starred === true && rMeta.defaultResume === true);
  ok("resumeToDto doesn't leak starred/defaultResume into parsedJson", (() => {
    const p = JSON.parse(T.resumeToDto({ label: "Z", starred: true, defaultResume: true, skills: ["a"] }).parsedJson);
    return p.starred === undefined && p.defaultResume === undefined;
  })());

  /* ---- contract: base provider rejects until implemented ---- */
  const base = new T.TrackingProvider();
  let threw = false; try { await base.pushProfile({}); } catch (e) { threw = e.name === "NotSupportedError"; }
  ok("base TrackingProvider.pushProfile throws NotSupported", threw);

  /* ---- login stores tokens; authed request carries the Bearer ---- */
  const store = T.memoryTokenStore();
  const fetch1 = mockFetch((c) => {
    if (c.path === "/api/authenticate") return { status: 200, json: { accessToken: "ACC", refreshToken: "REF" } };
    if (c.path === "/api/profile") return { status: 200, json: { payload: JSON.stringify({ firstName: "Ada" }) } };
    return { status: 404 };
  });
  const p = T.createKiwiplyProvider({ baseUrl: "https://api.test/", fetch: fetch1, tokenStore: store });
  eq("baseUrl trailing slash trimmed", p.getBaseUrl(), "https://api.test");
  await p.login({ username: "ada", password: "pw" });
  ok("login stored access token", store.get().access === "ACC" && store.get().refresh === "REF");
  ok("isAuthenticated true after login", (await p.isAuthenticated()) === true);
  const bio = await p.pullProfile();
  eq("pullProfile parses payload -> bio", bio, { firstName: "Ada" });
  const authCall = fetch1.calls.find((c) => c.path === "/api/profile");
  ok("authed request sends Bearer access token", authCall.headers["Authorization"] === "Bearer ACC");

  /* ---- pullProfile returns null on 404 (no profile yet) ---- */
  const fetch404 = mockFetch(() => ({ status: 404 }));
  const p404 = T.createKiwiplyProvider({ baseUrl: "https://api.test", fetch: fetch404, tokenStore: T.memoryTokenStore({ access: "A" }) });
  ok("pullProfile null on 404", (await p404.pullProfile()) === null);

  /* ---- pushProfile sends {payload: <stringified bio>} ---- */
  const fetchPush = mockFetch((c) => ({ status: 200, json: { payload: c.body.payload } }));
  const pPush = T.createKiwiplyProvider({ baseUrl: "https://api.test", fetch: fetchPush, tokenStore: T.memoryTokenStore({ access: "A" }) });
  const back = await pPush.pushProfile({ city: "Atlanta" });
  eq("pushProfile round-trips the bio", back, { city: "Atlanta" });
  const putCall = fetchPush.calls.find((c) => c.method === "PUT");
  ok("pushProfile PUTs /api/profile with payload string", putCall.path === "/api/profile" && JSON.parse(putCall.body.payload).city === "Atlanta");

  /* ---- 401 triggers refresh then retries the original request ---- */
  let firstProfileHit = true;
  const fetch401 = mockFetch((c) => {
    if (c.path === "/api/profile/resumes" && firstProfileHit) { firstProfileHit = false; return { status: 401 }; }
    if (c.path === "/api/refresh") return { status: 200, json: { accessToken: "ACC2", refreshToken: "REF2" } };
    if (c.path === "/api/profile/resumes") return { status: 200, json: [{ id: 1, label: "R", parsedJson: "{}", status: "NEEDS_REVIEW" }] };
    return { status: 404 };
  });
  const retryStore = T.memoryTokenStore({ access: "OLD", refresh: "REF" });
  const pRetry = T.createKiwiplyProvider({ baseUrl: "https://api.test", fetch: fetch401, tokenStore: retryStore });
  const resumes = await pRetry.listResumes();
  ok("listResumes recovers after 401->refresh->retry", resumes.length === 1 && resumes[0].serverId === 1);
  ok("refresh endpoint was called", fetch401.calls.some((c) => c.path === "/api/refresh"));
  const retried = fetch401.calls.filter((c) => c.path === "/api/profile/resumes");
  ok("original request retried with new token", retried.length === 2 && retried[1].headers["Authorization"] === "Bearer ACC2");
  ok("refresh rotation stores the new refresh token", retryStore.get().refresh === "REF2");

  /* ---- refresh preserves display-only fields (username → drawer avatar) ---- */
  let firstUserHit = true;
  const fetchUser = mockFetch((c) => {
    if (c.path === "/api/profile/resumes" && firstUserHit) { firstUserHit = false; return { status: 401 }; }
    if (c.path === "/api/refresh") return { status: 200, json: { accessToken: "ACC3", refreshToken: "REF3" } };
    if (c.path === "/api/profile/resumes") return { status: 200, json: [] };
    return { status: 404 };
  });
  const userStore = T.memoryTokenStore({ access: "OLD", refresh: "REF", username: "ada" });
  const pUser = T.createKiwiplyProvider({ baseUrl: "https://api.test", fetch: fetchUser, tokenStore: userStore });
  await pUser.listResumes();
  ok("refresh preserves username across rotation", userStore.get().username === "ada");
  ok("refresh still applies the rotated tokens", userStore.get().access === "ACC3" && userStore.get().refresh === "REF3");

  /* ---- pushResume: POST when new, PUT when it has a serverId ---- */
  const fetchRes = mockFetch((c) => ({ status: c.method === "POST" ? 201 : 200, json: { id: c.method === "POST" ? 9 : 9, label: c.body.label, parsedJson: c.body.parsedJson, status: c.body.status } }));
  const pRes = T.createKiwiplyProvider({ baseUrl: "https://api.test", fetch: fetchRes, tokenStore: T.memoryTokenStore({ access: "A" }) });
  const createdRes = await pRes.pushResume({ label: "New", skills: ["js"] });
  ok("pushResume new -> POST", fetchRes.calls[0].method === "POST" && fetchRes.calls[0].path === "/api/profile/resumes" && createdRes.serverId === 9);
  await pRes.pushResume({ serverId: 9, label: "Upd" });
  ok("pushResume existing -> PUT /{id}", fetchRes.calls[1].method === "PUT" && fetchRes.calls[1].path === "/api/profile/resumes/9");

  /* ---- deleteResume / logout ---- */
  const fetchDel = mockFetch(() => ({ status: 204 }));
  const pDel = T.createKiwiplyProvider({ baseUrl: "https://api.test", fetch: fetchDel, tokenStore: T.memoryTokenStore({ access: "A", refresh: "RDEL" }) });
  ok("deleteResume DELETEs /{id}", (await pDel.deleteResume(7)) === true && fetchDel.calls[0].method === "DELETE" && fetchDel.calls[0].path === "/api/profile/resumes/7");
  await pDel.logout();
  ok("logout clears tokens", (await pDel.isAuthenticated()) === false);
  ok("logout revokes the refresh token server-side", fetchDel.calls.some((c) => c.path === "/api/logout" && c.body && c.body.refreshToken === "RDEL"));

  /* ---- application mappers round-trip (canonical <-> DTO) ---- */
  const appRt = T.dtoToApplication(T.applicationToDto({ serverId: 3, company: "Acme", role: "Eng", externalJobId: "J1", status: "DRAFT", resumeId: 8 }));
  ok("applicationToDto maps role -> roleTitle", appRt.roleTitle === "Eng" && appRt.company === "Acme");
  ok("application round-trip keeps server + resume id", appRt.serverId === 3 && appRt.externalJobId === "J1" && appRt.resumeId === 8);
  const partial = T.applicationToDto({ status: "APPLIED" });
  ok("applicationToDto stays partial (only set fields sent)", JSON.stringify(partial) === JSON.stringify({ status: "APPLIED" }));

  // job type / mode / email round-trip through the DTO mappers.
  const metaDto = T.applicationToDto({ company: "Acme", roleTitle: "Eng", status: "DRAFT", jobType: "FULL_TIME", jobMode: "REMOTE", email: "a@b.co", salary: "$120k/yr" });
  ok("applicationToDto sends jobType/jobMode/email/salary", metaDto.jobType === "FULL_TIME" && metaDto.jobMode === "REMOTE" && metaDto.email === "a@b.co" && metaDto.salary === "$120k/yr");
  const metaRt = T.dtoToApplication({ id: 5, company: "Acme", roleTitle: "Eng", status: "DRAFT", jobType: "CONTRACT", jobMode: "HYBRID", email: "x@y.co", salary: "$90k/yr" });
  ok("dtoToApplication reads jobType/jobMode/email/salary", metaRt.jobType === "CONTRACT" && metaRt.jobMode === "HYBRID" && metaRt.email === "x@y.co" && metaRt.salary === "$90k/yr");

  /* ---- pushApplication upserts via POST and maps the result back ---- */
  const fetchApp = mockFetch((c) => ({ status: 200, json: { id: 11, company: c.body.company, roleTitle: c.body.roleTitle, externalJobId: c.body.externalJobId, status: c.body.status, resume: c.body.resume } }));
  const pApp = T.createKiwiplyProvider({ baseUrl: "https://api.test", fetch: fetchApp, tokenStore: T.memoryTokenStore({ access: "A" }) });
  const savedApp = await pApp.pushApplication({ company: "Acme", role: "Eng", externalJobId: "J1", status: "DRAFT", resumeId: 8 });
  ok("pushApplication POSTs /api/profile/applications", fetchApp.calls[0].method === "POST" && fetchApp.calls[0].path === "/api/profile/applications");
  ok("pushApplication sends resume id + roleTitle", fetchApp.calls[0].body.resume.id === 8 && fetchApp.calls[0].body.roleTitle === "Eng");
  ok("pushApplication maps the saved entry back", savedApp.serverId === 11 && savedApp.status === "DRAFT");

  /* ---- listApplications maps the array ---- */
  const fetchAppList = mockFetch(() => ({ status: 200, json: [{ id: 1, company: "A", roleTitle: "X", status: "APPLIED" }, { id: 2, company: "B", roleTitle: "Y", status: "DRAFT" }] }));
  const pAppList = T.createKiwiplyProvider({ baseUrl: "https://api.test", fetch: fetchAppList, tokenStore: T.memoryTokenStore({ access: "A" }) });
  const apps = await pAppList.listApplications();
  ok("listApplications maps each DTO", apps.length === 2 && apps[0].serverId === 1 && apps[1].status === "DRAFT");

  /* ---- updateApplication PUTs /{id}; deleteApplication DELETEs ---- */
  const fetchAppUpd = mockFetch((c) => ({ status: c.method === "DELETE" ? 204 : 200, json: c.method === "DELETE" ? null : { id: 5, status: c.body.status, submissionConfirmed: c.body.submissionConfirmed } }));
  const pAppUpd = T.createKiwiplyProvider({ baseUrl: "https://api.test", fetch: fetchAppUpd, tokenStore: T.memoryTokenStore({ access: "A" }) });
  const upd = await pAppUpd.updateApplication(5, { status: "APPLIED", submissionConfirmed: true });
  ok("updateApplication PUTs /api/profile/applications/{id}", fetchAppUpd.calls[0].method === "PUT" && fetchAppUpd.calls[0].path === "/api/profile/applications/5");
  ok("updateApplication maps result", upd.serverId === 5 && upd.submissionConfirmed === true);
  ok("deleteApplication DELETEs /{id}", (await pAppUpd.deleteApplication(5)) === true && fetchAppUpd.calls[1].method === "DELETE" && fetchAppUpd.calls[1].path === "/api/profile/applications/5");

  /* ---- archiveResume PUTs the archived flag to the resume endpoint ---- */
  const fetchArch = mockFetch((c) => ({ status: 200, json: { id: 4, label: "R", parsedJson: "{}", archived: c.body.archived } }));
  const pArch = T.createKiwiplyProvider({ baseUrl: "https://api.test", fetch: fetchArch, tokenStore: T.memoryTokenStore({ access: "A" }) });
  await pArch.archiveResume(4);
  ok("archiveResume PUTs /api/profile/resumes/{id} with archived:true", fetchArch.calls[0].method === "PUT" && fetchArch.calls[0].path === "/api/profile/resumes/4" && fetchArch.calls[0].body.archived === true);

  /* ---- field cache mappers + syncFieldCache (Phase 4) ---- */
  const fcDto = T.fieldCacheToDto({ fieldKey: "country", contextHash: "abc", value: "US", hitCount: 4, updatedAt: 1700000000000 });
  ok("fieldCacheToDto converts epoch ms -> ISO Instant", typeof fcDto.updatedAt === "string" && fcDto.updatedAt.includes("T") && fcDto.fieldKey === "country" && fcDto.hitCount === 4);
  const fcLocal = T.dtoToFieldCache({ fieldKey: "country", contextHash: "abc", value: "US", hitCount: 4, updatedAt: "2023-11-14T22:13:20Z" });
  ok("dtoToFieldCache converts ISO -> epoch ms", typeof fcLocal.updatedAt === "number" && fcLocal.updatedAt > 0 && fcLocal.value === "US");
  const fetchFC = mockFetch(() => ({ status: 200, json: [{ id: 1, fieldKey: "country", contextHash: "abc", value: "US", hitCount: 7, updatedAt: "2024-01-01T00:00:00Z" }] }));
  const pFC = T.createKiwiplyProvider({ baseUrl: "https://api.test", fetch: fetchFC, tokenStore: T.memoryTokenStore({ access: "A" }) });
  const mergedFC = await pFC.syncFieldCache([{ fieldKey: "country", contextHash: "abc", value: "US", hitCount: 3, updatedAt: 1700000000000 }]);
  ok("syncFieldCache POSTs /api/profile/field-caches/sync", fetchFC.calls[0].method === "POST" && fetchFC.calls[0].path === "/api/profile/field-caches/sync");
  ok("syncFieldCache sends an array of DTOs with ISO updatedAt", Array.isArray(fetchFC.calls[0].body) && typeof fetchFC.calls[0].body[0].updatedAt === "string");
  ok("syncFieldCache maps merged DTOs back to local (epoch ms)", mergedFC.length === 1 && mergedFC[0].hitCount === 7 && typeof mergedFC[0].updatedAt === "number");

  /* ---- profileVersion (Phase 11.2) — GET /api/profile/version → string | null ---- */
  const fetchVer = mockFetch(() => ({ status: 200, json: { version: "9f2c4a1b7e3d0c55", plan: "PRO" } }));
  const pVer = T.createKiwiplyProvider({ baseUrl: "https://api.test", fetch: fetchVer, tokenStore: T.memoryTokenStore({ access: "A" }) });
  const ver = await pVer.profileVersion();
  ok("profileVersion GETs /api/profile/version", fetchVer.calls[0].method === "GET" && fetchVer.calls[0].path === "/api/profile/version");
  ok("profileVersion returns the server's version", ver.version === "9f2c4a1b7e3d0c55");
  ok("profileVersion carries the plan (12.3 — no extra round-trip for an upgrade)", ver.plan === "PRO");
  const fetchNoVer = mockFetch(() => ({ status: 200, json: {} }));
  const pNoVer = T.createKiwiplyProvider({ baseUrl: "https://api.test", fetch: fetchNoVer, tokenStore: T.memoryTokenStore({ access: "A" }) });
  const noVer = await pNoVer.profileVersion();
  ok("profileVersion: null version when the server sends none (caller pulls to be safe)", noVer.version === null);
  ok("profileVersion: null plan leaves the last known plan alone", noVer.plan === null);

  /* ---- 402 surfacing (Phase 12.3) — clients branch on `code`, never the message ---- */
  const fetch402 = mockFetch(() => ({ status: 402, json: { status: 402, code: "PRO_REQUIRED", detail: "This feature is part of Kiwiply Pro" } }));
  const p402 = T.createKiwiplyProvider({ baseUrl: "https://api.test", fetch: fetch402, tokenStore: T.memoryTokenStore({ access: "A" }) });
  let err402 = null;
  try { await p402.profileVersion(); } catch (e) { err402 = e; }
  ok("402 raises an ApiError carrying the status", err402 && err402.status === 402, String(err402));
  ok("402 lifts `code` out of the ProblemDetail", err402 && err402.code === "PRO_REQUIRED", err402 && err402.code);

  /* ---- the gates (Phase 12.4) — the two shapes the upload surfaces read off the error ---- */
  const fetchCap = mockFetch(() => ({
    status: 402,
    json: { status: 402, code: "RESUME_LIMIT", detail: "Free accounts keep up to 3 resumes", limit: 3, count: 3 },
  }));
  const pCap = T.createKiwiplyProvider({ baseUrl: "https://api.test", fetch: fetchCap, tokenStore: T.memoryTokenStore({ access: "A" }) });
  let errCap = null;
  try { await pCap.createResume({ label: "Fourth" }); } catch (e) { errCap = e; }
  ok("createResume surfaces RESUME_LIMIT as a code", errCap && errCap.code === "RESUME_LIMIT", errCap && errCap.code);
  // services.ts shows `message`, so `detail` has to be what lands there — the ProblemDetail's
  // `title` is overwritten with the HTTP reason phrase by the server's exception translator.
  ok("createResume's message is the server's detail", errCap && errCap.message === "Free accounts keep up to 3 resumes", errCap && errCap.message);
  ok("the cap's counts ride along on the body", errCap && errCap.body && errCap.body.limit === 3 && errCap.body.count === 3);

  const fetchProAi = mockFetch(() => ({ status: 402, json: { status: 402, code: "PRO_REQUIRED", detail: "Kiwiply AI is part of Pro" } }));
  const pProAi = T.createKiwiplyProvider({ baseUrl: "https://api.test", fetch: fetchProAi, tokenStore: T.memoryTokenStore({ access: "A" }) });
  let errAiPro = null;
  try { await pProAi.aiDraft({ question: "Why us?", context: "", consent: true }); } catch (e) { errAiPro = e; }
  ok("aiDraft raises PRO_REQUIRED rather than returning a flag", errAiPro && errAiPro.code === "PRO_REQUIRED", errAiPro && errAiPro.code);

  const fetchPlain = mockFetch(() => ({ status: 500, json: { detail: "boom" } }));
  const pPlain = T.createKiwiplyProvider({ baseUrl: "https://api.test", fetch: fetchPlain, tokenStore: T.memoryTokenStore({ access: "A" }) });
  let errPlain = null;
  try { await pPlain.profileVersion(); } catch (e) { errPlain = e; }
  ok("an error without a code leaves .code null rather than undefined", errPlain && errPlain.code === null);
  let verThrew = false; try { await base.profileVersion(); } catch (e) { verThrew = e.name === "NotSupportedError"; }
  ok("base TrackingProvider.profileVersion throws NotSupported", verThrew);

  /* ---- aiDraft (Phase 5) — POSTs /api/ai/draft with consent, returns the server result ---- */
  const fetchAi = mockFetch(() => ({ status: 200, json: { answer: "Because I'd thrive here.", used: 1, quota: 50 } }));
  const pAi = T.createKiwiplyProvider({ baseUrl: "https://api.test", fetch: fetchAi, tokenStore: T.memoryTokenStore({ access: "A" }) });
  const ai = await pAi.aiDraft({ question: "Why us?", context: "ctx", consent: true });
  ok("aiDraft POSTs /api/ai/draft with consent", fetchAi.calls[0].method === "POST" && fetchAi.calls[0].path === "/api/ai/draft" && fetchAi.calls[0].body.consent === true);
  ok("aiDraft says it's a draft when no task is given (13.1a)", fetchAi.calls[0].body.task === "draft");
  await pAi.aiDraft({ question: "Map: 1. First name", consent: true, task: "map" });
  ok("aiDraft passes the task through", fetchAi.calls[1].body.task === "map");
  ok("aiDraft returns the server result", ai.answer === "Because I'd thrive here." && ai.quota === 50);

  /* ---- fill telemetry (Phase 10.1) — counts to /api/telemetry, 204 back ---- */
  const fetchTel = mockFetch(() => ({ status: 204, json: null }));
  const pTel = T.createKiwiplyProvider({ baseUrl: "https://api.test", fetch: fetchTel, tokenStore: T.memoryTokenStore({ access: "A" }) });
  const ev = { id: "0f8fad5b-d9cb-469f-a165-70867728950e", ats: "workday", adapter: "workday", fieldsFound: 5, fieldsFilled: 5, fieldsFailed: 0, requiredLeftEmpty: 0, extVersion: "0.56.0" };
  await pTel.recordFill(ev);
  ok("recordFill POSTs /api/telemetry/fills with the event", fetchTel.calls[0].method === "POST" && fetchTel.calls[0].path === "/api/telemetry/fills" && fetchTel.calls[0].body.ats === "workday");
  ok("recordFill is authenticated", fetchTel.calls[0].headers.Authorization === "Bearer A");
  await pTel.recordFillCorrection(ev.id);
  ok("recordFillCorrection POSTs to the fill's correction path", fetchTel.calls[1].method === "POST" && fetchTel.calls[1].path === "/api/telemetry/fills/" + ev.id + "/correction");
  await pTel.recordFillCorrection("../../admin");
  ok("recordFillCorrection can't be steered to another path", fetchTel.calls[2].path.indexOf("/api/telemetry/fills/") === 0 && fetchTel.calls[2].path.indexOf("/admin") === -1, fetchTel.calls[2].path);

  /* ---- learned answers (Phase 10.3d) — POSTed as suggestions, never to the profile ---- */
  const fetchLearn = mockFetch(() => ({ status: 204, json: null }));
  const pLearn = T.createKiwiplyProvider({ baseUrl: "https://api.test", fetch: fetchLearn, tokenStore: T.memoryTokenStore({ access: "A" }) });
  await pLearn.recordLearnedAnswers([{ fieldKey: "desiredSalary", value: "$120,000", context: "abc" }]);
  ok("recordLearnedAnswers POSTs /api/profile/suggestions", fetchLearn.calls[0].method === "POST" && fetchLearn.calls[0].path === "/api/profile/suggestions" && fetchLearn.calls[0].body[0].fieldKey === "desiredSalary");
  ok("recordLearnedAnswers is authenticated", fetchLearn.calls[0].headers.Authorization === "Bearer A");
  ok("recordLearnedAnswers never touches the profile itself", fetchLearn.calls.every((c) => c.path !== "/api/profile"));

  /* ---- AI meter (Phase 13.1c) — GET /api/ai/usage ---- */
  const fetchMeter = mockFetch(() => ({ status: 200, json: { metered: "budget", used: 32, limit: 100, resetsAt: "2026-10-01T00:00:00Z", economy: false } }));
  const pMeter = T.createKiwiplyProvider({ baseUrl: "https://api.test", fetch: fetchMeter, tokenStore: T.memoryTokenStore({ access: "A" }) });
  const meter = await pMeter.aiUsage();
  ok("aiUsage GETs /api/ai/usage, authenticated", fetchMeter.calls[0].method === "GET" && fetchMeter.calls[0].path === "/api/ai/usage" && fetchMeter.calls[0].headers.Authorization === "Bearer A");
  ok("aiUsage returns the meter as-is", meter && meter.metered === "budget" && meter.used === 32);

  /* ---- resume fit (Phase 13.2) — POST /api/ai/resume-match ---- */
  const fetchFit = mockFetch(() => ({ status: 200, json: { best: { resumeId: 11, label: "Backend v3", score: 84, why: "Java" }, scores: [], cached: false } }));
  const pFit = T.createKiwiplyProvider({ baseUrl: "https://api.test", fetch: fetchFit, tokenStore: T.memoryTokenStore({ access: "A" }) });
  const fit = await pFit.resumeMatch({ jobDescription: "x".repeat(25000), role: "Backend Engineer", company: "Acme", consent: true });
  ok("resumeMatch POSTs /api/ai/resume-match, authenticated", fetchFit.calls[0].method === "POST" && fetchFit.calls[0].path === "/api/ai/resume-match" && fetchFit.calls[0].headers.Authorization === "Bearer A");
  ok("resumeMatch caps the job description it sends", fetchFit.calls[0].body.jobDescription.length === 20000 && fetchFit.calls[0].body.role === "Backend Engineer" && fetchFit.calls[0].body.consent === true);
  ok("resumeMatch returns the server's best match", fit && fit.best && fit.best.resumeId === 11);

  /* ---- job fit (Phase 13.3) — POST /api/ai/job-fit ---- */
  const fetchJobFit = mockFetch(() => ({ status: 200, json: { fit: { resumeId: 11, score: 71, matched: ["Java"], missing: ["Terraform"], redFlags: [] }, cached: false } }));
  const pJobFit = T.createKiwiplyProvider({ baseUrl: "https://api.test", fetch: fetchJobFit, tokenStore: T.memoryTokenStore({ access: "A" }) });
  const jf = await pJobFit.jobFit({ resumeId: "11", jobDescription: "y".repeat(21000), role: "Backend Engineer", company: "Acme", consent: true });
  ok("jobFit POSTs /api/ai/job-fit with the server resume id", fetchJobFit.calls[0].method === "POST" && fetchJobFit.calls[0].path === "/api/ai/job-fit" && fetchJobFit.calls[0].body.resumeId === 11);
  ok("jobFit caps the job description", fetchJobFit.calls[0].body.jobDescription.length === 20000 && fetchJobFit.calls[0].headers.Authorization === "Bearer A");
  ok("jobFit returns the report", jf && jf.fit && jf.fit.missing[0] === "Terraform");

  /* ---- aiParseResume — POSTs /api/ai/parse-resume (text or file mode) ---- */
  const fetchParse = mockFetch(() => ({ status: 200, json: { parsed: { summary: "s", skills: ["Java"] }, used: 2, quota: 50 } }));
  const pParse = T.createKiwiplyProvider({ baseUrl: "https://api.test", fetch: fetchParse, tokenStore: T.memoryTokenStore({ access: "A" }) });
  const pr = await pParse.aiParseResume({ text: "Jane Doe resume text", consent: true });
  ok("aiParseResume POSTs /api/ai/parse-resume with text + consent",
    fetchParse.calls[0].method === "POST" && fetchParse.calls[0].path === "/api/ai/parse-resume" &&
    fetchParse.calls[0].body.text === "Jane Doe resume text" && fetchParse.calls[0].body.consent === true && !("fileBase64" in fetchParse.calls[0].body));
  ok("aiParseResume returns the server result", pr.parsed && pr.parsed.skills[0] === "Java" && pr.used === 2);
  await pParse.aiParseResume({ fileBase64: "aGVsbG8=", consent: true });
  ok("aiParseResume file mode sends base64 + pdf mime, no text",
    fetchParse.calls[1].body.fileBase64 === "aGVsbG8=" && fetchParse.calls[1].body.fileMimeType === "application/pdf" && !("text" in fetchParse.calls[1].body));

  /* ---- submitBugReport (Phase 9.A5) — POSTs /api/bug-reports, source=extension, attaches token ---- */
  const fetchBug = mockFetch(() => ({ status: 202, json: { ok: true } }));
  const pBug = T.createKiwiplyProvider({ baseUrl: "https://api.test", fetch: fetchBug, tokenStore: T.memoryTokenStore({ access: "A" }) });
  await pBug.submitBugReport({ message: "broke", category: "BUG", url: "https://x", appVersion: "0.25.0", userAgent: "UA" });
  ok(
    "submitBugReport POSTs /api/bug-reports with source=extension + bearer",
    fetchBug.calls[0].method === "POST" &&
      fetchBug.calls[0].path === "/api/bug-reports" &&
      fetchBug.calls[0].body.source === "extension" &&
      fetchBug.calls[0].body.message === "broke" &&
      fetchBug.calls[0].headers.Authorization === "Bearer A"
  );
  // Works anonymously too (no token) — the endpoint is public.
  const fetchBugAnon = mockFetch(() => ({ status: 202, json: { ok: true } }));
  const pBugAnon = T.createKiwiplyProvider({ baseUrl: "https://api.test", fetch: fetchBugAnon, tokenStore: T.memoryTokenStore({}) });
  await pBugAnon.submitBugReport({ message: "hi", category: "IDEA" });
  ok("submitBugReport works without a token (no auth header)", fetchBugAnon.calls[0].headers.Authorization === undefined);

  /* ---- base contract still rejects newly-declared, unimplemented methods ---- */
  let aiThrew = false; try { await base.aiDraft({}); } catch (e) { aiThrew = e.name === "NotSupportedError"; }
  ok("base TrackingProvider.aiDraft throws NotSupported", aiThrew);
  let updThrew = false; try { await base.updateApplication(1, {}); } catch (e) { updThrew = e.name === "NotSupportedError"; }
  ok("base TrackingProvider.updateApplication throws NotSupported", updThrew);
  let archThrew = false; try { await base.archiveResume(1); } catch (e) { archThrew = e.name === "NotSupportedError"; }
  ok("base TrackingProvider.archiveResume throws NotSupported", archThrew);
  let fcThrew = false; try { await base.syncFieldCache([]); } catch (e) { fcThrew = e.name === "NotSupportedError"; }
  ok("base TrackingProvider.syncFieldCache throws NotSupported (Phase 4)", fcThrew);

  /* ---- no baseUrl => clear error, never a bad fetch ---- */
  const pNo = T.createKiwiplyProvider({ fetch: mockFetch(() => ({ status: 200 })) });
  let cfgThrew = false; try { await pNo.pullProfile(); } catch (e) { cfgThrew = e.name === "ApiError"; }
  ok("missing baseUrl throws ApiError", cfgThrew);

  console.log(`\n[tracking] ${pass} passed, ${fail} failed`);
  if (fails.length) { fails.forEach((f) => console.log("  x " + f)); process.exit(1); }
  console.log("[tracking] All green.");
})();
