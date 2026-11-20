// Fixture-backed adapter replay. Every .expect.json beside an HTML fixture is an exact mapping
// contract: the real plan must choose the expected controls, fill them, and leave no unexpected
// planned items. This is local jsdom replay; it never submits or calls an ATS.
const fs = require("fs");
const path = require("path");
const { makeWindow, load, loadCore } = require("./harness");

const SRC = [
  "src/lib/field-cache.js",
  "src/content/adapters/generic.js",
  "src/content/adapters/greenhouse.js",
  "src/content/adapters/lever.js",
  "src/content/adapters/ashby.js",
  "src/content/adapters/workable.js",
  "src/content/adapters/indeed.js",
  "src/content/adapters/smartrecruiters.js",
  "src/lib/field-map.js",
  "src/content/field-mapper.js",
  "src/content/required-audit.js",
  "src/content/filler.js",
];
const FIXTURE_ROOT = path.join(__dirname, "fixtures");
const PERSONA = {
  firstName: "Synthetic",
  lastName: "Candidate",
  email: "synthetic@example.test",
  phone: "555-0100",
  linkedin: "https://linkedin.com/in/synthetic-candidate",
  github: "https://github.com/synthetic-candidate",
  website: "https://synthetic.example.test",
  city: "San Francisco",
};
const RESUME = { skills: ["JavaScript", "TypeScript"] };

function fixturePairs(dir) {
  const pairs = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) pairs.push(...fixturePairs(full));
    else if (entry.isFile() && entry.name.endsWith(".expect.json")) {
      const html = full.slice(0, -".expect.json".length) + ".html";
      if (fs.existsSync(html)) pairs.push({ html, expect: full });
    }
  }
  return pairs;
}

function itemMatches(item, spec) {
  return !!item && !!item.el && item.el.matches(spec.sel) && item.kind === spec.kind;
}

async function replay(pair) {
  const expected = JSON.parse(fs.readFileSync(pair.expect, "utf8"));
  const html = fs.readFileSync(pair.html, "utf8");
  const w = makeWindow(html, { url: expected.url });
  loadCore(w);
  SRC.forEach((source) => load(w, source));
  const values = w.JAF.schema.buildFillValues(PERSONA, RESUME, {});
  const plan = w.JAF.filler.buildPlan(values);
  const failures = [];
  if (plan.adapter.id !== expected.adapter) failures.push(`adapter ${plan.adapter.id} != ${expected.adapter}`);

  const entries = [];
  for (const [field, spec] of Object.entries(expected.map || {})) {
    for (const one of Array.isArray(spec) ? spec : [spec]) entries.push({ field, spec: one });
  }
  const used = new Set();
  for (const entry of entries) {
    const index = plan.items.findIndex((item, i) => !used.has(i) && item.field === entry.field && itemMatches(item, entry.spec));
    if (index < 0) failures.push(`${entry.field}: missed ${entry.spec.sel} (${entry.spec.kind})`);
    else used.add(index);
  }
  if (used.size !== plan.items.length) {
    const unexpected = plan.items.filter((_, i) => !used.has(i)).map((item) => `${item.field}:${item.el && item.el.name}`);
    failures.push(`unexpected plan items ${unexpected.join(", ")}`);
  }

  for (const field of expected.manual || []) {
    if (!plan.items.some((item) => item.field === field && item.kind === "manual")) failures.push(`${field}: not marked manual`);
  }
  for (const field of expected.absent || []) {
    if (plan.items.some((item) => item.field === field)) failures.push(`${field}: unexpectedly mapped`);
  }

  const clicked = [];
  for (const selector of (expected.submit && expected.submit.neverClick) || []) {
    w.document.querySelectorAll(selector).forEach((el) => el.addEventListener("click", () => clicked.push(selector)));
  }
  for (const item of plan.items) {
    if (item.kind === "manual" || item.kind === "info") continue;
    const ok = await w.JAF.adapterBase.applyItemAsync(item);
    if (!ok) failures.push(`${item.field}: apply returned false`);
  }
  for (const index of used) {
    const item = plan.items[index];
    if (item.kind === "boolean" || item.kind === "choice") {
      if (!item.el.checked && !Array.from(w.document.querySelectorAll(`input[type="radio"][name="${item.el.name}"]`)).some((el) => el.checked)) failures.push(`${item.field}: choice stayed empty`);
    } else if (String(item.el.value || "").trim() === "") failures.push(`${item.field}: value stayed empty`);
  }
  if (clicked.length) failures.push(`submit control clicked: ${clicked.join(", ")}`);
  const gaps = w.JAF.requiredAudit.findRequiredEmpty(w.document);
  const wantedGaps = expected.required && expected.required.leftEmptyAfterFill || 0;
  if (gaps.length !== wantedGaps) failures.push(`required gaps ${gaps.length} != ${wantedGaps}`);
  return { file: path.relative(FIXTURE_ROOT, pair.html), adapter: plan.adapter.id, mapped: used.size, expected: entries.length, gaps: gaps.length, failures };
}

(async function run() {
  const pairs = fixturePairs(FIXTURE_ROOT);
  const report = [];
  for (const pair of pairs) report.push(await replay(pair));
  const failures = report.flatMap((result) => result.failures.map((failure) => `${result.file}: ${failure}`));
  const mapped = report.reduce((sum, result) => sum + result.mapped, 0);
  const expected = report.reduce((sum, result) => sum + result.expected, 0);
  console.log(`[fixture_replay] ${report.length} fixture(s), ${mapped}/${expected} mapped, ${failures.length} failure(s)`);
  report.forEach((result) => console.log(`  ${result.file}: ${result.mapped}/${result.expected}, required gaps ${result.gaps}`));
  if (failures.length) { failures.forEach((failure) => console.log(`  x ${failure}`)); process.exit(1); }
})();
