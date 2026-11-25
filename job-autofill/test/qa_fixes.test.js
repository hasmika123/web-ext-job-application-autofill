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
  "src/content/required-audit.js",
  "src/content/filler.js",
];
function win(html) { const w = makeWindow(html); SRC.forEach((p) => load(w, p)); return w; }
const scan = (w) => w.JAF.adapterBase.scanGeneric(w.document);
const fieldOf = (items, f) => items.find((i) => i.field === f);
const adapter = (w, id) => w.JAF.adapters.find((a) => a.id === id);

(async function run() {
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
    '<input type="file" name="file-input">' +
    '<label for="field-one">Last Name</label><input id="field-one" name="value-a">' +
    '<span id="label-two">City</span><input id="field-two" name="value-b" aria-labelledby="label-two">';
  const shItems = scan(sh);
  ok("BUG5 firstName found inside open shadow root", (fieldOf(shItems, "firstName") || {}).el === root.querySelector('[name="first-name-input"]'));
  ok("BUG5 email found inside open shadow root", !!fieldOf(shItems, "email"));
  ok("BUG5 confirm-email gets its own field", fieldOf(shItems, "confirmEmail").el.name === "confirm-email-input");
  ok("BUG5 fileInput pierces shadow", adapter(sh, "generic").fileInput() === root.querySelector('input[type="file"]'));
  const firstNameItem = fieldOf(shItems, "firstName");
  ok("BUG5 firstName fills inside open shadow root",
    sh.JAF.adapterBase.applyItem(firstNameItem, "Ada") === true &&
      root.querySelector('[name="first-name-input"]').value === "Ada");
  ok("BUG5 label[for] resolves inside open shadow root",
    /last name/i.test(sh.JAF.adapterBase.labelText(root.querySelector("#field-one"))));
  ok("BUG5 aria-labelledby resolves inside open shadow root",
    /city/i.test(sh.JAF.adapterBase.labelText(root.querySelector("#field-two"))));

  /* ---- BUG-5 follow-up: shadow-root combobox commits a real option ---- */
  const combo = win("<div id='combo-host'></div>");
  const comboRoot = combo.document.getElementById("combo-host").attachShadow({ mode: "open" });
  comboRoot.innerHTML =
    '<input id="city" role="combobox" aria-controls="city-options" aria-expanded="true" value="">' +
    '<ul id="city-options" role="listbox"><li id="city-jalpaiguri" role="option">Jalpaiguri</li></ul>';
  const city = comboRoot.querySelector("#city");
  const cityOptions = comboRoot.querySelector("#city-options");
  const cityOption = comboRoot.querySelector("#city-jalpaiguri");
  city.addEventListener("input", () => { cityOptions.hidden = false; });
  cityOption.addEventListener("click", () => {
    city.value = "Jalpaiguri";
    city.setAttribute("aria-expanded", "false");
    cityOption.setAttribute("aria-selected", "true");
    cityOptions.hidden = true;
  });
  ok("BUG5 shadow combobox finds its local listbox", combo.JAF.adapterBase.openListbox(city) === cityOptions);
  ok("BUG5 shadow combobox commits the selected option",
    await combo.JAF.adapterBase.selectCustom(city, "JALPAIGURI") === true && city.value === "Jalpaiguri");

  const uncommitted = win("<div id='combo-host'></div>");
  const uncommittedRoot = uncommitted.document.getElementById("combo-host").attachShadow({ mode: "open" });
  uncommittedRoot.innerHTML =
    '<input id="city" role="combobox" aria-controls="city-options" aria-expanded="true" value="">' +
    '<ul id="city-options" role="listbox"><li role="option">Jalpaiguri</li></ul>';
  const typedOnly = uncommittedRoot.querySelector("#city");
  const typedOnlyList = uncommittedRoot.querySelector("#city-options");
  typedOnly.addEventListener("input", () => { typedOnly.value = "Jalpaiguri"; });
  ok("BUG5 typed-only shadow autocomplete is not treated as committed",
    await uncommitted.JAF.adapterBase.selectCustom(typedOnly, "JALPAIGURI") === false && !typedOnlyList.hidden);

  /* ---- BUG-5 follow-up: SmartRecruitters replaces a shadow combo after selection ---- */
  const replaced = win("<div id='combo-replace-host'></div>");
  const replacedRoot = replaced.document.getElementById("combo-replace-host").attachShadow({ mode: "open" });
  replacedRoot.innerHTML =
    '<input id="city-old" role="combobox" aria-label="City" aria-controls="city-options" aria-expanded="true" value="">' +
    '<ul id="city-options" role="listbox"><li role="option">Jalpaiguri</li></ul>';
  const oldCity = replacedRoot.querySelector("#city-old");
  const oldOptions = replacedRoot.querySelector("#city-options");
  const oldOption = oldOptions.querySelector('[role="option"]');
  let currentCity = oldCity;
  oldOption.addEventListener("click", () => {
    const fresh = replaced.document.createElement("input");
    fresh.id = "city-new";
    fresh.setAttribute("role", "combobox");
    fresh.setAttribute("aria-label", "City");
    fresh.setAttribute("aria-expanded", "false");
    replacedRoot.replaceChildren(fresh);
    currentCity = fresh;
  });
  const replacedItem = { el: oldCity, field: "city", label: "City", kind: "combo", value: "Jalpaiguri" };
  ok("BUG5 replacement combo does not report stale success",
    await replaced.JAF.adapterBase.applyItemAsync(replacedItem) === false && replacedItem.el === currentCity &&
      !currentCity.getAttribute("aria-selected"));

  const committedReplacement = win("<div id='combo-commit-host'></div>");
  const committedRoot = committedReplacement.document.getElementById("combo-commit-host").attachShadow({ mode: "open" });
  committedRoot.innerHTML =
    '<input id="city-old" role="combobox" aria-label="City" aria-controls="city-options" aria-expanded="true" value="">' +
    '<ul id="city-options" role="listbox"><li role="option">Jalpaiguri</li></ul>';
  const oldCommittedCity = committedRoot.querySelector("#city-old");
  const committedOption = committedRoot.querySelector('[role="option"]');
  let committedCity = oldCommittedCity;
  committedOption.addEventListener("click", () => {
    const fresh = committedReplacement.document.createElement("input");
    fresh.id = "city-new";
    fresh.setAttribute("role", "combobox");
    fresh.setAttribute("aria-label", "City");
    fresh.setAttribute("aria-expanded", "false");
    fresh.value = "Jalpaiguri";
    committedRoot.replaceChildren(fresh);
    committedCity = fresh;
  });
  const committedItem = { el: oldCommittedCity, field: "city", label: "City", kind: "combo", value: "Jalpaiguri" };
  ok("BUG5 replacement combo succeeds only after current control commits",
    await committedReplacement.JAF.adapterBase.applyItemAsync(committedItem) === true && committedItem.el === committedCity && committedCity.value === "Jalpaiguri");

  /* ---- BUG-5 follow-up: required audit also pierces open shadow roots ---- */
  const requiredShadow = win("<div id='required-host'></div>");
  const requiredRoot = requiredShadow.document.getElementById("required-host").attachShadow({ mode: "open" });
  requiredRoot.innerHTML = '<label>City *<input id="required-city" required></label>';
  ok("BUG5 required audit finds an empty shadow control",
    requiredShadow.JAF.requiredAudit.findRequiredEmpty(requiredShadow.document).length === 1);

  const verifyShadow = win('<label for="verify-email">Email</label><input id="verify-email">');
  const verifyInput = verifyShadow.document.getElementById("verify-email");
  const verifyItem = { el: verifyInput, field: "email", label: "Email", kind: "text", value: "ada@example.com" };
  let verifyCurrent = verifyInput;
  verifyInput.addEventListener("input", () => {
    const fresh = verifyShadow.document.createElement("input");
    fresh.id = "verify-email-new";
    fresh.setAttribute("aria-label", "Email");
    verifyInput.replaceWith(fresh);
    verifyCurrent = fresh;
  });
  verifyShadow.JAF.adapterBase.applyItem(verifyItem, verifyItem.value);
  ok("BUG5 post-fill verification rejects a blank rerendered control",
    verifyShadow.JAF.adapterBase.verifyItem(verifyItem, verifyItem.value) === false && verifyItem.el === verifyCurrent);
  ok("BUG5 post-fill verification accepts the current committed value", (() => {
    verifyShadow.JAF.adapterBase.fillText(verifyCurrent, verifyItem.value);
    return verifyShadow.JAF.adapterBase.verifyItem(verifyItem, verifyItem.value) === true;
  })());

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

  const confirm = win('<label for="email">Email</label><input id="email" type="email">' +
    '<label for="confirm">Confirm Email</label><input id="confirm" type="email" autocomplete="email">');
  const confirmItems = scan(confirm);
  ok("BUG4 ordinary email keeps the email field", fieldOf(confirmItems, "email").el.id === "email");
  ok("BUG4 confirmation email maps separately", fieldOf(confirmItems, "confirmEmail").el.id === "confirm");
  const confirmValues = confirm.JAF.schema.buildFillValues({ email: "ada@example.com" }, { skills: [] }, {});
  ok("BUG4 confirmation email uses the saved profile email", confirmValues.confirmEmail === "ada@example.com");

  const sourceContract = win('<label for="source-email">Email</label><input id="source-email">');
  await sourceContract.JAF.filler.start({ email: "ada@example.com" }, null, {
    assist: false,
    sourceNote: "Contact fields come from your saved Kiwiply profile.",
  });
  const sourceHost = sourceContract.document.getElementById("__jaf_host");
  ok("BUG4 fill review explains the profile/résumé source contract",
    !!sourceHost && sourceHost.shadowRoot.textContent.includes("Contact fields come from your saved Kiwiply profile."));
  sourceHost && sourceHost.remove();

  /* ---- BUG-6: résumé parsing must not overwrite profile contact fields ---- */
  const resumeRace = win(
    '<label for="race-first">First Name</label><input id="race-first">' +
    '<label for="race-last">Last Name</label><input id="race-last">' +
    '<label for="race-email">Email</label><input id="race-email" type="email">' +
    '<label for="race-phone">Phone</label><input id="race-phone">' +
    '<label>Resume<input type="file" name="resume"></label>'
  );
  const raceBase = resumeRace.JAF.adapterBase;
  const originalAttach = raceBase.attachFileDetailed;
  raceBase.attachFileDetailed = async () => {
    // SmartRecruitters parses the uploaded résumé after the file event and can
    // replace contact values that the extension already wrote.
    setTimeout(() => {
      resumeRace.document.getElementById("race-first").value = "Alex";
      resumeRace.document.getElementById("race-last").value = "Morgan";
      resumeRace.document.getElementById("race-email").value = "alex.morgan.test@example.com";
      resumeRace.document.getElementById("race-phone").value = "+15550102026";
    }, 400);
    return { ok: true };
  };
  await resumeRace.JAF.filler.start({
    firstName: "Mrinal", lastName: "Sarkar", email: "rs916545@gmail.com", phone: "0980 045 3709",
  }, { base64: "eA==", type: "application/pdf", name: "resume.pdf" }, {
    assist: false, mapFields: false, autoAddRows: false,
  });
  const raceHost = resumeRace.document.getElementById("__jaf_host");
  raceHost.shadowRoot.querySelector("#fill").click();
  await new Promise((resolve) => setTimeout(resolve, 1200));
  ok("BUG6 résumé parser cannot overwrite profile first name", resumeRace.document.getElementById("race-first").value === "Mrinal");
  ok("BUG6 résumé parser cannot overwrite profile last name", resumeRace.document.getElementById("race-last").value === "Sarkar");
  ok("BUG6 résumé parser cannot overwrite profile email", resumeRace.document.getElementById("race-email").value === "rs916545@gmail.com");
  ok("BUG6 résumé parser cannot overwrite profile phone", resumeRace.document.getElementById("race-phone").value === "0980 045 3709");
  raceBase.attachFileDetailed = originalAttach;

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
