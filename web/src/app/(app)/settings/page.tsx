import { redirect } from "next/navigation";
import Link from "next/link";
import { serverApiFetch } from "@/lib/api";
import DeleteAccountButton from "@/components/DeleteAccountButton";

type Account = {
  login?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
};

/**
 * Account / settings page. Fetches the current account from the Spring API with the
 * bearer token. Session gate + sign-out + nav live in the `(app)` shell; the 401/403
 * guard here covers an expired token mid-session. Full settings sub-nav lands in R4.4.
 */
export default async function SettingsPage() {
  const res = await serverApiFetch("/api/account");
  if (res.status === 401 || res.status === 403) {
    // Token missing/expired — send them to sign in again.
    redirect("/login");
  }
  const account: Account | null = res.ok ? await res.json() : null;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-ink">Account</h1>
        <p className="mt-1 text-sm text-muted">Manage your Kiwiply account.</p>
      </header>

      <section className="rounded-[var(--radius-lg)] border border-line bg-paper p-5 shadow-[var(--shadow)]">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Signed in as
        </h2>
        {account ? (
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
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
                <dd className="font-medium text-ink">
                  {[account.firstName, account.lastName].filter(Boolean).join(" ")}
                </dd>
              </>
            )}
          </dl>
        ) : (
          <p className="mt-3 text-sm text-muted">Couldn&apos;t load your account details.</p>
        )}
      </section>

      {/* Plan / Billing — placeholder (Free is the only live tier; Pro is "coming soon").
          Full Billing sub-nav lands in R4.4; no Stripe/billing work this pass. */}
      <section className="rounded-[var(--radius-lg)] border border-line bg-paper p-5 shadow-[var(--shadow)]">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Plan</h2>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-bold text-accent-deep">
              Free plan
            </span>
            <span className="text-sm text-muted">
              Unlimited autofill, resume parsing & tracker. Pro is coming soon.
            </span>
          </div>
          <Link href="/pricing" className="text-sm font-semibold text-accent-deep hover:underline">
            See plans →
          </Link>
        </div>
      </section>

      <DeleteAccountButton />
    </div>
  );
}
