import Link from "next/link";
import { Tag } from "@/components/ui";
import { buttonVariants } from "@/components/ui/Button";

// NOTE: this is a light token-pass so the landing renders under the kiwi system and
// the new marketing shell. The full hero/how-it-works/features/pricing rebuild is R2.1.
const FEATURES = [
  {
    title: "One profile",
    body: "Fill in your contact details, work history, and answers once. Kiwiply reuses them across every application.",
  },
  {
    title: "Your resumes, managed",
    body: "Upload and review resume variants in the browser. Kiwiply parses each one so the right details are ready to autofill.",
  },
  {
    title: "Every application tracked",
    body: "The board fills itself as you apply — drafts on every fill, confirmed when you submit. Never lose track of where you applied.",
  },
];

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-16 sm:py-24">
      <section id="how" className="flex flex-col items-start gap-6">
        <Tag>Kiwiply</Tag>
        <h1 className="text-4xl font-bold tracking-tight text-ink sm:text-6xl">
          One profile.
          <br />
          Every application.
        </h1>
        <p className="max-w-2xl text-lg text-ink-soft">
          Build your job-application profile, manage your resumes, and track every
          application in one place. The Kiwiply browser extension fills applications for
          you — right on the page, no copy-paste.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/signup" className={buttonVariants("accent")}>
            Create your profile
          </Link>
          <Link href="/login" className={buttonVariants("ghost")}>
            Sign in
          </Link>
        </div>
      </section>

      <section id="features" className="mt-20 grid gap-8 sm:grid-cols-3">
        {FEATURES.map((f) => (
          <div key={f.title} className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold text-ink">{f.title}</h2>
            <p className="text-sm text-muted">{f.body}</p>
          </div>
        ))}
      </section>

      <p className="mt-20 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
        <span>Your data is yours. Manage or delete it any time from your account.</span>
        <Link href="/privacy" className="text-accent-deep underline hover:text-ink">
          Privacy Policy
        </Link>
      </p>
    </main>
  );
}
