"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MonitorIcon, PhoneIcon, Tooltip, cn, tenantThemeCss } from "@kiwiply/ui";
import BrandedLogin from "@/components/ent/login/BrandedLogin";

/**
 * The live preview of the REAL BrandedLogin (X2.18). The component is rendered inside an iframe (`/preview/login`, below) so
 * its responsive breakpoints see the frame's width, not the editor's: 390 px shows the phone layout, 1280 px the two-panel
 * desktop one, whatever the editor's window is. The editor posts the draft values to the frame on every change; the frame
 * answers `ready` when it mounts so the first paint is not the published look. Messages are accepted from the same origin only.
 */
export const PREVIEW_MESSAGE = "kiwiply:branding-preview";
export const PREVIEW_READY = "kiwiply:branding-preview-ready";

export interface PreviewLoginProps {
  name: string;
  logoUrl: string | null;
  welcomeTitle: string | null;
  welcomeMessage: string | null;
  supportEmail: string | null;
  featureChips: string[];
  microsoft: boolean;
}

export interface PreviewPayload {
  type: typeof PREVIEW_MESSAGE;
  props: PreviewLoginProps;
  primary: string;
  secondary: string;
}

export type Device = "desktop" | "phone";
/** Logical widths of the two devices the preview shows. */
export const DEVICE_SIZE: Record<Device, { w: number; h: number }> = { desktop: { w: 1280, h: 820 }, phone: { w: 390, h: 800 } };

/** A message from the editor is believed only when it is ours, from this origin, and well formed. */
export function parsePreviewMessage(ev: { origin: string; data: unknown }, ownOrigin: string): PreviewPayload | null {
  if (ev.origin !== ownOrigin) return null;
  const d = ev.data as Partial<PreviewPayload> | null;
  if (!d || d.type !== PREVIEW_MESSAGE || !d.props || typeof d.props.name !== "string") return null;
  if (typeof d.primary !== "string" || typeof d.secondary !== "string") return null;
  return d as PreviewPayload;
}

/* ── the page inside the frame ─────────────────────────────────────────────────── */

export function LoginPreviewFrame({ initial }: { initial: PreviewPayload }) {
  const [state, setState] = useState<PreviewPayload>(initial);
  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      const next = parsePreviewMessage(ev, window.location.origin);
      if (next) setState(next);
    };
    window.addEventListener("message", onMessage);
    if (window.parent !== window) window.parent.postMessage({ type: PREVIEW_READY }, window.location.origin);
    return () => window.removeEventListener("message", onMessage);
  }, []);
  const { props } = state;
  return (
    <div data-preview-root className="theme-tenant" data-testid="login-preview-frame">
      <style dangerouslySetInnerHTML={{ __html: tenantThemeCss("[data-preview-root]", state.primary, state.secondary) }} />
      {/* inert: the preview is for looking, a click must never sign anyone in */}
      <div inert>
        <BrandedLogin
          name={props.name}
          logoUrl={props.logoUrl}
          welcomeTitle={props.welcomeTitle}
          welcomeMessage={props.welcomeMessage}
          supportEmail={props.supportEmail}
          featureChips={props.featureChips}
          microsoft={props.microsoft}
        />
      </div>
    </div>
  );
}

/* ── the editor's side ─────────────────────────────────────────────────────────── */

export default function LoginPreview({
  payload,
  src = "/preview/login",
  initialDevice = "desktop",
  className,
}: {
  payload: PreviewPayload;
  src?: string;
  initialDevice?: Device;
  className?: string;
}) {
  const [device, setDevice] = useState<Device>(initialDevice);
  const frame = useRef<HTMLIFrameElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const latest = useRef(payload);

  const post = useCallback(() => {
    frame.current?.contentWindow?.postMessage(latest.current, window.location.origin);
  }, []);

  useEffect(() => {
    latest.current = payload;
    post();
  }, [payload, post]);

  useEffect(() => {
    const onReady = (ev: MessageEvent) => {
      if (ev.origin === window.location.origin && (ev.data as { type?: string } | null)?.type === PREVIEW_READY) post();
    };
    window.addEventListener("message", onReady);
    return () => window.removeEventListener("message", onReady);
  }, [post]);

  // The frame keeps its logical size; the box scales it down to fit the column (never up).
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setScale(Math.min(1, el.clientWidth / DEVICE_SIZE[device].w || 1));
    fit();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [device]);

  const size = DEVICE_SIZE[device];
  return (
    <section aria-label="Live preview of the sign-in page" className={cn("flex min-w-0 flex-col gap-3", className)} data-preview-device={device}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink">Live preview</h2>
        <div role="group" aria-label="Preview device" className="inline-flex rounded-full border border-line bg-paper p-0.5">
          {(["desktop", "phone"] as const).map((d) => (
            <Tooltip key={d} content={d === "desktop" ? "Desktop preview" : "Phone preview"}>
              <button
                type="button"
                aria-label={d === "desktop" ? "Desktop preview" : "Phone preview"}
                aria-pressed={device === d}
                onClick={() => setDevice(d)}
                className={cn(
                  "inline-flex h-9 w-9 items-center justify-center rounded-full text-muted outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:h-8 sm:w-8",
                  device === d && "bg-accent text-on-accent",
                )}
              >
                {d === "desktop" ? <MonitorIcon className="h-4 w-4" /> : <PhoneIcon className="h-4 w-4" />}
              </button>
            </Tooltip>
          ))}
        </div>
      </div>
      <div ref={box} className="overflow-hidden rounded-[var(--radius-lg)] border border-line bg-paper-2" style={{ height: size.h * scale }}>
        <iframe
          ref={frame}
          title="Sign-in page preview"
          src={src}
          onLoad={post}
          tabIndex={-1}
          style={{ width: size.w, height: size.h, transform: `scale(${scale})`, transformOrigin: "top left", border: 0 }}
        />
      </div>
      <p className="text-xs text-muted">This is the real sign-in page drawn from your draft. Nothing you see here is live until you publish.</p>
    </section>
  );
}
