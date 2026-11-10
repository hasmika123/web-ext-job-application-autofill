// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ConnectExtensionDialog from "./ConnectExtensionDialog";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Connect extension (D6): a friendly install-first state, never a red error", () => {
  it("offers the install link and a Connect button, and names no platform", () => {
    render(<ConnectExtensionDialog open onClose={() => {}} />);
    expect(screen.getByText(/Install the browser extension first/)).toBeTruthy();
    const link = document.querySelector<HTMLAnchorElement>("[data-install-extension]")!;
    expect(link.href).toMatch(/^https:\/\//);
    expect(link.rel).toContain("noopener");
    expect(document.body.textContent).not.toMatch(/kiwiply/i);
  });

  it("opens this organization's own connect page in a new tab and closes", () => {
    const open = vi.fn();
    vi.stubGlobal("open", open);
    const onClose = vi.fn();
    render(<ConnectExtensionDialog open onClose={onClose} />);
    fireEvent.click(document.querySelector("[data-connect-extension]")!);
    expect(open).toHaveBeenCalledWith("/connect", "_blank", "noopener,noreferrer");
    expect(onClose).toHaveBeenCalled();
  });
});
