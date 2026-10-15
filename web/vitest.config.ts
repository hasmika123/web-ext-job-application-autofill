import path from "node:path";
import { defineConfig } from "vitest/config";

const repoRoot = path.resolve(__dirname, "..");

/**
 * Unit tests for the web app (Resume Builder R0.5 onwards): the editor reducer, undo history,
 * autosave controller and the editor's keyboard behaviour. `npm run test:unit -w web`.
 * `npm test -w web` runs tsc + eslint and then this.
 *
 * React is pinned: web depends on react 19.2.4 (nested in web/node_modules) while the hoisted copy
 * that @testing-library/react, react-dom and @kiwiply/ui resolve is newer. Two Reacts in one test
 * ("Cannot read properties of null (reading 'useReducer')"), so every `react` / `react-dom` import
 * is pointed at the hoisted copy.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      react: path.join(repoRoot, "node_modules", "react"),
      "react-dom": path.join(repoRoot, "node_modules", "react-dom"),
    },
  },
  test: {
    environment: "jsdom",
    // Several editor/admin suites render large trees in jsdom (10-30 s per file in a full run); the 5 s default makes the
    // first slow test time out under load and cascades (leftover DOM) into the rest of the file. Passing tests are unaffected.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    include: ["src/**/*.test.{ts,tsx}", "eslint-rules/**/*.test.mjs"],
  },
});
