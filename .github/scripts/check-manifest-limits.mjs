#!/usr/bin/env node
/**
 * Fail the build when the generated manifest breaks a Chrome Web Store hard limit.
 *
 * These are rejected at UPLOAD, not at review — the console just says "There was a problem
 * uploading your file" with the offending field, after you have already built, downloaded and
 * dragged the zip in. That happened with `description` at 145/132 on the first attempt, which is
 * why this exists: the limits are cheap to check and expensive to discover by hand.
 *
 * Reads the built manifest (default `job-autofill/.output/chrome-mv3/manifest.json`) so it
 * validates what actually ships, not what the config intends.
 *
 * Usage: node .github/scripts/check-manifest-limits.mjs [path/to/manifest.json]
 */
import { readFileSync } from "node:fs";

const manifestPath = process.argv[2] ?? "job-autofill/.output/chrome-mv3/manifest.json";

/** Chrome Web Store limits. Sources: developer.chrome.com manifest reference + the upload validator. */
const LIMITS = {
  name: 45,
  description: 132,
  short_name: 12,
};

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
} catch (e) {
  console.error(`✗ could not read ${manifestPath}: ${e.message}`);
  console.error("  (build first: npm run build --workspace job-autofill)");
  process.exit(1);
}

const problems = [];

for (const [field, max] of Object.entries(LIMITS)) {
  const value = manifest[field];
  if (value == null) continue; // short_name is optional
  // The store counts characters, and these strings contain non-ASCII (the em dash in the name),
  // so spread into code points rather than using .length on UTF-16 units.
  const length = [...String(value)].length;
  if (length > max) {
    problems.push(`${field} is ${length} characters, limit ${max} — over by ${length - max}`);
  } else {
    console.log(`  ok  ${field}: ${length}/${max}`);
  }
}

// A store item must carry these at all.
for (const field of ["name", "description", "version"]) {
  if (!manifest[field]) problems.push(`${field} is missing or empty`);
}

if (problems.length) {
  console.error(`\n✗ ${manifestPath} would be REJECTED by the Chrome Web Store:`);
  for (const p of problems) console.error(`    - ${p}`);
  console.error("\n  Fix in job-autofill/wxt.config.ts, then rebuild.");
  process.exit(1);
}

console.log(`✓ ${manifestPath} is within Chrome Web Store limits`);
