/** Status filter tabs (kept out of the "use client" page component so server pages can import them). */
export const BUG_STATUS_TABS: { key: string; label: string }[] = [
  { key: "", label: "All" },
  { key: "NEW", label: "New" },
  { key: "TRIAGED", label: "Triaged" },
  { key: "IN_PROGRESS", label: "In progress" },
  { key: "RESOLVED", label: "Resolved" },
  { key: "WONTFIX", label: "Won't fix" },
];
