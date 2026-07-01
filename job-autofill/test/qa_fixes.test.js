// qa_fixes.test.js — regression tests for the 5 bugs found in the live cross-site
// autofill QA (see AUTOFILL-QA.md). Fixtures are shaped from the REAL ATS DOM captured
// during that testing (Lever cards, Workable QA_, SmartRecruiters shadow DOM, Ashby
// _systemfield_name, Greenhouse/Lever EEO selects) — dossier rule: never guess markup.
const { makeWindow, load } = require("./harness");
let pass = 0, fail = 0; const fails = [];
function ok(n, c, e) { if (c) pass++; else { fail++; fails.push(n + (e ? "  ->  " + e : "")); } }

const SRC = [
  "src/config/rules.js", "src/lib/rules-store.js", "src/lib/schema.js",
  "src/content/adapters/base.js", "src/content/adapters/generic.js",
  "src/content/adapters/lever.js", "src/content/adapters/ashby.js",
];
function win(html) { const w = makeWindow(html); SRC.forEach((p) => load(w, p)); return w; }
const scan = (w) => w.JAF.adapterBase.scanGeneric(w.document);
const fieldOf = (items, f) => items.find((i) => i.field === f);
const adapter = (w, id) => w.JAF.adapters.find((a) => a.id === id);

(function run() {
  /* ---- BUG-3: Y/N radio-group questions resolve their question text ---- */
  // Lever "cards" shape: a .application-question wrapper with the prompt in
  // .application-label and options whose radios aren't linked to it.
  const lev = win(
    '<div class="application-question"><div class="application-label">Are you legally authorized to work in the United States?</div>' +
    '<ul class="application-answers">' +
    '<li><label><input type="radio" name="cards[a1b2][field0]" value="Yes">Yes</label></li>' +
    '<li><label><input type="radio" name="cards[a1b2][field0]" value="No">No</label></li></ul></div>' +
    '<div class="application-question"><div class="application-label">Will you now or in the future require visa sponsorship?</div>' +
    '<ul><li><label><input type="radio" name="cards[c3d4][field0]" value="Yes">Yes</label></li>' +
    '<li><label><input type="radio" name="cards[c3d4][field0]" value="No">No</label></li></ul></div>'
  );
  const radioAuth = lev.document.querySelector('input[name="cards[a1b2][field0]"]');
  ok("BUG3 labelText pulls the radio group's question", /authorized to work/i.test(lev.JAF.adapterBase.labelText(radioAuth)),
    lev.JAF.adapterBase.labelText(radioAuth));
  const levItems = scan(lev);
  ok("BUG3 authorizedToWork matched from Lever cards", !!fieldOf(levItems, "authorizedToWork"));
  ok("BUG3 requireSponsorship matched from Lever cards", !!fieldOf(levItems, "requireSponsorship"));
  ok("BUG3 matched radios are kind=boolean", (fieldOf(levItems, "authorizedToWork") || {}).kind === "boolean");

  // Workable shape: a fieldset/legend group (question in <legend>).
  const wk = win('<fieldset><legend>Will you require visa sponsorship to work in the US?</legend>' +
    '<label><input type="radio" name="QA_1" value="Yes">Yes</label><label><input type="radio" name="QA_1" value="No">No</label></fieldset>');
  ok("BUG3 fieldset/legend question maps to requireSponsorship", !!fieldOf(scan(wk), "requireSponsorship"));

  // Guard: a bare Yes/No with NO question wrapper stays unmatched (no false positives).
  const bare = win('<label><input type="radio" name="x" value="Yes">Yes</label><label><input type="radio" name="x" value="No">No</label>');
  ok("BUG3 bare Yes/No (no prompt) → not force-matched", scan(bare).length === 0);

  /* ---- BUG-5: open shadow DOM is pierced ---- */
  const sh = win("<div id='host'></div>");
  const host = sh.document.getElementById("host");
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = '<label>First Name<input name="first-name-input"></label>' +
    '<label>Email<input type="email" name="email-input"></label>' +
    '<label>Confirm Email<input type="email" name="confirm-email-input"></label>' +
    '<input type="file" name="file-input">';
  const shItems = scan(sh);
  ok("BUG5 firstName found inside open shadow root", (fieldOf(shItems, "firstName") || {}).el === root.querySelector('[name="first-name-input"]'));
  ok("BUG5 email found inside open shadow root", !!fieldOf(shItems, "email"));
  ok("BUG5 confirm-email still negated (not email)", fieldOf(shItems, "email").el.name === "email-input");
  ok("BUG5 fileInput pierces shadow", adapter(sh, "generic").fileInput() === root.querySelector('input[type="file"]'));

  /* ---- BUG-1: EEO fields fill (no more SENSITIVE hard-skip) ---- */
  const eeo = win('<label for="g">Gender</label><select id="g" name="gender"><option>Select</option><option>Male</option><option>Female</option></select>' +
    '<label for="v">Veteran Status</label><select id="v" name="veteran"><option>Select</option><option>I am not a veteran</option></select>');
  const eeoItems = scan(eeo);
  ok("BUG1 gender select is now scanned", !!fieldOf(eeoItems, "gender"));
  ok("BUG1 veteranStatus select is now scanned", !!fieldOf(eeoItems, "veteranStatus"));
  // buildFillValues includes EEO with no opt-in flag.
  const v = eeo.JAF.schema.buildFillValues({ firstName: "Alex", lastName: "Taylor", gender: "Male", veteranStatus: "No" }, { skills: [] }, {});
  ok("BUG1 buildFillValues includes EEO without includeEEO flag", v.gender === "Male" && v.veteranStatus === "No");
  ok("BUG1 EEO absent when the user has none", eeo.JAF.schema.buildFillValues({ firstName: "Alex" }, { skills: [] }, {}).gender === undefined);

  /* ---- BUG-4: Ashby single legal-name field maps to fullName, not lastName ---- */
  const ash = win('<form><input name="_systemfield_name" aria-label="Legal First and Last Name">' +
    '<input name="_systemfield_email" type="email" aria-label="Email"></form>');
  const ashItems = adapter(ash, "ashby").plan({ fullName: "Alex Taylor", firstName: "Alex", lastName: "Taylor", email: "a@b.co" });
  const nameItem = ashItems.find((i) => i.el.name === "_systemfield_name");
  ok("BUG4 Ashby _systemfield_name → fullName", nameItem && nameItem.field === "fullName" && nameItem.value === "Alex Taylor",
    nameItem && nameItem.field);
  ok("BUG4 Ashby name not mis-mapped to lastName", !ashItems.some((i) => i.el.name === "_systemfield_name" && i.field === "lastName"));

  /* ---- BUG-2: Lever location field maps to city ---- */
  const lv2 = win('<form class="application-form"><input name="name"><input name="email" type="email"><input name="location"></form>');
  const lv2Items = adapter(lv2, "lever").plan({ fullName: "Alex Taylor", email: "a@b.co", city: "San Francisco" });
  const locItem = lv2Items.find((i) => i.el.name === "location");
  ok("BUG2 Lever location → city", locItem && locItem.field === "city" && locItem.value === "San Francisco");

  console.log(`\n[qa_fixes] ${pass} passed, ${fail} failed`);
  if (fails.length) { fails.forEach((f) => console.log("  x " + f)); process.exit(1); }
  console.log("[qa_fixes] All green.");
})();
