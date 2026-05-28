import * as Sentry from "@sentry/nextjs";

export { PlanLimitError } from "@/lib/plans/limits";
export { ProviderAuthError, ProviderTransientError, ProviderUnknownError } from "@/lib/providers/errors";

export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string };

/**
 * Wraps a server action to catch typed errors and return structured responses.
 * Logs unexpected errors to Sentry.
 */
export async function serverActionWrapper<T>(
  fn: () => Promise<T>,
  context?: { orgId?: string; userId?: string }
): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { success: true, data };
  } catch (err) {
    if (err instanceof Error) {
      // Known error types — return the message without logging to Sentry
      if (
        err.name === "PlanLimitError" ||
        err.name === "ProviderAuthError"
      ) {
        return { success: false, error: err.message, code: err.name };
      }

      // Unexpected errors — log to Sentry
      Sentry.captureException(err, {
        tags: {
          org_id: context?.orgId,
          user_id: context?.userId,
        },
      });

      return { success: false, error: err.message };
    }

    Sentry.captureException(err);
    return { success: false, error: "An unexpected error occurred" };
  }
}
