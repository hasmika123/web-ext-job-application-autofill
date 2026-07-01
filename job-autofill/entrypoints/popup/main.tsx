import "./engine"; // builds window.JAF (side-effect) before the UI uses it
import { createRoot } from "react-dom/client";
import { PopupApp } from "./PopupApp";
import { initTheme } from "../../lib/theme";
import "./style.css";

initTheme(); // apply Light/System/Dark on <html> before render (+ live OS/cross-surface sync)
createRoot(document.getElementById("root")!).render(<PopupApp />);
