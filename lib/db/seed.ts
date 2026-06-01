import { db } from "./client";
import { providers } from "./schema";

const PROVIDERS = [
  { key: "anthropic", displayName: "Anthropic" },
  { key: "openai", displayName: "OpenAI" },
  { key: "github_copilot", displayName: "GitHub Copilot" },
  { key: "openrouter", displayName: "OpenRouter" },
] as const;

async function main() {
  console.log("Seeding providers...");

  for (const p of PROVIDERS) {
    await db
      .insert(providers)
      .values({ key: p.key, displayName: p.displayName })
      .onConflictDoNothing({ target: providers.key });
  }

  const rows = await db.select().from(providers);
  console.table(rows);
  console.log("Seed complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
