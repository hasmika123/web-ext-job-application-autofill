/**
 * Copy the extension's shared parser-core into the web app at build time.
 *
 * The canonical source is `job-autofill/src/lib/parser-core.js` (a no-build-step,
 * plain-CommonJS module — the single source of truth for resume → structured fields,
 * shared by the extension and this web app). The web app has a build step, so rather
 * than wrestle Next/Turbopack into importing a file outside its project root, we copy
 * the source in here as a normal local module. The copy is gitignored and refreshed by
 * the `predev` / `prebuild` / `test` scripts, so it always tracks the source.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(here, "../../job-autofill/src/lib/parser-core.js");
const outDir = resolve(here, "../src/lib/generated");
const outFile = resolve(outDir, "parser-core.cjs");

const banner =
  "/* GENERATED FILE — DO NOT EDIT.\n" +
  " * Copied from job-autofill/src/lib/parser-core.js by scripts/sync-parser-core.mjs.\n" +
  " * Edit the source there; this copy is refreshed on every dev/build/test. */\n\n";

mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, banner + readFileSync(source, "utf8"));
console.log(`[sync-parser-core] ${source} -> ${outFile}`);
