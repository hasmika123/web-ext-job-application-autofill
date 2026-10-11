"use client";

import { useState } from "react";
import { UnderlineTabs } from "@/components/app-v2/common";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "requirements", label: "Requirements" },
  { id: "responsibilities", label: "Responsibilities" },
  { id: "benefits", label: "Benefits" },
  { id: "company", label: "Company" },
  { id: "insights", label: "Insights" },
];

/** Section tabs of the job detail page: each one scrolls to its section (ids are on the cards). */
export default function DetailTabs() {
  const [active, setActive] = useState("overview");
  return (
    <UnderlineTabs
      tabs={TABS}
      value={active}
      ariaLabel="Job sections"
      className="rounded-2xl border border-v2-line/70 bg-paper px-5 shadow-v2-soft"
      onChange={(id) => {
        setActive(id);
        document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }}
    />
  );
}
