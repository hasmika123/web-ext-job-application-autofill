import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ATS_STRICT, DESIGN_FREE } from "@kiwiply/ui";
import type { ResumeDocument } from "@kiwiply/ui";
import { NO_PHOTO } from "../canvasContext";
import type { CanvasPhoto } from "../canvasContext";
import { testDoc } from "../state/test-doc";
import { CanvasHarness } from "../test-canvas";

afterEach(cleanup);

const doc = (photo: boolean): ResumeDocument => {
  const d = testDoc();
  d.basics.photo = photo ? { key: "resume-photos/3/7-abc-photo.jpg", updatedAt: "2026-10-17T10:00:00Z" } : null;
  return d;
};

const photoApi = (over: Partial<CanvasPhoto> = {}): CanvasPhoto => ({
  ...NO_PHOTO,
  enabled: true,
  upload: vi.fn(async () => ({ ok: true as const })),
  remove: vi.fn(),
  setShown: vi.fn(),
  ...over,
});

describe("the header's photo slot (R7.4)", () => {
  it("empty: a dashed placeholder, 'Add photo', and nothing to remove or show", () => {
    render(<CanvasHarness doc={doc(false)} caps={DESIGN_FREE} photo={photoApi()} />);
    expect(screen.getByRole("button", { name: "Add photo" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Remove photo" })).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByAltText("Your photo")).toBeNull();
  });

  it("'Add photo' opens the dialog with the file chooser", () => {
    render(<CanvasHarness doc={doc(false)} caps={DESIGN_FREE} photo={photoApi()} />);
    fireEvent.click(screen.getByRole("button", { name: "Add photo" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Add a photo")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Choose a picture" })).toBeTruthy();
  });

  it("with a photo: the picture from the BFF address, Change, Remove (with its toast Undo upstream) and the Show switch", () => {
    const api = photoApi({ src: "/api/resumes/42/photo?v=x", shown: true });
    render(<CanvasHarness doc={doc(true)} caps={DESIGN_FREE} photo={api} />);

    const img = screen.getByAltText("Your photo") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("/api/resumes/42/photo?v=x");
    expect(screen.getByRole("button", { name: "Change photo" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Remove photo" }));
    expect(api.remove).toHaveBeenCalledTimes(1);

    const sw = screen.getByRole("switch", { name: /Show on resume/ });
    expect(sw.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(sw);
    expect(api.setShown).toHaveBeenCalledWith(false);
  });

  it("a hidden photo is dimmed, and the switch offers to show it", () => {
    const api = photoApi({ src: "/api/resumes/42/photo", shown: false });
    render(<CanvasHarness doc={doc(true)} caps={DESIGN_FREE} photo={api} />);
    expect(screen.getByAltText("Your photo").className).toContain("opacity-50");
    const sw = screen.getByRole("switch", { name: /Show on resume/ });
    expect(sw.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(sw);
    expect(api.setShown).toHaveBeenCalledWith(true);
  });

  it("when the session may not change it, the slot only shows the picture", () => {
    render(<CanvasHarness doc={doc(true)} caps={DESIGN_FREE} photo={photoApi({ enabled: false, src: "/api/resumes/42/photo" })} />);
    expect(screen.getByAltText("Your photo")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /photo/i })).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("acting for the owner (a photo with no key, so no address) draws no picture", () => {
    render(<CanvasHarness doc={doc(true)} caps={DESIGN_FREE} photo={photoApi({ enabled: false, src: null })} />);
    expect(screen.queryByAltText("Your photo")).toBeNull();
  });

  it("an ATS template has no slot at all, even with a stored photo", () => {
    render(<CanvasHarness doc={doc(true)} caps={ATS_STRICT} photo={photoApi({ src: "/api/resumes/42/photo" })} />);
    expect(screen.queryByTestId("photo-slot")).toBeNull();
    expect(screen.queryByAltText("Your photo")).toBeNull();
  });
});
