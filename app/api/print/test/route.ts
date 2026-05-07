import { NextResponse } from "next/server";

import type { PrinterTestRequest, TcpPrinterTarget } from "@/lib/printer-transport";
import { enqueuePrinterTestJob } from "@/lib/server/print-queue-repository";
import { readSharedPrintingConfig } from "@/lib/server/shared-printing-config-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toTcpPrinterTarget(printer: {
  id: string;
  name: string;
  model: "ESC/POS" | "Epson RT v.10 XML7";
  role: "fiscal" | "bar" | "kitchen" | "generic";
  ipAddress: string;
  port: number | null;
  timeoutMs: number;
  paperColumns: number | null;
}): TcpPrinterTarget {
  return {
    id: printer.id,
    name: printer.name,
    model: printer.model,
    role: printer.role,
    ipAddress: printer.ipAddress,
    port: printer.port,
    timeoutMs: printer.timeoutMs,
    paperColumns: printer.paperColumns,
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as
      | ({ printerId: string; idempotencyKey?: string })
      | (PrinterTestRequest & { idempotencyKey?: string });

    let payload: PrinterTestRequest | null = null;

    if ("printer" in body && body.printer) {
      payload = body;
    } else if ("printerId" in body && body.printerId?.trim()) {
      const printingConfig = await readSharedPrintingConfig();
      const printer = printingConfig?.printers.find((entry) => entry.id === body.printerId.trim()) ?? null;
      if (!printer) {
        return NextResponse.json({ message: "Stampante non trovata" }, { status: 404 });
      }

      payload = {
        printer: toTcpPrinterTarget(printer),
        mode: "print",
      };
    }

    if (!payload) {
      return NextResponse.json({ message: "printerId o printer richiesto" }, { status: 400 });
    }

    const result = await enqueuePrinterTestJob(payload, {
      idempotencyKey: "idempotencyKey" in body ? body.idempotencyKey : undefined,
    });

    return NextResponse.json(
      {
        ok: true,
        queued: true,
        bridgeOnline: result.bridgeOnline,
        jobId: result.queuedJobId,
        message: result.bridgeOnline
          ? "Test stampa inviato al bridge"
          : "Test stampa messo in coda: bridge locale non connesso",
      },
      { status: 202 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Impossibile creare test stampa",
      },
      { status: 500 }
    );
  }
}

