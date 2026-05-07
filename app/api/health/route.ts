import { NextResponse } from "next/server";

import { getBuildMetadata } from "@/lib/app-version";
import { isSupabaseConfigured, probeSupabaseTable } from "@/lib/server/supabase-json-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabaseConfigured = isSupabaseConfigured();
    const supabaseProbe = supabaseConfigured ? await probeSupabaseTable("rooms") : null;
    const supabaseReachable = supabaseConfigured ? Boolean(supabaseProbe?.restAccessible) : false;

    return NextResponse.json(
      {
        ok: supabaseConfigured ? supabaseReachable : true,
        ...getBuildMetadata(),
        environment: process.env.NODE_ENV || "development",
        supabaseConfigured,
        supabaseReachable,
        timestamp: new Date().toISOString(),
        error:
          supabaseConfigured && !supabaseReachable
            ? supabaseProbe?.error ?? "Supabase non raggiungibile"
            : null,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        ...getBuildMetadata(),
        environment: process.env.NODE_ENV || "development",
        supabaseConfigured: isSupabaseConfigured(),
        supabaseReachable: false,
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Health check fallito",
      },
      { status: 500 }
    );
  }
}
