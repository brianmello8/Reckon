import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// Clerk loads its JS from the instance's Frontend API host: the production
// custom domain (clerk.getreckon.dev) and the dev domain (*.clerk.accounts.dev).
// Bot protection uses Cloudflare Turnstile (challenges.cloudflare.com).
const CLERK = "https://clerk.getreckon.dev https://*.clerk.accounts.dev https://*.clerk.com";
const TURNSTILE = "https://challenges.cloudflare.com";

const cspHeader = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${CLERK} ${TURNSTILE} https://js.stripe.com`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${CLERK} https://img.clerk.com`,
  "font-src 'self' data:",
  `connect-src 'self' ${CLERK} https://clerk-telemetry.com https://api.stripe.com https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://*.sentry.io`,
  `frame-src 'self' ${CLERK} ${TURNSTILE} https://js.stripe.com`,
  "worker-src 'self' blob:",
].join("; ");

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: cspHeader,
          },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  widenClientFileUpload: true,
  silent: !process.env.CI,
});
