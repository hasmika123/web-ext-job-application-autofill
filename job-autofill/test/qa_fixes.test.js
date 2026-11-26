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
function winAt(html, url) { const w = makeWindow(html, { url }); SRC.forEach((p) => load(w, p)); return w; }
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

  /* ---- SmartRecruiters follow-up: closed-shadow menus need exact keyboard commit ----- */
  // SmartRecruiters exposes the trigger in a reachable root, but renders the
  // popup/search controls in a closed shadow root. The extension can therefore
  // see the trigger but cannot query [role=option]. The real component still
  // accepts keyboard selection; model that boundary without exposing options.
  const srClosed = winAt("<div id='sr-closed-host'></div>",
    "https://jobs.smartrecruiters.com/oneclick-ui/company/ServiceNow/publication/closed-menu");
  const srClosedHost = srClosed.document.getElementById("sr-closed-host");
  const srClosedRoot = srClosedHost.attachShadow({ mode: "open" });
  let closedBoundaryInput = false, closedBoundaryClick = false, closedBoundaryKey = false;
  srClosedHost.addEventListener("input", () => { closedBoundaryInput = true; });
  srClosedHost.addEventListener("click", () => { closedBoundaryClick = true; });
  srClosedHost.addEventListener("keydown", () => { closedBoundaryKey = true; });
  srClosedRoot.innerHTML =
    '<label>Country/Region<input id="closed-country" role="combobox" aria-label="Country/Region" aria-controls="closed-country-menu" aria-expanded="false" value="United States"></label>' +
    '<label>Phone number<div id="closed-phone-group">' +
      '<button id="closed-phone-code" type="button" role="combobox" aria-label="Country code" aria-controls="closed-phone-menu" aria-expanded="false">+1</button>' +
      '<input id="closed-phone" type="tel" aria-label="Phone number"></div></label>';
  const closedCountry = srClosedRoot.querySelector("#closed-country");
  const closedPhoneCode = srClosedRoot.querySelector("#closed-phone-code");
  const closedPhone = srClosedRoot.querySelector("#closed-phone");
  // The live oneclick-ui trigger can stay aria-expanded=false because the
  // actual open state belongs to the closed shadow control. The keyboard
  // listener is intentionally still reachable from the exposed trigger.
  closedCountry.addEventListener("click", () => {});
  closedCountry.addEventListener("keydown", (event) => {
    if (event.key === "End") closedCountry.dataset.activeOption = "India";
    if (event.key === "Enter" && closedCountry.dataset.activeOption === "India") {
      closedCountry.value = "India";
      closedCountry.setAttribute("aria-expanded", "false");
    }
  });
  closedPhoneCode.addEventListener("click", () => {});
  closedPhoneCode.addEventListener("keydown", (event) => {
    if (/^[a-z]$/i.test(event.key)) closedPhoneCode.dataset.query = (closedPhoneCode.dataset.query || "") + event.key;
    if (event.key === "End" && String(closedPhoneCode.dataset.query || "").toLowerCase() === "india") {
      closedPhoneCode.dataset.activeOption = "India +91";
    }
    if (event.key === "Enter" && closedPhoneCode.dataset.activeOption === "India +91") {
      closedPhoneCode.textContent = "India +91";
      closedPhoneCode.setAttribute("aria-expanded", "false");
    }
  });
  closedPhone.addEventListener("input", () => { closedPhone.value = String(closedPhone.value).replace(/\D/g, ""); });
  const closedItems = adapter(srClosed, "generic").plan({ country: "India", phone: "0980 045 3709" });
  const closedCountryItem = fieldOf(closedItems, "country");
  const closedPhoneItem = fieldOf(closedItems, "phone");
  ok("Closed-shadow country trigger is planned", closedCountryItem && closedCountryItem.el === closedCountry);
  ok("Closed-shadow phone item carries its code trigger",
    closedPhoneItem && closedPhoneItem.phoneCountryControl === closedPhoneCode);
  ok("Closed-shadow country commits exact India via keyboard fallback",
    await srClosed.JAF.adapterBase.applyItemAsync(closedCountryItem) === true && closedCountry.value === "India");
  ok("Closed-shadow phone commits India +91 before the number",
    await srClosed.JAF.adapterBase.applyItemAsync(closedPhoneItem) === true && /India|\+91/.test(closedPhoneCode.textContent) && closedPhone.value === "09800453709");
  ok("Shadow events cross the SmartRecruiters host boundary",
    closedBoundaryInput && closedBoundaryClick && closedBoundaryKey);

  /* ---- SmartRecruiters country + phone country-code controls ----- */
  // ServiceNow's SmartRecruiters form keeps Country/Region, the phone country
  // code, and the phone number as three separate controls. The code-only combo
  // must not become a second profile field, but it must be driven as part of the
  // phone fill so an India profile does not leave the page on its US default.
  const srCountryPhone = win("<div id='sr-host'></div>");
  const srRoot = srCountryPhone.document.getElementById("sr-host").attachShadow({ mode: "open" });
  srRoot.innerHTML =
    '<label>Country/Region<input id="sr-country" role="combobox" aria-label="Country/Region" aria-expanded="false" value="United States"></label>' +
    '<label>Phone number<div id="sr-phone-group">' +
      '<button id="sr-phone-code" type="button" role="combobox" aria-label="Country code" aria-expanded="false">+1</button>' +
      '<input id="sr-phone" type="tel" aria-label="Phone number">' +
    '</div></label>';
  const srCountry = srRoot.querySelector("#sr-country");
  const srPhoneCode = srRoot.querySelector("#sr-phone-code");
  const srPhone = srRoot.querySelector("#sr-phone");
  srCountry.addEventListener("click", () => {
    if (srRoot.querySelector("#sr-country-options")) return;
    const list = srCountryPhone.document.createElement("ul");
    list.id = "sr-country-options";
    list.setAttribute("role", "listbox");
    const option = srCountryPhone.document.createElement("li");
    option.setAttribute("role", "option");
    option.textContent = "India";
    option.addEventListener("click", () => {
      srCountry.value = "India";
      srCountry.setAttribute("aria-expanded", "false");
      list.remove();
    });
    list.appendChild(option);
    srRoot.appendChild(list);
    srCountry.setAttribute("aria-expanded", "true");
  });
  srPhoneCode.addEventListener("click", () => {
    if (srRoot.querySelector("#sr-phone-code-options")) return;
    const list = srCountryPhone.document.createElement("ul");
    list.id = "sr-phone-code-options";
    list.setAttribute("role", "listbox");
    const option = srCountryPhone.document.createElement("li");
    option.setAttribute("role", "option");
    option.textContent = "India (+91)";
    option.addEventListener("click", () => {
      srPhoneCode.textContent = "India (+91)";
      srPhoneCode.setAttribute("data-country-code", "IN");
      srPhoneCode.setAttribute("aria-expanded", "false");
      list.remove();
    });
    list.appendChild(option);
    srRoot.appendChild(list);
    srPhoneCode.setAttribute("aria-expanded", "true");
  });
  srPhone.addEventListener("input", () => { srPhone.value = String(srPhone.value).replace(/\D/g, ""); });
  const srItems = adapter(srCountryPhone, "generic").plan({ country: "India", phone: "0980 045 3709" });
  const srCountryItem = fieldOf(srItems, "country");
  const srPhoneItem = fieldOf(srItems, "phone");
  ok("SmartRecruiters country combo is planned with India", srCountryItem && srCountryItem.value === "India");
  ok("SmartRecruiters phone item carries its nearby country-code control",
    !!(srPhoneItem && srPhoneItem.phoneCountryControl === srPhoneCode));
  ok("Phone country code is not shown as a duplicate profile row",
    srItems.filter((item) => item.el === srPhoneCode).length === 0);
  ok("SmartRecruiters country commits India, not the US default",
    await srCountryPhone.JAF.adapterBase.applyItemAsync(srCountryItem) === true && srCountry.value === "India");
  ok("SmartRecruiters selects India +91 before filling the phone",
    await srCountryPhone.JAF.adapterBase.applyItemAsync(srPhoneItem) === true && /India|\+91/.test(srPhoneCode.textContent) && srPhone.value === "09800453709");

  const unrelatedSelect = win(
    '<label>Phone number<div><spl-select id="unrelated-select"></spl-select>' +
      '<input id="unrelated-phone" type="tel" aria-label="Phone number"></div></label>'
  );
  const unrelatedPhoneItem = fieldOf(adapter(unrelatedSelect, "generic").plan({ country: "India", phone: "0980 045 3709" }), "phone");
  ok("Generic pages ignore unrelated custom selects beside phone inputs",
    unrelatedPhoneItem && !unrelatedPhoneItem.phoneCountryControl);

  const srUnchecked = winAt("<div id='sr-unchecked-host'></div>",
    "https://jobs.smartrecruiters.com/oneclick-ui/company/ServiceNow/publication/review-selection");
  const srUncheckedRoot = srUnchecked.document.getElementById("sr-unchecked-host").attachShadow({ mode: "open" });
  srUncheckedRoot.innerHTML =
    '<label>Country/Region<input id="unchecked-country" role="combobox" aria-label="Country/Region" aria-expanded="false" value="United States"></label>' +
    '<label>Phone number<div><button id="unchecked-code" type="button" role="combobox" aria-label="Country code" aria-expanded="false">+1</button>' +
      '<input id="unchecked-phone" type="tel" aria-label="Phone number"></div></label>';
  const uncheckedCountry = srUncheckedRoot.querySelector("#unchecked-country");
  const uncheckedCode = srUncheckedRoot.querySelector("#unchecked-code");
  const uncheckedPhone = srUncheckedRoot.querySelector("#unchecked-phone");
  uncheckedCountry.addEventListener("click", () => {
    if (srUncheckedRoot.querySelector("#unchecked-country-options")) return;
    const list = srUnchecked.document.createElement("ul");
    list.id = "unchecked-country-options";
    list.setAttribute("role", "listbox");
    const option = srUnchecked.document.createElement("li");
    option.setAttribute("role", "option");
    option.textContent = "India";
    option.addEventListener("click", () => { uncheckedCountry.value = "India"; list.remove(); });
    list.appendChild(option);
    srUncheckedRoot.appendChild(list);
  });
  uncheckedCode.addEventListener("click", () => {
    if (srUncheckedRoot.querySelector("#unchecked-code-options")) return;
    const list = srUnchecked.document.createElement("ul");
    list.id = "unchecked-code-options";
    list.setAttribute("role", "listbox");
    const option = srUnchecked.document.createElement("li");
    option.setAttribute("role", "option");
    option.textContent = "India (+91)";
    option.addEventListener("click", () => {
      uncheckedCode.textContent = "India (+91)";
      uncheckedCode.setAttribute("data-country-code", "IN");
      list.remove();
    });
    list.appendChild(option);
    srUncheckedRoot.appendChild(list);
  });
  uncheckedPhone.addEventListener("input", () => { uncheckedPhone.value = String(uncheckedPhone.value).replace(/\D/g, ""); });
  await srUnchecked.JAF.filler.start({ country: "India", phone: "0980 045 3709" }, null,
    { assist: false, mapFields: false, autoAddRows: false });
  const uncheckedHost = srUnchecked.document.getElementById("__jaf_host");
  const uncheckedCountryCheck = Array.from(uncheckedHost.shadowRoot.querySelectorAll('input[type="checkbox"][data-i]'))
    .find((check) => /Country\/Region/.test(check.parentElement.textContent));
  uncheckedCountryCheck.checked = false;
  uncheckedHost.shadowRoot.querySelector("#fill").click();
  await new Promise((resolve) => setTimeout(resolve, 1400));
  ok("Unchecked SmartRecruiters country stays untouched", uncheckedCountry.value === "United States");
  ok("Selected SmartRecruiters phone still fills", uncheckedPhone.value === "09800453709" && /India|\+91/.test(uncheckedCode.textContent));

  // ServiceNow's live controls are input-backed comboboxes rather than buttons.
  // Typing into those inputs is not a selection: the matching list option must
  // be clicked so the component commits its country and dial-code state.
  const srInputCombos = winAt("<div id='sr-input-host'></div>", "https://jobs.smartrecruiters.com/oneclick-ui/company/ServiceNow/publication/input-combos");
  const srInputRoot = srInputCombos.document.getElementById("sr-input-host").attachShadow({ mode: "open" });
  srInputRoot.innerHTML =
    '<label>Country/Region<input id="sr-input-country" role="combobox" aria-label="Country/Region" aria-controls="sr-input-country-menu" aria-expanded="false" value="United States"></label>' +
    '<label>Phone number<div id="sr-input-phone-group">' +
      '<input id="sr-input-code" role="combobox" aria-label="Country code" aria-controls="sr-input-code-menu" aria-expanded="false" value="">' +
      '<input id="sr-input-phone" type="tel" aria-label="Phone number">' +
    '</div></label>';
  const visible = (el) => { el.getBoundingClientRect = () => ({ width: 120, height: 24, top: 0, left: 0, right: 120, bottom: 24 }); return el; };
  const srInputCountry = visible(srInputRoot.querySelector("#sr-input-country"));
  const srInputCode = visible(srInputRoot.querySelector("#sr-input-code"));
  const srInputPhone = visible(srInputRoot.querySelector("#sr-input-phone"));
  const addCountryMenu = () => {
    if (srInputRoot.querySelector("#sr-input-country-menu")) return;
    const list = visible(srInputCombos.document.createElement("ul"));
    list.id = "sr-input-country-menu";
    list.setAttribute("role", "listbox");
    const option = visible(srInputCombos.document.createElement("li"));
    option.setAttribute("role", "option");
    option.textContent = "India";
    option.addEventListener("click", () => {
      srInputCountry.value = "India";
      // SmartRecruiters can leave the typed value and menu open until the
      // input's keyboard commit runs. This is the live screenshot symptom.
    });
    srInputCountry.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || srInputCountry.value !== "India") return;
      srInputCountry.setAttribute("aria-expanded", "false");
      option.setAttribute("aria-selected", "true");
      list.remove();
    }, { once: true });
    list.appendChild(option);
    srInputRoot.appendChild(list);
    srInputCountry.setAttribute("aria-expanded", "true");
  };
  srInputCountry.addEventListener("click", addCountryMenu);
  const addCodeMenu = () => {
    if (srInputRoot.querySelector("#sr-input-code-menu")) return;
    const wrap = srInputCombos.document.createElement("div");
    wrap.id = "sr-input-code-menu";
    const search = visible(srInputCombos.document.createElement("input"));
    search.setAttribute("role", "combobox");
    search.setAttribute("aria-label", "Search by country/region or code");
    const list = visible(srInputCombos.document.createElement("ul"));
    list.setAttribute("role", "listbox");
    const option = visible(srInputCombos.document.createElement("li"));
    option.setAttribute("role", "option");
    option.textContent = "India +91";
    option.addEventListener("click", () => {
      srInputCode.value = "+91";
      srInputCode.setAttribute("data-country-code", "IN");
      srInputCode.setAttribute("aria-expanded", "false");
      wrap.remove();
    });
    list.appendChild(option);
    wrap.append(search, list);
    srInputRoot.appendChild(wrap);
    srInputCode.setAttribute("aria-expanded", "true");
  };
  srInputCode.addEventListener("click", addCodeMenu);
  srInputPhone.addEventListener("input", () => { srInputPhone.value = String(srInputPhone.value).replace(/\D/g, ""); });
  const srInputItems = adapter(srInputCombos, "generic").plan({ country: "India", phone: "0980 045 3709" });
  const srInputCountryItem = fieldOf(srInputItems, "country");
  const srInputPhoneItem = fieldOf(srInputItems, "phone");
  ok("Live-shaped input country is planned", srInputCountryItem && srInputCountryItem.el === srInputCountry);
  ok("Live-shaped input phone carries its code control", srInputPhoneItem && srInputPhoneItem.phoneCountryControl === srInputCode);
  ok("Input country commits the clicked India option",
    await srInputCombos.JAF.adapterBase.applyItemAsync(srInputCountryItem) === true && srInputCountry.value === "India");
  ok("Input phone commits India +91 before the number",
    await srInputCombos.JAF.adapterBase.applyItemAsync(srInputPhoneItem) === true && srInputCode.value === "+91" && srInputPhone.value === "09800453709");

  // SmartRecruiters can render the phone-code search input beside the listbox,
  // not inside it. Without finding that sibling search input, the visible first
  // match "British Indian Ocean Territory" is a substring match for "India";
  // the extension must type the profile country and commit India (+91).
  const srCountryDisambiguation = winAt("<div id='sr-disambiguation-host'></div>", "https://jobs.smartrecruiters.com/oneclick-ui/company/ServiceNow/publication/country-disambiguation");
  const srDisambiguationRoot = srCountryDisambiguation.document.getElementById("sr-disambiguation-host").attachShadow({ mode: "open" });
  srDisambiguationRoot.innerHTML =
    '<label>Phone number<div id="sr-disambiguation-group"><button id="sr-disambiguation-code" type="button" role="combobox" aria-label="Country code" aria-expanded="false">+1</button>' +
      '<input id="sr-disambiguation-phone" type="tel" aria-label="Phone number"></div></label>';
  const srDisambiguationCode = srDisambiguationRoot.querySelector("#sr-disambiguation-code");
  const srDisambiguationPhone = srDisambiguationRoot.querySelector("#sr-disambiguation-phone");
  srDisambiguationCode.addEventListener("click", () => {
    if (srDisambiguationRoot.querySelector("#sr-disambiguation-popup")) return;
    const popup = srCountryDisambiguation.document.createElement("div");
    popup.id = "sr-disambiguation-popup";
    const search = srCountryDisambiguation.document.createElement("input");
    search.setAttribute("aria-label", "Search by country/region or code");
    const list = srCountryDisambiguation.document.createElement("ul");
    list.setAttribute("role", "listbox");
    const option = (text, iso, dial) => {
      const node = srCountryDisambiguation.document.createElement("li");
      node.setAttribute("role", "option");
      node.textContent = text;
      node.addEventListener("click", () => {
        srDisambiguationCode.textContent = text;
        srDisambiguationCode.setAttribute("data-country-code", iso);
        srDisambiguationCode.setAttribute("aria-expanded", "false");
        srDisambiguationCode.dataset.dial = dial;
        popup.remove();
      });
      return node;
    };
    const show = (query) => {
      list.innerHTML = "";
      if (/india/i.test(query)) list.appendChild(option("India +91", "IN", "+91"));
      else list.appendChild(option("British Indian Ocean Territory +246", "IO", "+246"));
    };
    search.addEventListener("input", () => show(search.value));
    show("");
    popup.append(search, list);
    srDisambiguationRoot.appendChild(popup);
    srDisambiguationCode.setAttribute("aria-expanded", "true");
  });
  srDisambiguationPhone.addEventListener("input", () => { srDisambiguationPhone.value = String(srDisambiguationPhone.value).replace(/\D/g, ""); });
  const srDisambiguationPhoneItem = fieldOf(adapter(srCountryDisambiguation, "generic").plan({ country: "India", phone: "0980 045 3709" }), "phone");
  const disambiguationApplied = await srCountryDisambiguation.JAF.adapterBase.applyItemAsync(srDisambiguationPhoneItem);
  ok("Country-code search selects India, not British Indian Ocean Territory",
    disambiguationApplied && srDisambiguationCode.getAttribute("data-country-code") === "IN"
      && /India|\+91/.test(srDisambiguationCode.textContent)
      && srDisambiguationPhone.value === "09800453709",
    `${srDisambiguationCode.textContent}/${srDisambiguationCode.getAttribute("data-country-code")}`);
  const ambiguousCountryOptions = [
    srCountryDisambiguation.document.createElement("li"),
    srCountryDisambiguation.document.createElement("li"),
  ];
  ambiguousCountryOptions[0].textContent = "British Indian Ocean Territory +246";
  ambiguousCountryOptions[1].textContent = "+91 India";
  const exactIndia = srCountryDisambiguation.JAF.adapterBase.bestOption(ambiguousCountryOptions, "India");
  ok("Exact country identity beats Indian Ocean substring",
    exactIndia === ambiguousCountryOptions[1], exactIndia && exactIndia.textContent);

  // Filler-level regression: the country input may already display India while
  // its option list is still open. A visible value is not a committed choice;
  // the filler must still click India, close the list, then fill the phone code.
  const srOpenCountry = winAt("<div id='sr-open-country-host'></div>", "https://jobs.smartrecruiters.com/oneclick-ui/company/ServiceNow/publication/open-country");
  const srOpenRoot = srOpenCountry.document.getElementById("sr-open-country-host").attachShadow({ mode: "open" });
  srOpenRoot.innerHTML =
    '<label>Country/Region<input id="open-country" role="combobox" aria-label="Country/Region" aria-expanded="true" value="India"></label>' +
    '<ul id="open-country-menu" role="listbox"><li role="option">British Indian Ocean Territory</li><li id="open-india" role="option">India</li></ul>' +
    '<label>Phone number<div><button id="open-code" type="button" role="combobox" aria-label="Country code" aria-expanded="false"></button>' +
      '<input id="open-phone" type="tel" aria-label="Phone number"></div></label>';
  const openCountry = srOpenRoot.querySelector("#open-country");
  const openCountryMenu = srOpenRoot.querySelector("#open-country-menu");
  const openIndia = srOpenRoot.querySelector("#open-india");
  const openCode = srOpenRoot.querySelector("#open-code");
  const openPhone = srOpenRoot.querySelector("#open-phone");
  openIndia.addEventListener("click", () => { openCountry.value = "India"; });
  openCountry.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    openCountry.setAttribute("aria-expanded", "false");
    openIndia.setAttribute("aria-selected", "true");
    openCountryMenu.remove();
  });
  openCode.addEventListener("click", () => {
    if (srOpenRoot.querySelector("#open-code-menu")) return;
    const list = srOpenCountry.document.createElement("ul");
    list.id = "open-code-menu";
    list.setAttribute("role", "listbox");
    const option = srOpenCountry.document.createElement("li");
    option.setAttribute("role", "option");
    option.textContent = "India +91";
    option.addEventListener("click", () => {
      openCode.textContent = "India +91";
      openCode.setAttribute("data-country-code", "IN");
      openCode.setAttribute("aria-expanded", "false");
      list.remove();
    });
    list.appendChild(option);
    srOpenRoot.appendChild(list);
    openCode.setAttribute("aria-expanded", "true");
  });
  openPhone.addEventListener("input", () => { openPhone.value = String(openPhone.value).replace(/\D/g, ""); });
  await srOpenCountry.JAF.filler.start({ country: "India", phone: "0980 045 3709" }, null,
    { assist: false, mapFields: false, autoAddRows: false });
  const openHost = srOpenCountry.document.getElementById("__jaf_host");
  openHost.shadowRoot.querySelector("#fill").click();
  await new Promise((resolve) => {
    const deadline = Date.now() + 5000;
    const poll = () => {
      const countryCommitted = openCountry.getAttribute("aria-expanded") === "false" && !srOpenRoot.querySelector("#open-country-menu");
      const codeCommitted = openCode.getAttribute("data-country-code") === "IN";
      if (countryCommitted && codeCommitted && openPhone.value === "09800453709") return resolve();
      if (Date.now() >= deadline) return resolve();
      setTimeout(poll, 50);
    };
    poll();
  });
  ok("Filler clicks India when the input only looks filled", openCountry.getAttribute("aria-expanded") === "false" && !srOpenRoot.querySelector("#open-country-menu"));
  ok("Filler selects India country code before the number", openCode.getAttribute("data-country-code") === "IN" && openPhone.value === "09800453709");

  // SmartRecruiters' real menu rows expose the ARIA option on a wrapper but
  // attach the selection handler to the rendered child inside that row. A
  // click dispatched only at the wrapper reproduces the live symptom: the
  // input reads "India" while menu-spl-form-element_15 remains open.
  const srNestedOption = winAt("<div id='sr-nested-option-host'></div>", "https://jobs.smartrecruiters.com/oneclick-ui/company/ServiceNow/publication/nested-option");
  const srNestedRoot = srNestedOption.document.getElementById("sr-nested-option-host").attachShadow({ mode: "open" });
  srNestedRoot.innerHTML =
    '<label>Country/Region<input id="spl-form-element_15" role="combobox" aria-label="Country/Region" aria-expanded="true" value="india"></label>' +
    '<ul id="menu-spl-form-element_15" role="listbox"><li role="option"><div class="c-spl-autocomplete-option">India</div></li></ul>' +
    '<label>Phone number<div><button id="spl-form-element_12" type="button" role="combobox" aria-label="Country code" aria-expanded="false"></button>' +
      '<input id="spl-form-element_5" type="tel" aria-label="Phone number"></div></label>';
  const nestedCountry = srNestedRoot.querySelector("#spl-form-element_15");
  const nestedMenu = srNestedRoot.querySelector("#menu-spl-form-element_15");
  const nestedRow = nestedMenu.querySelector('[role="option"]');
  const nestedRenderer = nestedRow.querySelector(".c-spl-autocomplete-option");
  nestedRenderer.addEventListener("click", () => {
    nestedCountry.value = "India";
    nestedCountry.setAttribute("aria-expanded", "false");
    nestedMenu.remove();
  });
  const nestedCode = srNestedRoot.querySelector("#spl-form-element_12");
  const nestedPhone = srNestedRoot.querySelector("#spl-form-element_5");
  nestedCode.addEventListener("click", () => {
    if (srNestedRoot.querySelector("#menu-spl-form-element_12")) return;
    const codeMenu = srNestedOption.document.createElement("ul");
    codeMenu.id = "menu-spl-form-element_12";
    codeMenu.setAttribute("role", "listbox");
    const codeRow = srNestedOption.document.createElement("li");
    codeRow.setAttribute("role", "option");
    const codeRenderer = srNestedOption.document.createElement("div");
    codeRenderer.className = "c-spl-autocomplete-option";
    codeRenderer.textContent = "India +91";
    codeRenderer.addEventListener("click", () => {
      nestedCode.textContent = "India +91";
      nestedCode.setAttribute("data-country-code", "IN");
      nestedCode.setAttribute("aria-expanded", "false");
      codeMenu.remove();
    });
    codeRow.appendChild(codeRenderer);
    codeMenu.appendChild(codeRow);
    srNestedRoot.appendChild(codeMenu);
    nestedCode.setAttribute("aria-expanded", "true");
  });
  nestedPhone.addEventListener("input", () => { nestedPhone.value = String(nestedPhone.value).replace(/\D/g, ""); });
  const nestedItems = adapter(srNestedOption, "generic").plan({ country: "India", phone: "0980 045 3709" });
  const nestedCountryItem = fieldOf(nestedItems, "country");
  const nestedPhoneItem = fieldOf(nestedItems, "phone");
  const nestedApplied = await srNestedOption.JAF.adapterBase.applyItemAsync(nestedCountryItem);
  ok("SmartRecruiters nested option commits India", nestedApplied
    && nestedCountry.value === "India"
    && nestedCountry.getAttribute("aria-expanded") === "false"
    && !srNestedRoot.querySelector("#menu-spl-form-element_15"));
  const nestedPhoneApplied = await srNestedOption.JAF.adapterBase.applyItemAsync(nestedPhoneItem);
  ok("SmartRecruiters nested option commits India phone code", nestedPhoneApplied
    && nestedCode.getAttribute("data-country-code") === "IN"
    && /India|\+91/.test(nestedCode.textContent)
    && nestedPhone.value === "09800453709"
    && !srNestedRoot.querySelector("#menu-spl-form-element_12"));

  // The live diagnostic exposes the phone-code trigger as a custom SPL-SELECT
  // host, not as a button/role=combobox. The generic phone scan must still
  // associate that nearby host with the phone input and commit its option.
  const srSplPhone = winAt("<div id='sr-spl-phone-host'></div>",
    "https://jobs.smartrecruiters.com/oneclick-ui/company/ServiceNow/publication/spl-phone");
  const srSplPhoneRoot = srSplPhone.document.getElementById("sr-spl-phone-host").attachShadow({ mode: "open" });
  srSplPhoneRoot.innerHTML =
    '<label>Phone number<div id="spl-phone-group"><spl-select id="spl-form-element_12"></spl-select>' +
      '<input id="spl-form-element_5" type="tel" aria-label="Phone number"></div></label>';
  const splPhoneCode = srSplPhoneRoot.querySelector("#spl-form-element_12");
  const splPhone = srSplPhoneRoot.querySelector("#spl-form-element_5");
  splPhoneCode.addEventListener("click", () => {
    if (srSplPhoneRoot.querySelector("#spl-form-element_12-menu")) return;
    const menu = srSplPhone.document.createElement("div");
    menu.id = "spl-form-element_12-menu";
    menu.setAttribute("role", "listbox");
    const row = srSplPhone.document.createElement("spl-select-option");
    row.setAttribute("value", "in");
    const renderer = srSplPhone.document.createElement("div");
    renderer.className = "c-spl-autocomplete-option-content";
    renderer.textContent = "India +91";
    renderer.addEventListener("click", () => {
      splPhoneCode.textContent = "India +91";
      splPhoneCode.setAttribute("data-country-code", "IN");
      menu.remove();
    });
    row.appendChild(renderer);
    menu.appendChild(row);
    srSplPhoneRoot.appendChild(menu);
  });
  splPhone.addEventListener("input", () => { splPhone.value = String(splPhone.value).replace(/\D/g, ""); });
  const splPhoneItem = fieldOf(adapter(srSplPhone, "generic").plan({ country: "India", phone: "0980 045 3709" }), "phone");
  ok("Live SPL-SELECT phone code is associated with the phone input",
    splPhoneItem && splPhoneItem.phoneCountryControl === splPhoneCode);
  ok("Live SPL-SELECT commits India +91 before the number",
    await srSplPhone.JAF.adapterBase.applyItemAsync(splPhoneItem) === true
      && splPhoneCode.getAttribute("data-country-code") === "IN"
      && /India|\+91/.test(splPhoneCode.textContent)
      && splPhone.value === "09800453709"
      && !srSplPhoneRoot.querySelector("#spl-form-element_12-menu"));

  // In the live form the number input is inside SPL-PHONE-FIELD's shadow root,
  // while SPL-SELECT is a sibling of that host. A parentElement-only climb
  // stops at the shadow boundary and misses the code trigger entirely.
  const srBoundaryPhone = winAt("<div id='sr-boundary-phone-host'></div>",
    "https://jobs.smartrecruiters.com/oneclick-ui/company/ServiceNow/publication/spl-phone-boundary");
  const srBoundaryRoot = srBoundaryPhone.document.getElementById("sr-boundary-phone-host").attachShadow({ mode: "open" });
  srBoundaryRoot.innerHTML =
    '<div id="boundary-phone-group"><spl-phone-field id="spl-form-element_5"></spl-phone-field>' +
      '<spl-select id="spl-form-element_12"></spl-select></div>';
  const boundaryPhoneField = srBoundaryRoot.querySelector("#spl-form-element_5");
  const boundaryPhoneRoot = boundaryPhoneField.attachShadow({ mode: "open" });
  boundaryPhoneRoot.innerHTML = '<input id="spl-form-element_5" type="tel" aria-label="Phone number">';
  const boundaryPhone = boundaryPhoneRoot.querySelector("#spl-form-element_5");
  const boundaryCode = srBoundaryRoot.querySelector("#spl-form-element_12");
  boundaryCode.addEventListener("click", () => {
    if (srBoundaryRoot.querySelector("#spl-form-element_12-menu")) return;
    const menu = srBoundaryPhone.document.createElement("div");
    menu.id = "spl-form-element_12-menu";
    menu.setAttribute("role", "listbox");
    const row = srBoundaryPhone.document.createElement("spl-select-option");
    row.setAttribute("value", "in");
    const renderer = srBoundaryPhone.document.createElement("div");
    renderer.className = "c-spl-autocomplete-option-content";
    renderer.textContent = "India +91";
    renderer.addEventListener("click", () => {
      boundaryCode.textContent = "India +91";
      boundaryCode.setAttribute("data-country-code", "IN");
      menu.remove();
    });
    row.appendChild(renderer);
    menu.appendChild(row);
    srBoundaryRoot.appendChild(menu);
  });
  boundaryPhone.addEventListener("input", () => { boundaryPhone.value = String(boundaryPhone.value).replace(/\D/g, ""); });
  const boundaryPhoneItem = fieldOf(adapter(srBoundaryPhone, "generic").plan({ country: "India", phone: "0980 045 3709" }), "phone");
  ok("Phone code is found across SPL-PHONE-FIELD shadow boundary",
    boundaryPhoneItem && boundaryPhoneItem.phoneCountryControl === boundaryCode);
  ok("Phone code commits across SPL-PHONE-FIELD shadow boundary",
    await srBoundaryPhone.JAF.adapterBase.applyItemAsync(boundaryPhoneItem) === true
      && boundaryCode.getAttribute("data-country-code") === "IN"
      && /India|\+91/.test(boundaryCode.textContent)
      && boundaryPhone.value === "09800453709"
      && !srBoundaryRoot.querySelector("#spl-form-element_12-menu"));

  // The production SPL-SELECT host wraps its trigger in an internal button,
  // and each option wraps its handler in an internal SPL-DROPDOWN-ITEM. The
  // custom-element hosts themselves are present but are not action targets.
  const srInternalSelect = winAt("<div id='sr-internal-select-host'></div>",
    "https://jobs.smartrecruiters.com/oneclick-ui/company/ServiceNow/publication/internal-select");
  const srInternalRoot = srInternalSelect.document.getElementById("sr-internal-select-host").attachShadow({ mode: "open" });
  srInternalRoot.innerHTML =
    '<label>Phone number<div id="internal-phone-group"><spl-select id="spl-form-element_12"></spl-select>' +
      '<input id="spl-form-element_5" type="tel" aria-label="Phone number"></div></label>';
  const internalCode = srInternalRoot.querySelector("#spl-form-element_12");
  const internalPhone = srInternalRoot.querySelector("#spl-form-element_5");
  const internalCodeRoot = internalCode.attachShadow({ mode: "open" });
  const internalButton = srInternalSelect.document.createElement("button");
  internalButton.setAttribute("role", "combobox");
  internalButton.id = "spl-form-element_12";
  internalCodeRoot.appendChild(internalButton);
  internalButton.addEventListener("click", () => {
    internalButton.setAttribute("aria-expanded", "true");
    if (srInternalRoot.querySelector("#spl-form-element_12-menu")) return;
    const menu = srInternalSelect.document.createElement("div");
    menu.id = "spl-form-element_12-menu";
    menu.setAttribute("role", "listbox");
    const row = srInternalSelect.document.createElement("spl-select-option");
    row.setAttribute("value", "IN");
    row.textContent = "India +91";
    const rowRoot = row.attachShadow({ mode: "open" });
    const item = srInternalSelect.document.createElement("spl-dropdown-item");
    rowRoot.appendChild(item);
    item.addEventListener("click", () => {
      internalCode.value = "IN";
      internalCode.textContent = "India +91";
      internalButton.setAttribute("aria-expanded", "false");
      menu.remove();
    });
    menu.appendChild(row);
    srInternalRoot.appendChild(menu);
  });
  internalPhone.addEventListener("input", () => { internalPhone.value = String(internalPhone.value).replace(/\D/g, ""); });
  const internalPhoneItem = fieldOf(adapter(srInternalSelect, "generic").plan({ country: "India", phone: "0980 045 3709" }), "phone");
  const internalApplied = await srInternalSelect.JAF.adapterBase.applyItemAsync(internalPhoneItem);
  const internalState = {
    applied: internalApplied,
    hasCodeControl: internalPhoneItem && internalPhoneItem.phoneCountryControl === internalCode,
    codeValue: internalCode.value,
    codeText: internalCode.textContent,
    phone: internalPhone.value,
    menu: !!srInternalRoot.querySelector("#spl-form-element_12-menu"),
  };
  ok("SPL-SELECT uses its internal combobox trigger and option action",
    internalApplied === true
      && internalCode.value === "IN"
      && /India|\+91/.test(internalCode.textContent)
      && internalPhone.value === "09800453709"
      && !internalState.menu, JSON.stringify(internalState));

  // The production component adds another boundary around the option row:
  // spl-select-option -> spl-dropdown-item -> internal [role=option]. The
  // selection contract belongs to the custom-element host, not the deepest
  // ARIA node. Clicking only that node leaves the typed value and menu state
  // out of sync, exactly as on the live SmartRecruiters form.
  const srShadowOption = winAt("<div id='sr-shadow-option-host'></div>",
    "https://jobs.smartrecruiters.com/oneclick-ui/company/ServiceNow/publication/shadow-option");
  const srShadowOptionRoot = srShadowOption.document.getElementById("sr-shadow-option-host").attachShadow({ mode: "open" });
  srShadowOptionRoot.innerHTML =
    '<label>Country/Region<input id="shadow-country" role="combobox" aria-label="Country/Region" aria-controls="shadow-country-menu" aria-expanded="true" value="India"></label>' +
    '<div id="shadow-country-menu" role="listbox"></div>';
  const shadowCountry = srShadowOptionRoot.querySelector("#shadow-country");
  const shadowMenu = srShadowOptionRoot.querySelector("#shadow-country-menu");
  const shadowOptionHost = srShadowOption.document.createElement("spl-select-option");
  shadowOptionHost.setAttribute("value", "in");
  const shadowOptionRoot = shadowOptionHost.attachShadow({ mode: "open" });
  const shadowDropdownItem = srShadowOption.document.createElement("spl-dropdown-item");
  const shadowDropdownRoot = shadowDropdownItem.attachShadow({ mode: "open" });
  const shadowOption = srShadowOption.document.createElement("div");
  shadowOption.setAttribute("role", "option");
  shadowOption.textContent = "India";
  shadowDropdownRoot.appendChild(shadowOption);
  shadowOptionRoot.appendChild(shadowDropdownItem);
  shadowMenu.appendChild(shadowOptionHost);
  shadowDropdownItem.addEventListener("click", (event) => {
    if (event.composedPath()[0] !== shadowDropdownItem) return;
    shadowCountry.value = "India";
    shadowCountry.setAttribute("aria-expanded", "false");
    shadowMenu.remove();
  });
  ok("SmartRecruiters shadow option clicks its action host",
    await srShadowOption.JAF.adapterBase.selectCustom(shadowCountry, "India", { field: "country" }) === true
      && shadowCountry.getAttribute("aria-expanded") === "false"
      && !srShadowOptionRoot.querySelector("#shadow-country-menu"));

  // The live country menu also exposes the option as a custom-element host
  // with no [role=option] descendant visible to page JavaScript. The host
  // itself is the selectable row and must be included in option discovery.
  const srHostOption = winAt("<div id='sr-host-option'></div>",
    "https://jobs.smartrecruiters.com/oneclick-ui/company/ServiceNow/publication/host-option");
  const srHostOptionRoot = srHostOption.document.getElementById("sr-host-option").attachShadow({ mode: "open" });
  srHostOptionRoot.innerHTML =
    '<label>Country/Region<input id="host-country" role="combobox" aria-label="Country/Region" aria-controls="host-country-menu" aria-expanded="true" value="India"></label>' +
    '<div id="host-country-menu" role="listbox"></div>';
  const hostCountry = srHostOptionRoot.querySelector("#host-country");
  const hostMenu = srHostOptionRoot.querySelector("#host-country-menu");
  const hostOption = srHostOption.document.createElement("spl-select-option");
  hostOption.setAttribute("value", "in");
  hostOption.textContent = "India";
  hostMenu.appendChild(hostOption);
  hostOption.addEventListener("click", () => {
    hostCountry.value = "India";
    hostCountry.setAttribute("aria-expanded", "false");
    hostMenu.remove();
  });
  ok("SmartRecruiters custom option host is discoverable",
    await srHostOption.JAF.adapterBase.selectCustom(hostCountry, "India", { field: "country" }) === true
      && hostCountry.getAttribute("aria-expanded") === "false"
      && !srHostOptionRoot.querySelector("#host-country-menu"));

  // The live host also contains a rendered action child. Clicking the custom
  // host alone can close the menu using its current highlight (British Indian
  // Ocean Territory); the exact India renderer must receive the click.
  const srRenderedOption = winAt("<div id='sr-rendered-option'></div>",
    "https://jobs.smartrecruiters.com/oneclick-ui/company/ServiceNow/publication/rendered-option");
  const srRenderedRoot = srRenderedOption.document.getElementById("sr-rendered-option").attachShadow({ mode: "open" });
  srRenderedRoot.innerHTML =
    '<label>Country/Region<input id="rendered-country" role="combobox" aria-label="Country/Region" aria-controls="rendered-country-menu" aria-expanded="true" value="India"></label>' +
    '<div id="rendered-country-menu" role="listbox"></div>';
  const renderedCountry = srRenderedRoot.querySelector("#rendered-country");
  const renderedMenu = srRenderedRoot.querySelector("#rendered-country-menu");
  const renderedOption = (value, text) => {
    const host = srRenderedOption.document.createElement("spl-select-option");
    host.setAttribute("value", value);
    host.setAttribute("data-sr-id", `location-autocomplete-country-option-${value}`);
    const child = srRenderedOption.document.createElement("div");
    child.className = "c-spl-autocomplete-option-content";
    child.textContent = text;
    host.appendChild(child);
    child.addEventListener("click", () => {
      renderedCountry.value = text;
      renderedCountry.setAttribute("aria-expanded", "false");
      renderedMenu.remove();
    });
    renderedMenu.appendChild(host);
    return { host, child };
  };
  const renderedOcean = renderedOption("io", "British Indian Ocean Territory");
  const renderedIndia = renderedOption("in", "India");
  ok("SmartRecruiters rendered child wins exact India over Indian Ocean",
    await srRenderedOption.JAF.adapterBase.selectCustom(renderedCountry, "India", { field: "country" }) === true
      && renderedCountry.value === "India"
      && renderedCountry.getAttribute("aria-expanded") === "false"
      && !srRenderedRoot.querySelector("#rendered-country-menu")
      && renderedOcean.host.isConnected === false
      && renderedIndia.child.isConnected === false);

  // SmartRecruiters can mount Country/Region only after its City autocomplete
  // commits. The first review snapshot therefore cannot contain that field;
  // the fill must reconcile it once the dependent control appears.
  const srLateCountry = winAt("<div id='sr-late-host'></div>", "https://jobs.smartrecruiters.com/oneclick-ui/company/ServiceNow/publication/test");
  const srLateRoot = srLateCountry.document.getElementById("sr-late-host").attachShadow({ mode: "open" });
  srLateRoot.innerHTML =
    '<label>City<input id="late-city" role="combobox" aria-label="City" aria-controls="late-city-options" aria-expanded="true"></label>' +
    '<ul id="late-city-options" role="listbox"><li role="option">JALPAIGURI</li></ul>' +
    '<label>Phone number<div><button id="late-phone-code" type="button" role="combobox" aria-label="Country code" aria-expanded="false">+1</button>' +
      '<input id="late-phone" type="tel" aria-label="Phone number"></div></label>';
  const lateCity = srLateRoot.querySelector("#late-city");
  const lateCityOptions = srLateRoot.querySelector("#late-city-options");
  const lateCityOption = lateCityOptions.querySelector('[role="option"]');
  lateCityOption.addEventListener("click", () => {
    lateCity.value = "JALPAIGURI";
    lateCity.setAttribute("aria-expanded", "false");
    lateCityOptions.remove();
    const countryLabel = srLateCountry.document.createElement("label");
    countryLabel.innerHTML = '<span>Country/Region</span><input id="late-country" role="combobox" aria-label="Country/Region" aria-expanded="false" value="United States">';
    srLateRoot.appendChild(countryLabel);
    const country = countryLabel.querySelector("#late-country");
    country.addEventListener("click", () => {
      if (srLateRoot.querySelector("#late-country-options")) return;
      const list = srLateCountry.document.createElement("ul");
      list.id = "late-country-options";
      list.setAttribute("role", "listbox");
      const option = srLateCountry.document.createElement("li");
      option.setAttribute("role", "option");
      option.textContent = "India";
      option.addEventListener("click", () => { country.value = "India"; country.setAttribute("aria-expanded", "false"); list.remove(); });
      list.appendChild(option);
      srLateRoot.appendChild(list);
    });
  });
  const latePhoneCode = srLateRoot.querySelector("#late-phone-code");
  latePhoneCode.addEventListener("click", () => {
    if (srLateRoot.querySelector("#late-phone-options")) return;
    const list = srLateCountry.document.createElement("ul");
    list.id = "late-phone-options";
    list.setAttribute("role", "listbox");
    const option = srLateCountry.document.createElement("li");
    option.setAttribute("role", "option");
    option.textContent = "India (+91)";
    option.addEventListener("click", () => { latePhoneCode.textContent = "India (+91)"; latePhoneCode.setAttribute("data-country-code", "IN"); list.remove(); });
    list.appendChild(option);
    srLateRoot.appendChild(list);
  });
  const latePhone = srLateRoot.querySelector("#late-phone");
  latePhone.addEventListener("input", () => { latePhone.value = String(latePhone.value).replace(/\D/g, ""); });
  await srLateCountry.JAF.filler.start({ city: "JALPAIGURI", country: "India", phone: "0980 045 3709" }, null,
    { assist: false, mapFields: false, autoAddRows: false });
  const lateHost = srLateCountry.document.getElementById("__jaf_host");
  ok("Late Country/Region is absent from the first review plan", !lateHost.shadowRoot.textContent.includes("Country/Region"));
  lateHost.shadowRoot.querySelector("#fill").click();
  await new Promise((resolve) => {
    const deadline = Date.now() + 7000;
    const poll = () => {
      const country = srLateRoot.querySelector("#late-country");
      if ((country && country.value === "India") || Date.now() >= deadline) return resolve();
      setTimeout(poll, 50);
    };
    poll();
  });
  ok("Late SmartRecruiters Country/Region is filled after City commits",
    srLateRoot.querySelector("#late-country") && srLateRoot.querySelector("#late-country").value === "India");

  // The field can also be present in the first plan and then be reset by the
  // City commit. Reconciliation must still restore both country and dial code.
  const srReset = winAt("<div id='sr-reset-host'></div>", "https://jobs.smartrecruiters.com/oneclick-ui/company/ServiceNow/publication/reset-after-city");
  const srResetRoot = srReset.document.getElementById("sr-reset-host").attachShadow({ mode: "open" });
  srResetRoot.innerHTML =
    '<label>Country/Region<input id="reset-country" role="combobox" aria-label="Country/Region" aria-expanded="false" value="United States"></label>' +
    '<label>City<input id="reset-city" role="combobox" aria-label="City" aria-controls="reset-city-options" aria-expanded="true"></label>' +
    '<ul id="reset-city-options" role="listbox"><li role="option">JALPAIGURI</li></ul>' +
    '<label>Phone number<div><button id="reset-phone-code" type="button" role="combobox" aria-label="Country code" aria-expanded="false">+1</button>' +
      '<input id="reset-phone" type="tel" aria-label="Phone number"></div></label>';
  const resetCountry = srResetRoot.querySelector("#reset-country");
  const resetCity = srResetRoot.querySelector("#reset-city");
  const resetCityOptions = srResetRoot.querySelector("#reset-city-options");
  const resetCode = srResetRoot.querySelector("#reset-phone-code");
  const resetPhone = srResetRoot.querySelector("#reset-phone");
  resetCountry.addEventListener("click", () => {
    if (srResetRoot.querySelector("#reset-country-options")) return;
    const list = srReset.document.createElement("ul");
    list.id = "reset-country-options";
    list.setAttribute("role", "listbox");
    const option = srReset.document.createElement("li");
    option.setAttribute("role", "option");
    option.textContent = "India";
    option.addEventListener("click", () => { resetCountry.value = "India"; resetCountry.setAttribute("aria-expanded", "false"); list.remove(); });
    list.appendChild(option);
    srResetRoot.appendChild(list);
    resetCountry.setAttribute("aria-expanded", "true");
  });
  resetCityOptions.querySelector('[role="option"]').addEventListener("click", () => {
    resetCity.value = "JALPAIGURI";
    resetCity.setAttribute("aria-expanded", "false");
    resetCityOptions.remove();
    // This models the real delayed SmartRecruiters remount: location state
    // settles first, then the default country/code is restored asynchronously.
    setTimeout(() => {
      resetCountry.value = "United States";
      resetCode.textContent = "";
      resetCode.removeAttribute("data-country-code");
    }, 1100);
  });
  resetCode.addEventListener("click", () => {
    if (srResetRoot.querySelector("#reset-code-options")) return;
    const list = srReset.document.createElement("ul");
    list.id = "reset-code-options";
    list.setAttribute("role", "listbox");
    const option = srReset.document.createElement("li");
    option.setAttribute("role", "option");
    option.textContent = "India (+91)";
    option.addEventListener("click", () => { resetCode.textContent = "India (+91)"; resetCode.setAttribute("data-country-code", "IN"); list.remove(); });
    list.appendChild(option);
    srResetRoot.appendChild(list);
    resetCode.setAttribute("aria-expanded", "true");
  });
  resetPhone.addEventListener("input", () => {
    resetPhone.value = String(resetPhone.value).replace(/\D/g, "");
  });
  await srReset.JAF.filler.start({ city: "JALPAIGURI", country: "India", phone: "0980 045 3709" }, null,
    { assist: false, mapFields: false, autoAddRows: false });
  const resetHost = srReset.document.getElementById("__jaf_host");
  ok("Reset case includes Country/Region in the initial plan", resetHost.shadowRoot.textContent.includes("Country/Region"));
  resetHost.shadowRoot.querySelector("#fill").click();
  await new Promise((resolve) => {
    const deadline = Date.now() + 5000;
    const poll = () => {
      const codeReady = /India|\+91/.test(resetCode.textContent);
      if (resetCountry.value === "India" && codeReady && resetPhone.value === "09800453709") return resolve();
      if (Date.now() >= deadline) return resolve();
      setTimeout(poll, 50);
    };
    poll();
  });
  ok("Reset case restores country after City resets it", resetCountry.value === "India");
  ok("Reset case restores India phone code and number", /India|\+91/.test(resetCode.textContent) && resetPhone.value === "09800453709");

  /* ---- BUG-5 follow-up: SmartRecruiters replaces a shadow combo after selection ---- */
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

  /* ---- BUG-8: invalid legacy HTML pattern must not poison verification ---- */
  // Lever/Rover ships an email pattern that is valid under the old regex mode
  // but invalid under Chromium's HTML `pattern` v-mode because of its character
  // class. Accessing input.validity on that element logs a browser warning.
  const invalidPattern = win('<label>Email<input id="lever-pattern-email" type="email"></label>');
  const invalidPatternEmail = invalidPattern.document.getElementById("lever-pattern-email");
  invalidPatternEmail.setAttribute("pattern", "[a-zA-Z0-9.!#$%&'*+\\/=?^_`{|}~-]+@[a-zA-Z0-9.-]+");
  invalidPatternEmail.value = "ada@example.com";
  let validityReads = 0;
  Object.defineProperty(invalidPatternEmail, "validity", {
    configurable: true,
    get() { validityReads++; throw new SyntaxError("invalid v-mode pattern"); },
  });
  const invalidPatternItem = { el: invalidPatternEmail, field: "email", kind: "text", value: invalidPatternEmail.value };
  ok("BUG8 invalid Lever pattern is skipped without reading ValidityState",
    invalidPattern.JAF.adapterBase.verifyItem(invalidPatternItem, invalidPatternItem.value) === true && validityReads === 0,
    "validity reads: " + validityReads);

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
    // SmartRecruiters parses the uploaded résumé after the file event and can
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
  ok("BUG2 Lever location is applied as an autocomplete", locItem && locItem.kind === "combo");

  // Live Lever inputs can omit combobox ARIA until the first interaction. The
  // dedicated adapter must still use the option-commit path in that case.
  const lvCombo = win('<form class="application-form"><input name="location"></form>');
  const lvLocation = lvCombo.document.querySelector('input[name="location"]');
  lvLocation.addEventListener("click", () => {
    if (lvCombo.document.querySelector(".dropdown-results .location-result")) return;
    lvCombo.document.body.insertAdjacentHTML("beforeend",
      '<div class="dropdown-results"><div class="location-result">San Francisco</div></div>');
    const option = lvCombo.document.querySelector(".dropdown-results .location-result");
    option.addEventListener("click", () => {
      lvLocation.value = "San Francisco";
      option.parentElement.remove();
    });
  });
  const liveLocationItem = adapter(lvCombo, "lever").plan({ city: "San Francisco" })
    .find((i) => i.el === lvLocation);
  const locationApplied = await lvCombo.JAF.adapterBase.applyItemAsync(liveLocationItem);
  ok("BUG2 Lever location commits the matching autocomplete option",
    locationApplied && lvLocation.value === "San Francisco" && !lvCombo.document.querySelector(".dropdown-results .location-result"));

  console.log(`\n[qa_fixes] ${pass} passed, ${fail} failed`);
  if (fails.length) { fails.forEach((f) => console.log("  x " + f)); process.exit(1); }
  console.log("[qa_fixes] All green.");
})();
