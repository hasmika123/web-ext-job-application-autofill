import { afterEach, describe, expect, it, vi } from "vitest";

const serverApiFetch = vi.fn();
vi.mock("@/lib/api", () => ({ serverApiFetch: (...args: unknown[]) => serverApiFetch(...args) }));

import { DEFAULT_BUILDER_CONFIG, getBuilderConfig, type ResumeBuilderConfig } from "./resume-builder-config";

afterEach(() => serverApiFetch.mockReset());

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("getBuilderConfig", () => {
  it("returns the API's object when it answers", async () => {
    const live: ResumeBuilderConfig = {
      ...DEFAULT_BUILDER_CONFIG,
      plan: "PRO",
      aiAllowed: true,
      limits: { ...DEFAULT_BUILDER_CONFIG.limits, items: 55 },
    };
    serverApiFetch.mockResolvedValue(json(200, live));
    expect(await getBuilderConfig()).toEqual(live);
    expect(serverApiFetch).toHaveBeenCalledWith("/api/profile/resume-builder/config");
  });

  it("falls back to the defaults when the fetch fails", async () => {
    serverApiFetch.mockRejectedValue(new Error("ECONNREFUSED"));
    expect(await getBuilderConfig()).toBe(DEFAULT_BUILDER_CONFIG);
  });

  it("falls back to the defaults on a non-2xx answer", async () => {
    serverApiFetch.mockResolvedValue(json(401, { title: "Unauthorized" }));
    expect(await getBuilderConfig()).toBe(DEFAULT_BUILDER_CONFIG);
    serverApiFetch.mockResolvedValue(json(503, { code: "FEATURE_PAUSED" }));
    expect(await getBuilderConfig()).toBe(DEFAULT_BUILDER_CONFIG);
  });

  it("falls back to the defaults when the body is not an object", async () => {
    serverApiFetch.mockResolvedValue(new Response("not json", { status: 200 }));
    expect(await getBuilderConfig()).toBe(DEFAULT_BUILDER_CONFIG);
    serverApiFetch.mockResolvedValue(json(200, [1, 2]));
    expect(await getBuilderConfig()).toBe(DEFAULT_BUILDER_CONFIG);
    serverApiFetch.mockResolvedValue(json(200, null));
    expect(await getBuilderConfig()).toBe(DEFAULT_BUILDER_CONFIG);
  });
});

describe("DEFAULT_BUILDER_CONFIG", () => {
  it("is Free with no AI and the documented limits", () => {
    expect(DEFAULT_BUILDER_CONFIG.plan).toBe("FREE");
    expect(DEFAULT_BUILDER_CONFIG.aiAllowed).toBe(false);
    expect(DEFAULT_BUILDER_CONFIG.limits).toEqual({
      sections: 20, items: 40, bullets: 12, bulletChars: 600, summaryChars: 2000, marks: 64, docBytes: 262144,
    });
    // the gallery order: Modern first; every template story appends its id (docs/resume-builder/templates/stories.md)
    expect(DEFAULT_BUILDER_CONFIG.templates.enabled[0]).toBe("modern");
    expect(DEFAULT_BUILDER_CONFIG.templates.enabled.length).toBeGreaterThanOrEqual(1);
    expect(DEFAULT_BUILDER_CONFIG.profile).toEqual({
      itemMaxBytes: 16384,
      maxItemsPerUser: 500,
      maxImportItems: 200,
      bioValueMaxChars: 500,
      bioSummaryMaxChars: 2000,
      setupPromptBelowPercent: 40,
      uploadMaxBytes: 10485760,
    });
  });

  it("has match weights summing to 100", () => {
    const w = DEFAULT_BUILDER_CONFIG.match.weights;
    expect(w.skills + w.title + w.years + w.industry + w.education).toBe(100);
  });
});
