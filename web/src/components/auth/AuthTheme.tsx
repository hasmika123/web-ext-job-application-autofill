import type { ReactNode } from "react";
import { Caveat, Plus_Jakarta_Sans } from "next/font/google";

// Same two faces the marketing group loads ("Kiwiply Bright"). The CSS variables sit on the
// wrapper below, so they are scoped to the auth screens (they have no route-group layout).
const jakarta = Plus_Jakarta_Sans({
  weight: ["500", "600", "700", "800"],
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

/**
 * Wraps every auth page (login, signup, forgot/reset password) in `.theme-v2` + the Jakarta /
 * Caveat font variables. Server component: pages (or `AuthCardShell`) render it around the
 * client auth screen. The whole screen is set in Jakarta (the boards use it for labels too).
 */
export default function AuthTheme({ children }: { children: ReactNode }) {
  return (
    <div className={`theme-v2 ${jakarta.variable} ${caveat.variable} flex flex-1 flex-col font-display`}>
      {children}
    </div>
  );
}
