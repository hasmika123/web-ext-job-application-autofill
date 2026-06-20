// Tests for skills splitting (separate skills, not blobs) + parser integration.
const { makeWindow, load, loadCore } = require("./harness");
let pass = 0, fail = 0;
const fails = [];
function ok(n, c, e) { if (c) pass++; else { fail++; fails.push(n + (e ? "  ->  " + e : "")); } }
function eq(n, g, w) { ok(n, JSON.stringify(g) === JSON.stringify(w), `got ${JSON.stringify(g)} want ${JSON.stringify(w)}`); }

const w = makeWindow();
loadCore(w);
const S = w.JAF.schema;

/* ---- splitSkills: many separators, preserve multi-word + special skills ---- */
eq("comma split", S.splitSkills("Python, Java, C++"), ["Python", "Java", "C++"]);
eq("semicolons + pipes", S.splitSkills("Python; Java | Go"), ["Python", "Java", "Go"]);
eq("'and' separator", S.splitSkills("HTML, CSS and JavaScript"), ["HTML", "CSS", "JavaScript"]);
eq("newlines/tabs", S.splitSkills("React\nNode\tDocker"), ["React", "Node", "Docker"]);
eq("preserves CI/CD and R&D and and/or", S.splitSkills("CI/CD, R&D, and/or"), ["CI/CD", "R&D", "and/or"]);
eq("preserves multi-word skills", S.splitSkills("Machine Learning, Amazon Web Services"), ["Machine Learning", "Amazon Web Services"]);
eq("array of blobs flattened", S.splitSkills(["Python, Java", "Go; Rust"]), ["Python", "Java", "Go", "Rust"]);
eq("dedupes case-insensitively", S.splitSkills("Python, python, PYTHON"), ["Python"]);
eq("strips leading bullets", S.splitSkills("• Python\n• Java"), ["Python", "Java"]);
eq("drops over-long blob entries", S.splitSkills(["A normal skill", "x".repeat(60)]), ["A normal skill"]);

/* ---- parser: a skills section blob becomes separate skills ---- */
load(w, "src/lib/parser.js");
const resumeText = [
  "Jane Doe",
  "Skills",
  "Languages: Python; Java; C++",
  "Frameworks: React and Node",
  "Tools: Git, Docker | Kubernetes",
].join("\n");
const structured = w.JAF.parser.heuristicStructure(resumeText);
const sk = structured.skills.map((s) => s.toLowerCase());
ok("parser: skills are separate items (>=7)", structured.skills.length >= 7, JSON.stringify(structured.skills));
["python", "java", "c++", "react", "node", "git", "docker", "kubernetes"].forEach((x) =>
  ok(`parser: includes ${x}`, sk.includes(x), JSON.stringify(structured.skills)));
ok("parser: no blob entry with a comma/semicolon", !structured.skills.some((s) => /[,;|]/.test(s)), JSON.stringify(structured.skills));

console.log(`\n[skills] ${pass} passed, ${fail} failed`);
if (fails.length) { fails.forEach((f) => console.log("  x " + f)); process.exit(1); }
console.log("[skills] All green.");
