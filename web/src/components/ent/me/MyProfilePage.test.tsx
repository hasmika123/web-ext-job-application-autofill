// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@kiwiply/ui";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/me", useSearchParams: () => new URLSearchParams() }));
vi.mock("@/components/ent/shell/ShellContext", () => ({ default: ({ title }: { title: string }) => <h1>{title}</h1> }));

import MyProfilePage, { type MyProfileProps } from "./MyProfilePage";

const base: MyProfileProps = {
  orgName: "Acme Staffing",
  firstName: "Omar",
  lastName: "Haddad",
  email: "omar@acme.example",
  phone: "",
  langLabel: "English",
  jobTitle: "Marketing Specialist",
  joinedAt: "2026-01-05T00:00:00Z",
  imageUrl: null,
  roles: [{ name: "Marketing Specialist", isPrimary: true }],
  demo: false,
  notificationPrefs: null,
};

let calls: { url: string; init?: RequestInit }[];
beforeEach(() => {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return { ok: true, status: 200, json: async () => ({ ok: true }) } as Response;
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const mount = (over: Partial<MyProfileProps> = {}) =>
  render(
    <ToastProvider>
      <MyProfilePage {...base} {...over} />
    </ToastProvider>,
  );

describe("My profile (D6): the one basic profile of every member", () => {
  it("has the sections the menu points at and the read-only facts", () => {
    mount();
    for (const id of ["profile", "notifications", "security", "organization"]) expect(document.getElementById(id), id).toBeTruthy();
    expect((screen.getByLabelText("Work email") as HTMLInputElement).readOnly).toBe(true);
    expect((screen.getByLabelText("Job title") as HTMLInputElement).value).toBe("Marketing Specialist");
    expect(document.querySelector("[data-my-roles]")!.textContent).toContain("Marketing Specialist (main)");
  });

  it("saves a changed field on blur, and only that field", async () => {
    mount();
    const phone = screen.getByLabelText("Phone (optional)");
    fireEvent.change(phone, { target: { value: "+1 555 0100" } });
    fireEvent.blur(phone);
    await waitFor(() => expect(calls.length).toBe(1));
    expect(calls[0].url).toBe("/api/me/profile");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ phone: "+1 555 0100" });
    fireEvent.blur(phone); // unchanged now: nothing more is sent
    expect(calls.length).toBe(1);
  });

  it("puts the old value back and says why when the save is refused", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 400, json: async () => ({ error: "Your first name can't be empty." }) }) as Response));
    mount();
    const first = screen.getByLabelText("First name") as HTMLInputElement;
    fireEvent.change(first, { target: { value: "" } });
    fireEvent.blur(first);
    await waitFor(() => expect(document.querySelector("[data-profile-problem]")?.textContent).toContain("can't be empty"));
    expect(first.value).toBe("Omar");
  });

  it("a demo account is told changes are not saved and nothing is sent", async () => {
    mount({ demo: true });
    const phone = screen.getByLabelText("Phone (optional)");
    fireEvent.change(phone, { target: { value: "555" } });
    fireEvent.blur(phone);
    await waitFor(() => expect(document.querySelector("[data-profile-problem]")?.textContent).toContain("demo account"));
    expect(calls.length).toBe(0);
  });

  it("the password form checks the two new passwords match before sending anything", () => {
    mount();
    fireEvent.change(screen.getByLabelText("Current password"), { target: { value: "oldpass1" } });
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "newpass1" } });
    fireEvent.change(screen.getByLabelText("Repeat the new password"), { target: { value: "different" } });
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(document.querySelector("[data-security-message]")?.textContent).toContain("do not match");
    expect(calls.length).toBe(0);
  });
});
