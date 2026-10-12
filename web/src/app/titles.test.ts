import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

// layout.tsx pulls in next/font/google and client components; only its `metadata` export matters here.
vi.mock("next/font/google", () => ({ Inter: () => ({ variable: "" }), Fraunces: () => ({ variable: "" }) }));
vi.mock("./globals.css", () => ({}));
vi.mock("@/components/CookieConsent", () => ({ default: () => null }));
vi.mock("@/components/BugReportWidget", () => ({ default: () => null }));
vi.mock("@/components/ui", () => ({ ToastProvider: () => null }));

const APP_DIR = __dirname;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

/** Every `title: "…"` string literal in `metadata` exports / `generateMetadata` (single-line, as written in this app). */
function metadataTitles(file: string): string[] {
  const src = readFileSync(file, "utf8");
  if (!/export const metadata|generateMetadata/.test(src)) return [];
  return [...src.matchAll(/\btitle:\s*(?:\{\s*absolute:\s*)?(["'`])((?:(?!\1).)*)\1/g)].map((m) => m[2]);
}

describe("root metadata title", () => {
  it("is 'Kiwiply | <page>' with a plain 'Kiwiply | …' default", async () => {
    const { metadata } = await import("./layout");
    const title = metadata.title as { default: string; template: string };
    expect(title.template).toBe("Kiwiply | %s");
    expect(title.template.replace("%s", "Log in")).toBe("Kiwiply | Log in");
    expect(title.default.startsWith("Kiwiply")).toBe(true);
    expect(title.default.match(/Kiwiply/g)).toHaveLength(1);
  });
});

describe("page titles under app/**", () => {
  const found = sourceFiles(APP_DIR).flatMap((f) => metadataTitles(f).map((t) => ({ file: path.relative(APP_DIR, f), title: t })));

  it("finds the titles (guards the scanner itself)", () => {
    expect(found.length).toBeGreaterThan(40);
  });

  it("none ends with '· Kiwiply'", () => {
    expect(found.filter((x) => /·\s*Kiwiply\s*$/.test(x.title))).toEqual([]);
  });

  it("none says Kiwiply (the root template already adds it)", () => {
    // layout.tsx's own TITLE / template are the one place the brand is written.
    expect(found.filter((x) => x.file !== "layout.tsx" && /Kiwiply/i.test(x.title))).toEqual([]);
  });
});
