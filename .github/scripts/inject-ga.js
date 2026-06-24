/* inject-ga.js — build-time injection of GA4 Measurement Protocol credentials.
 *
 * Phase 6: the extension sends analytics via the GA4 Measurement Protocol from the
 * service worker, which means the measurement id + api secret must be present in the
 * shipped bundle. We keep them OUT of the committed source (CLAUDE.md: never commit a
 * key) and inject them here, at package time in CI, from GitHub secrets — so the repo
 * stays secret-free and only the build artifact carries the values.
 *
 * Behaviour:
 *   - No GA_MEASUREMENT_ID in the env  -> no-op (analytics stays disabled in this build).
 *   - GA_MEASUREMENT_ID present        -> replace the empty DEFAULT_* constants in
 *                                         analytics.js with the real values.
 *
 * It is intentionally strict: if the constants can't be found (e.g. a refactor renamed
 * them), it FAILS rather than silently shipping a build with no analytics.
 */
const fs = require("fs");
const path = require("path");

const FILE = path.resolve(__dirname, "../../job-autofill/src/lib/analytics.js");

const measurementId = (process.env.GA_MEASUREMENT_ID || "").trim();
const apiSecret = (process.env.GA_API_SECRET || "").trim();

if (!measurementId) {
  console.log("[inject-ga] GA_MEASUREMENT_ID not set — leaving analytics disabled in this build (no-op).");
  process.exit(0);
}
if (!apiSecret) {
  console.error("[inject-ga] GA_MEASUREMENT_ID is set but GA_API_SECRET is empty. Set both or neither.");
  process.exit(1);
}

let src = fs.readFileSync(FILE, "utf8");

function replaceConst(name, value, text) {
  // Match:  const NAME = "...";   (any current string contents)
  const re = new RegExp("const " + name + ' = "[^"]*";');
  if (!re.test(text)) {
    console.error(`[inject-ga] Could not find \`const ${name} = "...";\` in ${FILE}. Refactor? Aborting.`);
    process.exit(1);
  }
  // JSON.stringify safely escapes any character in the secret.
  return text.replace(re, "const " + name + " = " + JSON.stringify(value) + ";");
}

src = replaceConst("DEFAULT_MEASUREMENT_ID", measurementId, src);
src = replaceConst("DEFAULT_API_SECRET", apiSecret, src);

// Syntax sanity check: compile (without executing) so a bad injection can't ship.
try {
  new Function(src); // eslint-disable-line no-new-func
} catch (e) {
  console.error("[inject-ga] Injected analytics.js failed to parse: " + e.message);
  process.exit(1);
}

fs.writeFileSync(FILE, src);
console.log(`[inject-ga] Injected GA credentials: measurement_id=${measurementId}, api_secret length=${apiSecret.length}.`);
