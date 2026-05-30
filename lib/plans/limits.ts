export const PLAN_LIMITS = {
  free: {
    maxDevelopers: 3,
    maxProviders: 1,
    retentionDays: 30,
    weeklyDigest: false,
    linearIntegration: false,
  },
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
