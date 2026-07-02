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
  const metaDto = T.applicationToDto({ company: "Acme", roleTitle: "Eng", status: "DRAFT", jobType: "FULL_TIME", jobMode: "REMOTE", email: "a@b.co" });
  ok("applicationToDto sends jobType/jobMode/email", metaDto.jobType === "FULL_TIME" && metaDto.jobMode === "REMOTE" && metaDto.email === "a@b.co");
  const metaRt = T.dtoToApplication({ id: 5, company: "Acme", roleTitle: "Eng", status: "DRAFT", jobType: "CONTRACT", jobMode: "HYBRID", email: "x@y.co" });
  ok("dtoToApplication reads jobType/jobMode/email", metaRt.jobType === "CONTRACT" && metaRt.jobMode === "HYBRID" && metaRt.email === "x@y.co");

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

  /* ---- aiDraft (Phase 5) — POSTs /api/ai/draft with consent, returns the server result ---- */
  const fetchAi = mockFetch(() => ({ status: 200, json: { answer: "Because I'd thrive here.", used: 1, quota: 50 } }));
  const pAi = T.createKiwiplyProvider({ baseUrl: "https://api.test", fetch: fetchAi, tokenStore: T.memoryTokenStore({ access: "A" }) });
  const ai = await pAi.aiDraft({ question: "Why us?", context: "ctx", consent: true });
  ok("aiDraft POSTs /api/ai/draft with consent", fetchAi.calls[0].method === "POST" && fetchAi.calls[0].path === "/api/ai/draft" && fetchAi.calls[0].body.consent === true);
  ok("aiDraft returns the server result", ai.answer === "Because I'd thrive here." && ai.quota === 50);

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
