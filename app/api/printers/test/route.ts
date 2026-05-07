import { NextResponse } from "next/server";

import type { PrinterTestRequest } from "@/lib/printer-transport";
import {
  enqueuePrinterTestJob,
  readLatestPrintBridgeStatus,
} from "@/lib/server/print-queue-repository";
import { isQueueBridgeTransportMode } from "@/lib/server/print-transport-mode";
import { runPrinterConnectionTest } from "@/lib/server/printer-tcp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as PrinterTestRequest;

    if (isQueueBridgeTransportMode()) {
      if ((body.mode ?? "connection") === "connection") {
        const bridgeStatus = await readLatestPrintBridgeStatus();
        const bridgeOnline =
          bridgeStatus
            ? Date.now() - new Date(bridgeStatus.lastSeenAt).getTime() <= 12_000
            : false;

        return NextResponse.json(
          {
            ok: bridgeOnline,
            message: bridgeOnline
              ? "Bridge locale connesso"
              : "Bridge locale non connesso",
            openedSocket: false,
            printed: false,
            queued: false,
            bridgeOnline,
            at: new Date().toISOString(),
            errorCode: bridgeOnline ? undefined : "BRIDGE_OFFLINE",
          },
          { status: bridgeOnline ? 200 : 503 }
        );
      }

      const queueResult = await enqueuePrinterTestJob(body);
      return NextResponse.json(
        {
          ok: true,
          message: queueResult.bridgeOnline
            ? "Test stampa inviato al bridge"
            : "Test stampa messo in coda: bridge locale non connesso",
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

    const result = await runPrinterConnectionTest(body);
    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Errore interno test stampante",
        openedSocket: false,
        printed: false,
        at: new Date().toISOString(),
        errorCode: "INTERNAL_ERROR",
      },
      { status: 500 }
    );
  }
}
