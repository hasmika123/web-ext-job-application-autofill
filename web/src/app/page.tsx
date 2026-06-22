import Link from "next/link";

const FEATURES = [
  {
    title: "One profile",
    body: "Fill in your contact details, work history, and answers once. Dossier reuses them across every application.",
  },
  {
    title: "Your resumes, managed",
    body: "Upload and review resume variants in the browser. Dossier parses each one so the right details are ready to autofill.",
  },
  {
    title: "Every application tracked",
    body: "The board fills itself as you apply — drafts on every fill, confirmed when you submit. Never lose track of where you applied.",
  },
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 py-16 sm:py-24">
      <section className="flex flex-col items-start gap-6">
        <span className="rounded-full border border-foreground/15 px-3 py-1 text-xs font-medium uppercase tracking-wide text-foreground/60">
          Dossier
        </span>
        <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
          One profile.
          <br />
          Every application.
        </h1>
        <p className="max-w-2xl text-lg text-foreground/70">
          Build your job-application profile, manage your resumes, and track every
          application in one place. The Dossier browser extension fills applications for
          you — right on the page, no copy-paste.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/signup"
            className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
          >
            Create your profile
          </Link>
          <Link
            href="/login"
            className="rounded-full border border-foreground/20 px-5 py-2.5 text-sm font-medium transition-colors hover:bg-foreground/5"
          >
            Sign in
          </Link>
        </div>
      </section>

      <section className="mt-20 grid gap-8 sm:grid-cols-3">
        {FEATURES.map((f) => (
          <div key={f.title} className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold">{f.title}</h2>
            <p className="text-sm text-foreground/65">{f.body}</p>
          </div>
        ))}
      </section>

      <footer className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-24 text-sm text-foreground/50">
        <span>Your data is yours. Manage or delete it any time from your account.</span>
        <Link href="/privacy" className="underline hover:text-foreground/80">
          Privacy Policy
        </Link>
      </footer>
    </main>
  );
}
