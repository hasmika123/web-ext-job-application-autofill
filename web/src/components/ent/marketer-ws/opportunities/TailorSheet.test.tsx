// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TailorSheet from "./TailorSheet";

const proposal = {
  proposalId: 77,
  status: "OK",
  source: { orgResumeId: 31, name: "Anika - Java" },
  jobTitle: "ML Platform Engineer",
  scoreBefore: 50,
  keywords: [{ term: "Java", coveredBefore: true }, { term: "Kubernetes", coveredBefore: false }, { term: "Kafka", coveredBefore: false }, { term: "AWS", coveredBefore: true }],
  changes: [{ ref: "e0b0", section: "Senior Engineer · Acme", before: "Built APIs", after: "Built APIs on Kubernetes", adds: ["Kubernetes"] }],
  additions: ["Kafka"],
};

let calls: { url: string; body: unknown }[];
let answer: unknown;
beforeEach(() => {
  calls = [];
  answer = proposal;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
      if (url.endsWith("/save")) return new Response(JSON.stringify({ orgResumeId: 40, resumeId: 900, name: "Anika - ML", scoreBefore: 50, scoreAfter: 75, skipped: [], notAdded: [], detail: { item: { id: 5 } } }), { status: 200 });
      return new Response(JSON.stringify(answer), { status: 200 });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const settle = () => act(async () => {});
const mount = (onSaved = vi.fn()) => {
  render(<TailorSheet orgId={2} id={5} consultant="Anika Rao" jobTitle="ML Platform Engineer" orgResumeId={null} onClose={() => {}} onSaved={onSaved} />);
  return onSaved;
};

/** MKT-TAILOR-BUILD.md: the real tailoring sheet (no preset, no timer). */
describe("TailorSheet", () => {
  it("shows the AI's changes with the keyword score, which moves as changes are kept or skipped", async () => {
    mount();
    await settle();
    expect(screen.getByText("Built APIs on Kubernetes")).toBeTruthy();
    expect(document.querySelector("[data-tailor-score=before]")?.textContent).toBe("50%");
    expect(document.querySelector("[data-tailor-score=after]")?.textContent).toBe("75%"); // the rewrite is kept by default
    fireEvent.click(screen.getByLabelText("Keep the change to Senior Engineer · Acme"));
    expect(document.querySelector("[data-tailor-score=after]")?.textContent).toBe("50%");
    fireEvent.click(screen.getByLabelText("Anika has used Kafka"));
    expect(document.querySelector("[data-tailor-score=after]")?.textContent).toBe("75%");
  });

  it("saves what is kept and ticked as a new resume", async () => {
    const onSaved = mount();
    await settle();
    fireEvent.click(screen.getByLabelText("Anika has used Kafka"));
    fireEvent.click(screen.getByRole("button", { name: "Save as new resume for this job" }));
    await settle();
    const apply = calls.find((c) => c.url.endsWith("/save"));
    expect(apply?.url).toBe("/api/orgs/2/mkt/opportunities/5/tailor/77/save");
    expect(apply?.body).toMatchObject({ keep: ["e0b0"], additions: ["Kafka"], label: "Anika - Java - ML Platform Engineer" });
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ orgResumeId: 40, name: "Anika - ML" }));
  });

  it("says why there is nothing to keep, and offers no save", async () => {
    answer = { ...proposal, status: "QUOTA_EXCEEDED", proposalId: null, changes: [], additions: [], keywords: [] };
    mount();
    await settle();
    expect(screen.getByText(/AI budget for this month is used up/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save as new resume for this job" })).toBeNull();
  });
});
