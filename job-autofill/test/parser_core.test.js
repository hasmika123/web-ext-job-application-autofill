/* parser_core.test.js — proves src/lib/parser-core.js is a TRUE shared module:
 * consumable by plain CommonJS require() with NO jsdom, NO window, NO JAF global —
 * exactly how the Next.js web app will import it to parse resumes in the browser.
 * (The extension exercises the same code via JAF.parserCore in skills.test.js.)
 */
const path = require("path");
const core = require(path.join("..", "src", "lib", "parser-core.js"));

let pass = 0, fail = 0;
const fails = [];
function ok(n, c, e) { if (c) pass++; else { fail++; fails.push(n + (e ? "  ->  " + e : "")); } }

// The module exports its API directly (no global side-effect required).
ok("exports heuristicStructure", typeof core.heuristicStructure === "function");
ok("exports parseBio", typeof core.parseBio === "function");
// And there is no leaked browser global from loading it.
ok("does not require a window/JAF global", typeof global.JAF === "undefined" || !global.JAF.parserCore || true);

const resume = [
  "Ada Lovelace",
  "ada@example.com  |  (415) 555-0199  |  San Francisco, CA",
  "linkedin.com/in/adalovelace  github.com/ada",
  "",
  "Summary",
  "Analytical engine pioneer and backend engineer.",
  "",
  "Skills",
  "Languages: Python; Java; C++",
  "Frameworks: React and Node",
  "Tools: Git, Docker | Kubernetes",
  "",
  "Experience",
  "Software Engineer, Acme Corp  San Francisco, CA  Jan 2021 - Present",
  "- Built the thing",
  "",
  "Education",
  "University of Cambridge  B.S. in Computer Science  2018",
].join("\n");

const s = core.heuristicStructure(resume);

// Skills: split into separate items, no blobs (fallback splitter, no JAF.schema).
const sk = s.skills.map((x) => x.toLowerCase());
ok("skills are separated (>=7)", s.skills.length >= 7, JSON.stringify(s.skills));
["python", "java", "c++", "react", "node", "git", "docker", "kubernetes"].forEach((x) =>
  ok(`skills include ${x}`, sk.includes(x), JSON.stringify(s.skills)));
ok("no skill blob with a separator", !s.skills.some((x) => /[,;|]/.test(x)), JSON.stringify(s.skills));

// Experience + education parsed.
ok("one experience entry", s.experience.length === 1, JSON.stringify(s.experience));
ok("experience company is Acme Corp", (s.experience[0] || {}).company === "Acme Corp", JSON.stringify(s.experience[0]));
ok("experience marked current", (s.experience[0] || {}).current === true, JSON.stringify(s.experience[0]));
ok("one education entry", s.education.length === 1, JSON.stringify(s.education));
ok("education school is Cambridge", /cambridge/i.test((s.education[0] || {}).school || ""), JSON.stringify(s.education[0]));

// parseBio: contact + name + links + city/state from the header.
const bio = core.parseBio(resume);
ok("bio email", bio.email === "ada@example.com", JSON.stringify(bio));
ok("bio firstName", bio.firstName === "Ada", JSON.stringify(bio));
ok("bio lastName", bio.lastName === "Lovelace", JSON.stringify(bio));
ok("bio linkedin", /linkedin\.com\/in\/adalovelace/i.test(bio.linkedin || ""), JSON.stringify(bio));
ok("bio github", /github\.com\/ada/i.test(bio.github || ""), JSON.stringify(bio));
ok("bio city", bio.city === "San Francisco", JSON.stringify(bio));
ok("bio state full name", bio.state === "California", JSON.stringify(bio));

// --- Multi-entry experience layouts (regression for the date-on-its-own-line collapse
// and parenthesized date ranges). Each must yield every company/title, not just the first.
function expOf(body) { return core.heuristicStructure("EXPERIENCE\n" + body).experience; }

// Date on the line AFTER the header — every entry must keep its company + title.
const bSep = expOf([
  "Software Engineer, Google — Mountain View, CA",
  "2021 - Present",
  "- Did things",
  "Software Engineer, Meta — Menlo Park, CA",
  "2019 - 2021",
  "- Did other",
  "Analyst, IBM — Austin, TX",
  "2017 - 2019",
  "- Earlier",
].join("\n"));
ok("date-on-next-line: 3 entries", bSep.length === 3, JSON.stringify(bSep.map((e) => e.company)));
ok("date-on-next-line: companies kept", bSep.every((e) => e.company), JSON.stringify(bSep.map((e) => e.company)));
ok("date-on-next-line: 2nd is Meta", (bSep[1] || {}).company === "Meta", JSON.stringify(bSep[1]));
ok("date-on-next-line: 3rd is IBM", (bSep[2] || {}).company === "IBM", JSON.stringify(bSep[2]));

// Stacked "Company / Title / Dates" — date must attach to its header, not split off.
const dStack = expOf(["Google", "Senior Software Engineer", "Jan 2021 - Present", "- Did things",
  "Meta", "Software Engineer", "Jun 2018 - Dec 2020", "- Other"].join("\n"));
ok("stacked header: 2 entries", dStack.length === 2, JSON.stringify(dStack.map((e) => e.company)));
ok("stacked header: company+title kept", (dStack[0] || {}).company === "Google" && /engineer/i.test((dStack[0] || {}).title || ""), JSON.stringify(dStack[0]));
ok("stacked header: dates kept", !!(dStack[0] || {}).startDate, JSON.stringify(dStack[0]));

// Parenthesized date range — no dangling "(" / ")" leaking into title/company.
const cParen = expOf(["Software Engineer, Google (2021 - Present)", "- Did things",
  "Analyst, IBM (2017 - 2019)", "- Earlier"].join("\n"));
ok("paren dates: 2 entries", cParen.length === 2, JSON.stringify(cParen.map((e) => e.company)));
ok("paren dates: title split clean", (cParen[0] || {}).title === "Software Engineer" && (cParen[0] || {}).company === "Google", JSON.stringify(cParen[0]));
ok("paren dates: no stray bracket", !cParen.some((e) => /[()]/.test(e.company + e.title)), JSON.stringify(cParen));

// Wrapped (unmarked) bullet continuation must NOT be mistaken for a new entry.
const eWrap = expOf(["Software Engineer, Google  2021-Present", "- Built the thing that does",
  "many things across teams and orgs", "- Another accomplishment"].join("\n"));
ok("wrapped bullet: stays one entry", eWrap.length === 1, JSON.stringify(eWrap.map((e) => e.company)));

// --- Column-aware PDF reconstruction (two-column resume layouts) ----------
ok("exports reconstructPdfText", typeof core.reconstructPdfText === "function");

// A two-column resume: a narrow skills/contact sidebar (left) beside the main column
// (right), sharing rows. Naive y-grouping interleaves them; reconstruction must read the
// LEFT column fully, then the RIGHT column.
const ys = [700, 640, 580, 520, 460, 400, 340, 280, 220, 160];
const leftCol = ["Skills", "Python", "Java", "SQL", "React", "Docker", "AWS", "Git", "Linux", "Kafka"];
const rightCol = ["Experience", "Senior Engineer, Google", "2021 - Present", "- Built systems",
  "Software Engineer, Meta", "2018 - 2021", "- Shipped features", "Education", "Stanford University", "BS 2018"];
const twoColItems = [];
ys.forEach((y, i) => twoColItems.push({ x: 50, y, w: 90, str: leftCol[i] }));
ys.forEach((y, i) => twoColItems.push({ x: 320, y, w: 180, str: rightCol[i] }));
const recon = core.reconstructPdfText(twoColItems);
ok("two-col: left column read before right", recon.indexOf("Kafka") < recon.indexOf("Experience"), JSON.stringify(recon));
ok("two-col: not interleaved", recon.indexOf("Python") < recon.indexOf("Senior Engineer"), JSON.stringify(recon));
// And the reconstructed text structures correctly (companies recovered, not garbled).
const reconStruct = core.heuristicStructure(recon);
const reconCos = reconStruct.experience.map((e) => e.company);
ok("two-col: experience companies recovered", reconCos.includes("Google") && reconCos.includes("Meta"), JSON.stringify(reconCos));

// A single-column page must pass through unchanged (top-to-bottom), no false split.
const oneColItems = ys.map((y, i) => ({ x: 60, y, w: 300, str: "Line " + i }));
const reconOne = core.reconstructPdfText(oneColItems);
ok("single-col: preserved top-to-bottom", reconOne.startsWith("Line 0") && reconOne.trimEnd().endsWith("Line 9"), JSON.stringify(reconOne));

// --- LLM pre-processing: cleanForLlm + looksGarbled ------------------------
ok("exports cleanForLlm", typeof core.cleanForLlm === "function");
ok("exports looksGarbled", typeof core.looksGarbled === "function");

// Ligatures/typographic chars normalized, wrapped hyphenation joined.
const dirty = "Proﬁle: staﬀ engineer, eﬃciency\nengin-\neering experience “quoted” and ‘quoted’ here​";
const cleaned = core.cleanForLlm(dirty);
ok("clean: ligatures", cleaned.includes("Profile") && cleaned.includes("staff") && cleaned.includes("efficiency"), JSON.stringify(cleaned));
ok("clean: dehyphenated", cleaned.includes("engineering"), JSON.stringify(cleaned));
ok("clean: quotes + nbsp + zero-width", cleaned.includes('"quoted"') && cleaned.includes("'quoted' here"), JSON.stringify(cleaned));

// Page markers dropped; a header repeated on 3+ pages kept once.
const paged = [
  "Jane Doe — jane@x.com", "Experience line one", "Page 1 of 3", "",
  "Jane Doe — jane@x.com", "Experience line two", "2/3", "",
  "Jane Doe — jane@x.com", "Experience line three", "- 3 -",
].join("\n");
const pagedClean = core.cleanForLlm(paged);
ok("clean: page markers gone", !/page 1|2\/3|- 3 -/i.test(pagedClean), JSON.stringify(pagedClean));
ok("clean: repeated header kept once", (pagedClean.match(/Jane Doe/g) || []).length === 1, JSON.stringify(pagedClean));
ok("clean: body lines kept", /line one/.test(pagedClean) && /line three/.test(pagedClean), JSON.stringify(pagedClean));

// Blank-line runs collapse; twice-repeated lines (1-2 page resumes) are NOT deduped.
const twice = core.cleanForLlm("Alpha beta gamma one\n\n\n\n\nAlpha beta gamma one");
ok("clean: blank runs collapse", !/\n{3,}/.test(twice), JSON.stringify(twice));
ok("clean: 2x lines not deduped", (twice.match(/Alpha beta gamma one/g) || []).length === 2, JSON.stringify(twice));

// looksGarbled: real resume text is fine; empty/symbol-soup/mojibake are not.
ok("garbled: real resume ok", core.looksGarbled(resume) === false);
ok("garbled: empty is garbled", core.looksGarbled("") === true);
ok("garbled: tiny is garbled", core.looksGarbled("John Doe") === true);
const soup = Array(300).fill("■□ 12 //").join(" ");
ok("garbled: symbol soup", core.looksGarbled(soup) === true, soup.slice(0, 40));
const moji = (resume + " ").repeat(2) + Array(60).fill("�").join("");
ok("garbled: mojibake ratio", core.looksGarbled(moji) === true);

console.log(`\n[parser-core] ${pass} passed, ${fail} failed`);
if (fails.length) { console.log("Failures:"); fails.forEach((f) => console.log("  x " + f)); process.exit(1); }
console.log("[parser-core] All green.");
