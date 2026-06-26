import { redirect } from "next/navigation";
import Link from "next/link";
import { serverApiFetch } from "@/lib/api";
import DeleteAccountButton from "@/components/DeleteAccountButton";
import SettingsNav from "@/components/settings/SettingsNav";

type Account = {
  login?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
};

const NAV = [
  { id: "account", label: "Account" },
  { id: "ai", label: "AI & drafting" },
  { id: "autofill", label: "Autofill behavior" },
  { id: "privacy", label: "Privacy & data" },
  { id: "billing", label: "Billing" },
];

/**
 * Settings with a section sub-nav. Account data is read from the Spring API; AI &
 * autofill settings live in the browser extension (chrome.storage, not the backend) so
 * they're surfaced here informationally — making them editable on web would need a
 * backend user-prefs store (out of scope for this presentation-only redesign). Session
 * gate + sign-out live in the `(app)` shell; the 401/403 guard covers a mid-session expiry.
 */
export default async function SettingsPage() {
  const res = await serverApiFetch("/api/account");
  if (res.status === 401 || res.status === 403) {
    redirect("/login");
  }
  const account: Account | null = res.ok ? await res.json() : null;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-ink">Settings</h1>
        <p className="mt-1 text-sm text-muted">Manage your Kiwiply account and preferences.</p>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[190px_1fr]">
        <SettingsNav items={NAV} />

        <div className="flex flex-col gap-6">
          {/* Account */}
          <Card id="account" title="Account">
            {account ? (
              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
                <dt className="text-muted">Username</dt>
                <dd className="font-medium text-ink">{account.login}</dd>
                {account.email && (
                  <>
                    <dt className="text-muted">Email</dt>
                    <dd className="font-medium text-ink">{account.email}</dd>
                  </>
                )}
                {(account.firstName || account.lastName) && (
                  <>
                    <dt className="text-muted">Name</dt>
                    <dd className="font-medium text-ink">{[account.firstName, account.lastName].filter(Boolean).join(" ")}</dd>
                  </>
                )}
              </dl>
            ) : (
              <p className="text-sm text-muted">Couldn&apos;t load your account details.</p>
            )}
            <p className="mt-4 text-[13px] text-muted">
              Edit your name, contact details, links and work authorization on your{" "}
              <Link href="/profile" className="font-medium text-accent-deep hover:underline">profile</Link>.
            </p>
          </Card>

          {/* AI & drafting */}
          <Card id="ai" title="AI & drafting">
            <SettingRow
              title="Kiwiply AI"
              desc="Draft answers to open-ended application questions (e.g. “Why this role?”). Opt-in with explicit consent; free-tier quota."
            />
            <SettingRow
              title="Bring your own key"
              desc="Use your own AI provider key for unlimited drafting at no cost — takes priority over Kiwiply AI."
              last
            />
            <p className="mt-3 text-[13px] text-muted">
              These run in the Kiwiply browser extension — turn them on in the extension&apos;s
              <span className="font-medium text-ink-soft"> Options → AI</span>.
            </p>
          </Card>

          {/* Autofill behavior */}
          <Card id="autofill" title="Autofill behavior">
            <SettingRow title="Auto-advance" desc="Move to the next field automatically as Kiwiply fills." />
            <SettingRow title="EEO / demographics by default" desc="Whether to include voluntary EEO answers when filling." last />
            <p className="mt-3 text-[13px] text-muted">
              Configured per-device in the Kiwiply extension&apos;s
              <span className="font-medium text-ink-soft"> Options</span>. Kiwiply never auto-submits —
              you review every field.
            </p>
          </Card>

          {/* Privacy & data */}
          <Card id="privacy" title="Privacy & data">
            <p className="text-sm text-ink-soft">
              Your data is yours. Read what we collect and how it&apos;s handled in the{" "}
              <Link href="/privacy" className="font-medium text-accent-deep hover:underline">Privacy Policy</Link>.
              To request a copy of your data, email{" "}
              <a href="mailto:support@kiwiply.com" className="font-medium text-accent-deep hover:underline">support@kiwiply.com</a>.
            </p>
            <div className="mt-5">
              <DeleteAccountButton />
            </div>
          </Card>

          {/* Billing */}
          <Card id="billing" title="Billing">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-bold text-accent-deep">Free plan</span>
                <span className="text-sm text-muted">Unlimited autofill, resume parsing & tracker. Pro is coming soon.</span>
              </div>
              <Link href="/#pricing" className="text-sm font-semibold text-accent-deep hover:underline">See plans →</Link>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Card({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 rounded-[var(--radius-lg)] border border-line bg-paper p-5 shadow-[var(--shadow)]">
      <h2 className="mb-3 font-display text-lg font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}

function SettingRow({ title, desc, last }: { title: string; desc: string; last?: boolean }) {
  return (
    <div className={last ? "py-3" : "border-b border-line py-3"}>
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-ink">{title}</span>
        <span className="rounded-full bg-paper-2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted">In the extension</span>
      </div>
      <p className="mt-1 text-[13px] text-muted">{desc}</p>
    </div>
  );
}
