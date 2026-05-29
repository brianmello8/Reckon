import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Reckon — AI spend observability",
    short_name: "Reckon",
    description:
      "Per-developer attribution for Anthropic, OpenAI, and Copilot. Anomaly alerts in Slack.",
    start_url: "/",
    display: "browser",
    background_color: "#f6f4ef",
    theme_color: "#c2742e",
    icons: [
      {
        src: "/reckon-icon.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/reckon-icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
