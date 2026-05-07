import { NextResponse } from "next/server";

import type { PosTableState } from "@/lib/pos-data";
import type { PrinterPrintRequest } from "@/lib/printer-transport";
import { enqueuePrinterPrintJob } from "@/lib/server/print-queue-repository";
import { writeSharedTablesState } from "@/lib/server/shared-tables-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      tables?: PosTableState[];
      printRequests?: PrinterPrintRequest[];
    };

    if (!Array.isArray(body.tables)) {
      return NextResponse.json({ message: "tables richiesto" }, { status: 400 });
    }

    if (!Array.isArray(body.printRequests) || body.printRequests.length === 0) {
      const state = await writeSharedTablesState(body.tables);
      return NextResponse.json(
        {
          ok: true,
          saved: true,
          createdPrintJobs: 0,
          bridgeOnline: false,
          message: "Ordine salvato, nessuna comanda da inviare",
          updatedAt: state.updatedAt,
        },
        { status: 200 }
      );
    }

    const state = await writeSharedTablesState(body.tables);
    const queueResults = await Promise.all(body.printRequests.map((entry) => enqueuePrinterPrintJob(entry)));

    return NextResponse.json(
      {
        ok: true,
        saved: true,
        createdPrintJobs: queueResults.length,
        bridgeOnline: queueResults.every((entry) => entry.bridgeOnline),
        jobs: queueResults.map((entry) => ({
          id: entry.queuedJobId,
          bridgeOnline: entry.bridgeOnline,
        })),
        message: queueResults.every((entry) => entry.bridgeOnline)
          ? "Comanda salvata e inviata al bridge locale"
          : "Comanda salvata. Stampa in coda: bridge locale non connesso.",
        updatedAt: state.updatedAt,
      },
      { status: 202 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Impossibile inviare la comanda",
      },
      { status: 500 }
    );
  }
}

