import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_BUILDER_CONFIG, DEFAULT_DELIGHT_CONFIG, delightOf, type OnboardingDelightConfig, type ResumeBuilderConfig } from "@/lib/resume-builder-config.shared";
import { DelightProvider, HAPTIC_PATTERN, tapHaptic, useDelight, type Delight } from "./delight";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete (navigator as unknown as { vibrate?: unknown }).vibrate;
});

/** `matchMedia` for jsdom: only the two queries the layer asks about. */
function media({ coarse, reduced }: { coarse: boolean; reduced: boolean }) {
  window.matchMedia = ((q: string) => ({
    matches: q.includes("pointer: coarse") ? coarse : q.includes("prefers-reduced-motion") ? reduced : false,
    media: q,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
}
const vibrate = () => {
  const fn = vi.fn(() => true);
  Object.defineProperty(navigator, "vibrate", { value: fn, configurable: true });
  return fn;
};

function config(delight: Partial<OnboardingDelightConfig> = {}, mascot = true): ResumeBuilderConfig {
  return { ...DEFAULT_BUILDER_CONFIG, onboarding: { ...DEFAULT_BUILDER_CONFIG.onboarding, mascot, delight: { ...DEFAULT_DELIGHT_CONFIG, ...delight } } };
}
function read(cfg: ResumeBuilderConfig | null): Delight {
  let seen!: Delight;
  function Probe() {
    seen = useDelight();
    return null;
  }
  render(
    <DelightProvider config={cfg}>
      <Probe />
    </DelightProvider>,
  );
  return seen;
}

beforeEach(() => media({ coarse: true, reduced: false }));

describe("useDelight reads the config", () => {
  it("is on with the declared defaults, the mascot following its own switch", () => {
    const d = read(config());
    expect(d).toMatchObject({ on: true, mascot: true, haptics: true, combo: true, highlights: true, milestones: true, interstitialMs: 1200, interstitials: ["review"], barRider: false, share: true });
  });

  it("the whole layer off turns every feature off, whatever its own switch says", () => {
    const d = read(config({ enabled: false, haptics: true, combo: true, barRider: true }));
    expect(d).toMatchObject({ on: false, mascot: false, haptics: false, combo: false, highlights: false, milestones: false, interstitialMs: 0, interstitials: [], barRider: false, share: false });
  });

  it("the mascot needs both the layer and onboarding.mascot", () => {
    expect(read(config({}, false)).mascot).toBe(false);
    expect(read(config({ enabled: false }, true)).mascot).toBe(false);
  });

  it("each feature switch is its own", () => {
    expect(read(config({ combo: false })).combo).toBe(false);
    expect(read(config({ highlights: false })).highlights).toBe(false);
    expect(read(config({ milestones: false })).milestones).toBe(false);
    expect(read(config({ interstitialMs: 0, interstitials: ["review", "prefs"] }))).toMatchObject({ interstitialMs: 0, interstitials: ["review", "prefs"] });
  });

  it("an API that predates the layer (no delight block) gets the defaults, field by field", () => {
    const old = { ...DEFAULT_BUILDER_CONFIG, onboarding: { ...DEFAULT_BUILDER_CONFIG.onboarding, delight: undefined } } as ResumeBuilderConfig;
    expect(read(old).on).toBe(true);
    expect(delightOf({ onboarding: { delight: { combo: false } } })).toEqual({ ...DEFAULT_DELIGHT_CONFIG, combo: false });
  });

  it("outside a provider everything is off (today's flow)", () => {
    let seen!: Delight;
    function Probe() {
      seen = useDelight();
      return null;
    }
    render(<Probe />);
    expect(seen).toMatchObject({ on: false, mascot: false });
    expect(seen.tap("decision")).toBe(false);
    expect(seen.copy("review.keep", undefined, 1)).toBe("That's a keeper."); // the deck still resolves, for a caller that asks
  });

  it("copy() and phoneCopy() apply the admin's overrides first", () => {
    const d = read(config({ copy: { "review.keep": ["Yep.", "Sure."] } }));
    expect(d.copy("review.keep", undefined, 1)).toBe("Sure.");
    expect(d.phoneCopy("review.skip", undefined, 0)).toBe("No worries."); // the default phone twin
  });

  it("reduced is the OS preference", () => {
    media({ coarse: true, reduced: true });
    expect(read(config()).reduced).toBe(true);
  });
});

describe("tap (haptics)", () => {
  it("is a no-op without the setting", () => {
    const v = vibrate();
    expect(read(config({ haptics: false })).tap("decision")).toBe(false);
    expect(read(config({ enabled: false })).tap("decision")).toBe(false);
    expect(v).not.toHaveBeenCalled();
  });

  it("is a no-op under reduced motion", () => {
    media({ coarse: true, reduced: true });
    const v = vibrate();
    expect(read(config()).tap("decision")).toBe(false);
    expect(v).not.toHaveBeenCalled();
  });

  it("is a no-op where the browser has no vibrate (iOS Safari)", () => {
    expect("vibrate" in navigator).toBe(false);
    expect(read(config()).tap("decision")).toBe(false);
  });

  it("is a no-op on a fine pointer (a mouse)", () => {
    media({ coarse: false, reduced: false });
    const v = vibrate();
    expect(read(config()).tap("decision")).toBe(false);
    expect(v).not.toHaveBeenCalled();
  });

  it("vibrates 10 ms on a decision on a coarse pointer, 20 ms on a milestone, a double tap on the payoff", () => {
    const v = vibrate();
    const d = read(config());
    expect(d.tap("decision")).toBe(true);
    expect(v).toHaveBeenLastCalledWith(10);
    d.tap("milestone");
    expect(v).toHaveBeenLastCalledWith(20);
    d.tap("payoff");
    expect(v).toHaveBeenLastCalledWith([10, 40, 10]);
    expect(HAPTIC_PATTERN.payoff).toEqual([10, 40, 10]);
  });

  it("swallows a throwing vibrate", () => {
    Object.defineProperty(navigator, "vibrate", {
      value: () => {
        throw new Error("blocked");
      },
      configurable: true,
    });
    expect(tapHaptic("decision", { haptics: true, reduced: false })).toBe(false);
  });
});
