import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DATA_MAP, NEVER_COLLECTED } from "@/lib/data-map";

vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import PrivacyPanel from "./PrivacyPanel";
import HelpPanel, { KEYBOARD_SHORTCUTS, OPEN_BUG_REPORT_EVENT } from "./HelpPanel";

afterEach(cleanup);

describe("PrivacyPanel (E2E-U14.0)", () => {
  it("renders every entry of the data map with what, why, who sees it and how long", () => {
    render(<PrivacyPanel demo={false} />);
    for (const d of DATA_MAP) {
      const item = document.querySelector(`[data-data-map="${d.id}"]`) as HTMLElement;
      expect(item, d.id).not.toBeNull();
      expect(within(item).getByRole("heading", { name: d.label })).toBeTruthy();
      expect(within(item).getByText(d.purpose)).toBeTruthy();
      expect(within(item).getByText(d.whoSees)).toBeTruthy();
      expect(within(item).getByText(d.retention)).toBeTruthy();
    }
  });

  it("every map entry says all four things, and names its tables", () => {
    expect(DATA_MAP.length).toBeGreaterThan(8);
    expect(new Set(DATA_MAP.map((d) => d.id)).size).toBe(DATA_MAP.length);
    for (const d of DATA_MAP) {
      for (const text of [d.label, d.purpose, d.whoSees, d.retention]) expect(text.trim().length, d.id).toBeGreaterThan(3);
      expect(d.tables.length, d.id).toBeGreaterThan(0);
    }
  });

  it("states what is never collected", () => {
    render(<PrivacyPanel demo={false} />);
    expect(screen.getByRole("heading", { name: "What we never collect" })).toBeTruthy();
    for (const n of NEVER_COLLECTED) expect(screen.getByText(n)).toBeTruthy();
  });

  it("offers the export and the delete, and the policy", () => {
    render(<PrivacyPanel demo={false} />);
    expect(screen.getByRole("link", { name: /Download my data/ }).getAttribute("href")).toBe("/api/account/export");
    expect(screen.getByRole("button", { name: "Delete account" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Privacy Policy" }).getAttribute("href")).toBe("/privacy");
  });

  it("a demo account gets the note instead of the export and delete", () => {
    render(<PrivacyPanel demo />);
    expect(screen.getByText(/Demo account/)).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Download my data/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete account" })).toBeNull();
  });
});

describe("HelpPanel (E2E-U14.0)", () => {
  it("Report a problem opens the one bug-report dialog", () => {
    const opened = vi.fn();
    window.addEventListener(OPEN_BUG_REPORT_EVENT, opened);
    render(<HelpPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Report a problem" }));
    expect(opened).toHaveBeenCalledTimes(1);
    window.removeEventListener(OPEN_BUG_REPORT_EVENT, opened);
  });

  it("has a way to write to us and lists the shortcuts that exist", () => {
    render(<HelpPanel />);
    expect(screen.getByRole("link", { name: /Email us/ }).getAttribute("href")).toMatch(/^mailto:/);
    expect(screen.getByRole("heading", { name: "Keyboard shortcuts" })).toBeTruthy();
    for (const g of KEYBOARD_SHORTCUTS) for (const s of g.items) expect(screen.getByText(s.keys)).toBeTruthy();
  });
});

describe("no inert rows (E2E-U14.0)", () => {
  const dir = path.resolve(__dirname);
  const files = [
    path.resolve(dir, "../../../app/(app)/settings/page.tsx"),
    path.join(dir, "panels.tsx"),
    path.join(dir, "SettingsV3Page.tsx"),
    path.join(dir, "NotificationsPanel.tsx"),
    path.join(dir, "PrivacyPanel.tsx"),
    path.join(dir, "HelpPanel.tsx"),
  ];

  it("the settings page and its panels have no Coming soon badge and no SoonRow", () => {
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/coming soon/i);
      expect(src, f).not.toMatch(/SoonRow/);
    }
  });

  it("the time zone is a real control, not static text", () => {
    const page = readFileSync(files[0], "utf8");
    expect(page).not.toMatch(/Automatic \(from your browser\)/);
    expect(page).toMatch(/<TimeZoneField \/>/);
  });
});
