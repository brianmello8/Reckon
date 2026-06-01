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

// Cold-connect to the pooler is expensive (~1s), so keep the pool SMALL and
// reuse warm connections rather than spawning many cold ones (measured: 8
// parallel cold connections were slower than 8 serial queries on one warm
// connection). A little headroom (3) absorbs occasional concurrency without a
// cold-connect storm; a longer idle window keeps connections warm between
// page loads so we don't repay the cold cost on every navigation. The
// transaction-mode pooler (port 6543) is fine holding these.
const client = postgres(connectionString, {
  prepare: false,
  max: 3,
  idle_timeout: 120,
  connect_timeout: 10,
});

export const db = drizzle(client, { schema });
