// Tests for the Self-Identification of Disability (CC-305) page: Name, Date
// (3-part spinbutton group), Language=English, and actually CHECKING the right
// disability checkbox (real click toggles React checkboxes).
const { makeWindow, loadCore } = require("./harness");
let pass = 0, fail = 0;
const fails = [];
function ok(n, c, e) { if (c) pass++; else { fail++; fails.push(n + (e ? "  ->  " + e : "")); } }
const aidOf = (el) => el && el.closest && (el.closest('[data-automation-id^="formField"]') || {}).getAttribute &&
  (el.closest('[data-automation-id^="formField"]')).getAttribute('data-automation-id');

function buildPage(w) {
  const combo = (aid, label) => `<div data-automation-id="${aid}"><label>${label}</label><button aria-haspopup="listbox">Select One</button></div>`;
  const text = (aid, label) => `<div data-automation-id="${aid}"><label>${label}</label><input type="text"/></div>`;
  const check = (label) => `<div class="cbwrap"><label class="cb">${label}<input type="checkbox" aria-checked="false"/></label></div>`;
  // Workday date group: three spinbutton inputs (Month/Day/Year), not one text field.
  const dateGroup = `<div data-automation-id="formField-dateSignedOn"><label>Date</label>
    <div role="group" data-automation-id="dateInput">
      <input role="spinbutton" data-automation-id="dateSectionMonth-input" aria-label="Month"/>
      <input role="spinbutton" data-automation-id="dateSectionDay-input" aria-label="Day"/>
      <input role="spinbutton" data-automation-id="dateSectionYear-input" aria-label="Year"/>
    </div></div>`;
  w.document.body.innerHTML = `<div data-automation-id="disabilityForm">
    ${combo('formField-disabilityForm', 'Language')}
    ${text('formField-name', 'Name')}
    ${text('formField-employeeId', 'Employee ID (if applicable)')}
    ${dateGroup}
    <div data-automation-id="formField-disabilityStatus"><legend>Please check one of the boxes below:</legend>
      ${check('Yes, I have a disability, or have had one in the past')}
      ${check('No, I do not have a disability and have not had one in the past')}
      ${check('I do not want to answer')}
    </div>
  </div>`;
}

(function plan() {
  const w = makeWindow(); loadCore(w); buildPage(w);
  const wd = w.JAF.adapters.find((a) => a.id === 'workday');
  const values = { fullName: "Hasmika Reddy", disabilityStatus: "No, I do not have a disability",
    __experience: [], __education: [], __languages: [], __projects: [], __skillsArray: [], __webCount: 0 };
  const items = wd.plan(values);
  const byAid = {}; items.forEach((it) => { if (!byAid[aidOf(it.el)]) byAid[aidOf(it.el)] = it; });
  ok("Name filled with full name", byAid['formField-name'] && byAid['formField-name'].value === "Hasmika Reddy", byAid['formField-name'] && byAid['formField-name'].value);
  ok("Language combo English", byAid['formField-disabilityForm'] && byAid['formField-disabilityForm'].value === "English");
  const now = new Date();
  const dateItems = items.filter((it) => it.el && /datesection/i.test(it.el.getAttribute('data-automation-id') || ""));
  const get = (sub) => { const it = dateItems.find((x) => (x.el.getAttribute('data-automation-id') || '').toLowerCase().includes(sub)); return it && it.value; };
  ok("Date month = current month", get("month") === String(now.getMonth() + 1), get("month"));
  ok("Date day = current day", get("day") === String(now.getDate()), get("day"));
  ok("Date year = current year", get("year") === String(now.getFullYear()), get("year"));
  ok("Date filled across 3 spinbuttons", dateItems.length === 3, dateItems.length + " date items");
})();

/* ---- checkbox actually gets CHECKED via applyItem (real click toggles it) ---- */
(function checkboxToggle() {
  const w = makeWindow(); loadCore(w); const B = w.JAF.adapterBase;
  const lbl = w.document.createElement("label");
  lbl.innerHTML = 'No, I do not have a disability<input type="checkbox" aria-checked="false"/>';
  w.document.body.appendChild(lbl);
  const cb = lbl.querySelector("input");
  const ok1 = B.applyItem({ el: cb, kind: "boolean" }, "yes");
  ok("checkbox becomes checked", cb.checked === true, "checked=" + cb.checked);
  ok("applyItem reports success", ok1 === true);
  B.applyItem({ el: cb, kind: "boolean" }, "yes");
  ok("checkbox stays checked on re-apply", cb.checked === true);
})();

console.log(`\n[self_identify] ${pass} passed, ${fail} failed`);
if (fails.length) { fails.forEach((f) => console.log("  x " + f)); process.exit(1); }
console.log("[self_identify] All green.");
