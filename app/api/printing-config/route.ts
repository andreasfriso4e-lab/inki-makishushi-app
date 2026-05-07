import { NextResponse } from "next/server";

import type { PrintingFeatureFlags } from "@/lib/printer-config-service";
import type { OrderCommandSettings } from "@/lib/order-command-settings";
import type { PrinterRoutingRule } from "@/lib/printer-routing";
import type { PrinterRecord } from "@/lib/printer-settings";
import {
  readSharedPrintingConfig,
  writeSharedPrintingConfig,
} from "@/lib/server/shared-printing-config-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const config = await readSharedPrintingConfig();
    return NextResponse.json(
      config ?? {
        printers: [],
        featureFlags: null,
        routingRules: [],
        commandSettings: null,
        updatedAt: null,
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
        message:
          error instanceof Error ? error.message : "Impossibile leggere la configurazione stampa",
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as {
      printers?: PrinterRecord[];
      featureFlags?: PrintingFeatureFlags | null;
      routingRules?: PrinterRoutingRule[];
      commandSettings?: OrderCommandSettings | null;
    };

    const config = await writeSharedPrintingConfig({
      printers: Array.isArray(body.printers) ? body.printers : [],
      featureFlags: body.featureFlags ?? null,
      routingRules: Array.isArray(body.routingRules) ? body.routingRules : [],
      commandSettings: body.commandSettings ?? null,
    });

    return NextResponse.json(config, {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Impossibile salvare la configurazione stampa",
      },
      { status: 500 }
    );
  }
}
