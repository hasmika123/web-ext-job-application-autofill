import { describe, expect, it } from "vitest";
import type { Completeness } from "@/lib/profile-items";
import { PERSONAL_PARTS, buildTiles, deriveProfile } from "./derive";

const parts = (done: string[]): Completeness["parts"] =>
  Object.fromEntries(["identity", "location", "headline", "summary", "links", "experience", "education", "skills", "preferences"].map((k) => [k, { weight: 5, done: done.includes(k) }]));

describe("headline and summary on the profile (R1.6)", () => {
  it("the profile view uses the saved headline and summary", () => {
    const view = deriveProfile(null, { firstName: "Ada", headline: "Staff engineer", summary: "Builds payment systems." }, [], []);
    expect(view.title).toBe("Staff engineer");
    expect(view.about).toBe("Builds payment systems.");
  });

  it("Personal Info is five parts, headline and summary among them: the tile counts them from the server's meter", () => {
    expect(PERSONAL_PARTS).toEqual(["identity", "location", "headline", "summary", "links"]);
    const tile = (done: string[]) => buildTiles({ score: 0, parts: parts(done), nextAction: null }, []).find((t) => t.key === "personal");
    expect(tile([])).toMatchObject({ status: "todo", detail: "Add" });
    expect(tile(["identity", "location", "links"])).toMatchObject({ status: "partial", detail: "3/5" });
    expect(tile(["identity", "location", "links", "headline"])).toMatchObject({ status: "partial", detail: "4/5" });
    expect(tile(["identity", "location", "links", "headline", "summary"])).toMatchObject({ status: "done", detail: "Completed" });
  });
});
