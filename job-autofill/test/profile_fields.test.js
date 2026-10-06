/* profile_fields.test.js — Phase 10.3a: the job-preference fields.
 *
 * Desired salary, notice period, earliest start date, work preference, willing to relocate and
 * "how did you hear about us" are asked on nearly every application and never appear on a
 * resume, so they're canonical fields matched by rules instead of left to the AI. What must hold:
 * the labels that ask for them match, the look-alikes that DON'T ask for them don't ("Current
 * salary", a work-history "Start date", "relocation assistance"), and a value lands in the
 * control the page actually uses — a number box, a date picker, a radio group of choices —
 * without ever being coerced into a Yes/No it doesn't mean.
 * Run:  node test/profile_fields.test.js   (from job-autofill/)
 */
const { makeWindow, load } = require("./harness");

let pass = 0, fail = 0;
const fails = [];
const tag = "[profile_fields]";
function ok(name, cond, extra) {
  if (cond) pass++;
  else { fail++; fails.push(name + (extra ? "  ->  " + extra : "")); }
}

const SRC = ["src/config/rules.js", "src/lib/rules-store.js", "src/lib/schema.js",
  "src/content/adapters/base.js", "src/content/adapters/generic.js", "src/lib/field-map.js"];
function win(html) {
  const w = makeWindow("<body>" + html + "</body>", { url: "https://job-boards.greenhouse.io/acme/jobs/1" });
  SRC.forEach((p) => load(w, p));
  return w;
}
const scan = (w) => w.JAF.adapterBase.scanGeneric(w.document);
const fieldOf = (w, el) => (scan(w).find((c) => c.el === el) || {}).field;
// Lever's card shape (captured from real Lever DOM in AUTOFILL-QA): a question wrapper, the
// prompt in .application-label, options whose radios aren't linked to it.
const card = (q, name, opts) =>
  `<div class="application-question"><div class="application-label">${q}</div><ul>` +
  opts.map((o) => `<li><label><input type="radio" name="${name}" value="${o}">${o}</label></li>`).join("") +
  "</ul></div>";

/* ----------------------------------------------------------- the vocabulary */
(function vocabulary() {
  const w = win("");
  const S = w.JAF.schema;
  const NEW = ["desiredSalary", "noticePeriod", "earliestStartDate", "workPreference", "willingToRelocate", "referralSource"];
  ok("schema: every new field is canonical", NEW.every((k) => S.FIELDS[k] === k));
  ok("schema: every new field has an overlay label", NEW.every((k) => S.LABELS[k]));
  ok("schema: every new field is part of the bio", NEW.every((k) => k in S.emptyBio()));
  ok("schema: none of them is sensitive", NEW.every((k) => S.SENSITIVE.indexOf(k) === -1));
  const bio = { desiredSalary: "$120,000", noticePeriod: "2 weeks", earliestStartDate: "2026-11-02", workPreference: "Hybrid", willingToRelocate: "No", referralSource: "LinkedIn" };
  const v = S.buildFillValues(bio, {});
  ok("schema: the bio values reach the filler", NEW.every((k) => v[k] === bio[k]), JSON.stringify(v));
  ok("schema: an empty preference isn't filled", !("noticePeriod" in S.buildFillValues({ noticePeriod: "" }, {})));
  // The AI mapper may resolve a long-tail label to them too — and still never to EEO.
  const prompt = w.JAF.fieldMap.buildMapPrompt(["x"]);
  ok("mapper: the new fields are in its vocabulary", NEW.every((k) => prompt.indexOf(k) !== -1));
  ok("mapper: EEO still isn't", !/\b(gender|race|ethnicity|veteranStatus|disabilityStatus)\b/.test(prompt));
})();

/* ---------------------------------------------------- labels that ask for them */
(function matching() {
  const cases = [
    ["Desired salary", "desiredSalary"],
    ["What are your salary expectations for this role?", "desiredSalary"],
    ["Expected compensation (USD)", "desiredSalary"],
    ["Notice period", "noticePeriod"],
    ["How much notice do you need to give your current employer?", "noticePeriod"],
    ["When can you start?", "earliestStartDate"],
    ["Earliest start date", "earliestStartDate"],
    ["Date available", "earliestStartDate"],
    ["How did you hear about us?", "referralSource"],
    ["How did you hear about this job?", "referralSource"],
    ["Where did you find this position?", "referralSource"],
  ];
  for (const [label, want] of cases) {
    const w = win(`<label for="f">${label}</label><input id="f" />`);
    const got = fieldOf(w, w.document.getElementById("f"));
    ok(`match: "${label}" → ${want}`, got === want, String(got));
  }

  const rel = win(card("Are you willing to relocate?", "rel", ["Yes", "No"]));
  ok("match: a relocation Y/N card → willingToRelocate", fieldOf(rel, rel.document.querySelector("input")) === "willingToRelocate");
  const pref = win(card("What is your preferred work arrangement?", "pref", ["Remote", "Hybrid", "On-site"]));
  ok("match: a work-arrangement card → workPreference", fieldOf(pref, pref.document.querySelector("input")) === "workPreference");
  const sel = win(`<label for="s">Workplace preference</label><select id="s"><option value="">Select…</option><option>Remote</option><option>Hybrid</option><option>On-site</option></select>`);
  ok("match: a workplace-preference select → workPreference", fieldOf(sel, sel.document.getElementById("s")) === "workPreference");
})();

/* ------------------------------------------- look-alikes that must NOT match */
(function lookAlikes() {
  const not = [
    ["Current salary", "desiredSalary"],
    ["Salary currency", "desiredSalary"],
    ["Start date", "earliestStartDate"],          // a work-history row, not availability
    ["End date", "earliestStartDate"],
    ["Do you require relocation assistance?", "willingToRelocate"],
    ["Name of the employee who referred you", "referralSource"],
  ];
  for (const [label, field] of not) {
    const w = win(`<label for="f">${label}</label><input id="f" />`);
    const got = fieldOf(w, w.document.getElementById("f"));
    ok(`no match: "${label}" is not ${field}`, got !== field, String(got));
  }
})();

/* ------------------------------------------------ the value lands correctly */
(function filling() {
  const w = win(
    `<label for="sal">Desired salary</label><input id="sal" type="number" />
     <label for="sal2">Expected salary</label><input id="sal2" />
     <label for="start">When can you start?</label><input id="start" type="date" />` +
    card("What is your preferred work arrangement?", "pref", ["Remote", "Hybrid", "On-site (5 days a week)"]) +
    card("Are you willing to relocate?", "rel", ["Yes", "No"]) +
    `<label for="src">How did you hear about us?</label>
     <select id="src"><option value="">Select…</option><option>Indeed</option><option>LinkedIn</option><option>Company website</option></select>`);
  const B = w.JAF.adapterBase;
  const $ = (id) => w.document.getElementById(id);
  const item = (el, value) => ({ el, value, kind: B.elKind(el) });

  ok("fill: a number box takes the number out of \"$120,000\"", B.applyItem(item($("sal"), "$120,000"), "$120,000") && $("sal").value === "120000", $("sal").value);
  ok("fill: numericValue honours k", B.numericValue("120k") === "120000");
  ok("fill: numericValue keeps a range's lower bound", B.numericValue("$120,000 - $140,000") === "120000");
  ok("fill: numericValue with no number is nothing", B.numericValue("Negotiable") === "");
  ok("fill: a text box keeps what the user wrote", B.applyItem(item($("sal2"), "$120,000 base"), "$120,000 base") && $("sal2").value === "$120,000 base");

  ok("fill: a date picker takes an ISO date", B.applyItem(item($("start"), "2026-11-02"), "2026-11-02") && $("start").value === "2026-11-02", $("start").value);
  ok("isoDate: a written date becomes ISO", B.isoDate("November 2, 2026") === "2026-11-02", B.isoDate("November 2, 2026"));
  $("start").value = "";
  ok("fill: \"Immediately\" is not guessed into a date", !B.applyItem(item($("start"), "Immediately"), "Immediately") && $("start").value === "");

  const radios = w.document.querySelectorAll('input[name="pref"]');
  ok("fill: a choice radio group picks the named option", B.applyItem(item(radios[0], "Hybrid"), "Hybrid") && radios[1].checked && !radios[0].checked);
  ok("fill: a prefix finds a longer option", B.applyItem(item(radios[0], "On-site"), "On-site") && radios[2].checked);
  ok("fill: a value the group doesn't offer picks nothing", !B.applyItem(item(radios[0], "Flexible"), "Flexible"));

  const rel = w.document.querySelectorAll('input[name="rel"]');
  ok("fill: Yes/No still works on a Y/N group", B.applyItem(item(rel[0], "No"), "No") && rel[1].checked);

  ok("fill: a select picks the source", B.applyItem(item($("src"), "LinkedIn"), "LinkedIn") && $("src").value === "LinkedIn");
})();

/* --------------------- never coerce a non-answer into Yes/No (the old behavior) */
(function neverCoerced() {
  const w = win(card("Are you comfortable working on-site 3 days a week?", "q", ["Yes", "No"]) +
    `<label><input type="checkbox" id="cb" checked /> I prefer remote work</label>`);
  const B = w.JAF.adapterBase;
  const yn = w.document.querySelectorAll('input[name="q"]');
  ok("coerce: \"Hybrid\" does not answer a Yes/No question", !B.applyItem({ el: yn[0], kind: "boolean" }, "Hybrid") && !yn[0].checked && !yn[1].checked);
  const cb = w.document.getElementById("cb");
  ok("coerce: \"Hybrid\" does not untick a checkbox", !B.applyItem({ el: cb, kind: "boolean" }, "Hybrid") && cb.checked);
})();

console.log(`${tag} ${pass} passed, ${fail} failed`);
if (fails.length) { console.log(`${tag} Failures:`); fails.forEach((f) => console.log("  x " + f)); process.exit(1); }
console.log(`${tag} All green.`);
