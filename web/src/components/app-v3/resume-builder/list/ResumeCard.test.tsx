import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CardActions } from "./actions";
import { toCardModel, type ResumeCardModel } from "./adapter";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));
vi.mock("@/lib/use-date-display", () => ({ useDateDisplay: () => ({ locale: "en-US", timeZone: "UTC" }) }));

import ResumeCard from "./ResumeCard";

const actions: CardActions = {
  duplicate: vi.fn(),
  openInBuilder: vi.fn(),
  setPrimary: vi.fn(),
  archive: vi.fn(),
  restore: vi.fn(),
  rename: vi.fn(),
  remove: vi.fn(),
  busyId: null,
};

const model = (over: Partial<Parameters<typeof toCardModel>[0]> = {}): ResumeCardModel =>
  toCardModel({ id: 7, label: "Backend SWE", kind: "BUILT", templateId: "modern", createdAt: "2026-09-15T10:00:00Z", archived: false, defaultResume: false, ...over });

function renderCard(m: ResumeCardModel, layout: "grid" | "list" = "grid") {
  return render(
    <ul>
      <ResumeCard model={m} layout={layout} display={{ locale: "en-US", timeZone: "UTC" }} onManage={vi.fn()} actions={actions} onRename={vi.fn()} onDelete={vi.fn()} aiAllowed goodScore={70} />
    </ul>,
  );
}
const thumb = () => document.querySelector("[data-thumb]") as HTMLElement;
const img = () => within(thumb()).getByRole("img") as HTMLImageElement;

afterEach(cleanup);

describe("ResumeCard thumbnail (R3.13)", () => {
  it("shows the resume's own render once the PDF job made one, addressed by its hash", () => {
    renderCard(model({ thumbHash: "abc123" }));
    expect(thumb().getAttribute("data-thumb")).toBe("render");
    expect(img().getAttribute("src")).toContain("/api/resumes/7/thumbnail?v=abc123");
    expect(img().alt).toBe("Backend SWE preview");
  });

  it("falls back to the template's picture while there is none yet", () => {
    renderCard(model());
    expect(thumb().getAttribute("data-thumb")).toBe("template");
    expect(img().getAttribute("src")).not.toContain("/thumbnail");
  });

  it("an uploaded file has a plain file tile, never a thumbnail request", () => {
    renderCard(model({ kind: "UPLOADED", templateId: null, thumbHash: "abc123" }));
    expect(document.querySelector("[data-thumb]")).toBeNull();
    expect(document.querySelector('img[src*="/thumbnail"]')).toBeNull();
  });

  it("keeps the previous picture while the PDF is being remade, next to the chip that says so", () => {
    renderCard(model({ thumbHash: "abc123", pdf: { status: "PENDING" } }));
    expect(thumb().getAttribute("data-thumb")).toBe("render");
    expect(screen.getByText("PDF updating…")).toBeTruthy();
    cleanup();
    renderCard(model({ thumbHash: "abc123", pdf: { status: "FAILED" } }), "list");
    expect(thumb().getAttribute("data-thumb")).toBe("render");
    expect(screen.getByText("PDF failed")).toBeTruthy();
  });

  it("a picture that cannot be loaded falls back to the template's, and a new hash tries again", () => {
    const { rerender } = renderCard(model({ thumbHash: "old" }));
    fireEvent.error(img());
    expect(thumb().getAttribute("data-thumb")).toBe("template");
    rerender(
      <ul>
        <ResumeCard model={model({ thumbHash: "new" })} layout="grid" display={{ locale: "en-US", timeZone: "UTC" }} onManage={vi.fn()} actions={actions} onRename={vi.fn()} onDelete={vi.fn()} aiAllowed goodScore={70} />
      </ul>,
    );
    expect(thumb().getAttribute("data-thumb")).toBe("render");
    expect(img().getAttribute("src")).toContain("v=new");
  });
});
