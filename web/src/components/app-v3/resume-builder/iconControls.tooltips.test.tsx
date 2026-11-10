/**
 * The tooltip pass (DECISIONS #32 follow-up): every icon-only control of the editor and the resume list has an accessible
 * name AND is wrapped in the `@kiwiply/ui` Tooltip, so hover / keyboard focus say what it is for.
 */
import { createRef } from "react";
import type { RefObject } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DESIGN_FREE, TOOLTIP_DELAY_MS } from "@kiwiply/ui";
import type { ResumeDocument } from "@kiwiply/ui";
import { DEFAULT_BUILDER_CONFIG } from "@/lib/resume-builder-config.shared";
import type { CardActions } from "./list/actions";
import { toCardModel } from "./list/adapter";
import type { LeftPanel } from "./state/ui";
import { testDoc } from "./state/test-doc";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));
vi.mock("next/image", () => ({ default: (p: { alt: string }) => <span role="img" aria-label={p.alt} /> }));
vi.mock("@/components/marketing/BrandLogo", () => ({ default: () => <span>Kiwiply logo</span> }));
vi.mock("@/lib/use-date-display", () => ({ useDateDisplay: () => ({ locale: "en-US", timeZone: "UTC" }) }));

import EditorTopBar from "./EditorTopBar";
import MarkToolbar from "./MarkToolbar";
import RailStrip from "./RailStrip";
import ResumeCard from "./list/ResumeCard";
import { CanvasHarness } from "./test-canvas";

afterEach(cleanup);

/** Buttons and links that draw an icon and no visible words (text that is `hidden` / `sr-only` does not count). */
function iconOnly(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>("button, a[href]")).filter((el) => {
    if (!el.querySelector("svg")) return false;
    const clone = el.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("svg, .sr-only, [aria-hidden='true']").forEach((n) => n.remove());
    clone.querySelectorAll<HTMLElement>("[class]").forEach((n) => {
      if (n.className.toString().split(/\s+/).includes("hidden")) n.remove();
    });
    return (clone.textContent ?? "").trim() === "";
  });
}

const nameOf = (el: HTMLElement) => (el.getAttribute("aria-label") ?? el.textContent ?? "").trim();

function expectNamedWithTooltip(root: ParentNode, min: number) {
  const found = iconOnly(root);
  expect(found.length).toBeGreaterThanOrEqual(min);
  for (const el of found) {
    expect(nameOf(el), `an icon-only control has no accessible name: ${el.outerHTML.slice(0, 120)}`).not.toBe("");
    expect(el.closest("[data-tooltip-trigger]"), `"${nameOf(el)}" has no tooltip`).not.toBeNull();
  }
  return found;
}

const refs = (): Record<LeftPanel, RefObject<HTMLButtonElement | null>> => ({ add: createRef(), template: createRef(), swap: createRef(), tailor: createRef() });

describe("tooltips on every icon-only control", () => {
  it("EditorTopBar: the four panel toggles, Download and Close editor", () => {
    render(
      <EditorTopBar
        status="saved"
        savedAt={1}
        now={1}
        error={null}
        leftPanel={null}
        onTogglePanel={vi.fn()}
        panelRefs={refs()}
        onDownloadPdf={vi.fn()}
        onDownloadText={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const found = expectNamedWithTooltip(document.body, 6);
    expect(found.map(nameOf)).toEqual(expect.arrayContaining(["Add Section", "Pick Template", "Swap Section", "Tailor to Job", "Download", "Close editor"]));
  });

  it("RailStrip: Resume Score, AI Suggestions (with its count) and Job Match, tooltips to the left", () => {
    render(<RailStrip config={{ ...DEFAULT_BUILDER_CONFIG, aiAllowed: true }} suggestionCount={4} activeTab="insights" onExpand={vi.fn()} />);
    const found = expectNamedWithTooltip(document.body, 3);
    expect(found.map(nameOf)).toContain("AI Suggestions (4)");
    // keyboard focus shows the same words
    vi.useFakeTimers();
    fireEvent.focus(screen.getByRole("button", { name: "AI Suggestions (4)" }));
    act(() => void vi.advanceTimersByTime(TOOLTIP_DELAY_MS + 10));
    expect(document.querySelector("[data-tooltip]")?.textContent).toBe("AI Suggestions (4)");
    vi.useRealTimers();
  });

  it("SectionBlock + ItemControls: move, more, delete, edit and the drag grips", () => {
    const d: ResumeDocument = testDoc();
    // a hidden section and a hidden item so their Show / Delete rows are covered too
    d.sections.push({ id: "s_hid", kind: "SKILLS", title: "Tools", hidden: true, items: [] } as never);
    render(<CanvasHarness doc={d} caps={DESIGN_FREE} reorder />);
    const found = expectNamedWithTooltip(document.body, 12);
    const names = found.map(nameOf);
    expect(names.some((n) => /^Move .* section up$/.test(n))).toBe(true);
    expect(names.some((n) => /^More actions for .* section$/.test(n))).toBe(true);
    expect(names.some((n) => /^Delete .* section$/.test(n))).toBe(true);
    expect(names.some((n) => /^Drag .* to reorder$/.test(n))).toBe(true);
    expect(names.some((n) => /^Edit /.test(n))).toBe(true);
    // the grip's tooltip is the short phrase
    const grip = found.find((e) => /^Drag .* to reorder$/.test(nameOf(e)))!;
    vi.useFakeTimers();
    fireEvent.focus(grip);
    act(() => void vi.advanceTimersByTime(TOOLTIP_DELAY_MS + 10));
    expect(document.querySelector("[data-tooltip]")?.textContent).toBe("Drag to reorder");
    vi.useRealTimers();
  });

  it.each([true, false])("Rewrite with AI (R4.2): the per-bullet control has a name and a tooltip (AI allowed: %s)", (aiAllowed) => {
    render(<CanvasHarness doc={testDoc()} caps={DESIGN_FREE} aiAllowed={aiAllowed} />);
    const found = expectNamedWithTooltip(document.body, 12);
    const bullets = found.filter((e) => /^Rewrite bullet \d+ with AI/.test(nameOf(e)));
    expect(bullets.length).toBeGreaterThan(0);
    expect(bullets.map(nameOf).every((n) => (aiAllowed ? !n.endsWith("(Pro)") : n.endsWith("(Pro)")))).toBe(true);
  });

  it("MarkToolbar: B, I, U, lists and link, with shortcut hints", () => {
    render(
      <MarkToolbar
        buttons={["b", "i", "u", "bullet", "number", "a"]}
        marks={[]}
        selection={{ s: 0, e: 0 }}
        list={null}
        onToggle={vi.fn()}
        onList={vi.fn()}
        onLink={vi.fn()}
      />,
    );
    const found = expectNamedWithTooltip(document.body, 6);
    expect(found.map(nameOf)).toEqual(["Bold", "Italic", "Underline", "Bulleted list", "Numbered list", "Link"]);
  });

  it("ResumeCard: edit, duplicate, view, AI and the more-actions menu", () => {
    const actions: CardActions = { duplicate: vi.fn(), openInBuilder: vi.fn(), setPrimary: vi.fn(), archive: vi.fn(), restore: vi.fn(), rename: vi.fn(), remove: vi.fn(), busyId: null };
    const model = toCardModel({ id: 7, label: "Backend SWE", kind: "BUILT", templateId: "modern", createdAt: "2026-09-15T10:00:00Z", archived: false, defaultResume: false });
    render(
      <ul>
        <ResumeCard model={model} layout="grid" display={{ locale: "en-US", timeZone: "UTC" }} onManage={vi.fn()} actions={actions} onRename={vi.fn()} onDelete={vi.fn()} aiAllowed goodScore={70} />
      </ul>,
    );
    const found = expectNamedWithTooltip(document.body, 4);
    expect(found.map(nameOf)).toEqual(expect.arrayContaining(["Edit Backend SWE", "Duplicate Backend SWE", "View Backend SWE", "AI tools for Backend SWE"]));
  });
});
