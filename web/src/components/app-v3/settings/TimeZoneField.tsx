"use client";

import { useMemo } from "react";
import { SaveStatusChip, SavedTick, Select } from "@kiwiply/ui";
import { timeZoneOptions } from "@/lib/notification-preferences";
import { useNotificationPrefs } from "./NotificationPrefsProvider";

/**
 * The user's time zone (E2E-U14.0): a real select saved to `notification_preference.tz`, the zone quiet hours are read
 * in. Until the user first changes anything it shows the browser's own zone, so it is right without being asked.
 * Shared by the Account panel and the Notifications panel (one record, one autosave).
 */
export default function TimeZoneField({ id, showStatus = true }: { id?: string; /** Show the save chip here when a save is failing (off where the panel already shows it). */ showStatus?: boolean }) {
  const prefs = useNotificationPrefs();
  const current = prefs?.displayTz ?? "";
  const options = useMemo(() => timeZoneOptions(current).map((z) => ({ value: z, label: z.replace(/_/g, " ") })), [current]);

  if (!prefs) return <span className="text-sm text-v2-muted">Couldn&apos;t load your time zone.</span>;

  const failing = showStatus && prefs.status !== "saved" && prefs.status !== "saving";
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <Select
          id={id}
          aria-label="Time zone"
          className="min-w-0 max-w-xs flex-1"
          value={current}
          onChange={prefs.setTz}
          options={options}
          disabled={prefs.readOnly}
        />
        <SavedTick flash={prefs.flash} id="tz" />
      </div>
      {prefs.tzIsDetected && !prefs.readOnly && <p className="text-xs text-v2-muted">Detected from your browser. Change it any time.</p>}
      {failing && (
        <SaveStatusChip status={prefs.status} savedAt={prefs.savedAt} now={prefs.now} error={prefs.error} onRetry={prefs.retry} />
      )}
    </div>
  );
}
