import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://getreckon.dev";
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/dashboard", "/developers", "/providers", "/anomalies", "/integrations", "/settings", "/billing", "/api/", "/onboarding"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
