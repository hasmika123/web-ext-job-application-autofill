/**
 * Content-script entrypoint (W0.2) — registers the existing content bundle with the SAME
 * matches / all_frames / run_at as the legacy manifest, with NO behavior change.
 *
 * The engine + content IIFE modules are imported in declaration order (the exact order the
 * old manifest `content_scripts.js` array used) and self-attach to `window.JAF` in the
 * isolated world; `main()` is intentionally empty. WXT bundles them into one self-contained
 * file at `content-scripts/content.js`, which the popup/review also inject programmatically
 * via chrome.scripting.executeScript on non-matched pages (activeTab).
 */
import "../src/config/rules.js";
import "../src/lib/rules-store.js";
import "../src/lib/schema.js";
import "../src/lib/field-cache.js";
import "../src/content/adapters/base.js";
import "../src/content/adapters/generic.js";
import "../src/content/adapters/greenhouse.js";
import "../src/content/adapters/lever.js";
import "../src/content/adapters/ashby.js";
import "../src/content/adapters/workable.js";
import "../src/content/adapters/workday.js";
import "../src/content/adapters/indeed.js";
import "../src/lib/job-capture.js";
import "../src/lib/app-tracking.js";
import "../src/content/submit-detect.js";
import "../src/lib/field-map.js";
import "../src/content/field-mapper.js";
import "../src/content/assist.js";
import "../src/content/filler.js";
import "../src/content/content-script.js";

export default defineContentScript({
  matches: [
    "https://*.myworkdayjobs.com/*",
    "https://*.myworkday.com/*",
    "https://*.greenhouse.io/*",
    "https://boards.greenhouse.io/*",
    "https://job-boards.greenhouse.io/*",
    "https://jobs.lever.co/*",
    "https://jobs.ashbyhq.com/*",
    "https://apply.workable.com/*",
    "https://*.workable.com/*",
    "https://*.icims.com/*",
    "https://*.taleo.net/*",
    "https://jobs.smartrecruiters.com/*",
    "https://*.bamboohr.com/*",
    "https://*.jobvite.com/*",
    "https://smartapply.indeed.com/*",
  ],
  allFrames: true,
  runAt: "document_idle",
  main() {
    // No-op: the imported IIFEs build window.JAF and register the message listeners.
  },
});
