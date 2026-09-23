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
 * to Gmail — see the email-architecture memory / DEPLOY §9.1). The operator is named here
 * (AutomoraLab LLC) because the Chrome Web Store listing points its Privacy Policy URL at
 * this page. PL.1's remaining piece — a lawyer's review — still stands before a wider launch.
 *
 * <p>Phase 12.6 added the <b>Payments</b> section. It is here, not only in the Terms, because a
 * privacy policy has to name the processors that receive personal data: paying for Pro sends a
 * name, email and card details to Stripe. The point worth being unambiguous about is what we
 * DON'T get back — we never see a full card number, only a customer reference and a status.
 */
const UPDATED = "September 2026";
const CONTACT = "support@kiwiply.com";
const ENTITY = "AutomoraLab LLC";

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
        Kiwiply is a service operated by {ENTITY}{" "}
        (&quot;Kiwiply&quot;, &quot;we&quot;, &quot;us&quot;). It helps you keep one profile and
        several resume versions and autofill
        job applications. This policy explains what we collect, why, how it&apos;s stored, and
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
            <strong>Profile suggestions:</strong> after you autofill an application with the
            extension, the answers you give there to questions your profile could hold (for example
            desired salary or notice period), so we can suggest them for your profile. Nothing
            changes in your profile unless you keep a suggestion. We never take self-identification
            (EEO) answers this way, and we never store the address of the page — only a salted code
            that tells two applications apart. You can turn this off in the extension&apos;s
            settings.
          </li>
          <li>
            <strong>Billing (Pro subscribers only):</strong> a reference to your customer record
            at our payment processor, the plan you chose, and your subscription status and renewal
            date. <strong>We never receive or store your card number.</strong>
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
        <p>
          <strong>Resume fit (Pro).</strong> When you ask which of your resumes fits a job — on the
          board, or automatically in the extension once you&apos;ve turned Kiwiply AI on — that job&apos;s
          description and a short summary of each of your saved resumes (summary, skills, recent roles,
          education) are sent to the same provider to score them. We keep only the scores and a
          one-line reason, never the job text or your resumes, so asking again about the same job is
          instant. They&apos;re deleted with your account.
        </p>
        <p>
          <strong>Job fit (Pro).</strong> When you ask what one resume is missing for a job, that
          job&apos;s description, a fuller summary of that resume, and a few of your profile answers that
          can make a job a non-starter — work authorization, sponsorship, city/state/country,
          relocation, work preference, start date and notice period — are sent to the same provider.
          Never your name, contact details or self-identification answers. We keep only the report
          (score, a one-line summary, short lists of skills), deleted with your account.
        </p>
      </Section>

      <Section title="Storage and sharing">
        <p>
          Your data is stored in our database; resume files are kept in object storage. Data
          is transmitted over encrypted connections (HTTPS). We don&apos;t sell your personal
          information or share it with third parties for their own purposes. We rely on
          infrastructure providers (such as database and file-storage hosting), an email
          delivery provider, and — for Pro subscriptions only — a payment processor to run the
          service; they process data only on our behalf, or, in the payment processor&apos;s case,
          as an independent processor of the payment itself (see <strong>Payments</strong> below).
        </p>
      </Section>

      <Section title="Payments">
        <p>
          If you subscribe to <strong>Pro</strong>, payments are processed by{" "}
          <strong>Stripe</strong>. You enter your card details on Stripe&apos;s own checkout page,
          not ours: <strong>we never see or store your full card number</strong>. Stripe receives
          the information it needs to take the payment — typically your email address, card
          details and billing country — and handles it as a payment processor under its own{" "}
          <a
            href="https://stripe.com/privacy"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-accent-deep hover:underline"
          >
            privacy policy
          </a>
          .
        </p>
        <p>
          What we keep on our side is only what we need to know whether your subscription is
          active: a customer reference, the plan, the status, and the renewal date. We keep those
          records while your account exists and for as long as tax and accounting rules require us
          to retain proof of a transaction — which can outlast an account deletion, because
          deleting an account does not undo a payment that happened. Nothing about your payments is
          used for advertising, and we never sell it.
        </p>
      </Section>

      <Section title="How our team accesses your data">
        <p>
          Our administrators may access accounts and data to operate, support, and secure the
          service — for example to investigate an issue or respond to a request. By default they
          see only <strong>metadata</strong> (labels, counts, status). Viewing the actual{" "}
          <em>contents</em> of a resume or profile requires a logged reason and is recorded in an
          immutable audit trail. Administrative access is limited to running the service and is not
          used for any other purpose.
        </p>
      </Section>

      <Section title="Marketing emails">
        <p>
          If you opt in — separately from creating an account — we&apos;ll send occasional product
          updates. This is a distinct consent: signing up for Kiwiply does not subscribe you. We use
          double opt-in (you confirm via email), record when and where you consented, and include a
          one-click unsubscribe link in every message. Service emails (e.g. account activation,
          password reset) are sent regardless, as they&apos;re necessary to operate your account.
        </p>
      </Section>

      <Section title="Bug reports and diagnostic data">
        <p>
          When you submit a bug report (from the website or the extension), we collect your message
          and, <strong>only if you leave the consent box ticked</strong>, the page address and basic
          browser information to help us debug. Reports may contain personal information, so they are
          access-controlled, used only to fix and improve the service, and retained no longer than
          needed.
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
          . Deletion is immediate and cannot be undone. The one exception is billing: if you have
          ever paid for Pro, we are required to keep basic records of the transaction (amount, date,
          plan) for tax and accounting purposes, and our payment processor keeps its own records
          under its own policy. Those records contain no profile, resume or application data — see{" "}
          <strong>Payments</strong> above.
        </p>
      </Section>

      <Section title="Your rights">
        <p>
          Depending on where you live (including under GDPR and CCPA), you may have the right
          to access, correct, export, or delete your personal data. You can view and edit your
          profile and resumes directly in the app, <strong>download a copy of your data</strong>{" "}
          from your account settings, and delete everything there too. For any other request,
          contact us.
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
        <p>
          Separately, when you&apos;re signed in, the extension reports <strong>fill-quality
          counts</strong> to our own server after each autofill: which job-application system the page
          uses (a fixed name like &quot;Workday&quot;, or &quot;other&quot;), and how many fields were
          found, filled, left empty, or changed by you afterwards. It never sends a field&apos;s value or
          label, or the address of the page, and we store these counts <strong>without any link to
          your account</strong>. The same extension setting turns it off.
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

      <Section title="Browser extension data use">
        <p>
          The Kiwiply browser extension&apos;s use of data received through it adheres to the{" "}
          <a
            href="https://developer.chrome.com/docs/webstore/program-policies/limited-use"
            className="font-medium text-accent-deep hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Chrome Web Store User Data Policy
          </a>
          , including the Limited Use requirements. The extension collects only what is needed for
          its single purpose — filling in job applications from your saved profile and the resume
          you choose — and transfers it only to your own Kiwiply account, never to advertising
          networks, data brokers, or credit-assessment services, and never for training any
          general-purpose model.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Kiwiply is operated by {ENTITY}. Questions about this policy or your data? Email{" "}
          <a href={`mailto:${CONTACT}`} className="font-medium text-accent-deep hover:underline">
            {CONTACT}
          </a>
          .
        </p>
      </Section>
    </main>
  );
}
