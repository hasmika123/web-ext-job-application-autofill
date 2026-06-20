// Regression tests for the second bug batch: EEO ethnicity/race/hispanic mapping,
// veteran-status value mapping, degree alts + field-of-study split, and the
// Websites "URL" field receiving LinkedIn instead of the address.
//
// Captured live from Waystar's Workday tenant:
//   - formField-ethnicity        => the RACE / heritage dropdown ("...ethnicity
//                                    which most accurately describes how you identify")
//   - formField-hispanicOrLatino => the Hispanic/Latino Yes/No question
//   - formField-veteranStatus    => "I AM NOT A VETERAN" vs "...JUST NOT A PROTECTED VETERAN"
const { makeWindow, load } = require("./harness");
let pass = 0, fail = 0;
const fails = [];
function ok(n, c, e) { if (c) pass++; else { fail++; fails.push(n + (e ? "  ->  " + e : "")); } }

function core(w) {
  ["src/config/rules.js", "src/lib/rules-store.js", "src/lib/schema.js",
   "src/content/adapters/base.js", "src/content/adapters/workday.js"].forEach((p) => load(w, p));
}
const aidOf = (el) => el && el.closest && (el.closest('[data-automation-id^="formField"]') || {}).getAttribute &&
  (el.closest('[data-automation-id^="formField"]')).getAttribute('data-automation-id');

/* ---------- Voluntary Disclosures: ethnicity/race/hispanic/veteran ---------- */
(function eeo() {
  const w = makeWindow(); core(w);
  const wd = w.JAF.adapters.find((a) => a.id === 'workday');
  const combo = (aid, label) => `<div data-automation-id="${aid}"><label>${label}</label><button aria-haspopup="listbox">Select One</button></div>`;
  w.document.body.innerHTML = `<div data-automation-id="applyFlowVoluntaryDisclosuresPage">
    ${combo('formField-ethnicity', 'Please select the ethnicity which most accurately describes how you identify yourself.')}
    ${combo('formField-gender', 'Please select your gender.')}
    ${combo('formField-hispanicOrLatino', 'Please indicate if you are Hispanic or Latino?')}
    ${combo('formField-veteranStatus', 'Please select the veteran status which most accurately describes your status.')}
  </div>`;
  const values = { gender: "Male", ethnicity: "Not Hispanic or Latino", race: "White",
    veteranStatus: "I am not a protected veteran",
    __experience: [], __education: [], __languages: [], __projects: [], __skillsArray: [], __webCount: 0 };
  const items = wd.plan(values);
  const byAid = {}; items.forEach((it) => { const a = aidOf(it.el); if (a) byAid[a] = it; });
  ok("race -> formField-ethnicity dropdown", byAid['formField-ethnicity'] && byAid['formField-ethnicity'].field === w.JAF.schema.FIELDS.race,
     byAid['formField-ethnicity'] && byAid['formField-ethnicity'].field);
  ok("race value is 'White'", byAid['formField-ethnicity'] && byAid['formField-ethnicity'].value === 'White');
  const his = byAid['formField-hispanicOrLatino'];
  ok("hispanic answer -> formField-hispanicOrLatino", his && his.field === w.JAF.schema.FIELDS.ethnicity, his && his.field);
  ok("'Not Hispanic or Latino' maps to No (negative-first)", his && his.alts && his.alts[0] === 'No', his && JSON.stringify(his.alts));
  const vet = byAid['formField-veteranStatus'];
  ok("veteran 'not a protected veteran' -> 'I am not a veteran' first", vet && vet.alts && vet.alts[0] === 'I am not a veteran', vet && JSON.stringify(vet.alts));
  ok("hispanic value not wrongly mapped onto the race dropdown",
     !(byAid['formField-ethnicity'] && byAid['formField-ethnicity'].field === w.JAF.schema.FIELDS.ethnicity));
})();

/* ---------- Education degree alts + field split; Websites URL ---------- */
(function eduWeb() {
  const w = makeWindow(); core(w);
  const wd = w.JAF.adapters.find((a) => a.id === 'workday');
  w.document.body.innerHTML = `<div data-automation-id="applyFlowMyExpPage">
    <div data-automation-id="education-1">
      <div data-automation-id="formField-schoolName"><label>School or University</label><input/></div>
      <div data-automation-id="formField-degree"><label>Degree</label><button aria-haspopup="listbox">Select One</button></div>
      <div data-automation-id="formField-fieldOfStudy"><label>Field of Study</label><input/></div>
    </div>
    <div data-automation-id="formField-url"><label>URL</label><input/></div>
  </div>`;
  const values = { linkedin: "https://linkedin.com/in/x", github: "https://github.com/x",
    __experience: [], __languages: [], __projects: [], __skillsArray: [], __webCount: 2,
    __education: [{ school: "Georgia State University", degree: "Bachelor of Science in Computer Science" }] };
  const items = wd.plan(values);
  const byAid = {}; items.forEach((it) => { const a = aidOf(it.el); if (a) byAid[a] = it; });
  const deg = byAid['formField-degree'];
  ok("degree value split to credential only", deg && deg.value === 'Bachelor of Science', deg && deg.value);
  ok("degree alts include 'Bachelor of Science (BS)'", deg && deg.alts && deg.alts.includes('Bachelor of Science (BS)'), deg && JSON.stringify(deg.alts));
  const fld = byAid['formField-fieldOfStudy'];
  ok("field-of-study derived from degree", fld && fld.value === 'Computer Science', fld && fld.value);
  const url = byAid['formField-url'];
  ok("URL field gets LinkedIn (not address)", url && url.value === 'https://linkedin.com/in/x', url && url.value);
})();

console.log(`\n[eeo_edu_web] ${pass} passed, ${fail} failed`);
if (fails.length) { fails.forEach((f) => console.log("  x " + f)); process.exit(1); }
console.log("[eeo_edu_web] All green.");
