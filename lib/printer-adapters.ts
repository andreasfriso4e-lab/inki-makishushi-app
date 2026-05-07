"use client";

import type {
  PrintJob,
  PrintJobEvent,
  PrintJobStatus,
} from "@/lib/print-job-service";
import type {
  PrinterPrintRequest,
  PrinterTestRequest,
  PrinterTransportResponse,
  TcpPrinterTarget,
} from "@/lib/printer-transport";
import type { PrinterRecord } from "@/lib/printer-settings";

export type PrinterConnectionCheck = {
  ok: boolean;
  status: PrinterRecord["status"];
  lastConnectionResult: PrinterRecord["lastConnectionResult"];
  lastSeenAt: string | null;
  lastTestedAt: string;
  message: string;
  printed?: boolean;
};

export interface PrinterAdapter {
  send(job: PrintJob): Promise<PrintJob>;
  testConnection(mode?: "connection" | "print"): Promise<PrinterConnectionCheck>;
}

function getNowIso() {
  return new Date().toISOString();
}

function createEventMessage(message: string): PrintJobEvent {
  return {
    id: `print-event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: getNowIso(),
    message,
  };
}

function appendJobState(
  job: PrintJob,
  status: PrintJobStatus,
  message: string,
  errorMessage = ""
): PrintJob {
  return {
    ...job,
    status,
    updatedAt: getNowIso(),
    errorMessage,
    lastAttemptAt: getNowIso(),
    events: [...job.events, createEventMessage(message)],
  };
}

function hasValidIp(printer: PrinterRecord) {
  return printer.ipAddress.trim().length > 0;
}

function hasValidPort(printer: PrinterRecord) {
  return typeof printer.port === "number" && printer.port > 0;
}

const INTERNAL_PRINTER_TEST_ENDPOINT = "/api/printers/test";
const INTERNAL_PRINTER_PRINT_ENDPOINT = "/api/printers/print";

function resolveInternalPrinterEndpoint(endpoint: string) {
  if (typeof window === "undefined") {
    return endpoint;
  }

  return new URL(endpoint, window.location.origin).toString();
}

function toTransportPrinter(printer: PrinterRecord): TcpPrinterTarget {
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

async function postInternalPrinterEndpoint<TBody>(
  endpoint: string,
  body: TBody
): Promise<PrinterTransportResponse> {
  if (
    endpoint !== INTERNAL_PRINTER_TEST_ENDPOINT &&
    endpoint !== INTERNAL_PRINTER_PRINT_ENDPOINT
  ) {
    throw new Error("Endpoint stampante non valido");
  }

  const resolvedEndpoint = resolveInternalPrinterEndpoint(endpoint);
  const response = await fetch(resolvedEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify(body),
  });

  const result = (await response.json()) as PrinterTransportResponse;

  if (!response.ok && result?.message) {
    console.error("[PRINT][HTTP] Endpoint interno stampante fallito", {
      endpoint: resolvedEndpoint,
      status: response.status,
      response: result,
    });
    return result;
  }

  if (!result.ok) {
    console.error("[PRINT][HTTP] Trasporto stampante fallito", {
      endpoint: resolvedEndpoint,
      status: response.status,
      response: result,
    });
  }

  return result;
}

abstract class BasePrinterAdapter implements PrinterAdapter {
  constructor(protected readonly printer: PrinterRecord) {}

  abstract send(job: PrintJob): Promise<PrintJob>;

  async testConnection(mode: "connection" | "print" = "connection"): Promise<PrinterConnectionCheck> {
    if (this.printer.connectionMode === "mock") {
      return {
        ok: true,
        status: "configured",
        lastConnectionResult: "success",
        lastSeenAt: getNowIso(),
        lastTestedAt: getNowIso(),
        message:
          mode === "print"
            ? `Test stampa simulato positivo per ${this.printer.name}`
            : `Test simulato positivo per ${this.printer.name}`,
        printed: mode === "print",
      };
    }

    if (!hasValidIp(this.printer)) {
      return {
        ok: false,
        status: "error",
        lastConnectionResult: "failed",
        lastSeenAt: null,
        lastTestedAt: getNowIso(),
        message: "Configurazione incompleta: indirizzo IP mancante",
      };
    }

    if (!hasValidPort(this.printer)) {
      return {
        ok: false,
        status: "error",
        lastConnectionResult: "failed",
        lastSeenAt: null,
        lastTestedAt: getNowIso(),
        message: "Configurazione incompleta: porta mancante",
      };
    }

    const payload: PrinterTestRequest = {
      printer: toTransportPrinter(this.printer),
      mode,
    };
    const result = await postInternalPrinterEndpoint(INTERNAL_PRINTER_TEST_ENDPOINT, payload);

    return {
      ok: result.ok,
      status: result.ok ? "online" : "offline",
      lastConnectionResult: result.ok ? "success" : "failed",
      lastSeenAt: result.ok ? result.at : this.printer.lastSeenAt ?? null,
      lastTestedAt: result.at,
      message: result.message,
      printed: result.printed,
    };
  }
}

function getJobLabel(job: PrintJob) {
  if (job.type === "prebill") {
    return "Preconto";
  }

  if (job.type === "table-move") {
    return "Spostamento tavolo";
  }

  if (job.type === "fiscal-document") {
    return job.documentType || "Documento fiscale";
  }

  if (job.type === "void") {
    return "Storno";
  }

  return "Comanda";
}

export class MockPrinterAdapter extends BasePrinterAdapter {
  async send(job: PrintJob): Promise<PrintJob> {
    return appendJobState(
      job,
      "simulated",
      `${getJobLabel(job)} simulato su ${this.printer.name}`
    );
  }
}

export class EscPosPrinterAdapter extends BasePrinterAdapter {
  async send(job: PrintJob): Promise<PrintJob> {
    if (!hasValidIp(this.printer)) {
      return appendJobState(job, "failed", `Invio ESC/POS fallito su ${this.printer.name}`, "IP mancante");
    }

    if (!hasValidPort(this.printer)) {
      return appendJobState(job, "failed", `Invio ESC/POS fallito su ${this.printer.name}`, "Porta mancante");
    }

    const payload: PrinterPrintRequest = {
      printer: toTransportPrinter(this.printer),
      job: {
        id: job.id,
        type: job.type,
        summary: job.summary,
        tableLabel: job.tableLabel,
        sourceTableLabel: job.sourceTableLabel,
        destinationTableLabel: job.destinationTableLabel,
        roomLabel: job.roomLabel,
        destinationRoomLabel: job.destinationRoomLabel,
        operator: job.operator,
        commandNumber: job.commandNumber,
        guests: job.guests,
        customerLabel: job.customerLabel,
        companyLabel: job.companyLabel,
        commandSettingsSnapshot: job.commandSettingsSnapshot,
        documentType: job.documentType,
        paymentMethod: job.paymentMethod,
        total: job.total,
        createdAt: job.createdAt,
        items: job.items.map((item) => ({
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          guestCode: item.guestCode ?? null,
          course: item.course,
          note: item.note,
        })),
      },
    };
    const result = await postInternalPrinterEndpoint(INTERNAL_PRINTER_PRINT_ENDPOINT, payload);

    return appendJobState(
      job,
      result.ok ? "sent" : "failed",
      result.message,
      result.ok ? "" : result.message
    );
  }
}

export class MockFiscalPrinterAdapter extends BasePrinterAdapter {
  async send(job: PrintJob): Promise<PrintJob> {
    return appendJobState(
      job,
      "simulated",
      `${getJobLabel(job)} simulato su ${this.printer.name} (${this.printer.ipAddress}:${this.printer.port ?? "—"})`
    );
  }
}

export class EpsonRtXmlPrinterAdapter extends BasePrinterAdapter {
  async send(job: PrintJob): Promise<PrintJob> {
    if (!hasValidIp(this.printer)) {
      return appendJobState(job, "failed", `Invio fiscale RT fallito su ${this.printer.name}`, "IP mancante");
    }

    if (!hasValidPort(this.printer)) {
      return appendJobState(job, "failed", `Invio fiscale RT fallito su ${this.printer.name}`, "Porta mancante");
    }

    return appendJobState(
      job,
      "sent",
      `${getJobLabel(job)} pronto per Epson RT ${this.printer.ipAddress}:${this.printer.port} (canale server-side predisposto)`
    );
  }
}

export { EpsonRtXmlPrinterAdapter as EpsonFiscalPrinterAdapter };
