"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Button, Card, Field, Input, Select, buttonVariants } from "@/components/ui";
import { ORG_TOPICS, TOPIC_LABELS, type InquiryTopic } from "@/lib/catalog";
import { isEmail, LIMITS } from "@/lib/validate";

const TEAM_SIZES = ["1–10", "11–50", "51–200", "200+"];
const textareaClass =
  "w-full resize-y rounded-[var(--radius)] border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-ink";

/** The "Contact us" form (Phase 15.6). Posts to the rate-limited BFF `/api/inquiries`. */
export default function ContactForm({ initialTopic }: { initialTopic: InquiryTopic }) {
  const [topic, setTopic] = useState<InquiryTopic>(initialTopic);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [teamSize, setTeamSize] = useState("");
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOrg = ORG_TOPICS.includes(topic);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    if (!name.trim()) next.name = "Please tell us your name.";
    if (!isEmail(email.trim())) next.email = "Please enter a valid email.";
    setErrors(next);
    if (next.name || next.email) return;

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
          company: isOrg ? company.trim() || undefined : undefined,
          teamSize: isOrg ? teamSize || undefined : undefined,
          message: message.trim() || undefined,
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
      <Card className="text-center">
        <h2 className="font-display text-xl font-semibold text-ink">Thanks — we&apos;ve got it</h2>
        <p className="mt-2 text-sm text-ink-soft">We&apos;ll reply to {email.trim()} soon.</p>
        <Link href="/pricing" className={buttonVariants("ghost", "md", "mt-5")}>
          Back to pricing
        </Link>
      </Card>
    );
  }

  return (
    <Card>
      <form onSubmit={onSubmit} noValidate>
        <Field label="What are you interested in?" htmlFor="contact-topic">
          <Select
            id="contact-topic"
            aria-label="Topic"
            value={topic}
            onChange={(v) => setTopic(v as InquiryTopic)}
            options={(Object.keys(TOPIC_LABELS) as InquiryTopic[]).map((t) => ({ value: t, label: TOPIC_LABELS[t] }))}
          />
        </Field>
        <Field label="Your name" required error={errors.name}>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="name" />
        </Field>
        <Field label="Email" required error={errors.email}>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={LIMITS.emailMax} autoComplete="email" />
        </Field>
        {isOrg && (
          <div className="grid gap-x-4 sm:grid-cols-2">
            <Field label="Company">
              <Input value={company} onChange={(e) => setCompany(e.target.value)} maxLength={200} autoComplete="organization" />
            </Field>
            <Field label="Team size" htmlFor="contact-team">
              <Select
                id="contact-team"
                aria-label="Team size"
                value={teamSize}
                onChange={setTeamSize}
                placeholder="Choose…"
                options={TEAM_SIZES.map((s) => ({ value: s, label: s }))}
              />
            </Field>
          </div>
        )}
        <Field label="Anything we should know?" hint="Optional — what you need, timing, questions.">
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} maxLength={4000} className={textareaClass} />
        </Field>

        {error && (
          <p role="alert" className="mb-3 text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" variant="accent" className="w-full" disabled={busy}>
          {busy ? "Sending…" : "Send"}
        </Button>
      </form>
    </Card>
  );
}
