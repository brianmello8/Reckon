import type { Metadata } from "next";

export const SITE_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://getreckon.dev";

export const SITE_NAME = "Reckon";
export const TWITTER_HANDLE = "@Reckon_App";
export const SITE_TAGLINE = "Know exactly where your AI spend is going";
export const SITE_DESCRIPTION =
  "Per-developer attribution for Anthropic, OpenAI, and Copilot. Anomaly alerts in Slack. Read-only — never sees your prompts.";

/**
 * Per-page metadata helper. Sets a canonical URL plus page-specific
 * Open Graph and Twitter fields (Next replaces, not deep-merges, openGraph
 * across segments — so we re-supply the shared fields here). The site-wide
 * OG image comes from the file-convention opengraph-image route.
 */
export function pageMetadata({
  title,
  description,
  path,
  absoluteTitle,
}: {
  title: string;
  description: string;
  path: string;
  /** Use the title verbatim (bypass the "%s · Reckon" template). */
  absoluteTitle?: boolean;
}): Metadata {
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      locale: "en_US",
      url: path,
      title: absoluteTitle ? title : `${title} · ${SITE_NAME}`,
      description,
    },
    twitter: {
      card: "summary_large_image",
      site: TWITTER_HANDLE,
      creator: TWITTER_HANDLE,
      title: absoluteTitle ? title : `${title} · ${SITE_NAME}`,
      description,
    },
  };
}
