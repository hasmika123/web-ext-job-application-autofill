/**
 * The platform's Autopilot settings (gap D12): "Prepare selected openings", where the extension opens each assigned job in its own tab and fills it,
 * then stops before the final button. The platform value is the MASTER switch and the MAXIMUM of each cap; each organization then opts in itself and
 * may lower the caps. These are registry keys (`EnterpriseSettingKeys` on the API); the web reads and writes them through `/api/admin/settings/{key}`.
 */
export const AUTOPILOT_ENABLED = "enterprise.autopilot.prepare.enabled";
export const AUTOPILOT_DAILY_CAP = "enterprise.autopilot.prepare.daily_cap";
export const AUTOPILOT_MONTHLY_CAP = "enterprise.autopilot.prepare.monthly_cap";
export const AUTOPILOT_MAX_BATCH = "enterprise.autopilot.prepare.max_batch";

export const AUTOPILOT_KEYS = [AUTOPILOT_ENABLED, AUTOPILOT_DAILY_CAP, AUTOPILOT_MONTHLY_CAP, AUTOPILOT_MAX_BATCH] as const;

/** A registry setting as `GET /api/admin/settings/{key}` answers it (the fields this page uses). */
export interface SettingItem {
  key: string;
  value: unknown;
  source?: string;
  updatedBy?: string | null;
  updatedAt?: string | null;
  lastReason?: string | null;
}

/** The reason Spring asks of a HIGH-risk change. */
export const REASON_MIN = 10;

export const asBool = (v: unknown): boolean => v === true || v === "true";
export const asCount = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
