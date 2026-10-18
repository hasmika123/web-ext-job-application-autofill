import type { ReactNode } from "react";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { ToastProvider } from "@kiwiply/ui";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProfileItem } from "@/lib/profile-items";
import { UNDO_WINDOW_MS, useProfileItems } from "./useProfileItems";

const item = (id: number, hidden = false): ProfileItem => ({
  id,
  section: "EXPERIENCE",
  position: id,
  data: { title: `Role ${id}`, org: "Acme" },
  provenance: "PARSED",
  sourceResumeId: null,
  hidden,
  updatedAt: null,
});

const wrapper = ({ children }: { children: ReactNode }) => <ToastProvider>{children}</ToastProvider>;

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.useFakeTimers();
  fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
    init?.method === "DELETE" ? new Response(null, { status: 204 }) : new Response(JSON.stringify({ ...item(1), hidden: true }), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const deletes = () => fetchMock.mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === "DELETE");

describe("useProfileItems", () => {
  it("delete hides the entry at once and only reaches the API after the undo window", async () => {
    const changed = vi.fn();
    const { result } = renderHook(() => useProfileItems([item(1), item(2)], changed), { wrapper });
    act(() => result.current.remove(1));
    expect(result.current.bySection("EXPERIENCE").map((i) => i.id)).toEqual([2]);
    expect(deletes()).toHaveLength(0);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS + 10);
    });
    expect(deletes()).toHaveLength(1);
    expect(fetchMock.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === "DELETE")![0]).toBe("/api/profile/items/1");
    expect(result.current.bySection("EXPERIENCE").map((i) => i.id)).toEqual([2]);
    expect(changed).toHaveBeenCalled();
  });

  it("Undo in the toast brings the entry back and nothing is sent", async () => {
    function Harness() {
      const api = useProfileItems([item(1)], () => undefined);
      return (
        <>
          <button onClick={() => api.remove(1)}>del</button>
          <output data-testid="n">{api.bySection("EXPERIENCE").length}</output>
        </>
      );
    }
    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText("del"));
    expect(screen.getByTestId("n").textContent).toBe("0");
    fireEvent.click(screen.getByText("Undo"));
    expect(screen.getByTestId("n").textContent).toBe("1");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS + 10);
    });
    expect(deletes()).toHaveLength(0);
  });

  it("a delete still waiting when the page unmounts is sent then", () => {
    const { result, unmount } = renderHook(() => useProfileItems([item(1)], () => undefined), { wrapper });
    act(() => result.current.remove(1));
    unmount();
    expect(deletes()).toHaveLength(1);
  });

  it("Hide flips the flag at once and PUTs it; a failure rolls it back", async () => {
    const { result } = renderHook(() => useProfileItems([item(1)], () => undefined), { wrapper });
    await act(async () => {
      await result.current.toggleHidden(1);
    });
    const put = fetchMock.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === "PUT")!;
    expect(put[0]).toBe("/api/profile/items/1");
    expect(JSON.parse((put[1] as RequestInit).body as string)).toEqual({ hidden: true });
    expect(result.current.items[0].hidden).toBe(true);

    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ error: "no" }), { status: 500 }));
    await act(async () => {
      await result.current.toggleHidden(1);
    });
    expect(result.current.items[0].hidden).toBe(true); // rolled back to the last good value
  });
});
