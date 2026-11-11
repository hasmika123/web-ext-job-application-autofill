// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ImportConsultantsSheet from "./ImportConsultantsSheet";

const check = {
  total: 2,
  ready: 1,
  rows: [
    { row: 1, email: "ana@x.test", status: "READY", field: null, message: null, invite: "WILL_INVITE" },
    { row: 2, email: "nope", status: "INVALID", field: "email", message: "Enter a valid email address.", invite: null },
  ],
};

let calls: { url: string; body: unknown }[];
beforeEach(() => {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
      const json = url.endsWith("/check") ? check : { added: 1, invited: 1, skipped: 1, rows: [{ row: 1, email: "ana@x.test", outcome: "CREATED", invited: true }, { row: 2, email: "nope", outcome: "SKIPPED", invited: false, message: "Enter a valid email address." }] };
      return new Response(JSON.stringify(json), { status: 200 });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const settle = () => act(async () => {});
const csv = () => new File(["name,email\nAna Abe,ana@x.test\nBad,nope\n"], "team.csv", { type: "text/csv" });

/** ONBOARDING-BUILD.md A3: upload, review every row's verdict, import only the ready ones. */
describe("ImportConsultantsSheet", () => {
  it("reads the file, shows each row's verdict, and imports the ready rows with their invitation", async () => {
    const onImported = vi.fn();
    render(<ImportConsultantsSheet orgId={2} canInvite onClose={() => {}} onImported={onImported} />);
    fireEvent.change(screen.getByLabelText("CSV file"), { target: { files: [csv()] } });
    await settle();
    await settle();
    expect(calls[0].url).toBe("/api/orgs/2/consultants/import/check");
    expect((calls[0].body as { rows: { email: string; invite: boolean }[] }).rows.map((r) => [r.email, r.invite])).toEqual([["ana@x.test", true], ["nope", true]]);
    expect(document.querySelector("[data-import-row='2']")?.getAttribute("data-status")).toBe("INVALID");
    expect(screen.getByText("Enter a valid email address.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Import 1 consultant" }));
    await settle();
    expect(calls.at(-1)?.url).toBe("/api/orgs/2/consultants/import");
    expect(onImported).toHaveBeenCalledWith(expect.objectContaining({ added: 1, invited: 1 }));
    expect(document.querySelector("[data-import-done]")?.textContent).toMatch(/1 consultant added · 1 invited · 1 skipped/);
  });

  it("someone who can't invite gets no invite switch and the rows go up un-ticked", async () => {
    render(<ImportConsultantsSheet orgId={2} canInvite={false} onClose={() => {}} onImported={() => {}} />);
    expect(screen.queryByText("Invite everyone to join")).toBeNull();
    fireEvent.change(screen.getByLabelText("CSV file"), { target: { files: [csv()] } });
    await settle();
    await settle();
    expect((calls[0].body as { rows: { invite: boolean }[] }).rows.every((r) => r.invite === false)).toBe(true);
  });
});
