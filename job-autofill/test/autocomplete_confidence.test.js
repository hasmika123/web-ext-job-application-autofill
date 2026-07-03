/* autocomplete_confidence.test.js — the W3C `autocomplete` token signal in the
 * generic scanner (+ the host distrust list from the ruleset).
 * Run:  node test/autocomplete_confidence.test.js   (from job-autofill/)
 */
const { makeWindow, loadCore } = require("./harness");

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) pass++;
  else { fail++; fails.push(name + (extra ? "  ->  " + extra : "")); }
}
const tag = "[autocomplete]";

const GH_URL = "https://job-boards.greenhouse.io/acme/jobs/123";

/* ------------------------------------ token → canonical field mapping */
(function tokenMap() {
  const w = makeWindow("<body></body>", { url: GH_URL });
  loadCore(w);
  const B = w.JAF.adapterBase;
  const mk = (ac) => {
    const i = w.document.createElement("input");
    if (ac != null) i.setAttribute("autocomplete", ac);
    return i;
  };
  ok("token: given-name -> firstName", B.autocompleteField(mk("given-name")) === "firstName");
  ok("token: family-name -> lastName", B.autocompleteField(mk("family-name")) === "lastName");
  ok("token: email -> email", B.autocompleteField(mk("email")) === "email");
  ok("token: tel -> phone", B.autocompleteField(mk("tel")) === "phone");
  ok("token: postal-code -> postalCode", B.autocompleteField(mk("postal-code")) === "postalCode");
  ok("token: section+prefix list resolves last token", B.autocompleteField(mk("shipping address-line1")) === "addressLine1");
  ok("token: 'on' is not a field", B.autocompleteField(mk("on")) === null);
  ok("token: 'off' is not a field", B.autocompleteField(mk("off")) === null);
  ok("token: missing attribute", B.autocompleteField(mk(null)) === null);
  ok("token: unknown token", B.autocompleteField(mk("cc-number")) === null);
})();

/* ------------------------- scanGeneric prefers autocomplete over keywords */
(function scanPrefersAutocomplete() {
  const w = makeWindow(`<body><form>
      <label for="a">Legal given identifier</label>
      <input id="a" autocomplete="given-name" />
      <label for="b">Contact</label>
      <input id="b" autocomplete="email" />
      <label for="c">LinkedIn profile</label>
      <input id="c" autocomplete="url" />
      <label for="d">Portfolio</label>
      <input id="d" autocomplete="url" />
    </form></body>`, { url: GH_URL });
  loadCore(w);
  const found = w.JAF.adapterBase.scanGeneric(w.document);
  const by = {};
  found.forEach((c) => { by[c.field] = c; });
  ok("scan: odd label + given-name still maps firstName", by.firstName && by.firstName.el.id === "a");
  ok("scan: email token maps despite keyword-less label", by.email && by.email.el.id === "b");
  ok("scan: 'url' does NOT steal a linkedin-labeled field", by.linkedin && by.linkedin.el.id === "c");
  ok("scan: 'url' still maps a generic portfolio field to website", by.website && by.website.el.id === "d");
  ok("scan: autocomplete match carries a high score", by.firstName && by.firstName.score >= 400);
})();

/* ------------------------------- distrust list (Workday) from the ruleset */
(function workdayDistrust() {
  // default harness URL IS a myworkdayjobs.com host
  const w = makeWindow(`<body><form>
      <label for="a">Some unrelated prompt</label>
      <input id="a" autocomplete="email" />
    </form></body>`);
  loadCore(w);
  const B = w.JAF.adapterBase;
  ok("distrust: autocompleteTrusted() is false on myworkdayjobs", B.autocompleteTrusted() === false);
  const found = B.scanGeneric(w.document);
  ok("distrust: token ignored on workday host", !found.some((c) => c.field === "email"));

  const w2 = makeWindow("<body></body>", { url: GH_URL });
  loadCore(w2);
  ok("distrust: autocompleteTrusted() is true elsewhere", w2.JAF.adapterBase.autocompleteTrusted() === true);
})();

/* ----------------------- signal tiers: label beats placeholder/name ----- */
(function tierScoring() {
  const w = makeWindow(`<body><form>
      <!-- placeholder-only "email" vs a real <label> "email" on another input -->
      <input id="p1" placeholder="Email" name="f_17" />
      <label for="p2">Email</label><input id="p2" />
      <!-- placeholder-only match -> low confidence -->
      <input id="p3" placeholder="City" />
      <!-- label match -> high confidence -->
      <label for="p4">Phone</label><input id="p4" />
    </form></body>`, { url: GH_URL });
  loadCore(w);
  const found = w.JAF.adapterBase.scanGeneric(w.document);
  const by = {};
  found.forEach((c) => { by[c.field] = c; });
  ok("tier: <label> hit beats placeholder hit for the same field", by.email && by.email.el.id === "p2");
  ok("tier: placeholder-only match is low confidence", by.city && by.city.confidence === "low");
  ok("tier: label-backed match is high confidence", by.phone && by.phone.confidence === "high");
  ok("tier: autocomplete-less city still found", !!by.city);
})();

/* ------------------- overlay: low-confidence rows render UNCHECKED ------ */
(function overlayUnchecked() {
  const w = makeWindow(`<body><form>
      <label for="a">Email</label><input id="a" />
      <input id="b" placeholder="City" />
    </form></body>`, { url: GH_URL });
  loadCore(w);
  ["src/content/adapters/generic.js", "src/content/filler.js"].forEach((p) => require("./harness").load(w, p));
  let done = false;
  w.JAF.filler.start({ email: "ada@example.com", city: "Atlanta" }, null, { assist: false })
    .then(() => { done = true; });
  return new Promise((r) => setTimeout(r, 30)).then(() => {
    ok("overlay: start resolved", done);
    const host = w.document.getElementById("__jaf_host");
    ok("overlay: host rendered", !!host && !!host.shadowRoot);
    const checks = Array.from(host.shadowRoot.querySelectorAll('.rows input[type="checkbox"][data-i]'));
    ok("overlay: two rows", checks.length === 2, "got " + checks.length);
    const rows = Array.from(host.shadowRoot.querySelectorAll(".rows label.row"));
    const rowFor = (txt) => rows.find((r) => r.textContent.toLowerCase().includes(txt));
    const emailRow = rowFor("email"), cityRow = rowFor("city");
    ok("overlay: high-confidence email row is CHECKED", emailRow && emailRow.querySelector("input").checked === true);
    ok("overlay: low-confidence city row is UNCHECKED", cityRow && cityRow.querySelector("input").checked === false);
    ok("overlay: low row carries the ? marker", cityRow && !!cityRow.querySelector(".lowbadge"));
  });
})().then(report, (e) => { fail++; fails.push("overlay: threw -> " + (e && e.message)); report(); });

/* --------------------------------------------------------------- report */
function report() {
  console.log(`${tag} ${pass} passed, ${fail} failed`);
  if (fails.length) { console.log(`${tag} Failures:`); fails.forEach((f) => console.log("  x " + f)); process.exit(1); }
  console.log(`${tag} All green.`);
}
