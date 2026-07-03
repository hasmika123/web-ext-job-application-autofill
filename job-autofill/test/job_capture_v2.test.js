// Tests for the job-capture v2 upgrades (Phase 3.6): structured salary
// (salaryParsed {min,max,currency,period}), per-field provenance (capture.sources),
// and the conservative description-text jobType/jobMode heuristics.
// Run:  node test/job_capture_v2.test.js   (from job-autofill/)
const { makeWindow, load } = require("./harness");
let pass = 0, fail = 0;
const fails = [];
function ok(n, c, e) { if (c) pass++; else { fail++; fails.push(n + (e ? "  ->  " + e : "")); } }
function eq(n, g, w) { ok(n, JSON.stringify(g) === JSON.stringify(w), `got ${JSON.stringify(g)} want ${JSON.stringify(w)}`); }

const SRC = [
  "src/config/rules.js", "src/lib/rules-store.js", "src/lib/schema.js",
  "src/content/adapters/base.js", "src/content/adapters/generic.js",
  "src/content/adapters/greenhouse.js", "src/content/adapters/lever.js",
  "src/content/adapters/ashby.js", "src/content/adapters/workable.js",
  "src/content/adapters/workday.js", "src/lib/job-capture.js",
];
function win(html, url) {
  const w = makeWindow(html, url ? { url } : undefined);
  SRC.forEach((p) => load(w, p));
  return w;
}

(function run() {
  const plain = win("<body></body>");
  const C = plain.JAF.jobCapture;

  /* ---- parseSalaryText: display string → structured numbers ---- */
  eq("parse: annual range with /yr", C.parseSalaryText("$120,000 – $150,000/yr"),
     { min: 120000, max: 150000, currency: "USD", period: "YEAR" });
  eq("parse: hourly range 'per hour'", C.parseSalaryText("$25–$30 per hour"),
     { min: 25, max: 30, currency: "USD", period: "HOUR" });
  eq("parse: k-suffix single value", C.parseSalaryText("£45k"),
     { min: 45000, currency: "GBP" });
  eq("parse: ISO code currency", C.parseSalaryText("EUR 80,000 to 95,000 per annum"),
     { min: 80000, max: 95000, currency: "EUR", period: "YEAR" });
  eq("parse: swapped range is reordered", C.parseSalaryText("$150,000 - $120,000/yr"),
     { min: 120000, max: 150000, currency: "USD", period: "YEAR" });
  ok("parse: bare number (no currency, no period) → undefined", C.parseSalaryText("120,000") === undefined);
  ok("parse: empty → undefined", C.parseSalaryText("") === undefined);

  /* ---- moneyParsed: schema.org MonetaryAmount → structured numbers ---- */
  eq("moneyParsed: QuantitativeValue min/max + unit", C.moneyParsed({
    "@type": "MonetaryAmount", currency: "USD",
    value: { "@type": "QuantitativeValue", minValue: 110000, maxValue: 140000, unitText: "YEAR" },
  }), { min: 110000, max: 140000, currency: "USD", period: "YEAR" });
  eq("moneyParsed: single value, hourly", C.moneyParsed({ currency: "CAD", value: { value: 42.5, unitText: "HOUR" } }),
     { min: 42.5, currency: "CAD", period: "HOUR" });
  eq("moneyParsed: symbol currency mapped to ISO", C.moneyParsed({ currency: "£", minValue: 50000, maxValue: 60000 }),
     { min: 50000, max: 60000, currency: "GBP" });
  ok("moneyParsed: no numbers → undefined", C.moneyParsed({ currency: "USD" }) === undefined);
  eq("moneyParsed: pre-formatted string falls through to text parse",
     C.moneyParsed("$90,000 - $100,000 per year"),
     { min: 90000, max: 100000, currency: "USD", period: "YEAR" });

  /* ---- jobTypeFromText: one unambiguous keyword wins; two = no call ---- */
  eq("type: full-time", C.jobTypeFromText("This is a full-time position based in Austin."), "FULL_TIME");
  eq("type: part time (space)", C.jobTypeFromText("We offer part time schedules."), "PART_TIME");
  eq("type: internship", C.jobTypeFromText("Join our 12-week summer internship."), "INTERNSHIP");
  eq("type: contract role", C.jobTypeFromText("This is a 6-month contract position."), "CONTRACT");
  ok("type: ambiguous (full-time OR part-time) → undefined",
     C.jobTypeFromText("Available as full-time or part-time.") === undefined);
  ok("type: full-time JD mentioning the internship program → undefined (ambiguous)",
     C.jobTypeFromText("This full-time role mentors students in our internship program.") === undefined);
  ok("type: no keyword → undefined", C.jobTypeFromText("Great benefits and culture.") === undefined);

  /* ---- jobModeFromText: bound phrases only, never bare words ---- */
  eq("mode: fully remote", C.jobModeFromText("This position is fully remote within the US."), "REMOTE");
  eq("mode: remote-first", C.jobModeFromText("We are a remote-first company."), "REMOTE");
  eq("mode: work from home", C.jobModeFromText("You can work from home full time."), "REMOTE");
  eq("mode: hybrid schedule", C.jobModeFromText("We follow a hybrid schedule (3 days in office)."), "HYBRID");
  eq("mode: 'Location: Hybrid'", C.jobModeFromText("Location: Hybrid — Denver, CO"), "HYBRID");
  eq("mode: on-site only", C.jobModeFromText("This is an on-site only position in Tulsa."), "ON_SITE");
  ok("mode: 'hybrid cloud' does NOT match", C.jobModeFromText("Experience with hybrid cloud architectures.") === undefined);
  ok("mode: 'onsite interviews' does NOT match", C.jobModeFromText("Final round includes onsite interviews.") === undefined);
  ok("mode: bare 'remote teams' skill mention does NOT match",
     C.jobModeFromText("Experience collaborating with distributed remote teams preferred.") === undefined);

  /* ---- captureJob: provenance + structured salary + text fallbacks, end to end ---- */
  const ld = win(
    '<head><script type="application/ld+json">' +
    JSON.stringify({
      "@context": "https://schema.org", "@type": "JobPosting", title: "Staff Engineer",
      hiringOrganization: { "@type": "Organization", name: "Acme Corp" },
      jobLocation: { "@type": "Place", address: { addressLocality: "Austin", addressRegion: "TX" } },
      description: "<p>This is a full-time, fully remote role. Build great things.</p>",
      baseSalary: { "@type": "MonetaryAmount", currency: "USD", value: { minValue: 120000, maxValue: 150000, unitText: "YEAR" } },
      identifier: "JR-1",
    }) + "</script></head><body></body>"
  );
  const cap = ld.JAF.jobCapture.captureJob({ adapter: null, loc: { href: "https://example.com/jobs/1" } });
  eq("capture: display salary from JSON-LD", cap.salary, "$120,000 – $150,000/yr");
  eq("capture: salaryParsed from JSON-LD numbers", cap.salaryParsed,
     { min: 120000, max: 150000, currency: "USD", period: "YEAR" });
  eq("capture: jobType falls back to the description text", cap.jobType, "FULL_TIME");
  eq("capture: jobMode falls back to the description text", cap.jobMode, "REMOTE");
  eq("capture: sources tag structured fields as jsonld",
     [cap.sources.company, cap.sources.role, cap.sources.salary],
     ["jsonld", "jsonld", "jsonld"]);
  eq("capture: text-derived fields are tagged 'text'",
     [cap.sources.jobType, cap.sources.jobMode], ["text", "text"]);

  // employmentType present in JSON-LD → wins over the text scan, tagged jsonld.
  const ld2 = win(
    '<head><script type="application/ld+json">' +
    JSON.stringify({
      "@type": "JobPosting", title: "Temp", hiringOrganization: "Acme",
      employmentType: "TEMPORARY", description: "A full-time attitude required.",
    }) + "</script></head><body></body>"
  );
  const cap2 = ld2.JAF.jobCapture.captureJob({ adapter: null, loc: { href: "https://example.com/jobs/2" } });
  eq("capture: JSON-LD employmentType beats the text scan", cap2.jobType, "TEMPORARY");
  eq("capture: ...and is tagged jsonld", cap2.sources.jobType, "jsonld");

  // Body-text salary scan → tagged "text", and parsed into numbers.
  const body = win(
    "<head><title>Engineer — Initech</title></head>" +
    "<body><p>About the role.</p><p>Salary: $95,000 - $115,000 per year.</p></body>"
  );
  const cap3 = body.JAF.jobCapture.captureJob({ adapter: null, loc: { href: "https://example.com/jobs/3" } });
  eq("capture: body-scan salary display", cap3.salary, "$95,000–$115,000 per year");
  eq("capture: body-scan salary is tagged text", cap3.sources.salary, "text");
  eq("capture: body-scan salary parsed to numbers", cap3.salaryParsed,
     { min: 95000, max: 115000, currency: "USD", period: "YEAR" });

  // Nothing to find → fields and their source tags simply absent, no throw.
  const empty = win("<body><p>hello</p></body>");
  const cap4 = empty.JAF.jobCapture.captureJob({ adapter: null, loc: { href: "https://example.com/x" } });
  ok("capture: no salary → no salaryParsed", cap4.salary === undefined && cap4.salaryParsed === undefined);
  ok("capture: sources map present and sparse", cap4.sources && cap4.sources.salary === undefined);

  console.log(`[job_capture_v2] pass ${pass} fail ${fail}`);
  if (fail) { fails.forEach((f) => console.log("  FAIL: " + f)); process.exit(1); }
})();
