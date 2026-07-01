import "./engine"; // builds window.JAF (side-effect) before the UI uses it
import { createRoot } from "react-dom/client";
import { ToastProvider } from "@kiwiply/ui";
import { SidePanelApp } from "./App";
import { initTheme } from "../../lib/theme";
import { onContextInvalidated } from "../../lib/ext-context";
import { closePanel } from "../../lib/panel-frame";
// Bundle the brand fonts (latin subset only) so headings render in Fraunces + body in Inter,
// exactly like the web app — instead of the Georgia/system fallback. Registers "Inter"/"Fraunces",
// which style.css's @theme override points --font-body/--font-display at.
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import "@fontsource/fraunces/latin-600.css";
import "@fontsource/fraunces/latin-700.css";
import "./style.css";

initTheme(); // apply Light/System/Dark on <html> before render (+ live OS/cross-surface sync)
// If the extension is reloaded/updated while this drawer iframe is open, its chrome.* context dies
// and the next call throws "Extension context invalidated". Swallow that and remove the now-dead
// drawer — reopening from the toolbar injects a fresh one bound to the live context.
onContextInvalidated(() => closePanel());
// ToastProvider gives the shared ResumeUpload a real toast surface here (W5.4 — the surface
// W3 deferred). Its fixed bottom-center stack renders above the panel content.
createRoot(document.getElementById("root")!).render(
  <ToastProvider>
    <SidePanelApp />
  </ToastProvider>,
);
