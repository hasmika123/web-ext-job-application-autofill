import { afterEach, describe, expect, it, vi } from "vitest";

const track = vi.fn();
vi.mock("@/lib/analytics", () => ({ track: (...a: unknown[]) => track(...a) }));

import { ONBOARDING_EVENTS, entryFrom, trackOnboarding } from "./events";

afterEach(() => track.mockReset());

describe("onboarding events", () => {
  it("lists the fourteen funnel events of DESIGN 12 and the delight events of DELIGHT 11, snake_case and unique", () => {
    const all = Object.values(ONBOARDING_EVENTS);
    const delight = all.filter((n) => n.startsWith("onboarding_delight_"));
    const names = all.filter((n) => !n.startsWith("onboarding_delight_"));
    expect(names).toHaveLength(14);
    expect(new Set(all).size).toBe(all.length);
    expect(delight).toContain("onboarding_delight_highlight");
    for (const n of all) expect(n).toMatch(/^[a-z]+(_[a-z]+)+$/);
    // the retired events are gone, `profile_setup_parsed` is kept
    expect(names).toContain("profile_setup_parsed");
    for (const gone of ["profile_setup_step", "profile_setup_started", "profile_setup_completed"]) expect(names).not.toContain(gone);
  });

  it("trackOnboarding hands the name and the properties to track as they are", () => {
    trackOnboarding(ONBOARDING_EVENTS.coreConfirmed, { items: 3, merged: 1 });
    expect(track).toHaveBeenCalledWith("onboarding_core_confirmed", { items: 3, merged: 1 });
  });

  it("is the only place the names are spelled: no other source file in the onboarding flow writes one as a string", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const roots = [path.resolve(__dirname, "."), path.resolve(__dirname, "../../components/app-v3/profiles/setup"), path.resolve(__dirname, "../../components/app-v3/profiles")];
    const offenders: string[] = [];
    const pattern = new RegExp(`["'](${Object.values(ONBOARDING_EVENTS).join("|")})["']`);
    for (const dir of roots) {
      for (const f of fs.readdirSync(dir)) {
        if (!/\.(ts|tsx)$/.test(f) || /\.test\./.test(f) || f === "events.ts") continue;
        if (pattern.test(fs.readFileSync(path.join(dir, f), "utf8"))) offenders.push(f);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("entryFrom: where /profiles/setup was opened from", () => {
  it("an explicit ?entry= marker wins", () => {
    expect(entryFrom({ entry: "card" })).toBe("card");
    expect(entryFrom({ entry: "profiles", path: "upload" })).toBe("profiles");
    expect(entryFrom({ entry: "card", from: "welcome", returnTo: "/resume-builder" })).toBe("card");
  });

  it("an unknown marker is ignored, the other signals decide", () => {
    expect(entryFrom({ entry: "newsletter" })).toBe("direct");
    expect(entryFrom({ entry: "welcome" })).toBe("direct"); // `welcome` only ever comes from ?from=welcome
  });

  it("the retired /welcome, the new-resume chooser, the extension and a ?path= deep link", () => {
    expect(entryFrom({ from: "welcome" })).toBe("welcome");
    expect(entryFrom({ returnTo: "/resume-builder?new=profile" })).toBe("chooser");
    expect(entryFrom({ utm: "ext" })).toBe("ext");
    expect(entryFrom({ path: "paste" })).toBe("profiles");
  });

  it("nothing at all is a direct visit", () => {
    expect(entryFrom({})).toBe("direct");
    expect(entryFrom({ entry: null, from: null, returnTo: null, path: null, utm: null })).toBe("direct");
  });
});
