// Tests for the AI job-detail enrichment PURE core (lib/job-enrich.js, Phase 3.6):
// gap detection, prompt build, tolerant response validation, gap-only merge with
// "ai" provenance, and the per-posting cache key. The model call + gating live in
// the service worker and are exercised only through this validated seam.
// Run:  node test/job_enrich.test.js   (from job-autofill/)
const { makeWindow, load } = require("./harness");
let pass = 0, fail = 0;
const fails = [];
function ok(n, c, e) { if (c) pass++; else { fail++; fails.push(n + (e ? "  ->  " + e : "")); } }
function eq(n, g, w) { ok(n, JSON.stringify(g) === JSON.stringify(w), `got ${JSON.stringify(g)} want ${JSON.stringify(w)}`); }

const w = makeWindow("<body></body>");
load(w, "src/lib/job-enrich.js");
const E = w.JAF.jobEnrich;

const LONG_DESC = "We are hiring a senior engineer to build our data platform. ".repeat(8); // > 200 chars

(function run() {
  /* ---- gap detection ---- */
  eq("missing: all three when empty", E.missingFields({}), ["jobType", "jobMode", "salary"]);
  eq("missing: salary counts as present via salaryParsed alone",
     E.missingFields({ jobType: "FULL_TIME", jobMode: "REMOTE", salaryParsed: { min: 1 } }), []);
  ok("needs: gaps + long description → true", E.needsEnrichment({ jobDescription: LONG_DESC }));
  ok("needs: no description → false", !E.needsEnrichment({}));
  ok("needs: short description → false", !E.needsEnrichment({ jobDescription: "Short blurb." }));
  ok("needs: nothing missing → false",
     !E.needsEnrichment({ jobDescription: LONG_DESC, jobType: "FULL_TIME", jobMode: "HYBRID", salary: "$1" }));

  /* ---- prompt ---- */
  const p = E.buildEnrichPrompt({ jobDescription: LONG_DESC });
  ok("prompt: demands JSON-only output", /ONLY a JSON object/.test(p));
  ok("prompt: forbids guessing", /never infer or guess/i.test(p));
  ok("prompt: carries the enums", p.includes("FULL_TIME") && p.includes("ON_SITE") && p.includes("HOUR"));
  ok("prompt: carries the description", p.includes("data platform"));

  /* ---- response validation ---- */
  eq("parse: clean JSON, all fields",
     E.parseEnrichResponse('{"jobType":"FULL_TIME","jobMode":"REMOTE","salaryMin":120000,"salaryMax":150000,"salaryCurrency":"USD","salaryPeriod":"YEAR"}'),
     { jobType: "FULL_TIME", jobMode: "REMOTE", salaryMin: 120000, salaryMax: 150000, salaryCurrency: "USD", salaryPeriod: "YEAR" });
  eq("parse: JSON wrapped in prose (server drafting path)",
     E.parseEnrichResponse('Sure! Here you go: {"jobType":"CONTRACT","jobMode":null,"salaryMin":null,"salaryMax":null,"salaryCurrency":null,"salaryPeriod":null} Hope that helps.'),
     { jobType: "CONTRACT" });
  eq("parse: invalid enum values dropped, valid kept",
     E.parseEnrichResponse('{"jobType":"FREELANCE","jobMode":"onsite","salaryMin":-5,"salaryCurrency":"dollars","salaryPeriod":"FORTNIGHT"}'),
     {});
  eq("parse: ON_SITE normalizes case/punctuation", E.parseEnrichResponse('{"jobMode":"on_site"}'), { jobMode: "ON_SITE" });
  eq("parse: swapped min/max reordered", E.parseEnrichResponse('{"salaryMin":150000,"salaryMax":120000}'),
     { salaryMin: 120000, salaryMax: 150000 });
  ok("parse: garbage → null", E.parseEnrichResponse("I could not determine anything.") === null);
  ok("parse: broken JSON → null", E.parseEnrichResponse('{"jobType": FULL_TIME}') === null);

  /* ---- gap-only merge + provenance ---- */
  const capture = {
    company: "Acme", jobType: "FULL_TIME", jobDescription: LONG_DESC,
    sources: { company: "jsonld", jobType: "jsonld" },
  };
  const merged = E.applyEnrichment(capture, {
    jobType: "PART_TIME", jobMode: "HYBRID", salaryMin: 90000, salaryMax: 110000, salaryCurrency: "USD", salaryPeriod: "YEAR",
  });
  eq("apply: NEVER overrides a deterministic field", merged.jobType, "FULL_TIME");
  eq("apply: fills the missing jobMode", merged.jobMode, "HYBRID");
  eq("apply: fills structured salary", merged.salaryParsed, { min: 90000, max: 110000, currency: "USD", period: "YEAR" });
  eq("apply: formats a display salary", merged.salary, "$90,000 – $110,000/yr");
  eq("apply: AI fields tagged 'ai', originals untouched",
     [merged.sources.jobType, merged.sources.jobMode, merged.sources.salary],
     ["jsonld", "ai", "ai"]);
  ok("apply: input capture not mutated", capture.jobMode === undefined && capture.sources.jobMode === undefined);
  eq("apply: null parsed → capture unchanged", E.applyEnrichment(capture, null), capture);
  const salaryKept = E.applyEnrichment({ salary: "$50/hr", jobDescription: LONG_DESC }, { salaryMin: 1, salaryMax: 2 });
  eq("apply: existing display salary blocks AI salary", salaryKept.salary, "$50/hr");
  ok("apply: ...and no salaryParsed is invented", salaryKept.salaryParsed === undefined);

  /* ---- cache key ---- */
  const a = { atsPlatform: "workday", externalJobId: "JR-1", jobDescription: LONG_DESC };
  ok("cacheKey: stable for the same posting", E.cacheKey(a) === E.cacheKey({ ...a }));
  ok("cacheKey: changes when the description changes",
     E.cacheKey(a) !== E.cacheKey({ ...a, jobDescription: LONG_DESC + " Updated pay info." }));
  ok("cacheKey: changes across postings", E.cacheKey(a) !== E.cacheKey({ ...a, externalJobId: "JR-2" }));
  ok("cacheKey: falls back to jobUrl without an id",
     E.cacheKey({ jobUrl: "https://x.co/1", jobDescription: LONG_DESC }) !== E.cacheKey({ jobUrl: "https://x.co/2", jobDescription: LONG_DESC }));

  console.log(`[job_enrich] pass ${pass} fail ${fail}`);
  if (fail) { fails.forEach((f) => console.log("  FAIL: " + f)); process.exit(1); }
})();
