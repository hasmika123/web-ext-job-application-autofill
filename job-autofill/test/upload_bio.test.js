// Tests for upload filename generation + always-ask bio update candidates.
const { makeWindow, loadCore } = require("./harness");
let pass = 0, fail = 0;
const fails = [];
function ok(n, c, e) { if (c) pass++; else { fail++; fails.push(n + (e ? "  ->  " + e : "")); } }
function eq(n, g, w) { ok(n, JSON.stringify(g) === JSON.stringify(w), `got ${JSON.stringify(g)} want ${JSON.stringify(w)}`); }

const w = makeWindow();
loadCore(w);
const S = w.JAF.schema;

/* ---- uploadResumeName: generic name for the application upload only ---- */
eq("upload name: full name + pdf", S.uploadResumeName({ firstName: "Hasmika", lastName: "Reddy" }, "MyCoolResume_v3.pdf"), "hasmika_reddy_resume.pdf");
eq("upload name: preserves .docx ext", S.uploadResumeName({ firstName: "John", lastName: "Doe" }, "John Doe CV.docx"), "john_doe_resume.docx");
eq("upload name: strips punctuation/spaces", S.uploadResumeName({ firstName: " Mary-Jane ", lastName: "O'Neil" }, "r.pdf"), "maryjane_oneil_resume.pdf");
eq("upload name: only first name", S.uploadResumeName({ firstName: "Cher", lastName: "" }, "x.pdf"), "cher_resume.pdf");
eq("upload name: no name falls back", S.uploadResumeName({}, "resume_final.pdf"), "resume.pdf");
eq("upload name: no ext defaults pdf", S.uploadResumeName({ firstName: "A", lastName: "B" }, "noext"), "a_b_resume.pdf");

/* ---- bioUpdateCandidates: always-ask diff (fills + replacements) ---- */
const bio = Object.assign(S.emptyBio(), { firstName: "Has", lastName: "Reddy", email: "old@x.com", phone: "" });
const parsed = { firstName: "Has", lastName: "Reddy", email: "new@x.com", phone: "404-555-1212", city: "Atlanta", notAField: "ignore" };
const cands = S.bioUpdateCandidates(bio, parsed);
const byKey = Object.fromEntries(cands.map((c) => [c.key, c]));
ok("diff: unchanged fields excluded (firstName/lastName)", !byKey.firstName && !byKey.lastName);
ok("diff: changed email flagged old->new", byKey.email && byKey.email.from === "old@x.com" && byKey.email.to === "new@x.com" && byKey.email.isEmpty === false);
ok("diff: empty phone flagged isEmpty", byKey.phone && byKey.phone.to === "404-555-1212" && byKey.phone.isEmpty === true);
ok("diff: empty city flagged", byKey.city && byKey.city.isEmpty === true);
ok("diff: non-bio key ignored", !byKey.notAField);
ok("diff: nothing-new yields empty list", S.bioUpdateCandidates(bio, { firstName: "Has", email: "old@x.com" }).length === 0);

console.log(`\n[upload_bio] ${pass} passed, ${fail} failed`);
if (fails.length) { fails.forEach((f) => console.log("  x " + f)); process.exit(1); }
console.log("[upload_bio] All green.");
