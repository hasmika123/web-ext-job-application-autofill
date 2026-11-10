import Link from "next/link";
import type { Metadata } from "next";
import { getSubprocessors } from "@/lib/subprocessors";

export const metadata: Metadata = {
  title: "Subprocessors",
  description: "The companies that process personal data for Kiwiply, what for, which data, and where.",
};

const CONTACT = "support@kiwiply.com";

/**
 * The public subprocessor register (T1.5). The list is admin-configured and read from the API, so what is on this page is exactly what the admin keeps in the register.
 * It names each company, what it does for us, the data it can touch, where, and links to its own terms.
 */
export default async function SubprocessorsPage() {
  const list = await getSubprocessors();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-16">
      <header className="flex flex-col gap-2">
        <h1 className="text-[28px] font-bold tracking-tight text-ink">Subprocessors</h1>
        <p className="text-sm leading-relaxed text-ink-soft">
          These companies process personal data on Kiwiply&apos;s behalf. Each one is bound to use that data only to provide its service to us. For how we handle your data in
          general, see our{" "}
          <Link href="/privacy" className="font-medium text-accent-deep hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
      </header>

      {list === null ? (
        <p role="status" className="rounded-xl border border-line bg-paper-2 px-4 py-3 text-sm text-ink-soft">
          The list could not be loaded just now. Please try again in a few minutes, or write to {CONTACT}.
        </p>
      ) : list.length === 0 ? (
        <p className="rounded-xl border border-line bg-paper-2 px-4 py-3 text-sm text-ink-soft">No subprocessors are listed at the moment.</p>
      ) : (
        <ul className="flex flex-col gap-4" data-testid="subprocessor-list">
          {list.map((s) => (
            <li key={s.name} className="rounded-2xl border border-line bg-paper px-5 py-4">
              <h2 className="font-display text-lg font-semibold text-ink">{s.name}</h2>
              {s.purpose && <p className="mt-1 text-sm leading-relaxed text-ink-soft">{s.purpose}</p>}
              <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[7rem_1fr]">
                {s.data && (
                  <>
                    <dt className="font-medium text-ink">Data</dt>
                    <dd className="text-ink-soft">{s.data}</dd>
                  </>
                )}
                {s.location && (
                  <>
                    <dt className="font-medium text-ink">Location</dt>
                    <dd className="text-ink-soft">{s.location}</dd>
                  </>
                )}
                {s.link && (
                  <>
                    <dt className="font-medium text-ink">Their terms</dt>
                    <dd>
                      <a href={s.link} target="_blank" rel="noreferrer" className="font-medium text-accent-deep hover:underline">
                        Privacy information
                      </a>
                    </dd>
                  </>
                )}
              </dl>
            </li>
          ))}
        </ul>
      )}

      <p className="text-sm leading-relaxed text-ink-soft">
        Questions about this list, or want a data processing agreement? Write to {CONTACT}.
      </p>
    </main>
  );
}
