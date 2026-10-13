import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The enterprise bee must never leak into the regular Kiwiply product (X2.8; public/ent/bee/README.md): no file under the
 * `(marketing)`, `(app)`, `(org)` or `(admin)` route groups (nor the regular product's component trees) may import the
 * enterprise mascot, its copy deck, `MascotPose`/`MascotProvider`, or name the `/ent/bee` asset path.
 */
const SRC = resolve(__dirname, "../..");
const PRODUCT_DIRS = ["app/(marketing)", "app/(app)", "app/(org)", "app/(admin)", "components/app-v2", "components/app-v3", "components/admin-v3", "components/admin-shell", "components/admin", "components/marketing"];
// The regular product has its OWN local `MascotPose` types (marketing/media.tsx, app-v3 setup/delight/poses.ts): those are fine.
// What is forbidden is the enterprise one: the `@kiwiply/ui` export, the web wrapper/copy deck, the asset path, the prop.
const FORBIDDEN = [
  /lib\/ent\/mascot/,
  /\bEnterpriseMascot/,
  /\/ent\/bee/,
  /\bmascotPose=/,
  /import[^;]*\b(MascotPose|MascotProvider|EnterprisePose)\b[^;]*from\s*["']@kiwiply\/ui["']/,
];

function walk(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.flatMap((e) => {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) return walk(p);
    return /\.(tsx?|css|mdx?)$/.test(p) && !/\.test\.tsx?$/.test(p) ? [p] : [];
  });
}

describe("the enterprise bee stays out of the regular product", () => {
  const files = PRODUCT_DIRS.flatMap((d) => walk(join(SRC, d)));

  it("scans a real set of files", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("no regular-product file references the enterprise mascot", () => {
    const offenders = files.filter((f) => FORBIDDEN.some((re) => re.test(readFileSync(f, "utf8")))).map((f) => relative(SRC, f));
    expect(offenders).toEqual([]);
  });
});
