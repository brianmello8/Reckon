import { ImageResponse } from "next/og";
import { SITE_TAGLINE } from "@/lib/seo";

export const runtime = "edge";
export const alt = "Reckon — Know exactly where your AI spend is going";
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
          background: "#1a2540",
          padding: 80,
          fontFamily: "sans-serif",
        }}
      >
        {/* top: wordmark + read-only pill */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 16,
                background: "#c2742e",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {/* spike glyph */}
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
                <path
                  d="M2 16 L7 16 L10 9 L13.5 19 L16 7 L18.5 14 L22 14"
                  stroke="#ffffff"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <span style={{ color: "#ffffff", fontSize: 40, fontWeight: 700, letterSpacing: -1 }}>
              Reckon
            </span>
          </div>
          <span
            style={{
              color: "#e9cdb4",
              fontSize: 24,
              padding: "10px 20px",
              border: "1px solid #c2742e",
              borderRadius: 999,
            }}
          >
            Read-only · never sees your prompts
          </span>
        </div>

        {/* headline */}
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <span
            style={{
              color: "#ffffff",
              fontSize: 76,
              fontWeight: 600,
              lineHeight: 1.05,
              letterSpacing: -2,
              maxWidth: 980,
            }}
          >
            {SITE_TAGLINE}.
          </span>
          <span style={{ color: "#b6bccb", fontSize: 30, maxWidth: 900 }}>
            Per-developer AI spend for Anthropic, OpenAI &amp; Copilot — with
            anomaly alerts in Slack.
          </span>
        </div>

        {/* bottom: provider dots */}
        <div style={{ display: "flex", alignItems: "center", gap: 28, color: "#8a91a3", fontSize: 24 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 14, height: 14, borderRadius: 7, background: "#c75c39" }} /> Anthropic
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 14, height: 14, borderRadius: 7, background: "#109b81" }} /> OpenAI
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 14, height: 14, borderRadius: 7, background: "#5b5bd6" }} /> Copilot
          </span>
          <span style={{ marginLeft: "auto", color: "#626a7d" }}>getreckon.dev</span>
        </div>
      </div>
    ),
    { ...size }
  );
}
