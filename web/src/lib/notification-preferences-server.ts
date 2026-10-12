import { serverApiFetch } from "@/lib/api";
import type { NotificationPrefsView } from "@/lib/notification-preferences";

/** The signed-in user's notification preferences, or null when the API cannot say (the panel then shows an error state, never made-up values). */
export async function getNotificationPreferences(): Promise<NotificationPrefsView | null> {
  try {
    const res = await serverApiFetch("/api/profile/notification-preferences");
    if (!res.ok) return null;
    const v = (await res.json().catch(() => null)) as Partial<NotificationPrefsView> | null;
    if (!v || typeof v.matrix !== "object" || !v.matrix || !Array.isArray(v.kinds) || typeof v.tz !== "string" || !v.quietDefaults) return null;
    return {
      matrix: v.matrix,
      quietStart: v.quietStart ?? null,
      quietEnd: v.quietEnd ?? null,
      tz: v.tz,
      stored: !!v.stored,
      emailEnabled: v.emailEnabled !== false,
      quietDefaults: v.quietDefaults,
      kinds: v.kinds,
      updatedAt: v.updatedAt ?? null,
    };
  } catch {
    return null;
  }
}
