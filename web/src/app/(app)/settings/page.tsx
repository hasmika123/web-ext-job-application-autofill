import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { serverApiFetch } from "@/lib/api";
import BillingCard from "@/components/billing/BillingCard";
import { getPlan } from "@/lib/billing";
import { getAiUsage } from "@/lib/ai-usage";
import AiUsageMeter from "@/components/settings/AiUsageMeter";
import { isDemoLogin } from "@/lib/demo";
import { InitialsAvatar } from "@/components/app-v2/common";
import SettingsV3Page, { type SettingsTabKey } from "@/components/app-v3/settings/SettingsV3Page";
import { DemoNote, ExtensionSettingRow, SettingsCard } from "@/components/app-v3/settings/panels";
import NotificationPrefsProvider from "@/components/app-v3/settings/NotificationPrefsProvider";
import NotificationsPanel from "@/components/app-v3/settings/NotificationsPanel";
import TimeZoneField from "@/components/app-v3/settings/TimeZoneField";
import PrivacyPanel from "@/components/app-v3/settings/PrivacyPanel";
import HelpPanel from "@/components/app-v3/settings/HelpPanel";
import { getNotificationPreferences } from "@/lib/notification-preferences-server";

export const metadata: Metadata = { title: "Settings" };

type Account = {
  login?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
};

/**
 * Settings (app v3, spec 2.13). Account data is read from the Spring API; AI and autofill settings
 * live in the browser extension (chrome.storage, not the backend), so they are surfaced here
 * informationally. Every section of the previous page is kept (account, AI, autofill, inbox,
 * privacy export + delete, billing) and regrouped under the six sub-nav tabs. Session gate and
 * sign-out live in the `(app)` shell; the 401/403 guard covers a mid-session expiry.
 */
export default async function SettingsPage() {
  const res = await serverApiFetch("/api/account");
  if (res.status === 401 || res.status === 403) {
    redirect("/login");
  }
  const account: Account | null = res.ok ? await res.json() : null;
  // A public demo account: nothing here is saved, and the destructive/billing actions are hidden.
  const demo = isDemoLogin(account?.login);
  const [plan, aiUsage, inboxRes, bioRes, notificationPrefs] = await Promise.all([
    getPlan(),
    getAiUsage(),
    serverApiFetch("/api/profile/inbox"),
    serverApiFetch("/api/profile"),
    getNotificationPreferences(),
  ]);
  const inbox = inboxRes.ok
    ? ((await inboxRes.json().catch(() => null)) as { connected?: boolean; address?: string | null; status?: string | null } | null)
    : null;

  // Phone and location come from the shared bio (the Account form is read-only here; Edit goes to My Profiles).
  let bio: Record<string, unknown> = {};
  if (bioRes.ok) {
    const dto = (await bioRes.json().catch(() => null)) as { payload?: string } | null;
    try {
      const parsed = dto?.payload ? JSON.parse(dto.payload) : null;
      if (parsed && typeof parsed === "object") bio = parsed as Record<string, unknown>;
    } catch {
      // corrupt payload: show the account fields only
    }
  }
  const str = (k: string) => (typeof bio[k] === "string" ? (bio[k] as string).trim() : "");
  const fullName = [account?.firstName, account?.lastName].filter(Boolean).join(" ") || [str("firstName"), str("lastName")].filter(Boolean).join(" ");
  const location = [str("city"), str("state") || str("country")].filter(Boolean).join(", ");

  const account_ = (
    <>
      <SettingsCard title="Account">
        {demo && <DemoNote />}
        {account ? (
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <InitialsAvatar name={fullName || account.login || "You"} size={72} tone="blue" />
            <dl className="grid min-w-0 flex-1 grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 text-sm">
              <dt className="text-v2-muted">Username</dt>
              <dd className="truncate font-medium text-v2-navy">{account.login}</dd>
              <dt className="text-v2-muted">Full name</dt>
              <dd className="font-medium text-v2-navy">{fullName || "Not set"}</dd>
              <dt className="text-v2-muted">Email</dt>
              <dd className="truncate font-medium text-v2-navy">{account.email || str("email") || "Not set"}</dd>
              <dt className="text-v2-muted">Phone</dt>
              <dd className="font-medium text-v2-navy">{str("phone") || "Not set"}</dd>
              <dt className="text-v2-muted">Location</dt>
              <dd className="font-medium text-v2-navy">{location || "Not set"}</dd>
              <dt className="text-v2-muted">Time zone</dt>
              <dd className="min-w-0 font-medium text-v2-navy">
                <TimeZoneField />
              </dd>
            </dl>
          </div>
        ) : (
          <p className="text-sm text-v2-muted">Couldn&apos;t load your account details.</p>
        )}
        <Link
          href="/profiles"
          className="mt-4 inline-flex items-center rounded-full border border-v2-line px-4 py-1.5 text-[13px] font-semibold text-v2-navy hover:bg-paper-2"
        >
          Edit
        </Link>
        <p className="mt-3 text-[13px] text-v2-muted">
          Name, contact details, links and work authorization are edited on{" "}
          <Link href="/profiles" className="font-medium text-v2-blue hover:underline">My Profiles</Link>.
        </p>
      </SettingsCard>

      <SettingsCard title="AI & drafting">
        {aiUsage && <AiUsageMeter usage={aiUsage} />}
        <ExtensionSettingRow
          title="Kiwiply AI"
          desc="Draft answers to open-ended application questions (e.g. “Why this role?”), pick options and map fields. Part of Pro, opt-in with explicit consent. Resume parsing is free."
        />
        <ExtensionSettingRow
          title="Bring your own key"
          desc="Use your own AI provider key for unlimited drafting at no cost — takes priority over Kiwiply AI."
          last
        />
        <p className="mt-3 text-[13px] text-v2-muted">
          These run in the Kiwiply browser extension — turn them on in the extension&apos;s
          <span className="font-medium text-ink-soft"> Options → AI</span>.
        </p>
      </SettingsCard>
    </>
  );

  const notifications = (
    <>
      <SettingsCard title="Inbox">
        <p className="text-[13.5px] text-ink-soft">
          {inbox?.connected
            ? `Connected: ${inbox.address}${inbox.status === "NEEDS_RECONNECT" ? " — needs reconnecting" : ""}.`
            : "Connect the Gmail you apply from and your board updates itself when employers reply. Kiwiply only reads."}
        </p>
        <Link href="/settings/inbox" className="mt-3 inline-block text-[13px] font-semibold text-v2-blue hover:underline">
          {inbox?.connected ? "Manage inbox →" : plan.plan === "PRO" ? "Connect an inbox →" : "See how it works →"}
        </Link>
      </SettingsCard>
      <NotificationsPanel />
    </>
  );

  const privacy = <PrivacyPanel demo={demo} />;

  const jobPreferences = (
    <>
      <SettingsCard title="Autofill behavior">
        <ExtensionSettingRow title="Auto-advance" desc="Move to the next field automatically as Kiwiply fills." />
        <ExtensionSettingRow title="EEO / demographics by default" desc="Whether to include voluntary EEO answers when filling." last />
        <p className="mt-3 text-[13px] text-v2-muted">
          Configured per-device in the Kiwiply extension&apos;s
          <span className="font-medium text-ink-soft"> Options</span>. Kiwiply never auto-submits —
          you review every field.
        </p>
      </SettingsCard>
      <SettingsCard title="Job preferences">
        <p className="text-[13.5px] text-ink-soft">
          Work preference, desired salary, notice period and relocation are part of your profile, so autofill and matching use them.
        </p>
        <Link href="/profiles" className="mt-3 inline-block text-[13px] font-semibold text-v2-blue hover:underline">
          Edit preferences on My Profiles →
        </Link>
      </SettingsCard>
    </>
  );

  const billing = <SettingsCard title="Billing">{demo ? <DemoNote /> : <BillingCard plan={plan} />}</SettingsCard>;

  const help = <HelpPanel />;

  const panels: Record<SettingsTabKey, React.ReactNode> = {
    account: account_,
    notifications,
    privacy,
    "job-preferences": jobPreferences,
    billing,
    help,
  };
  return (
    <NotificationPrefsProvider initial={notificationPrefs} demo={demo}>
      <SettingsV3Page panels={panels} />
    </NotificationPrefsProvider>
  );
}
