// Sign-out means this browser forgets the account (pre-launch review, 2026-09-22).
//
// Before this, sign-out dropped only the tokens: the drawer kept the previous user's profile and
// resumes (and would autofill with them), and on a shared computer the next person inherited all
// of it. This pins exactly what goes and exactly what stays, against the REAL storage.js.
const { makeWindow, load } = require("./harness");
let pass = 0, fail = 0;
const fails = [];
const tag = "[account_clear]";
function ok(n, c, e) { if (c) pass++; else { fail++; fails.push(n + (e ? "  ->  " + e : "")); } }

function raw(w) {
  return new Promise((res) => w.chrome.storage.local.get(null, (o) => res(o)));
}

(async function run() {
  const w = makeWindow();
  load(w, "src/lib/storage.js");
  const S = w.JAF.storage;

  await new Promise((res) => w.chrome.storage.local.set({
    // the account
    bio: { firstName: "Ada", email: "ada@example.com" },
    resumes: [{ id: "res_1", serverId: 7, label: "Backend" }],
    fieldCache: { k1: { value: "Yes, authorised to work" } },
    answerCache: { "why us": "Because…" },
    pickCache: { "relocate::yes|no": "Yes" },
    trackingPending: { 12: { serverId: 99, opportunity: { orgId: 42, id: 7 } } },
    // org workspaces (WP5): another person's assignment of a job to THIS account
    "ws:42:assignedJobs": { ts: 1, items: [{ id: 7, title: "Staff Engineer", assignedBy: "Sarah" }] },
    "ws:43:assignedJobs": { ts: 1, items: [] },
    // "Prepare selected openings" (X12.9): a batch belongs to the account that started it
    "ws:42:prepareBatch": { v: 1, sessionId: "sess_abc123", orgId: 42, userId: 9, jobs: [{ matchId: 1, state: "OPENED", tabId: 5 }], outbox: [] },
    // the device
    trackingAuth: { access: "a", refresh: "r", username: "ada" },
    fieldMapCache: { "first name": "firstName" },
    enrichCache: { "https://job": {} },
    gaClientId: "123.456",
    settings: {
      apiBaseUrl: "https://api.kiwiply.com", apiKey: "sk-byo", llmEnabled: true, autoAdvance: true,
      plan: "PRO", __profileVersion: "v1", __lastPull: 1, lastResumeId: "res_1",
      workspace: 42, workspaces: [{ orgId: 42, name: "Acme", consultant: true, marketer: false }],
    },
  }, () => res()));

  /* ---- web sign-out: keep learned answers and their owner (user decision 2026-09-22) ---- */
  await new Promise((res) => w.chrome.storage.local.set({ learnedAnswersOwner: "ada" }, () => res()));
  await S.clearAccountData({ keepLearnedAnswers: true });
  const soft = await raw(w);
  ok("web sign-out keeps learned answers", !!soft.fieldCache);
  ok("web sign-out keeps their owner, so a different account can be spotted later", soft.learnedAnswersOwner === "ada");
  ok("web sign-out still removes the profile and resumes", !("bio" in soft) && !("resumes" in soft));
  ok("web sign-out still removes AI drafts and pending tracking", !("answerCache" in soft) && !("trackingPending" in soft));
  ok("web sign-out removes every org-workspace cache (ws:<orgId>:assignedJobs)", !("ws:42:assignedJobs" in soft) && !("ws:43:assignedJobs" in soft), Object.keys(soft).filter((k) => k.indexOf("ws:") === 0).join(","));
  ok("web sign-out removes a running prepare batch (ws:<orgId>:prepareBatch)", !("ws:42:prepareBatch" in soft), Object.keys(soft).filter((k) => k.indexOf("ws:") === 0).join(","));
  ok("web sign-out removes the chosen workspace and the org list", !("workspace" in (soft.settings || {})) && !("workspaces" in (soft.settings || {})), JSON.stringify(soft.settings));
  ok("a ws: prefix match does not eat unrelated keys", "trackingAuth" in soft && "fieldMapCache" in soft);

  /* ---- full clear (options sign-out, account switch) ---- */
  await S.clearAccountData();
  const after = await raw(w);
  ok("full clear removes the owner marker too", !("learnedAnswersOwner" in after));

  for (const k of ["bio", "resumes", "fieldCache", "answerCache", "pickCache", "trackingPending"]) {
    ok("account data removed: " + k, !(k in after), JSON.stringify(after[k]));
  }
  ok("full clear removes org-workspace caches too", !Object.keys(after).some((k) => k.indexOf("ws:") === 0));
  // A leftover trackingPending entry would attribute an application id to whoever connects next.
  ok("pending submit-detection state cannot leak to the next account", !("trackingPending" in after));

  const s = after.settings || {};
  for (const k of ["plan", "__profileVersion", "__lastPull", "lastResumeId", "workspace", "workspaces"]) {
    ok("account setting removed: " + k, !(k in s), JSON.stringify(s));
  }
  // Device settings are the device owner's, not the account's.
  ok("device setting kept: apiBaseUrl", s.apiBaseUrl === "https://api.kiwiply.com");
  ok("device setting kept: BYO API key", s.apiKey === "sk-byo" && s.llmEnabled === true);
  ok("device setting kept: autoAdvance", s.autoAdvance === true);
  ok("device cache kept: fieldMapCache (labels only, nothing personal)", !!after.fieldMapCache);
  ok("device cache kept: enrichCache", !!after.enrichCache);
  ok("device id kept: gaClientId", after.gaClientId === "123.456");
  // The session is the CALLER's to clear, after a best-effort revoke that needs it.
  ok("session left to the caller", !!after.trackingAuth);

  // Reading back through the store API gives empty state, not stale state.
  const bio = await S.getBio();
  ok("getBio after clear has no previous user", !bio || !bio.firstName, JSON.stringify(bio));
  ok("getResumes after clear is empty", (await S.getResumes()).length === 0);

  // Idempotent: a second sign-out (web signal + options button) is harmless.
  let threw = false;
  try { await S.clearAccountData(); } catch (e) { threw = true; }
  ok("clearing twice is harmless", !threw);

  report();
})().catch((e) => { fail++; fails.push("async run threw -> " + (e && e.stack || e)); report(); });

function report() {
  console.log(`${tag} ${pass} passed, ${fail} failed`);
  if (fails.length) { console.log(`${tag} Failures:`); fails.forEach((f) => console.log("  x " + f)); process.exit(1); }
  console.log(`${tag} All green.`);
}
