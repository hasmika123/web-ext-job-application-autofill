import "./engine"; // builds window.JAF (side-effect) before the UI uses it
import { createRoot } from "react-dom/client";
import { OptionsApp } from "./OptionsApp";
import "./style.css";

createRoot(document.getElementById("root")!).render(<OptionsApp />);
