import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import Tabs, { Tab, TabList, TabPanel } from "./Tabs";
import type { TabsVariant } from "./Tabs";

afterEach(cleanup);

function Harness({ variant }: { variant?: TabsVariant }) {
  const [v, setV] = useState("a");
  return (
    <Tabs value={v} onValueChange={setV} variant={variant}>
      <TabList aria-label="Demo">
        <Tab value="a">Alpha</Tab>
        <Tab value="b">Beta</Tab>
      </TabList>
      <TabPanel value="a">Panel A</TabPanel>
      <TabPanel value="b">Panel B</TabPanel>
    </Tabs>
  );
}

describe("Tabs", () => {
  it("is the segmented pill group by default and switches panels", () => {
    render(<Harness />);
    expect(screen.getByRole("tablist").getAttribute("data-variant")).toBe("segmented");
    expect(screen.getByText("Panel A")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Beta" }));
    expect(screen.getByText("Panel B")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Beta" }).getAttribute("aria-selected")).toBe("true");
  });

  it("variant=underline keeps the roles and arrow-key behaviour, with the underline look", () => {
    render(<Harness variant="underline" />);
    const list = screen.getByRole("tablist");
    expect(list.getAttribute("data-variant")).toBe("underline");
    expect(list.className).toContain("border-b");
    const alpha = screen.getByRole("tab", { name: "Alpha" });
    expect(alpha.className).toContain("border-b-[3px]");
    expect(alpha.className).toContain("border-accent-deep");
    alpha.focus();
    fireEvent.keyDown(list, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Beta" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: "Alpha" }).className).toContain("border-transparent");
  });
});
