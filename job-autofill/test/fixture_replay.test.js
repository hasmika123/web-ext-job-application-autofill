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
  "src/content/batch-prepare.js",
];
const FIXTURE_ROOT = path.join(__dirname, "fixtures");
const EXT_ROOT = path.resolve(__dirname, "..");
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
  const manifestPath = path.join(dir, ".fixture-replay.json");
  if (!fs.existsSync(manifestPath)) throw new Error(`missing fixture replay manifest: ${manifestPath}`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (!Array.isArray(manifest.fixtures) || !manifest.fixtures.length) throw new Error("fixture replay manifest must list at least one HTML fixture");
  const pairs = [];
  const listedExpectations = new Set();
  for (const relative of manifest.fixtures) {
    if (typeof relative !== "string" || !relative.endsWith(".html")) throw new Error(`manifest entry is not an HTML path: ${relative}`);
    const html = path.resolve(dir, relative);
    if (!html.startsWith(dir + path.sep) || !fs.existsSync(html)) throw new Error(`manifest HTML fixture is missing: ${relative}`);
    const expect = html.slice(0, -".html".length) + ".expect.json";
    if (!fs.existsSync(expect)) throw new Error(`manifest fixture has no sidecar: ${relative}`);
    listedExpectations.add(path.normalize(expect));
    pairs.push({ html, expect });
  }
  const sidecars = (current) => fs.readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(current, entry.name);
    return entry.isDirectory() ? sidecars(full) : entry.isFile() && entry.name.endsWith(".expect.json") ? [full] : [];
  });
  const unlisted = sidecars(dir).filter((file) => !listedExpectations.has(path.normalize(file)));
  if (unlisted.length) throw new Error(`fixture sidecar is not listed in .fixture-replay.json: ${path.relative(dir, unlisted[0])}`);
  return pairs;
}

function textOf(el) {
  return String(el && (el.innerText || el.textContent || el.value || el.getAttribute("aria-label") || "")).replace(/\s+/g, " ").trim();
}

function sortedLabels(items, audit) {
  return items.map((el) => audit.describe(el)).sort();
}

function assertExpected(value, expected, message, failures) {
  if (expected !== undefined && JSON.stringify(value) !== JSON.stringify(expected)) failures.push(`${message} ${JSON.stringify(value)} != ${JSON.stringify(expected)}`);
}

function checkNoSubmit(w, expected, failures) {
  const selectors = (expected.submit && expected.submit.neverClick) || [];
  for (const selector of selectors) {
    if (!w.document.querySelector(selector)) failures.push(`submit guard selector missing: ${selector}`);
  }
  const next = w.JAF.batchPrepare && w.JAF.batchPrepare.nextStepButton ? w.JAF.batchPrepare.nextStepButton() : w.JAF.adapterBase.findNextButton();
  const wanted = expected.submit && expected.submit.next;
  if (wanted == null && next) failures.push(`submit guard exposed a next button: ${textOf(next)}`);
  if (wanted != null && (!next || !next.matches(wanted))) failures.push(`next button ${next ? textOf(next) : "none"} != ${wanted}`);
  if (next && /\b(submit|apply|finish|complete|send)\b/i.test(textOf(next))) failures.push(`submit-like button returned as next: ${textOf(next)}`);
  return next ? textOf(next) : null;
}

function fixtureReportPath() {
  return path.join(EXT_ROOT, ".output", "fixture-report.json");
}

function fixtureSafetyFailures(html) {
  const failures = [];
  if (/<script\b|\son[a-z-]+\s*=|data:[^,;]+;base64,/i.test(html)) failures.push("contains executable content or a base64 blob");
  if (/(?:href|src|action|formaction|poster|cite|background|manifest|srcset|imagesrcset)\s*=\s*["']https?:\/\/(?!fixture\.invalid(?:["'/]))/i.test(html)) failures.push("contains an external URL attribute");
  if (/(?:href|src|action|formaction|poster|cite|background|manifest)\s*=\s*["'][^"']*[?#][^"']*["']/i.test(html)) failures.push("contains a URL query or fragment");
  if (/<(?:input|textarea|select)\b[^>]*\bvalue\s*=/i.test(html)) failures.push("contains a form control value");
  if (/(?:session|access|auth)[_-]?token\s*[=:]/i.test(html)) failures.push("contains a session/token marker");
  const emails = html.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  const allowed = new Set(["synthetic@example.test", "accommodations@example.test"]);
  if (emails.some((email) => !allowed.has(email.toLowerCase()))) failures.push("contains a non-synthetic email");
  return failures;
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
  fixtureSafetyFailures(html).forEach((failure) => failures.push(`fixture safety: ${failure}`));
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

  const beforeGaps = w.JAF.requiredAudit.findRequiredEmpty(w.document);
  if (expected.required && Number.isInteger(expected.required.total) && beforeGaps.length !== expected.required.total) {
    failures.push(`required gaps before fill ${beforeGaps.length} != ${expected.required.total}`);
  }
  const next = checkNoSubmit(w, expected, failures);

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
  const wantedLabels = expected.required && expected.required.leftEmptyLabels || [];
  assertExpected(sortedLabels(gaps, w.JAF.requiredAudit), wantedLabels.slice().sort(), "required gap labels", failures);
  return {
    file: path.relative(FIXTURE_ROOT, pair.html),
    adapter: plan.adapter.id,
    mapped: used.size,
    expected: entries.length,
    requiredBefore: beforeGaps.length,
    gaps: gaps.length,
    gapLabels: sortedLabels(gaps, w.JAF.requiredAudit),
    next,
    failures,
  };
}

(async function run() {
  const pairs = fixturePairs(FIXTURE_ROOT);
  const report = [];
  for (const pair of pairs) report.push(await replay(pair));
  const failures = report.flatMap((result) => result.failures.map((failure) => `${result.file}: ${failure}`));
  const mapped = report.reduce((sum, result) => sum + result.mapped, 0);
  const expected = report.reduce((sum, result) => sum + result.expected, 0);
  const reportDocument = {
    generatedAt: new Date().toISOString(),
    fixtures: report,
    summary: { fixtures: report.length, mapped, expected, failures: failures.length },
  };
  fs.mkdirSync(path.dirname(fixtureReportPath()), { recursive: true });
  fs.writeFileSync(fixtureReportPath(), JSON.stringify(reportDocument, null, 2));
  console.log(`[fixture_replay] ${report.length} fixture(s), ${mapped}/${expected} mapped, ${failures.length} failure(s)`);
  report.forEach((result) => console.log(`  ${result.file}: ${result.mapped}/${result.expected}, required gaps ${result.gaps}`));
  if (failures.length) { failures.forEach((failure) => console.log(`  x ${failure}`)); process.exit(1); }
})();
