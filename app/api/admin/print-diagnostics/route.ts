import { NextResponse } from "next/server";

import type { PrinterTestRequest, TcpPrinterTarget } from "@/lib/printer-transport";
import {
  cancelPrintJob,
  enqueuePrinterTestJob,
  readLatestPrintBridgeStatus,
  readPrintQueueDiagnostics,
  retryPrintJob,
} from "@/lib/server/print-queue-repository";
import { getPrintTransportMode, isQueueBridgeTransportMode } from "@/lib/server/print-transport-mode";
import { runPrinterConnectionTest } from "@/lib/server/printer-tcp";
import { isSupabaseConfigured } from "@/lib/server/supabase-json-store";
import { readSharedPrintingConfig } from "@/lib/server/shared-printing-config-store";
import { readSharedTablesState } from "@/lib/server/shared-tables-store";

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

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const tableId = url.searchParams.get("tableId")?.trim() || null;
    const [queueDiagnostics, printingConfig, bridgeStatus, tablesState] = await Promise.all([
      readPrintQueueDiagnostics(),
      readSharedPrintingConfig(),
      readLatestPrintBridgeStatus(),
      tableId ? readSharedTablesState() : Promise.resolve(null),
    ]);

    const selectedTable = tableId
      ? tablesState?.tables.find((table) => table.id === tableId) ?? null
      : null;
    const selectedOrderDiagnostics = selectedTable
      ? {
          tableId: selectedTable.id,
          tableLabel: selectedTable.name,
          pendingLines: selectedTable.orders.filter(
            (item) => item.productId && item.quantity - Math.max(item.sentQuantity ?? 0, item.queuedQuantity ?? 0) > 0
          ).length,
          queuedLines: selectedTable.orders.filter((item) => (item.queuedQuantity ?? 0) > 0).length,
          sentLines: selectedTable.orders.filter((item) => (item.sentQuantity ?? 0) > 0).length,
        }
      : null;

    return NextResponse.json(
      {
        supabaseConfigured: isSupabaseConfigured(),
        transportMode: getPrintTransportMode(),
        bridgeOnline:
          bridgeStatus
            ? Date.now() - new Date(bridgeStatus.lastSeenAt).getTime() <= 12_000
            : false,
        bridgeStatus,
        printJobs: queueDiagnostics,
        printers:
          printingConfig?.printers.map((printer) => ({
            id: printer.id,
            name: printer.name,
            role: printer.role,
            ipAddress: printer.ipAddress,
            port: printer.port,
            enabled: printer.enabled,
            connectionMode: printer.connectionMode,
            lastSeenAt: printer.lastSeenAt ?? null,
            lastErrorMessage: printer.lastErrorMessage ?? "",
          })) ?? [],
        routingRules:
          printingConfig?.routingRules.map((rule) => ({
            category: rule.category,
            printerRole: rule.printerRole,
          })) ?? [],
        printerConfigsCount: printingConfig?.printers.length ?? 0,
        printerRoutingRulesCount: printingConfig?.routingRules.length ?? 0,
        selectedOrderDiagnostics,
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
          error instanceof Error ? error.message : "Impossibile leggere diagnostica stampa",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      action?: "test-print" | "retry" | "cancel";
      printerId?: string;
      printJobId?: string;
    };

    if (body.action === "retry") {
      if (!body.printJobId?.trim()) {
        return NextResponse.json({ message: "printJobId richiesto" }, { status: 400 });
      }

      await retryPrintJob(body.printJobId.trim());
      return NextResponse.json({ ok: true, message: "Stampa rimessa in coda" }, { status: 200 });
    }

    if (body.action === "cancel") {
      if (!body.printJobId?.trim()) {
        return NextResponse.json({ message: "printJobId richiesto" }, { status: 400 });
      }

      await cancelPrintJob(body.printJobId.trim());
      return NextResponse.json({ ok: true, message: "Stampa annullata" }, { status: 200 });
    }

    const printerId = body.printerId?.trim() ?? "";

    if (body.action !== "test-print" || !printerId) {
      return NextResponse.json(
        { message: "action=test-print e printerId richiesti" },
        { status: 400 }
      );
    }

    const printingConfig = await readSharedPrintingConfig();
    const printer = printingConfig?.printers.find((entry) => entry.id === printerId) ?? null;

    if (!printer) {
      return NextResponse.json({ message: "Stampante non trovata" }, { status: 404 });
    }

    const payload: PrinterTestRequest = {
      printer: toTcpPrinterTarget(printer),
      mode: "print",
    };

    if (isQueueBridgeTransportMode()) {
      const queueResult = await enqueuePrinterTestJob(payload);
      return NextResponse.json(
        {
          ok: true,
          queued: true,
          bridgeOnline: queueResult.bridgeOnline,
          message: queueResult.bridgeOnline
            ? "Test stampa inviato al bridge"
            : "Test stampa messo in coda: bridge locale non connesso",
          jobId: queueResult.queuedJobId,
        },
        { status: 202 }
      );
    }

    const result = await runPrinterConnectionTest(payload);
    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error ? error.message : "Impossibile eseguire test stampa",
      },
      { status: 500 }
    );
  }
}
