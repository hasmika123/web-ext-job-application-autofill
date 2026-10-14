import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import TempPasswordDialog from "./TempPasswordDialog";
import { DESKTOP, PHONE, stubViewport } from "@/components/admin-v3/common/kit-test-utils";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const SECRET = "Zq7!hTn4-Wm2+Rp9"; // test value, not a credential

describe("TempPasswordDialog", () => {
  it("shows the password once with a warning, copies it, and drops it when closed", async () => {
    stubViewport(DESKTOP);
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const onClose = vi.fn();
    const { rerender } = render(<TempPasswordDialog open who="olivia@example.test" password={SECRET} expiresAt="2026-10-21T10:00:00Z" onClose={onClose} />);
    expect((screen.getByTestId("temp-password") as HTMLInputElement).value).toBe(SECRET);
    expect(screen.getByRole("alert").textContent).toMatch(/Shown once/);
    expect(screen.getByText(/olivia@example.test/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(SECRET));
    expect(await screen.findByRole("button", { name: "Copied" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "I have copied it" }));
    expect(onClose).toHaveBeenCalled();
    rerender(<TempPasswordDialog open={false} who="olivia@example.test" password={null} onClose={onClose} />);
    expect(document.body.textContent).not.toContain(SECRET);
  });

  it("falls back to selecting the text when the browser blocks the clipboard", async () => {
    stubViewport(PHONE);
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("blocked")) } });
    render(<TempPasswordDialog open who="Sam" password={SECRET} onClose={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(await screen.findByText(/blocked copying/)).toBeTruthy();
  });

  it("says no password was issued for an existing account", () => {
    stubViewport(DESKTOP);
    render(<TempPasswordDialog open who="sam@example.test" password={null} onClose={() => undefined} />);
    expect(screen.queryByTestId("temp-password")).toBeNull();
    expect(screen.getByText(/already has a Kiwiply account/)).toBeTruthy();
  });
});
