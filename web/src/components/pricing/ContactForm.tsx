"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Button, Field, Input, Select, buttonVariants, inputClass } from "@/components/ui";
import { LockIcon, SendIcon, cn } from "@kiwiply/ui";
import { TOPIC_LABELS, type InquiryTopic } from "@/lib/catalog";
import { isEmail, LIMITS } from "@/lib/validate";

/** The board's counter is 0/1000; the API accepts more (4000) but we never send beyond this. */
const MESSAGE_MAX = 1000;
const cardClass = "rounded-[22px] bg-white p-5 shadow-v2-card sm:p-7";

/** The "Contact us" form (Phase 15.6, v3 board). Posts to the rate-limited BFF `/api/inquiries`. */
export default function ContactForm({ initialTopic }: { initialTopic: InquiryTopic }) {
  const [topic, setTopic] = useState<InquiryTopic>(initialTopic);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<{ name?: string; email?: string; message?: string }>({});
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    if (!name.trim()) next.name = "Please tell us your name.";
    if (!isEmail(email.trim())) next.email = "Please enter a valid email.";
    if (!message.trim()) next.message = "Please tell us a little about what you need.";
    setErrors(next);
    if (next.name || next.email || next.message) return;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/inquiries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          topic,
          name: name.trim(),
          email: email.trim(),
          company: company.trim() || undefined,
          message: message.trim().slice(0, MESSAGE_MAX),
        }),
      });
      if (res.status === 429) {
        setError("Too many messages from here — please try again later, or email us.");
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Couldn't send your message. Please try again.");
        return;
      }
      setSent(true);
    } catch {
      setError("Couldn't reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className={cn(cardClass, "py-10 text-center")}>
        <h2 className="font-display text-xl font-bold text-ink">Thanks — we&apos;ve got it</h2>
        <p className="mt-2 text-sm text-ink-soft">We&apos;ll reply to {email.trim()} soon.</p>
        <Link href="/pricing" className={buttonVariants("ghost", "md", "mt-5")}>
          Back to pricing
        </Link>
      </div>
    );
  }

  return (
    <div className={cardClass}>
      <h2 className="font-display text-[22px] font-extrabold leading-tight text-ink">Send us a message</h2>
      <p className="mb-5 mt-1 text-[13px] text-muted">Fill out the form below and we&apos;ll get back to you soon.</p>
      <form onSubmit={onSubmit} noValidate>
        <Field label="What are you interested in?" required htmlFor="contact-topic">
          <Select
            id="contact-topic"
            aria-label="Topic"
            value={topic}
            onChange={(v) => setTopic(v as InquiryTopic)}
            options={(Object.keys(TOPIC_LABELS) as InquiryTopic[]).map((t) => ({ value: t, label: TOPIC_LABELS[t] }))}
          />
        </Field>
        <div className="grid gap-x-4 sm:grid-cols-2">
          <Field label="Your name" required error={errors.name}>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="name" placeholder="Jane Cooper" />
          </Field>
          <Field label="Email" required error={errors.email}>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={LIMITS.emailMax} autoComplete="email" placeholder="jane@company.com" />
          </Field>
        </div>
        <Field
          label={
            <>
              Company / organization <span className="font-normal text-muted">(optional)</span>
            </>
          }
        >
          <Input value={company} onChange={(e) => setCompany(e.target.value)} maxLength={200} autoComplete="organization" placeholder="Your company or organization" />
        </Field>
        <Field label="Anything we should know?" required error={errors.message} className="!mb-1">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            maxLength={MESSAGE_MAX}
            placeholder="Tell us what you're looking for, any questions, or additional details..."
            className={cn(inputClass, "min-h-[110px] resize-y")}
          />
        </Field>
        <p className="mb-4 text-right text-[12.5px] text-muted">
          {message.length}/{MESSAGE_MAX}
        </p>

        {error && (
          <p role="alert" className="mb-3 text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" variant="accent" size="lg" className="min-h-12 w-full" disabled={busy}>
          <SendIcon className="h-4 w-4" />
          {busy ? "Sending…" : "Send message"}
        </Button>
        <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-[12px] text-muted">
          <LockIcon className="h-3.5 w-3.5 flex-none" />
          <span>
            We only use these details to reply to you. See our{" "}
            <Link href="/privacy" className="font-medium text-accent-deep underline">
              Privacy Policy
            </Link>
            .
          </span>
        </p>
      </form>
    </div>
  );
}
