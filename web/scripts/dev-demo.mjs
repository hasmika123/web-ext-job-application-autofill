#!/usr/bin/env node
/**
 * `npm run dev:demo -w web`: the local demo without the Spring API or a database.
 * Starts scripts/mock-api.mjs on :8080 and `next dev` pointed at it (DOSSIER_API_URL).
 * DEV ONLY: refuses to run when NODE_ENV=production.
 */
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const webDir = fileURLToPath(new URL("..", import.meta.url));

if (process.env.NODE_ENV === "production") {
  console.error("dev:demo: refusing to run with NODE_ENV=production");
  process.exit(1);
}
const port = process.env.MOCK_API_PORT ?? "8080";
const mockPath = fileURLToPath(new URL("./mock-api.mjs", import.meta.url));
execFileSync(process.execPath, ["scripts/sync-parser-core.mjs"], { cwd: webDir, stdio: "inherit" });
const kids = [
  spawn(process.execPath, [mockPath], { stdio: "inherit", env: { ...process.env, MOCK_API_PORT: port } }),
  spawn("npx", ["next", "dev"], {
    stdio: "inherit",
    shell: true,
    cwd: webDir,
    env: { ...process.env, DOSSIER_API_URL: `http://127.0.0.1:${port}` },
  }),
];
const stop = () => kids.forEach((k) => k.kill());
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
kids.forEach((k) =>
  k.on("exit", (code) => {
    stop();
    process.exit(code ?? 0);
  }),
);
