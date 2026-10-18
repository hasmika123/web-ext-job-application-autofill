import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@kiwiply/ui";
import SubprocessorsAdmin from "./SubprocessorsAdmin";
import type { SubprocessorSlot } from "@/lib/subprocessors-admin";

const entry = (name: string, over: Record<string, string> = {}) => ({ name, purpose: `${name} purpose`, data: "E-mail", location: "US", link: "https://x.example/p", dpaStatus: "To be confirmed", ...over });
const slots = (): SubprocessorSlot[] =>
  Array.from({ length: 12 }, (_, i) => {
    const used = i < 2;
    return { slot: i + 1, empty: !used, entry: used ? entry(i === 0 ? "Stripe" : "Brevo") : { name: "", purpose: "", data: "", location: "", link: "", dpaStatus: "" } };
  });

const jsonRes = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function stub(status = 200) {
  const fn = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => (status === 200 ? jsonRes({ key: "ok" }) : jsonRes({ error: "Link must be https." }, status)));
  vi.stubGlobal("fetch", fn);
  return fn;
}
const setup = (initial: SubprocessorSlot[] | null = slots()) =>
  render(
    <ToastProvider>
      <SubprocessorsAdmin initial={initial} />
    </ToastProvider>,
  );
const body = (fn: ReturnType<typeof stub>, n = 0) => JSON.parse(String((fn.mock.calls[n] as unknown as [string, RequestInit])[1].body));
const url = (fn: ReturnType<typeof stub>, n = 0) => String(fn.mock.calls[n][0]);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SubprocessorsAdmin (T1.5)", () => {
  it("lists the used slots with every field, including the DPA status only the admin sees", () => {
    setup();
    expect(screen.getByTestId("subprocessor-admin-list").querySelectorAll("li")).toHaveLength(2);
    expect((screen.getByLabelText("Stripe DPA status (only you see this)") as HTMLInputElement).value).toBe("To be confirmed");
    expect((screen.getByLabelText("Brevo What it does for us") as HTMLInputElement).value).toBe("Brevo purpose");
    expect(screen.getByRole("link", { name: "View the public page" }).getAttribute("href")).toBe("/legal/subprocessors");
  });

  it("saves a changed field on blur, sending the whole entry through the slot route", async () => {
    const fn = stub();
    setup();
    const dpa = screen.getByLabelText("Stripe DPA status (only you see this)");
    fireEvent.change(dpa, { target: { value: "Signed 2026-11" } });
    fireEvent.blur(dpa);
    await waitFor(() => expect(fn).toHaveBeenCalledTimes(1));
    expect(url(fn)).toBe("/api/admin/subprocessors/01");
    expect((fn.mock.calls[0] as unknown as [string, RequestInit])[1].method).toBe("PUT");
    expect(body(fn)).toEqual({ value: { name: "Stripe", purpose: "Stripe purpose", data: "E-mail", location: "US", link: "https://x.example/p", dpaStatus: "Signed 2026-11" } });
  });

  it("does not send a link that is not https, and does not send an empty name", async () => {
    const fn = stub();
    setup();
    const link = screen.getByLabelText("Brevo Link to its privacy terms");
    fireEvent.change(link, { target: { value: "http://x.example" } });
    fireEvent.blur(link);
    expect((await screen.findByRole("alert")).textContent).toContain("https://");
    const name = screen.getByLabelText("Brevo Name");
    fireEvent.change(name, { target: { value: "" } });
    fireEvent.blur(name);
    await waitFor(() => expect(screen.getAllByRole("alert").some((a) => a.textContent?.includes("A name is needed"))).toBe(true));
    expect(fn).not.toHaveBeenCalled();
  });

  it("Remove writes an empty object for the slot and the entry leaves the list", async () => {
    const fn = stub();
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Remove Brevo" }));
    await waitFor(() => expect(screen.getByTestId("subprocessor-admin-list").querySelectorAll("li")).toHaveLength(1));
    expect(url(fn)).toBe("/api/admin/subprocessors/02");
    expect(body(fn)).toEqual({ value: {} });
    expect(screen.getByRole("button", { name: "Undo" })).toBeTruthy();
  });

  it("adds a new subprocessor in the first free slot with the DPA status To be confirmed", async () => {
    const fn = stub();
    setup();
    const add = screen.getByLabelText("New subprocessor name");
    fireEvent.change(add, { target: { value: "Acme Mail" } });
    fireEvent.blur(add);
    await waitFor(() => expect(fn).toHaveBeenCalledTimes(1));
    expect(url(fn)).toBe("/api/admin/subprocessors/03");
    expect(body(fn)).toEqual({ value: { name: "Acme Mail", dpaStatus: "To be confirmed" } });
    await waitFor(() => expect(screen.getByTestId("subprocessor-admin-list").querySelectorAll("li")).toHaveLength(3));
  });

  it("shows the API's refusal under the field and keeps the saved value", async () => {
    stub(400);
    setup();
    const dpa = screen.getByLabelText("Stripe DPA status (only you see this)");
    fireEvent.change(dpa, { target: { value: "x" } });
    fireEvent.blur(dpa);
    expect((await screen.findByRole("alert")).textContent).toContain("Link must be https.");
    await waitFor(() => expect((screen.getByLabelText("Stripe DPA status (only you see this)") as HTMLInputElement).value).toBe("To be confirmed"));
  });

  it("says so when the register could not be loaded", () => {
    setup(null);
    expect(screen.getByRole("alert").textContent).toContain("could not be loaded");
  });
});
