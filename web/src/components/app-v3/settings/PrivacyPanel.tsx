import Link from "next/link";
import { DownloadIcon, LockIcon } from "@kiwiply/ui";
import DeleteAccountButton from "@/components/DeleteAccountButton";
import { DATA_MAP, NEVER_COLLECTED } from "@/lib/data-map";
import { DemoNote, SettingsCard } from "./panels";

/**
 * Settings > Privacy (E2E-U14.0): what we store, who sees it and for how long (from `lib/data-map.ts`), what we never
 * collect, and the two things you can do about it: download everything, or delete it. The Privacy Policy stays the legal
 * text; this is the same story in plain words. Server-safe (no hooks); the delete button is its own client component.
 */
export default function PrivacyPanel({ demo }: { demo: boolean }) {
  return (
    <>
      <SettingsCard title="What we store">
        <p className="text-[13.5px] text-ink-soft">
          Your data is yours. Here is everything we keep, why, and who can see it. The full legal version is the{" "}
          <Link href="/privacy" className="font-medium text-v2-blue hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
        <ul className="mt-3 divide-y divide-v2-line/60">
          {DATA_MAP.map((d) => (
            <li key={d.id} data-data-map={d.id} className="py-3.5">
              <h3 className="text-sm font-semibold text-v2-navy">{d.label}</h3>
              <p className="mt-1 text-[13px] text-ink-soft">{d.purpose}</p>
              <dl className="mt-2 grid gap-x-4 gap-y-1 text-[13px] sm:grid-cols-[auto_1fr]">
                <dt className="font-medium text-v2-muted">Who sees it</dt>
                <dd className="min-w-0 text-ink-soft">{d.whoSees}</dd>
                <dt className="font-medium text-v2-muted">How long</dt>
                <dd className="min-w-0 text-ink-soft">{d.retention}</dd>
              </dl>
            </li>
          ))}
        </ul>
      </SettingsCard>

      <SettingsCard title="What we never collect">
        <ul className="flex flex-col gap-2 text-[13.5px] text-ink-soft">
          {NEVER_COLLECTED.map((n) => (
            <li key={n} className="flex items-start gap-2">
              <LockIcon aria-hidden className="mt-0.5 h-4 w-4 flex-none text-v2-muted" />
              <span className="min-w-0">{n}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[13px] text-v2-muted">If something like that slips into a field, we stop it before it is saved.</p>
      </SettingsCard>

      <SettingsCard title="Your data">
        {demo ? (
          <DemoNote />
        ) : (
          <>
            <div>
              <a
                href="/api/account/export"
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-v2-line px-4 py-2 text-sm font-medium text-v2-navy hover:bg-paper-2 sm:min-h-0"
              >
                <DownloadIcon aria-hidden className="h-4 w-4" />
                Download my data
              </a>
              <p className="mt-1.5 text-xs text-ink-soft">A JSON copy of your profile, resumes, applications, settings and activity.</p>
            </div>
            <div className="mt-5">
              <DeleteAccountButton />
            </div>
          </>
        )}
      </SettingsCard>
    </>
  );
}
