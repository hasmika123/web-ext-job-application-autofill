import { redirect } from "next/navigation";
import Link from "next/link";
import { hasSession } from "@/lib/auth";
import { serverApiFetch } from "@/lib/api";
import SignOutButton from "@/components/SignOutButton";
import DeleteAccountButton from "@/components/DeleteAccountButton";

type Account = {
  login?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
};

/**
 * Gated account/settings page. Server Component: reads the session cookie and fetches
 * the current account from the Spring API with the bearer token. No valid session →
 * straight to /login. (Resume + bio management arrives in 1.10d.)
 */
export default async function SettingsPage() {
  if (!(await hasSession())) {
    redirect("/login");
  }

  const res = await serverApiFetch("/api/account");
  if (res.status === 401 || res.status === 403) {
    // Token missing/expired — send them to sign in again.
    redirect("/login");
  }
  const account: Account | null = res.ok ? await res.json() : null;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-16">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Account</h1>
          <p className="mt-1 text-sm text-foreground/60">Manage your Dossier account.</p>
        </div>
        <SignOutButton />
      </header>

      <section className="rounded-xl border border-foreground/15 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/50">
          Signed in as
        </h2>
        {account ? (
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-foreground/50">Username</dt>
            <dd className="font-medium">{account.login}</dd>
            {account.email && (
              <>
                <dt className="text-foreground/50">Email</dt>
                <dd className="font-medium">{account.email}</dd>
              </>
            )}
            {(account.firstName || account.lastName) && (
              <>
                <dt className="text-foreground/50">Name</dt>
                <dd className="font-medium">
                  {[account.firstName, account.lastName].filter(Boolean).join(" ")}
                </dd>
              </>
            )}
          </dl>
        ) : (
          <p className="mt-3 text-sm text-foreground/60">
            Couldn&apos;t load your account details.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-foreground/15 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/50">
          Manage
        </h2>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/board"
            className="rounded-full border border-foreground/20 px-4 py-2 text-sm font-medium transition-colors hover:bg-foreground/5"
          >
            Board
          </Link>
          <Link
            href="/profile"
            className="rounded-full border border-foreground/20 px-4 py-2 text-sm font-medium transition-colors hover:bg-foreground/5"
          >
            Edit profile
          </Link>
          <Link
            href="/resumes"
            className="rounded-full border border-foreground/20 px-4 py-2 text-sm font-medium transition-colors hover:bg-foreground/5"
          >
            Resumes
          </Link>
        </div>
      </section>

      <DeleteAccountButton />
    </main>
  );
}
