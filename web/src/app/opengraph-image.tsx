import { ImageResponse } from "next/og";

// File-based metadata: Next serves this as the site's OpenGraph/Twitter card.
export const alt = "Kiwiply — one profile, every application";
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
          // Charcoal hero gradient (--hero-bg); kiwi green stays reserved for accents.
          background: "linear-gradient(165deg, #2D3133 0%, #2F3330 60%, #37322B 130%)",
          color: "#FBFAF6",
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
              background: "#986A35",
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
                background: "#94BD37",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {/* Inline SVG check — avoids a dynamic font fetch for the ✓ glyph. */}
              <svg width="30" height="30" viewBox="0 0 64 64">
                <path
                  d="M20 33 l8 8 16-18"
                  fill="none"
                  stroke="#2D3133"
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>
          <div style={{ display: "flex", fontSize: 46, fontWeight: 700 }}>
            <div style={{ color: "#94BD37" }}>kiwi</div>
            <div style={{ color: "#FBFAF6" }}>ply</div>
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
            One profile, every application.
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 26,
              fontSize: 30,
              lineHeight: 1.4,
              color: "rgba(251,250,246,0.8)",
              maxWidth: 860,
            }}
          >
            Autofill job applications, manage your resumes, and track every application in one place.
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            fontSize: 24,
            color: "rgba(251,250,246,0.7)",
          }}
        >
          <div style={{ display: "flex", color: "#B7D283", fontWeight: 600 }}>kiwiply.com</div>
          <div style={{ display: "flex", width: 5, height: 5, borderRadius: 9999, background: "rgba(251,250,246,0.5)" }} />
          <div style={{ display: "flex" }}>Browser extension + web app</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
