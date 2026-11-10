import { afterEach, describe, expect, it, vi } from "vitest";
import { boardSamplesBuilt, samplesEnabled } from "./samples";

afterEach(() => vi.unstubAllEnvs());

describe("the sample gate", () => {
  it("opens only for a demo login on a build that opted in", () => {
    expect(samplesEnabled("demo", true)).toBe(true);
    expect(samplesEnabled("demo-org", true)).toBe(true);
    expect(samplesEnabled(" Demo ", true)).toBe(true);
  });

  it("a real account never sees samples, opted-in build or not", () => {
    expect(samplesEnabled("priya.s", true)).toBe(false);
    expect(samplesEnabled("priya@example.com", true)).toBe(false);
    expect(samplesEnabled(null, true)).toBe(false);
    expect(samplesEnabled(undefined, true)).toBe(false);
    expect(samplesEnabled("", true)).toBe(false);
  });

  it("a demo account on a build that did not opt in sees none either", () => {
    expect(samplesEnabled("demo", false)).toBe(false);
  });

  it("the build flag is NEXT_PUBLIC_BOARD_SAMPLES=1 and nothing else", () => {
    vi.stubEnv("NEXT_PUBLIC_BOARD_SAMPLES", "");
    expect(boardSamplesBuilt()).toBe(false);
    expect(samplesEnabled("demo")).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_BOARD_SAMPLES", "true");
    expect(boardSamplesBuilt()).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_BOARD_SAMPLES", "1");
    expect(boardSamplesBuilt()).toBe(true);
    expect(samplesEnabled("demo")).toBe(true);
    expect(samplesEnabled("somebody")).toBe(false);
  });
});
