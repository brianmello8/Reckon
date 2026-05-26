import {
  ProviderAuthError,
  ProviderTransientError,
  ProviderUnknownError,
} from "./errors";

const TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 1_000;

interface FetchOptions {
  url: string;
  provider: string;
  headers?: Record<string, string>;
  method?: string;
  body?: string;
}

function jitter(base: number): number {
  return base + Math.random() * base * 0.5;
}

/**
 * Fetch wrapper with 30s timeout, exponential backoff (3 attempts),
 * and error categorization into auth/transient/unknown.
 */
export async function fetchWithRetry(opts: FetchOptions): Promise<Response> {
  const { url, provider, headers, method = "GET", body } = opts;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      // Auth errors — don't retry
      if (response.status === 401 || response.status === 403) {
        const text = await response.text().catch(() => "");
        throw new ProviderAuthError(
          `${provider} auth error (${response.status}): ${text.slice(0, 200)}`,
          provider,
          response.status
        );
      }

      // Rate limit or server errors — retry
      if (response.status === 429 || response.status >= 500) {
        if (attempt === MAX_ATTEMPTS) {
          const text = await response.text().catch(() => "");
          throw new ProviderTransientError(
            `${provider} error (${response.status}) after ${MAX_ATTEMPTS} attempts: ${text.slice(0, 200)}`,
            provider,
            response.status
          );
        }
        const delay = jitter(BASE_DELAY_MS * Math.pow(2, attempt - 1));
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      // Other client errors — don't retry
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new ProviderUnknownError(
          `${provider} error (${response.status}): ${text.slice(0, 200)}`,
          provider,
          response.status
        );
      }

      return response;
    } catch (err) {
      clearTimeout(timeout);

      // Re-throw our typed errors
      if (
        err instanceof ProviderAuthError ||
        err instanceof ProviderTransientError ||
        err instanceof ProviderUnknownError
      ) {
        throw err;
      }

      // Network/timeout errors — retry
      if (attempt === MAX_ATTEMPTS) {
        throw new ProviderTransientError(
          `${provider} network error after ${MAX_ATTEMPTS} attempts: ${err instanceof Error ? err.message : "Unknown"}`,
          provider
        );
      }

      const delay = jitter(BASE_DELAY_MS * Math.pow(2, attempt - 1));
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  // Should never reach here
  throw new ProviderUnknownError("Unexpected retry loop exit", provider);
}
