import type { NextConfig } from "next";
import path from "node:path";

// The repo root is the npm-workspace root (root package.json + lockfile). web/ is a member,
// so `next` and @kiwiply/ui resolve from the ROOT node_modules — Turbopack + file-tracing
// must be rooted here (not /web), or they refuse to compile/trace files outside /web.
const repoRoot = path.join(__dirname, "..");

const nextConfig: NextConfig = {
  // Locked hosting model: run as a long-running container via `next start`, not
  // serverless. Standalone output emits a self-contained server (.next/standalone)
  // for a lean Docker image. See web/CLAUDE.md "Hosting model (locked)".
  output: "standalone",
  // The shared UI lives in the @kiwiply/ui workspace package; transpile it as part of the
  // app (it ships TS/JSX source, not a build) so it's bundled in — no extra runtime dep.
  transpilePackages: ["@kiwiply/ui"],
  // Root at the workspace root so Turbopack resolves the hoisted `next` + the @kiwiply/ui
  // source. (Standalone output is therefore monorepo-NESTED: .next/standalone/web/server.js.)
  turbopack: {
    root: repoRoot,
  },
  outputFileTracingRoot: repoRoot,
  // PDF export (R0.6, src/lib/pdf.ts): playwright-core stays a plain runtime require (it carries
  // its own dynamic loading), and the route reads resume.css + the fonts from disk, which the file
  // tracer cannot see. Include them so the standalone image has them at ../packages/ui (relative to
  // the server's cwd, web/).
  serverExternalPackages: ["playwright-core"],
  outputFileTracingIncludes: {
    "/api/resumes/[id]/export": [
      "../packages/ui/styles/resume.css",
      "../packages/ui/fonts/*.woff2",
      // pdf.ts loads react + react-dom/server by name at runtime (Next won't let the route import
      // react-dom/server), so the tracer can't see them.
      "./node_modules/react/**/*",
      "./node_modules/react-dom/**/*",
      "../node_modules/react/**/*",
      "../node_modules/react-dom/**/*",
      "../node_modules/scheduler/**/*",
    ],
  },
};

export default nextConfig;
