// A marketer-only org workspace gets ONLY "Save for consultant…": no resume picker, no fill, and —
// the hard rule (docs/enterprise-v2/60 §0, backlog X9.12) — NO read of any profile, bio, resume or
// learned answers. The drawer is built so that this holds by construction; this test pins it three
// ways: (1) the facade is the only handle and exposes two methods, (2) a full marketer session run
// against a provider that records every call touches nothing else, (3) the drawer sources keep the
// personal data path behind a "not marketer" guard.
const fs = require("fs");
const path = require("path");
const { makeWindow, load } = require("./harness");
let pass = 0, fail = 0;
const fails = [];
const tag = "[workspace_modes]";
function ok(n, c, e) { if (c) pass++; else { fail++; fails.push(n + (e ? "  ->  " + e : "")); } }
function eq(n, g, w) { ok(n, JSON.stringify(g) === JSON.stringify(w), `got ${JSON.stringify(g)} want ${JSON.stringify(w)}`); }
const read = (rel) => fs.readFileSync(path.join(__dirname, "..", rel), "utf8");
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

// A provider that records every method called on it. Anything outside the marketer's two calls
// is a violation; the profile/answer reads additionally THROW so a leak cannot go unnoticed.
function recordingProvider() {
  const calls = [];
  const PROFILE_READS = ["pullProfile", "listResumes", "profileVersion", "listWorkspaces", "recordLearnedAnswers", "syncFieldCache", "listApplications", "aiDraft", "aiParseResume", "resumeMatch", "jobFit", "pushApplication", "updateApplication", "assignedJobs", "linkOpportunity", "respondOpportunity"];
  const target = {
    async listMarketerConsultants(orgId) { calls.push(["listMarketerConsultants", orgId]); return [{ id: 4, name: "Ada" }, { id: 5, name: "Grace" }]; },
    async saveForConsultant(orgId, body, key) { calls.push(["saveForConsultant", orgId, body, key]); return { jobId: 1, existingJob: false, results: body.consultantIds.map((id) => ({ consultantId: id, opportunityId: id * 10, existing: false })) }; },
  };
  const p = new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      if (typeof k === "string") {
        return (...args) => {
          calls.push([k, ...args]);
          if (PROFILE_READS.indexOf(k) !== -1) throw new Error("marketer session must never call " + k);
          return Promise.resolve(null);
        };
      }
      return undefined;
    },
  });
  return { p, calls };
}

(async function run() {
  const w = makeWindow();
  load(w, "src/lib/workspace.js");
  const WS = w.JAF.workspace;

  /* ---- 1. the facade ---- */
  const { p, calls } = recordingProvider();
  const f = WS.marketerFacade(p, 7);
  eq("facade exposes exactly orgId, listConsultants and save", Object.keys(f).sort(), ["listConsultants", "orgId", "save"]);
  ok("facade is frozen (cannot be extended with a profile reader)", Object.isFrozen(f));
  ok("facade has no profile/bio/resume/answer reader", !["pullProfile", "listResumes", "getBio", "getResumes", "provider", "profile"].some((k) => k in f));

  /* ---- 2. a whole marketer session ---- */
  const trimmed = WS.trimCapture({ role: "Staff Engineer", company: "Acme", atsPlatform: "greenhouse", externalJobId: "4012345", jobUrl: "https://boards.greenhouse.io/acme/jobs/4012345", jobDescription: "LONG PRIVATE-ISH TEXT", sources: { company: "adapter" } });
  const list = await f.listConsultants();
  eq("marketer lists the consultants they may assign to", list.map((c) => c.id), [4, 5]);
  const KEY = "00000000-0000-4000-8000-000000000042";
  const res = await WS.marketerSave(f, trimmed, { keyInfo: "Great fit", consultantIds: [4, 5], priority: "MEDIUM", names: { 4: "Ada", 5: "Grace" } }, KEY);
  ok("marketer save succeeds", res.ok === true && res.summary.variant === "success", JSON.stringify(res));
  const called = calls.map((c) => c[0]);
  eq("the session called ONLY listMarketerConsultants and saveForConsultant", called, ["listMarketerConsultants", "saveForConsultant"]);
  ok("pullProfile was never called", called.indexOf("pullProfile") === -1);
  ok("no profile / resume / learned-answer / AI / application call of any kind", !called.some((n) => /profile|resume|answer|suggest|ai|application|fieldcache|assigned|link|respond/i.test(n)), called.join(","));
  const sent = calls[1];
  eq("the call carried the org id and the Idempotency-Key", [sent[1], sent[3]], [7, KEY]);
  ok("the body carries no job description", JSON.stringify(sent[2]).indexOf("PRIVATE-ISH") === -1 && !("jobDescription" in sent[2]));
  ok("the body carries no consultant profile data (ids only)", sent[2].consultantIds.every(Number.isInteger));
  // An invalid form never even reaches the provider.
  const before = calls.length;
  const bad = await WS.marketerSave(f, trimmed, { keyInfo: "", consultantIds: [] }, KEY);
  ok("an invalid form is rejected locally, nothing sent", bad.ok === false && bad.problems.length >= 2 && calls.length === before);

  /* ---- 3. what the drawer is built from ---- */
  eq("marketer surfaces: no fill / profile / resumes / Jobs tab; Save for consultant on", WS.surfacesOf("marketer"), { fill: false, profile: false, resumes: false, jobsTab: false, saveForConsultant: true });
  const mv = code(read("entrypoints/panel/MarketerView.tsx"));
  const imports = [...mv.matchAll(/import\s*\{([^}]*)\}\s*from\s*"\.\/home-actions"/g)].map((x) => x[1].replace(/\s+/g, ""));
  eq("MarketerView imports only capturePage from home-actions", imports, ["capturePage"]);
  for (const banned of ["fillPage", "refreshMirror", "loadData", "matchResumesForPage", "checkJobFit", "readAccount", "pullProfile", "listResumes", "getBio", "getResumes", "recordLearnedAnswers", "fieldCache", "providerFromSettings", "chromeTokenStore"]) {
    ok("MarketerView never touches " + banned, mv.indexOf(banned) === -1);
  }
  const wa = read("entrypoints/panel/workspace-actions.ts");
  const marketerGroup = code(wa.slice(wa.indexOf("// ---- marketer"), wa.indexOf("// ---- consultant")));
  ok("marketer group located", marketerGroup.length > 50);
  ok("the marketer group of workspace-actions is just the facade", /marketerFacade\(provider, orgId\)/.test(marketerGroup) && !/pullProfile|listResumes|getBio|getResumes|loadData|refreshMirror/.test(marketerGroup));

  const hv = code(read("entrypoints/panel/HomeView.tsx"));
  const loadHomeCalls = hv.split("\n").filter((l) => /\bloadHome\(\)/.test(l) && !/async function loadHome/.test(l));
  ok("HomeView calls loadHome() in 2 places, each behind a known + not-marketer check", loadHomeCalls.length === 2 && loadHomeCalls.every((l) => /\.known\s*&&/.test(l) && /!==\s*"marketer"/.test(l)), loadHomeCalls.join(" | "));
  ok("HomeView has no Personal/Org picker any more", !/onPickWorkspace|chooseWorkspace|aria-label="Workspace"/.test(hv));
  ok("the mirror-update repaint is skipped in marketer mode", /KIWIPLY_MIRROR_UPDATED"\s*&&\s*modeKind\.current\s*!==\s*"marketer"/.test(hv));
  const iMarketer = hv.indexOf('mode.kind === "marketer"');
  const iEarlyReturn = hv.indexOf("<MarketerView");
  const iResumePicker = hv.indexOf("Choose a resume");
  ok("the marketer branch returns before any resume picker / fill markup", iMarketer > -1 && iEarlyReturn > iMarketer && iEarlyReturn < iResumePicker);
  // loadHome is the only place that reads the personal mirror on mount.
  const mountEffect = hv.slice(hv.indexOf("useEffect(() => {\n    // Orphaned drawer"));
  ok("the mount effect itself never calls refreshMirror/loadData directly", !/refreshMirror\(\)|loadData\(\)\.then\(setData\)\s*;?\s*\}\)\(\)/.test(mountEffect.split("return () => {")[0].replace(/KIWIPLY_MIRROR_UPDATED[^\n]*/, "")));

  /* ---- the personal drawer is untouched for users without orgs ---- */
  eq("personal account -> personal mode", WS.modeOf({ kind: "PERSONAL" }).kind, "personal");
  eq("personal account -> full surfaces (unchanged drawer)", WS.surfacesOf(WS.modeOf({ kind: "PERSONAL" }).kind), { fill: true, profile: true, resumes: true, jobsTab: false, saveForConsultant: false });
  eq("an enterprise session whose role flags are not cached is NOT 'known' (HomeView reads nothing until the server answers)", WS.accountFromLocal({ kind: "ENTERPRISE", orgId: 7, orgName: "Acme" }, null).known, false);

  report();
})().catch((e) => { fail++; fails.push("async run threw -> " + (e && e.stack || e)); report(); });

function report() {
  console.log(`${tag} ${pass} passed, ${fail} failed`);
  if (fails.length) { console.log(`${tag} Failures:`); fails.forEach((f) => console.log("  x " + f)); process.exit(1); }
  console.log(`${tag} All green.`);
}
