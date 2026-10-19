/* assist_picks.test.js — AI picks for CONSTRAINED screening questions:
 * matchOption (pure), collectChoiceQuestions (DOM), run() with a stubbed SW,
 * and the "choice" fill kind. Run:  node test/assist_picks.test.js
 */
const { makeWindow, loadCore, load } = require("./harness");

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) pass++;
  else { fail++; fails.push(name + (extra ? "  ->  " + extra : "")); }
}
const tag = "[assist_picks]";
const GH_URL = "https://job-boards.greenhouse.io/acme/jobs/123";

function makeAssistWindow(html) {
  const w = makeWindow(html, { url: GH_URL });
  loadCore(w);
  ["src/lib/field-map.js", "src/content/assist.js"].forEach((p) => load(w, p));
  return w;
}

/* ----------------------------------------------------- matchOption (pure) */
(function optionMatching() {
  const w = makeAssistWindow("<body></body>");
  const M = w.JAF.fieldMap.matchOption;
  const opts = ["1-2 years", "3-5 years", "5+ years"];
  ok("match: exact", M("3-5 years", opts) === "3-5 years");
  ok("match: case/space insensitive", M("  3-5 YEARS ", opts) === "3-5 years");
  ok("match: verbose reply containing one option", M("The best answer is 3-5 years.", opts) === "3-5 years");
  ok("match: terse reply contained in one option", M("3-5", opts) === "3-5 years");
  ok("match: ambiguous reply → null", M("Yes or No", ["Yes", "No"]) === null);
  ok("match: UNSURE → null", M("UNSURE", opts) === null);
  ok("match: 'No' never hits inside 'know'", M("I know the answer", ["Yes", "No"]) === null);
  ok("match: gibberish → null", M("banana", opts) === null);
})();

/* --------------------------------- collectChoiceQuestions: what qualifies */
(function collect() {
  const w = makeAssistWindow(`<body><form>
      <label for="s1">How many years of experience with Java?</label>
      <select id="s1"><option>Select one</option><option>1-2 years</option><option>3-5 years</option><option>5+ years</option></select>
      <label for="s2">Gender</label>
      <select id="s2"><option>Select one</option><option>Female</option><option>Male</option></select>
      <label for="s3">Favorite fruit</label>
      <select id="s3"><option>Apple</option><option>Pear</option></select>
      <fieldset>
        <legend>Are you willing to relocate?</legend>
        <label><input type="radio" name="rel" value="y" />Yes</label>
        <label><input type="radio" name="rel" value="n" />No</label>
      </fieldset>
      <fieldset>
        <legend>Do you identify as a protected veteran?</legend>
        <label><input type="radio" name="vet" value="y" />Yes</label>
        <label><input type="radio" name="vet" value="n" />No</label>
      </fieldset>
    </form></body>`);
  const qs = w.JAF.assist.collectChoiceQuestions([]);
  const byKind = { select: qs.filter((q) => q.kind === "select"), radio: qs.filter((q) => q.kind === "radio") };
  ok("collect: screener select found", byKind.select.length === 1 && byKind.select[0].el.id === "s1");
  ok("collect: placeholder option filtered out", byKind.select[0] && !byKind.select[0].options.includes("Select one"));
  ok("collect: EEO select (Gender) excluded", !qs.some((q) => q.el && q.el.id === "s2"));
  ok("collect: non-question select excluded", !qs.some((q) => q.el && q.el.id === "s3"));
  ok("collect: relocation radio group found", byKind.radio.length === 1 && /relocate/.test(byKind.radio[0].question));
  ok("collect: veteran radio group excluded (EEO)", !qs.some((q) => /veteran/i.test(q.question)));
  ok("collect: radio options carry labels", byKind.radio[0] && JSON.stringify(byKind.radio[0].options) === '["Yes","No"]');
})();

/* ------------------------------ run(): stubbed SW picks become plan items */
(async function runPicks() {
  const w = makeAssistWindow(`<body><form>
      <label for="s1">How many years of experience with Java?</label>
      <select id="s1"><option>Select one</option><option>1-2 years</option><option>3-5 years</option></select>
      <fieldset>
        <legend>Are you willing to relocate?</legend>
        <label><input type="radio" name="rel" id="r1" value="y" />Yes</label>
        <label><input type="radio" name="rel" id="r2" value="n" />No</label>
      </fieldset>
    </form></body>`);
  const asked = [];
  w.chrome.runtime.sendMessage = (msg, cb) => {
    asked.push(msg);
    if (msg.type !== "JAF_PICK") return cb({ disabled: true });
    if (/years of experience/i.test(msg.question)) return cb({ answer: "3-5 years" });
    if (/relocate/i.test(msg.question)) return cb({ answer: "Yes" });
    cb({ unsure: true });
  };
  const items = await w.JAF.assist.run([], { summary: "Java dev" });
  ok("run: two pick items", items.length === 2, "got " + items.length);
  const sel = items.find((i) => i.kind === "select");
  const cho = items.find((i) => i.kind === "choice");
  ok("run: select pick targets the select with the picked option", sel && sel.el.id === "s1" && sel.value === "3-5 years");
  ok("run: radio pick targets the YES radio element", cho && cho.el.id === "r1" && cho.value === "Yes");
  ok("run: picks are assisted + carry options for regen", sel && sel.assisted === true && Array.isArray(sel.options));
  ok("run: only JAF_PICK messages sent (no textareas here)", asked.every((m) => m.type === "JAF_PICK"));

  /* -------------------------------------- applying the picked items ------ */
  const B = w.JAF.adapterBase;
  const okSel = await B.applyItemAsync(sel);
  ok("apply: select pick commits via selectOption", okSel === true && w.document.getElementById("s1").value === "3-5 years");
  const okCho = await B.applyItemAsync(cho);
  ok("apply: choice pick checks the radio", okCho === true && w.document.getElementById("r1").checked === true);

  /* ------------------------------------------- disabled AI → no items ---- */
  const w2 = makeAssistWindow(`<body><form>
      <label for="s1">How many years of experience with Java?</label>
      <select id="s1"><option>1-2 years</option><option>3-5 years</option></select>
    </form></body>`);
  w2.chrome.runtime.sendMessage = (msg, cb) => cb({ disabled: true });
  const none = await w2.JAF.assist.run([], {});
  ok("run: disabled AI → silent (no info note for picks alone)", none.length === 0);

  /* --------------------------- Pro gate (12.4): a different nudge -------- */
  // Server AI is Pro. A refusal must not read as "AI is off" — the user's next step is an
  // upgrade or their own key, not a settings toggle they've already flipped.
  const w3 = makeAssistWindow(`<body><form>
      <label for="t1">Why do you want to work here?</label>
      <textarea id="t1"></textarea>
    </form></body>`);
  w3.chrome.runtime.sendMessage = (msg, cb) => cb({ proRequired: true, error: "Kiwiply AI is a Pro feature — upgrade, or add your own key." });
  const gated = await w3.JAF.assist.run([], {});
  ok("run: PRO_REQUIRED → one info note, no drafted items", gated.length === 1 && gated[0].kind === "info");
  ok("run: the note names the upgrade AND the BYO-key escape hatch", /Pro feature/.test(gated[0].value) && /own API key/.test(gated[0].value));
  ok("run: the note does NOT tell them to turn AI on", !/Turn on AI drafting/.test(gated[0].value));

  const w4 = makeAssistWindow(`<body><form>
      <label for="t1">Why do you want to work here?</label>
      <textarea id="t1"></textarea>
    </form></body>`);
  w4.chrome.runtime.sendMessage = (msg, cb) => cb({ disabled: true });
  const off = await w4.JAF.assist.run([], {});
  ok("run: AI merely off still gets the settings nudge", off.length === 1 && /Turn on AI drafting/.test(off[0].value));

  /* react-select comboboxes (new Greenhouse, captured on Figma 2026-10-19): read the menu once, then pick from its own options */
  const w5 = makeAssistWindow(`<body><form>
      <label id="q1-label">Have you ever worked for Figma before, as an employee or a contractor/consultant? *</label>
      <div class="select__control"><div class="select__value-container"><div class="select__placeholder">Select...</div>
        <div class="select__input-container"><input class="select__input" id="q1" role="combobox" aria-required="true" aria-labelledby="q1-label" value=""></div></div></div>
      <label id="q2-label">Pronouns</label>
      <div class="select__control"><div class="select__input-container"><input id="q2" role="combobox" aria-required="false" aria-labelledby="q2-label" value=""></div></div>
      <label id="q3-label">Are you authorized to work here? *</label>
      <div class="select__control"><div class="select__single-value">Yes</div><div class="select__input-container"><input id="q3" role="combobox" aria-required="true" aria-labelledby="q3-label" value=""></div></div>
      <div role="listbox" id="phone-countries"><div role="option">United States+1</div><div role="option">Canada+1</div></div>
    </form></body>`);
  const d5 = w5.document;
  let opened = 0;
  d5.getElementById("q1").addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" && !d5.getElementById("react-select-q1-listbox")) {
      opened++;
      const lb = d5.createElement("div");
      lb.id = "react-select-q1-listbox";
      lb.setAttribute("role", "listbox");
      lb.innerHTML = '<div role="option">Yes</div><div role="option">No</div>';
      d5.body.appendChild(lb);
    }
    if (e.key === "Escape") d5.getElementById("react-select-q1-listbox")?.remove();
  });
  const combos = await w5.JAF.assist.collectComboQuestions([]);
  ok("combo: only the required, unanswered screener combobox is read", combos.length === 1 && combos[0].el.id === "q1", JSON.stringify(combos.map((c) => c.el.id)));
  ok("combo: its options come from its OWN menu, not the phone-country list", combos[0] && JSON.stringify(combos[0].options) === '["Yes","No"]', JSON.stringify(combos[0] && combos[0].options));
  ok("combo: the menu is opened once and closed again", opened === 1 && !d5.getElementById("react-select-q1-listbox"));
  ok("combo: a trailing '*' still reads as a question", /before?/.test(combos[0] && combos[0].question));
  w5.chrome.runtime.sendMessage = (msg, cb) => (msg.type === "JAF_PICK" ? cb({ answer: msg.options.includes("No") ? "No" : null }) : cb({ disabled: true }));
  const picked = await w5.JAF.assist.run([], {});
  const combo = picked.find((it) => it.kind === "combo");
  ok("combo: the AI's pick becomes a combo fill item with one of the page's own options", combo && combo.el.id === "q1" && combo.value === "No" && combo.assisted, JSON.stringify(picked.map((it) => [it.kind, it.value])));

  /* a menu that never opens for a script (live Greenhouse): a yes/no question still gets Yes and No */
  const w6 = makeAssistWindow(`<body><form>
      <label id="h-label">Have you ever worked for Robinhood as an employee, intern or contractor? *</label>
      <div class="select__control"><div class="select__input-container"><input id="h" role="combobox" aria-required="true" aria-labelledby="h-label" value=""></div></div>
      <label id="o-label">Which office would you prefer? *</label>
      <div class="select__control"><div class="select__input-container"><input id="o" role="combobox" aria-required="true" aria-labelledby="o-label" value=""></div></div>
    </form></body>`);
  const c6 = await w6.JAF.assist.collectComboQuestions([]);
  ok("combo: a yes/no question whose menu can't be read is offered Yes and No", c6.length === 1 && c6[0].el.id === "h" && JSON.stringify(c6[0].options) === '["Yes","No"]', JSON.stringify(c6.map((c) => [c.el.id, c.options])));

  /* Ashby: custom radios hide the real input (0x0) behind a visible label */
  const w7 = makeAssistWindow(`<body><form><fieldset><legend>Where do you plan to work from? *</legend>
      <label id="l1"><input type="radio" name="wf" value="NYC" />NYC</label>
      <label id="l2"><input type="radio" name="wf" value="Remote" />Remote</label>
      <span><input type="radio" id="wf-2" name="wf" value="Open to relocating" /></span><label for="wf-2">Open to relocating</label></fieldset></form></body>`);
  for (const r of w7.document.querySelectorAll("input")) r.getBoundingClientRect = () => ({ width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 });
  for (const l of w7.document.querySelectorAll("label")) l.getBoundingClientRect = () => ({ width: 80, height: 20, top: 0, left: 0, right: 80, bottom: 20 });
  const q7 = w7.JAF.assist.collectChoiceQuestions([]);
  ok("radio: a hidden input behind a visible label is still a question", q7.length === 1 && q7[0].options.join("|") === "NYC|Remote|Open to relocating", JSON.stringify(q7.map((q) => q.options)));

  report();
})().catch((e) => { fail++; fails.push("async run threw -> " + (e && e.message)); report(); });

/* --------------------------------------------------------------- report */
function report() {
  console.log(`${tag} ${pass} passed, ${fail} failed`);
  if (fails.length) { console.log(`${tag} Failures:`); fails.forEach((f) => console.log("  x " + f)); process.exit(1); }
  console.log(`${tag} All green.`);
}
