/** Status filter tabs (kept out of the "use client" page component so server pages can import them). */
export const SUBSCRIBER_STATUS_TABS: { key: string; label: string }[] = [
  { key: "", label: "All" },
  { key: "CONFIRMED", label: "Confirmed" },
  { key: "PENDING", label: "Pending" },
  { key: "UNSUBSCRIBED", label: "Unsubscribed" },
];
