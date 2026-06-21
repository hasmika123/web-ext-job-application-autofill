// Tests for the Workable adapter (Task 0.2).
// DOM mirrors REAL apply.workable.com forms captured live (ENFOS, TP-Link):
// stable input names firstname/lastname/email/phone/address/city/postcode/country,
// summary + cover_letter textareas, and TWO file inputs — an avatar (accept=image)
// and the resume (accept lists pdf/doc). fileInput() must pick the resume one.
const { makeWindow, load } = require("./harness");
let pass = 0, fail = 0;
const fails = [];
function ok(n, c, e) { if (c) pass++; else { fail++; fails.push(n + (e ? "  ->  " + e : "")); } }

function coreInto(w) {
  ["src/config/rules.js", "src/lib/rules-store.js", "src/lib/schema.js",
   "src/content/adapters/base.js", "src/content/adapters/generic.js",
   "src/content/adapters/workable.js"].forEach((p) => load(w, p));
}

// Real-shaped Workable apply form.
const FORM = `
  <form class="styles--2I-rr" action="https://apply.workable.com/enfos-inc/j/77DF64C44E/apply/">
    <section><h2>Personal information</h2>
      <input type="text"  name="firstname" id="firstname" />
      <input type="text"  name="lastname"  id="lastname" />
      <input type="email" name="email"     id="email" />
      <input type="text"  name="headline"  id="headline" />
      <input type="tel"   name="phone" />
      <input type="text"  name="address"  id="address" />
      <input type="text"  name="city"     id="city" />
      <input type="text"  name="postcode" id="postcode" />
      <input type="text"  name="country"  id="country" />
    </section>
    <section><h2>Profile</h2>
      <input type="file" id="input_files_input_QxIQcaiSGuaK"
             accept=".jpg,.jpeg,.gif,.png,image/jpeg,image/png" />
      <input type="file" id="input_files_input_oLFtYQQYF7Rf"
             accept=".pdf,.doc,.docx,.odt,.rtf,application/pdf,application/msword" />
      <textarea name="summary" id="summary"></textarea>
    </section>
    <section><h2>Details</h2>
      <textarea name="cover_letter" id="cover_letter"></textarea>
      <input type="radio" name="QA_10908451" id="qa1" />
    </section>
  </form>`;

const VALUES = {
  firstName: "Ada", lastName: "Lovelace", email: "ada@x.com", phone: "404-555-1212",
  addressLine1: "1 Analytical Way", city: "Atlanta", postalCode: "30301",
  country: "United States", summary: "Engineer.",
};

/* ---- matches(): detects a Workable form by its action + file-input ids ---- */
(function matches() {
  const w = makeWindow();           // harness host is myworkdayjobs.com (not workable)
  coreInto(w);
  w.document.body.innerHTML = FORM;
  const a = (w.JAF.adapters || []).find((x) => x.id === "workable");
  ok("workable adapter registered", !!a);
  ok("matches: true via form action / file-input ids", a && a.matches());
  // a bare page with none of the signals must NOT match
  const w2 = makeWindow(); coreInto(w2);
  w2.document.body.innerHTML = `<form><input name="other" /></form>`;
  const a2 = (w2.JAF.adapters || []).find((x) => x.id === "workable");
  ok("matches: false on an unrelated form", a2 && !a2.matches());
})();

/* ---- plan(): maps the stable named inputs to canonical fields ---- */
(function plan() {
  const w = makeWindow();
  coreInto(w);
  w.document.body.innerHTML = FORM;
  const a = (w.JAF.adapters || []).find((x) => x.id === "workable");
  const items = a.plan(VALUES);
  const by = Object.fromEntries(items.map((i) => [i.field, i]));
  ok("plan: firstName mapped", by.firstName && by.firstName.value === "Ada" && by.firstName.el.name === "firstname");
  ok("plan: lastName mapped", by.lastName && by.lastName.value === "Lovelace");
  ok("plan: email mapped", by.email && by.email.value === "ada@x.com");
  ok("plan: phone mapped (tel input)", by.phone && by.phone.el.type === "tel");
  ok("plan: addressLine1 -> name=address", by.addressLine1 && by.addressLine1.el.name === "address");
  ok("plan: city mapped", by.city && by.city.value === "Atlanta");
  ok("plan: postalCode -> name=postcode", by.postalCode && by.postalCode.el.name === "postcode");
  ok("plan: country mapped", by.country && by.country.value === "United States");
  ok("plan: summary -> textarea kind", by.summary && by.summary.kind === "textarea");
  ok("plan: headline (no canonical value) skipped", !items.some((i) => i.label === "headline"));
  ok("plan: empty/undefined values skipped (coverLetter)", !by.coverLetter);
})();

/* ---- fileInput(): the resume input, never the avatar image input ---- */
(function fileInput() {
  const w = makeWindow();
  coreInto(w);
  w.document.body.innerHTML = FORM;
  const a = (w.JAF.adapters || []).find((x) => x.id === "workable");
  const fi = a.fileInput();
  ok("fileInput: picks the document input", fi && fi.id === "input_files_input_oLFtYQQYF7Rf");
  ok("fileInput: not the image avatar input", fi && fi.id !== "input_files_input_QxIQcaiSGuaK");
})();

console.log(`\n[workable] ${pass} passed, ${fail} failed`);
if (fails.length) { fails.forEach((f) => console.log("  x " + f)); process.exit(1); }
console.log("[workable] All green.");
