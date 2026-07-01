/**
 * Side panel root (W3.2). Reads the popup handoff and mounts the SHARED @kiwiply/ui
 * <ResumeUpload> with the extension's services. The form parses the file, lets the user
 * review/edit, then saves to the account. (Attach-and-fill mode is wired in W3.3.)
 */
import { useEffect, useState, type ReactNode } from "react";
import { ResumeUpload } from "@kiwiply/ui";
import { readHandoff, cleanup, makeServices, type Handoff } from "./panel";

type State =
  | { status: "loading" }
  | { status: "empty" }
  | { status: "ready"; handoff: Handoff }
  | { status: "done" };

export function SidePanelApp() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let alive = true;
    // The popup opens the panel THEN writes the handoff (MV3 gesture), so it may not be present
    // yet on mount. load() only promotes to "ready" when found; storage.onChanged catches the
    // handoff when it lands (and any later re-upload); a timeout falls back to "empty".
    const load = () => {
      readHandoff().then((h) => {
        if (alive && h) setState({ status: "ready", handoff: h });
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
    const finish = () => {
      void cleanup();
      setState({ status: "done" });
      try {
        window.close();
      } catch {
        /* side panel may not close programmatically — the "done" view covers that */
      }
    };
    // embedded: the form renders its own review overlay; it parses `initialFile` on mount.
    return <ResumeUpload embedded initialFile={state.handoff.file} onClose={finish} {...makeServices(state.handoff)} />;
  }

  return (
    <Shell>
      {state.status === "loading" && <p className="text-sm text-muted">Loading…</p>}
      {state.status === "empty" && (
        <p className="text-sm text-muted">
          Nothing to review here. Open this from the extension popup&rsquo;s &ldquo;Upload a resume&rdquo;.
        </p>
      )}
      {state.status === "done" && <p className="text-sm text-muted">Done — you can close this panel.</p>}
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-app-bg p-6 font-body text-ink">
      <header className="mb-4 flex items-center gap-2">
        <img src="/icons/logo.png" alt="Kiwiply" className="h-7 w-7" />
        <h1 className="font-display text-xl font-semibold">Kiwiply</h1>
      </header>
      <div className="rounded-[var(--radius-lg)] border border-line bg-paper p-5 shadow-[var(--shadow)]">{children}</div>
    </div>
  );
}
