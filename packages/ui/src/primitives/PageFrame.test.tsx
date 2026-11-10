import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PageFrame, { fitScale } from "./PageFrame";

describe("fitScale", () => {
  it("shrinks to the container but never magnifies past maxScale", () => {
    expect(fitScale(408, 816)).toBeCloseTo(0.5);
    expect(fitScale(2000, 816)).toBe(1);
    expect(fitScale(2000, 816, 1.5)).toBeCloseTo(1.5);
  });

  it("applies zoom on top and never collapses to zero", () => {
    expect(fitScale(408, 816, 1, 2)).toBeCloseTo(1);
    expect(fitScale(1, 100000)).toBe(0.05);
  });

  it("falls back to maxScale before the container is measured", () => {
    expect(fitScale(0, 816)).toBe(1);
  });
});

describe("PageFrame", () => {
  const observers: Array<() => void> = [];

  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(cb: () => void) {
          observers.push(cb);
        }
        observe() {}
        disconnect() {}
      },
    );
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 408 });
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get: () => 1056 });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientWidth;
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).offsetHeight;
    observers.length = 0;
  });

  it("scales the sheet to the container and reserves the scaled height", () => {
    const onMeasure = vi.fn();
    const { getByRole, container } = render(
      <PageFrame onMeasure={onMeasure}>
        <p>hello</p>
      </PageFrame>,
    );
    act(() => observers.forEach((cb) => cb()));
    const sheet = container.querySelector<HTMLElement>("[data-page-frame-sheet]")!;
    expect(sheet.style.width).toBe("816px");
    expect(sheet.style.transform).toBe("scale(0.5)");
    expect(getByRole("region").style.height).toBe("528px");
    expect(onMeasure).toHaveBeenLastCalledWith({ scale: 0.5, contentHeight: 1056 });
  });

  it("renders its children", () => {
    const { getByText } = render(
      <PageFrame>
        <p>hello</p>
      </PageFrame>,
    );
    expect(getByText("hello")).toBeTruthy();
  });
});
