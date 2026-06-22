import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Locked hosting model: run as a long-running container via `next start`, not
  // serverless. Standalone output emits a self-contained server (.next/standalone)
  // for a lean Docker image. See web/CLAUDE.md "Hosting model (locked)".
  output: "standalone",
  // This repo is a monorepo and the machine has stray lockfiles higher up, so Next's
  // automatic workspace-root inference picks the wrong directory. Pin it to /web.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
