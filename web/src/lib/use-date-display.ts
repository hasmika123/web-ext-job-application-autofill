import { useSyncExternalStore } from "react";
import { BROWSER_DATE_DISPLAY, SERVER_DATE_DISPLAY, type DateDisplay } from "@/lib/dates";

const noSubscription = () => () => {};

/**
 * `SERVER_DATE_DISPLAY` until the component is live in the browser, then the viewer's own zone
 * and locale. useSyncExternalStore is the one hook that answers differently for the
 * server/hydration pass than for the render after it, which is exactly the distinction wanted.
 *
 * Client Components only — this module is kept apart from `@/lib/dates` so a Server Component
 * importing the formatter never pulls a hook into its graph. See `@/lib/dates` for the why.
 */
export function useDateDisplay(): DateDisplay {
  const live = useSyncExternalStore(noSubscription, () => true, () => false);
  return live ? BROWSER_DATE_DISPLAY : SERVER_DATE_DISPLAY;
}
