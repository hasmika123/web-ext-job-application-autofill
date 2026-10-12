import { describe, expect, it } from "vitest";
import { diffWords, sameWords, tokenize } from "./diff";

const before = (parts: ReturnType<typeof diffWords>) => parts.filter((p) => p.type !== "ins").map((p) => p.text).join("");
const after = (parts: ReturnType<typeof diffWords>) => parts.filter((p) => p.type !== "del").map((p) => p.text).join("");

describe("diffWords", () => {
  it("is one plain part when nothing changed", () => {
    expect(diffWords("Led the migration", "Led the migration")).toEqual([{ type: "same", text: "Led the migration" }]);
    expect(diffWords("", "")).toEqual([]);
  });

  it("marks an inserted word", () => {
    const parts = diffWords("Led the migration", "Led the whole migration");
    expect(parts).toEqual([
      { type: "same", text: "Led the " },
      { type: "ins", text: "whole " },
      { type: "same", text: "migration" },
    ]);
  });

  it("marks a deleted word", () => {
    const parts = diffWords("Led the whole migration", "Led the migration");
    expect(parts).toEqual([
      { type: "same", text: "Led the " },
      { type: "del", text: "whole " },
      { type: "same", text: "migration" },
    ]);
  });

  it("marks a replaced word as a deletion then an insertion", () => {
    const parts = diffWords("Built the API", "Built the service");
    expect(parts.map((p) => p.type)).toEqual(["same", "del", "ins"]);
    expect(parts[1].text).toBe("API");
    expect(parts[2].text).toBe("service");
  });

  it("keeps both texts recoverable (whitespace and line breaks included)", () => {
    const a = "Priya Sharma\nSoftware Engineer\n\nSUMMARY\nBuilt things.\n";
    const b = "Priya Sharma\nSenior Software Engineer\n\nSUMMARY\nBuilt big things quickly.\n";
    const parts = diffWords(a, b);
    expect(before(parts)).toBe(a);
    expect(after(parts)).toBe(b);
  });

  it("handles unicode words", () => {
    const parts = diffWords("Café résumé naïve", "Café résumé façade naïve");
    expect(parts.filter((p) => p.type === "ins").map((p) => p.text).join("").trim()).toBe("façade");
    expect(after(parts)).toBe("Café résumé façade naïve");
  });

  it("degrades to one removed and one added block when the middle is too large for the table", () => {
    const a = Array.from({ length: 2500 }, (_, i) => `a${i}`).join(" ");
    const b = Array.from({ length: 2500 }, (_, i) => `b${i}`).join(" ");
    const parts = diffWords(a, b);
    expect(parts.map((p) => p.type)).toEqual(["del", "ins"]);
    expect(before(parts)).toBe(a);
    expect(after(parts)).toBe(b);
  });
});

describe("tokenize / sameWords", () => {
  it("splits words and whitespace runs", () => {
    expect(tokenize("a  b\nc")).toEqual(["a", "  ", "b", "\n", "c"]);
    expect(tokenize("")).toEqual([]);
  });

  it("ignores whitespace-only differences", () => {
    expect(sameWords("a b", "a  b")).toBe(true);
    expect(sameWords("a b", "a c")).toBe(false);
  });
});
