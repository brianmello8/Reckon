// Entry caps (also used while trialing, where plan is still "free").
const ENTRY_LIMITS = {
  maxDevelopers: 3,
  maxProviders: 1,
  retentionDays: 30,
  weeklyDigest: false,
  linearIntegration: false,
} as const;

export const PLAN_LIMITS = {
  free: ENTRY_LIMITS, // sentinel for trialing/lapsed orgs
  entry: ENTRY_LIMITS, // paid $5/mo entry tier
  pro: {
    maxDevelopers: Infinity,
    maxProviders: Infinity,
    retentionDays: 365,
    weeklyDigest: true,
    linearIntegration: true,
  },
} as const;

export type PlanKey = keyof typeof PLAN_LIMITS;

export class PlanLimitError extends Error {
  constructor(
    message: string,
    public readonly limit: string
  ) {
    super(message);
    this.name = "PlanLimitError";
  }
}
