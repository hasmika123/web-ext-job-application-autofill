import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@kiwiply/ui";
import type { AdminResult } from "@/lib/admin-client";
import { FieldError, Tick } from "./controls";
import { AdminSaveProvider, useAdminSave } from "./useAdminSave";
import type { AdminFetcher, AdminSaveRequest } from "./useAdminSave";
import { DESKTOP, stubViewport } from "./kit-test-utils";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const ok = <T,>(data: T): AdminResult<T> => ({ ok: true, data });
const bad = (error: string, status = 400, code: string | null = null): AdminResult<never> => ({ ok: false, status, code, error, extra: {} });

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (v: T) => void;
}
function defer<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

/** A control: shows `shown("a", saved)`, saves through the engine on click, exposes tick / busy / error. */
function Control({ req, saved = "old", label = "go" }: { req: Partial<AdminSaveRequest<{ v: string }>>; saved?: string; label?: string }) {
  const a = useAdminSave();
  return (
    <div>
      <output aria-label={`value ${label}`}>{a.shown(req.key ?? "a", saved)}</output>
      <output aria-label={`busy ${label}`}>{String(a.busy(req.key ?? "a"))}</output>
      <button
        type="button"
        onClick={() =>
          void a.save<{ v: string }>({ key: "a", row: "r1", method: "PATCH", path: "/things/1", body: { v: "new" }, ...req })
        }
      >
        {label}
      </button>
      <Tick k={req.key ?? "a"} />
      <FieldError k={req.key ?? "a"} />
    </div>
  );
}

function mount(fetcher: AdminFetcher, ui: React.ReactNode) {
  return render(
    <ToastProvider>
      <AdminSaveProvider fetcher={fetcher}>{ui}</AdminSaveProvider>
    </ToastProvider>,
  );
}

describe("useAdminSave", () => {
  it("shows the new value while the request runs, then a ✓ and the page's merge", async () => {
    const d = defer<AdminResult<{ v: string }>>();
    const fetcher = vi.fn(() => d.promise) as unknown as AdminFetcher;
    const onSaved = vi.fn();
    mount(fetcher, <Control req={{ optimistic: "new", onSaved }} />);
    fireEvent.click(screen.getByRole("button", { name: "go" }));
    await waitFor(() => expect(screen.getByLabelText("value go").textContent).toBe("new"));
    expect(screen.getByLabelText("busy go").textContent).toBe("true");
    expect(fetcher).toHaveBeenCalledWith("PATCH", "/things/1", { v: "new" });

    await act(async () => d.resolve(ok({ v: "new" })));
    await screen.findByRole("img", { name: "Saved" });
    expect(onSaved).toHaveBeenCalledWith({ v: "new" });
    expect(screen.getByLabelText("busy go").textContent).toBe("false");
    expect(screen.getByLabelText("value go").textContent).toBe("old"); // back to what the page says; onSaved merged the new value
  });

  it("a failure shows the API's message under the control and falls back to the saved value", async () => {
    const fetcher = vi.fn(async () => bad("Must be between 40 and 90.")) as unknown as AdminFetcher;
    const onSaved = vi.fn();
    mount(fetcher, <Control req={{ optimistic: "99", onSaved }} />);
    fireEvent.click(screen.getByRole("button", { name: "go" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Must be between 40 and 90.");
    expect(alert.className).toContain("text-danger-text");
    expect(screen.getByLabelText("value go").textContent).toBe("old");
    expect(screen.queryByRole("img", { name: "Saved" })).toBeNull();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("offers an undo toast whose button sends the reverse request (and that save has no further undo)", async () => {
    const fetcher = vi.fn(async () => ok({ v: "x" })) as unknown as AdminFetcher;
    mount(fetcher, <Control req={{ undoTitle: "Match threshold set to 70", undo: { method: "DELETE", path: "/things/1" } }} />);
    fireEvent.click(screen.getByRole("button", { name: "go" }));
    await screen.findByText("Match threshold set to 70");
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(fetcher).toHaveBeenLastCalledWith("DELETE", "/things/1", undefined);
    await screen.findByRole("img", { name: "Saved" });
    expect(screen.queryByText("Match threshold set to 70")).toBeNull();
  });

  it("serialises requests of one row but lets different rows run together", async () => {
    const first = defer<AdminResult<unknown>>();
    const calls: string[] = [];
    const fetcher = vi.fn((_m: string, path: string) => {
      calls.push(path);
      return path === "/first" ? first.promise : Promise.resolve(ok({}));
    }) as unknown as AdminFetcher;
    mount(
      fetcher,
      <>
        <Control req={{ key: "k1", row: "same", path: "/first" }} label="one" />
        <Control req={{ key: "k2", row: "same", path: "/second" }} label="two" />
        <Control req={{ key: "k3", row: "other", path: "/third" }} label="three" />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "one" }));
    fireEvent.click(screen.getByRole("button", { name: "two" }));
    fireEvent.click(screen.getByRole("button", { name: "three" }));
    await waitFor(() => expect(calls).toEqual(["/first", "/third"])); // "/second" waits for "/first"
    await act(async () => first.resolve(ok({})));
    await waitFor(() => expect(calls).toEqual(["/first", "/third", "/second"]));
  });

  it("askReason opens the sheet and the reason travels in the confirmed save", async () => {
    stubViewport(DESKTOP);
    const fetcher = vi.fn(async () => ok({})) as unknown as AdminFetcher;
    function Ask() {
      const a = useAdminSave();
      return (
        <button
          type="button"
          onClick={() =>
            a.askReason({
              title: "Turn off server AI?",
              body: "Resume parsing stops.",
              confirmLabel: "Turn off",
              run: (reason) => a.save({ key: "global", row: "global", method: "PATCH", path: "/config/global", body: { enabled: false, reason } }),
            })
          }
        >
          ask
        </button>
      );
    }
    mount(fetcher, <Ask />);
    fireEvent.click(screen.getByRole("button", { name: "ask" }));
    fireEvent.change(screen.getByLabelText("Reason (required)"), { target: { value: "Provider outage" } });
    fireEvent.click(screen.getByRole("button", { name: "Turn off" }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledWith("PATCH", "/config/global", { enabled: false, reason: "Provider outage" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("useAdminSave outside a provider says so", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => render(<Control req={{}} />)).toThrow(/AdminSaveProvider/);
    spy.mockRestore();
  });
});
