"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftIcon, SendIcon, cn } from "@kiwiply/ui";
import { CompanyTile, InitialsAvatar, SearchInput } from "../../app-v2/common";
import { HeroBand } from "@/components/app-v2/common";
import { CONVERSATIONS, MESSAGES_NOTE, type ChatMessage, type Conversation } from "../sample-data";

/**
 * Messages (APP-V3-SPEC 2.9). Two panes from `md` up: the conversation list and the open thread.
 * Below `md` they stack: the list shows first and tapping a conversation opens the thread with a
 * back button. All client state over sample data; sending only appends to the local thread.
 */
export default function MessagesPage() {
  const [convos, setConvos] = useState<Conversation[]>(CONVERSATIONS);
  const [selectedId, setSelectedId] = useState(CONVERSATIONS[0].id);
  // Phones only: which pane is showing. The desktop layout always shows both.
  const [view, setView] = useState<"list" | "thread">("list");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);

  const selected = convos.find((c) => c.id === selectedId) ?? convos[0];
  const unreadCount = convos.filter((c) => c.unread).length;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return convos;
    return convos.filter((c) => `${c.name} ${c.company} ${c.preview}`.toLowerCase().includes(q));
  }, [convos, query]);

  // Keep the newest bubble in view inside the thread (scrolls the pane, never the page).
  useEffect(() => {
    const el = endRef.current?.parentElement;
    if (el) el.scrollTop = el.scrollHeight;
  }, [selected.messages.length, selectedId, view]);

  const open = (id: string) => {
    setSelectedId(id);
    setView("thread");
    setConvos((list) => list.map((c) => (c.id === id ? { ...c, unread: false } : c)));
  };

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    const msg: ChatMessage = { id: `me-${nextId.current++}`, from: "me", text, time: "Just now" };
    setConvos((list) =>
      list.map((c) => (c.id === selected.id ? { ...c, messages: [...c.messages, msg], preview: text, ago: "Just now" } : c)),
    );
    setDraft("");
  };

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5">
      <HeroBand
        title="Messages"
        subtitle="Communication with recruiters and hiring teams."
        mascot="mascot-heart"
        note="Say hello!"
      />

      <div className="grid h-[min(660px,calc(100dvh-13rem))] min-h-[460px] overflow-hidden rounded-2xl border border-v2-line/70 bg-paper shadow-v2-soft grid-cols-[minmax(0,1fr)] md:grid-cols-[340px_minmax(0,1fr)]">
        {/* Conversation list */}
        <section
          aria-label="Conversations"
          className={cn("min-h-0 flex-col border-v2-line/70 md:flex md:border-r", view === "thread" ? "hidden" : "flex")}
        >
          <div className="border-b border-v2-line/70 p-3">
            <SearchInput
              variant="grey"
              size="sm"
              placeholder="Search messages..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <p className="sr-only" aria-live="polite">
              {unreadCount} unread conversation{unreadCount === 1 ? "" : "s"}
            </p>
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {filtered.length === 0 && <li className="p-6 text-center text-[14px] text-ink-soft">No conversations match.</li>}
            {filtered.map((c) => {
              const on = c.id === selected.id;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => open(c.id)}
                    aria-current={on ? "true" : undefined}
                    className={cn(
                      "flex w-full items-start gap-3 border-b border-v2-line/50 px-4 py-3.5 text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-v2-blue",
                      on ? "bg-v2-blue-soft/60" : "hover:bg-paper-2",
                    )}
                  >
                    <Avatar convo={c} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className={cn("truncate text-[14px] text-ink", c.unread ? "font-extrabold" : "font-bold")}>
                          {c.name}
                        </span>
                        <span className="flex-none text-[12px] text-v2-muted">{c.ago}</span>
                      </span>
                      <span className="block truncate text-[12.5px] font-semibold text-ink-soft">
                        {c.listRole ? `${c.company} · ${c.listRole}` : c.company}
                      </span>
                      <span className="mt-0.5 flex items-center gap-2">
                        <span className={cn("block min-w-0 flex-1 truncate text-[13px]", c.unread ? "text-ink" : "text-v2-muted")}>
                          {c.preview}
                        </span>
                        {c.unread && (
                          <span className="h-2.5 w-2.5 flex-none rounded-full bg-v2-coral" role="img" aria-label="Unread" />
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Thread */}
        <section
          aria-label={`Conversation with ${selected.name}`}
          className={cn("min-h-0 min-w-0 flex-col md:flex", view === "list" ? "hidden" : "flex")}
        >
          <header className="flex items-center gap-3 border-b border-v2-line/70 px-3 py-3 sm:px-5">
            <button
              type="button"
              onClick={() => setView("list")}
              aria-label="Back to conversations"
              className="inline-flex h-9 w-9 flex-none items-center justify-center rounded-lg text-ink hover:bg-paper-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-blue md:hidden"
            >
              <ArrowLeftIcon size={18} />
            </button>
            <Avatar convo={selected} />
            <div className="min-w-0">
              <h2 className="truncate font-display text-[16px] font-bold leading-tight text-ink">{selected.name}</h2>
              <p className="truncate text-[13px] text-ink-soft">{selected.role}</p>
            </div>
          </header>

          <div role="log" aria-label="Messages" className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4 sm:p-5">
            {selected.messages.map((m) => (
              <div key={m.id} className={cn("flex flex-col", m.from === "me" ? "items-end" : "items-start")}>
                <p
                  className={cn(
                    "max-w-[88%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-[14.5px] leading-relaxed sm:max-w-[75%]",
                    m.from === "me" ? "rounded-br-md bg-v2-lime text-v2-navy" : "rounded-bl-md bg-paper-2 text-ink",
                  )}
                >
                  {m.text}
                </p>
                <span className="mt-1 px-1 text-[11.5px] text-v2-muted">{m.time}</span>
              </div>
            ))}
            <div ref={endRef} />
          </div>

          <div className="border-t border-v2-line/70 p-3 sm:p-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
              className="flex items-center gap-2"
            >
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Type a message..."
                aria-label={`Message ${selected.name}`}
                className="h-11 min-w-0 flex-1 rounded-xl border border-v2-line bg-paper-2 px-4 text-[15px] text-ink outline-none placeholder:text-v2-muted focus:border-v2-blue focus:bg-paper focus-visible:ring-2 focus-visible:ring-v2-blue/25"
              />
              <button
                type="submit"
                disabled={!draft.trim()}
                aria-label="Send message"
                className="inline-flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-v2-lime text-v2-navy transition-[filter] hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-blue disabled:opacity-50"
              >
                <SendIcon size={19} />
              </button>
            </form>
            <p className="mt-2 text-center text-[12px] text-v2-muted">{MESSAGES_NOTE}</p>
          </div>
        </section>
      </div>
    </div>
  );
}

/** Person avatar with the company tile tucked in the corner. */
function Avatar({ convo }: { convo: Conversation }) {
  return (
    <span className="relative flex-none">
      <InitialsAvatar name={convo.name} size={40} />
      <CompanyTile
        name={convo.company}
        size={18}
        className="absolute -bottom-1 -right-1 rounded-md border-2 border-paper"
      />
    </span>
  );
}
