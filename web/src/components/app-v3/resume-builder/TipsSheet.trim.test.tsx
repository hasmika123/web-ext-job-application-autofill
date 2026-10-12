import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_THEME, DESIGN_FREE, scoreResume } from "@kiwiply/ui";
import type { ResumeDocument } from "@kiwiply/ui";
import TipsSheet from "./TipsSheet";

vi.mock("next/link", () => ({ default: ({ href, children, onClick, ...p }: { href: string; children: React.ReactNode; onClick?: (e: React.MouseEvent) => void }) => (
    <a href={href} {...p} onClick={(e) => { e.preventDefault(); onClick?.(e); }}>{children}</a>
  ),
}));

afterEach(cleanup);

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "../../../../../packages/ui/src/resume/__fixtures__");
const doc = JSON.parse(readFileSync(join(fixtures, "score-strong.json"), "utf8")) as ResumeDocument;
/** A strong resume that runs to three pages: only the page-count rule (F4) fails. */
const overflowing = () => scoreResume(doc, { caps: DESIGN_FREE, theme: { ...DEFAULT_THEME }, pages: 3, jobExtract: null, now: "2026-10" });
const fits = () => scoreResume(doc, { caps: DESIGN_FREE, theme: { ...DEFAULT_THEME }, pages: 1, jobExtract: null, now: "2026-10" });

const sheet = (trim: Parameters<typeof TipsSheet>[0]["trim"], report = overflowing()) =>
  render(<TipsSheet open mode="overlay" report={report} only={null} onClose={() => {}} onGoTo={() => {}} trim={trim} />);

describe("TipsSheet - 'Trim the longest bullets' on the page-count tip (R4.2)", () => {
  it("Pro: the button sits under the F4 tip and starts the trim", () => {
    const onTrim = vi.fn();
    sheet({ allowed: true, onTrim, onLocked: vi.fn() });
    const tip = document.querySelector('[data-rule="F4"]') as HTMLElement;
    expect(tip.textContent).toContain("Still 3 pages");
    fireEvent.click(tip.querySelector("[data-trim-longest]")!);
    expect(onTrim).toHaveBeenCalledTimes(1);
  });

  it("Free: the same button is a lock with the Pro chip that leads to the plans", () => {
    const onLocked = vi.fn();
    sheet({ allowed: false, onTrim: vi.fn(), onLocked });
    const link = document.querySelector('[data-rule="F4"] [data-trim-longest]') as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/pricing");
    expect(link.textContent).toContain("Pro");
    fireEvent.click(link);
    expect(onLocked).toHaveBeenCalledTimes(1);
  });

  it("no button on other tips, none without the prop, none when the page count passes", () => {
    sheet(null);
    expect(document.querySelector("[data-trim-longest]")).toBeNull();
    cleanup();
    sheet({ allowed: true, onTrim: vi.fn(), onLocked: vi.fn() }, fits());
    expect(screen.queryByText("Trim the longest bullets")).toBeNull();
  });
});
