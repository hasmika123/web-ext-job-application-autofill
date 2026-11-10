import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import Popover from "./Popover";

afterEach(cleanup);

function Demo({ disabled }: { disabled?: boolean }) {
  return (
    <div>
      <Popover
        label="Visibility"
        disabled={disabled}
        trigger={(t) => (
          <button ref={t.ref} {...t.props}>
            Private
          </button>
        )}
      >
        {({ close }) => (
          <div>
            <button type="button">Inside</button>
            <button type="button" onClick={close}>
              Done
            </button>
          </div>
        )}
      </Popover>
      <button type="button">Outside</button>
    </div>
  );
}

describe("Popover", () => {
  it("opens under the trigger with aria wiring, focuses the first control, and closes on Done", () => {
    render(<Demo />);
    const trigger = screen.getByRole("button", { name: "Private" });
    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    const panel = screen.getByRole("dialog", { name: "Visibility" });
    expect(trigger.getAttribute("aria-controls")).toBe(panel.id);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Inside" }));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes on Escape (focus back on the trigger) and on a click outside, not on a click inside", () => {
    render(<Demo />);
    const trigger = screen.getByRole("button", { name: "Private" });
    fireEvent.click(trigger);
    fireEvent.mouseDown(screen.getByRole("button", { name: "Inside" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    fireEvent.click(trigger);
    fireEvent.mouseDown(screen.getByRole("button", { name: "Outside" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not open when disabled, and can be controlled", () => {
    const { unmount } = render(<Demo disabled />);
    fireEvent.click(screen.getByRole("button", { name: "Private" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    unmount();

    function Controlled() {
      const [open, setOpen] = useState(true);
      return (
        <Popover label="Controlled" open={open} onOpenChange={setOpen} trigger={(t) => <button ref={t.ref} {...t.props}>T</button>}>
          <p>Body</p>
        </Popover>
      );
    }
    render(<Controlled />);
    expect(screen.getByRole("dialog", { name: "Controlled" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "T" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
