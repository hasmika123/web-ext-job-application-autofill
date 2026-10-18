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
    expect(declared).toEqual(new Set(["Inter", "Source Serif 4", "IBM Plex Sans", "EB Garamond", "Gelasio", "Arimo"]));
    for (const pair of FONT_PAIRS) {
      const first = /^"([^"]+)"/.exec(FONT_STACKS[pair].body)?.[1];
      if (first) expect(declared.has(first), `${pair} -> ${first}`).toBe(true);
    }
  });

  it("each bundled family ships a licence text", () => {
    for (const f of ["OFL-Inter.txt", "OFL-SourceSerif4.txt", "OFL-IBMPlexSans.txt", "OFL-EBGaramond.txt", "OFL-Gelasio.txt", "OFL-Arimo.txt"]) {
      expect(existsSync(join(fontsDir, f)), f).toBe(true);
    }
  });

  it("the Georgia / Arial pair names its bundled metric-compatible twin right after the system font, so Linux prints the same page", () => {
    const declared = new Set([...css.matchAll(/@font-face\s*{[^}]*font-family:\s*"([^"]+)"/g)].map((m) => m[1]));
    expect(FONT_STACKS["georgia-arial"].body).toMatch(/^Arial, "?Arimo"?, /);
    expect(FONT_STACKS["georgia-arial"].display).toMatch(/^Georgia, "?Gelasio"?, /);
    expect(declared.has("Arimo")).toBe(true);
    expect(declared.has("Gelasio")).toBe(true);
    // the faces the pair needs: regular + bold of both, and Arial's italic (Georgia is only set upright / bold)
    for (const f of ["gelasio-latin-400", "gelasio-latin-700", "arimo-latin-400", "arimo-latin-700", "arimo-italic-latin-400"]) expect(referenced, f).toContain(`${f}.woff2`);
  });
});
