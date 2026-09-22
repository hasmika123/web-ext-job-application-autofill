/* fill_telemetry.test.js — Phase 10.1: count-only fill telemetry.
 *
 * What must hold: an event carries an ATS FAMILY and small integers and nothing else — never
 * a hostname, a label or a value; the required-field audit counts what a fill left undone; and
 * the first change a user makes to a field we filled is reported once, against that fill.
 * Run:  node test/fill_telemetry.test.js   (from job-autofill/)
 */
const { makeWindow, load, loadCore } = require("./harness");

let pass = 0, fail = 0;
const fails = [];
const tag = "[fill_telemetry]";
function ok(name, cond, extra) {
  if (cond) pass++;
  else { fail++; fails.push(name + (extra ? "  ->  " + extra : "")); }
}
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/* --------------------------------------------------- ATS family, never the host */
(function families() {
  const w = makeWindow();
  load(w, "src/lib/fill-telemetry.js");
  const T = w.JAF.fillTelemetry;
  const cases = {
    "acme.wd5.myworkdayjobs.com": "workday",
    "job-boards.greenhouse.io": "greenhouse",
    "jobs.lever.co": "lever",
    "jobs.ashbyhq.com": "ashby",
    "apply.workable.com": "workable",
    "careers-acme.icims.com": "icims",
    "acme.taleo.net": "taleo",
    "jobs.smartrecruiters.com": "smartrecruiters",
    "acme.bamboohr.com": "bamboohr",
    "jobs.jobvite.com": "jobvite",
    "smartapply.indeed.com": "indeed",
    "career5.successfactors.eu": "successfactors",
  };
  for (const [host, fam] of Object.entries(cases)) ok("family: " + host, T.atsFamily(host) === fam, T.atsFamily(host));
  // A company's own careers domain would reveal where the user applied.
  ok("family: a company careers domain is `other`", T.atsFamily("careers.acme-corp.com") === "other");
  ok("family: a lookalike suffix is not matched", T.atsFamily("notgreenhouse.io") === "other" && T.atsFamily("evilicims.com") === "other");
  ok("family: the real domain as a prefix is not matched", T.atsFamily("icims.com.attacker.net") === "other");
  ok("family: empty / junk is `other`", T.atsFamily("") === "other" && T.atsFamily(null) === "other");

  const id = T.newFillId();
  ok("id: a random v4 UUID", UUID_V4.test(id), id);
  ok("id: two fills never share one", T.newFillId() !== id);

  const e = T.buildEvent({ id, hostname: "careers.acme-corp.com", adapter: "generic", found: 12, filled: 99, failed: -4, requiredLeftEmpty: "3" });
  ok("event: only the agreed keys", JSON.stringify(Object.keys(e).sort()) === JSON.stringify(["adapter", "ats", "fieldsFailed", "fieldsFilled", "fieldsFound", "id", "requiredLeftEmpty"]), Object.keys(e).join(","));
  ok("event: the hostname never appears anywhere in it", JSON.stringify(e).indexOf("acme") === -1, JSON.stringify(e));
  ok("event: filled can't exceed found", e.fieldsFilled === 12);
  ok("event: negative counts become 0", e.fieldsFailed === 0);
  ok("event: numeric strings are counted", e.requiredLeftEmpty === 3);
  ok("event: an unknown adapter is `other`", T.buildEvent({ adapter: "evil" }).adapter === "other");
})();

/* ----------------------------------------------- required fields left empty */
(function audit() {
  const w = makeWindow(`<body><form>
      <input id="t1" required />
      <input id="t2" required value="Ada" />
      <select id="s1" required><option value="">Select one</option><option>Yes</option></select>
      <input id="c1" type="checkbox" required />
      <input type="radio" name="auth" value="y" required /><input type="radio" name="auth" value="n" />
      <input type="radio" name="relocate" value="y" required checked /><input type="radio" name="relocate" value="n" />
      <textarea id="a1" aria-required="true"></textarea>
      <input id="off" required disabled />
      <input type="hidden" required />
      <input id="optional" />
    </form></body>`);
  loadCore(w);
  load(w, "src/content/required-audit.js");
  const found = w.JAF.requiredAudit.findRequiredEmpty(w.document);
  const ids = found.map((el) => el.id || el.name);
  ok("audit: empty required text", ids.includes("t1"));
  ok("audit: filled required text is fine", !ids.includes("t2"));
  ok("audit: select on its placeholder counts", ids.includes("s1"));
  ok("audit: unchecked required checkbox", ids.includes("c1"));
  ok("audit: a radio group with nothing picked counts once", ids.filter((x) => x === "auth").length === 1);
  ok("audit: a radio group with a pick is fine", !ids.includes("relocate"));
  ok("audit: aria-required counts", ids.includes("a1"));
  ok("audit: a disabled field is not the user's to fill", !ids.includes("off"));
  ok("audit: an optional field never counts", !ids.includes("optional"));
  ok("audit: total", found.length === 5, ids.join(","));
})();

/* ---------------------------- a correction is reported once, against its fill */
(function corrections() {
  const w = makeWindow(`<body><input id="n" value="Ada" /></body>`);
  loadCore(w);
  load(w, "src/lib/field-cache.js");
  const el = w.document.getElementById("n");
  let calls = 0;
  const FC = w.JAF.fieldCache;
  FC.watch({ el, field: "firstName", label: "First name" }, { baseline: FC.committedValueOf(el), onCorrected: () => calls++ });
  el.dispatchEvent(new w.Event("change", { bubbles: true }));
  el.dispatchEvent(new w.Event("blur"));
  ok("correction: tabbing through without changing is not a correction", calls === 0, "got " + calls);
  el.value = "Adaline";
  el.dispatchEvent(new w.Event("change", { bubbles: true }));
  ok("correction: changing the value is", calls === 1, "got " + calls);
  el.value = "Ada L.";
  el.dispatchEvent(new w.Event("change", { bubbles: true }));
  ok("correction: counted once per field per fill", calls === 1, "got " + calls);
  // A re-fill of the same field reports against the newest fill.
  let second = 0;
  FC.watch({ el, field: "firstName", label: "First name" }, { baseline: FC.committedValueOf(el), onCorrected: () => second++ });
  el.value = "A.";
  el.dispatchEvent(new w.Event("change", { bubbles: true }));
  ok("correction: a re-fill gets its own report", second === 1 && calls === 1, `first=${calls} second=${second}`);
})();

/* ---------------------------------------- end to end, through the real overlay */
(async function endToEnd() {
  const w = makeWindow(`<body><form>
      <label for="em">Email</label><input id="em" required />
      <label for="ph">Phone</label><input id="ph" required />
    </form></body>`, { url: "https://job-boards.greenhouse.io/acme/jobs/123" });
  loadCore(w);
  ["src/content/adapters/generic.js", "src/lib/field-cache.js", "src/lib/fill-telemetry.js",
   "src/content/required-audit.js", "src/content/filler.js"].forEach((p) => load(w, p));
  const msgs = [];
  w.chrome.runtime.sendMessage = (m) => { msgs.push(m); };

  await w.JAF.filler.start({ email: "ada@example.com" }, null, { assist: false, mapFields: false });
  const host = w.document.getElementById("__jaf_host");
  host.shadowRoot.querySelector("#fill").click();
  await new Promise((r) => setTimeout(r, 700));

  const stats = (msgs.find((m) => m.type === "JAF_FILL_STATS") || {}).stats;
  ok("e2e: one stats event per fill", msgs.filter((m) => m.type === "JAF_FILL_STATS").length === 1, JSON.stringify(msgs));
  ok("e2e: ats is the family, from the page host", stats && stats.ats === "greenhouse", JSON.stringify(stats));
  ok("e2e: adapter is reported", stats && stats.adapter === "generic");
  ok("e2e: the email field was filled", stats && stats.fieldsFilled === 1, JSON.stringify(stats));
  ok("e2e: the required phone we had no value for is counted", stats && stats.requiredLeftEmpty === 1, JSON.stringify(stats));
  ok("e2e: the event never carries the value", JSON.stringify(msgs).indexOf("ada@example.com") === -1);
  ok("e2e: the event never carries the page host", JSON.stringify(msgs).indexOf("job-boards") === -1);

  const em = w.document.getElementById("em");
  em.value = "ada.l@example.com";
  em.dispatchEvent(new w.Event("change", { bubbles: true }));
  const corr = msgs.filter((m) => m.type === "JAF_FILL_CORRECTED");
  ok("e2e: correcting a filled field reports it", corr.length === 1, JSON.stringify(msgs));
  ok("e2e: ...against the same fill", corr.length === 1 && stats && corr[0].id === stats.id);
})().then(report, (e) => { fail++; fails.push("e2e threw -> " + (e && e.stack || e)); report(); });

function report() {
  console.log(`${tag} ${pass} passed, ${fail} failed`);
  if (fails.length) { console.log(`${tag} Failures:`); fails.forEach((f) => console.log("  x " + f)); process.exit(1); }
  console.log(`${tag} All green.`);
}
