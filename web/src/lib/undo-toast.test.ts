import { describe, expect, it, vi } from "vitest";
import { UNDO_TOAST_DEFAULT_MS, undoToast } from "./undo-toast";

describe("undoToast", () => {
  it("shows one toast with a single Undo action for 6 seconds", () => {
    const toast = vi.fn();
    const onUndo = vi.fn();
    undoToast(toast, { title: "Application archived", onUndo });
    expect(toast).toHaveBeenCalledTimes(1);
    const opts = toast.mock.calls[0][0];
    expect(opts.title).toBe("Application archived");
    expect(opts.duration).toBe(6000);
    expect(UNDO_TOAST_DEFAULT_MS).toBe(6000);
    expect(opts.action.label).toBe("Undo");
    opts.action.onClick();
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it("takes a custom time and label", () => {
    const toast = vi.fn();
    undoToast(toast, { title: "Alert paused", onUndo: () => {}, ms: 3000, label: "Resume" });
    expect(toast.mock.calls[0][0].duration).toBe(3000);
    expect(toast.mock.calls[0][0].action.label).toBe("Resume");
  });
});
