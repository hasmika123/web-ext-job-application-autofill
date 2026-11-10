import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProfileItem } from "@/lib/profile-items";
import SkillsChips, { SKILLS_SAVE_DELAY_MS } from "./SkillsChips";
import type { ProfileItemsApi } from "./useProfileItems";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const skillItem = (id: number, group: string, skills: string[]): ProfileItem => ({
  id,
  section: "SKILL",
  position: id,
  data: { group, skills },
  provenance: "PARSED",
  sourceResumeId: null,
  hidden: false,
  updatedAt: null,
});

function fakeApi(items: ProfileItem[]) {
  const api = {
    items,
    count: items.length,
    bySection: (s: string) => items.filter((i) => i.section === s),
    add: vi.fn(async (_s: string, data: Record<string, unknown>) => ({ ...skillItem(99, String(data.group), data.skills as string[]) })),
    save: vi.fn(async (id: number, data: Record<string, unknown>) => skillItem(id, String(data.group), data.skills as string[])),
    toggleHidden: vi.fn(),
    remove: vi.fn(),
  };
  return api as unknown as ProfileItemsApi & typeof api;
}

const type = async (label: string, text: string) => {
  const box = screen.getByLabelText(label);
  fireEvent.change(box, { target: { value: text } });
  fireEvent.keyDown(box, { key: "Enter" });
};

describe("SkillsChips", () => {
  it("shows each stored group with its chips and where it came from", () => {
    const api = fakeApi([skillItem(1, "Languages", ["Go", "Rust"]), skillItem(2, "Tools", ["Docker"])]);
    render(<SkillsChips api={api} atCap={false} loadFailed={false} />);
    expect((screen.getAllByLabelText("Group name")[0] as HTMLInputElement).value).toBe("Languages");
    expect(screen.getByLabelText("Remove Go")).toBeTruthy();
    expect(screen.getByLabelText("Remove Docker")).toBeTruthy();
    expect(screen.getAllByText("From your resume").length).toBeGreaterThan(0);
  });

  it("adding a chip saves the group once, after the quiet delay", async () => {
    const api = fakeApi([skillItem(1, "Languages", ["Go"])]);
    render(<SkillsChips api={api} atCap={false} loadFailed={false} />);
    await type("Skills in Languages", "Rust");
    await type("Skills in Languages", "Zig");
    expect(api.save).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SKILLS_SAVE_DELAY_MS + 10);
    });
    expect(api.save).toHaveBeenCalledTimes(1);
    expect(api.save).toHaveBeenCalledWith(1, { group: "Languages", skills: ["Go", "Rust", "Zig"] });
    expect(screen.getByText("All changes saved")).toBeTruthy();
  });

  it("removing a chip saves the shorter list", async () => {
    const api = fakeApi([skillItem(1, "Languages", ["Go", "Rust"])]);
    render(<SkillsChips api={api} atCap={false} loadFailed={false} />);
    fireEvent.click(screen.getByLabelText("Remove Go"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SKILLS_SAVE_DELAY_MS + 10);
    });
    expect(api.save).toHaveBeenCalledWith(1, { group: "Languages", skills: ["Rust"] });
  });

  it("a new group is created on its first chip, with the default name when unnamed", async () => {
    const api = fakeApi([]);
    render(<SkillsChips api={api} atCap={false} loadFailed={false} />);
    fireEvent.click(screen.getByRole("button", { name: /Add group/ }));
    await type("Skills in Skills", "TypeScript");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SKILLS_SAVE_DELAY_MS + 10);
    });
    expect(api.add).toHaveBeenCalledWith("SKILL", { group: "Skills", skills: ["TypeScript"] });
  });

  it("does not create an empty group", async () => {
    const api = fakeApi([]);
    render(<SkillsChips api={api} atCap={false} loadFailed={false} />);
    fireEvent.click(screen.getByRole("button", { name: /Add group/ }));
    fireEvent.change(screen.getByLabelText("Group name"), { target: { value: "Cloud" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SKILLS_SAVE_DELAY_MS + 10);
    });
    expect(api.add).not.toHaveBeenCalled();
  });

  it("refuses a never-collected value as a chip", async () => {
    const api = fakeApi([skillItem(1, "Languages", ["Go"])]);
    render(<SkillsChips api={api} atCap={false} loadFailed={false} />);
    await type("Skills in Languages", "123-45-6789");
    expect(screen.getByRole("alert").textContent).toMatch(/We never store a Social Security/);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SKILLS_SAVE_DELAY_MS + 10);
    });
    expect(api.save).not.toHaveBeenCalled();
  });

  it("deleting a group goes through the undoable remove", () => {
    const api = fakeApi([skillItem(1, "Languages", ["Go"])]);
    render(<SkillsChips api={api} atCap={false} loadFailed={false} />);
    fireEvent.click(screen.getByLabelText("Delete group Languages"));
    expect(api.remove).toHaveBeenCalledWith(1);
  });

  it("Add group is off at the item cap", () => {
    render(<SkillsChips api={fakeApi([])} atCap loadFailed={false} />);
    expect((screen.getByRole("button", { name: /Add group/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});
