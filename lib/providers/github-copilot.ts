import { format } from "date-fns";
import type { ProviderClient, UsageRow } from "./types";
import { fetchWithRetry } from "./fetch-with-retry";
import { keyFingerprint } from "@/lib/encryption/envelope";

const PROVIDER = "github_copilot";

/**
 * GitHub Copilot org billing API client.
 *
 * IMPORTANT: This API returns org-level aggregate data only, NOT per-user.
 * We return a single UsageRow per day attributed to a synthetic "org-wide"
 * model entry. Per-developer attribution is not possible via this API.
 *
 * The API key here is a GitHub personal access token with org admin scope,
 * or a GitHub App installation token.
 *
 * Endpoint: GET /orgs/{org}/copilot/usage
 * Docs: https://docs.github.com/en/rest/copilot/copilot-usage
 */
export const githubCopilotClient: ProviderClient = {
  async fetchUsage({ apiKey, since, until }) {
    const fp = keyFingerprint(apiKey);
    console.log(`[github_copilot] Fetching usage for key ...${fp} from ${format(since, "yyyy-MM-dd")} to ${format(until, "yyyy-MM-dd")}`);

    // Extract org name from the key metadata or use a convention.
    // The API key format for GitHub is: ghp_xxx or ghs_xxx
    // We need the org name — stored as a prefix in our key: "org_name:token"
    const [orgName, token] = parseOrgKey(apiKey);

    if (!orgName || !token) {
      throw new Error(
        "GitHub Copilot key must be in format 'org_name:token'. " +
        "The org name is needed to call the GitHub API."
      );
    }

    const sinceStr = format(since, "yyyy-MM-dd");
    const untilStr = format(until, "yyyy-MM-dd");

    const url = new URL(
      `https://api.github.com/orgs/${encodeURIComponent(orgName)}/copilot/usage`
    );
    url.searchParams.set("since", sinceStr);
    url.searchParams.set("until", untilStr);

    const response = await fetchWithRetry({
      url: url.toString(),
      provider: PROVIDER,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    const data = await response.json() as Array<{
      day?: string;
      total_suggestions_count?: number;
      total_acceptances_count?: number;
      total_lines_suggested?: number;
      total_lines_accepted?: number;
      total_active_users?: number;
      breakdown?: Array<{
        language?: string;
        suggestions_count?: number;
        acceptances_count?: number;
      }>;
    }>;

    if (!Array.isArray(data)) {
      console.log(`[github_copilot] Unexpected response shape`);
      return [];
    }

    const rows: UsageRow[] = [];

    for (const entry of data) {
      if (!entry.day) continue;

      // GitHub Copilot doesn't report token counts or costs directly.
      // We use seat-based pricing: $19/user/month ≈ $0.63/user/day
      // cost_usd_micros = active_users * 633_333 (micros per user per day)
      const activeUsers = entry.total_active_users ?? 0;
      const costMicros = activeUsers * 633_333;

      rows.push({
        time_bucket: entry.day,
        model: "copilot",
        input_tokens: entry.total_suggestions_count ?? 0,
        output_tokens: entry.total_acceptances_count ?? 0,
        cached_input_tokens: 0,
        cost_usd_micros: costMicros,
        raw: entry as Record<string, unknown>,
      });
    }

    return rows;
  },
};

function parseOrgKey(apiKey: string): [string | null, string | null] {
  const colonIdx = apiKey.indexOf(":");
  if (colonIdx === -1) return [null, null];
  return [apiKey.slice(0, colonIdx), apiKey.slice(colonIdx + 1)];
}
