import { describe, expect, it } from "vitest";
import { popularTemplates } from "./BottomCards";

describe("popularTemplates", () => {
  it("is the registry's templates that are enabled", () => {
    expect(popularTemplates(["modern"], [], "modern").map((t) => t.id)).toEqual(["modern"]);
  });

  it("ignores ids the registry does not have, and ids that are not enabled", () => {
    expect(popularTemplates(["modern", "classic"], ["classic", "modern"], "modern").map((t) => t.id)).toEqual(["modern"]);
    expect(popularTemplates(["classic"], ["modern"], "modern").map((t) => t.id)).toEqual(["modern"]);
  });

  it("never comes back empty: the default template stands in", () => {
    expect(popularTemplates([], [], "modern").map((t) => t.id)).toEqual(["modern"]);
    expect(popularTemplates(["nope"], ["nope"], "unknown-default").map((t) => t.id)).toEqual(["modern"]);
  });

  it("does not repeat a template named twice", () => {
    expect(popularTemplates(["modern"], ["modern", "modern"], "modern")).toHaveLength(1);
  });
});
