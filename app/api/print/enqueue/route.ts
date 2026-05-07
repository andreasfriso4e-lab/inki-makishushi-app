import { NextResponse } from "next/server";

import type { PrinterPrintRequest } from "@/lib/printer-transport";
import { enqueuePrinterPrintJob } from "@/lib/server/print-queue-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as PrinterPrintRequest & {
      idempotencyKey?: string;
    };

    if (!body?.printer || !body?.job) {
      return NextResponse.json({ message: "printer e job richiesti" }, { status: 400 });
    }

    const result = await enqueuePrinterPrintJob(body, {
      idempotencyKey: body.idempotencyKey,
    });

    return NextResponse.json(
      {
        ok: true,
        queued: true,
        bridgeOnline: result.bridgeOnline,
        jobId: result.queuedJobId,
        message: result.bridgeOnline
          ? "Stampa messa in coda per il bridge locale"
          : "Stampa messa in coda: bridge locale non connesso",
      },
      { status: 202 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Impossibile accodare la stampa",
      },
      { status: 500 }
    );
  }
}

