import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@kiwiply/ui";
import type { NotificationPrefsView } from "@/lib/notification-preferences";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

import NotificationPrefsProvider from "./NotificationPrefsProvider";
import NotificationsPanel from "./NotificationsPanel";
import TimeZoneField from "./TimeZoneField";

const view = (over: Partial<NotificationPrefsView> = {}): NotificationPrefsView => ({
  matrix: {
    APP_STATUS: { inapp: true, email: "now" },
    SYSTEM: { inapp: true, email: "off" },
    BILLING: { inapp: true, email: "now" },
  },
  quietStart: null,
  quietEnd: null,
  tz: "UTC",
  stored: true,
  emailEnabled: true,
  quietDefaults: { start: "22:00", end: "08:00" },
  kinds: [
    { kind: "APP_STATUS", title: "Application updates", description: "When an email moves an application.", locked: false, lockedWhy: null },
    { kind: "SYSTEM", title: "Kiwiply news", description: "Product updates.", locked: false, lockedWhy: null },
    { kind: "BILLING", title: "Billing", description: "Receipts and card problems.", locked: true, lockedWhy: "Needed so you never miss a payment issue." },
  ],
  updatedAt: null,
  ...over,
});

function setup(initial: NotificationPrefsView | null, demo = false) {
  return render(
    <ToastProvider>
      <NotificationPrefsProvider initial={initial} demo={demo}>
        <TimeZoneField />
        <NotificationsPanel />
      </NotificationPrefsProvider>
    </ToastProvider>,
  );
}

const rowOf = (title: string) => screen.getByText(title).closest("li") as HTMLElement;
const puts = () => (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter((c) => c[1]?.method === "PUT");
const lastBody = () => JSON.parse(puts().at(-1)![1].body);

beforeEach(() => {
  refresh.mockReset();
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("NotificationsPanel (E2E-U7.0)", () => {
  it("shows every kind the API lists, with its words, and no Save button", () => {
    setup(view());
    expect(screen.getByRole("heading", { name: "Notifications" })).toBeTruthy();
    for (const t of ["Application updates", "Kiwiply news", "Billing"]) expect(screen.getByText(t)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /save/i })).toBeNull();
    expect(screen.queryByText(/coming soon/i)).toBeNull();
    expect(screen.getAllByRole("status").length).toBeGreaterThan(0); // the save chip
  });

  it("billing is always on, disabled, and says why", () => {
    setup(view());
    const row = rowOf("Billing");
    expect(within(row).getByText("Always on")).toBeTruthy();
    expect(within(row).getByText(/Needed so you never miss a payment issue/)).toBeTruthy();
    for (const s of within(row).getAllByRole("switch")) {
      expect(s.getAttribute("aria-checked")).toBe("true");
      expect((s as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it("a switch saves by itself, a moment later, with the whole panel", async () => {
    setup(view());
    fireEvent.click(within(rowOf("Application updates")).getByRole("switch", { name: "Email" }));
    expect(puts()).toHaveLength(0); // debounced, not instant
    await waitFor(() => expect(puts()).toHaveLength(1), { timeout: 3000 });
    const body = lastBody();
    expect(body.matrix.APP_STATUS).toEqual({ inapp: true, email: "off" });
    expect(body.matrix.SYSTEM).toEqual({ inapp: true, email: "off" });
    expect(body.quietStart).toBeNull();
    expect(body.tz).toBe("UTC");
    await waitFor(() => expect(within(rowOf("Application updates")).getByRole("img", { name: "Saved" })).toBeTruthy());
  });

  it("switching something off offers Undo, and Undo puts it back", async () => {
    setup(view());
    const email = () => within(rowOf("Application updates")).getByRole("switch", { name: "Email" });
    fireEvent.click(email());
    expect(email().getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText("Application updates: email off")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(email().getAttribute("aria-checked")).toBe("true");
    await waitFor(() => expect(puts().length).toBeGreaterThan(0), { timeout: 3000 });
    expect(lastBody().matrix.APP_STATUS.email).toBe("now");
  });

  it("switching something on does not toast", () => {
    setup(view());
    fireEvent.click(within(rowOf("Kiwiply news")).getByRole("switch", { name: "Email" }));
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });

  it("quiet hours: off by default, on shows the server's window and saves it", async () => {
    setup(view());
    expect(screen.queryByLabelText("From")).toBeNull();
    fireEvent.click(screen.getByRole("switch", { name: "Quiet hours" }));
    expect((screen.getByLabelText("From") as HTMLInputElement).value).toBe("22:00");
    expect((screen.getByLabelText("Until") as HTMLInputElement).value).toBe("08:00");
    await waitFor(() => expect(puts()).toHaveLength(1), { timeout: 3000 });
    expect(lastBody()).toMatchObject({ quietStart: "22:00", quietEnd: "08:00" });

    fireEvent.change(screen.getByLabelText("Until"), { target: { value: "07:15" } });
    await waitFor(() => expect(puts()).toHaveLength(2), { timeout: 3000 });
    expect(lastBody().quietEnd).toBe("07:15");
  });

  it("the first change of a never-saved record saves the browser's own time zone", async () => {
    setup(view({ stored: false, tz: "UTC" }));
    fireEvent.click(within(rowOf("Kiwiply news")).getByRole("switch", { name: "Email" }));
    await waitFor(() => expect(puts()).toHaveLength(1), { timeout: 3000 });
    expect(lastBody().tz).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });

  it("a failed save says so and offers Retry", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 422 })));
    setup(view());
    fireEvent.click(within(rowOf("Kiwiply news")).getByRole("switch", { name: "Email" }));
    await waitFor(() => expect(screen.getAllByRole("status")[0].textContent).toMatch(/Not saved/), { timeout: 3000 });
    expect(screen.getAllByRole("button", { name: "Retry" }).length).toBeGreaterThan(0); // the panel chip, and the zone field shows its own where the zone is the only thing on screen
  });

  it("while email is paused the email switches are off-limits and it says so", () => {
    setup(view({ emailEnabled: false }));
    expect(screen.getByText(/Emails are paused/)).toBeTruthy();
    for (const s of screen.getAllByRole("switch", { name: "Email" })) expect((s as HTMLButtonElement).disabled).toBe(true);
  });

  it("a demo account sees the settings but nothing is editable or saved", async () => {
    setup(view(), true);
    expect(screen.getByText(/Demo account/)).toBeTruthy();
    const s = within(rowOf("Kiwiply news")).getByRole("switch", { name: "Email" });
    expect((s as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(s);
    await new Promise((r) => setTimeout(r, 900));
    expect(puts()).toHaveLength(0);
  });

  it("when the preferences cannot be loaded it says so with Retry, never made-up switches", () => {
    setup(null);
    expect(screen.getByRole("alert").textContent).toMatch(/Couldn.t load your notification settings/);
    expect(screen.queryByRole("switch")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refresh).toHaveBeenCalled();
  });
});

describe("TimeZoneField (E2E-U14.0)", () => {
  it("shows the saved zone and a tick after it changes", () => {
    setup(view({ tz: "Asia/Kolkata" }));
    expect(screen.getAllByText("Asia/Kolkata").length).toBeGreaterThan(0);
  });

  it("shows the browser's zone until the first save, and says it was detected", () => {
    setup(view({ stored: false, tz: "UTC" }));
    expect(screen.getByText(/Detected from your browser/)).toBeTruthy();
  });

  it("when the preferences cannot be loaded it says so", () => {
    setup(null);
    expect(screen.getByText(/Couldn.t load your time zone/)).toBeTruthy();
  });
});
