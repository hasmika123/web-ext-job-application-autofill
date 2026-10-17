#!/usr/bin/env node
/**
 * Regenerates the resume template thumbnails (packages/ui/src/resume/thumbs/<id>.png, 240x340) from the shared sample
 * resume. The renderer is TypeScript/TSX, so this does not import it: it sets THUMBS_GEN=1 and runs the guarded vitest
 * file src/lib/template-thumbs.gen.test.tsx (vitest is spawned directly, no shell, so it behaves the same on Windows).
 *
 *   npm run thumbs:templates -w web
 *   npm run thumbs:templates -w web -- --only engineer,sidebar --out ./tmp-thumbs
 *   PDF_BROWSER_URL=ws://localhost:3000 npm run thumbs:templates -w web      # the chromium sidecar
 *   PDF_LOCAL_CHANNEL=chrome npm run thumbs:templates -w web                 # pick the local browser
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const out = { only: "", out: "" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--only") out.only = argv[++i] ?? "";
    else if (a.startsWith("--only=")) out.only = a.slice("--only=".length);
    else if (a === "--out") out.out = argv[++i] ?? "";
    else if (a.startsWith("--out=")) out.out = a.slice("--out=".length);
    else {
      console.error(`render-template-thumbs: unknown argument "${a}" (use --only <id,id> and --out <dir>)`);
      process.exit(2);
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const env = { ...process.env, THUMBS_GEN: "1", THUMBS_ONLY: args.only, THUMBS_OUT: args.out ? path.resolve(process.cwd(), args.out) : "" };

const require = createRequire(import.meta.url);
const vitestBin = path.join(path.dirname(require.resolve("vitest/package.json")), "vitest.mjs");

const child = spawn(process.execPath, [vitestBin, "run", "src/lib/template-thumbs.gen.test.tsx"], { cwd: webDir, env, stdio: "inherit" });
child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
