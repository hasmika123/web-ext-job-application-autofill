import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const crop = vi.hoisted(() => ({ blob: new Blob(["png-bytes"], { type: "image/png" }) as Blob | null }));
vi.mock("./crop", async (orig) => ({ ...(await orig<typeof import("./crop")>()), cropToBlob: async () => crop.blob }));

import PhotoDialog, { NOTICE_SEEN_KEY, REGION_NOTE } from "./PhotoDialog";

/** A browser Image that "decodes" at once as 1200 x 800. */
class FakeImage {
  naturalWidth = 1200;
  naturalHeight = 800;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_v: string) {
    queueMicrotask(() => (FakeImage.fail ? this.onerror?.() : this.onload?.()));
  }
  static fail = false;
}

let created: string[];
let revoked: string[];
beforeEach(() => {
  FakeImage.fail = false;
  crop.blob = new Blob(["png-bytes"], { type: "image/png" });
  created = [];
  revoked = [];
  vi.stubGlobal("Image", FakeImage);
  URL.createObjectURL = vi.fn(() => {
    const u = `blob:test/${created.length}`;
    created.push(u);
    return u;
  });
  URL.revokeObjectURL = vi.fn((u: string) => void revoked.push(u));
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const file = (name: string, type: string, size = 100) => new File([new Uint8Array(size)], name, { type });
const chooser = () => screen.getByLabelText("Choose a picture", { selector: "input" }) as HTMLInputElement;
const choose = async (f: File) => {
  await act(async () => {
    fireEvent.change(chooser(), { target: { files: [f] } });
  });
};
const setup = (over: Partial<Parameters<typeof PhotoDialog>[0]> = {}) => {
  const onClose = vi.fn();
  const onConfirm = vi.fn(async () => ({ ok: true as const }));
  render(<PhotoDialog open onClose={onClose} discouraged={false} onConfirm={onConfirm} {...over} />);
  return { onClose, onConfirm };
};

describe("PhotoDialog (R7.4)", () => {
  it("starts with a chooser; a JPEG, PNG or WebP opens the cropper", async () => {
    setup();
    expect(screen.getByText("Add a photo")).toBeTruthy();
    expect(chooser().accept).toBe("image/jpeg,image/png,image/webp");
    await choose(file("me.webp", "image/webp"));
    expect(screen.getByText("Crop your photo")).toBeTruthy();
    expect(screen.getByTestId("photo-crop-window")).toBeTruthy();
    expect(screen.getByRole("slider", { name: "Zoom" })).toBeTruthy();
  });

  it("refuses other types and oversized files without opening anything", async () => {
    setup();
    await choose(file("me.gif", "image/gif"));
    expect(screen.getByRole("alert").textContent).toMatch(/JPEG, PNG or WebP/);
    expect(screen.queryByTestId("photo-crop-window")).toBeNull();
    await choose(file("huge.png", "image/png", 41 * 1024 * 1024));
    expect(screen.getByRole("alert").textContent).toMatch(/too large to open/);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("a file the browser cannot decode is an error, and its object URL is released", async () => {
    FakeImage.fail = true;
    setup();
    await choose(file("broken.png", "image/png"));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/picture we can open/));
    expect(revoked).toEqual(created);
  });

  it("Use photo uploads the cropped PNG and closes", async () => {
    const { onConfirm, onClose } = setup();
    await choose(file("me.png", "image/png"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Use photo" }));
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect((onConfirm.mock.calls[0] as unknown as [Blob])[0]).toBe(crop.blob);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("a refused upload keeps the dialog open and says why", async () => {
    const { onClose } = setup({ onConfirm: vi.fn(async () => ({ ok: false as const, message: "That picture is too large (the limit is 5 MB)." })) });
    await choose(file("me.png", "image/png"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Use photo" }));
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/limit is 5 MB/);
    expect((screen.getByRole("button", { name: "Use photo" }) as HTMLButtonElement).disabled).toBe(false); // can try again
  });

  it("a browser that cannot draw the crop says so instead of uploading nothing", async () => {
    crop.blob = null;
    const { onConfirm } = setup();
    await choose(file("me.png", "image/png"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Use photo" }));
    });
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/couldn.t prepare/);
  });

  describe("the region note (DESIGN 5.2)", () => {
    it("shows the note until it is dismissed, and remembers that", () => {
      const first = render(<PhotoDialog open onClose={() => {}} discouraged={false} onConfirm={async () => ({ ok: true })} />);
      expect(screen.getByTestId("photo-region-note").textContent).toContain(REGION_NOTE);
      fireEvent.click(screen.getByRole("button", { name: "Got it" }));
      expect(screen.queryByTestId("photo-region-note")).toBeNull();
      expect(window.localStorage.getItem(NOTICE_SEEN_KEY)).toBe("1");
      first.unmount();
      render(<PhotoDialog open onClose={() => {}} discouraged={false} onConfirm={async () => ({ ok: true })} />);
      expect(screen.queryByTestId("photo-region-note")).toBeNull();
    });

    it("elsewhere the primary button is Use photo", async () => {
      setup({ discouraged: false });
      await choose(file("me.png", "image/png"));
      expect(screen.getByRole("button", { name: "Use photo" })).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Keep photo off" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Use photo anyway" })).toBeNull();
    });

    it("in a discouraged region the primary button is Keep photo off (stores nothing), Use photo anyway is the second choice", async () => {
      const { onClose, onConfirm } = setup({ discouraged: true });
      await choose(file("me.png", "image/png"));
      const keepOff = screen.getByRole("button", { name: "Keep photo off" });
      expect(keepOff.className).toContain("bg-accent text-on-accent"); // the accent (primary) button
      expect(screen.getByRole("button", { name: "Use photo anyway" }).className).not.toContain("bg-accent text-on-accent");
      expect(screen.queryByRole("button", { name: "Use photo" })).toBeNull();

      fireEvent.click(keepOff);
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onConfirm).not.toHaveBeenCalled();

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Use photo anyway" }));
      });
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });
  });

  it("closing forgets the picture and releases its object URL", async () => {
    const props = { onClose: () => {}, discouraged: false, onConfirm: async () => ({ ok: true as const }) };
    const { rerender } = render(<PhotoDialog open {...props} />);
    await choose(file("me.png", "image/png"));
    rerender(<PhotoDialog open={false} {...props} />);
    expect(revoked).toContain(created[0]);
    rerender(<PhotoDialog open {...props} />);
    expect(screen.getByText("Add a photo")).toBeTruthy(); // back at the chooser
  });
});
