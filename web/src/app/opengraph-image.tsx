import { ImageResponse } from "next/og";

// File-based metadata: Next serves this as the site's OpenGraph/Twitter card.
export const alt = "Kiwiply — Find jobs. Apply faster. Get hired.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "76px 80px",
          // v2 palette: navy canvas, lime accents (theme-v2.css tokens, written out because next/og is self-contained).
          background: "linear-gradient(165deg, #0F1340 0%, #1B1F5E 65%, #232A86 130%)",
          color: "#FFFFFF",
          fontFamily: "sans-serif",
        }}
      >
        {/* Brand lockup: kiwi mark + two-tone wordmark */}
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              display: "flex",
              width: 76,
              height: 76,
              borderRadius: 9999,
              background: "#E9FBD9",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                display: "flex",
                width: 52,
                height: 52,
                borderRadius: 9999,
                background: "#84E33D",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {/* Inline SVG check — avoids a dynamic font fetch for the ✓ glyph. */}
              <svg width="30" height="30" viewBox="0 0 64 64">
                <path
                  d="M20 33 l8 8 16-18"
                  fill="none"
                  stroke="#1B1F5E"
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>
          <div style={{ display: "flex", fontSize: 46, fontWeight: 700 }}>
            <div style={{ color: "#84E33D" }}>kiwi</div>
            <div style={{ color: "#FFFFFF" }}>ply</div>
          </div>
        </div>

        {/* Headline + subcopy */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: 76,
              fontWeight: 700,
              lineHeight: 1.04,
              letterSpacing: "-0.02em",
              maxWidth: 920,
            }}
          >
            Find jobs. Apply faster. Get hired.
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 26,
              fontSize: 30,
              lineHeight: 1.4,
              color: "rgba(255,255,255,0.82)",
              maxWidth: 860,
            }}
          >
            Matches you with roles, fills applications for you to review, and tracks replies in your Gmail. One profile, one board, no auto-submit.
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            fontSize: 24,
            color: "rgba(255,255,255,0.72)",
          }}
        >
          <div style={{ display: "flex", color: "#84E33D", fontWeight: 600 }}>kiwiply.com</div>
          <div style={{ display: "flex", width: 5, height: 5, borderRadius: 9999, background: "rgba(255,255,255,0.5)" }} />
          <div style={{ display: "flex" }}>Browser extension + web app</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
