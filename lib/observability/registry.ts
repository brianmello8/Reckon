import type { ObservabilityConnector } from "./types";
import { langfuseConnector } from "./langfuse";

const connectors: Record<string, ObservabilityConnector> = {
  langfuse: langfuseConnector,
};

export function getObservabilityConnector(
  provider: string
): ObservabilityConnector {
  const connector = connectors[provider];
  if (!connector) {
    throw new Error(`Unknown observability provider: ${provider}`);
  }
  return connector;
}

/** Default base URL per provider (self-hosted Langfuse overrides this). */
export const DEFAULT_BASE_URL: Record<string, string> = {
  langfuse: "https://cloud.langfuse.com",
};
