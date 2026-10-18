// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import UpgradeSheet from "./UpgradeSheet";
import { upgradeFrom, upgradeLine } from "@/lib/subscription/upgrade";

vi.mock("next/link", () => ({ default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => <a href={href} {...r}>{children}</a> }));

const BODY = { code: "PLAN_REQUIRED", upgrade: { planKey: "PRO", planName: "Pro", interval: "MONTH", amountMinor: 1999, currency: "USD", path: "/pricing?plan=PRO" } };

describe("upgrade hint", () => {
  it("is read off a 402 body and ignored when malformed", () => {
    expect(upgradeFrom(BODY)?.path).toBe("/pricing?plan=PRO");
    expect(upgradeFrom({ upgrade: { planKey: "PRO", amountMinor: 1, path: "https://evil.example" } })).toBeNull();
    expect(upgradeFrom(null)).toBeNull();
  });
  it("words the lock", () => {
    expect(upgradeLine(upgradeFrom(BODY)!, "AI tailoring")).toBe("AI tailoring is part of Pro - $19.99/mo");
  });
});

describe("UpgradeSheet", () => {
  it("links straight to the server-chosen plan", () => {
    render(<UpgradeSheet upgrade={upgradeFrom(BODY)} open onClose={() => {}} />);
    expect(screen.getByText("Part of Pro - $19.99/mo")).toBeTruthy();
    expect(screen.getByRole("link", { name: "See Pro" }).getAttribute("href")).toBe("/pricing?plan=PRO");
  });
  it("renders nothing without a hint", () => {
    const { container } = render(<UpgradeSheet upgrade={null} open onClose={() => {}} />);
    expect(container.innerHTML).toBe("");
  });
});
