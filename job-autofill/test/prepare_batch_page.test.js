// "Prepare selected openings" (X12.9) — what happens ON the page of a batch tab, in jsdom with the real
// content modules: classifying a sign-in wall / CAPTCHA / form (read-only), the "Prepared by Kiwiply"
// banner, the normal fill via JAF_BATCH_FILL, the progress counts, and the rule that matters most:
// NOTHING on the page is clicked, submitted or ticked by the extension.
const fs = require("fs");
const path = require("path");
const { makeWindow, load, loadCore } = require("./harness");

let pass = 0, fail = 0;
const fails = [];
const tag = "[prepare_batch_page]";
function ok(n, c, e) { if (c) pass++; else { fail++; fails.push(n + (e ? "  ->  " + e : "")); } }
function eq(n, g, w) { ok(n, JSON.stringify(g) === JSON.stringify(w), `got ${JSON.stringify(g)} want ${JSON.stringify(w)}`); }
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const LEVER = "https://jobs.lever.co/acme/123/apply";

function page(html, url) {
  const w = makeWindow(html, { url: url || LEVER });
  const listeners = [];
  const sent = [];
  w.chrome.runtime.onMessage = { addListener: (fn) => listeners.push(fn) };
  w.chrome.runtime.sendMessage = (m, cb) => { sent.push(m); if (typeof cb === "function") cb(); };
  loadCore(w);
  ["src/content/adapters/generic.js", "src/lib/field-cache.js", "src/lib/fill-telemetry.js",
   "src/content/required-audit.js", "src/content/batch-prepare.js", "src/content/filler.js"].forEach((p) => load(w, p));
  // deliver a message to the content script the way the service worker does (no sender.tab)
  function deliver(msg, sender) {
    return new Promise((resolve) => {
      let handled = false;
      for (const fn of listeners) {
        const r = fn(msg, sender || {}, (resp) => resolve(resp));
        if (r === true) handled = true;
      }
      if (!handled) resolve(undefined);
    });
  }
  return { w, sent, deliver };
}

const FORM = `<body>
  <h1>Apply to Staff Engineer</h1>
  <form id="app" action="/submit">
    <label for="fn">First name *</label><input id="fn" name="first_name" />
    <label for="em">Email *</label><input id="em" name="email" type="email" />
    <label for="ref">Referral code *</label><input id="ref" name="ref_code" />
    <label><input id="cert" type="checkbox" required /> I certify that the information I provided is true and complete *</label>
    <label><input id="privacy" type="checkbox" /> I agree to the privacy policy</label>
    <button id="next" type="button">Next</button>
    <button id="submit" type="submit">Submit application</button>
    <a id="apply" href="#apply" role="button">Apply now</a>
  </form>
</body>`;

(async function run() {
  /* ---------------------------------------------------------- classification (read-only) */
  {
    const signin = page(`<body><h1>Sign in</h1><form><input type="email" name="u" /><input type="password" name="p" /><button>Sign in</button></form></body>`);
    eq("classify: a sign-in wall", signin.w.JAF.batchPrepare.classify(signin.w.document), "signin");
    const captcha = page(`<body><div class="main-wrapper"><h1>Just a moment...</h1><p>Verify you are human by completing the action below.</p></div></body>`);
    eq("classify: a CAPTCHA challenge page", captcha.w.JAF.batchPrepare.classify(captcha.w.document), "captcha");
    const form = page(FORM + "");
    eq("classify: an application form", form.w.JAF.batchPrepare.classify(form.w.document), "form");
    const invisible = page(FORM.replace("</form>", `<div class="g-recaptcha" data-sitekey="k"></div><iframe src="https://www.google.com/recaptcha/api2/anchor"></iframe></form>`));
    eq("classify: the reCAPTCHA many forms carry at the bottom is NOT a challenge page", invisible.w.JAF.batchPrepare.classify(invisible.w.document), "form");
    const register = page(`<body><form><input type="text" name="a"><input type="text" name="b"><input type="email" name="c"><input type="tel" name="d"><input type="password" name="p"></form></body>`);
    eq("classify: a registration form with a password is not mistaken for a sign-in wall", register.w.JAF.batchPrepare.classify(register.w.document), "form");
    const blank = page(`<body><h1>Loading...</h1></body>`);
    eq("classify: nothing there yet", blank.w.JAF.batchPrepare.classify(blank.w.document), "none");
  }

  /* ---------------------------------------------------------- the check message + banner */
  {
    const p = page(FORM);
    const w = p.w;
    const r = await p.deliver({ type: "JAF_BATCH_CHECK", batch: { sessionId: "s1", matchId: 1 } });
    eq("check: answers with the page kind", [r.ok, r.kind], [true, "form"]);
    const host = w.document.getElementById("__kiwiply_batch_banner");
    ok("banner: shown on the tab", !!host);
    const text = host.shadowRoot.textContent;
    ok("banner: says what this is and that nothing is submitted for you", /Prepared by Kiwiply: review every field\. Nothing is submitted for you\./.test(text), text.slice(0, 120));
    ok("banner: says the form is being filled and asks for a review", /Filling the form from your profile\. Review every answer/.test(text));
    // a message that did not come from the service worker (it has a sender.tab) is ignored
    eq("check: only the service worker may drive it", await p.deliver({ type: "JAF_BATCH_CHECK" }, { tab: { id: 5 } }), undefined);
    eq("fill: only the service worker may drive it", await p.deliver({ type: "JAF_BATCH_FILL", bio: { firstName: "x" } }, { tab: { id: 5 } }), undefined);
    eq("an unrelated message is not ours", await p.deliver({ type: "JAF_PING" }), undefined);
    const signin = page(`<body><form><input type="email"/><input type="password"/></form></body>`);
    await signin.deliver({ type: "JAF_BATCH_CHECK" });
    ok("banner: a sign-in wall says to sign in yourself", /Sign in to the site on this tab/.test(signin.w.document.getElementById("__kiwiply_batch_banner").shadowRoot.textContent));
    const cap = page(`<body><p>Verify you are human</p></body>`);
    await cap.deliver({ type: "JAF_BATCH_CHECK" });
    ok("banner: a CAPTCHA says to complete it yourself", /verify you are human\. Complete it yourself/.test(cap.w.document.getElementById("__kiwiply_batch_banner").shadowRoot.textContent));
  }

  /* ---------------------------------------------------------- fill end to end + never-submit */
  {
    const p = page(FORM);
    const w = p.w, d = w.document;
    const clicks = [];
    const submits = [];
    d.addEventListener("click", (e) => { if (e.target && e.target.id !== "__jaf_host" && e.target.id !== "__kiwiply_batch_banner") clicks.push(e.target.id || e.target.tagName); }, true);
    d.addEventListener("submit", (e) => submits.push(e.target.id), true);
    d.addEventListener("input", () => {}, true);
    const trace = [];
    const certInput = d.getElementById("cert");
    const privacy = d.getElementById("privacy");
    const checkedBefore = [certInput.checked, privacy.checked];

    await p.deliver({ type: "JAF_BATCH_CHECK", batch: { sessionId: "s1", matchId: 1 } });
    const resp = await p.deliver({
      type: "JAF_BATCH_FILL",
      bio: { firstName: "Cora", lastName: "Mills", email: "cora@acme.test", phone: "5551234567" },
      resume: { skills: ["go"] },
      file: null,
      // even a sender that asks for auto-advance does not get it on a batch tab
      options: { autoAdvance: true, autoAddRows: true, resume: { serverId: 3, label: "Main" }, batch: { sessionId: "s1", matchId: 1 } },
    });
    eq("fill: the normal fill pipeline started", resp.ok, true);
    const hostEl = d.getElementById("__jaf_host");
    ok("fill: the usual review overlay is shown (the consultant confirms)", !!hostEl && !!hostEl.shadowRoot.querySelector("#fill"));
    eq("fill: nothing is filled before the consultant confirms", [d.getElementById("fn").value, d.getElementById("em").value], ["", ""]);
    ok("fill: the overlay says nothing is submitted", /Nothing is submitted|never clicks Submit/.test(hostEl.shadowRoot.textContent));

    hostEl.shadowRoot.querySelector("#fill").click(); // the consultant presses "Fill selected"
    await wait(900);
    eq("fill: the consultant's own profile landed", [d.getElementById("fn").value, d.getElementById("em").value], ["Cora", "cora@acme.test"]);
    const filledMsg = p.sent.find((m) => m.type === "JAF_BATCH_PROGRESS" && m.phase === "filled");
    ok("progress: 'filled' reported with the batch ids", !!filledMsg && filledMsg.batch.sessionId === "s1" && filledMsg.batch.matchId === 1);
    ok("progress: required fields still empty are COUNTED (referral code + the certify box)", filledMsg && filledMsg.gaps >= 2, JSON.stringify(filledMsg));
    ok("progress: counts only, no field name or answer in the message", filledMsg && Object.keys(filledMsg).sort().join(",") === "batch,failed,filled,gaps,phase,type" && !/Cora|cora@|certify|Referral/i.test(JSON.stringify(filledMsg)));

    const banner = d.getElementById("__kiwiply_batch_banner").shadowRoot;
    ok("banner: lists the fields that need input", /need your input/.test(banner.textContent) && /Referral code/.test(banner.textContent) && /certify/i.test(banner.textContent), banner.textContent.slice(0, 300));
    // "Go" scrolls to and focuses a field; it must not click it
    const goButtons = Array.from(banner.querySelectorAll(".go"));
    ok("banner: has a Go button per field", goButtons.length >= 2);
    const refGo = goButtons.find((b) => /Referral/.test(b.textContent));
    refGo.click();
    eq("banner: Go focuses the field", d.activeElement && d.activeElement.id, "ref");
    const clicksAfterGo = clicks.slice();

    // the consultant completes the form themselves
    const ref = d.getElementById("ref");
    ref.value = "ABC123";
    ref.dispatchEvent(new w.Event("input", { bubbles: true }));
    certInput.checked = true;
    certInput.dispatchEvent(new w.Event("change", { bubbles: true }));
    await wait(700);
    const gapMsgs = p.sent.filter((m) => m.type === "JAF_BATCH_PROGRESS" && m.phase === "gaps");
    ok("progress: the gap count follows the consultant's own edits", gapMsgs.length >= 1 && gapMsgs[gapMsgs.length - 1].gaps === 0, JSON.stringify(gapMsgs));

    // ---- never submit / never tick ----
    eq("NEVER-SUBMIT: the extension clicked nothing on the page (Submit, Apply, Next, boxes, links)", clicksAfterGo, []);
    eq("NEVER-SUBMIT: no form was submitted", submits, []);
    eq("attestation + privacy boxes: the extension ticked neither (only the consultant's own edit changed 'cert')", [checkedBefore, privacy.checked], [[false, false], false]);
    ok("the certify box is ticked only because the TEST (the consultant) ticked it", certInput.checked === true);
  }
  {
    // same page, no consultant edits at all: the attestation box is still unticked after the fill
    const p = page(FORM);
    const d = p.w.document;
    const clicks = [];
    d.addEventListener("click", (e) => { if (e.target && e.target.id !== "__jaf_host") clicks.push(e.target.id); }, true);
    await p.deliver({ type: "JAF_BATCH_FILL", bio: { firstName: "Cora", email: "c@x.test" }, resume: null, options: { autoAdvance: true, batch: { sessionId: "s1", matchId: 1 } } });
    d.getElementById("__jaf_host").shadowRoot.querySelector("#fill").click();
    await wait(900);
    eq("attestation: required 'I certify' box is left unticked", d.getElementById("cert").checked, false);
    eq("attestation: privacy-consent box is left unticked", d.getElementById("privacy").checked, false);
    eq("auto-advance is off even when the sender asked for it: Next is never clicked", clicks, []);
    ok("the unticked attestation box is reported as a required field still needing the consultant",
      /certify/i.test(d.getElementById("__kiwiply_batch_banner").shadowRoot.textContent));
  }
  {
    // a fill with no profile does nothing
    const p = page(FORM);
    const r = await p.deliver({ type: "JAF_BATCH_FILL", options: {} });
    eq("fill: no profile -> refused, nothing shown", [r.ok, !!p.w.document.getElementById("__jaf_host")], [false, false]);
  }
  {
    // autoFill (what the service worker sends for a prepare batch): the tab fills at once — "Prepare" on the web
    // was the consultant's click — and the panel becomes the review. Still nothing clicked, ticked or submitted.
    const p = page(FORM);
    const w = p.w, d = w.document;
    const clicks = [];
    const submits = [];
    d.addEventListener("click", (e) => { if (e.target && e.target.id !== "__jaf_host" && e.target.id !== "__kiwiply_batch_banner") clicks.push(e.target.id || e.target.tagName); }, true);
    d.addEventListener("submit", (e) => submits.push(e.target.id), true);
    const resp = await p.deliver({
      type: "JAF_BATCH_FILL",
      bio: { firstName: "Cora", lastName: "Mills", email: "cora@acme.test", phone: "5551234567" },
      resume: { skills: ["go"] },
      file: null,
      options: { autoAdvance: true, autoFill: true, autoAddRows: true, resume: { serverId: 3, label: "Main" }, batch: { sessionId: "s2", matchId: 7 } },
    });
    eq("autoFill: the fill pipeline started", resp.ok, true);
    await wait(1200);
    eq("autoFill: the profile landed without any press of 'Fill selected'", [d.getElementById("fn").value, d.getElementById("em").value], ["Cora", "cora@acme.test"]);
    const host = d.getElementById("__jaf_host");
    ok("autoFill: the panel stays open as the review", !!host && !!host.shadowRoot.querySelector("#done"));
    const txt = host.shadowRoot.textContent;
    ok("review: says how many fields were filled", /Filled \d+ of \d+ fields?/.test(txt), txt.slice(0, 200));
    ok("review: lists the required fields that are still the consultant's", /Still needs you/.test(txt) && /Referral code/.test(txt) && /certify/i.test(txt));
    ok("review: lists what was filled for them", /Filled for you/.test(txt) && /Cora/.test(txt));
    ok("review: rows carry readable names, not field keys", /First name/.test(txt) && !/firstName/.test(txt), txt.slice(0, 300));
    ok("review: no backdrop — the page is usable beside the panel", !host.shadowRoot.querySelector(".backdrop"));
    ok("review: says nothing is submitted", /Nothing is submitted/.test(txt));
    const filledMsg = p.sent.find((m) => m.type === "JAF_BATCH_PROGRESS" && m.phase === "filled");
    ok("autoFill: progress 'filled' reported with the batch ids and gap count", !!filledMsg && filledMsg.batch.sessionId === "s2" && filledMsg.batch.matchId === 7 && filledMsg.gaps >= 2, JSON.stringify(filledMsg));
    // the consultant fills the referral code: the review's list follows
    const ref = d.getElementById("ref");
    ref.value = "ABC123";
    ref.dispatchEvent(new w.Event("input", { bubbles: true }));
    await wait(100);
    ok("review: a field the consultant fills is struck off", /1 required field still needs you/.test(host.shadowRoot.querySelector("#rvstatus").textContent), host.shadowRoot.querySelector("#rvstatus").textContent);
    eq("NEVER-SUBMIT (autoFill): nothing on the page was clicked", clicks, []);
    eq("NEVER-SUBMIT (autoFill): no form was submitted", submits, []);
    eq("attestation (autoFill): the certify and privacy boxes are untouched", [d.getElementById("cert").checked, d.getElementById("privacy").checked], [false, false]);
    host.shadowRoot.querySelector("#done").click();
    ok("review: Done closes the panel", !d.getElementById("__jaf_host"));
  }
  {
    // without autoFill (the person's own "Scan & fill" from the drawer) nothing is written before they press the button
    const p = page(FORM);
    const d = p.w.document;
    await p.deliver({ type: "JAF_BATCH_FILL", bio: { firstName: "Cora", email: "c@x.test" }, resume: null, options: { batch: { sessionId: "s3", matchId: 1 } } });
    await wait(400);
    eq("no autoFill: the page is untouched until 'Fill selected'", d.getElementById("fn").value, "");
  }

  /* ---------------------------------------------------------- forms split into steps */
  {
    // a one-page form (a Submit on the page): steps on, nothing is pressed
    const p = page(FORM);
    const d = p.w.document;
    const clicks = [];
    ["next", "submit", "apply"].forEach((id) => d.getElementById(id).addEventListener("click", (e) => { clicks.push(id); e.preventDefault(); }));
    await p.deliver({ type: "JAF_BATCH_FILL", bio: { firstName: "Cora", email: "c@x.test" }, resume: null, options: { steps: true, autoFill: true, batch: { sessionId: "s4", matchId: 2 } } });
    await wait(1800);
    eq("steps on a one-page form: nothing clicked (its Submit marks the last step)", clicks, []);
    eq("steps on a one-page form: it is filled", d.getElementById("fn").value, "Cora");
    eq("nextStepButton: none while a Submit is on the page", p.w.JAF.batchPrepare.nextStepButton(), null);
  }
  {
    // a two-step form: step 1 is filled, its Next pressed, step 2 filled; step 2's Submit is never pressed
    const TWO = `<body><div id="app">
      <h2 id="h">Step 1: Contact</h2>
      <div id="s"><label for="fn">First name *</label><input id="fn" name="first_name" required /></div>
      <button id="nx" type="button">Next</button></div></body>`;
    const p = page(TWO);
    const d = p.w.document;
    const clicks = [];
    d.getElementById("nx").addEventListener("click", () => {
      clicks.push("next");
      d.getElementById("app").innerHTML = `<h2>Step 2: Details</h2>
        <div><label for="em">Email *</label><input id="em" name="email" type="email" required /></div>
        <button id="sb" type="button">Submit application</button>`;
      d.getElementById("sb").addEventListener("click", () => clicks.push("submit"));
    });
    await p.deliver({ type: "JAF_BATCH_FILL", bio: { firstName: "Cora", email: "c@x.test" }, resume: null, options: { steps: true, autoFill: true, batch: { sessionId: "s5", matchId: 3 } } });
    await wait(5500);
    eq("two steps: Next pressed once, Submit never", clicks, ["next"]);
    eq("two steps: step 2 is filled", d.getElementById("em") && d.getElementById("em").value, "c@x.test");
    const host = d.getElementById("__jaf_host");
    const sub = host && host.shadowRoot.querySelector("header .sub");
    ok("two steps: the review counts both steps", !!sub && /across 2 steps/.test(sub.textContent), sub && sub.textContent);
    const filledMsgs = p.sent.filter((m) => m.type === "JAF_BATCH_PROGRESS" && m.phase === "filled");
    eq("two steps: progress 'filled' is reported once, at the end", filledMsgs.length, 1);
  }
  {
    // a step whose required field stays empty is not left
    const STUCK = `<body><h2>Step 1</h2><label for="q">Your favourite colour *</label><input id="q" name="colour" required /><button id="nx" type="button">Continue</button></body>`;
    const p = page(STUCK);
    const d = p.w.document;
    let pressed = 0;
    d.getElementById("nx").addEventListener("click", () => { pressed++; });
    await p.deliver({ type: "JAF_BATCH_FILL", bio: { firstName: "Cora", email: "c@x.test" }, resume: null, options: { steps: true, autoFill: true, batch: { sessionId: "s6", matchId: 4 } } });
    await wait(1500);
    eq("a step with a required field left is not left (Continue not pressed)", pressed, 0);
  }
  {
    // Workday's Review step: the Submit carries Next's automation id; neither the adapter nor the walk takes it
    const p = page(`<body><h3>Review</h3><div data-automation-id="pageFooter"><button data-automation-id="pageFooterBackButton" type="button">Back</button><button data-automation-id="pageFooterNextButton" type="button">Submit</button></div></body>`, "https://acme.wd5.myworkdayjobs.com/en-US/careers/job/X_R1/apply/applyManually");
    load(p.w, "src/content/adapters/workday.js");
    const wd = p.w.JAF.adapters.find((a) => a.id === "workday");
    eq("workday nextButton never returns the Review step's Submit", wd.nextButton(), null);
    eq("nextStepButton: none on Workday's Review step", p.w.JAF.batchPrepare.nextStepButton(), null);
    const p2 = page(`<body><h3>My Information</h3><div data-automation-id="pageFooter"><button data-automation-id="pageFooterNextButton" type="button">Next</button></div></body>`, "https://acme.wd5.myworkdayjobs.com/en-US/careers/job/X_R1/apply/applyManually");
    load(p2.w, "src/content/adapters/workday.js");
    const b = p2.w.JAF.batchPrepare.nextStepButton();
    eq("nextStepButton: Workday's Next on a step", b && b.textContent, "Next");
  }

  /* ---------------------------------------------------------- source rules */
  const root = path.join(__dirname, "..");
  const code = (rel) => fs.readFileSync(path.join(root, rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const filler = code("src/content/filler.js");
  ok("filler: submit watch is longer for a batch tab", /submitDetect\.arm\(opts\.batch \? \{ windowMs: 30 \* 60 \* 1000 \}/.test(filler));
  ok("filler: batch hook reports counts through JAF.batchPrepare.filled", /JAF\.batchPrepare\.filled\(opts\.batch, \{ filled: allFilled, failed: allFailed, gaps: gaps\.length \}\)/.test(filler));

  console.log(`${tag} ${pass} passed, ${fail} failed`);
  if (fails.length) { console.log(`${tag} Failures:`); fails.forEach((f) => console.log("  x " + f)); process.exit(1); }
  console.log(`${tag} All green.`);
})().catch((e) => { console.error(e); process.exit(1); });
