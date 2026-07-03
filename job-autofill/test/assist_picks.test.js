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

  report();
})().catch((e) => { fail++; fails.push("async run threw -> " + (e && e.message)); report(); });

/* --------------------------------------------------------------- report */
function report() {
  console.log(`${tag} ${pass} passed, ${fail} failed`);
  if (fails.length) { console.log(`${tag} Failures:`); fails.forEach((f) => console.log("  x " + f)); process.exit(1); }
  console.log(`${tag} All green.`);
}
