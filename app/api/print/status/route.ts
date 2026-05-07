import { NextResponse } from "next/server";

import { readPrintQueueDiagnostics } from "@/lib/server/print-queue-repository";
import { getPrintTransportMode } from "@/lib/server/print-transport-mode";
import { isSupabaseConfigured } from "@/lib/server/supabase-json-store";
import { readSharedPrintingConfig } from "@/lib/server/shared-printing-config-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [diagnostics, printingConfig] = await Promise.all([
      readPrintQueueDiagnostics(),
      readSharedPrintingConfig(),
    ]);

    return NextResponse.json(
      {
        supabaseConfigured: isSupabaseConfigured(),
        transportMode: getPrintTransportMode(),
        printerConfigsCount: printingConfig?.printers.length ?? 0,
        printerRoutingRulesCount: printingConfig?.routingRules.length ?? 0,
        queue: diagnostics,
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Impossibile leggere lo stato stampa",
      },
      { status: 500 }
    );
  }
}

