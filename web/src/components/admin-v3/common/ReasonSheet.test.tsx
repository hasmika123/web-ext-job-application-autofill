import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdminOutcome } from "@/lib/admin-client";
import ConfirmTypedSheet from "./ConfirmTypedSheet";
import type { ConfirmTypedSpec } from "./ConfirmTypedSheet";
import ReasonSheet, { REASON_MAX, REASON_MIN, reasonOk, reasonProblem } from "./ReasonSheet";
import type { ReasonSpec } from "./ReasonSheet";
import { DESKTOP, PHONE, stubViewport } from "./kit-test-utils";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const OK: AdminOutcome = { ok: true };
const fail = (error: string, code: string | null = null): AdminOutcome => ({ ok: false, status: 409, code, error, extra: {} });

function Harness({ spec }: { spec: ReasonSpec }) {
  const [open, setOpen] = useState<ReasonSpec | null>(null);
  return (
    <>
      <button type="button" onClick={() => setOpen(spec)}>
        Open sheet
      </button>
      <ReasonSheet spec={open} onClose={() => setOpen(null)} />
    </>
  );
}

const spec = (run: ReasonSpec["run"], over: Partial<ReasonSpec> = {}): ReasonSpec => ({ title: "Turn off resume parsing?", body: "New resumes will not be parsed.", confirmLabel: "Turn off", run, ...over });

const why = () => screen.getByLabelText("Reason (required)") as HTMLTextAreaElement;
const type = (text: string) => fireEvent.change(why(), { target: { value: text } });

describe("reasonOk / reasonProblem", () => {
  it("needs 10 to 500 characters after trimming, and does not scold an empty box", () => {
    expect(REASON_MIN).toBe(10);
    expect(REASON_MAX).toBe(500);
    expect(reasonOk("short")).toBe(false);
    expect(reasonOk("   padded     ")).toBe(false);
    expect(reasonOk("Gemini 5xx spike")).toBe(true);
    expect(reasonOk("x".repeat(REASON_MAX + 1))).toBe(false);
    expect(reasonProblem("")).toBeNull();
    expect(reasonProblem("short")).toMatch(/at least 10/);
    expect(reasonProblem("long enough reason")).toBeNull();
  });
});

describe("ReasonSheet on a desktop", () => {
  it("is a dialog; the confirm button stays off until the reason is 10 characters", () => {
    stubViewport(DESKTOP);
    render(<Harness spec={spec(vi.fn(async () => OK))} />);
    fireEvent.click(screen.getByRole("button", { name: "Open sheet" }));
    const dialog = screen.getByRole("dialog", { name: "Turn off resume parsing?" });
    const go = within(dialog).getByRole("button", { name: "Turn off" }) as HTMLButtonElement;
    expect(go.disabled).toBe(true);
    type("too short");
    expect(go.disabled).toBe(true);
    expect(within(dialog).getByText(/at least 10 characters/)).toBeTruthy();
    type("Gemini 5xx spike");
    expect(go.disabled).toBe(false);
    expect(within(dialog).getByText("16/500")).toBeTruthy();
  });

  it("sends the trimmed reason, closes on success and hands focus back to the opener", async () => {
    stubViewport(DESKTOP);
    const run = vi.fn(async () => OK);
    render(<Harness spec={spec(run)} />);
    const opener = screen.getByRole("button", { name: "Open sheet" });
    opener.focus();
    fireEvent.click(opener);
    type("  Gemini 5xx spike  ");
    fireEvent.click(screen.getByRole("button", { name: "Turn off" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(run).toHaveBeenCalledWith("Gemini 5xx spike", false);
    expect(document.activeElement).toBe(opener);
  });

  it("Cancel and Escape close without sending", async () => {
    stubViewport(DESKTOP);
    const run = vi.fn(async () => OK);
    render(<Harness spec={spec(run)} />);
    fireEvent.click(screen.getByRole("button", { name: "Open sheet" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "Open sheet" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(run).not.toHaveBeenCalled();
  });

  it("a refusal stays inside the sheet with what the admin typed", async () => {
    stubViewport(DESKTOP);
    const run = vi.fn(async () => fail("A reason is required."));
    render(<Harness spec={spec(run)} />);
    fireEvent.click(screen.getByRole("button", { name: "Open sheet" }));
    type("Gemini 5xx spike");
    fireEvent.click(screen.getByRole("button", { name: "Turn off" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("A reason is required.");
    expect(alert.className).toContain("text-danger-text");
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(why().value).toBe("Gemini 5xx spike");
  });

  it("offers the forced action only for the refusal code the spec names", async () => {
    stubViewport(DESKTOP);
    const run = vi
      .fn<ReasonSpec["run"]>()
      .mockResolvedValueOnce(fail("2 tasks route here.", "AI_PROVIDER_IN_USE"))
      .mockResolvedValueOnce(OK);
    render(<Harness spec={spec(run, { forceLabel: "Turn off anyway", forceCode: "AI_PROVIDER_IN_USE" })} />);
    fireEvent.click(screen.getByRole("button", { name: "Open sheet" }));
    expect(screen.queryByRole("button", { name: "Turn off anyway" })).toBeNull();
    type("Gemini 5xx spike");
    fireEvent.click(screen.getByRole("button", { name: "Turn off" }));
    fireEvent.click(await screen.findByRole("button", { name: "Turn off anyway" }));
    await waitFor(() => expect(run).toHaveBeenCalledTimes(2));
    expect(run).toHaveBeenLastCalledWith("Gemini 5xx spike", true);
  });

  it("another refusal code does not offer the forced action", async () => {
    stubViewport(DESKTOP);
    render(<Harness spec={spec(vi.fn(async () => fail("Nope.", "SOMETHING_ELSE")), { forceLabel: "Turn off anyway", forceCode: "AI_PROVIDER_IN_USE" })} />);
    fireEvent.click(screen.getByRole("button", { name: "Open sheet" }));
    type("Gemini 5xx spike");
    fireEvent.click(screen.getByRole("button", { name: "Turn off" }));
    await screen.findByRole("alert");
    expect(screen.queryByRole("button", { name: "Turn off anyway" })).toBeNull();
  });

  it("Ctrl+Enter in the reason box submits", async () => {
    stubViewport(DESKTOP);
    const run = vi.fn(async () => OK);
    render(<Harness spec={spec(run)} />);
    fireEvent.click(screen.getByRole("button", { name: "Open sheet" }));
    type("Gemini 5xx spike");
    fireEvent.keyDown(why(), { key: "Enter", ctrlKey: true });
    await waitFor(() => expect(run).toHaveBeenCalled());
  });

  it("the primary tone is for a HIGH action that is not destructive", () => {
    stubViewport(DESKTOP);
    render(<Harness spec={spec(vi.fn(async () => OK), { confirmLabel: "Export CSV", tone: "primary" })} />);
    fireEvent.click(screen.getByRole("button", { name: "Open sheet" }));
    expect(screen.getByRole("button", { name: "Export CSV" }).className).not.toContain("danger");
  });
});

describe("ReasonSheet on a phone", () => {
  it("is a BottomSheet, and Escape closes it", async () => {
    stubViewport(PHONE);
    render(<Harness spec={spec(vi.fn(async () => OK))} />);
    const opener = screen.getByRole("button", { name: "Open sheet" });
    opener.focus();
    fireEvent.click(opener);
    const sheet = await screen.findByRole("dialog", { name: "Turn off resume parsing?" });
    expect(sheet.id).toBe("admin-reason-sheet");
    expect(within(sheet).getByLabelText("Reason (required)")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });
});

describe("ConfirmTypedSheet", () => {
  const typedSpec = (run: ConfirmTypedSpec["run"]): ConfirmTypedSpec => ({
    title: "Delete priya.nair?",
    body: "Erases the account and every resume. This cannot be undone.",
    confirmLabel: "Delete account",
    expected: "priya.nair",
    expectedLabel: "login",
    run,
  });

  function TypedHarness({ s }: { s: ConfirmTypedSpec }) {
    const [open, setOpen] = useState<ConfirmTypedSpec | null>(null);
    return (
      <>
        <button type="button" onClick={() => setOpen(s)}>
          Open sheet
        </button>
        <ConfirmTypedSheet spec={open} onClose={() => setOpen(null)} />
      </>
    );
  }

  it("needs the exact name AND a reason before the red button lights", async () => {
    stubViewport(DESKTOP);
    const run = vi.fn(async () => OK);
    render(<TypedHarness s={typedSpec(run)} />);
    fireEvent.click(screen.getByRole("button", { name: "Open sheet" }));
    const go = screen.getByRole("button", { name: "Delete account" }) as HTMLButtonElement;
    const name = screen.getByLabelText("Type priya.nair to confirm") as HTMLInputElement;
    expect(go.disabled).toBe(true);

    fireEvent.change(name, { target: { value: "priya" } });
    type("Verified privacy request #4821");
    expect(go.disabled).toBe(true); // reason ok, name wrong

    fireEvent.change(name, { target: { value: "Priya.Nair" } });
    expect(go.disabled).toBe(true); // case matters

    fireEvent.change(name, { target: { value: " priya.nair " } });
    expect(go.disabled).toBe(false);
    fireEvent.click(go);
    await waitFor(() => expect(run).toHaveBeenCalledWith("Verified privacy request #4821", false));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("a name alone is not enough", () => {
    stubViewport(DESKTOP);
    render(<TypedHarness s={typedSpec(vi.fn(async () => OK))} />);
    fireEvent.click(screen.getByRole("button", { name: "Open sheet" }));
    fireEvent.change(screen.getByLabelText("Type priya.nair to confirm"), { target: { value: "priya.nair" } });
    expect((screen.getByRole("button", { name: "Delete account" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
