/* profile_learn.test.js — Phase 10.3d: answers given while applying become profile suggestions.
 *
 * What must hold: after a fill, an answer to a profile question the fill had nothing for is
 * reported, and so is a change to a field we filled; an unchanged or changed-back field isn't;
 * EEO answers, checkboxes and low-confidence guesses never are; Yes/No questions report "Yes" or
 * "No" however the page words them; the same answer is sent once; and the page address goes
 * only to the service worker (which hashes it), never in an answer.
 * Run:  node test/profile_learn.test.js   (from job-autofill/)
 */
const { makeWindow, load, loadCore } = require("./harness");

let pass = 0, fail = 0;
const fails = [];
const tag = "[profile_learn]";
function ok(name, cond, extra) {
  if (cond) pass++;
  else { fail++; fails.push(name + (extra ? "  ->  " + extra : "")); }
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function page(html) {
  const w = makeWindow("<body><form>" + html + "</form></body>", { url: "https://job-boards.greenhouse.io/acme/jobs/123" });
  loadCore(w);
  ["src/content/adapters/generic.js", "src/lib/field-cache.js", "src/content/profile-learn.js"].forEach((p) => load(w, p));
  return w;
}
// Lever's card shape (real Lever DOM, see AUTOFILL-QA): prompt in .application-label, unlinked radios.
const card = (q, name, opts) =>
  `<div class="application-question"><div class="application-label">${q}</div><ul>` +
  opts.map((o) => `<li><label><input type="radio" name="${name}" value="${o}">${o}</label></li>`).join("") +
  "</ul></div>";
function type(w, el, v) {
  el.value = v;
  el.dispatchEvent(new w.Event("input", { bubbles: true }));
  el.dispatchEvent(new w.Event("change", { bubbles: true }));
}
function pick(w, el) {
  el.checked = true;
  el.dispatchEvent(new w.Event("change", { bubbles: true }));
}

(async function run() {
  /* ---------------------------------------------------- a blank profile field */
  {
    const w = page(`
      <label for="em">Email</label><input id="em" value="ada@example.com" />
      <label for="sal">Desired salary</label><input id="sal" />
      <label for="np">Notice period</label><select id="np"><option value="">Select…</option><option>2 weeks</option><option>1 month</option></select>
      <label for="g">Gender</label><select id="g"><option value="">Select…</option><option>Female</option></select>
      <label><input type="checkbox" id="cb" /> I'm willing to relocate</label>
      <input id="guess" placeholder="Salary expectation" />`);
    const $ = (id) => w.document.getElementById(id);
    const batches = [];
    const h = w.JAF.profileLearn.start({ planned: [{ el: $("em"), field: "email" }], send: (a) => batches.push(a) });
    const watching = h.watching();
    ok("watch: the blank desired-salary question", watching.includes("desiredSalary"), watching.join(","));
    ok("watch: the blank notice-period question", watching.includes("noticePeriod"));
    ok("watch: never an EEO question", !watching.includes("gender"));
    ok("watch: never a guess from a placeholder alone", watching.filter((f) => f === "desiredSalary").length === 1);

    type(w, $("sal"), "$120,000");
    $("np").value = "2 weeks"; $("np").dispatchEvent(new w.Event("change", { bubbles: true }));
    $("g").value = "Female"; $("g").dispatchEvent(new w.Event("change", { bubbles: true }));
    pick(w, $("cb"));
    type(w, $("guess"), "999");
    h.flush();
    const sent = batches.flat();
    ok("learn: the typed salary", sent.some((a) => a.fieldKey === "desiredSalary" && a.value === "$120,000"), JSON.stringify(sent));
    ok("learn: the picked notice period, as the option's text", sent.some((a) => a.fieldKey === "noticePeriod" && a.value === "2 weeks"));
    ok("learn: EEO is never sent", !sent.some((a) => a.fieldKey === "gender" || a.value === "Female"));
    ok("learn: a checkbox is never sent", !sent.some((a) => /relocate/i.test(a.fieldKey)));
    ok("learn: the placeholder-only guess is never sent", !sent.some((a) => a.value === "999"));
    ok("learn: the untouched filled email isn't sent", !sent.some((a) => a.fieldKey === "email"));
    ok("learn: only field keys and values — no page address", JSON.stringify(sent).indexOf("greenhouse") === -1 && sent.every((a) => Object.keys(a).sort().join() === "fieldKey,value"));

    type(w, $("sal"), "$120,000");
    h.flush();
    ok("dedupe: the same answer is sent once", batches.flat().filter((a) => a.fieldKey === "desiredSalary").length === 1);
    h.stop();
  }

  /* ------------------------------------------ a change to a field we filled */
  {
    const w = page(`<label for="city">City</label><input id="city" value="Atlanta" />
                    <label for="ph">Phone</label><input id="ph" value="555-0100" />`);
    const $ = (id) => w.document.getElementById(id);
    const batches = [];
    const h = w.JAF.profileLearn.start({ planned: [{ el: $("city"), field: "city" }, { el: $("ph"), field: "phone" }], send: (a) => batches.push(a) });
    type(w, $("city"), "Austin");
    type(w, $("ph"), "555-0199");
    type(w, $("ph"), "555-0100"); // changed back to what we filled
    h.flush();
    const sent = batches.flat();
    ok("change: a corrected filled field is sent", sent.some((a) => a.fieldKey === "city" && a.value === "Austin"), JSON.stringify(sent));
    ok("change: changed back to our value → nothing", !sent.some((a) => a.fieldKey === "phone"));
    h.stop();
  }

  /* ---------------------------------------- Yes/No questions, however worded */
  {
    const w = page(card("Are you willing to relocate?", "rel", ["Yes, happy to relocate", "No"]) +
      card("Will you now or in the future require visa sponsorship?", "sp", ["Yes", "No"]) +
      card("Are you legally authorized to work in the United States?", "au", ["I prefer not to say", "Yes"]));
    const batches = [];
    const h = w.JAF.profileLearn.start({ planned: [], send: (a) => batches.push(a) });
    const r = (n, i) => w.document.querySelectorAll(`input[name="${n}"]`)[i];
    pick(w, r("rel", 0));
    pick(w, r("sp", 1));
    pick(w, r("au", 0));
    h.flush();
    const sent = batches.flat();
    ok("yes/no: a worded Yes is \"Yes\"", sent.some((a) => a.fieldKey === "willingToRelocate" && a.value === "Yes"), JSON.stringify(sent));
    ok("yes/no: the second radio of a group is seen", sent.some((a) => a.fieldKey === "requireSponsorship" && a.value === "No"));
    ok("yes/no: a non-answer isn't a profile value", !sent.some((a) => a.fieldKey === "authorizedToWork"));
    ok("normalize: No", w.JAF.profileLearn.normalize("requireSponsorship", "No, I will not") === "No");
    ok("normalize: long text is dropped", w.JAF.profileLearn.normalize("city", "x".repeat(301)) === "");
    h.stop();
  }

  /* ------------------------- a new fill replaces the watcher (no double reports) */
  {
    const w = page(`<label for="sal">Desired salary</label><input id="sal" />`);
    const a = [], b = [];
    w.JAF.profileLearn.start({ planned: [], send: (x) => a.push(x) });
    const h2 = w.JAF.profileLearn.start({ planned: [], send: (x) => b.push(x) });
    type(w, w.document.getElementById("sal"), "$99,000");
    h2.flush();
    ok("restart: only the newest watcher reports", a.length === 0 && b.flat().length === 1, `a=${a.length} b=${b.flat().length}`);
    h2.stop();
  }

  /* ------------------------------------------------ debounced, on its own */
  {
    const w = page(`<label for="sal">Desired salary</label><input id="sal" />`);
    const batches = [];
    const h = w.JAF.profileLearn.start({ planned: [], send: (x) => batches.push(x) });
    type(w, w.document.getElementById("sal"), "$101,000");
    ok("debounce: nothing sent immediately", batches.length === 0);
    await wait(1700);
    ok("debounce: sent after a short pause", batches.flat().length === 1 && batches[0][0].value === "$101,000");
    h.stop();
  }

  /* ---------------------------------- end to end, through the real fill overlay */
  {
    const w = makeWindow(`<body><form>
        <label for="em">Email</label><input id="em" />
        <label for="sal">Desired salary</label><input id="sal" />
      </form></body>`, { url: "https://job-boards.greenhouse.io/acme/jobs/123" });
    loadCore(w);
    ["src/content/adapters/generic.js", "src/lib/field-cache.js", "src/lib/fill-telemetry.js",
     "src/content/required-audit.js", "src/content/profile-learn.js", "src/content/filler.js"].forEach((p) => load(w, p));
    const msgs = [];
    w.chrome.runtime.sendMessage = (m) => { msgs.push(m); };
    await w.JAF.filler.start({ email: "ada@example.com" }, null, { assist: false, mapFields: false });
    w.document.getElementById("__jaf_host").shadowRoot.querySelector("#fill").click();
    await wait(600);
    type(w, w.document.getElementById("sal"), "$130,000");
    await wait(1700);
    const learned = msgs.filter((m) => m.type === "JAF_LEARNED_ANSWERS");
    ok("e2e: the fill starts learning", learned.length === 1, JSON.stringify(msgs.map((m) => m.type)));
    ok("e2e: the salary answer is reported", learned[0] && learned[0].answers[0].fieldKey === "desiredSalary" && learned[0].answers[0].value === "$130,000");
    ok("e2e: the page goes to the service worker only (to be hashed there)", learned[0] && learned[0].page === "job-boards.greenhouse.io/acme/jobs/123");
    ok("e2e: the email we filled isn't reported", learned[0] && !learned[0].answers.some((a) => a.fieldKey === "email"));
  }

  report();
})().catch((e) => { fail++; fails.push("threw -> " + (e && e.stack || e)); report(); });

function report() {
  console.log(`${tag} ${pass} passed, ${fail} failed`);
  if (fails.length) { console.log(`${tag} Failures:`); fails.forEach((f) => console.log("  x " + f)); process.exit(1); }
  console.log(`${tag} All green.`);
}
