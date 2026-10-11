/**
 * SAMPLE: illustrative numbers for the Customers board (board 20). Anything the customers API
 * returns (list, status counts) is used instead; these only fill tiles the API has no data for.
 */
export const CUSTOMER_TILE_EXTRAS = {
  active: { delta: { value: "18%", dir: "up" as const }, spark: [3, 4, 4, 5, 6, 5, 7, 8, 7, 9] },
  pastDue: { delta: { value: "28%", dir: "down" as const, good: true }, spark: [6, 7, 6, 5, 6, 5, 4, 5, 4, 3] },
  cancelling: { delta: { value: "12%", dir: "down" as const, good: true }, spark: [5, 4, 5, 4, 4, 3, 4, 3, 3, 2] },
  /** SAMPLE: MRR has no endpoint here (the Analytics billing block carries it). */
  mrr: { value: "$41,280", delta: { value: "14%", dir: "up" as const }, spark: [3, 4, 5, 5, 6, 7, 7, 8, 9, 10] },
};
