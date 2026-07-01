/**
 * Panel root — the extension's floating drawer. The toolbar icon injects THIS page as an on-page
 * iframe overlay (see background.ts), so it hosts both the home surface and the resume-review flow:
 *
 *   home   → the default view (resume picker → scan & fill, save-a-job, account status).
 *   review → the shared @kiwiply/ui <ResumeUpload> form, shown when the user uploads a resume
 *            from home. The File is handed over in memory (no cross-document storage handoff),
 *            and finishing (save or cancel) returns to home — the drawer stays open throughout.
 */
import { useState } from "react";
import { ResumeUpload, useToast, type ResumeToast } from "@kiwiply/ui";
import { HomeView } from "./HomeView";
import { makeServices, type Handoff } from "./services";

type State = { status: "home" } | { status: "review"; handoff: Handoff };

export function SidePanelApp() {
  const [state, setState] = useState<State>({ status: "home" });
  const toast = useToast();

  if (state.status === "review") {
    const isAttach = state.handoff.mode === "attach";
    const finish = () => setState({ status: "home" });
    // embedded: the form renders its own review overlay + parses `initialFile` on mount.
    return (
      <div className="kiwi-fade-in min-h-screen bg-app-bg">
        <ResumeUpload
          embedded
          initialFile={state.handoff.file}
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
      </div>
    );
  }

  return <HomeView onReview={(handoff) => setState({ status: "review", handoff })} />;
}
