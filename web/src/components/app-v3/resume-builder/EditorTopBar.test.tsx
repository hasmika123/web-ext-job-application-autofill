import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PdfInfo } from "@/lib/resume-doc";

vi.mock("next/link", () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));

import EditorTopBar from "./EditorTopBar";

afterEach(cleanup);

const bar = (pdf?: PdfInfo | null, onPdfRetry?: () => void) =>
  render(
    <EditorTopBar
      title="Backend SWE"
      onTitleChange={() => undefined}
      onTitleBlur={() => undefined}
      status="saved"
      savedAt={1}
      now={2}
      error={null}
      canUndo={false}
      canRedo={false}
      onUndo={() => undefined}
      onRedo={() => undefined}
      pdf={pdf}
      onPdfRetry={onPdfRetry}
    />,
  );

describe("EditorTopBar PDF status suffix (R3.7)", () => {
  it.each(["PENDING", "RUNNING", "STALE"] as const)("%s shows '· PDF updating…' after the save status", (status) => {
    bar({ status });
    const suffix = document.querySelector('[data-pdf-status="updating"]');
    expect(suffix?.textContent).toContain("PDF updating…");
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
    // the save status keeps its own message
    expect(document.querySelector("[data-save-status]")?.textContent).toContain("Saved");
  });

  it.each([undefined, null, { status: "NONE" }, { status: "READY" }] as Array<PdfInfo | null | undefined>)("shows nothing for %j", (pdf) => {
    bar(pdf);
    expect(document.querySelector("[data-pdf-status]")).toBeNull();
    expect(screen.queryByText(/PDF/)).toBeNull();
  });

  it("FAILED shows \"PDF couldn't be made · Retry\" and Retry calls back", () => {
    const retry = vi.fn();
    bar({ status: "FAILED", error: "boom" }, retry);
    const suffix = document.querySelector('[data-pdf-status="failed"]');
    expect(suffix?.textContent).toContain("PDF couldn't be made");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
