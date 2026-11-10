import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SCORE_CONFIG } from "@kiwiply/ui";

vi.mock("@/lib/api", () => ({ serverApiFetch: vi.fn() })); // resume-builder-config imports it (server only)

import { DEFAULT_BUILDER_CONFIG } from "@/lib/resume-builder-config";

describe("the score settings seam", () => {
  it("the builder config's declared score defaults equal the engine's v1 ruleset defaults", () => {
    // The API declares them (ResumeBuilderSettingKeys), the web repeats them for when the API is down,
    // and the engine carries them for tests; all three must stay one table.
    expect(DEFAULT_BUILDER_CONFIG.score).toEqual(DEFAULT_SCORE_CONFIG);
  });
});
