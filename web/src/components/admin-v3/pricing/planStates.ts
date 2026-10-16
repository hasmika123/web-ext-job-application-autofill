import { hasStateMap, registerStateMap } from "@kiwiply/ui";

/**
 * The tone of each plan / version status for `StatePill` (domain "plan"): PUBLISHED green, DRAFT blue, SUNSET and RETIRING amber,
 * RETIRED and SUPERSEDED grey. Registered once per module load (hot reload safe).
 */
export const PLAN_DOMAIN = "plan";

if (!hasStateMap(PLAN_DOMAIN)) {
  registerStateMap(PLAN_DOMAIN, {
    PUBLISHED: "green",
    DRAFT: "blue",
    SUNSET: "amber",
    RETIRING: "amber",
    RETIRED: "grey",
    SUPERSEDED: "grey-outline",
  });
}
