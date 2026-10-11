"use client";

import { useEffect, useRef, useState } from "react";
import { ChatIcon, ClockIcon, SendIcon, cn, useToast } from "@kiwiply/ui";
import Image from "next/image";
import { InitialsAvatar, SectionCard } from "../../app-v2/common";
import { HeroBand } from "@/components/app-v2/common";
import {
  ASSISTANT_CANNED_REPLY,
  ASSISTANT_CAPABILITIES,
  ASSISTANT_PROMPTS,
  ASSISTANT_RECENT_CHATS,
} from "../sample-data.c";

interface Msg {
  id: number;
  from: "ai" | "me";
  text: string;
}

/**
 * AI Assistant (APP-V3-SPEC 2.5). Client state only: sending a message (or tapping a prompt chip)
 * appends it and, after a beat, the one canned reply. No API call is made. The greeting bubble is
 * rendered separately from the message list because it carries the capability bullets.
 */
export default function AssistantPage({ firstName }: { firstName: string }) {
  const toast = useToast();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(false);
  const nextId = useRef(1);
  const logRef = useRef<HTMLDivElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  // Keep the newest message in view inside the chat card (never scrolls the page).
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, typing]);

  const send = (raw: string) => {
    const text = raw.trim();
    if (!text) return;
    setMessages((m) => [...m, { id: nextId.current++, from: "me", text }]);
    setDraft("");
    setTyping(true);
    timers.current.push(
      setTimeout(() => {
        setMessages((m) => [...m, { id: nextId.current++, from: "ai", text: ASSISTANT_CANNED_REPLY }]);
        setTyping(false);
      }, 650),
    );
  };

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5">
      <HeroBand
        title="Kiwiply AI Assistant"
        subtitle="Your personal job search copilot."
        mascot="mascot-wave-laptop"
        note="Ask me anything!"
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section
          aria-label="Chat with Kiwiply AI Assistant"
          className="flex min-w-0 flex-col rounded-2xl border border-v2-line/70 bg-paper shadow-v2-soft"
        >
          <div className="flex gap-2 overflow-x-auto border-b border-v2-line/70 p-3 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible sm:p-4">
            {ASSISTANT_PROMPTS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => send(p)}
                className="flex-none whitespace-nowrap rounded-full border border-v2-line bg-paper-2 px-3.5 py-2 text-[13px] font-semibold text-ink-soft transition-colors hover:border-v2-green hover:bg-v2-lime-soft hover:text-v2-green-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-blue"
              >
                {p}
              </button>
            ))}
          </div>

          <div
            ref={logRef}
            role="log"
            aria-live="polite"
            aria-label="Conversation"
            className="flex h-[min(520px,calc(100dvh-22rem))] min-h-[320px] flex-col gap-4 overflow-y-auto p-4 sm:p-5"
          >
            <AiRow>
              <p>Hi {firstName}! 👋</p>
              <p className="mt-2">I&apos;m your Kiwiply AI Assistant. I can help you with:</p>
              <ul className="mt-2 space-y-1">
                {ASSISTANT_CAPABILITIES.map((c) => (
                  <li key={c} className="flex gap-2">
                    <span aria-hidden className="mt-[9px] h-1.5 w-1.5 flex-none rounded-full bg-v2-green" />
                    {c}
                  </li>
                ))}
              </ul>
              <p className="mt-2">What would you like help with today?</p>
            </AiRow>

            {messages.map((m) =>
              m.from === "ai" ? (
                <AiRow key={m.id}>
                  <p>{m.text}</p>
                </AiRow>
              ) : (
                <div key={m.id} className="flex items-end justify-end gap-2.5">
                  <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-v2-lime px-4 py-2.5 text-[14.5px] leading-relaxed text-v2-navy sm:max-w-[70%]">
                    {m.text}
                  </p>
                  <InitialsAvatar name={firstName} size={32} className="hidden sm:inline-grid" />
                </div>
              ),
            )}

            {typing && (
              <AiRow>
                <span className="inline-flex items-center gap-1" role="status" aria-label="Kiwiply AI is typing">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="h-1.5 w-1.5 animate-pulse rounded-full bg-v2-muted"
                      style={{ animationDelay: `${i * 160}ms` }}
                    />
                  ))}
                </span>
              </AiRow>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
            className="flex items-center gap-2 border-t border-v2-line/70 p-3 sm:p-4"
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ask me anything about your job search..."
              aria-label="Message to Kiwiply AI Assistant"
              className="h-12 min-w-0 flex-1 rounded-xl border border-v2-line bg-paper-2 px-4 text-[15px] text-ink outline-none placeholder:text-v2-muted focus:border-v2-blue focus:bg-paper focus-visible:ring-2 focus-visible:ring-v2-blue/25"
            />
            <button
              type="submit"
              disabled={!draft.trim()}
              aria-label="Send message"
              className="inline-flex h-12 w-12 flex-none items-center justify-center rounded-xl bg-v2-lime text-v2-navy transition-[filter] hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-blue disabled:opacity-50"
            >
              <SendIcon size={20} />
            </button>
          </form>
        </section>

        <aside aria-label="Recent chats" className="min-w-0">
          <SectionCard title="Recent chats" icon={<ClockIcon size={16} className="text-v2-muted" />}>
            <ul className="-my-1 divide-y divide-v2-line/60">
              {ASSISTANT_RECENT_CHATS.map((c) => (
                <li key={c.title}>
                  <button
                    type="button"
                    onClick={() => toast({ title: "Chat history is coming soon", description: c.title })}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg py-3 text-left transition-colors",
                      "hover:bg-paper-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-blue sm:px-2",
                    )}
                  >
                    <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-v2-blue-soft text-v2-blue-ink">
                      <ChatIcon size={17} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ink">{c.title}</span>
                    <span className="flex-none text-[12.5px] text-v2-muted">{c.date}</span>
                  </button>
                </li>
              ))}
            </ul>
          </SectionCard>
        </aside>
      </div>
    </div>
  );
}

/** An assistant bubble with the sparkle avatar. */
function AiRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 h-9 w-9 flex-none overflow-hidden rounded-full bg-v2-lime-soft">
        <Image src="/v2/app/mascot-wave-laptop.png" alt="" width={72} height={72} className="h-full w-full object-cover object-[50%_18%]" />
      </span>
      <div className="max-w-[88%] rounded-2xl rounded-tl-md bg-paper-2 px-4 py-3 text-[14.5px] leading-relaxed text-ink sm:max-w-[75%]">
        {children}
      </div>
    </div>
  );
}
