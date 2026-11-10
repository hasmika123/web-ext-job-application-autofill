import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@kiwiply/ui";
import TermsBanner from "./TermsBanner";

const jsonRes = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const doc = (over: Record<string, unknown> = {}) => ({ currentVersion: "2026-10", accepted: true, lastAcceptedVersion: "2026-10", ...over });
const upToDate = { terms: doc(), privacy: doc(), upToDate: true };
const newTerms = { terms: doc({ currentVersion: "2027-01", accepted: false }), privacy: doc(), upToDate: false };

function stub(status: unknown, postStatus = 201) {
  const fn = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === "POST") return jsonRes(postStatus === 201 ? { upToDate: true } : { error: "no" }, postStatus);
    return typeof status === "number" ? jsonRes({}, status) : jsonRes(status);
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}
const posts = (fn: ReturnType<typeof stub>) => fn.mock.calls.filter((c) => c[1]?.method === "POST");
const setup = (demo = false) =>
  render(
    <ToastProvider>
      <TermsBanner demo={demo} />
    </ToastProvider>,
  );

beforeEach(() => sessionStorage.clear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("TermsBanner (T0.2)", () => {
  it("renders nothing when the account is up to date", async () => {
    const fn = stub(upToDate);
    setup();
    await waitFor(() => expect(fn).toHaveBeenCalled());
    expect(screen.queryByTestId("terms-banner")).toBeNull();
  });

  it("renders nothing when the API cannot answer, and nothing for a demo account (no request at all)", async () => {
    const fn = stub(500);
    setup();
    await waitFor(() => expect(fn).toHaveBeenCalled());
    expect(screen.queryByTestId("terms-banner")).toBeNull();
    cleanup();
    const demoFn = stub(newTerms);
    setup(true);
    expect(demoFn).not.toHaveBeenCalled();
    expect(screen.queryByTestId("terms-banner")).toBeNull();
  });

  it("says what changed with links to the policy pages, and Accept records the version in force", async () => {
    const fn = stub(newTerms);
    setup();
    const banner = await screen.findByTestId("terms-banner");
    expect(banner.textContent).toContain("We updated our");
    expect(screen.getByRole("link", { name: "Terms of Service" }).getAttribute("href")).toBe("/terms");
    expect(screen.queryByRole("link", { name: "Privacy Policy" })).toBeNull(); // only the document that changed

    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(screen.queryByTestId("terms-banner")).toBeNull());
    expect(posts(fn)).toHaveLength(1);
    expect(JSON.parse(String(posts(fn)[0][1]?.body))).toEqual({ document: "TERMS", version: "2027-01", source: "RECONFIRM" });
  });

  it("asks to confirm both documents when there is no record, recording each as an account acceptance", async () => {
    const none = { accepted: false, lastAcceptedVersion: null };
    const fn = stub({ terms: doc(none), privacy: doc(none), upToDate: false });
    setup();
    const banner = await screen.findByTestId("terms-banner");
    expect(banner.textContent).toContain("Please confirm you accept our");
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(posts(fn)).toHaveLength(2));
    expect(posts(fn).map((c) => JSON.parse(String(c[1]?.body)))).toEqual([
      { document: "TERMS", version: "2026-10", source: "ACCOUNT" },
      { document: "PRIVACY", version: "2026-10", source: "ACCOUNT" },
    ]);
  });

  it("keeps the banner and says so when saving fails", async () => {
    stub(newTerms, 400);
    setup();
    await screen.findByTestId("terms-banner");
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Couldn't save");
    expect(screen.getByTestId("terms-banner")).toBeTruthy();
  });

  it("Later hides it for the rest of the visit without recording anything", async () => {
    const fn = stub(newTerms);
    const { unmount } = setup();
    await screen.findByTestId("terms-banner");
    fireEvent.click(screen.getByRole("button", { name: "Later" }));
    expect(screen.queryByTestId("terms-banner")).toBeNull();
    expect(posts(fn)).toHaveLength(0);
    unmount();
    setup(); // the next page in the same visit
    await waitFor(() => expect(fn.mock.calls.length).toBeGreaterThan(1));
    expect(screen.queryByTestId("terms-banner")).toBeNull();
  });
});
