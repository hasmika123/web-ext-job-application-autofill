// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ChecklistCard from "./ChecklistCard";
import type { DashboardWidget } from "@/lib/ent/dashboard";

afterEach(cleanup);

const item = (key: string, label: string, done: boolean) => ({ key, label, hint: `${label} hint`, done, href: `/w/admin/${key}` });
const widget = (state: DashboardWidget["state"], items: ReturnType<typeof item>[] = []): DashboardWidget => ({
  key: "checklist",
  state,
  reason: state === "empty" ? "COMPLETE" : null,
  module: null,
  data: state === "ok" ? { done: items.filter((i) => i.done).length, total: items.length, items } : null,
});

describe("the activation checklist card", () => {
  it("lists every step with its link, says how many are done and ticks only the done ones", () => {
    const items = [item("branding", "Set your branding", true), item("department", "Add a department", false), item("employees", "Invite your first employees", false)];
    render(<ChecklistCard widget={widget("ok", items)} onDismiss={() => undefined} />);
    expect(screen.getByText("1 of 3 done")).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: "Setup progress" }).getAttribute("aria-valuenow")).toBe("33");
    const links = screen.getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/w/admin/branding", "/w/admin/department", "/w/admin/employees"]);
    expect(document.querySelector('[data-checklist-item="branding"]')?.getAttribute("data-done")).toBe("true");
    expect(document.querySelector('[data-checklist-item="department"]')?.getAttribute("data-done")).toBe("false");
  });

  it("draws nothing once the API says the checklist is complete or dismissed (empty), unavailable or missing", () => {
    for (const w of [widget("empty"), widget("unavailable"), widget("error"), null]) {
      const { container, unmount } = render(<ChecklistCard widget={w} onDismiss={() => undefined} />);
      expect(container.querySelector("[data-dash-card='checklist']")).toBeNull();
      unmount();
    }
  });

  it("the x button asks to dismiss", () => {
    const onDismiss = vi.fn();
    render(<ChecklistCard widget={widget("ok", [item("branding", "Set your branding", false)])} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole("button", { name: /dismiss the checklist/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
