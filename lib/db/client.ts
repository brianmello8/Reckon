import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL!;

// Serverless (Vercel) + Supabase pooler: each function instance must hold at
// most ONE connection, or concurrent invocations exhaust the pooler's client
// limit (FATAL: max clients reached). `prepare: false` is required for the
// transaction-mode pooler (PgBouncer). Idle connections are released quickly so
// warm instances don't sit on a slot.
const client = postgres(connectionString, {
  prepare: false,
  max: 1,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(client, { schema });
