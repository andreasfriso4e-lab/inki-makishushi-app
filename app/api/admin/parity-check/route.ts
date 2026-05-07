import { NextResponse } from "next/server";

import {
  getAllParityDomains,
  parseParityDomains,
  runParityCheck,
} from "@/lib/server/parity-check-service";
import {
  getDefaultSupabaseReadModes,
} from "@/lib/server/supabase-read-mode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const domains = parseParityDomains(searchParams.getAll("domain"));
    const results = await runParityCheck(domains);

    return NextResponse.json(
      {
        domains,
        availableDomains: getAllParityDomains(),
        readModes: getDefaultSupabaseReadModes(),
        results,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (error) {
    console.error("[api/admin/parity-check] parity check failed", error);
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Parity check failed",
      },
      { status: 500 }
    );
  }
}
