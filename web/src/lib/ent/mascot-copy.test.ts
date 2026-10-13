import { describe, expect, it } from "vitest";
import { MASCOT_POSES, POSE_KEYS } from "@kiwiply/ui";
import { hashSeed, linesFor, mascotLine } from "./mascot-copy";

describe("mascot copy deck", () => {
  it.each(POSE_KEYS)("%s has 3 to 5 lines", (pose) => {
    expect(linesFor(pose).length).toBeGreaterThanOrEqual(3);
    expect(linesFor(pose).length).toBeLessThanOrEqual(5);
  });

  it("has a deck for exactly the poses the map defines", () => {
    for (const k of Object.keys(MASCOT_POSES)) expect(linesFor(k as keyof typeof MASCOT_POSES)).toBeDefined();
  });

  it("is PII-free: no digits, emails or @, and the only variables are terminology tokens", () => {
    const allowed = new Set(["consultant", "consultants", "marketer", "marketers", "client", "clients", "placement", "placements"]);
    for (const pose of POSE_KEYS) {
      for (const line of linesFor(pose)) {
        expect(line).not.toMatch(/\d|@/);
        for (const m of line.matchAll(/\{([a-z]+)\}/g)) expect(allowed.has(m[1]), `${pose}: {${m[1]}}`).toBe(true);
      }
    }
  });

  it("the same seed always picks the same line; different seeds can differ", () => {
    expect(mascotLine("greet", { seed: "u1:2026-10-13" })).toBe(mascotLine("greet", { seed: "u1:2026-10-13" }));
    const picks = new Set(Array.from({ length: 40 }, (_, i) => mascotLine("greet", { seed: `u${i}` })));
    expect(picks.size).toBeGreaterThan(1);
    expect(hashSeed("a")).toBe(hashSeed("a"));
  });

  it("expands the org's terminology and falls back to the Kiwiply default", () => {
    const celebrate = linesFor("celebrate").filter((l) => l.includes("{consultant}") || l.includes("{placement}"));
    expect(celebrate.length).toBeGreaterThan(0);
    // pick a seed that lands on a terminology line
    const seed = Array.from({ length: 200 }, (_, i) => `s${i}`).find((s) => /\{/.test(linesFor("celebrate")[hashSeed(`celebrate:${s}`) % linesFor("celebrate").length]))!;
    const themed = mascotLine("celebrate", { seed, terms: { consultant: "Talent", placement: "Deployment" } });
    expect(themed).toMatch(/Talent|Deployment/);
    expect(themed).not.toContain("{");
    expect(mascotLine("celebrate", { seed })).toMatch(/consultant|placement/);
  });
});
