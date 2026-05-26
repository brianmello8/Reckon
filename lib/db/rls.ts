import { db } from "./client";
import { sql } from "drizzle-orm";

/**
 * Runs a callback inside a transaction with app.current_org_id set for RLS.
 * Every authenticated DB query should go through this.
 */
export async function withOrgContext<T>(
  orgId: string,
  callback: (tx: typeof db) => Promise<T>
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT set_config('app.current_org_id', ${orgId}, true)`
    );
    return callback(tx as unknown as typeof db);
  });
}
