import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms you agree to when you use Kiwiply.",
};

/**
 * Terms of Service. Written to match what the product actually is today (1.11): a
 * free beta cloud account + browser extension that autofills (never auto-submits) job
 * applications. Pairs with the Privacy Policy (/privacy) for data handling. Contact =
 * support@kiwiply.com (routed to Gmail — see the email-architecture memory). PL.1 (legal
 * review + a registered entity + a real governing-law clause) still stands before any
 * wider public launch — this is a plain-language beta agreement, not a lawyer's draft.
 */
const UPDATED = "June 2026";
const CONTACT = "support@kiwiply.com";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
      <div className="flex flex-col gap-2 text-sm leading-relaxed text-ink-soft">{children}</div>
    </section>
  );
}

export default function TermsPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-16">
      <header className="flex flex-col gap-2">
        <h1 className="text-[28px] font-bold tracking-tight text-ink">Terms of Service</h1>
        <p className="text-sm text-muted">Last updated: {UPDATED}</p>
      </header>

      <p className="text-sm leading-relaxed text-ink-soft">
        These terms are an agreement between you and Kiwiply (&quot;Kiwiply&quot;, &quot;we&quot;,
        &quot;us&quot;) governing your use of the Kiwiply website, accounts, and browser extension
        (together, the &quot;Service&quot;). By creating an account or using the Service, you agree to
        these terms. If you don&apos;t agree, please don&apos;t use the Service.
      </p>

      <Section title="Beta service">
        <p>
          Kiwiply is currently in <strong>beta</strong> and is provided{" "}
          <strong>&quot;as is&quot; and &quot;as available&quot;</strong>, without warranties of any
          kind. Features may change or be removed, and the Service may be unavailable or interrupted
          while we improve it. Keep your own copy of anything important — you can export or delete your
          data at any time.
        </p>
      </Section>

      <Section title="Who can use Kiwiply">
        <p>
          You must be at least 16 years old (or the age of digital consent where you live) and able to
          form a binding agreement to use Kiwiply. You&apos;re responsible for everything that happens
          under your account, so keep your password secure and let us know promptly if you suspect
          unauthorized access.
        </p>
      </Section>

      <Section title="Your account">
        <p>
          You need an account to use most of the Service. Provide accurate information when you sign up,
          and keep it current. One person, one account, unless we agree otherwise. We may suspend or
          close accounts that abuse the Service or these terms.
        </p>
      </Section>

      <Section title="Acceptable use">
        <p>You agree to use Kiwiply lawfully and only for its intended purpose. You will not:</p>
        <ul className="list-disc pl-5">
          <li>use Kiwiply to submit false, misleading, or fraudulent information in any application;</li>
          <li>
            attempt to bypass any safeguard — Kiwiply <strong>never</strong> auto-submits an application
            and <strong>never</strong> bypasses CAPTCHAs or other anti-bot measures, and you must not try
            to make it do either;
          </li>
          <li>
            use the Service to scrape, overload, disrupt, reverse-engineer, or gain unauthorized access to
            any system, or to violate the terms of the job sites you visit;
          </li>
          <li>resell, sublicense, or use the Service to build a competing product; or</li>
          <li>upload anything unlawful, infringing, or that isn&apos;t yours to share.</li>
        </ul>
        <p>
          You&apos;re responsible for reviewing everything Kiwiply fills in before you submit an
          application — what you submit is your decision and your responsibility.
        </p>
      </Section>

      <Section title="Your content">
        <p>
          Your profile, resumes, and application data are <strong>yours</strong>. You grant us only the
          limited permission needed to operate the Service for you — to store your data, parse your
          resumes, and fill the applications you initiate. We don&apos;t sell your data or use it for
          advertising. How we handle it is described in our{" "}
          <Link href="/privacy" className="font-medium text-accent-deep hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
      </Section>

      <Section title="Communications">
        <p>
          We send <strong>service emails</strong> (such as account activation and password resets)
          that are necessary to operate your account. <strong>Marketing emails</strong> (product
          updates) are sent only if you opt in separately, and you can unsubscribe at any time via the
          link in every message. If you submit a bug report, you may choose to include diagnostic
          information to help us debug. We may also access your account to operate and support the
          Service — see the{" "}
          <Link href="/privacy" className="font-medium text-accent-deep hover:underline">
            Privacy Policy
          </Link>{" "}
          for how data is handled.
        </p>
      </Section>

      <Section title="AI features">
        <p>
          Kiwiply offers an <strong>optional</strong> AI feature that drafts answers to open-ended
          application questions. It&apos;s off by default. AI-generated drafts can be inaccurate — review
          and edit every draft before you use it. When enabled, your input is sent to a third-party AI
          provider as described in the Privacy Policy.
        </p>
      </Section>

      <Section title="Our intellectual property">
        <p>
          The Kiwiply name, logo, website, and software are owned by us and protected by law. These terms
          don&apos;t give you any rights to our trademarks or to copy the Service beyond using it as
          intended.
        </p>
      </Section>

      <Section title="Fees">
        <p>
          Kiwiply is free to start during beta. If we introduce paid plans, we&apos;ll show the price and
          terms before you&apos;re charged, and these terms will continue to apply to the free portions of
          the Service.
        </p>
      </Section>

      <Section title="Termination">
        <p>
          You can stop using Kiwiply and delete your account and all associated data at any time from{" "}
          <Link href="/settings" className="font-medium text-accent-deep hover:underline">
            your account settings
          </Link>
          . We may suspend or end your access if you breach these terms or to protect the Service or other
          users. Sections that by their nature should survive termination (such as disclaimers and
          limitation of liability) will continue to apply.
        </p>
      </Section>

      <Section title="Disclaimers and limitation of liability">
        <p>
          The Service is provided &quot;as is&quot; without warranties of any kind, whether express or
          implied. We don&apos;t warrant that the Service will be uninterrupted, error-free, or that it
          will result in any job, interview, or outcome. To the fullest extent permitted by law, Kiwiply
          is not liable for any indirect, incidental, or consequential damages, or for any loss of data,
          profits, or opportunities arising from your use of the Service.
        </p>
      </Section>

      <Section title="Changes to these terms">
        <p>
          We may update these terms as the Service evolves. When we make material changes, we&apos;ll
          update the &quot;Last updated&quot; date above and, where appropriate, notify you. Continuing to
          use Kiwiply after a change means you accept the updated terms.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions about these terms? Email{" "}
          <a href={`mailto:${CONTACT}`} className="font-medium text-accent-deep hover:underline">
            {CONTACT}
          </a>
          .
        </p>
      </Section>
    </main>
  );
}
