import { hasStateMap, registerStateMap } from "@kiwiply/ui";

/** The pill colours of the billing pages (28 §0's billing tone map, plus SETUP: an organization whose billing is not connected yet). */
export function registerBillingStates(): void {
  if (!hasStateMap("billing-state")) {
    registerStateMap("billing-state", { SETUP: "grey-outline", ACTIVE: "green", PAST_DUE: "red", SUSPENDED: "grey", CANCELLED: "grey" });
  }
  if (!hasStateMap("invoice-state")) {
    registerStateMap("invoice-state", { DRAFT: "grey-outline", OPEN: "amber", PAID: "green", VOID: "grey", UNCOLLECTIBLE: "red", WRITTEN_OFF: "grey", OVERDUE: "red" });
  }
}
