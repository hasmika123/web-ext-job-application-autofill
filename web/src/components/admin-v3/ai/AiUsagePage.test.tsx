import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@kiwiply/ui";

vi.mock("next/link", () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));
vi.mock("next/image", () => ({ default: (p: { alt: string }) => <span role="img" aria-label={p.alt} /> }));

import AiUsagePage from "./AiUsagePage";

afterEach(cleanup);

describe("AiUsagePage (I1.13)", () => {
  it("'Edit limits' is now a link to Providers & routing, not a coming-soon button", () => {
    render(
      <ToastProvider>
        <AiUsagePage
          data={{ period: "2026-10", proBudgetMicros: 3_000_000, freeParsesPerMonth: 3, totalCostMicros: 0, totalCalls: 0, userCount: 0, users: [], tasks: [] }}
        />
      </ToastProvider>,
    );
    const link = screen.getByRole("link", { name: /Providers & routing/ });
    expect(link.getAttribute("href")).toBe("/admin/ai/providers");
    expect(screen.queryByText(/Edit limits/)).toBeNull();
  });
});
