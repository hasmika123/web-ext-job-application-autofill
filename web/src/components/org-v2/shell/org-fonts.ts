import { Caveat, Plus_Jakarta_Sans } from "next/font/google";

// Same display + handwriting faces as the marketing group. The CSS variables go on the `.theme-v2` wrapper the org layouts
// render, so they only reach the `/org` routes. One module, so the console layout and the create-flow layout share them.
const jakarta = Plus_Jakarta_Sans({
  weight: ["700", "800"],
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

const caveat = Caveat({
  weight: "600",
  subsets: ["latin"],
  variable: "--font-caveat",
  display: "swap",
});

/** The className for the `.theme-v2` wrapper of an org layout. */
export const ORG_THEME_CLASS = `theme-v2 ${jakarta.variable} ${caveat.variable} flex flex-1 flex-col`;
