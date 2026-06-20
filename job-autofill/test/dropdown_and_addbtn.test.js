// Regression tests for the live-captured Workday bugs #5, #6, #7.
// #5: Country dropdown was polluted by the Country Phone Code multiselect's
//     selected pills ("United States of America (+1)"), so option matching picked
//     the wrong country (Gabon). Fix: scope options to the open listbox + prefer
//     exact / shortest-startsWith match.
// #6/#7: All section "Add" buttons share data-automation-id="add-button" with text
//     "Add", so addButtonFor resolved every section to the first (Work Experience)
//     button — Education's Add never fired, and Education/Languages processing
//     mis-clicked the Work Experience Add (extra empty experience blocks). Fix:
//     resolve by nearest preceding section heading before the broad-container
//     strategy, and reject a container holding more than one Add button.
const { makeWindow, load } = require("./harness");
let pass = 0, fail = 0;
const fails = [];
function ok(n, c, e) { if (c) pass++; else { fail++; fails.push(n + (e ? "  ->  " + e : "")); } }

function coreInto(w) {
  ["src/config/rules.js", "src/lib/rules-store.js", "src/lib/schema.js",
   "src/content/adapters/base.js", "src/content/adapters/workday.js"].forEach((p) => load(w, p));
}

/* ---------- #5: Country dropdown polluted by Phone Code multiselect ---------- */
(function countryScope() {
  const w = makeWindow();
  coreInto(w);
  const B = w.JAF.adapterBase, doc = w.document;
  // Phone-code multiselect's selected pills live LOOSE in the body (role=option),
  // exactly like the live Freddie Mac DOM ("United States of America (+1)").
  doc.body.innerHTML = `
    <button id="trigger" aria-haspopup="listbox">United States of America</button>
    <div id="phonepills">
      <div role="option">United States of America (+1)</div>
      <div role="option">United States of America (+1)</div>
    </div>
    <ul id="list" role="listbox" data-automation-id="list">
      <li role="option">Gabon</li>
      <li role="option">Gambia</li>
      <li role="option">United States Minor Outlying Islands</li>
      <li role="option">United States of America</li>
    </ul>`;
  const trigger = doc.getElementById("trigger");
  const box = B.openListbox(trigger);
  ok("#5 openListbox returns the country listbox", box && box.id === "list", box && box.id);
  const scoped = B.visibleOptions(box).map((o) => o.textContent.trim());
  ok("#5 scoped options exclude phone-code pills",
     scoped.length === 4 && !scoped.some((t) => /\(\+1\)/.test(t)), JSON.stringify(scoped));
  const pick = B.bestOption(B.visibleOptions(box), "United States");
  ok("#5 picks 'United States of America' (not Gabon / Minor Islands)",
     pick && pick.textContent.trim() === "United States of America", pick && pick.textContent.trim());
  const pick2 = B.bestOption(B.visibleOptions(box), "United States of America");
  ok("#5 exact candidate resolves too", pick2 && pick2.textContent.trim() === "United States of America");
  const usPick = B.bestOption(B.visibleOptions(box), "US");
  ok("#5 'US' does not false-match Gabon/Gambia", !usPick || /united states/i.test(usPick.textContent), usPick && usPick.textContent.trim());
})();

/* ---------- #6 + #7: section Add buttons share a generic id ---------- */
(function addButtonResolution() {
  const w = makeWindow();
  coreInto(w);
  const doc = w.document;
  const section = (heading, mark) => `
    <div class="section">
      <h3 class="heading">${heading}</h3>
      <div class="body"><button data-automation-id="add-button" data-mark="${mark}">Add</button></div>
    </div>`;
  doc.body.innerHTML = `<div data-automation-id="applyFlowMyExpPage">
    ${section("Work Experience", "we")}
    ${section("Education", "edu")}
    ${section("Languages", "lang")}
    ${section("Websites", "web")}
  </div>`;
  const sec = w.JAF.rules.site("workday").sections;
  const abf = w.JAF.__wdInternals.addButtonFor;
  const markOf = (b) => b && b.getAttribute("data-mark");
  ok("#7 Education Add resolves to Education (not Work Experience)", markOf(abf(sec.education)) === "edu", markOf(abf(sec.education)));
  ok("#6 Work Experience Add resolves to Work Experience", markOf(abf(sec.experience)) === "we", markOf(abf(sec.experience)));
  ok("Languages Add resolves to Languages", markOf(abf(sec.language)) === "lang", markOf(abf(sec.language)));
  ok("Websites Add resolves to Websites", markOf(abf(sec.website)) === "web", markOf(abf(sec.website)));
})();

console.log(`\n[dropdown_and_addbtn] ${pass} passed, ${fail} failed`);
if (fails.length) { fails.forEach((f) => console.log("  x " + f)); process.exit(1); }
console.log("[dropdown_and_addbtn] All green.");
