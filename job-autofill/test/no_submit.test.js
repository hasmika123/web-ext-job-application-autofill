// "No auto-submit, ever" (CLAUDE.md hard rule; ADR-010; backlog X9.12). This pins:
//   1. BLOCK_RE — the regex that keeps the auto-advance from ever pressing a submit-class button —
//      is exactly what it was, and still blocks every submit-class label while allowing Next.
//   2. The only click the filler makes is that guarded Next button.
//   3. The org-workspace modules added in WP5 (marketer save, consultant Jobs/"I applied") contain
//      no code path that clicks, submits, requests a submit or dispatches synthetic events — "I
//      applied" is a REPORT of what the consultant did, never an action on the page.
const fs = require("fs");
const path = require("path");
const { makeWindow, loadCore } = require("./harness");
let pass = 0, fail = 0;
const fails = [];
const tag = "[no_submit]";
function ok(n, c, e) { if (c) pass++; else { fail++; fails.push(n + (e ? "  ->  " + e : "")); } }
function eq(n, g, w) { ok(n, JSON.stringify(g) === JSON.stringify(w), `got ${JSON.stringify(g)} want ${JSON.stringify(w)}`); }
const read = (rel) => fs.readFileSync(path.join(__dirname, "..", rel), "utf8");
// Code without comments and string-free noise, so a comment saying "never .click()" can't trip a scan.
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/* ---- 1. BLOCK_RE pinned ---- */
const base = read("src/content/adapters/base.js");
const m = base.match(/const BLOCK_RE = (\/.*\/i);/);
ok("BLOCK_RE exists in base.js", !!m);
eq("BLOCK_RE is unchanged (pinned)", m && m[1], "/\\b(submit|apply|finish|complete|send|previous|back|cancel|save\\s*(for|as)\\s*(later|draft)|save\\s*draft|review\\s*and\\s*submit)\\b/i");

const w = makeWindow('<!doctype html><body><div id="f"></div></body>');
loadCore(w);
const B = w.JAF.adapterBase;
function nextFor(labels) {
  const f = w.document.getElementById("f");
  f.innerHTML = labels.map((l) => `<button type="button">${l}</button>`).join("");
  const el = B.findNextButton(f);
  return el ? el.textContent : null;
}
for (const bad of ["Submit", "Submit application", "Apply", "Apply now", "Finish", "Complete", "Send", "Review and submit", "Save as draft", "Cancel", "Back"]) {
  eq("findNextButton never returns '" + bad + "'", nextFor([bad]), null);
}
eq("findNextButton returns Next", nextFor(["Submit application", "Next"]), "Next");
eq("findNextButton returns Save and Continue", nextFor(["Back", "Save and Continue"]), "Save and Continue");

/* ---- 2. the filler's only click is the guarded Next ---- */
const filler = code(read("src/content/filler.js"));
eq("filler.js has exactly one .click() (the guarded Next)", (filler.match(/\.click\(\)/g) || []).length, 1);
ok("that click is on nextBtn, found via findNextButton/adapter.nextButton", /nextBtn\.click\(\)/.test(filler) && /findNextButton\(\)/.test(filler));
ok("the filler never calls submit()/requestSubmit()", !/\.(submit|requestSubmit)\s*\(/.test(filler));

/* ---- 3. WP5 modules: nothing clicks, submits or synthesises events ---- */
const FORBIDDEN = [
  [/\.click\s*\(/, ".click("],
  [/\.(submit|requestSubmit)\s*\(/, ".submit()/requestSubmit()"],
  [/dispatchEvent\s*\(/, "dispatchEvent("],
  [/realClick|findNextButton|B\.attachFile/, "base-adapter click helpers"],
  [/type\s*=\s*["']submit["']|\[type=["']?submit/, "type=submit selector"],
  [/JAF_FILL\b/, "JAF_FILL (starting a fill)"],
];
const WP5_FILES = [
  "src/lib/workspace.js",
  "entrypoints/panel/workspace-actions.ts",
  "entrypoints/panel/MarketerView.tsx",
  "entrypoints/panel/AssignedJobs.tsx",
];
for (const f of WP5_FILES) {
  const src = code(read(f));
  for (const [re, label] of FORBIDDEN) ok(f + " has no " + label, !re.test(src));
}
// Starting a fill is the consultant's normal flow and lives only in home-actions.fillPage; the
// marketer view and the Jobs tab never reach it.
const marketer = code(read("entrypoints/panel/MarketerView.tsx"));
ok("MarketerView never references fillPage", !/fillPage/.test(marketer));
const jobs = code(read("entrypoints/panel/AssignedJobs.tsx"));
ok("AssignedJobs never references fillPage", !/fillPage/.test(jobs));
// The only tab actions in the workspace glue: open the posting in a new tab (a link the consultant
// then applies on themselves) and read the active tab.
const wsa = code(read("entrypoints/panel/workspace-actions.ts"));
ok("workspace-actions: only chrome.tabs.create/query, never executeScript/sendMessage", !/executeScript|sendMessage/.test(wsa) && (wsa.match(/chrome\.tabs\.\w+/g) || []).every((x) => /tabs\.(create|query)$/.test(x)), (wsa.match(/chrome\.tabs\.\w+/g) || []).join(","));
// The server-side message from the page to the service worker carries only {orgId,id}.
const sw = code(read("src/background/service-worker.js"));
ok("service worker links through opportunityRef (sanitised ids only)", /opportunityRef\(opportunity\)/.test(sw) && /linkOpportunityAfterSubmit\(provider, p\)/.test(sw));
ok("the link runs AFTER the user's own confirmSubmission and is wrapped in try/catch", /confirmSubmission[\s\S]{0,400}application_submitted[\s\S]{0,300}try \{ await self\.JAF\.appTracking\.linkOpportunityAfterSubmit/.test(sw));
// No org-side code marks an application submitted: the only writer of status APPLIED stays confirmSubmission.
const wsl = code(read("src/lib/workspace.js")) + code(read("entrypoints/panel/workspace-actions.ts"));
ok("workspace modules never write an application status", !/updateApplication|pushApplication|confirmSubmission|status\s*:\s*["']APPLIED/.test(wsl));

/* ---- 4. "Prepare selected openings" (X12.9): opens tabs and reports; never clicks, submits or ticks ---- */
// (cases only ADDED; BLOCK_RE and sections 1-3 above are untouched.) The page-level proof — nothing
// clicked, no form submitted, attestation boxes untouched — runs in prepare_batch_page.test.js.
const PREPARE_FILES = [
  "src/lib/prepare-batch.js",
  "src/content/batch-prepare.js",
  "entrypoints/panel/prepare-actions.ts",
  "entrypoints/panel/PrepareBatch.tsx",
];
for (const f of PREPARE_FILES) {
  const src = code(read(f));
  for (const [re, label] of FORBIDDEN) ok(f + " has no " + label, !re.test(src));
  ok(f + " never ticks or checks a box", !/\.checked\s*=[^=]|\.checked\s*=\s*true|setAttribute\(\s*["']checked/.test(src));
  ok(f + " never writes into a page field", !/\.value\s*=[^=]/.test(src));
}
// The batch page module only ever scrolls and focuses (the banner's Go buttons).
const bp = code(read("src/content/batch-prepare.js"));
ok("batch-prepare.js: a page element is only scrolled to and focused", /scrollIntoView/.test(bp) && /\.focus\(/.test(bp) && !/\.(blur|select|reset)\s*\(/.test(bp));
ok("batch-prepare.js forces auto-advance off for batch tabs", /autoAdvance:\s*false/.test(bp));
// The controller can open tabs; it has no way to close one, press anything or run page code of its own.
const pb = code(read("src/lib/prepare-batch.js"));
ok("prepare-batch.js: opens tabs only (chrome.tabs.create / get), never removes or navigates one", !/tabs\.(remove|update|executeScript)|scripting|chrome\./.test(pb));
ok("prepare-batch.js: the fill it asks for is the review overlay (JAF_BATCH_FILL), autoAdvance forced off", /JAF_BATCH_FILL/.test(pb) && /autoAdvance:\s*false/.test(pb));
// The service-worker glue: its only page-facing calls are the check and the fill, and the injection of OUR content script.
const swRaw = read("src/background/service-worker.js");
const swp = code(swRaw.slice(swRaw.indexOf("--- Prepare selected openings"), swRaw.indexOf("--- Scheduled + focus-driven version checks")));
ok("service worker batch glue found", swp.length > 500);
ok("service worker batch glue: no click / submit / dispatch code", !/\.click\s*\(|\.(submit|requestSubmit)\s*\(|dispatchEvent\s*\(|findNextButton|type\s*=\s*["']submit["']/.test(swp));
ok("service worker batch glue: injects only OUR content bundle (content-scripts/content.js)", /files: CONTENT_FILES/.test(swp) && !/\bfunc\s*:/.test(swp));
ok("service worker batch glue: never closes a tab", !/tabs\.remove/.test(swp));
// The web may start a batch only through the gated receiver; tenant wildcard never reaches connect/sync.
ok("connect handoff and sync signals use the exact-origin gate (no wildcard)", /connectOriginAllowed\(senderOrigin\(sender\)\)\) return;/.test(sw));

console.log(`${tag} ${pass} passed, ${fail} failed`);
if (fails.length) { console.log(`${tag} Failures:`); fails.forEach((f) => console.log("  x " + f)); process.exit(1); }
console.log(`${tag} All green.`);
