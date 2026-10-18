/**
 * SAMPLE: illustrative numbers for the Audit Log board (design/admin-v3 board 10). The real audit
 * rows, total and paging come from `/api/admin/audit`; event distribution, risk breakdown, flagged
 * events and sensitive-action counts are DERIVED from the loaded page. Only the tiles beyond "total"
 * and the compliance strip below are sample, and carry a "Sample data" tag.
 */
export const AUDIT_TILES = {
  total: { delta: { value: "18%", dir: "up" as const }, spark: [3, 4, 3, 5, 4, 6, 7, 6, 8, 9] },
  highRisk: { value: "142", delta: { value: "6%", dir: "up" as const, good: false }, spark: [4, 5, 4, 6, 5, 7, 6, 8, 7, 9] },
  exports: { value: "68", delta: { value: "24%", dir: "up" as const }, spark: [2, 3, 3, 5, 4, 6, 5, 8, 7, 9] },
  reviews: { value: "24", delta: { value: "33%", dir: "up" as const }, spark: [5, 4, 6, 5, 7, 6, 8, 7, 9, 10] },
};

/** SAMPLE: compliance activity (last 30 days). */
export const COMPLIANCE = [
  { label: "Access reviews", value: 24 },
  { label: "Data export requests", value: 12 },
  { label: "Data deletion requests", value: 6 },
  { label: "Policy violations", value: 0 },
];
