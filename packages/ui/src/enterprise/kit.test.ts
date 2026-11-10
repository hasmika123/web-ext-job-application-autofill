import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as ui from "../index";

/**
 * Doc-sync (X2.15): every name in the "Kit (promoted to packages/ui in X2.15...)" row of
 * docs/enterprise-v2/16-ui-ux-page-inventory.md s7 is exported from the @kiwiply/ui barrel, and so is every icon it lists.
 */
const DOC = resolve(__dirname, "../../../../docs/enterprise-v2/16-ui-ux-page-inventory.md");

// Named in the row but owned elsewhere (a web hook, the X2.8 story), so not part of this kit.
const NOT_IN_KIT = new Set(["useSave", "MascotPose", "StatusPill", "PipelineBadge"]); // the last two are the names StatePill REPLACES

function kitRow(): string {
  const line = readFileSync(DOC, "utf8").split("\n").find((l) => l.includes("Kit (promoted to `packages/ui` in **X2.15**"));
  if (!line) throw new Error("16 s7 kit row not found");
  return line;
}

describe("enterprise kit export list matches 16 s7", () => {
  const row = kitRow();
  const [componentPart, iconPart = ""] = row.split("icons ");
  const names = [...componentPart.matchAll(/`([A-Za-z]+)`/g)].map((m) => m[1]).filter((n) => /^[A-Z]|^use/.test(n) && !NOT_IN_KIT.has(n));
  // "`MoneyText` (+ band mode)" etc. are already single names; the intro text also backticks `packages/ui` (has a slash, excluded by the regex).

  it("finds the components the doc lists", () => {
    expect(names).toEqual(expect.arrayContaining(["FilterBar", "DataTable", "ReasonSheet", "ConfirmTypedSheet", "HistoryDrawer", "PersonCell", "MemberAvatar", "StatusDot", "StatePill", "QuickActionTiles", "MoneyText", "PriceDelta", "FeatureChip", "AllowanceMeter", "ConsentChip", "ReadinessRing", "KanbanBoard", "WorkloadColumn", "TimelineFeed", "SensitiveTextField"]));
  });

  it.each(["FilterBar", "DataTable", "ReasonSheet", "ConfirmTypedSheet", "HistoryDrawer", "PersonCell", "MemberAvatar", "StatusDot", "StatePill", "QuickActionTiles", "MoneyText", "PriceDelta", "FeatureChip", "AllowanceMeter", "ConsentChip", "ReadinessRing", "KanbanBoard", "WorkloadColumn", "TimelineFeed", "SensitiveTextField"])("exports %s", (name) => {
    expect(typeof (ui as Record<string, unknown>)[name]).toBe("function");
  });

  it("every component name the doc row lists is exported (or explicitly owned elsewhere)", () => {
    for (const n of names) expect((ui as Record<string, unknown>)[n], `${n} missing from @kiwiply/ui`).toBeDefined();
  });

  it("exports the seven icons (briefcase, handshake, calendar-check, clipboard-check, shield-check, building, route)", () => {
    const span = /`([a-z, -]+)`/.exec(iconPart)?.[1] ?? "";
    const listed = span.split(",").map((s) => s.trim());
    expect(listed).toEqual(["briefcase", "handshake", "calendar-check", "clipboard-check", "shield-check", "building", "route"]);
    const pascal = (s: string) => s.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join("") + "Icon";
    for (const k of listed) expect(typeof (ui as Record<string, unknown>)[pascal(k)], `${pascal(k)}`).toBe("function");
  });
});
