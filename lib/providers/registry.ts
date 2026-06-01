import type { ProviderClient } from "./types";
import { anthropicClient } from "./anthropic";
import { openaiClient } from "./openai";
import { githubCopilotClient } from "./github-copilot";
import { openrouterClient } from "./openrouter";

const clients: Record<string, ProviderClient> = {
  anthropic: anthropicClient,
  openai: openaiClient,
  github_copilot: githubCopilotClient,
  openrouter: openrouterClient,
};

export function getProviderClient(providerKey: string): ProviderClient {
  const client = clients[providerKey];
  if (!client) {
    throw new Error(`Unknown provider: ${providerKey}`);
  }
  return client;
}
