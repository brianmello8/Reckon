import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Server-only environment variables.
   * These are never exposed to the client bundle.
   */
  server: {
    // Database
    DATABASE_URL: z.string().url(),

    // Clerk
    CLERK_SECRET_KEY: z.string().min(1),

    // Stripe
    STRIPE_SECRET_KEY: z.string().min(1),
    STRIPE_WEBHOOK_SECRET: z.string().min(1),

    // AI Providers (for admin API access, not proxied)
    ANTHROPIC_ADMIN_API_KEY: z.string().min(1),
    OPENAI_ADMIN_API_KEY: z.string().min(1),
    GITHUB_APP_PRIVATE_KEY: z.string().min(1),
    GITHUB_APP_ID: z.string().min(1),

    // Slack
    SLACK_CLIENT_ID: z.string().min(1),
    SLACK_CLIENT_SECRET: z.string().min(1),
    SLACK_SIGNING_SECRET: z.string().min(1),

    // Linear
    LINEAR_API_KEY: z.string().min(1),
    LINEAR_OAUTH_CLIENT_ID: z.string().min(1),
    LINEAR_OAUTH_CLIENT_SECRET: z.string().min(1),

    // AWS KMS (envelope encryption for provider keys)
    AWS_KMS_KEY_ID: z.string().min(1),
    AWS_ACCESS_KEY_ID: z.string().min(1),
    AWS_SECRET_ACCESS_KEY: z.string().min(1),
    AWS_REGION: z.string().default("us-east-1"),

    // Resend (transactional email)
    RESEND_API_KEY: z.string().min(1),

    // Sentry
    SENTRY_DSN: z.string().url().optional(),

    // Inngest
    INNGEST_EVENT_KEY: z.string().min(1),
    INNGEST_SIGNING_KEY: z.string().min(1),
  },

  /**
   * Client-safe environment variables.
   * Must be prefixed with NEXT_PUBLIC_.
   */
  client: {
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
    NEXT_PUBLIC_APP_URL: z.string().url(),
  },

  /**
   * Runtime values — required for validation at build time.
   * Destructure from process.env so Next.js can inline them.
   */
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    ANTHROPIC_ADMIN_API_KEY: process.env.ANTHROPIC_ADMIN_API_KEY,
    OPENAI_ADMIN_API_KEY: process.env.OPENAI_ADMIN_API_KEY,
    GITHUB_APP_PRIVATE_KEY: process.env.GITHUB_APP_PRIVATE_KEY,
    GITHUB_APP_ID: process.env.GITHUB_APP_ID,
    SLACK_CLIENT_ID: process.env.SLACK_CLIENT_ID,
    SLACK_CLIENT_SECRET: process.env.SLACK_CLIENT_SECRET,
    SLACK_SIGNING_SECRET: process.env.SLACK_SIGNING_SECRET,
    LINEAR_API_KEY: process.env.LINEAR_API_KEY,
    LINEAR_OAUTH_CLIENT_ID: process.env.LINEAR_OAUTH_CLIENT_ID,
    LINEAR_OAUTH_CLIENT_SECRET: process.env.LINEAR_OAUTH_CLIENT_SECRET,
    AWS_KMS_KEY_ID: process.env.AWS_KMS_KEY_ID,
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
    AWS_REGION: process.env.AWS_REGION,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    SENTRY_DSN: process.env.SENTRY_DSN,
    INNGEST_EVENT_KEY: process.env.INNGEST_EVENT_KEY,
    INNGEST_SIGNING_KEY: process.env.INNGEST_SIGNING_KEY,
  },

  /**
   * Skip validation in Docker builds or CI where env vars aren't available.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
