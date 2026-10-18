// @vitest-environment node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

/**
 * The "sample lint" of E2E-A15.0 (ADMIN-E2E-PLAN section 3.5): an admin page component that imports a `sample-data`
 * module fails the build, unless the import line carries an `eslint-disable-next-line no-restricted-imports` that names
 * the story that removes it. This runs the project's real ESLint config over three probes, so deleting the config block
 * (or loosening its pattern) turns this test red.
 */
const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const eslint = new ESLint({ cwd: web });
const inAdmin = (name) => path.join(web, "src/components/admin-v3", name);

async function restricted(code, file) {
  const [res] = await eslint.lintText(code, { filePath: file });
  return res.messages.filter((m) => m.ruleId === "no-restricted-imports");
}

// The first lintText loads the whole Next + TypeScript ESLint config (seconds, and more on a loaded machine).
describe("admin sample lint", { timeout: 180_000 }, () => {
  it("rejects a sample-data import from a new admin page component, at any depth", async () => {
    expect(await restricted(`import { X } from "./sample-data";\nexport const a = X;\n`, inAdmin("newpage/NewPage.tsx"))).toHaveLength(1);
    expect(await restricted(`import { X } from "../sample-data";\nexport const a = X;\n`, inAdmin("common/Probe.tsx"))).toHaveLength(1);
    expect(await restricted(`import { X } from "@/components/admin-v3/ai/sample-data";\nexport const a = X;\n`, path.join(web, "src/app/(admin)/admin/probe/page.tsx"))).toHaveLength(1);
  });

  it("lets an unconverted page opt out per file, naming the story", async () => {
    const code = `// eslint-disable-next-line no-restricted-imports -- sample data stays on this page until A1.3 removes it\nimport { X } from "../sample-data";\nexport const a = X;\n`;
    expect(await restricted(code, inAdmin("users/UsersPage.tsx"))).toHaveLength(0);
  });

  it("does not touch the signed-in app, which has its own sample gate", async () => {
    expect(await restricted(`import { X } from "../sample-data";\nexport const a = X;\n`, path.join(web, "src/components/app-v3/home/Probe.tsx"))).toHaveLength(0);
  });
});
