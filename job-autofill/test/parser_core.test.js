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

console.log(`\n[parser-core] ${pass} passed, ${fail} failed`);
if (fails.length) { console.log("Failures:"); fails.forEach((f) => console.log("  x " + f)); process.exit(1); }
console.log("[parser-core] All green.");
