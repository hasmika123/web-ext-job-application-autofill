/* run.js — minimal test runner for the Workday adapter + shared helpers.
 * No deps beyond jsdom. Run:  node test/run.js   (from job-autofill/)
 */
const { makeWindow, loadCore } = require("./harness");

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) pass++;
  else { fail++; fails.push(name + (extra ? "  ->  " + extra : "")); }
}
function eq(name, got, want) {
  ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
}

/* ---------------------------------------------------------------- smoke */
(function smoke() {
  const w = makeWindow();
  let loaded = true, err = "";
  try { loadCore(w); } catch (e) { loaded = false; err = e.message; }
  ok("smoke: core files load", loaded, err);
  ok("smoke: JAF.schema present", !!(w.JAF && w.JAF.schema));
  ok("smoke: ruleset version is 5", w.JAF && w.JAF.defaultRules && w.JAF.defaultRules.version === 5);
  ok("smoke: workday adapter registered", !!(w.JAF.adapters || []).find((a) => a.id === "workday"));
})();

/* ----------------------------------------------- pure helper regression */
(function helpers() {
  const w = makeWindow();
  loadCore(w);
  const S = w.JAF.schema;

  eq("country: 'United States' candidates",
     S.countryCandidates("United States"),
     ["United States", "United States of America", "USA", "US"]);
  eq("country: 'us' normalizes to United States first", S.countryCandidates("us")[0], "United States");
  eq("country: 'Canada' stays as-is, no US alts", S.countryCandidates("Canada"), ["Canada"]);

  eq("state: 'GA' -> [Georgia, GA]", S.stateCandidates("GA"), ["Georgia", "GA"]);
  eq("state: 'Georgia' -> [Georgia, GA]", S.stateCandidates("Georgia"), ["Georgia", "GA"]);
  eq("state: unknown passthrough", S.stateCandidates("Ontario"), ["Ontario"]);

  const bio = S.emptyBio();
  Object.assign(bio, { firstName: "Ada", lastName: "Lovelace", country: "United States", gender: "Female" });
  const resume = S.emptyResume();
  resume.experience = [{ company: "X", title: "Eng" }];
  resume.education = [{ school: "Cambridge" }];
  const vals = S.buildFillValues(bio, resume, {});
  ok("buildFillValues: fullName composed", vals.fullName === "Ada Lovelace");
  // EEO is always included now (user decision — no opt-in gate); it still only FILLS
  // where a page asks + the user reviews it. See qa_fixes.test.js / AUTOFILL-QA.md BUG-1.
  ok("buildFillValues: EEO included whenever the user has it", vals.gender === "Female");
  ok("buildFillValues: __experience passthrough", Array.isArray(vals.__experience) && vals.__experience.length === 1);
  ok("buildFillValues: EEO absent when the bio has none",
    S.buildFillValues(Object.assign(S.emptyBio(), { firstName: "Ada" }), resume, {}).gender === undefined);
})();

/* ------------------------------------------------ rule match predicate */
(function rules() {
  const w = makeWindow();
  loadCore(w);
  const m = w.JAF.rules.match;
  const r = w.JAF.rules.site("workday");
  ok("rule: country matches 'country' chain", m("country", r.fields.country));
  ok("rule: country REJECTS 'countryregion'", !m("countryregion subdivision", r.fields.country));
  ok("rule: country REJECTS 'countrydialcode'", !m("countrydialcode phone", r.fields.country));
  ok("rule: state matches 'countryregion'", m("countryregion subdivision", r.fields.state));
  ok("rule: firstName rejects preferred", !m("firstname preferred", r.fields.firstName));
})();

/* ----------------------- native <select> exact-match guard (bug #5 proxy) */
(function selectExact() {
  const w = makeWindow();
  loadCore(w);
  const B = w.JAF.adapterBase;
  const mk = (texts) => {
    const s = w.document.createElement("select");
    texts.forEach((t) => { const o = w.document.createElement("option"); o.textContent = t; o.value = t; s.appendChild(o); });
    return s;
  };
  const s1 = mk(["Gabon", "Gambia", "United States", "United States of America"]);
  ok("select: 'United States' picks exact, not Gabon", B.selectOption(s1, "United States") && s1.value === "United States");
  const s2 = mk(["Gabon", "United States"]);
  B.selectOption(s2, "United States");
  ok("select: full country name resolves correctly", s2.value === "United States");
})();

/* --------------------------------------------------------------- report */
console.log(`\n${pass} passed, ${fail} failed`);
if (fails.length) { console.log("\nFailures:"); fails.forEach((f) => console.log("  x " + f)); process.exit(1); }
console.log("All green.");
