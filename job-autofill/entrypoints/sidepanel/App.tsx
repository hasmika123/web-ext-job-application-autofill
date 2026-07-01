/**
 * Side panel root (W3.2–W3.5; polished W5.4). Reads the popup handoff and mounts the SHARED
 * @kiwiply/ui <ResumeUpload> with the extension's services (save + attach). Owns the panel-level
 * states: loading → ready (the form) → done, plus empty (opened with no handoff) and error.
 *
 * W5.4: mode-aware primary copy (attach vs save), a real toast surface (via ToastProvider in
 * main.tsx), and design-system state screens (EmptyState/Spinner).
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ResumeUpload, EmptyState, Spinner, useToast, type ResumeToast } from "@kiwiply/ui";
import { BrandLogo } from "../../lib/Brand";
import { readHandoff, cleanup, makeServices, type Handoff } from "./panel";

type State =
  | { status: "loading" }
  | { status: "empty" }
  | { status: "error"; message: string }
  | { status: "ready"; handoff: Handoff }
  | { status: "done"; saved: boolean };

export function SidePanelApp() {
  const [state, setState] = useState<State>({ status: "loading" });
  const toast = useToast();
  // Set by the form's onSaved (fires before onClose) so the "done" view can confirm success
  // vs a plain cancel. A ref (not state) because it's read synchronously inside onClose.
  const savedRef = useRef(false);

  useEffect(() => {
    let alive = true;
    // The popup opens the panel THEN writes the handoff (MV3 gesture), so it may not be present
    // on mount. load() only promotes to "ready" when found; storage.onChanged catches the handoff
    // when it lands (and any later re-upload); a timeout falls back to "empty".
    const load = () => {
      readHandoff()
        .then((h) => {
          if (alive && h) {
            savedRef.current = false;
            setState({ status: "ready", handoff: h });
          }
        })
        .catch(() => {
          if (alive) setState({ status: "error", message: "Couldn't read that upload. Try again from the popup." });
        });
    };
    load();
    const onChange = (changes: { [k: string]: chrome.storage.StorageChange }, area: string) => {
      if (area === "local" && changes.pendingResumeReview?.newValue) load();
    };
    chrome.storage.onChanged.addListener(onChange);
    const t = setTimeout(() => {
      if (alive) setState((s) => (s.status === "loading" ? { status: "empty" } : s));
    }, 4000);
    return () => {
      alive = false;
      chrome.storage.onChanged.removeListener(onChange);
      clearTimeout(t);
    };
  }, []);

  if (state.status === "ready") {
    const isAttach = state.handoff.mode === "attach";
    const finish = () => {
      const saved = savedRef.current;
      void cleanup();
      setState({ status: "done", saved });
      try {
        window.close();
      } catch {
        /* side panels may not close programmatically — the "done" view covers that */
      }
    };
    // embedded: the form renders its own review overlay + parses `initialFile` on mount.
    return (
      <ResumeUpload
        embedded
        initialFile={state.handoff.file}
        onSaved={() => {
          savedRef.current = true;
        }}
        onClose={finish}
        {...makeServices(state.handoff)}
        toast={(t: ResumeToast) => toast({ title: t.title, description: t.description, variant: t.variant })}
        saveLabel={isAttach ? "Fill page & attach" : "Save to my account"}
        savedToast={
          isAttach
            ? { variant: "success", title: "Filling this page…", description: "Attaching your PDF to the application." }
            : undefined
        }
      />
    );
  }

  return (
    <Shell>
      <div key={state.status} className="kiwi-fade-in">
      {state.status === "loading" && (
        <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
          <Spinner className="h-6 w-6 text-accent-deep" />
          <p className="text-sm text-muted">Loading&hellip;</p>
        </div>
      )}
      {state.status === "empty" && (
        <EmptyState
          icon={<InboxIcon />}
          title="Nothing to review here"
          description={
            <>
              Open this from the extension popup&rsquo;s <b className="text-ink">&ldquo;Upload a resume&rdquo;</b> to parse and review a file.
            </>
          }
        />
      )}
      {state.status === "error" && (
        <EmptyState icon={<AlertIcon />} title="That didn’t work" description={<span className="text-danger">{state.message}</span>} />
      )}
      {state.status === "done" && (
        <EmptyState
          icon={<CheckIcon />}
          title={state.saved ? "All set" : "Closed"}
          description={state.saved ? "You can close this panel." : "Nothing was saved — you can close this panel."}
        />
      )}
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-app-bg p-5 font-body text-ink">
      <header className="mb-5 flex items-center justify-between">
        <BrandLogo height={24} />
        <span className="text-[11px] font-bold uppercase tracking-[.1em] text-muted">Review</span>
      </header>
      {children}
    </div>
  );
}

function InboxIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8" aria-hidden>
      <path d="M3 13h4l1.5 2.5h7L17 13h4M5 5h14l2 8v4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-4l2-8Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8" aria-hidden>
      <path d="M12 9v4m0 3.5h.01M10.3 4.3 3 17a1.9 1.9 0 0 0 1.7 2.8h14.6A1.9 1.9 0 0 0 21 17L13.7 4.3a1.9 1.9 0 0 0-3.4 0Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6 text-accent-deep" aria-hidden>
      <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
