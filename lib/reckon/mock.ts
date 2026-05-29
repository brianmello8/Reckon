/**
 * Deterministic seeded mock data for the public /demo experience.
 * Anchored to a fixed date so server and client renders match (no hydration drift).
 * Costs are in USD micros to match the real query shape.
 */

function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAYS = 30;
const ANCHOR = new Date("2026-05-29T00:00:00Z");

function buildDates(n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(ANCHOR);
    d.setUTCDate(d.getUTCDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

const DATES = buildDates(DAYS);

const PROVIDER_NAMES: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  github_copilot: "GitHub Copilot",
};

const PROVIDER_MODELS: Record<string, string[]> = {
  anthropic: ["claude-opus-4", "claude-sonnet-4", "claude-haiku-4"],
  openai: ["gpt-5", "gpt-5-mini", "o4"],
  github_copilot: ["copilot-business"],
};

const DEV_DEFS = [
  { name: "Maya Chen", base: 38, mix: [0.55, 0.35, 0.1] },
  { name: "Diego Ramirez", base: 31, mix: [0.4, 0.45, 0.15] },
  { name: "Priya Nair", base: 27, mix: [0.62, 0.2, 0.18] },
  { name: "Tom Brennan", base: 24, mix: [0.3, 0.55, 0.15] },
  { name: "Sasha Volkov", base: 22, mix: [0.48, 0.3, 0.22] },
  { name: "Leila Haddad", base: 19, mix: [0.58, 0.27, 0.15] },
  { name: "Marcus Webb", base: 17, mix: [0.35, 0.5, 0.15] },
  { name: "Yuki Tanaka", base: 14, mix: [0.5, 0.3, 0.2] },
  { name: "Olivia Park", base: 12, mix: [0.44, 0.36, 0.2] },
  { name: "Sam Okafor", base: 10, mix: [0.4, 0.4, 0.2] },
];

// [devIndex, dayOffsetFromEnd, multiplier, severity, kind]
const SPIKES = [
  { dev: 4, day: 2, mult: 6.2, severity: "critical", kind: "spike" },
  { dev: 1, day: 5, mult: 3.4, severity: "warn", kind: "sustained_increase" },
  { dev: 9, day: 1, mult: 4.1, severity: "warn", kind: "sudden_increase" },
];

const PKEYS = ["anthropic", "openai", "github_copilot"] as const;

const M = 1_000_000; // dollars → micros

type Daily = { date: string; name: string; cost: number };

function build() {
  const dailyByDev: Daily[] = [];
  const dailyByProviderMap = new Map<string, Map<string, number>>(); // date → provider → micros
  const dailyByModelMap = new Map<string, Map<string, number>>();
  const devTotals: number[] = [];

  DEV_DEFS.forEach((def, devIdx) => {
    const rnd = mulberry32(1000 + devIdx * 17);
    let total = 0;
    DATES.forEach((iso, i) => {
      const d = new Date(iso + "T00:00:00Z");
      const dow = d.getUTCDay();
      const weekend = dow === 0 || dow === 6;
      const trend = 1 + (i / DAYS) * 0.45;
      const noise = 0.65 + rnd() * 0.7;
      let dayTotal = def.base * trend * noise * (weekend ? 0.25 : 1);
      const spike = SPIKES.find((s) => s.dev === devIdx && DAYS - 1 - i === s.day);
      if (spike) dayTotal *= spike.mult;

      const micros = Math.round(dayTotal * M);
      total += micros;
      dailyByDev.push({ date: iso, name: def.name, cost: micros });

      PKEYS.forEach((pk, pi) => {
        const share = def.mix[pi] ?? 0;
        const pm = Math.round(micros * share);
        if (pm <= 0) return;
        // provider rollup
        if (!dailyByProviderMap.has(iso)) dailyByProviderMap.set(iso, new Map());
        const pMap = dailyByProviderMap.get(iso)!;
        pMap.set(PROVIDER_NAMES[pk], (pMap.get(PROVIDER_NAMES[pk]) ?? 0) + pm);
        // model rollup — put all provider spend on its primary model
        const model = PROVIDER_MODELS[pk][0];
        if (!dailyByModelMap.has(iso)) dailyByModelMap.set(iso, new Map());
        const mMap = dailyByModelMap.get(iso)!;
        mMap.set(model, (mMap.get(model) ?? 0) + pm);
      });
    });
    devTotals[devIdx] = total;
  });

  const dailyByProvider: Daily[] = [];
  for (const [date, m] of dailyByProviderMap)
    for (const [name, cost] of m) dailyByProvider.push({ date, name, cost });

  const dailyByModel: Daily[] = [];
  for (const [date, m] of dailyByModelMap)
    for (const [name, cost] of m) dailyByModel.push({ date, name, cost });

  const grandTotal = devTotals.reduce((a, b) => a + b, 0);
  const priorTotal = Math.round(grandTotal * 0.86);

  const devRanking = DEV_DEFS.map((def, i) => ({
    developerId: `dev-${i}`,
    name: def.name,
    totalCost: String(devTotals[i]),
    pctOfOrg: grandTotal > 0 ? (devTotals[i] / grandTotal) * 100 : 0,
    keyCount: def.mix.filter((x) => x > 0).length,
  })).sort((a, b) => Number(b.totalCost) - Number(a.totalCost));

  const recentAnomalies = SPIKES.map((s, i) => {
    const dev = DEV_DEFS[s.dev];
    const date = DATES[DAYS - 1 - s.day];
    return {
      id: `anom-${i}`,
      developerId: `dev-${s.dev}`,
      developerName: dev.name,
      kind: s.kind,
      severity: s.severity as "info" | "warn" | "critical",
      multiple: s.mult,
      detectedAt: new Date(date + "T14:00:00Z").toISOString(),
    };
  });

  return {
    dashboard: {
      stats: {
        totalCostMicros: String(grandTotal),
        priorCostMicros: String(priorTotal),
        deltaPct:
          priorTotal > 0 ? ((grandTotal - priorTotal) / priorTotal) * 100 : 0,
        activeDevelopers: DEV_DEFS.length,
        topModel: "claude-sonnet-4",
      },
      dailyByDev,
      dailyByProvider,
      dailyByModel,
      devRanking,
    },
    recentAnomalies,
    developers: DEV_DEFS.map((def, i) => ({
      id: `dev-${i}`,
      displayName: def.name,
      email: def.name.toLowerCase().replace(" ", "@northwind.dev").replace(/ /g, ""),
      keyCount: def.mix.filter((x) => x > 0).length,
      totalCost: devTotals[i],
    })).sort((a, b) => b.totalCost - a.totalCost),
    anomalies: recentAnomalies,
  };
}

export const MOCK = build();
export type MockData = typeof MOCK;
