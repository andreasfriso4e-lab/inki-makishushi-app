import { NextResponse } from "next/server";

import type { PrinterPrintRequest } from "@/lib/printer-transport";
import { enqueuePrinterPrintJob } from "@/lib/server/print-queue-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      printRequests?: PrinterPrintRequest[];
    };

    if (!Array.isArray(body.printRequests) || body.printRequests.length === 0) {
      return NextResponse.json({ message: "printRequests richiesto" }, { status: 400 });
    }

    const timestamp = Date.now();
    const queueResults = await Promise.all(
      body.printRequests.map((entry, index) =>
        enqueuePrinterPrintJob(entry, {
          idempotencyKey: `reprint::${timestamp}::${index}::${entry.job.id}`,
        })
      )
    );

    return NextResponse.json(
      {
        ok: true,
        createdPrintJobs: queueResults.length,
        bridgeOnline: queueResults.every((entry) => entry.bridgeOnline),
        jobs: queueResults.map((entry) => ({
          id: entry.queuedJobId,
          bridgeOnline: entry.bridgeOnline,
        })),
        message: queueResults.every((entry) => entry.bridgeOnline)
          ? "Ristampa inviata al bridge locale"
          : "Ristampa messa in coda: bridge locale non connesso",
      },
      { status: 202 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Impossibile creare la ristampa",
      },
      { status: 500 }
    );
  }
}

