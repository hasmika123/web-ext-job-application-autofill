import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What data Kiwiply collects, how it's used and stored, and how to delete it.",
};

/**
 * Privacy policy. Written to match what the product actually does today (see 1.11): a
 * cloud account holding your profile + resumes, in-browser resume parsing, and a
 * self-service "delete everything" path. Contact = support@kiwiply.com (monitored, routed
 * to Gmail — see the email-architecture memory / DEPLOY §9.1). PL.1 (legal review +
 * registered entity) still stands before any wider public launch.
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

export default function PrivacyPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-16">
      <header className="flex flex-col gap-2">
        <h1 className="text-[28px] font-bold tracking-tight text-ink">Privacy Policy</h1>
        <p className="text-sm text-muted">Last updated: {UPDATED}</p>
      </header>

      <p className="text-sm leading-relaxed text-ink-soft">
        Kiwiply helps you keep one profile and several resume versions and autofill job
        applications. This policy explains what we collect, why, how it&apos;s stored, and
        how to delete it. We don&apos;t sell your data.
      </p>

      <Section title="Beta service">
        <p>
          Kiwiply is currently in <strong>beta</strong>. The service is provided{" "}
          <strong>&quot;as is&quot; and &quot;as available&quot;</strong>, without warranties of any
          kind. Features may change, and the service may be unavailable or interrupted from time to
          time while we improve it. We aim to keep your data safe, but during beta you should keep
          your own copy of anything important — you can export or delete your data at any time. To the
          extent permitted by law, Kiwiply is not liable for any loss arising from use of the beta
          service.
        </p>
      </Section>

      <Section title="What we collect">
        <ul className="list-disc pl-5">
          <li>
            <strong>Account:</strong> a username and email address so you can sign in.
          </li>
          <li>
            <strong>Profile:</strong> the details you enter for autofill — name, contact
            information, address, links, work-authorization answers, and any voluntary
            self-identification answers you choose to provide.
          </li>
          <li>
            <strong>Resumes:</strong> the resume files you choose to save and the text
            fields parsed from them.
          </li>
          <li>
            <strong>Application activity:</strong> jobs you save or apply to through Kiwiply,
            when you use those features.
          </li>
          <li>
            <strong>Technical:</strong> authentication tokens (stored in secure, http-only
            cookies on the web) and basic server logs needed to operate the service.
          </li>
        </ul>
      </Section>

      <Section title="How resume parsing works">
        <p>
          When you add a resume, the file is read and parsed <strong>in your browser</strong>.
          Its contents are only sent to our servers if and when you choose to save the resume
          to your account.
        </p>
      </Section>

      <Section title="How we use your data">
        <p>
          Your data is used solely to provide Kiwiply: to store your profile and resumes, to
          autofill applications you initiate, and to manage your account. We never auto-submit
          an application on your behalf, and we don&apos;t use your data for advertising.
        </p>
      </Section>

      <Section title="AI answer drafting (optional)">
        <p>
          Kiwiply offers an <strong>optional</strong> AI feature that drafts answers to
          open-ended application questions (for example, &quot;Why do you want this role?&quot;).
          It is <strong>off by default</strong> and only runs after you explicitly turn it on.
        </p>
        <p>
          When enabled, the question and a short summary of your profile/resume background are
          sent to a third-party AI provider (currently <strong>Google Gemini</strong>) to
          generate a draft you review before using. Because we currently use Gemini&apos;s
          free tier, <strong>Google may use this input to improve its services, and human
          reviewers may see it</strong>. If you don&apos;t want your information used this way,
          simply leave AI drafting off — every other Kiwiply feature works without it. You can
          also bring your own AI key in the extension, in which case requests go directly from
          your browser to that provider under your own account, not through us.
        </p>
      </Section>

      <Section title="Storage and sharing">
        <p>
          Your data is stored in our database; resume files are kept in object storage. Data
          is transmitted over encrypted connections (HTTPS). We don&apos;t sell your personal
          information or share it with third parties for their own purposes. We rely on
          infrastructure providers (such as database and file-storage hosting) to run the
          service; they process data only on our behalf.
        </p>
      </Section>

      <Section title="Retention and deletion">
        <p>
          We keep your data while your account is active. You can permanently delete your
          account and all associated data — profile, resumes (including stored files), and
          application activity — at any time from{" "}
          <Link href="/settings" className="font-medium text-accent-deep hover:underline">
            your account settings
          </Link>
          . Deletion is immediate and cannot be undone.
        </p>
      </Section>

      <Section title="Your rights">
        <p>
          Depending on where you live (including under GDPR and CCPA), you may have the right
          to access, correct, or delete your personal data. You can view and edit your profile
          and resumes directly in the app, and delete everything from your account settings.
          For any other request, contact us.
        </p>
      </Section>

      <Section title="The browser extension">
        <p>
          The Kiwiply browser extension fills application forms on the page you&apos;re viewing
          using your saved profile and the resume you pick. It reads the current page only to
          match and fill fields, stores a local copy of your data for offline use, and syncs
          with your account. It does not read pages you aren&apos;t filling and does not submit
          applications for you.
        </p>
      </Section>

      <Section title="Analytics">
        <p>
          We use <strong>Google Analytics</strong> to understand how Kiwiply is used — which
          features people reach and where the experience breaks — so we can improve it. We send
          only <strong>anonymous, aggregate events</strong> (for example &quot;a resume was
          saved&quot; or &quot;the board was viewed&quot;), never your name, email, profile,
          resumes, or the specific jobs you apply to. In the browser extension this is opt-out in
          Settings; on the website it is <strong>opt-in</strong> — it loads only after you accept the
          cookie banner, and never if you decline.
        </p>
      </Section>

      <Section title="Cookies">
        <p>
          We use first-party http-only cookies strictly to keep you signed in — these are essential
          and always on. Our analytics (above) also sets first-party cookies to count visits and
          distinguish sessions; on the website these load <strong>only after you accept</strong> them
          in the cookie banner, and you can decline. We do <strong>not</strong> use advertising
          cookies and we don&apos;t sell your data.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions about this policy or your data? Email{" "}
          <a href={`mailto:${CONTACT}`} className="font-medium text-accent-deep hover:underline">
            {CONTACT}
          </a>
          .
        </p>
      </Section>
    </main>
  );
}
