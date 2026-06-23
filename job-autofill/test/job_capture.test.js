// Tests for the job-detail capture chain (Task 3.1): JAF.jobCapture.
// Verifies each strategy in isolation (schema.org/JobPosting JSON-LD, per-adapter
// captureJob() URL parsing, generic og:/meta) and the merged precedence. Pure DOM
// reads in jsdom — no network. ATS URL shapes are public/stable; tenant FORM DOM is
// never guessed here (that's the dossier rule), so adapters only derive id+platform.
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
function win(html) {
  const w = makeWindow(html);
  SRC.forEach((p) => load(w, p));
  return w;
}
const adapter = (w, id) => (w.JAF.adapters || []).find((a) => a.id === id);

const LEVER_ID = "2f3a9c10-1111-2222-3333-444455556666";
const ASHBY_ID = "0c1d2e3f-aaaa-bbbb-cccc-ddddeeeeffff";

(function run() {
  /* ---- 1. schema.org/JobPosting JSON-LD (single object) ---- */
  const ld = win(
    '<head><script type="application/ld+json">' +
    JSON.stringify({
      "@context": "https://schema.org", "@type": "JobPosting", title: "Staff Engineer",
      hiringOrganization: { "@type": "Organization", name: "Acme Corp" },
      jobLocation: { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: "San Francisco", addressRegion: "CA", addressCountry: "US" } },
      description: "<p>Build <b>great</b> things &amp; ship.</p>",
      identifier: { "@type": "PropertyValue", name: "req", value: "JR-100" },
    }) + "</script></head>"
  );
  const j = ld.JAF.jobCapture.fromJsonLd(ld.document);
  eq("jsonld role", j.role, "Staff Engineer");
  eq("jsonld company", j.company, "Acme Corp");
  eq("jsonld location joins address parts", j.location, "San Francisco, CA, US");
  eq("jsonld description stripped of HTML + entities", j.jobDescription, "Build great things & ship.");
  eq("jsonld externalJobId from PropertyValue.value", j.externalJobId, "JR-100");

  /* ---- 2. JSON-LD nested in @graph, @type as array, string org ---- */
  const graph = win(
    '<head><script type="application/ld+json">' +
    JSON.stringify({
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "WebPage", name: "Careers" },
        { "@type": ["JobPosting"], title: "Designer", hiringOrganization: "Globex", identifier: "GX-7" },
      ],
    }) + "</script></head>"
  );
  const g = graph.JAF.jobCapture.fromJsonLd(graph.document);
  ok("jsonld finds JobPosting inside @graph", g.role === "Designer" && g.externalJobId === "GX-7");
  eq("jsonld string hiringOrganization", g.company, "Globex");

  /* ---- bad JSON-LD never throws ---- */
  const bad = win('<head><script type="application/ld+json">{ not valid json </script></head>');
  eq("jsonld tolerates junk -> {}", bad.JAF.jobCapture.fromJsonLd(bad.document), {});

  /* ---- 3. generic og:/meta + canonical ---- */
  const gen = win(
    '<head>' +
    '<title>Fallback Title</title>' +
    '<meta property="og:title" content="Backend Engineer">' +
    '<meta property="og:site_name" content="Initech">' +
    '<meta name="description" content="Join our team.">' +
    '<link rel="canonical" href="https://example.com/jobs/9#section">' +
    '</head>'
  );
  const ge = gen.JAF.jobCapture.fromGeneric(gen.document, { href: "https://example.com/jobs/9?utm=x#section" });
  eq("generic role from og:title", ge.role, "Backend Engineer");
  eq("generic company from og:site_name", ge.company, "Initech");
  eq("generic description from meta", ge.jobDescription, "Join our team.");
  eq("generic jobUrl uses canonical, hash stripped", ge.jobUrl, "https://example.com/jobs/9");
  // no canonical -> loc.href, hash stripped
  const gen2 = win('<head><title>X</title></head>');
  eq("generic jobUrl falls back to loc.href", gen2.JAF.jobCapture.fromGeneric(gen2.document, { href: "https://x.co/a#b" }).jobUrl, "https://x.co/a");
  eq("generic role falls back to <title>", gen2.JAF.jobCapture.fromGeneric(gen2.document, {}).role, "X");

  /* ---- 4. per-adapter captureJob() URL parsing (id + platform) ---- */
  const w = win("<head></head>");
  eq("lever captureJob", adapter(w, "lever").captureJob({ loc: { pathname: "/acme/" + LEVER_ID + "/apply" } }), { atsPlatform: "lever", externalJobId: LEVER_ID });
  eq("greenhouse captureJob path /jobs/<id>", adapter(w, "greenhouse").captureJob({ loc: { pathname: "/acme/jobs/4012345" } }), { atsPlatform: "greenhouse", externalJobId: "4012345" });
  eq("greenhouse captureJob ?gh_jid", adapter(w, "greenhouse").captureJob({ loc: { pathname: "/embed/job_app", search: "?gh_jid=987654" } }), { atsPlatform: "greenhouse", externalJobId: "987654" });
  eq("ashby captureJob", adapter(w, "ashby").captureJob({ loc: { pathname: "/acme/" + ASHBY_ID + "/application" } }), { atsPlatform: "ashby", externalJobId: ASHBY_ID });
  eq("workable captureJob /j/<TOKEN>", adapter(w, "workable").captureJob({ loc: { pathname: "/acme-inc/j/ABCD1234EF/" } }), { atsPlatform: "workable", externalJobId: "ABCD1234EF" });
  eq("workable captureJob /jobs/<id>", adapter(w, "workable").captureJob({ loc: { pathname: "/jobs/556677" } }), { atsPlatform: "workable", externalJobId: "556677" });
  eq("workday captureJob _<JR-id>", adapter(w, "workday").captureJob({ loc: { pathname: "/en-US/External/job/San-Francisco/Software-Engineer_JR-0012345" } }), { atsPlatform: "workday", externalJobId: "JR-0012345" });
  eq("adapter captureJob null id when URL has none", adapter(w, "lever").captureJob({ loc: { pathname: "/" } }), { atsPlatform: "lever", externalJobId: null });

  /* ---- 5. merge: JSON-LD wins descriptive; adapter authoritative for id+platform ---- */
  const merged = win(
    '<head>' +
    '<meta property="og:title" content="WRONG title from og">' +
    '<link rel="canonical" href="https://boards.greenhouse.io/acme/jobs/4012345">' +
    '<script type="application/ld+json">' +
    JSON.stringify({ "@type": "JobPosting", title: "Senior SRE", hiringOrganization: { name: "Acme" }, description: "Run the cloud.", identifier: "LD-IGNORED" }) +
    '</script></head>'
  );
  const cap = merged.JAF.jobCapture.captureJob({
    doc: merged.document,
    loc: { pathname: "/acme/jobs/4012345", search: "", href: "https://boards.greenhouse.io/acme/jobs/4012345" },
    adapter: adapter(merged, "greenhouse"),
  });
  eq("merged role: JSON-LD beats og:title", cap.role, "Senior SRE");
  eq("merged company from JSON-LD", cap.company, "Acme");
  eq("merged jobDescription from JSON-LD", cap.jobDescription, "Run the cloud.");
  eq("merged externalJobId: adapter URL beats JSON-LD identifier", cap.externalJobId, "4012345");
  eq("merged atsPlatform from adapter", cap.atsPlatform, "greenhouse");
  eq("merged jobUrl from canonical", cap.jobUrl, "https://boards.greenhouse.io/acme/jobs/4012345");

  /* ---- 6. no JSON-LD: role from og:title, id from adapter ---- */
  const noLd = win('<head><meta property="og:title" content="Data Analyst"><meta property="og:site_name" content="Hooli"></head>');
  const cap2 = noLd.JAF.jobCapture.captureJob({
    doc: noLd.document,
    loc: { pathname: "/hooli/" + LEVER_ID, href: "https://jobs.lever.co/hooli/" + LEVER_ID },
    adapter: adapter(noLd, "lever"),
  });
  ok("no-JSON-LD merge: role+company from generic", cap2.role === "Data Analyst" && cap2.company === "Hooli");
  ok("no-JSON-LD merge: id+platform from adapter", cap2.externalJobId === LEVER_ID && cap2.atsPlatform === "lever");

  /* ---- 7. detectAdapter uses matches() against the page (harness url = workday) ---- */
  const wd = win("<head></head>");
  const det = wd.JAF.jobCapture.detectAdapter();
  ok("detectAdapter picks workday for *.myworkdayjobs.com", det && det.id === "workday");

  console.log(`\n[job_capture] ${pass} passed, ${fail} failed`);
  if (fails.length) { fails.forEach((f) => console.log("  x " + f)); process.exit(1); }
  console.log("[job_capture] All green.");
})();
