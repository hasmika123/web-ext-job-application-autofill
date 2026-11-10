// Job capture on ATS pages that publish NO JSON-LD: the new Greenhouse job-boards page,
// Lever posting + /apply pages, and SmartRecruiters (capture-only reader). Without these
// readers the description fell back to the <meta> description (sources "generic"), so the
// drawer's Pro features (best-resume match, Check fit) never appeared there.
// Fixtures are trimmed copies of the REAL pages (captured 2026-10-19), not guessed markup.
// Run:  node test/job_capture_ats.test.js   (from job-autofill/)
const fs = require("fs");
const path = require("path");
const { makeWindow, load } = require("./harness");
let pass = 0, fail = 0;
const fails = [];
function ok(n, c, e) { if (c) pass++; else { fail++; fails.push(n + (e ? "  ->  " + e : "")); } }
function eq(n, g, w) { ok(n, JSON.stringify(g) === JSON.stringify(w), `got ${JSON.stringify(g)} want ${JSON.stringify(w)}`); }

// Same load order as entrypoints/content.ts.
const SRC = [
  "src/config/rules.js", "src/lib/rules-store.js", "src/lib/schema.js",
  "src/content/adapters/base.js", "src/content/adapters/generic.js",
  "src/content/adapters/greenhouse.js", "src/content/adapters/lever.js",
  "src/content/adapters/ashby.js", "src/content/adapters/workable.js",
  "src/content/adapters/workday.js", "src/content/adapters/indeed.js",
  "src/content/adapters/smartrecruiters.js", "src/lib/job-capture.js",
];
const fixture = (name) => fs.readFileSync(path.join(__dirname, "fixtures", "job-capture", name), "utf8");
function win(html, url) {
  const w = makeWindow(html, { url });
  SRC.forEach((p) => load(w, p));
  return w;
}
// Exactly what the content script runs on JAF_CAPTURE_JOB: no injected doc/loc/adapter.
const capture = (w) => w.JAF.jobCapture.captureJob();

const GH_URL = "https://job-boards.greenhouse.io/figma/jobs/6201407004";
const LEVER_ID = "861c2f1c-6586-40b6-87b8-4140c9379780";
const LEVER_URL = "https://jobs.lever.co/rover/" + LEVER_ID;
const SR_URL = "https://jobs.smartrecruiters.com/ServiceNow/744000156132859";

(function run() {
  /* ---- Greenhouse job-boards (no JSON-LD; meta description is just the location) ---- */
  const gh = capture(win(fixture("greenhouse-figma.html"), GH_URL));
  eq("gh: description comes from the adapter", gh.sources.jobDescription, "adapter");
  ok("gh: description is the full posting (200+ chars)", (gh.jobDescription || "").length >= 200, (gh.jobDescription || "").length);
  ok("gh: description starts with the posting body", /^Figma is growing our team/.test(gh.jobDescription || ""), gh.jobDescription);
  ok("gh: paragraphs don't run together", /iterating with… We are looking/.test(gh.jobDescription || ""));
  ok("gh: pay-range block is part of the description", /Pay Transparency Disclosure/.test(gh.jobDescription || ""));
  ok("gh: header/Apply button text is not in the description", !/Back to jobs|^Data Platform Engineer/.test(gh.jobDescription || ""));
  eq("gh: role from .job__title h1", [gh.role, gh.sources.role], ["Data Platform Engineer", "adapter"]);
  eq("gh: company from the page title", [gh.company, gh.sources.company], ["Figma", "adapter"]);
  eq("gh: location from .job__location", gh.location, "San Francisco, CA • New York, NY • United States");
  eq("gh: identity unchanged", [gh.atsPlatform, gh.externalJobId], ["greenhouse", "6201407004"]);

  // Company falls back to the logo alt when the title has no "… at <company>".
  const ghNoTitle = win(fixture("greenhouse-figma.html").replace(/<title>[^<]*<\/title>/, "<title>Careers</title>"), GH_URL);
  eq("gh: company from logo alt when title doesn't name it", capture(ghNoTitle).company, "Figma");

  /* ---- Lever posting page ---- */
  const lv = capture(win(fixture("lever-rover.html"), LEVER_URL));
  eq("lever: description comes from the adapter (no JSON-LD)", lv.sources.jobDescription, "adapter");
  ok("lever: description is the full posting (200+ chars)", (lv.jobDescription || "").length >= 200, (lv.jobDescription || "").length);
  ok("lever: starts at the job-description section", /^Who we are Want to make an impact\?/.test(lv.jobDescription || ""), lv.jobDescription);
  ok("lever: includes the posting-requirements sections", /About the Commerce Platform/.test(lv.jobDescription || "") && /Qualifications/.test(lv.jobDescription || ""));
  ok("lever: apply button + header are not in the description", !/apply for this job/i.test(lv.jobDescription || "") && !/Staff Engineer, Commerce Platform Seattle/.test(lv.jobDescription || ""));
  eq("lever: role / company / location from the page", [lv.role, lv.company, lv.location], ["Staff Engineer, Commerce Platform", "Rover.com", "Seattle"]);
  eq("lever: identity unchanged", [lv.atsPlatform, lv.externalJobId], ["lever", LEVER_ID]);

  // Lever also publishes JSON-LD on the posting page — when it parses, it still wins (merge order unchanged).
  const ld = '<script type="application/ld+json">' + JSON.stringify({
    "@context": "http://schema.org", "@type": "JobPosting", title: "Staff Engineer, Commerce Platform",
    hiringOrganization: { "@type": "Organization", name: "Rover.com" },
    description: "<p>" + "JSON-LD description text. ".repeat(12) + "</p>",
  }) + "</script>";
  const lvLd = capture(win(fixture("lever-rover.html").replace("</head>", ld + "</head>"), LEVER_URL));
  eq("lever: JSON-LD description still wins when present", lvLd.sources.jobDescription, "jsonld");

  // Company falls back to "<Company> - <role>" in the title when there is no logo.
  const lvNoLogo = win(fixture("lever-rover.html").replace(/<img alt="Rover\.com logo"[^>]*>/, ""), LEVER_URL);
  eq("lever: company from the title when there's no logo", capture(lvNoLogo).company, "Rover.com");

  /* ---- Lever /apply: the description is NOT on the page (only a truncated <meta>) ---- */
  const lva = capture(win(fixture("lever-rover-apply.html"), LEVER_URL + "/apply"));
  eq("lever apply: role / company / location still from the page",
     [lva.role, lva.company, lva.location, lva.sources.role], ["Staff Engineer, Commerce Platform", "Rover.com", "Seattle", "adapter"]);
  eq("lever apply: form sections are never read as a description", lva.sources.jobDescription, "generic");
  eq("lever apply: identity unchanged", [lva.atsPlatform, lva.externalJobId], ["lever", LEVER_ID]);

  /* ---- SmartRecruiters (capture-only reader over schema.org microdata) ---- */
  const srw = win(fixture("smartrecruiters-servicenow.html"), SR_URL);
  const sr = capture(srw);
  eq("sr: description comes from the reader", sr.sources.jobDescription, "adapter");
  ok("sr: description is the full posting (200+ chars)", (sr.jobDescription || "").length >= 200, (sr.jobDescription || "").length);
  ok("sr: description starts with the company section", /^Company Description It all started/.test(sr.jobDescription || ""), sr.jobDescription);
  ok("sr: description includes the job + qualifications sections", /Job Description/.test(sr.jobDescription || "") && /Qualifications/.test(sr.jobDescription || ""));
  ok("sr: &nbsp; is plain whitespace", !/&#xa0;|&nbsp;| /.test(sr.jobDescription || ""));
  eq("sr: role / company from microdata", [sr.role, sr.company], ["Senior Staff Platform Engineer - Kubernetes - Federal", "ServiceNow"]);
  eq("sr: location from microdata address", sr.location, "San Diego, CALIFORNIA, United States");
  eq("sr: platform + numeric posting id", [sr.atsPlatform, sr.externalJobId], ["smartrecruiters", "744000156132859"]);
  ok("sr: counts as a job page", srw.JAF.jobCapture.hasJobSignal() === true);
  // Capture-only: the fill path (JAF.adapters → pickAdapter / JAF_PING) is untouched.
  ok("sr: reader is NOT a fill adapter", !srw.JAF.adapters.some((a) => a.id === "smartrecruiters"));
  ok("sr: no fill adapter detected on the page", srw.JAF.jobCapture.detectAdapter() === null);
  // Host-gated: the same microdata on another site doesn't claim to be SmartRecruiters.
  const other = capture(win(fixture("smartrecruiters-servicenow.html"), "https://careers.example.com/jobs/1"));
  ok("sr: reader only matches smartrecruiters.com", other.atsPlatform === null && other.sources.jobDescription !== "adapter", other.atsPlatform);

  /* ---- adapterBase.blockText ---- */
  const bw = win('<div id="a"><p>One.</p><p>Two</p><ul><li>x</li><li>y</li></ul><script>var z=1</script><style>.q{}</style></div><p id="b">Three&nbsp;four</p>', "https://example.com/");
  const B = bw.JAF.adapterBase;
  eq("blockText: blocks separated, scripts/styles skipped", B.blockText(bw.document.getElementById("a")), "One. Two x y");
  eq("blockText: list of elements joined", B.blockText([bw.document.getElementById("a"), bw.document.getElementById("b")]), "One. Two x y Three four");
  ok("blockText: empty / missing → undefined", B.blockText(null) === undefined && B.blockText([]) === undefined);
  const long = win("<div id='l'>" + "word ".repeat(6000) + "</div>", "https://example.com/");
  eq("blockText: capped at 20000 chars", long.JAF.adapterBase.blockText(long.document.getElementById("l")).length, 20000);

  /* ---- adapters still return the bare identity when the page has no posting markup ---- */
  const empty = win("<body></body>", "https://example.com/");
  const ad = (id) => empty.JAF.adapters.find((a) => a.id === id);
  eq("greenhouse captureJob on an empty page", ad("greenhouse").captureJob({ loc: { pathname: "/acme/jobs/1" } }), { atsPlatform: "greenhouse", externalJobId: "1" });
  eq("lever captureJob on an empty page", ad("lever").captureJob({ loc: { pathname: "/acme/" + LEVER_ID } }), { atsPlatform: "lever", externalJobId: LEVER_ID });

  console.log(`[job_capture_ats] ${pass} passed, ${fail} failed`);
  if (fail) { fails.forEach((f) => console.log("  FAIL " + f)); process.exit(1); }
})();
