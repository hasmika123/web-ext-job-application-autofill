import "./engine"; // builds window.JAF (side-effect) before the UI uses it
import { createRoot } from "react-dom/client";
import { OptionsApp } from "./OptionsApp";
import { initTheme } from "../../lib/theme";
// Brand fonts (latin subset) — see panel/main.tsx. Registers "Inter"/"Fraunces" for the
// @theme override in style.css so this page matches the drawer + web app typography.
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import "@fontsource/fraunces/latin-600.css";
import "@fontsource/fraunces/latin-700.css";
import "./style.css";

initTheme(); // apply Light/System/Dark on <html> before render (+ live OS/cross-surface sync)
createRoot(document.getElementById("root")!).render(<OptionsApp />);
