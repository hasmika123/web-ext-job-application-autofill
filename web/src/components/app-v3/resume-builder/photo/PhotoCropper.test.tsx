import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import PhotoCropper from "./PhotoCropper";
import { INITIAL_CROP, MAX_ZOOM } from "./crop";
import type { Crop } from "./crop";

afterEach(cleanup);

/** The crop the harness holds now (rendered as JSON, so no variable is written during render). */
const live = (): Crop => JSON.parse(screen.getByTestId("crop").textContent ?? "{}") as Crop;
function Harness({ w = 2000, h = 1000, start = INITIAL_CROP, disabled = false }: { w?: number; h?: number; start?: Crop; disabled?: boolean }) {
  const [crop, setCrop] = useState<Crop>(start);
  return (
    <>
      <PhotoCropper src="blob:x" naturalWidth={w} naturalHeight={h} crop={crop} onCropChange={setCrop} disabled={disabled} />
      <output data-testid="crop">{JSON.stringify(crop)}</output>
    </>
  );
}
const win = () => screen.getByTestId("photo-crop-window");
/** jsdom has no PointerEvent, so fireEvent.pointerMove would carry no coordinates: a MouseEvent of the pointer type does. */
const pointer = (type: "pointerdown" | "pointermove" | "pointerup", x: number, y: number) => fireEvent(win(), new MouseEvent(type, { clientX: x, clientY: y, bubbles: true }));

describe("PhotoCropper (R7.4)", () => {
  it("shows the window onto the picture: at 1x the short side fills it, centred", () => {
    render(<Harness />);
    const img = win().querySelector("img")!;
    // 2000x1000 at 1x: the 1000 px window is shown in 256 px, so the picture is 512 px wide, pushed left by 128 px
    expect(img.style.width).toBe("512px");
    expect(img.style.height).toBe("256px");
    expect(img.style.left).toBe("-128px");
    expect(img.style.top).toBe("0px");
  });

  it("the arrow keys move the picture, within its edges", () => {
    render(<Harness start={{ zoom: 2, cx: 0.5, cy: 0.5 }} />);
    win().focus();
    fireEvent.keyDown(win(), { key: "ArrowRight" });
    expect(live().cx).toBeGreaterThan(0.5);
    const afterRight = live().cx;
    fireEvent.keyDown(win(), { key: "ArrowLeft" });
    fireEvent.keyDown(win(), { key: "ArrowLeft" });
    expect(live().cx).toBeLessThan(0.5);
    expect(afterRight).toBeGreaterThan(live().cx);
    fireEvent.keyDown(win(), { key: "ArrowDown" });
    expect(live().cy).toBeGreaterThan(0.5);
    for (let i = 0; i < 200; i++) fireEvent.keyDown(win(), { key: "ArrowUp" });
    expect(live().cy).toBeCloseTo(0.25, 5); // 2x on a 1000 px-high picture: the window stops at the top edge
  });

  it("plus and minus zoom within 1x to 3x; the slider zooms too", () => {
    render(<Harness />);
    fireEvent.keyDown(win(), { key: "+" });
    expect(live().zoom).toBeCloseTo(1.25);
    fireEvent.keyDown(win(), { key: "=" });
    expect(live().zoom).toBeCloseTo(1.5);
    fireEvent.keyDown(win(), { key: "-" });
    expect(live().zoom).toBeCloseTo(1.25);
    for (let i = 0; i < 20; i++) fireEvent.keyDown(win(), { key: "+" });
    expect(live().zoom).toBe(MAX_ZOOM);
    for (let i = 0; i < 20; i++) fireEvent.keyDown(win(), { key: "-" });
    expect(live().zoom).toBe(1);
    fireEvent.change(screen.getByRole("slider", { name: "Zoom" }), { target: { value: "2.5" } });
    expect(live().zoom).toBe(2.5);
  });

  it("dragging moves the picture with the pointer", () => {
    render(<Harness start={{ zoom: 2, cx: 0.5, cy: 0.5 }} />);
    pointer("pointerdown", 100, 100);
    pointer("pointermove", 150, 100);
    expect(live().cx).toBeLessThan(0.5); // the picture followed the pointer right, so the window went left
    const moved = live().cx;
    pointer("pointerup", 150, 100);
    pointer("pointermove", 400, 100);
    expect(live().cx).toBe(moved); // a move after the drag ended does nothing
  });

  it("is labelled for assistive tech, and does nothing while disabled", () => {
    render(<Harness disabled />);
    expect(win().getAttribute("aria-label")).toMatch(/arrow keys.*plus and minus/i);
    fireEvent.keyDown(win(), { key: "+" });
    pointer("pointerdown", 1, 1);
    pointer("pointermove", 99, 1);
    expect(live()).toEqual(INITIAL_CROP);
    expect((screen.getByRole("slider", { name: "Zoom" }) as HTMLInputElement).disabled).toBe(true);
  });
});
