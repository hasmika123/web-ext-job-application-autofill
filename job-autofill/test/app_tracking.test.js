// Tests for the application-tracking orchestration (Task 3.2): JAF.appTracking.
// Pure logic — DRAFT assembly, the conservative submission heuristics, and the
// provider-backed push/confirm — exercised against jsdom docs + a mock provider.
const { makeWindow, load } = require("./harness");
let pass = 0, fail = 0;
const fails = [];
function ok(n, c, e) { if (c) pass++; else { fail++; fails.push(n + (e ? "  ->  " + e : "")); } }
function eq(n, g, w) { ok(n, JSON.stringify(g) === JSON.stringify(w), `got ${JSON.stringify(g)} want ${JSON.stringify(w)}`); }

const w = makeWindow();
load(w, "src/lib/app-tracking.js");
const A = w.JAF.appTracking;

// A mock TrackingProvider that records calls and echoes a server-shaped result.
function mockProvider() {
  const calls = [];
  return {
    calls,
    async pushApplication(app) { calls.push({ m: "pushApplication", app }); return Object.assign({ serverId: 42 }, app); },
    async updateApplication(serverId, changes) { calls.push({ m: "updateApplication", serverId, changes }); return Object.assign({ serverId }, changes); },
  };
}

// Build a doc whose <body> carries the given text (for the success-signal scanner).
function docWith(text) {
  const win = makeWindow("<!doctype html><html><body>" + text + "</body></html>");
  return win.document;
}

(async function run() {
  /* ---- isSuccessUrl: confirmation pages vs ordinary pages ---- */
  [
    "https://jobs.lever.co/acme/123/thanks",
    "https://boards.greenhouse.io/acme/jobs/4012345/confirmation",
    "https://acme.com/apply/success",
    "https://acme.com/application-submitted",
    "https://acme.com/careers#/confirmation",
  ].forEach((u) => ok("isSuccessUrl true: " + u, A.isSuccessUrl(u) === true));
  [
    "https://jobs.lever.co/acme/2f3a-uuid/apply",
    "https://boards.greenhouse.io/acme/jobs/4012345",
    "https://acme.com/careers",
    "https://acme.com/application",   // bare /application, no confirmation suffix
  ].forEach((u) => ok("isSuccessUrl false: " + u, A.isSuccessUrl(u) === false));
  ok("isSuccessUrl false on empty", A.isSuccessUrl("") === false);

  /* ---- hasSuccessSignal: strong confirmation copy vs a plain form ---- */
  ok("signal: thank you for applying", A.hasSuccessSignal(docWith("Thank you for applying to Acme! We'll be in touch.")) === true);
  ok("signal: application submitted", A.hasSuccessSignal(docWith("<h1>Your application has been submitted.</h1>")) === true);
  ok("signal: we've received your application", A.hasSuccessSignal(docWith("We've received your application and will review it shortly.")) === true);
  ok("signal: successfully submitted", A.hasSuccessSignal(docWith("Application successfully submitted.")) === true);
  ok("no signal: a plain application form", A.hasSuccessSignal(docWith("Apply for this role. First name, last name. Submit application")) === false);
  ok("no signal: empty body", A.hasSuccessSignal(docWith("")) === false);
  ok("no signal: missing body", A.hasSuccessSignal({}) === false);

  /* ---- buildApplicationDraft: maps capture + resume; fills required fallbacks ---- */
  const full = A.buildApplicationDraft(
    { company: "Acme", role: "SRE", jobUrl: "https://x.co/j/1", location: "NYC", externalJobId: "JR-1", atsPlatform: "greenhouse", jobDescription: "Run it." },
    { serverId: 7, label: "Eng resume" }
  );
  eq("draft maps all fields + DRAFT + resumeId", full, {
    company: "Acme", roleTitle: "SRE", jobUrl: "https://x.co/j/1", location: "NYC",
    externalJobId: "JR-1", atsPlatform: "greenhouse", jobDescription: "Run it.",
    status: "DRAFT", source: "extension", resumeId: 7,
  });
  const fb = A.buildApplicationDraft({ jobUrl: "https://www.boards.greenhouse.io/acme/jobs/9" }, null);
  ok("draft company falls back to URL host (www stripped)", fb.company === "boards.greenhouse.io");
  ok("draft role falls back to 'Application'", fb.roleTitle === "Application");
  ok("draft without a synced resume omits resumeId", !("resumeId" in fb));
  ok("draft company fallback when no capture at all", A.buildApplicationDraft(null, null).company === "Unknown company");

  /* ---- pushDraft -> provider.pushApplication with the DRAFT ---- */
  const p1 = mockProvider();
  const saved = await A.pushDraft(p1, { company: "Acme", role: "SRE", externalJobId: "JR-1" }, { serverId: 7 });
  ok("pushDraft calls pushApplication", p1.calls[0].m === "pushApplication");
  ok("pushDraft sends a DRAFT with the resume id", p1.calls[0].app.status === "DRAFT" && p1.calls[0].app.resumeId === 7);
  ok("pushDraft returns the saved (server) entry", saved.serverId === 42);

  /* ---- confirmSubmission -> provider.updateApplication APPLIED ---- */
  const p2 = mockProvider();
  await A.confirmSubmission(p2, 42, "2026-06-23T00:00:00.000Z");
  const c = p2.calls[0];
  ok("confirmSubmission updates the right id", c.m === "updateApplication" && c.serverId === 42);
  ok("confirmSubmission sets APPLIED + confirmed + appliedAt", c.changes.status === "APPLIED" && c.changes.submissionConfirmed === true && c.changes.appliedAt === "2026-06-23T00:00:00.000Z");

  console.log(`\n[app_tracking] ${pass} passed, ${fail} failed`);
  if (fails.length) { fails.forEach((f) => console.log("  x " + f)); process.exit(1); }
  console.log("[app_tracking] All green.");
})();
