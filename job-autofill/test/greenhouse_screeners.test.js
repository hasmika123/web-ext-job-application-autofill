/* greenhouse_screeners.test.js — Greenhouse React-select and screening gaps.
 *
 * These fixtures mirror the Figma-shaped Greenhouse application form observed in
 * the no-submit QA run. They cover the seam between generic label matching,
 * custom-combobox classification, option commitment, and the local answer cache.
 * Run: node test/greenhouse_screeners.test.js (from job-autofill/)
 */
const { makeWindow, load, loadCore } = require("./harness");

let pass = 0, fail = 0;
const failures = [];
const tag = "[greenhouse_screeners]";
function ok(name, condition, extra) {
  if (condition) pass++;
  else failures.push(name + (extra ? "  ->  " + extra : ""));
  if (!condition) fail++;
}

const SRC = [
  "src/lib/field-map.js",
  "src/lib/field-cache.js",
  "src/content/adapters/generic.js",
  "src/content/assist.js",
];

function page(html) {
  const w = makeWindow(html, { url: "https://job-boards.greenhouse.io/figma/jobs/6233043004" });
  loadCore(w);
  SRC.forEach((p) => load(w, p));
  return w;
}

function combo(id, label) {
  return `<label id="${id}-label">${label} *</label>
    <div class="select__control" id="${id}-control">
      <div class="select__value-container"><div class="select__placeholder">Select...</div>
        <div class="select__input-container"><input id="${id}" role="combobox" aria-required="true" aria-labelledby="${id}-label" value=""></div>
      </div>
    </div>`;
}

/* The empty Greenhouse input initially exposes role=combobox but no aria-controls/expanded. */
(function scannerAndPlan() {
  const w = page(`<body><form>
    ${combo("country", "Country")}
    ${combo("auth", "Are you authorized to work in the country for which you applied?")}
    <label for="why">Why do you want to join Figma? *</label><textarea id="why"></textarea>
    <label id="worked-label">Have you ever worked for Figma before, as an employee or a contractor/consultant? *</label>
    <div class="select__control"><div class="select__value-container"><div class="select__placeholder">Select...</div>
      <div class="select__input-container"><input id="worked" role="combobox" aria-required="true" aria-labelledby="worked-label" value=""></div>
    </div></div>
  </form></body>`);
  const B = w.JAF.adapterBase;
  const found = B.scanGeneric(w.document);
  const byId = (id) => found.find((item) => item.el && item.el.id === id);
  const country = byId("country");
  const auth = byId("auth");
  const why = byId("why");

  ok("scanner: Country is recognized", country && country.field === "country", JSON.stringify(country));
  ok("scanner: authorization question maps to authorizedToWork", auth && auth.field === "authorizedToWork", JSON.stringify(auth));
  ok("scanner: Why question maps to coverLetter", why && why.field === "coverLetter", JSON.stringify(why));
  ok("scanner: empty Greenhouse role combobox is not plain text", country && country.kind === "combo", country && country.kind);
  ok("scanner: authorization combobox is not plain text", auth && auth.kind === "combo", auth && auth.kind);

  const items = w.JAF.genericAdapter.plan({ country: "United States", authorizedToWork: "Yes" });
  const countryItem = items.find((item) => item.field === "country");
  ok("plan: country remains a custom-combo item", countryItem && countryItem.kind === "combo", JSON.stringify(countryItem));
  ok("plan: country carries safe display-name alternatives", countryItem && countryItem.alts && countryItem.alts.includes("United States of America"), JSON.stringify(countryItem && countryItem.alts));
  ok("plan: unanswered open text is not invented", !items.some((item) => item.el && item.el.id === "why"));
  ok("plan: unsupported company-history answer is not guessed", !items.some((item) => item.el && item.el.id === "worked"));
})();

/* Classification must reach selectCustom so Greenhouse commits the option, not just typed text. */
const customComboCommitPromise = (async function customComboCommit() {
  const w = page(`<body><form>
    ${combo("auth", "Are you authorized to work in the country for which you applied?")}
    <div id="auth-options" role="listbox" hidden><div id="auth-yes" role="option">Yes</div><div role="option">No</div></div>
  </form></body>`);
  const input = w.document.getElementById("auth");
  const control = w.document.getElementById("auth-control");
  const list = w.document.getElementById("auth-options");
  input.addEventListener("input", () => { list.hidden = false; });
  w.document.getElementById("auth-yes").addEventListener("click", () => {
    control.querySelector(".select__placeholder")?.remove();
    const chosen = w.document.createElement("div");
    chosen.className = "select__single-value";
    chosen.textContent = "Yes";
    control.querySelector(".select__value-container").prepend(chosen);
    input.setAttribute("aria-expanded", "false");
    list.hidden = true;
  });
  const item = w.JAF.genericAdapter.plan({ authorizedToWork: "Yes" }).find((candidate) => candidate.field === "authorizedToWork");
  const applied = item && await w.JAF.adapterBase.applyItemAsync(item);
  ok("fill: Greenhouse authorization option is actually committed", applied === true && control.querySelector(".select__single-value")?.textContent === "Yes", JSON.stringify({ applied, item: item && item.kind, control: control.textContent }));
})();

/* Greenhouse's country option may append the phone dial code to the visible label. */
const countryComboSuffixPromise = (async function countryComboSuffix() {
  const w = page(`<body><form>
    ${combo("country", "Country")}
    <div id="country-options" role="listbox" hidden><div id="country-us" role="option">United States +1</div><div role="option">Canada +1</div></div>
  </form></body>`);
  const input = w.document.getElementById("country");
  const control = w.document.getElementById("country-control");
  const list = w.document.getElementById("country-options");
  input.addEventListener("input", () => { list.hidden = false; });
  w.document.getElementById("country-us").addEventListener("click", () => {
    control.querySelector(".select__placeholder")?.remove();
    const chosen = w.document.createElement("div");
    chosen.className = "select__single-value";
    chosen.textContent = "United States +1";
    control.querySelector(".select__value-container").prepend(chosen);
    input.value = "";
    input.setAttribute("aria-expanded", "false");
    list.hidden = true;
  });
  const item = w.JAF.genericAdapter.plan({ country: "United States" }).find((candidate) => candidate.field === "country");
  const applied = item && await w.JAF.adapterBase.applyItemAsync(item);
  ok("country: a +1 display suffix still counts as the selected country", applied === true && w.JAF.adapterBase.verifyItem(item, "United States") === true && control.querySelector(".select__single-value")?.textContent === "United States +1", JSON.stringify({ applied, item: item && item.kind, control: control.textContent }));

  // The live Greenhouse country widget can leave the trigger input at "+91"
  // while the selected country is shown beside it as "India +91".
  const india = page(`<body><div class="select__control" id="india-control">
    <div class="select__value-container"><div class="select__single-value">India +91</div>
      <div class="select__input-container"><input id="india" role="combobox" value="+91"></div>
    </div></div></body>`);
  const indiaInput = india.document.getElementById("india");
  const indiaItem = { el: indiaInput, field: "country", kind: "combo", value: "India", label: "Country" };
  ok("country: a dial-code trigger value does not hide the selected country", india.JAF.adapterBase.verifyItem(indiaItem, "India") === true, JSON.stringify({ actual: indiaInput.value, control: india.document.getElementById("india-control").textContent }));

  // Some Greenhouse country widgets render only the flag and dial code in the
  // selected value. The flag class is the only country identity left in the DOM.
  const indiaFlag = page(`<body><div class="phone-country__control" id="india-flag-control">
    <span class="flag-icon flag-icon-in" aria-hidden="true"></span><span class="dial-code">+91</span>
    <input id="india-flag" role="combobox" value="+91">
  </div></body>`);
  const indiaFlagInput = indiaFlag.document.getElementById("india-flag");
  const indiaFlagItem = { el: indiaFlagInput, field: "country", kind: "combo", value: "India", label: "Country" };
  ok("country: India flag metadata confirms a +91 trigger", indiaFlag.JAF.adapterBase.verifyItem(indiaFlagItem, "India") === true, JSON.stringify({ actual: indiaFlagInput.value, control: indiaFlag.document.getElementById("india-flag-control").innerHTML }));

  // The real failure happens after the option click: Greenhouse commits +91
  // and closes the menu without retaining the option's country name in text.
  const indiaFlow = page(`<body><div class="select__control" id="india-flow-control">
    <div class="select__input-container"><input id="india-flow" role="combobox" value="" aria-expanded="true"></div>
  </div><div id="india-flow-options" role="listbox"><div id="india-flow-option" role="option">India</div></div></body>`);
  const indiaFlowInput = indiaFlow.document.getElementById("india-flow");
  const indiaFlowList = indiaFlow.document.getElementById("india-flow-options");
  indiaFlowInput.addEventListener("input", () => { indiaFlowList.hidden = false; });
  indiaFlow.document.getElementById("india-flow-option").addEventListener("click", () => {
    indiaFlowInput.value = "+91";
    indiaFlowInput.setAttribute("aria-expanded", "false");
    indiaFlowList.hidden = true;
  });
  const indiaFlowItem = { el: indiaFlowInput, field: "country", kind: "combo", value: "India", label: "Country" };
  const indiaFlowApplied = await indiaFlow.JAF.adapterBase.applyItemAsync(indiaFlowItem);
  ok("country: option click committing only +91 is still verified", indiaFlowApplied === true && indiaFlow.JAF.adapterBase.verifyItem(indiaFlowItem, "India") === true, JSON.stringify({ applied: indiaFlowApplied, actual: indiaFlowInput.value }));
})();

/* A previously confirmed answer is safe to reuse locally even when AI is off. */
const cachedScreenersPromise = (async function cachedScreeners() {
  const w = page(`<body><form>
    <label id="why-label">Why do you want to join Figma? *</label><textarea id="why" aria-labelledby="why-label"></textarea>
    <label id="worked-label">Have you ever worked for Figma before, as an employee or a contractor/consultant? *</label>
    <div class="select__control"><div class="select__value-container"><div class="select__placeholder">Select...</div>
      <div class="select__input-container"><input id="worked" role="combobox" aria-required="true" aria-labelledby="worked-label" value=""></div>
    </div></div>
    <div id="react-select-worked-listbox" role="listbox" hidden><div role="option">Yes</div><div id="worked-no" role="option">No</div></div>
  </form></body>`);
  const input = w.document.getElementById("worked");
  const list = w.document.getElementById("react-select-worked-listbox");
  input.addEventListener("keydown", (event) => { if (event.key === "ArrowDown") list.hidden = false; if (event.key === "Escape") list.hidden = true; });
  input.addEventListener("input", () => { list.hidden = false; });
  w.document.getElementById("worked-no").addEventListener("click", () => {
    const control = input.closest(".select__control");
    control.querySelector(".select__placeholder")?.remove();
    const chosen = w.document.createElement("div");
    chosen.className = "select__single-value";
    chosen.textContent = "No";
    control.querySelector(".select__value-container").prepend(chosen);
    input.setAttribute("aria-expanded", "false");
    list.hidden = true;
  });
  w.JAF.fieldCache.setProfile("ada@example.com");
  await w.JAF.fieldCache.remember({ field: "coverLetter", label: "Why do you want to join Figma? *", kind: "textarea" }, "I want to build tools that make complex work clearer.");
  await w.JAF.fieldCache.remember({ field: "", label: "Have you ever worked for Figma before, as an employee or a contractor/consultant? *", kind: "combo" }, "No");
  w.chrome.runtime.sendMessage = () => { throw new Error("cached answers must not call AI"); };
  const items = await w.JAF.assist.run([], { email: "ada@example.com" });
  const why = items.find((item) => item.el && item.el.id === "why");
  const worked = items.find((item) => item.el && item.el.id === "worked");
  ok("cache: open-ended answer is reusable without AI", why && why.value.startsWith("I want to build") && why.cached === true, JSON.stringify(why));
  ok("cache: company-history answer is reusable without AI", worked && worked.value === "No" && worked.cached === true, JSON.stringify(worked));
})();

/* With no deterministic or AI answer, the first manual answer becomes a local cache entry. */
const manualLearningPromise = (async function manualLearning() {
  const w = page(`<body><form>
    <label id="why-label">Why do you want to join Figma? *</label><textarea id="why" aria-labelledby="why-label"></textarea>
    <label id="worked-label">Have you ever worked for Figma before, as an employee or a contractor/consultant? *</label>
    <div class="select__control"><div class="select__value-container"><div class="select__placeholder">Select...</div>
      <div class="select__input-container"><input id="worked" role="combobox" aria-required="true" aria-labelledby="worked-label" value=""></div>
    </div></div>
    <div id="react-select-worked-listbox" role="listbox" hidden><div role="option">Yes</div><div id="worked-no" role="option">No</div></div>
  </form></body>`);
  const input = w.document.getElementById("worked");
  const list = w.document.getElementById("react-select-worked-listbox");
  input.addEventListener("keydown", (event) => { if (event.key === "ArrowDown") list.hidden = false; if (event.key === "Escape") list.hidden = true; });
  input.addEventListener("input", () => { list.hidden = false; });
  w.chrome.runtime.sendMessage = (message, callback) => callback({ disabled: true });
  await w.JAF.assist.run([], { email: "ada@example.com" });
  const why = w.document.getElementById("why");
  why.value = "I want to make complex work clearer.";
  why.dispatchEvent(new w.Event("change", { bubbles: true }));
  const worked = w.document.getElementById("worked");
  const control = worked.closest(".select__control");
  control.querySelector(".select__placeholder").remove();
  const chosen = w.document.createElement("div");
  chosen.className = "select__single-value";
  chosen.textContent = "No";
  control.querySelector(".select__value-container").prepend(chosen);
  worked.dispatchEvent(new w.Event("blur", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  const savedWhy = await w.JAF.fieldCache.get({ field: "coverLetter", label: "Why do you want to join Figma? *", kind: "textarea" });
  const savedWorked = await w.JAF.fieldCache.get({ field: "", label: "Have you ever worked for Figma before, as an employee or a contractor/consultant? *", kind: "combo" });
  ok("learn: first manual motivation answer is cached locally", savedWhy === "I want to make complex work clearer.", savedWhy);
  ok("learn: first manual company-history answer is cached locally", savedWorked === "No", savedWorked);
})();

function report() {
  console.log(`${tag} ${pass} passed, ${fail} failed`);
  if (failures.length) { console.log(`${tag} Failures:`); failures.forEach((item) => console.log("  x " + item)); process.exit(1); }
  console.log(`${tag} All green.`);
}

Promise.all([customComboCommitPromise, countryComboSuffixPromise, cachedScreenersPromise, manualLearningPromise]).then(report).catch((error) => {
  failures.push("async run threw -> " + (error && error.stack || error));
  fail++;
  report();
});
