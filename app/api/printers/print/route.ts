import { NextResponse } from "next/server";

import type { PrinterPrintRequest } from "@/lib/printer-transport";
import {
  enqueuePrinterPrintJob,
} from "@/lib/server/print-queue-repository";
import { isQueueBridgeTransportMode } from "@/lib/server/print-transport-mode";
import { runPrinterPrint } from "@/lib/server/printer-tcp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as PrinterPrintRequest;

    if (isQueueBridgeTransportMode()) {
      const queueResult = await enqueuePrinterPrintJob(body);
      return NextResponse.json(
        {
          ok: true,
          message: queueResult.bridgeOnline
            ? "Stampa inviata al bridge locale"
            : "Comanda salvata. Stampa in coda: bridge locale non connesso.",
          openedSocket: false,
          printed: false,
          queued: true,
          bridgeOnline: queueResult.bridgeOnline,
          jobId: queueResult.queuedJobId,
          at: new Date().toISOString(),
        },
        { status: 202 }
      );
    }

    const result = await runPrinterPrint(body);
    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Errore interno invio stampante",
        openedSocket: false,
        printed: false,
        at: new Date().toISOString(),
        errorCode: "INTERNAL_ERROR",
      },
      { status: 500 }
    );
  }
}
