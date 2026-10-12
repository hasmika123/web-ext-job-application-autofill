import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AdminTable from "./AdminTable";
import type { AdminColumn } from "./AdminTable";
import { DESKTOP, PHONE, fakeList, stubViewport } from "./kit-test-utils";

interface Row {
  login: string;
  name: string;
  plan: string;
  seen: string;
}

const ROWS: Row[] = [
  { login: "priya", name: "Priya Nair", plan: "Pro", seen: "today" },
  { login: "sam", name: "Sam Lee", plan: "Free", seen: "3 d ago" },
];

const COLUMNS: AdminColumn<Row>[] = [
  { key: "name", header: "User", primary: true, render: (r) => <span>{r.name}</span> },
  { key: "plan", header: "Plan", sub: true, render: (r) => <span>{r.plan}</span> },
  { key: "seen", header: "Last seen" },
];

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function table(list = fakeList<Row>({ items: ROWS, total: 45 }), extra: Partial<React.ComponentProps<typeof AdminTable<Row>>> = {}) {
  return render(<AdminTable<Row> list={list} columns={COLUMNS} rowKey={(r) => r.login} label="Users" what="users" {...extra} />);
}

describe("AdminTable on a desktop", () => {
  it("shows a skeleton on the first load only", () => {
    stubViewport(DESKTOP);
    const { rerender } = render(<AdminTable<Row> list={fakeList<Row>({ isLoading: true })} columns={COLUMNS} rowKey={(r) => r.login} label="Users" what="users" />);
    expect(screen.getByRole("status", { name: "Loading users" })).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();

    // a refetch keeps the old rows on screen, dimmed and busy
    rerender(<AdminTable<Row> list={fakeList<Row>({ items: ROWS, total: 2, isFetching: true })} columns={COLUMNS} rowKey={(r) => r.login} label="Users" what="users" />);
    expect(screen.queryByRole("status", { name: "Loading users" })).toBeNull();
    expect(within(screen.getByRole("table")).getByText("Priya Nair")).toBeTruthy();
  });

  it("renders rows, the page summary and live pagination (1-based on screen, 0-based in the hook)", () => {
    stubViewport(DESKTOP);
    const list = fakeList<Row>({ items: ROWS, total: 45, page: 0, size: 20 });
    table(list);
    const t = screen.getByRole("table");
    expect(within(t).getAllByRole("row")).toHaveLength(3); // header + 2
    expect(within(t).getByText("Free")).toBeTruthy();
    expect(screen.getByText("Showing 1–2 of 45")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Page 3" }));
    expect(list.spies.setPage).toHaveBeenCalledWith(2);
  });

  it("an empty list says what is missing", () => {
    stubViewport(DESKTOP);
    table(fakeList<Row>({ items: [], total: 0 }));
    expect(screen.getByText("No users yet")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("a filtered empty list says so and offers Clear filters", () => {
    stubViewport(DESKTOP);
    const list = fakeList<Row>({ items: [], total: 0, q: "zzz", filters: { plan: "PRO" } });
    table(list);
    expect(screen.getByText("No users match")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(list.spies.setQuery).toHaveBeenCalledWith("");
    expect(list.spies.setFilter).toHaveBeenCalledWith("plan", "");
  });

  it("a custom empty state replaces the default one", () => {
    stubViewport(DESKTOP);
    table(fakeList<Row>({ items: [], total: 0 }), { empty: { title: "Nobody needs you right now", description: "New sign-ups land here." } });
    expect(screen.getByText("Nobody needs you right now")).toBeTruthy();
    expect(screen.getByText("New sign-ups land here.")).toBeTruthy();
  });

  it("a failure with nothing loaded is an ErrorState with the request id and Retry", () => {
    stubViewport(DESKTOP);
    const list = fakeList<Row>({ noData: true, error: { status: 500, message: "The API did not answer.", requestId: "req-42" } });
    table(list);
    const alert = screen.getByRole("alert");
    expect(within(alert).getByText("Couldn't load users")).toBeTruthy();
    expect(within(alert).getByText("The API did not answer.")).toBeTruthy();
    expect(within(alert).getByText("Request id: req-42")).toBeTruthy();
    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    expect(list.spies.refetch).toHaveBeenCalled();
  });

  it("a failure after rows loaded keeps the rows and says it could not refresh", () => {
    stubViewport(DESKTOP);
    table(fakeList<Row>({ items: ROWS, total: 2, error: { status: 0, message: "You're offline." } }));
    expect(screen.getByText("Couldn't refresh users")).toBeTruthy();
    expect(within(screen.getByRole("table")).getByText("Sam Lee")).toBeTruthy();
  });

  it("row click and row actions work from the table", () => {
    stubViewport(DESKTOP);
    const onRowClick = vi.fn();
    table(undefined, { onRowClick, rowActions: (r) => <button type="button">Act on {r.login}</button> });
    expect(screen.getAllByRole("button", { name: /^Act on/ }).length).toBeGreaterThan(0);
    fireEvent.click(within(screen.getByRole("table")).getByText("Sam Lee"));
    expect(onRowClick).toHaveBeenCalledWith(ROWS[1]);
  });
});

describe("AdminTable on a phone", () => {
  it("collapses to cards: the title and one sub column, no table", () => {
    stubViewport(PHONE);
    table();
    expect(screen.queryByRole("table")).toBeNull();
    const list = within(screen.getByRole("region", { name: "Users" })).getByRole("list");
    const cards = within(list).getAllByRole("listitem");
    expect(cards).toHaveLength(2);
    expect(within(cards[0]).getByText("Priya Nair")).toBeTruthy();
    expect(within(cards[0]).getByText("Pro")).toBeTruthy(); // the sub column
    expect(within(cards[0]).queryByText("today")).toBeNull(); // the rest is in the sheet
    expect(screen.getByText("Showing 1–2 of 45")).toBeTruthy();
  });

  it("tapping a card opens a BottomSheet with every column, the details and the actions", () => {
    stubViewport(PHONE);
    const onRowClick = vi.fn();
    table(undefined, {
      onRowClick,
      sheetTitle: (r) => r.login,
      details: (r) => <p>Details for {r.login}</p>,
      rowActions: (r) => <button type="button">Deactivate {r.login}</button>,
    });
    fireEvent.click(within(within(screen.getByRole("region", { name: "Users" })).getByRole("list")).getAllByRole("button")[0]);
    const sheet = screen.getByRole("dialog", { name: "priya" });
    expect(within(sheet).getByText("Last seen")).toBeTruthy();
    expect(within(sheet).getByText("today")).toBeTruthy();
    expect(within(sheet).getByText("Details for priya")).toBeTruthy();
    expect(within(sheet).getByRole("button", { name: "Deactivate priya" })).toBeTruthy();
    fireEvent.click(within(sheet).getByRole("button", { name: "Open" }));
    expect(onRowClick).toHaveBeenCalledWith(ROWS[0]);
  });

  it("pages with Previous / Next (44 px targets), not page numbers", () => {
    stubViewport(PHONE);
    const list = fakeList<Row>({ items: ROWS, total: 45, page: 1, size: 20 });
    table(list);
    expect(screen.queryByRole("button", { name: "Page 2" })).toBeNull();
    expect(screen.getByText("Page 2 of 3")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(list.spies.setPage).toHaveBeenLastCalledWith(2);
    fireEvent.click(screen.getByRole("button", { name: "Previous page" }));
    expect(list.spies.setPage).toHaveBeenLastCalledWith(0);
  });

  it("Previous is off on the first page and Next on the last", () => {
    stubViewport(PHONE);
    const { unmount } = table(fakeList<Row>({ items: ROWS, total: 45, page: 0, size: 20 }));
    expect((screen.getByRole("button", { name: "Previous page" }) as HTMLButtonElement).disabled).toBe(true);
    unmount();
    table(fakeList<Row>({ items: ROWS, total: 45, page: 2, size: 20 }));
    expect((screen.getByRole("button", { name: "Next page" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows a list skeleton while loading", () => {
    stubViewport(PHONE);
    render(<AdminTable<Row> list={fakeList<Row>({ isLoading: true })} columns={COLUMNS} rowKey={(r) => r.login} label="Users" what="users" />);
    expect(screen.getByRole("status", { name: "Loading users" }).getAttribute("data-skeleton")).toBe("list");
  });
});
