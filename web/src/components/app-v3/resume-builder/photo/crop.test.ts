import { afterEach, describe, expect, it, vi } from "vitest";
import { INITIAL_CROP, MAX_ZOOM, MIN_ZOOM, OUT_SIDE, clampCrop, cropRect, cropToBlob, outSize, panByPixels, panByStep, visibleSide, zoomTo } from "./crop";

describe("crop maths", () => {
  it("at zoom 1 the window is the picture's short side, centred", () => {
    expect(visibleSide(2000, 1000, 1)).toBe(1000);
    expect(cropRect(2000, 1000, INITIAL_CROP)).toEqual({ sx: 500, sy: 0, side: 1000 });
    expect(cropRect(600, 900, INITIAL_CROP)).toEqual({ sx: 0, sy: 150, side: 600 });
  });

  it("zoom narrows the window around the centre, within 1x..3x", () => {
    expect(visibleSide(1000, 1000, 2)).toBe(500);
    expect(cropRect(1000, 1000, { zoom: 2, cx: 0.5, cy: 0.5 })).toEqual({ sx: 250, sy: 250, side: 500 });
    expect(visibleSide(1000, 1000, 99)).toBeCloseTo(1000 / MAX_ZOOM);
    expect(visibleSide(1000, 1000, 0)).toBe(1000 / MIN_ZOOM);
    expect(zoomTo(1000, 1000, INITIAL_CROP, 10).zoom).toBe(MAX_ZOOM);
    expect(zoomTo(1000, 1000, INITIAL_CROP, -1).zoom).toBe(MIN_ZOOM);
  });

  it("the window can never leave the picture", () => {
    const far = clampCrop(1000, 1000, { zoom: 2, cx: 5, cy: -5 });
    expect(far).toEqual({ zoom: 2, cx: 0.75, cy: 0.25 });
    const r = cropRect(1000, 1000, { zoom: 2, cx: 0, cy: 1 });
    expect(r.sx).toBe(0);
    expect(r.sy + r.side).toBe(1000);
    // at zoom 1 on a square picture there is nowhere to go
    expect(clampCrop(800, 800, { zoom: 1, cx: 0.9, cy: 0.1 })).toEqual({ zoom: 1, cx: 0.5, cy: 0.5 });
  });

  it("dragging moves the picture with the pointer (the window goes the other way) and stops at the edge", () => {
    // 1000x1000 at 2x: the window is 500 source px shown in a 250 px viewport = 2 source px per screen px.
    const start = { zoom: 2, cx: 0.5, cy: 0.5 };
    const dragged = panByPixels(1000, 1000, start, 50, 0, 250); // pointer moved 50 px right
    expect(dragged.cx).toBeCloseTo(0.5 - 100 / 1000);
    expect(dragged.cy).toBe(0.5);
    expect(panByPixels(1000, 1000, start, 100000, 100000, 250)).toEqual({ zoom: 2, cx: 0.25, cy: 0.25 });
  });

  it("arrow keys move the window by 5% of itself", () => {
    const start = { zoom: 2, cx: 0.5, cy: 0.5 };
    const right = panByStep(1000, 1000, start, 1, 0); // window 500 px: 5% = 25 px = 0.025 of the picture
    expect(right.cx).toBeCloseTo(0.525);
    expect(panByStep(1000, 1000, right, -1, 0).cx).toBeCloseTo(0.5);
    expect(panByStep(1000, 1000, INITIAL_CROP, 1, 1)).toEqual(INITIAL_CROP); // nowhere to go at 1x on a square
  });

  it("exports at most 512 px, and never scales a small window up", () => {
    expect(OUT_SIDE).toBe(512);
    expect(outSize(4000, 3000, INITIAL_CROP)).toBe(512);
    expect(outSize(400, 300, INITIAL_CROP)).toBe(300);
    expect(outSize(4000, 3000, { zoom: 3, cx: 0.5, cy: 0.5 })).toBe(512); // 1000 px window
    expect(outSize(900, 900, { zoom: 3, cx: 0.5, cy: 0.5 })).toBe(300);
  });
});

describe("cropToBlob", () => {
  afterEach(() => vi.restoreAllMocks());

  it("draws the window onto a white square canvas of the export size and encodes a PNG", async () => {
    const drawn: unknown[][] = [];
    const ctx = {
      fillStyle: "",
      imageSmoothingQuality: "",
      fillRect: vi.fn(),
      drawImage: (...a: unknown[]) => void drawn.push(a),
    };
    const canvas = { width: 0, height: 0, getContext: () => ctx, toBlob: (cb: (b: Blob | null) => void, type: string) => cb(new Blob(["png"], { type })) };
    vi.spyOn(document, "createElement").mockImplementation(((tag: string) => (tag === "canvas" ? canvas : document.createElementNS("http://www.w3.org/1999/xhtml", tag))) as never);
    const img = { naturalWidth: 2000, naturalHeight: 1000 } as HTMLImageElement;

    const blob = await cropToBlob(img, INITIAL_CROP);

    expect(blob?.type).toBe("image/png");
    expect(canvas.width).toBe(512);
    expect(canvas.height).toBe(512);
    expect(ctx.fillStyle).toBe("#ffffff");
    expect(drawn).toEqual([[img, 500, 0, 1000, 1000, 0, 0, 512, 512]]);
  });

  it("is null when the picture has no size or the browser has no 2d canvas", async () => {
    expect(await cropToBlob({ naturalWidth: 0, naturalHeight: 0 } as HTMLImageElement, INITIAL_CROP)).toBeNull();
    vi.spyOn(document, "createElement").mockImplementation(((tag: string) => (tag === "canvas" ? { getContext: () => null } : document.createElementNS("http://www.w3.org/1999/xhtml", tag))) as never);
    expect(await cropToBlob({ naturalWidth: 100, naturalHeight: 100 } as HTMLImageElement, INITIAL_CROP)).toBeNull();
  });
});
