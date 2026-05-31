import { format, eachDayOfInterval } from "date-fns";
import type { ProviderClient, UsageRow } from "./types";
import { fetchWithRetry } from "./fetch-with-retry";
import { keyFingerprint } from "@/lib/encryption/envelope";

const PROVIDER = "github_copilot";

// Copilot Business is a flat per-seat fee (~$19/seat/month ≈ 633,333 micros/day).
const SEAT_MICROS_PER_DAY = 633_333;

/**
 * GitHub Copilot per-seat billing client.
 *
 * Copilot bills a flat per-seat fee and exposes no token-level usage, so we
 * attribute by SEAT: one org admin token (GitHub PAT with `manage_billing:copilot`
 * or org-admin scope) lists assigned seats, and each assignee's GitHub login
 * becomes the external_identity, charged the prorated daily seat price.
 *
 * Key format: "org_name:token" (org name needed for the API path).
 * Endpoint: GET /orgs/{org}/copilot/billing/seats
 * Docs: https://docs.github.com/en/rest/copilot/copilot-user-management
 *
 * NOTE: the seats endpoint is a current snapshot, so backfill applies today's
 * seat roster across the window — an approximation appropriate for a flat fee.
 */
export const githubCopilotClient: ProviderClient = {
  async fetchUsage({ apiKey, since, until }) {
    const fp = keyFingerprint(apiKey);
    console.log(
      `[github_copilot] Fetching seats for key ...${fp} from ${format(since, "yyyy-MM-dd")} to ${format(until, "yyyy-MM-dd")}`
    );

    const [orgName, token] = parseOrgKey(apiKey);
    if (!orgName || !token) {
      throw new Error(
        "GitHub Copilot key must be in format 'org_name:token'. " +
          "The org name is needed to call the GitHub API."
      );
    }

    // Page through all assigned seats.
    const logins: string[] = [];
    let page = 1;
    const perPage = 100;
    for (;;) {
      const url = new URL(
        `https://api.github.com/orgs/${encodeURIComponent(orgName)}/copilot/billing/seats`
      );
      url.searchParams.set("per_page", String(perPage));
      url.searchParams.set("page", String(page));

      const response = await fetchWithRetry({
        url: url.toString(),
        provider: PROVIDER,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });

      const data = (await response.json()) as {
        total_seats?: number;
        seats?: Array<{ assignee?: { login?: string } }>;
      };

      const seats = data.seats ?? [];
      for (const seat of seats) {
        const login = seat.assignee?.login;
        if (login) logins.push(login);
      }

      if (seats.length < perPage) break;
      page += 1;
    }

    // Emit one row per seat per day at the prorated flat rate.
    const days = eachDayOfInterval({ start: since, end: until });
    const rows: UsageRow[] = [];
    for (const day of days) {
      const bucket = format(day, "yyyy-MM-dd");
      for (const login of logins) {
        rows.push({
          time_bucket: bucket,
          model: "copilot",
          external_identity: login,
          identity_label: login,
          input_tokens: 0,
          output_tokens: 0,
          cached_input_tokens: 0,
          cost_usd_micros: SEAT_MICROS_PER_DAY,
          raw: { login },
        });
      }
    }

    return rows;
  },
};

function parseOrgKey(apiKey: string): [string | null, string | null] {
  const colonIdx = apiKey.indexOf(":");
  if (colonIdx === -1) return [null, null];
  return [apiKey.slice(0, colonIdx), apiKey.slice(colonIdx + 1)];
}
