import type { Metadata } from "next";
import Link from "next/link";
import { isTopic, TOPIC_LABELS } from "@/lib/catalog";
import ContactForm from "@/components/pricing/ContactForm";

export const metadata: Metadata = {
  title: "Contact us",
  description: "Talk to Kiwiply about Autopilot, team and consultancy plans, or expert resume and interview services.",
};

/**
 * "Contact us" (Phase 15.6) — where every plan and service on /pricing that isn't sold by checkout
 * lands. `?topic=` preselects what the visitor clicked; requests go to the admin Inquiries queue.
 */
export default async function ContactPage({ searchParams }: { searchParams: Promise<{ topic?: string }> }) {
  const { topic } = await searchParams;
  const initialTopic = isTopic(topic) ? topic : "other";

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-8 px-5 py-14">
      <header className="text-center">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Talk to us</h1>
        <p className="mx-auto mt-3 max-w-md text-[15px] text-muted">
          {initialTopic === "other" ? "Tell us what you're after" : `Interested in ${TOPIC_LABELS[initialTopic]}? Tell us a little about it`} and
          we&apos;ll reply by email, usually within two business days.
        </p>
      </header>

      <ContactForm initialTopic={initialTopic} />

      <p className="text-center text-[12.5px] text-muted">
        We only use these details to reply to you. See the{" "}
        <Link href="/privacy" className="font-medium text-accent-deep hover:underline">
          Privacy Policy
        </Link>
        . Prefer email? Write to{" "}
        <a href="mailto:support@kiwiply.com" className="font-medium text-accent-deep hover:underline">
          support@kiwiply.com
        </a>
        .
      </p>
    </div>
  );
}
