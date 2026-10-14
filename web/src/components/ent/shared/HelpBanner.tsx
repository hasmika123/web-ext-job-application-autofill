"use client";

import { useSyncExternalStore } from "react";
import { ChevronRightIcon, SparklesIcon, XIcon, cn } from "@kiwiply/ui";
import { ClaimsMascot, openHelpPanel } from "@/components/ent/shell/ShellContext";
import { EnterpriseMascot } from "@/lib/ent/mascot";

/**
 * The boards' "Need help with ...?" card (Teams, Departments, Roles & Permissions, Consultants): a soft room scene with the bee, the
 * question, one line of offer and the "Ask a question..." button. Three layouts, one per board:
 *   stacked - scene on top, text under it (Teams, Roles)
 *   side    - scene left, text right (Departments)
 *   drawer  - small scene left, text right, the button full width under both (Consultants drawer)
 * The bee is the page's one mascot (it tells the shell). The X hides the card for this browser (`localStorage`), never for the account.
 */
const EVENT = "kiwiply:help-card";

export type HelpBannerLayout = "stacked" | "side" | "drawer";

export default function HelpBanner({
  topic,
  title,
  text,
  layout = "stacked",
  onAsk,
  dismissible = true,
  className,
}: {
  /** Key for the hide flag and the accessible name ("Teams"). */
  topic: string;
  /** The heading; default `Need help with {topic}?`. */
  title?: string;
  text: string;
  layout?: HelpBannerLayout;
  /** Default: opens the shell's help panel. */
  onAsk?: () => void;
  dismissible?: boolean;
  className?: string;
}) {
  const key = `kiwiply.ent.help-card.${topic.toLowerCase()}`;
  const hidden = useSyncExternalStore(
    (cb) => {
      window.addEventListener(EVENT, cb);
      return () => window.removeEventListener(EVENT, cb);
    },
    () => {
      try {
        return window.localStorage.getItem(key) === "off";
      } catch {
        return false;
      }
    },
    () => false,
  );
  if (hidden) return null;
  const close = () => {
    try {
      window.localStorage.setItem(key, "off");
    } catch {
      /* storage blocked: the card comes back on reload */
    }
    window.dispatchEvent(new Event(EVENT));
  };
  const heading = title ?? `Need help with ${topic}?`;
  const ask = (
    <button type="button" onClick={onAsk ?? openHelpPanel} data-help-ask className="ent-help-ask">
      <SparklesIcon size={16} aria-hidden className="flex-none" />
      <span className="min-w-0 flex-1 truncate text-left">Ask a question...</span>
      <ChevronRightIcon size={16} aria-hidden className="flex-none" />
    </button>
  );
  const x = dismissible ? (
    <button type="button" onClick={close} aria-label="Hide this card" title="Hide" className="ent-help-close">
      <XIcon size={14} />
    </button>
  ) : null;

  return (
    <section aria-label={`Need help with ${topic}?`} data-help-card={topic} data-layout={layout} className={cn("ent-card ent-help relative overflow-hidden", className)}>
      <ClaimsMascot />
      {layout === "stacked" ? (
        <>
          <div className="ent-bee-scene ent-help-scene">
            <EnterpriseMascot pose="greet" size="lg" className="ent-help-bee" />
          </div>
          {x}
          <div className="ent-help-body">
            <h2 className="ent-help-title">{heading}</h2>
            <p className="ent-help-text">{text}</p>
            {ask}
          </div>
        </>
      ) : (
        <div className="ent-help-row">
          <div className="ent-bee-scene ent-help-scene">
            <EnterpriseMascot pose="greet" size={layout === "drawer" ? "md" : "lg"} className="ent-help-bee" />
          </div>
          <div className="ent-help-body min-w-0">
            <h2 className="ent-help-title pr-6">{heading}</h2>
            <p className="ent-help-text">{text}</p>
            {layout === "side" ? ask : null}
          </div>
          {x}
          {layout === "drawer" ? <div className="ent-help-foot">{ask}</div> : null}
        </div>
      )}
    </section>
  );
}
