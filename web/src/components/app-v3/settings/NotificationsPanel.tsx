"use client";

import { useRouter } from "next/navigation";
import { ErrorState, Field, Input, LockIcon, SaveStatusChip, SavedTick, Switch } from "@kiwiply/ui";
import type { PrefKind } from "@/lib/notification-preferences";
import { useNotificationPrefs, type NotificationPrefsApi } from "./NotificationPrefsProvider";
import TimeZoneField from "./TimeZoneField";
import { DemoNote, SettingsCard } from "./panels";

/**
 * Settings > Notifications (E2E-U7.0): per kind, whether it shows in-app and whether it emails you; then quiet hours
 * and the time zone they are read in. Every switch saves by itself (no Save button): a ✓ appears beside what changed,
 * the chip in the corner says where the save is, and switching something off offers Undo. Billing and security stay on
 * and say why. The kinds, their words, the defaults and the quiet-hours window all come from the API.
 */
export default function NotificationsPanel() {
  const router = useRouter();
  const prefs = useNotificationPrefs();

  if (!prefs) {
    return (
      <SettingsCard title="Notifications">
        <ErrorState what="your notification settings" variant="inline" onRetry={() => router.refresh()} />
      </SettingsCard>
    );
  }

  return (
    <SettingsCard
      title="Notifications"
      action={
        <SaveStatusChip status={prefs.status} savedAt={prefs.savedAt} now={prefs.now} error={prefs.error} onRetry={prefs.retry} />
      }
    >
      {prefs.readOnly && <DemoNote />}
      <p className="text-[13.5px] text-ink-soft">Pick what pings you and where. Everything saves as you go.</p>
      {!prefs.view.emailEnabled && (
        <p className="mt-3 rounded-[var(--radius)] border border-v2-line bg-paper-2 px-3 py-2 text-[13px] text-ink-soft">
          Emails are paused for everyone right now. You will still see notices here in the app.
        </p>
      )}
      <ul className="mt-2 divide-y divide-v2-line/60">
        {prefs.view.kinds.map((k) => (
          <KindRow key={k.kind} kind={k} prefs={prefs} />
        ))}
      </ul>
      <QuietHours prefs={prefs} />
    </SettingsCard>
  );
}

function KindRow({ kind, prefs }: { kind: PrefKind; prefs: NotificationPrefsApi }) {
  const entry = prefs.form.matrix[kind.kind];
  if (!entry) return null;
  const locked = kind.locked;
  const off = prefs.readOnly;
  const emailBlocked = !prefs.view.emailEnabled;
  return (
    <li className="py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-semibold text-v2-navy">{kind.title}</span>
            {locked && (
              <span className="inline-flex items-center gap-1 rounded-full bg-paper-2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-v2-muted">
                <LockIcon aria-hidden className="h-3 w-3" />
                Always on
              </span>
            )}
            <SavedTick flash={prefs.flash} id={kind.kind} />
          </div>
          <p className="mt-1 text-[13px] text-v2-muted">
            {kind.description}
            {locked && kind.lockedWhy ? ` ${kind.lockedWhy}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2 sm:w-44 sm:flex-none sm:flex-col sm:gap-y-2">
          <Switch
            label="In-app"
            className="min-w-[8rem] sm:min-w-0"
            checked={entry.inapp}
            disabled={locked || off}
            onCheckedChange={(on) => prefs.setSwitch(kind.kind, "inapp", on)}
          />
          <Switch
            label="Email"
            className="min-w-[8rem] sm:min-w-0"
            checked={entry.email === "now"}
            disabled={locked || off || emailBlocked}
            onCheckedChange={(on) => prefs.setSwitch(kind.kind, "email", on)}
          />
        </div>
      </div>
    </li>
  );
}

function QuietHours({ prefs }: { prefs: NotificationPrefsApi }) {
  const f = prefs.form;
  return (
    <div className="border-t border-v2-line/60 pt-4">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <Switch
            label="Quiet hours"
            description="Hold back emails while you're asleep. Notices still show up here."
            checked={f.quietOn}
            disabled={prefs.readOnly}
            onCheckedChange={(on) => prefs.setQuiet({ on })}
          />
        </div>
        <SavedTick flash={prefs.flash} id="quiet" className="mt-1" />
      </div>
      {f.quietOn && (
        <div className="mt-3 flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
            <Field label="From">
              <Input type="time" value={f.quietStart} disabled={prefs.readOnly} onChange={(e) => prefs.setQuiet({ start: e.target.value })} />
            </Field>
            <Field label="Until">
              <Input type="time" value={f.quietEnd} disabled={prefs.readOnly} onChange={(e) => prefs.setQuiet({ end: e.target.value })} />
            </Field>
          </div>
          <Field label="Your time zone" hint="Quiet hours follow this clock.">
            <TimeZoneField showStatus={false} />
          </Field>
          <p className="text-xs text-v2-muted">Billing and security emails always get through.</p>
        </div>
      )}
    </div>
  );
}
