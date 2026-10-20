// "Prepare selected openings" (X12.9 / E7.x) — the batch logic that lives in the service worker:
// message validation, the ACK paths, tab scheduling against a mocked chrome.tabs, per-tab state,
// event reporting through the TrackingProvider seam, restart survival, cancel, and the one tab-prepare
// pipeline. Runs the REAL src/lib/prepare-batch.js, workspace.js and tracking.js; only the browser
// (tabs, storage, fetch) is faked. The page side (banner, fill, never-submit) is prepare_batch_page.test.js.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

let pass = 0, fail = 0;
const fails = [];
const tag = "[prepare_batch]";
function ok(n, c, e) { if (c) pass++; else { fail++; fails.push(n + (e ? "  ->  " + e : "")); } }
function eq(n, g, w) { ok(n, JSON.stringify(g) === JSON.stringify(w), `got ${JSON.stringify(g)} want ${JSON.stringify(w)}`); }

for (const f of ["src/lib/workspace.js", "src/lib/tracking.js", "src/lib/prepare-batch.js"]) {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, "..", f), "utf8"), { filename: f });
}
const JAF = globalThis.JAF;
const PB = JAF.prepareBatch;
const T = JAF.tracking;

const TENANT = "https://acme.kiwiply.com";
const job = (n, over) => Object.assign({ matchId: n, url: "https://jobs.lever.co/acme/" + n, title: "Role " + n, company: "Acme" }, over || {});
const msg = (over) => Object.assign({ type: "KIWIPLY_PREPARE_BATCH", version: 1, sessionId: "sess_abc123", apiBase: "https://api.kiwiply.com", orgId: 7, jobs: [job(1), job(2)] }, over || {});
const CONSULTANT = { kind: "ENTERPRISE", orgId: 7, name: "Acme", consultant: true, marketer: false };
const MARKETER = { kind: "ENTERPRISE", orgId: 7, name: "Acme", consultant: false, marketer: true };
const SESSION = { access: "a", refresh: "r", kind: "ENTERPRISE", orgId: 7, orgName: "Acme", userId: 42, email: "c@acme.test" };

(async function run() {
  /* ---------------------------------------------------------- 1. validation */
  {
    const v = PB.validate(msg());
    ok("valid batch passes", v.ok === true && v.batch.jobs.length === 2 && v.batch.orgId === 7 && v.batch.sessionId === "sess_abc123");
    eq("apiBase is reduced to its origin", PB.validate(msg({ apiBase: "https://api.kiwiply.com/x/y" })).batch.apiOrigin, "https://api.kiwiply.com");
    ok("apiBase is optional", PB.validate(msg({ apiBase: undefined })).ok === true);
    ok("an unknown message type is ignored (no ACK)", PB.validate({ type: "SOMETHING_ELSE" }).ignore === true && PB.validate(null).ignore === true && PB.validate("x").ignore === true);
    eq("wrong version", PB.validate(msg({ version: 2 })).reason, "unsupported-version");
    eq("missing version", PB.validate(msg({ version: undefined })).reason, "unsupported-version");
    eq("bad session id", PB.validate(msg({ sessionId: "../etc" })).reason, "bad-session");
    eq("missing session id", PB.validate(msg({ sessionId: undefined })).reason, "bad-session");
    eq("bad org id", PB.validate(msg({ orgId: "x" })).reason, "bad-org");
    eq("zero org id", PB.validate(msg({ orgId: 0 })).reason, "bad-org");
    eq("bad api base", PB.validate(msg({ apiBase: "not a url" })).reason, "bad-api-base");
    eq("no jobs", PB.validate(msg({ jobs: [] })).reason, "no-jobs");
    eq("jobs not an array", PB.validate(msg({ jobs: "x" })).reason, "no-jobs");
    const eleven = Array.from({ length: 11 }, (_, i) => job(i + 1));
    eq("11 jobs is too many", PB.validate(msg({ jobs: eleven })).reason, "too-many-jobs");
    eq("10 jobs is fine", PB.validate(msg({ jobs: eleven.slice(0, 10) })).batch.jobs.length, 10);
    eq("an http URL is refused", PB.validate(msg({ jobs: [job(1, { url: "http://jobs.lever.co/a/1" })] })).reason, "http-url");
    for (const bad of ["javascript:alert(1)", "ftp://x.com/a", "file:///etc/passwd", "https://user:pw@jobs.lever.co/a", "https://localhost/a", "https://127.0.0.1/a", "https://[::1]/a", "https://intranet/a", "", null, 5]) {
      eq("refused URL: " + String(bad), PB.validate(msg({ jobs: [job(1, { url: bad })] })).reason, "bad-url");
    }
    eq("a bad matchId", PB.validate(msg({ jobs: [job(0)] })).reason, "bad-job");
    eq("a non-object job", PB.validate(msg({ jobs: [null] })).reason, "bad-job");
    eq("a path-like matchId", PB.validate(msg({ jobs: [job("../1")] })).reason, "bad-job");
    // dedupe: same matchId, or the same posting twice (tracking parameters do not make a different job)
    const d = PB.validate(msg({ jobs: [job(1), job(1, { url: "https://jobs.lever.co/acme/other" }), job(2, { url: "https://jobs.lever.co/acme/1?utm_source=x" }), job(3)] }));
    eq("duplicates by matchId and by URL are dropped, the first wins", d.batch.jobs.map((j) => j.matchId), [1, 3]);
    const long = PB.validate(msg({ jobs: [job(1, { title: "x".repeat(500), company: "y\n\n  z" })] })).batch.jobs[0];
    ok("titles are trimmed and capped, whitespace collapsed", long.title.length === 200 && long.company === "y z");
    const echo = PB.validate(msg({ jobs: [job(1, { evil: "<script>", url: "https://jobs.lever.co/a/1" })] })).batch.jobs[0];
    eq("only the contract fields survive", Object.keys(echo).sort(), ["company", "matchId", "title", "url"]);
  }

  /* ---------------------------------------------------------- 2. who may start */
  eq("session: not connected", PB.checkSession(7, {}), "not-connected");
  eq("session: personal account", PB.checkSession(7, { access: "a", kind: "PERSONAL" }), "wrong-account-kind");
  eq("session: an old session with no kind", PB.checkSession(7, { access: "a" }), "wrong-account-kind");
  eq("session: another org", PB.checkSession(8, SESSION), "wrong-org");
  eq("session: right org", PB.checkSession(7, SESSION), null);
  eq("role: consultant", PB.checkRole(7, CONSULTANT), null);
  eq("role: marketer-only session", PB.checkRole(7, MARKETER), "marketer-session");
  eq("role: a marketer who is also a consultant may prepare (their own profile)", PB.checkRole(7, Object.assign({}, CONSULTANT, { marketer: true })), null);
  eq("role: enterprise account with neither role", PB.checkRole(7, { kind: "ENTERPRISE", orgId: 7, consultant: false, marketer: false }), "not-a-consultant");
  eq("role: personal", PB.checkRole(7, { kind: "PERSONAL" }), "wrong-account-kind");
  eq("role: other org", PB.checkRole(8, CONSULTANT), "wrong-org");
  eq("role: nothing known", PB.checkRole(7, null), "unknown");
  ok("tenant origin: https acme.kiwiply.com", PB.tenantOriginAllowed(TENANT));
  ok("tenant origin: not http, not a port, not a look-alike", !PB.tenantOriginAllowed("http://acme.kiwiply.com") && !PB.tenantOriginAllowed("https://acme.kiwiply.com:8443") && !PB.tenantOriginAllowed("https://kiwiply.com.evil.test") && !PB.tenantOriginAllowed("https://evilkiwiply.com") && !PB.tenantOriginAllowed("nope"));
  ok("session id: a positive integer is taken as its decimal string", PB.validate(msg({ sessionId: 42 })).batch.sessionId === "42");
  eq("session id: zero, a float and a negative number are refused", [0, 1.5, -3].map((v) => PB.validate(msg({ sessionId: v })).reason), ["bad-session", "bad-session", "bad-session"]);

  /* ---------------------------------------------------------- 2b. dev-build allowances come from the manifest only */
  {
    ok("no manifest: no http origin is allowed anywhere", !PB.devAtsOriginAllowed("http://jobs.localhost:3399") && !PB.devTenantOriginAllowed("http://acme.localhost:3200"));
    const hadChrome = Object.prototype.hasOwnProperty.call(globalThis, "chrome");
    const before = globalThis.chrome;
    globalThis.chrome = { runtime: { getManifest: () => ({
      host_permissions: ["https://*.greenhouse.io/*", "http://jobs.localhost:3399/*", "http://localhost:18183/*"],
      externally_connectable: { matches: ["https://kiwiply.com/*", "https://*.kiwiply.com/*", "http://localhost:3200/*", "http://*.localhost:3200/*"] },
    }) } };
    try {
      ok("dev ATS origin: exact host and port from host_permissions", PB.devAtsOriginAllowed("http://jobs.localhost:3399"));
      ok("dev ATS origin: another port, https, a non-localhost host and a look-alike are refused", !PB.devAtsOriginAllowed("http://jobs.localhost:3400") && !PB.devAtsOriginAllowed("https://jobs.localhost:3399") && !PB.devAtsOriginAllowed("http://jobs.example.com:3399") && !PB.devAtsOriginAllowed("http://evil-jobs.localhost:3399"));
      ok("dev ATS origin: the plain-localhost API host is not an ATS origin", !PB.devAtsOriginAllowed("http://localhost:18183"));
      eq("cleanUrl: a dev ATS http link passes", PB.cleanUrl("http://jobs.localhost:3399/greenhouse/acme/12?t=Platform%20Engineer").url, "http://jobs.localhost:3399/greenhouse/acme/12?t=Platform%20Engineer");
      eq("cleanUrl: other http links still fail", PB.cleanUrl("http://jobs.lever.co/a/1").error, "http-url");
      eq("cleanUrl: credentials on a dev link still fail", PB.cleanUrl("http://u:p@jobs.localhost:3399/a").error, "http-url");
      ok("dev tenant origin: a *.localhost:3200 page may send a batch", PB.tenantOriginAllowed("http://acme.localhost:3200") && PB.tenantOriginAllowed("http://gamma.localhost:3200"));
      ok("dev tenant origin: not another port, not https, not the bare platform host via the wildcard rule's http check", !PB.tenantOriginAllowed("http://acme.localhost:3000") && !PB.tenantOriginAllowed("https://acme.localhost:3200") && !PB.tenantOriginAllowed("http://acme.kiwiply.com"));
      ok("production tenant rule is unchanged", PB.tenantOriginAllowed(TENANT) && !PB.tenantOriginAllowed("https://acme.kiwiply.com:8443"));
    } finally {
      if (hadChrome) globalThis.chrome = before; else delete globalThis.chrome;
    }
  }

  /* ---------------------------------------------------------- fakes */
  function memStorage() {
    const data = {};
    return {
      data,
      get: async (k) => (k in data ? JSON.parse(JSON.stringify(data[k])) : undefined),
      set: async (k, v) => { data[k] = JSON.parse(JSON.stringify(v)); },
      remove: async (k) => { delete data[k]; },
    };
  }
  function memIndex() { let v = null; return { get: async () => v, set: async (x) => { v = x; } }; }
  function fakeProvider(opts) {
    opts = opts || {};
    const p = {
      calls: [], attempts: 0,
      failWith: opts.failWith || null,
      async reportPrepareEvent(orgId, sessionId, body) {
        p.attempts++;
        if (p.failWith) { const e = new Error("boom"); e.status = p.failWith; throw e; }
        p.calls.push({ orgId, sessionId, body: Object.assign({}, body) });
        return true;
      },
      async getAccount() { if (opts.getAccount) return opts.getAccount(); return CONSULTANT; },
    };
    return p;
  }
  // a clock + wait that records the pacing
  function fakeTime() {
    const t = { now: 1_000_000, log: [], waits: [] };
    t.nowFn = () => t.now;
    t.wait = async (ms) => { t.waits.push(ms); t.log.push("wait"); t.now += ms; };
    return t;
  }
  function rig(over) {
    over = over || {};
    const storage = over.storage || memStorage();
    const index = over.index || memIndex();
    const time = over.time || fakeTime();
    const provider = over.provider || fakeProvider();
    const tabs = over.tabs || (() => {
      let n = 100;
      const t = {
        created: [], gone: new Set(),
        create: async (o) => { if (t.failCreate) throw new Error("no"); time.log.push("create"); const id = ++n; t.created.push({ id, url: o.url, active: o.active }); return { id }; },
        get: async (id) => { if (t.gone.has(id)) throw new Error("No tab"); return { id }; },
      };
      return t;
    })();
    const prepared = [];
    const session = over.session || (() => SESSION);
    const ctl = PB.createController({
      tabs, storage, index, readSession: async () => session(), getProvider: async () => provider,
      prepareTab: over.prepareTab || (async (tabId, j, b) => { prepared.push({ tabId, j, b }); return { outcome: "READY" }; }),
      now: time.nowFn, wait: time.wait,
    });
    return { ctl, storage, index, time, provider, tabs, prepared };
  }
  const batchOf = (n) => PB.validate(msg({ jobs: Array.from({ length: n }, (_, i) => job(i + 1)) })).batch;
  const states = async (r) => (await r.ctl.status()).jobs.map((j) => j.state);

  /* ---------------------------------------------------------- 3. the receiver: ACK paths */
  function receiverRig(over) {
    over = over || {};
    const r = rig(over.rig);
    let settings = over.settings === undefined ? { apiBaseUrl: "https://api.kiwiply.com", account: CONSULTANT } : over.settings;
    const saved = [];
    const recv = PB.createReceiver({
      originAllowed: over.originAllowed || ((o) => o === TENANT || o === "https://kiwiply.com"),
      readSession: async () => (over.session === undefined ? SESSION : over.session),
      readSettings: async () => settings,
      saveSettings: async (s) => { settings = s; saved.push(s); },
      getProvider: async () => (over.noProvider ? null : r.provider),
      controller: r.ctl,
    });
    return Object.assign({ recv, saved, settings: () => settings }, r);
  }
  {
    const r = receiverRig();
    const a = await r.recv.receive(msg(), TENANT);
    eq("ACK accepted for an enterprise consultant of that org", a, { type: "KIWIPLY_PREPARE_ACK", accepted: true, sessionId: "sess_abc123" });
    await r.ctl.idle();
    eq("an accepted batch opened its tabs", r.tabs.created.map((t) => t.url), ["https://jobs.lever.co/acme/1", "https://jobs.lever.co/acme/2"]);
    ok("tabs open in the background (the consultant's current tab is not stolen)", r.tabs.created.every((t) => t.active === false));

    eq("a second send of the same session is accepted without opening again", (await r.recv.receive(msg(), TENANT)).accepted, true);
    await r.ctl.idle();
    eq("...and no extra tabs", r.tabs.created.length, 2);
    const other = await r.recv.receive(msg({ sessionId: "sess_other99" }), TENANT);
    eq("a different session while one is running is refused", [other.accepted, other.reason], [false, "batch-in-progress"]);
  }
  {
    const r = receiverRig();
    eq("ACK: unknown type is silent (null)", await r.recv.receive({ type: "KIWIPLY_SYNC" }, TENANT), null);
    eq("ACK: untrusted origin", (await r.recv.receive(msg(), "https://evil.test")).reason, "untrusted-origin");
    eq("ACK: untrusted origin opens nothing", r.tabs.created.length, 0);
    eq("ACK: too many jobs", (await r.recv.receive(msg({ jobs: Array.from({ length: 11 }, (_, i) => job(i + 1)) }), TENANT)).reason, "too-many-jobs");
    eq("ACK: http URL", (await r.recv.receive(msg({ jobs: [job(1, { url: "http://jobs.lever.co/a" })] }), TENANT)).reason, "http-url");
    const bad = await r.recv.receive(msg({ version: 9 }), TENANT);
    eq("ACK: a refusal still echoes the session id", [bad.accepted, bad.sessionId, bad.reason], [false, "sess_abc123", "unsupported-version"]);
    eq("ACK: nothing opened by any refusal", r.tabs.created.length, 0);
    eq("ACK: a refusal has no state behind it", await r.ctl.status(), null);
  }
  {
    const r = receiverRig({ session: { access: "a", kind: "PERSONAL", userId: 1 } });
    eq("ACK: personal account", (await r.recv.receive(msg(), TENANT)).reason, "wrong-account-kind");
    eq("ACK: nothing opened", r.tabs.created.length, 0);
  }
  {
    const r = receiverRig({ session: {} });
    eq("ACK: not connected", (await r.recv.receive(msg(), TENANT)).reason, "not-connected");
  }
  {
    const r = receiverRig({ session: Object.assign({}, SESSION, { orgId: 9 }) });
    eq("ACK: connected to another org", (await r.recv.receive(msg(), TENANT)).reason, "wrong-org");
  }
  {
    const r = receiverRig({ settings: { apiBaseUrl: "https://api.kiwiply.com", account: MARKETER }, rig: { provider: fakeProvider({ getAccount: () => MARKETER }) } });
    const a = await r.recv.receive(msg(), TENANT);
    eq("ACK: a marketer session never starts a batch (even after a fresh look)", [a.accepted, a.reason], [false, "marketer-session"]);
    eq("ACK: ...and opens nothing", r.tabs.created.length, 0);
  }
  {
    // cached flags say marketer but the server now says consultant: refreshed once, accepted, cached
    const r = receiverRig({ settings: { apiBaseUrl: "https://api.kiwiply.com", account: MARKETER }, rig: { provider: fakeProvider({ getAccount: () => CONSULTANT }) } });
    const a = await r.recv.receive(msg(), TENANT);
    eq("ACK: stale cached role is refreshed once", a.accepted, true);
    eq("ACK: the refreshed role is cached", r.settings().account.consultant, true);
  }
  {
    // an enterprise session whose flags were never fetched: asks the server
    const r = receiverRig({ settings: { apiBaseUrl: "https://api.kiwiply.com" } });
    eq("ACK: unknown role is resolved through getAccount", (await r.recv.receive(msg(), TENANT)).accepted, true);
    const r2 = receiverRig({ settings: { apiBaseUrl: "https://api.kiwiply.com" }, noProvider: true });
    eq("ACK: unknown role and no way to ask -> refused, not guessed", (await r2.recv.receive(msg(), TENANT)).reason, "role-unknown");
    const r3 = receiverRig({ settings: { apiBaseUrl: "https://api.kiwiply.com" }, rig: { provider: fakeProvider({ getAccount: () => { throw new Error("offline"); } }) } });
    eq("ACK: offline role lookup -> refused", (await r3.recv.receive(msg(), TENANT)).reason, "role-unknown");
  }
  {
    const r = receiverRig({ settings: { apiBaseUrl: "https://api.other.test", account: CONSULTANT } });
    eq("ACK: a page naming another API than ours is refused", (await r.recv.receive(msg(), TENANT)).reason, "api-mismatch");
    const r2 = receiverRig({ settings: { apiBaseUrl: "https://api.kiwiply.com", account: CONSULTANT } });
    eq("ACK: no apiBase in the message is fine", (await r2.recv.receive(msg({ apiBase: undefined }), TENANT)).accepted, true);
  }
  {
    // a role lookup that never returns must not blow the 3 s budget
    const never = new Promise(() => {});
    const r = receiverRig({ settings: { apiBaseUrl: "https://api.kiwiply.com", account: MARKETER }, rig: { provider: fakeProvider({ getAccount: () => never }) } });
    const t0 = Date.now();
    const a = await r.recv.receive(msg(), TENANT);
    ok("ACK: a hanging role lookup answers inside the 3 s budget", Date.now() - t0 < 3000 && a.accepted === false, String(Date.now() - t0));
  }

  /* ---------------------------------------------------------- 4. scheduling against a mocked chrome.tabs */
  {
    const r = rig();
    await r.ctl.start(batchOf(8), { userId: 42 });
    await r.ctl.idle();
    eq("8 jobs: only 5 tabs are opened (max concurrent)", r.tabs.created.length, 5);
    eq("8 jobs: 5 OPENED, 3 still QUEUED", await states(r), ["OPENED", "OPENED", "OPENED", "OPENED", "OPENED", "QUEUED", "QUEUED", "QUEUED"]);
    eq("tabs open one at a time with a pause between them, never all at once", r.time.log.join(","), "create,wait,create,wait,create,wait,create,wait,create,wait");
    ok("the pause is the configured delay", r.time.waits.every((w) => w === PB.OPEN_DELAY_MS) && PB.OPEN_DELAY_MS >= 1000);
    eq("opens the jobs in the order given", r.tabs.created.map((t) => t.url.split("/").pop()), ["1", "2", "3", "4", "5"]);
    eq("OPENED is reported for every opened tab, in order", r.provider.calls.map((c) => [c.body.matchId, c.body.event]), [[1, "OPENED"], [2, "OPENED"], [3, "OPENED"], [4, "OPENED"], [5, "OPENED"]]);
    ok("events go to /con/prepare/{session} of the right org", r.provider.calls.every((c) => c.orgId === 7 && c.sessionId === "sess_abc123"));

    eq("Open next at capacity does nothing", (await r.ctl.openNext()).reason, "at-capacity");
    await r.ctl.onTabRemoved(101); // the consultant closes tab 1
    await r.ctl.idle();
    eq("closing a tab frees a slot: the next job opens by itself", r.tabs.created.length, 6);
    ok("...and CLOSED is reported for the closed tab", r.provider.calls.some((c) => c.body.matchId === 1 && c.body.event === "CLOSED"));
    eq("the closed job keeps no tab", (await r.ctl.status()).jobs[0].tabOpen, false);

    // submitting frees a slot too (that tab is done, even though it is still open)
    await r.ctl.onSubmitDetected(102);
    await r.ctl.idle();
    eq("a submitted tab no longer counts against the cap", r.tabs.created.length, 7);
    await r.ctl.onSubmitDetected(102);
    eq("a repeated submit signal reports once", r.provider.calls.filter((c) => c.body.matchId === 2 && c.body.event === "SUBMIT_DETECTED").length, 1);
    await r.ctl.onTabRemoved(102);
    ok("a submitted job stays 'Submitted' after its tab closes (and CLOSED is still reported)",
      (await r.ctl.status()).jobs[1].state === "SUBMIT_DETECTED" && r.provider.calls.some((c) => c.body.matchId === 2 && c.body.event === "CLOSED"));
    await r.ctl.idle();
    eq("...and the queue is held by the cap again (5 active)", r.tabs.created.length, 7);

    const s = await r.ctl.status();
    eq("overview counts", [s.counts.total, s.counts.submitted, s.counts.closed, s.counts.waiting, s.done], [8, 1, 1, 6, false]);
  }
  {
    // "Open next": below the cap it opens the next queued job immediately (e.g. after a worker restart
    // cut the pacing short); at the cap it refuses.
    const r = rig();
    const realWait = r.time.wait;
    let calls = 0;
    r.time.wait = async (ms) => { if (calls++ === 0) throw new Error("worker killed mid-pacing"); return realWait(ms); };
    const ctl = PB.createController({
      tabs: r.tabs, storage: r.storage, index: r.index, readSession: async () => SESSION, getProvider: async () => r.provider,
      prepareTab: async () => ({ outcome: "READY" }), now: r.time.nowFn, wait: (ms) => r.time.wait(ms),
    });
    await ctl.start(batchOf(4), { userId: 42 });
    await ctl.idle();
    eq("pacing interrupted after the first tab", r.tabs.created.length, 1);
    eq("Open next opens the next queued job", (await ctl.openNext()).ok, true);
    eq("...one tab", r.tabs.created.length, 2);
    await ctl.pump();
    await ctl.idle();
    eq("the rest follow, up to the cap", r.tabs.created.length, 4);
    eq("Open next with nothing queued", (await ctl.openNext()).reason, "none-queued");
  }
  {
    const r = rig();
    r.tabs.failCreate = true;
    await r.ctl.start(batchOf(2), { userId: 42 });
    await r.ctl.idle();
    eq("a tab that cannot be opened is FAILED, not retried", await states(r), ["FAILED", "FAILED"]);
    ok("FAILED is reported with a plain reason", r.provider.calls.length === 2 && r.provider.calls[0].body.event === "FAILED" && /could not be opened/.test(r.provider.calls[0].body.detail));
  }

  /* ---------------------------------------------------------- 5. per-tab state + preparing */
  {
    const r = rig();
    await r.ctl.start(batchOf(2), { userId: 42 });
    await r.ctl.idle();
    await r.ctl.onTabUpdated(101, { status: "loading" });
    eq("a loading tab is not prepared yet", r.prepared.length, 0);
    await r.ctl.onTabUpdated(999, { status: "complete" });
    eq("a tab that is not in the batch is ignored", r.prepared.length, 0);
    await r.ctl.onTabUpdated(101, { status: "complete" });
    eq("a loaded tab is prepared once", [r.prepared.length, r.prepared[0].tabId, r.prepared[0].j.matchId, r.prepared[0].b.sessionId], [1, 101, 1, "sess_abc123"]);
    eq("READY leaves the job waiting for the consultant (no event)", (await states(r))[0], "OPENED");
    await r.ctl.onTabUpdated(101, { status: "complete" });
    eq("a second load within the retry gap does not prepare again", r.prepared.length, 1);
    r.time.now += PB.RETRY_GAP_MS + 1;
    await r.ctl.onTabUpdated(101, { status: "complete" });
    eq("...after the gap it may, once per page load", r.prepared.length, 2);
    for (let i = 0; i < 5; i++) { r.time.now += PB.RETRY_GAP_MS + 1; await r.ctl.onTabUpdated(101, { status: "complete" }); }
    eq("attempts are capped (never an aggressive retry loop)", r.prepared.length, PB.MAX_ATTEMPTS);

    // progress from the page: counts only
    const b = { sessionId: "sess_abc123", matchId: 1 };
    await r.ctl.onProgress(101, { batch: b, phase: "gaps", gaps: 0 });
    eq("progress before any fill is ignored", (await states(r))[0], "OPENED");
    await r.ctl.onProgress(101, { batch: { sessionId: "sess_abc123", matchId: 2 }, phase: "filled", gaps: 0 });
    eq("progress naming another job's tab is ignored", (await states(r))[0], "OPENED");
    await r.ctl.onProgress(101, { batch: { sessionId: "sess_zzz", matchId: 1 }, phase: "filled", gaps: 0 });
    eq("progress for another session is ignored", (await states(r))[0], "OPENED");
    await r.ctl.onProgress(101, { batch: b, phase: "filled", filled: 9, failed: 0, gaps: 2 });
    eq("filled with 2 required fields left -> NEEDS_INPUT", (await states(r))[0], "NEEDS_INPUT");
    await r.ctl.onProgress(101, { batch: b, phase: "gaps", gaps: 0 });
    eq("the consultant completes them -> PREFILLED", (await states(r))[0], "PREFILLED");
    await r.ctl.onProgress(102, { batch: { sessionId: "sess_abc123", matchId: 2 }, phase: "filled", gaps: 0 });
    eq("filled with nothing left -> PREFILLED", (await states(r))[1], "PREFILLED");
    await r.ctl.idle();
    const ev = r.provider.calls.filter((c) => c.body.matchId === 1).map((c) => c.body.event);
    eq("event sequence for job 1", ev, ["OPENED", "NEEDS_INPUT", "PREFILLED"]);
    const need = r.provider.calls.find((c) => c.body.event === "NEEDS_INPUT");
    eq("the detail is a count, never a field name or an answer", need.body.detail, "2 required fields need your input");
    ok("every event body has only matchId, event and an optional detail <= 200 chars",
      r.provider.calls.every((c) => Object.keys(c.body).every((k) => ["matchId", "event", "detail"].indexOf(k) !== -1) && PB.EVENTS.indexOf(c.body.event) !== -1 && (c.body.detail || "").length <= 200));
    const s = await r.ctl.status();
    eq("overview: waiting / filled / needs input / submitted", [s.counts.waiting, s.counts.filled, s.counts.needsInput, s.counts.submitted], [0, 2, 0, 0]);
  }
  {
    // sign-in wall / CAPTCHA / unsupported -> NEEDS_INPUT with a plain reason, then it waits
    const outcomes = [{ outcome: "NEEDS_INPUT", reason: PB.REASON.signin }, { outcome: "NEEDS_INPUT", reason: PB.REASON.captcha }, { outcome: "FAILED", reason: PB.REASON.fillFailed }];
    let i = 0;
    const r = rig({ prepareTab: async () => outcomes[i++] });
    await r.ctl.start(batchOf(3), { userId: 42 });
    await r.ctl.idle();
    for (const id of [101, 102, 103]) await r.ctl.onTabUpdated(id, { status: "complete" });
    await r.ctl.idle();
    eq("sign-in / CAPTCHA / failure states", await states(r), ["NEEDS_INPUT", "NEEDS_INPUT", "FAILED"]);
    const s = await r.ctl.status();
    ok("the drawer gets a plain reason and what to do", s.jobs[0].reason === "Sign-in required" && /Sign in/.test(s.jobs[0].help) && /verification/i.test(s.jobs[1].help));
    ok("each is reported once, with the reason as detail", r.provider.calls.filter((c) => c.body.event === "NEEDS_INPUT").map((c) => c.body.detail).join("|") === "Sign-in required|Verification (CAPTCHA) needs you");
    // the consultant signs in: the page reloads, the wall is gone -> back to waiting, once more event
    i = 0;
    const r2 = rig({ prepareTab: async () => (i++ === 0 ? { outcome: "NEEDS_INPUT", reason: PB.REASON.signin } : { outcome: "READY" }) });
    await r2.ctl.start(batchOf(1), { userId: 42 });
    await r2.ctl.idle();
    await r2.ctl.onTabUpdated(101, { status: "complete" });
    eq("wall -> NEEDS_INPUT", (await states(r2))[0], "NEEDS_INPUT");
    r2.time.now += PB.RETRY_GAP_MS + 1;
    await r2.ctl.onTabUpdated(101, { status: "complete" });
    eq("after sign-in the tab waits for the consultant again", (await states(r2))[0], "OPENED");
  }
  {
    // success navigation (a thank-you page) on a batch tab
    const r = rig();
    await r.ctl.start(batchOf(1), { userId: 42 });
    await r.ctl.idle();
    await r.ctl.onSuccessNavigation(101, "https://jobs.lever.co/acme/1#x");
    eq("landing back on the job's own address is not a submission", (await states(r))[0], "OPENED");
    await r.ctl.onSuccessNavigation(101, "https://jobs.lever.co/acme/1/thanks");
    eq("a confirmation page is SUBMIT_DETECTED", (await states(r))[0], "SUBMIT_DETECTED");
  }

  /* ---------------------------------------------------------- 6. event delivery: best effort */
  {
    const r = rig({ provider: fakeProvider({ failWith: 503 }) });
    await r.ctl.start(batchOf(3), { userId: 42 });
    await r.ctl.idle();
    eq("the fill pipeline is not blocked by a failing server: all tabs opened", r.tabs.created.length, 3);
    const out = (await r.storage.get(PB.stateKey(7))).outbox;
    eq("unsent events are kept, in order", out.map((o) => [o.matchId, o.event]), [[1, "OPENED"], [2, "OPENED"], [3, "OPENED"]]);
    ok("a failing server is tried once per flush, not once per event (no hammering)", r.provider.attempts <= 3 && r.provider.calls.length === 0, String(r.provider.attempts));
    r.provider.failWith = null;
    await r.ctl.flush();
    eq("the next flush delivers everything, in order", r.provider.calls.map((c) => c.body.matchId), [1, 2, 3]);
    eq("...and empties the outbox", (await r.storage.get(PB.stateKey(7))).outbox.length, 0);
  }
  {
    const r = rig({ provider: fakeProvider({ failWith: 403 }) });
    await r.ctl.start(batchOf(1), { userId: 42 });
    await r.ctl.idle();
    eq("a refusal that retrying cannot fix is dropped", (await r.storage.get(PB.stateKey(7))).outbox.length, 0);
    const r2 = rig({ provider: fakeProvider({ failWith: 500 }) });
    await r2.ctl.start(batchOf(1), { userId: 42 });
    await r2.ctl.idle();
    for (let i = 0; i < PB.OUTBOX_TRIES + 1 || i < 6; i++) await r2.ctl.flush();
    eq("an event that never gets through is given up on after a few tries", (await r2.storage.get(PB.stateKey(7))).outbox.length, 0);
    const r3 = rig({ provider: { getAccount: async () => CONSULTANT } });
    await r3.ctl.start(batchOf(1), { userId: 42 });
    await r3.ctl.idle();
    eq("a provider without the method is a no-op, the batch still runs", (await states(r3)), ["OPENED"]);
  }
  /* ---------------------------------------------------------- 7. survives a service-worker restart */
  {
    const r = rig();
    await r.ctl.start(batchOf(7), { userId: 42 });
    await r.ctl.idle();
    // the worker is killed: a brand-new controller on the same storage
    const r2 = rig({ storage: r.storage, index: r.index, time: r.time, provider: r.provider, tabs: r.tabs });
    const s = await r2.ctl.status();
    eq("state survives: same session, same jobs", [s.sessionId, s.jobs.length, s.counts.active], ["sess_abc123", 7, 5]);
    await r2.ctl.onProgress(101, { batch: { sessionId: "sess_abc123", matchId: 1 }, phase: "filled", gaps: 0 });
    eq("a restarted worker keeps tracking tabs", (await r2.ctl.status()).jobs[0].state, "PREFILLED");
    await r2.ctl.onTabRemoved(102);
    await r2.ctl.idle();
    eq("...and keeps opening the queue", r2.tabs.created.length, 6);
    // browser restart: tabs are gone
    r2.tabs.gone = new Set([101, 103, 104, 105, 106]);
    await r2.ctl.reconcile();
    const s3 = await r2.ctl.status();
    ok("reconcile marks tabs that no longer exist as closed", s3.jobs.slice(0, 6).every((j) => j.state === "CLOSED" || j.state === "SUBMIT_DETECTED" || !j.tabOpen));
  }

  /* ---------------------------------------------------------- 8. cancel + account change */
  {
    const r = rig();
    await r.ctl.start(batchOf(7), { userId: 42 });
    await r.ctl.idle();
    const before = r.tabs.created.length;
    const res = await r.ctl.stop();
    await r.ctl.idle();
    eq("stop is accepted", res.ok, true);
    const s = await r.ctl.status();
    eq("stopped: queued jobs are dropped, open tabs are left alone", [s.stopped, s.jobs.slice(0, 5).map((j) => j.state), s.jobs.slice(5).map((j) => j.state)], [true, ["OPENED", "OPENED", "OPENED", "OPENED", "OPENED"], ["CLOSED", "CLOSED"]]);
    ok("stop closes no tab (the controller has no way to)", before === 5 && r.tabs.remove === undefined);
    await r.ctl.onTabRemoved(101);
    await r.ctl.idle();
    eq("a stopped batch opens nothing more", r.tabs.created.length, 5);
    const n = r.provider.calls.length;
    await r.ctl.onProgress(102, { batch: { sessionId: "sess_abc123", matchId: 2 }, phase: "filled", gaps: 0 });
    await r.ctl.onSubmitDetected(102);
    await r.ctl.idle();
    eq("a stopped batch reports nothing further", r.provider.calls.length, n);
    eq("a stopped batch can be dismissed", (await r.ctl.dismiss()).ok, true);
    eq("...after which there is no batch", await r.ctl.status(), null);
    // a new batch may start once the old one is stopped
    const again = await r.ctl.start(PB.validate(msg({ sessionId: "sess_new0001" })).batch, { userId: 42 });
    eq("a new batch can start after dismissing", again.ok, true);
  }
  {
    let sess = SESSION;
    const r = rig({ session: () => sess });
    await r.ctl.start(batchOf(2), { userId: 42 });
    await r.ctl.idle();
    sess = Object.assign({}, SESSION, { userId: 43 }); // a different account connected
    eq("another account never sees (or drives) the batch", await r.ctl.status(), null);
    eq("...its stored state is removed", await r.storage.get(PB.stateKey(7)), undefined);
    await r.ctl.onProgress(101, { batch: { sessionId: "sess_abc123", matchId: 1 }, phase: "filled", gaps: 0 });
    eq("...and tab events do nothing", r.provider.calls.length, 2);
    sess = {}; // signed out
    const r2 = rig({ session: () => sess });
    sess = SESSION;
    await r2.ctl.start(batchOf(1), { userId: 42 });
    sess = {};
    eq("signing out ends it", await r2.ctl.status(), null);
  }
  {
    // the state lives in the account-bound partition, so JAF.storage.clearAccountData removes it
    ok("state key is under the ws: account partition", PB.stateKey(7) === "ws:7:prepareBatch" && PB.stateKey(7).indexOf("ws:") === 0);
  }

  /* ---------------------------------------------------------- 9. the provider seam */
  {
    const calls = [];
    const fetchFn = async (url, opts) => { calls.push({ url, opts }); return { ok: true, status: 204, text: async () => "" }; };
    const p = T.createKiwiplyProvider({ baseUrl: "https://api.test", fetch: fetchFn, tokenStore: T.memoryTokenStore({ access: "ACC", refresh: "REF" }) });
    await p.reportPrepareEvent(7, "sess_abc123", { matchId: 5, event: "NEEDS_INPUT", detail: "2 required fields need your input" });
    const u = new URL(calls[0].url);
    eq("provider: POST /api/orgs/{orgId}/con/prepare/{sessionId}/events", [calls[0].opts.method, u.pathname], ["POST", "/api/orgs/7/con/prepare/sess_abc123/events"]);
    eq("provider: body is {matchId, event, detail}", JSON.parse(calls[0].opts.body), { matchId: 5, event: "NEEDS_INPUT", detail: "2 required fields need your input" });
    eq("provider: the user's own bearer token, no workspace header", [calls[0].opts.headers.Authorization, Object.keys(calls[0].opts.headers).some((k) => /workspace|tenant/i.test(k))], ["Bearer ACC", false]);
    await p.reportPrepareEvent(7, "s1", { matchId: 5, event: "CLOSED" });
    eq("provider: detail is optional", JSON.parse(calls[1].opts.body), { matchId: 5, event: "CLOSED" });
    await p.reportPrepareEvent(7, "s1", { matchId: 5, event: "FAILED", detail: "x".repeat(400) });
    eq("provider: detail is cut at 200", JSON.parse(calls[2].opts.body).detail.length, 200);
    let err = null;
    try { await p.reportPrepareEvent(7, "../../x", { matchId: 5, event: "OPENED" }); } catch (e) { err = e; }
    ok("provider: a session id with path characters is refused before any request", !!err && calls.length === 3);
    err = null;
    try { await p.reportPrepareEvent("7/../8", "s1", { matchId: 5, event: "OPENED" }); } catch (e) { err = e; }
    ok("provider: org id must be a plain positive integer", !!err && calls.length === 3);
    let base = null;
    try { await new T.TrackingProvider().reportPrepareEvent(1, "s", {}); } catch (e) { base = e.name; }
    eq("base provider: NotSupported until implemented", base, "NotSupportedError");
  }

  /* ---------------------------------------------------------- 10. preparing one tab (the normal pipeline) */
  function prepRig(over) {
    over = over || {};
    const sent = [];
    const d = {
      injected: [],
      inject: async (id) => { if (over.injectFails) throw new Error("Cannot access contents of url"); d.injected.push(id); },
      scanFrames: async () => over.frames || [{ frameId: 0, adapter: "lever", fieldCount: 8 }],
      sendTo: async (tabId, m, frameId) => {
        sent.push({ tabId, m, frameId });
        if (m.type === "JAF_BATCH_CHECK") return { ok: true, kind: over.kind || "form" };
        if (m.type === "JAF_BATCH_FILL") return over.fillResp === undefined ? { ok: true, adapter: "lever" } : over.fillResp;
        return null;
      },
      loadMirror: async () => (over.mirror === undefined ? { bio: { firstName: "Cora", email: "c@x.test" }, resume: { skills: ["go"] }, file: null, resumeRef: { serverId: 3, label: "Main" } } : over.mirror),
      wait: async () => {},
    };
    return { prep: PB.createPreparer(d), sent, d };
  }
  const BATCH = { sessionId: "sess_abc123", orgId: 7 };
  {
    const r = prepRig();
    const res = await r.prep.prepare(101, { matchId: 1 }, BATCH);
    eq("prepare: a normal form -> READY", res, { outcome: "READY" });
    const fill = r.sent.find((s) => s.m.type === "JAF_BATCH_FILL");
    eq("prepare: sent to the best form frame", fill.frameId, 0);
    eq("prepare: auto-advance is forced OFF for batch tabs", fill.m.options.autoAdvance, false);
    eq("prepare: the batch ids travel with the fill", fill.m.options.batch, { sessionId: "sess_abc123", matchId: 1 });
    eq("prepare: the consultant's own mirrored profile is what is sent", fill.m.bio.firstName, "Cora");
    eq("prepare: the resume reference is passed on", fill.m.options.resume, { serverId: 3, label: "Main" });
    ok("prepare: no opportunity link is attached (the server linker owns the link)", !("opportunity" in fill.m.options));
    ok("prepare: it never asks for anything but a check and a fill", r.sent.every((s) => s.m.type === "JAF_BATCH_CHECK" || s.m.type === "JAF_BATCH_FILL"));
  }
  {
    // A job that names its resume (the one the marketer tailored for it): the id survives validation and reaches the mirror loader for that tab only.
    const v = PB.validate(msg({ jobs: [job(1, { resumeId: 12 }), job(2, { resumeId: "x" }), job(3)] }));
    eq("resumeId: a positive id is kept on its job", v.batch.jobs.map((j) => j.resumeId), [12, undefined, undefined]);
    const r = prepRig();
    const seen = [];
    r.d.loadMirror = async (j) => { seen.push(j && j.resumeId); return { bio: { firstName: "Cora" }, resume: null, file: null, resumeRef: null }; };
    await r.prep.prepare(1, { matchId: 1, resumeId: 12 }, BATCH);
    await r.prep.prepare(2, { matchId: 2 }, BATCH);
    eq("resumeId: the mirror loader is asked for that job's resume, and for the usual pick otherwise", seen, [12, undefined]);
  }
  {
    eq("prepare: sign-in wall -> NEEDS_INPUT, no fill sent", (await (async () => { const r = prepRig({ kind: "signin" }); const x = await r.prep.prepare(1, { matchId: 1 }, BATCH); return [x, r.sent.some((s) => s.m.type === "JAF_BATCH_FILL")]; })()), [{ outcome: "NEEDS_INPUT", reason: PB.REASON.signin }, false]);
    eq("prepare: CAPTCHA page -> NEEDS_INPUT, no fill sent", (await (async () => { const r = prepRig({ kind: "captcha" }); const x = await r.prep.prepare(1, { matchId: 1 }, BATCH); return [x, r.sent.some((s) => s.m.type === "JAF_BATCH_FILL")]; })()), [{ outcome: "NEEDS_INPUT", reason: PB.REASON.captcha }, false]);
    eq("prepare: unsupported site (cannot inject) -> NEEDS_INPUT", await prepRig({ injectFails: true }).prep.prepare(1, { matchId: 1 }, BATCH), { outcome: "NEEDS_INPUT", reason: PB.REASON.unsupported });
    eq("prepare: no form anywhere -> NEEDS_INPUT", await prepRig({ frames: [{ frameId: 0, adapter: "generic", fieldCount: 1 }] }).prep.prepare(1, { matchId: 1 }, BATCH), { outcome: "NEEDS_INPUT", reason: PB.REASON.noForm });
    eq("prepare: empty profile -> NEEDS_INPUT (nothing to fill with)", await prepRig({ mirror: { bio: null } }).prep.prepare(1, { matchId: 1 }, BATCH), { outcome: "NEEDS_INPUT", reason: PB.REASON.profileEmpty });
    eq("prepare: the fill panel failing -> FAILED", await prepRig({ fillResp: null }).prep.prepare(1, { matchId: 1 }, BATCH), { outcome: "FAILED", reason: PB.REASON.fillFailed });
    const iframe = prepRig({ frames: [{ frameId: 0, adapter: "generic", fieldCount: 0 }, { frameId: 5, adapter: "greenhouse", fieldCount: 12 }] });
    await iframe.prep.prepare(1, { matchId: 1 }, BATCH);
    eq("prepare: an embedded ATS form is filled in its own frame", iframe.sent.find((s) => s.m.type === "JAF_BATCH_FILL").frameId, 5);
    const slow = prepRig({ frames: [] });
    let waited = 0;
    slow.d.wait = async () => { waited++; };
    const pr = PB.createPreparer(slow.d);
    await pr.prepare(1, { matchId: 1 }, BATCH);
    eq("prepare: a page with no form yet is looked at three times (single-page apps), not in a loop", [waited, slow.sent.filter((s) => s.m.type === "JAF_BATCH_CHECK").length], [2, 3]);

    // Ashby: the adapter matches by URL before the form is drawn. The fill waits for the fields instead of reviewing an empty page.
    let looks = 0;
    const late = prepRig();
    late.d.scanFrames = async () => (++looks < 3 ? [{ frameId: 0, adapter: "ashby", fieldCount: 0 }] : [{ frameId: 0, adapter: "ashby", fieldCount: 6 }]);
    let lateWaits = 0;
    late.d.wait = async () => { lateWaits++; };
    const lateRes = await PB.createPreparer(late.d).prepare(1, { matchId: 1 }, BATCH);
    eq("prepare: a known site whose form renders late is filled once its fields appear", [lateRes, looks, lateWaits, late.sent.filter((s) => s.m.type === "JAF_BATCH_FILL").length], [{ outcome: "READY" }, 3, 2, 1]);
    const never = prepRig({ frames: [{ frameId: 0, adapter: "ashby", fieldCount: 0 }] });
    eq("prepare: a known site that never shows countable fields is still filled after the last look (as before)", await never.prep.prepare(1, { matchId: 1 }, BATCH), { outcome: "READY" });
    let quick = 0;
    const ready = prepRig();
    ready.d.wait = async () => { quick++; };
    await PB.createPreparer(ready.d).prepare(1, { matchId: 1 }, BATCH);
    eq("prepare: a form that is already there is filled without waiting", quick, 0);
  }

  console.log(`${tag} ${pass} passed, ${fail} failed`);
  if (fails.length) { console.log(`${tag} Failures:`); fails.forEach((f) => console.log("  x " + f)); process.exit(1); }
  console.log(`${tag} All green.`);
})().catch((e) => { console.error(e); process.exit(1); });
