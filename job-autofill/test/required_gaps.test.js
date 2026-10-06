/* required_gaps.test.js — Phase 10.2: "N required fields still need you".
 *
 * After a fill, required fields that are still empty are listed in a small card that doesn't
 * cover the page; each item jumps to its field, items tick off as they're filled, and
 * auto-advance waits until they're done (the page would refuse the step anyway).
 * Run:  node test/required_gaps.test.js   (from job-autofill/)
 */
const { makeWindow, load, loadCore } = require("./harness");

let pass = 0, fail = 0;
const fails = [];
const tag = "[required_gaps]";
function ok(name, cond, extra) {
  if (cond) pass++;
  else { fail++; fails.push(name + (extra ? "  ->  " + extra : "")); }
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const GH = "https://job-boards.greenhouse.io/acme/jobs/123";

function page(html, url) {
  const w = makeWindow(html, { url: url || GH });
  loadCore(w);
  ["src/content/adapters/generic.js", "src/lib/field-cache.js", "src/lib/fill-telemetry.js",
   "src/content/required-audit.js", "src/content/filler.js"].forEach((p) => load(w, p));
  w.chrome.runtime.sendMessage = () => {};
  return w;
}

/* ------------------------------------------------ what counts as required */
(function asterisks() {
  const w = page(`<body><form>
      <label for="a">Phone *</label><input id="a" />
      <label for="b">Portfolio URL (*)</label><input id="b" />
      <label for="c">Notes</label><input id="c" />
      <label for="d">*Only if you have one, a referral code</label><input id="d" />
      <label for="e">City*</label><input id="e" value="Atlanta" />
      <fieldset><legend>Are you authorised to work here? *</legend>
        <label><input type="radio" name="auth" value="y" />Yes</label>
        <label><input type="radio" name="auth" value="n" />No</label>
      </fieldset>
    </form></body>`);
  const A = w.JAF.requiredAudit;
  const $ = (id) => w.document.getElementById(id);
  ok("asterisk: a trailing * marks a field required", A.isRequired($("a")));
  ok("asterisk: (*) counts too", A.isRequired($("b")));
  ok("asterisk: no marker, no requirement", !A.isRequired($("c")));
  ok("asterisk: a LEADING * is a footnote, not a requirement", !A.isRequired($("d")));
  const ids = A.findRequiredEmpty(w.document).map((el) => el.id || el.name);
  ok("asterisk: an empty starred field is a gap", ids.includes("a") && ids.includes("b"));
  ok("asterisk: a filled starred field is not", !ids.includes("e"));
  ok("asterisk: a starred radio question with no pick is one gap", ids.filter((x) => x === "auth").length === 1, ids.join(","));

  ok("describe: the label, without its asterisk", A.describe($("a")) === "Phone", JSON.stringify(A.describe($("a"))));
  ok("describe: (*) is stripped too", A.describe($("b")) === "Portfolio URL", JSON.stringify(A.describe($("b"))));
  const radio = w.document.querySelector('input[name="auth"]');
  ok("describe: a radio group is named by its question", /authorised to work here\?$/.test(A.describe(radio)), JSON.stringify(A.describe(radio)));
  const bare = w.document.createElement("input");
  bare.required = true;
  w.document.body.appendChild(bare);
  ok("describe: an unlabelled field still gets a name", A.describe(bare) === "A required field", JSON.stringify(A.describe(bare)));

  ok("isStillEmpty: text", A.isStillEmpty($("a")) && !A.isStillEmpty($("e")));
  radio.checked = true;
  ok("isStillEmpty: a radio is filled once its group has a pick", !A.isStillEmpty(w.document.querySelectorAll('input[name="auth"]')[1]));
})();

/* -------------------------------------------- the card, end to end */
(async function card() {
  const w = page(`<body><form>
      <label for="em">Email</label><input id="em" required />
      <label for="ph">Phone *</label><input id="ph" />
      <label for="ln">LinkedIn URL *</label><input id="ln" />
    </form></body>`);
  await w.JAF.filler.start({ email: "ada@example.com" }, null, { assist: false, mapFields: false });
  const host = w.document.getElementById("__jaf_host");
  host.shadowRoot.querySelector("#fill").click();
  await wait(700);

  const R = host.shadowRoot;
  const card = R.querySelector(".gaps");
  ok("card: shown when required fields are still empty", !!card);
  ok("card: the modal panel is gone", !R.querySelector(".panel") && !R.querySelector(".backdrop"));
  // The whole point of a non-modal card: the user must be able to click the page.
  ok("card: no longer covers the page", !/inset/.test(host.style.cssText) && host.style.right === "16px", host.style.cssText);
  ok("card: headline counts the gaps", R.querySelector(".gtitle").textContent === "2 required fields still need you", R.querySelector(".gtitle").textContent);
  const names = Array.from(R.querySelectorAll(".gname")).map((n) => n.textContent);
  ok("card: lists each field by its label", names.join("|") === "Phone|LinkedIn URL", names.join("|"));
  ok("card: says what was filled", /Filled 1 field\./.test(R.querySelector(".glead").textContent), R.querySelector(".glead").textContent);

  const ph = w.document.getElementById("ph");
  R.querySelectorAll(".gjump")[0].click();
  ok("jump: focuses the field", w.document.activeElement === ph);
  ok("jump: highlights it", /3px solid/.test(ph.style.outline), ph.style.outline);

  ph.value = "555-0100";
  ph.dispatchEvent(new w.Event("input", { bubbles: true }));
  ok("tick-off: a filled item is marked done", R.querySelectorAll(".glist li")[0].classList.contains("done"));
  ok("tick-off: the headline counts down", R.querySelector(".gtitle").textContent === "1 required field still needs you", R.querySelector(".gtitle").textContent);

  const ln = w.document.getElementById("ln");
  ln.value = "https://linkedin.com/in/ada";
  ln.dispatchEvent(new w.Event("change", { bubbles: true }));
  ok("done: says so once everything is filled", R.querySelector(".gtitle").textContent === "All required fields are filled");
  ok("done: reminds them the submit is theirs", /submit it yourself/.test(R.querySelector(".glead").textContent));

  R.querySelector(".gx").click();
  ok("close: removes the card", !w.document.getElementById("__jaf_host"));
})()
  .then(async function autoAdvancePaused() {
    let clicks = 0;
    const w = page(`<body><form>
        <label for="em">Email</label><input id="em" required />
        <label for="ph">Phone *</label><input id="ph" />
        <button type="button" id="next">Next</button>
      </form></body>`);
    w.document.getElementById("next").addEventListener("click", () => clicks++);
    await w.JAF.filler.start({ email: "ada@example.com" }, null, { assist: false, mapFields: false, autoAdvance: true });
    w.document.getElementById("__jaf_host").shadowRoot.querySelector("#fill").click();
    await wait(1500);
    const R = w.document.getElementById("__jaf_host").shadowRoot;
    ok("auto-advance: NOT clicked while a required field is empty", clicks === 0, "clicks=" + clicks);
    ok("auto-advance: the card says it paused", /Auto-advance paused/.test(R.querySelector(".glead").textContent));
  })
  .then(async function autoAdvanceWhenComplete() {
    // Regression guard: with nothing left, auto-advance behaves exactly as before.
    let clicks = 0;
    const w = page(`<body><form>
        <label for="em">Email</label><input id="em" required />
        <button type="button" id="next">Next</button>
      </form></body>`);
    w.document.getElementById("next").addEventListener("click", () => clicks++);
    await w.JAF.filler.start({ email: "ada@example.com" }, null, { assist: false, mapFields: false, autoAdvance: true });
    w.document.getElementById("__jaf_host").shadowRoot.querySelector("#fill").click();
    await wait(1500);
    ok("auto-advance: still clicks Next when nothing is missing", clicks === 1, "clicks=" + clicks);
  })
  .then(async function noGapsNoCard() {
    const w = page(`<body><form><label for="em">Email</label><input id="em" required /></form></body>`);
    await w.JAF.filler.start({ email: "ada@example.com" }, null, { assist: false, mapFields: false });
    const host = w.document.getElementById("__jaf_host");
    host.shadowRoot.querySelector("#fill").click();
    await wait(700);
    ok("no gaps: no card, the usual confirmation", !host.shadowRoot.querySelector(".gaps") && !!host.shadowRoot.querySelector(".flash"));
  })
  .then(report, (e) => { fail++; fails.push("threw -> " + (e && e.stack || e)); report(); });

function report() {
  console.log(`${tag} ${pass} passed, ${fail} failed`);
  if (fails.length) { console.log(`${tag} Failures:`); fails.forEach((f) => console.log("  x " + f)); process.exit(1); }
  console.log(`${tag} All green.`);
}
