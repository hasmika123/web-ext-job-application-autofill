import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ATS_STRICT, DESIGN_FREE, ToastProvider } from "@kiwiply/ui";
import type { ResumeDocument } from "@kiwiply/ui";
import type { Autosave } from "../state/autosave";
import { testDoc } from "../state/test-doc";

const lib = vi.hoisted(() => ({
  uploadPhoto: vi.fn(),
  removePhoto: vi.fn(),
  fetchPhotoBlob: vi.fn(),
}));
vi.mock("@/lib/resume-photo", async (orig) => ({ ...(await orig<typeof import("@/lib/resume-photo")>()), ...lib }));

import { usePhoto } from "./usePhoto";

const PHOTO = { key: "resume-photos/3/7-abc-photo.jpg", updatedAt: "2026-10-17T10:00:00Z" };
const savedDto = (photo: typeof PHOTO | null, docVersion: number) => ({ kind: "ok" as const, version: docVersion, dto: { docVersion, doc: { basics: { photo } } } });

const wrapper = ({ children }: { children: ReactNode }) => <ToastProvider>{children}</ToastProvider>;

const OLD_BYTES = new Blob(["old"], { type: "image/jpeg" });

let calls: string[];
let autosave: { current: Autosave | null };
beforeEach(() => {
  calls = [];
  lib.uploadPhoto.mockReset().mockImplementation(async () => {
    calls.push("upload");
    return savedDto(PHOTO, 5);
  });
  lib.removePhoto.mockReset().mockImplementation(async () => {
    calls.push("remove");
    return savedDto(null, 6);
  });
  lib.fetchPhotoBlob.mockReset().mockResolvedValue(OLD_BYTES);
  autosave = {
    current: {
      hold: vi.fn(async () => void calls.push("hold")),
      release: vi.fn((v?: number) => void calls.push(`release:${v ?? "none"}`)),
    } as unknown as Autosave,
  };
});
afterEach(cleanup);

function setup(over: Partial<Parameters<typeof usePhoto>[0]> = {}) {
  const dispatch = vi.fn();
  const changeTheme = vi.fn();
  const onChanged = vi.fn();
  const doc: ResumeDocument = testDoc();
  const args = { resumeId: 42, autosave, dispatch, doc, theme: null, caps: DESIGN_FREE, enabled: true, discouraged: false, changeTheme, onChanged, ...over };
  const hook = renderHook((p: typeof args) => usePhoto(p), { wrapper, initialProps: args });
  return { ...hook, dispatch, changeTheme, onChanged, args };
}

describe("usePhoto (R7.4)", () => {
  it("upload holds the autosave, adopts the saved photo and version, releases against that version, and turns the photo on", async () => {
    const { result, dispatch, changeTheme, onChanged } = setup();
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.upload(new Blob(["png"]));
    });
    expect(outcome).toEqual({ ok: true });
    expect(calls).toEqual(["hold", "upload", "release:5"]);
    expect(dispatch).toHaveBeenCalledWith({ type: "photo/set", photo: PHOTO, version: 5 });
    expect(changeTheme).toHaveBeenCalledWith({ control: "photo", value: true }); // off by default: Use photo shows it
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("a photo that is already shown is not toggled again", async () => {
    const { result, changeTheme } = setup({ theme: { showPhoto: true } });
    await act(async () => {
      await result.current.upload(new Blob(["png"]));
    });
    expect(changeTheme).not.toHaveBeenCalled();
  });

  it("a refused upload changes nothing in the editor and still releases the autosave", async () => {
    lib.uploadPhoto.mockImplementation(async () => {
      calls.push("upload");
      return { kind: "error", status: 413, code: "PHOTO_TOO_LARGE", message: "That picture is too large." };
    });
    const { result, dispatch, changeTheme, onChanged } = setup();
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.upload(new Blob(["png"]));
    });
    expect(outcome).toEqual({ ok: false, message: "That picture is too large." });
    expect(calls).toEqual(["hold", "upload", "release:none"]);
    expect(dispatch).not.toHaveBeenCalled();
    expect(changeTheme).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("remove keeps the old bytes for Undo, deletes through the API, clears the photo and offers Undo", async () => {
    const { result, dispatch } = setup({ doc: { ...testDoc(), basics: { name: "A", photo: PHOTO } } });
    await act(async () => {
      result.current.remove();
    });
    await vi.waitFor(() => expect(dispatch).toHaveBeenCalledWith({ type: "photo/set", photo: null, version: 6 }));
    expect(lib.fetchPhotoBlob).toHaveBeenCalledWith(42);
    expect(calls).toEqual(["hold", "remove", "release:6"]);
    // the toast with its Undo is on screen
    const undo = await vi.waitFor(() => {
      const found = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((b) => b.textContent === "Undo");
      if (!found) throw new Error("no undo yet");
      return found;
    });
    expect(document.body.textContent).toContain("Photo removed");
    await act(async () => {
      undo.click();
    });
    await vi.waitFor(() => expect(lib.uploadPhoto).toHaveBeenCalledTimes(1));
    const [id, blob] = lib.uploadPhoto.mock.calls[0] as [number, Blob];
    expect(id).toBe(42);
    expect(blob).toBe(OLD_BYTES); // the very bytes that were removed go back
  });

  it("a failed removal says so and changes nothing", async () => {
    lib.removePhoto.mockResolvedValue({ kind: "error", status: 500, code: null, message: "Couldn't save the photo." });
    const { result, dispatch } = setup();
    await act(async () => {
      result.current.remove();
    });
    await vi.waitFor(() => expect(document.body.textContent).toContain("Couldn't remove the photo"));
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("setShown saves theme.showPhoto, never the file", () => {
    const { result, changeTheme } = setup();
    act(() => result.current.setShown(false));
    expect(changeTheme).toHaveBeenCalledWith({ control: "photo", value: false });
    expect(lib.uploadPhoto).not.toHaveBeenCalled();
    expect(lib.removePhoto).not.toHaveBeenCalled();
  });

  it("derives what the slot needs: the address (versioned by the photo), the shown flag from the theme or template default, enabled and discouraged as given", () => {
    const withPhoto = { ...testDoc(), basics: { name: "A", photo: PHOTO } };
    const a = setup({ doc: withPhoto, theme: { showPhoto: true }, discouraged: true }).result.current;
    expect(a.src).toBe("/api/resumes/42/photo?v=2026-10-17T10%3A00%3A00Z");
    expect(a.shown).toBe(true);
    expect(a.discouraged).toBe(true);
    expect(a.enabled).toBe(true);

    const b = setup({ doc: withPhoto, theme: null, caps: ATS_STRICT, enabled: false }).result.current;
    expect(b.shown).toBe(false); // the template default is off
    expect(b.enabled).toBe(false);

    expect(setup().result.current.src).toBeNull();
    // acting for the owner: the document says there is a photo but carries no key, so there is no address
    const keyless = { ...testDoc(), basics: { name: "A", photo: {} } } as unknown as ResumeDocument;
    expect(setup({ doc: keyless }).result.current.src).toBeNull();
  });
});
