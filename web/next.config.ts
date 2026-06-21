import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This repo is a monorepo and the machine has stray lockfiles higher up, so Next's
  // automatic workspace-root inference picks the wrong directory. Pin it to /web.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
