import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import LockCard, { LockedAction } from "./LockCard";
import LockedServices from "./LockedServices";
import RetirementBanner from "./RetirementBanner";
import SlotChip from "./SlotChip";
import { shortDate } from "@/lib/subscription/copy";
import type { EntitlementSet } from "@/lib/subscription/types";

afterEach(() => cleanup());

const SINCE = "2026-11-15T12:00:00Z";

describe("LockCard (K10.10)", () => {
  it("says what is locked and that the data is here to read and download; no loss language; one way to unlock", () => {
    render(<LockCard serviceName="AI resume tailoring" exportHref="/api/account/export" />);
    const card = within(screen.getByTestId("lock-card"));
    expect(card.getByText("AI resume tailoring is locked. Everything you made is here to read and download. Upgrade to use it again.")).toBeTruthy();
    expect(card.getByRole("link", { name: "Locked — Pick a plan" }).getAttribute("href")).toBe("/settings/plan");
    expect(card.getByRole("link", { name: "Download my data" }).getAttribute("href")).toBe("/api/account/export");
    expect(screen.getByTestId("lock-card").textContent).not.toMatch(/deleted|lost|expired|gone/i);
  });

  it("omits the download link where the app has no export for that service", () => {
    render(<LockCard serviceName="Inbox monitoring" />);
    expect(screen.queryByRole("link", { name: "Download my data" })).toBeNull();
  });

  it("a locked action is a calm link with the reason, reading 'Locked — Pick a plan'", () => {
    render(<LockedAction serviceName="AI resume tailoring">Tailor</LockedAction>);
    const a = screen.getByRole("link", { name: /Tailor: AI resume tailoring is locked/ });
    expect(a.textContent).toBe("Locked — Pick a plan");
    expect(a.getAttribute("title")).toMatch(/read-only/);
  });
});

describe("RetirementBanner", () => {
  it("shows the plan and the date with one link to the options (amber, never a countdown)", () => {
    render(<RetirementBanner retirement={{ planName: "Pro v1", effectiveAt: SINCE, decided: false }} />);
    const b = within(screen.getByTestId("retirement-banner"));
    expect(b.getByText(new RegExp(`Pro v1 is changing on ${shortDate(SINCE)}`))).toBeTruthy();
    expect(b.getByRole("link", { name: "See your options" }).getAttribute("href")).toBe("/settings/plan/changing");
  });

  it("after a choice it offers to review it, and on the last day it says so", () => {
    render(<RetirementBanner retirement={{ planName: "Pro v1", effectiveAt: SINCE, decided: true, lastDay: true }} />);
    expect(screen.getByRole("link", { name: "Review your choice" })).toBeTruthy();
    expect(screen.getByText(/Today is the last day to switch with no gap/)).toBeTruthy();
  });

  it("after a fallback shows the lock banner with the date and the way to unlock", () => {
    render(<RetirementBanner lock={{ since: SINCE, services: 3 }} />);
    const b = within(screen.getByTestId("lock-banner"));
    expect(b.getByText(`Some services are read-only since ${shortDate(SINCE)}. Your data is safe.`)).toBeTruthy();
    expect(b.getByRole("link", { name: "Pick a plan to unlock" })).toBeTruthy();
  });

  it("renders nothing when nothing applies", () => {
    const { container } = render(<RetirementBanner />);
    expect(container.firstChild).toBeNull();
  });
});

describe("LockedServices (what changed)", () => {
  const ENT = (locked: EntitlementSet["locked"]): EntitlementSet => ({ features: [], locked });
  it("lists the locked services with the date and offers unlock and download", () => {
    render(<LockedServices ent={ENT([{ featureKey: "ai.tailoring", name: "AI resume tailoring", lockedSince: SINCE }, { featureKey: "inbox.monitor", name: "Inbox monitoring", lockedSince: SINCE }])} />);
    const c = within(screen.getByTestId("locked-services"));
    expect(c.getByText("AI resume tailoring")).toBeTruthy();
    expect(c.getAllByText(`read-only since ${shortDate(SINCE)}`)).toHaveLength(2);
    expect(c.getByRole("link", { name: "Pick a plan to unlock" }).getAttribute("href")).toBe("/pricing");
    expect(c.getByRole("link", { name: "Download my data" })).toBeTruthy();
  });

  it("renders nothing without locks, on an entitlement error, or while loading", () => {
    for (const ent of [ENT([]), ENT(undefined), "error" as const, null]) {
      const { container, unmount } = render(<LockedServices ent={ent} />);
      expect(container.firstChild).toBeNull();
      unmount();
    }
  });
});

describe("SlotChip", () => {
  it("reads '3 of 3 active slots · 9 read-only' and nothing when none are read-only", () => {
    const { rerender } = render(<SlotChip active={3} cap={3} readOnly={9} />);
    expect(screen.getByTestId("slot-chip").textContent).toBe("3 of 3 active slots · 9 read-only");
    rerender(<SlotChip active={3} cap={3} readOnly={0} />);
    expect(screen.queryByTestId("slot-chip")).toBeNull();
  });
});
