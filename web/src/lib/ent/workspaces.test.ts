import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as icons from "@kiwiply/ui";
import { MODULE_KEYS } from "@/lib/ent/workspaces";

/**
 * The workspace definitions are API data (`workspaces.json`, X2.2). This is the web's guard that every icon the data names exists in
 * `@kiwiply/ui` and every module the data names is a module the web types, so the menu can never render a missing icon or an unknown module.
 */
const file = resolve(__dirname, "../../../../api/src/main/resources/config/ent/workspaces.json");
const defs = JSON.parse(readFileSync(file, "utf8")) as {
  version: number;
  workspaces: { key: string; slug: string; nav: { key: string; icon: string; module?: string; href: string }[] }[];
};

describe("workspaces.json (as the web consumes it)", () => {
  it("is version 1 with the eight workspaces", () => {
    expect(defs.version).toBe(1);
    expect(defs.workspaces.map((w) => w.slug)).toEqual(["admin", "marketing", "marketing-mgmt", "consultant", "hr", "finance", "accounts", "exec"]);
  });
  it("names only icons that @kiwiply/ui exports", () => {
    const missing = new Set<string>();
    for (const w of defs.workspaces) for (const n of w.nav) if (!(`${n.icon}Icon` in icons)) missing.add(n.icon);
    expect([...missing]).toEqual([]);
  });
  it("names only modules the web knows, and every page lives under /w/<slug>", () => {
    for (const w of defs.workspaces) {
      for (const n of w.nav) {
        if (n.module) expect(MODULE_KEYS as readonly string[]).toContain(n.module);
        expect(n.href.startsWith(`/w/${w.slug}`)).toBe(true);
      }
    }
  });
});
