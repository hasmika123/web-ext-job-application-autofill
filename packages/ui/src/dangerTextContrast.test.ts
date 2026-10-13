import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Error TEXT must clear WCAG AA (4.5:1). The bright `--color-danger` (coral #F05252) is 3.5:1 on white,
 * so error copy uses `--color-danger-text` (`text-danger-text`); `--color-danger` stays for icons, borders and fills.
 */
const styles = (f: string) => readFileSync(path.resolve(__dirname, "../styles", f), "utf8");

const rgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
function luminance([r, g, b]: [number, number, number]): number {
  const [R, G, B] = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}
function contrast(a: string, b: [number, number, number] | string): number {
  const x = luminance(rgb(a));
  const y = luminance(typeof b === "string" ? rgb(b) : b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
const mix = (fg: string, bg: string, p: number): [number, number, number] => rgb(fg).map((v, i) => v * p + rgb(bg)[i] * (1 - p)) as [number, number, number];
const token = (css: string, name: string): string => {
  const m = new RegExp(`${name}:\\s*(#[0-9A-Fa-f]{6})`).exec(css);
  if (!m) throw new Error(`token ${name} not found`);
  return m[1];
};

describe("error text contrast", () => {
  const v2 = styles("theme-v2.css");
  const base = styles("tokens.css");
  const coral = token(v2, "--color-v2-coral");

  it("the bright coral is the reason the text token exists (it fails AA on white)", () => {
    expect(contrast(coral, "#FFFFFF")).toBeLessThan(4.5);
  });

  it("v2 danger text is AA on white, the v2 surfaces, coral-soft and a coral tint", () => {
    const text = token(v2, "--color-v2-danger-text");
    for (const bg of ["#FFFFFF", token(v2, "--color-v2-canvas"), "#F1F5FB", token(v2, "--color-v2-coral-soft")]) {
      expect(contrast(text, bg), `on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
    for (const bg of ["#FFFFFF", "#F1F5FB"]) expect(contrast(text, mix(coral, bg, 0.16)), `on 16% coral over ${bg}`).toBeGreaterThanOrEqual(4.5);
  });

  it("theme-v2 points --color-danger-text at that token, and keeps --color-danger bright", () => {
    expect(v2).toMatch(/--color-danger-text:\s*var\(--color-v2-danger-text\)/);
    expect(v2).toMatch(/--color-danger:\s*var\(--color-v2-coral\)/);
  });

  it("the base theme is AA in light and in dark", () => {
    const darkAt = base.indexOf("\n.dark,");
    const light = token(base.slice(0, darkAt), "--color-danger-text");
    for (const bg of [token(base, "--color-paper"), token(base, "--color-paper-2"), token(base, "--color-app-bg")]) {
      expect(contrast(light, bg), `light on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
    const dark = base.slice(darkAt);
    const darkText = token(dark, "--color-danger-text");
    for (const name of ["--color-paper", "--color-paper-2", "--color-app-bg"]) {
      expect(contrast(darkText, token(dark, name)), `dark on ${name}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
