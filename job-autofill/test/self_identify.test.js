// Tests for the Self-Identification of Disability (CC-305) page: Name, Date,
// Language=English, and checking the correct disability checkbox.
// Captured live from Waystar: formField-name, formField-dateSignedOn,
// formField-disabilityForm (Language combo), and a 3-checkbox disability group.
const { makeWindow, loadCore } = require("./harness");
let pass = 0, fail = 0;
const fails = [];
function ok(n, c, e) { if (c) pass++; else { fail++; fails.push(n + (e ? "  ->  " + e : "")); } }
const aidOf = (el) => el && el.closest && (el.closest('[data-automation-id^="formField"]') || {}).getAttribute &&
  (el.closest('[data-automation-id^="formField"]')).getAttribute('data-automation-id');

function buildPage(w) {
  const combo = (aid, label) => `<div data-automation-id="${aid}"><label>${label}</label><button aria-haspopup="listbox">Select One</button></div>`;
  const text = (aid, label) => `<div data-automation-id="${aid}"><label>${label}</label><input type="text"/></div>`;
  const check = (label) => `<label class="cb">${label}<input type="checkbox"/></label>`;
  w.document.body.innerHTML = `<div data-automation-id="disabilityForm">
    ${combo('formField-disabilityForm', 'Language')}
    ${text('formField-name', 'Name')}
    ${text('formField-employeeId', 'Employee ID (if applicable)')}
    ${text('formField-dateSignedOn', 'Date')}
    <div data-automation-id="formField-disabilityStatus"><legend>Please check one of the boxes below:</legend>
      ${check('Yes, I have a disability, or have had one in the past')}
      ${check('No, I do not have a disability and have not had one in the past')}
      ${check('I do not want to answer')}
    </div>
  </div>`;
}

(function selfId() {
  const w = makeWindow(); loadCore(w);
  buildPage(w);
  const wd = w.JAF.adapters.find((a) => a.id === 'workday');
  const values = { fullName: "Hasmika Reddy", disabilityStatus: "No, I do not have a disability",
    __experience: [], __education: [], __languages: [], __projects: [], __skillsArray: [], __webCount: 0 };
  const items = wd.plan(values);
  const byAid = {}; items.forEach((it) => { const a = aidOf(it.el); if (a && !byAid[a]) byAid[a] = it; });
  ok("Name field filled with full name", byAid['formField-name'] && byAid['formField-name'].value === "Hasmika Reddy", byAid['formField-name'] && byAid['formField-name'].value);
  const dt = byAid['formField-dateSignedOn'];
  const today = (() => { const d = new Date(), p = (n) => String(n).padStart(2, "0"); return `${p(d.getMonth() + 1)}/${p(d.getDate())}/${d.getFullYear()}`; })();
  ok("Date filled with today MM/DD/YYYY", dt && dt.value === today, dt && dt.value);
  const lang = byAid['formField-disabilityForm'];
  ok("Language combo set to English", lang && lang.value === "English" && lang.kind === "combo", lang && JSON.stringify([lang.value, lang.kind]));
  const disItem = items.find((it) => it.kind === "boolean" && /no, i do not have a disability/i.test((it.el.closest('label') || {}).textContent || ""));
  ok("Checks the 'No, I do not have a disability' box", !!disItem, "no boolean item matched the No checkbox");
  ok("Does not check Yes / decline boxes", items.filter((it) => it.kind === "boolean").length === 1, items.filter((it) => it.kind === "boolean").length + " boolean items");
  ok("Employee ID not filled", !byAid['formField-employeeId']);
})();

console.log(`\n[self_identify] ${pass} passed, ${fail} failed`);
if (fails.length) { fails.forEach((f) => console.log("  x " + f)); process.exit(1); }
console.log("[self_identify] All green.");
