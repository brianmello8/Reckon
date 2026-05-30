import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Supabase's SESSION-mode pooler (port 5432) holds one server connection per
// client for the entire session. Serverless functions freeze between
// invocations without closing connections, so the pool (default 15) saturates
// and every query fails with "FATAL: max clients reached in session mode".
// The TRANSACTION-mode pooler (port 6543) multiplexes connections and is the
// correct serverless target — our RLS uses transaction-local set_config and we
// already run prepare:false, so it's safe. Rewrite the port surgically (no
// touching the credentials) unless the URL already targets a non-session port.
function toServerlessPooler(raw: string): string {
  if (!raw.includes("pooler.supabase.com") || !raw.includes(":5432/")) {
    return raw;
  }
  let url = raw.replace(":5432/", ":6543/");
  if (!/[?&]pgbouncer=/.test(url)) {
    url += url.includes("?") ? "&pgbouncer=true" : "?pgbouncer=true";
  }
  return url;
}

const connectionString = toServerlessPooler(process.env.DATABASE_URL!);

// Cap each serverless instance to a single, quickly-released connection.
const client = postgres(connectionString, {
  prepare: false,
  max: 1,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(client, { schema });
