import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DragHandle } from "@kiwiply/ui";
import { SortableList, type SortableMove } from "./SortableList";

interface Row {
  id: string;
  name: string;
}

function List({ onMove }: { onMove: (m: SortableMove) => void }) {
  const [rows, setRows] = useState<Row[]>([
    { id: "a", name: "Alpha" },
    { id: "b", name: "Beta" },
    { id: "c", name: "Gamma" },
  ]);
  return (
    <>
      <SortableList
        items={rows}
        label={(r) => r.name}
        onMove={(m) => {
          onMove(m);
          setRows((cur) => {
            const next = cur.slice();
            const [x] = next.splice(m.from, 1);
            next.splice(m.to, 0, x);
            return next;
          });
        }}
        renderRow={(r, row) => (
          <span>
            <DragHandle aria-label={`Drag ${r.name}`} {...row.handleProps} />
            {r.name}
          </span>
        )}
      />
      <output data-testid="order">{rows.map((r) => r.id).join("")}</output>
    </>
  );
}

beforeEach(() => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const i = Array.from(document.querySelectorAll("[data-sortable-id]")).indexOf(this);
    const top = i < 0 ? 0 : i * 100; // config-literal-ok: fake layout in a test
    return { x: 0, y: top, top, left: 0, width: i < 0 ? 0 : 300, height: i < 0 ? 0 : 80, right: 300, bottom: top + 80, toJSON: () => ({}) } as DOMRect;
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const tick = () => act(async () => void (await new Promise((r) => setTimeout(r, 20))));

describe("SortableList", () => {
  it("reorders with the keyboard (Space, arrows, Space) and reports from/to", async () => {
    const onMove = vi.fn();
    render(<List onMove={onMove} />);
    const handle = screen.getByRole("button", { name: "Drag Alpha" });
    handle.focus();
    fireEvent.keyDown(handle, { code: "Space", key: " " });
    await tick();
    fireEvent.keyDown(document, { code: "ArrowDown", key: "ArrowDown" });
    await tick();
    fireEvent.keyDown(document, { code: "ArrowDown", key: "ArrowDown" });
    await tick();
    fireEvent.keyDown(document, { code: "Space", key: " " });
    await tick();
    expect(onMove).toHaveBeenCalledWith({ group: "list", id: "a", from: 0, to: 2 });
    expect(screen.getByTestId("order").textContent).toBe("bca");
  });

  it("announces the pick-up with the row's name and position", async () => {
    render(<List onMove={() => {}} />);
    const handle = screen.getByRole("button", { name: "Drag Beta" });
    handle.focus();
    fireEvent.keyDown(handle, { code: "Space", key: " " });
    await tick();
    expect(document.querySelector('[role="status"][aria-live="assertive"]')?.textContent).toBe("Picked up Beta, position 2 of 3.");
  });
});
