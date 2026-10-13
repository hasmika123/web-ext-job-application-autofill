import { describe, expect, it } from "vitest";
import {
  assetFileProblem,
  assetErrorMessage,
  changeRows,
  colourProblem,
  draftDiffers,
  draftPatch,
  editableOf,
  normalizeHex,
  previewColours,
  previewLoginProps,
} from "./branding";

const published = { primary: "#0f5fc4", secondary: "#0b7a8a", theme: "LIGHT" as const, welcomeMessage: "Hi", supportEmail: "it@acme.com", logoHash: "aaa" };

describe("editableOf / normalizeHex", () => {
  it("fills defaults so every input is controlled", () => {
    const e = editableOf({});
    expect(e.primary).toMatch(/^#[0-9a-f]{6}$/);
    expect(e.theme).toBe("SYSTEM");
    expect(e.chips).toEqual(["", "", ""]);
  });
  it("normalises hex typing: 3 digits, no hash, upper case; junk is null", () => {
    expect(normalizeHex("ABC")).toBe("#aabbcc");
    expect(normalizeHex("#A1B2C3")).toBe("#a1b2c3");
    expect(normalizeHex("#12")).toBeNull();
    expect(normalizeHex("zzzzzz")).toBeNull();
  });
});

describe("the colour gate (same rule as the API: white text at AA 4.5:1)", () => {
  it("a mid-grey is refused with the sentence and a darker colour that passes", () => {
    const p = colourProblem("#9e9e9e");
    expect(p).not.toBeNull();
    expect(p?.message).toContain("too light for white text");
    expect(p?.message).toContain("4.5:1");
    expect(colourProblem(p!.suggestion)).toBeNull();
  });
  it("a dark blue passes", () => expect(colourProblem("#0f5fc4")).toBeNull());
});

describe("draftPatch: only what changed, never a failing colour", () => {
  const base = editableOf(published);
  it("nothing changed -> empty patch", () => expect(draftPatch(base, { ...base })).toEqual({}));
  it("sends changed text trimmed, and null when emptied", () => {
    expect(draftPatch(base, { ...base, welcomeTitle: " Hello " })).toEqual({ welcomeTitle: "Hello" });
    expect(draftPatch(base, { ...base, supportEmail: "" })).toEqual({ supportEmail: null });
  });
  it("sends a passing colour, withholds a failing one", () => {
    expect(draftPatch(base, { ...base, primary: "#7c3aed" })).toEqual({ primary: "#7c3aed" });
    expect(draftPatch(base, { ...base, primary: "#ffff00" })).toEqual({});
  });
  it("chips are compacted; all empty clears them", () => {
    const withChips = { ...base, chips: ["People", "", "Roles"] as [string, string, string] };
    expect(draftPatch(base, withChips)).toEqual({ featureChips: ["People", "Roles"] });
    expect(draftPatch(withChips, base)).toEqual({ featureChips: null });
  });
});

describe("the publish diff", () => {
  it("equal values -> no rows, not publishable", () => {
    expect(changeRows(published, { ...published })).toEqual([]);
    expect(draftDiffers(published, { ...published })).toBe(false);
  });
  it("lists exactly the changed keys, with colours flagged for swatches", () => {
    const rows = changeRows(published, { ...published, primary: "#7c3aed", welcomeTitle: "Hello", logoHash: "bbb" });
    expect(rows.map((r) => r.key)).toEqual(["primary", "welcomeTitle", "logoHash"]);
    expect(rows[0]).toMatchObject({ label: "Primary colour", from: "#0f5fc4", to: "#7c3aed", colour: true });
    expect(rows[1]).toMatchObject({ from: "not set", to: "Hello" });
    expect(rows[2]).toMatchObject({ label: "Logo", to: "new file" });
  });
  it("a removed logo reads as removed", () => {
    const { logoHash: _gone, ...rest } = published;
    void _gone;
    expect(changeRows(published, rest)[0]).toMatchObject({ key: "logoHash", to: "removed" });
  });
});

describe("upload checks before the request", () => {
  const f = (name: string, type: string, size = 1000) => ({ name, type, size });
  it("SVG and GIF are refused with a reason", () => {
    expect(assetFileProblem("logo", f("logo.svg", "image/svg+xml"))).toContain("SVG");
    expect(assetFileProblem("logo", f("a.gif", "image/gif"))).toContain("GIF");
  });
  it("accepts raster files within the per-kind cap and refuses over it", () => {
    expect(assetFileProblem("logo", f("logo.png", "image/png"))).toBeNull();
    expect(assetFileProblem("favicon", f("f.png", "image/png", 300 * 1024))).toContain("too large");
    expect(assetFileProblem("banner", f("b.jpg", "image/jpeg", 1.5 * 1024 * 1024))).toBeNull();
  });
  it("typed API errors map to a friendly line", () => {
    expect(assetErrorMessage({ status: 415, code: "BRANDING_ASSET_UNSUPPORTED_TYPE", message: "x" })).toContain("PNG, JPEG or WebP");
    expect(assetErrorMessage({ status: 422, code: "BRANDING_ASSET_NOT_SQUARE", message: "A favicon must be square." })).toBe("A favicon must be square.");
  });
});

describe("preview inputs", () => {
  it("the preview keeps the last good colour while a colour fails the gate", () => {
    const d = { ...editableOf(published), primary: "#ffff00" };
    expect(previewColours(d, { primary: "#0f5fc4", secondary: "#0b7a8a" })).toEqual({ primary: "#0f5fc4", secondary: "#0b7a8a" });
    expect(previewColours({ ...d, primary: "#7c3aed" }, { primary: "#0f5fc4", secondary: "#0b7a8a" }).primary).toBe("#7c3aed");
  });
  it("the login props come from the draft: blank means default, chips compacted, no Microsoft button", () => {
    const d = { ...editableOf(published), welcomeTitle: "  ", supportEmail: "help@acme.com", chips: ["A", "", "C"] as [string, string, string] };
    expect(previewLoginProps(d, "Acme", "blob:x")).toEqual({
      name: "Acme",
      logoUrl: "blob:x",
      welcomeTitle: null,
      welcomeMessage: "Hi",
      supportEmail: "help@acme.com",
      featureChips: ["A", "C"],
      microsoft: false,
    });
  });
});
