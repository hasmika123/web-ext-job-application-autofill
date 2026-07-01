import "./engine"; // builds window.JAF (side-effect) before the UI uses it
import { createRoot } from "react-dom/client";
import { ToastProvider } from "@kiwiply/ui";
import { SidePanelApp } from "./App";
import { initTheme } from "../../lib/theme";
import "./style.css";

initTheme(); // apply Light/System/Dark on <html> before render (+ live OS/cross-surface sync)
// ToastProvider gives the shared ResumeUpload a real toast surface here (W5.4 — the surface
// W3 deferred). Its fixed bottom-center stack renders above the panel content.
createRoot(document.getElementById("root")!).render(
  <ToastProvider>
    <SidePanelApp />
  </ToastProvider>,
);
