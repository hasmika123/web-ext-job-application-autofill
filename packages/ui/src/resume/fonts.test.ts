import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FONT_PAIRS } from "./types";
import { FONT_STACKS } from "./theme";

const uiDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const css = readFileSync(join(uiDir, "styles", "resume.css"), "utf8");
const fontsDir = join(uiDir, "fonts");

/** Every `url("../fonts/<file>")` in an @font-face `src`. */
const referenced = [...css.matchAll(/src:\s*url\("\.\.\/fonts\/([^"]+)"\)/g)].map((m) => m[1]);

describe("bundled fonts", () => {
  it("every @font-face src in resume.css exists in fonts/ and every woff2 is referenced", () => {
    expect(referenced.length).toBeGreaterThan(0);
    for (const f of referenced) expect(existsSync(join(fontsDir, f)), f).toBe(true);
    const onDisk = readdirSync(fontsDir).filter((f) => f.endsWith(".woff2"));
    for (const f of onDisk) expect(referenced, `${f} is not referenced by any @font-face`).toContain(f);
  });

  it("every bundled face is a static instance (one weight per @font-face, no variable file), so a PDF embeds real TrueType, not Type 3", () => {
    const faces = [...css.matchAll(/@font-face\s*{([^}]*)}/g)].map((m) => m[1]);
    expect(faces.length).toBeGreaterThan(0);
    for (const f of faces) {
      const weight = /font-weight:\s*([^;]+);/.exec(f)?.[1].trim() ?? "";
      expect(weight, `font-weight of ${f}`).toMatch(/^\d{3}$/);
    }
    for (const f of referenced) expect(f, f).not.toMatch(/-var\./);
  });

  it("every FontPair has a stack and every family it names first is declared by an @font-face (or is a system font)", () => {
    const declared = new Set([...css.matchAll(/@font-face\s*{[^}]*font-family:\s*"([^"]+)"/g)].map((m) => m[1]));
    expect(declared).toEqual(new Set(["Inter", "Source Serif 4", "IBM Plex Sans", "EB Garamond"]));
    for (const pair of FONT_PAIRS) {
      const first = /^"([^"]+)"/.exec(FONT_STACKS[pair].body)?.[1];
      if (first) expect(declared.has(first), `${pair} -> ${first}`).toBe(true);
    }
  });

  it("each bundled family ships a licence text", () => {
    for (const f of ["OFL-Inter.txt", "OFL-SourceSerif4.txt", "OFL-IBMPlexSans.txt", "OFL-EBGaramond.txt"]) {
      expect(existsSync(join(fontsDir, f)), f).toBe(true);
    }
  });
});
