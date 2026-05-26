import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { sql } from "drizzle-orm";

export async function GET() {
  const start = performance.now();

  try {
    await db.execute(sql`SELECT 1`);
    const dbLatencyMs = Math.round(performance.now() - start);

    return NextResponse.json({
      status: "ok",
      db_latency_ms: dbLatencyMs,
    });
  } catch (error) {
    const dbLatencyMs = Math.round(performance.now() - start);

    return NextResponse.json(
      {
        status: "error",
        db_latency_ms: dbLatencyMs,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 503 }
    );
  }
}
