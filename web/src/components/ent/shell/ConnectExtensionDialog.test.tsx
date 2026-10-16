// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ConnectExtensionDialog from "./ConnectExtensionDialog";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Connect extension (D6): a friendly install-first state, never a red error", () => {
  it("offers the install link and a Connect button", () => {
    render(<ConnectExtensionDialog open onClose={() => {}} />);
    expect(screen.getByText(/Install the Kiwiply extension first/)).toBeTruthy();
    const link = document.querySelector<HTMLAnchorElement>("[data-install-extension]")!;
    expect(link.href).toMatch(/^https:\/\//);
    expect(link.rel).toContain("noopener");
  });

  it("a failed request is a calm sentence in the dialog", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }) as Response));
    render(<ConnectExtensionDialog open onClose={() => {}} />);
    fireEvent.click(document.querySelector("[data-connect-extension]")!);
    await waitFor(() => expect(document.querySelector("[data-connect-message]")?.textContent).toContain("Couldn't start the connection"));
    expect(document.querySelector('[role="alert"]')).toBeNull();
  });

  it("opens the connect page in a new tab on success and closes", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ connectUrl: "https://kiwiply.com/connect?code=abc" }) }) as Response));
    const open = vi.fn();
    vi.stubGlobal("open", open);
    const onClose = vi.fn();
    render(<ConnectExtensionDialog open onClose={onClose} />);
    fireEvent.click(document.querySelector("[data-connect-extension]")!);
    await waitFor(() => expect(open).toHaveBeenCalledWith("https://kiwiply.com/connect?code=abc", "_blank", "noopener,noreferrer"));
    expect(onClose).toHaveBeenCalled();
  });
});
