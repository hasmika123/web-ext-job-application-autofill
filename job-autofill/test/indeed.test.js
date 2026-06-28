// Tests for the Indeed Apply adapter (smartapply.indeed.com).
// DOM mirrors a REAL Indeed Apply session captured live: the location step uses
// stable semantic ids (#location-fields-*-input), the contact step uses standard
// W3C autocomplete tokens (given-name/family-name/email/tel), and the resume step's
// upload is an <input type=file data-testid="resume-selection-...-file-input">.
const { makeWindow, load } = require("./harness");
let pass = 0, fail = 0;
const fails = [];
function ok(n, c, e) { if (c) pass++; else { fail++; fails.push(n + (e ? "  ->  " + e : "")); } }

function coreInto(w) {
  ["src/config/rules.js", "src/lib/rules-store.js", "src/lib/schema.js",
   "src/content/adapters/base.js", "src/content/adapters/generic.js",
   "src/content/adapters/indeed.js"].forEach((p) => load(w, p));
}
const A = (w) => (w.JAF.adapters || []).find((a) => a.id === "indeed");

const VALUES = {
  firstName: "Ada", lastName: "Lovelace", email: "ada@x.com", phone: "404-555-1212",
  addressLine1: "1 Analytical Way", city: "Atlanta", state: "Georgia", postalCode: "30301", country: "United States",
};

(function run() {
  /* ---- contact step: mapped via standard autocomplete tokens ---- */
  const contact = makeWindow(`<body>
    <input autocomplete="given-name" id="c-fn" />
    <input autocomplete="family-name" id="c-ln" />
    <input autocomplete="email" type="email" id="c-em" />
    <input autocomplete="tel" type="tel" id="c-ph" />
  </body>`);
  coreInto(contact);
  const cPlan = A(contact).plan(VALUES);
  const cByField = Object.fromEntries(cPlan.map((i) => [i.field, i.value]));
  ok("contact: firstName from given-name", cByField.firstName === "Ada", JSON.stringify(cByField));
  ok("contact: lastName from family-name", cByField.lastName === "Lovelace", JSON.stringify(cByField));
  ok("contact: email from autocomplete", cByField.email === "ada@x.com", JSON.stringify(cByField));
  ok("contact: phone from tel", cByField.phone === "404-555-1212", JSON.stringify(cByField));

  /* ---- location step: mapped via the captured semantic ids ---- */
  const loc = makeWindow(`<body>
    <input id="location-fields-postal-code-input" autocomplete="postal-code" />
    <input id="location-fields-locality-input" autocomplete="address-level2" />
    <input id="location-fields-address-input" autocomplete="street-address" />
  </body>`);
  coreInto(loc);
  const lPlan = A(loc).plan(VALUES);
  const lByField = Object.fromEntries(lPlan.map((i) => [i.field, i.value]));
  ok("location: postalCode", lByField.postalCode === "30301", JSON.stringify(lByField));
  ok("location: city", lByField.city === "Atlanta", JSON.stringify(lByField));
  ok("location: addressLine1", lByField.addressLine1 === "1 Analytical Way", JSON.stringify(lByField));
  ok("location: no duplicate items (id + autocomplete on same el)", lPlan.length === 3, JSON.stringify(lPlan.map((i) => i.field)));

  /* ---- empty values are skipped (no blank fills) ---- */
  const empty = A(loc).plan({ city: "", postalCode: "30301" });
  ok("skips empty values", empty.length === 1 && empty[0].field === "postalCode", JSON.stringify(empty.map((i) => i.field)));

  /* ---- resume step: fileInput picks the resume upload input ---- */
  const res = makeWindow(`<body>
    <input type="file" data-testid="resume-selection-file-resume-radio-card-file-input" />
  </body>`);
  coreInto(res);
  const fi = A(res).fileInput();
  ok("resume: fileInput finds the resume upload", !!fi && /resume/.test(fi.getAttribute("data-testid")), String(fi && fi.getAttribute("data-testid")));

  /* ---- captureJob: tags indeed + applyable id from the URL ---- */
  const cap = A(contact).captureJob({ loc: { href: "https://smartapply.indeed.com/beta/indeedapply/form/contact-info-module?indeedApplyableJobId=121f4cb1-Y21o" } });
  ok("captureJob: atsPlatform indeed", cap.atsPlatform === "indeed", JSON.stringify(cap));
  ok("captureJob: externalJobId from URL", cap.externalJobId === "121f4cb1-Y21o", JSON.stringify(cap));

  /* ---- matches(): only on smartapply.indeed.com (harness url = workday) ---- */
  ok("matches false off smartapply host", A(contact).matches() === false);

  console.log(`\n[indeed] ${pass} passed, ${fail} failed`);
  if (fails.length) { fails.forEach((f) => console.log("  x " + f)); process.exit(1); }
  console.log("[indeed] All green.");
})();
