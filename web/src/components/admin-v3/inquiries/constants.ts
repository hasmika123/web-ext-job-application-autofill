/** Status filter tabs (kept out of the "use client" page component so server pages can import them). */
export const INQUIRY_STATUS_TABS: { key: string; label: string }[] = [
  { key: "", label: "All" },
  { key: "NEW", label: "New" },
  { key: "CONTACTED", label: "Contacted" },
  { key: "WON", label: "Won" },
  { key: "LOST", label: "Lost" },
];
