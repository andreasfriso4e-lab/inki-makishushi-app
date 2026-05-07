"use client";

import {
  addOperationalArchivedMovement,
  getDocumentArchive,
  saveDocumentArchive,
  type ArchivedMovement,
} from "@/lib/document-archive";
import { PrintJobService } from "@/lib/print-job-service";
import { PrinterConfigService } from "@/lib/printer-config-service";
import { getPrinterSettings } from "@/lib/printer-settings";

type FinancialSummary = {
  totalSales: number;
  totalDocuments: number;
  receiptCount: number;
  invoiceCount: number;
  openTablesCount: number;
  byPaymentMethod: Record<string, number>;
};

type BaseCashCloseInput = {
  operator: string;
  operatorId: string;
  workstationId: string;
  openTablesCount: number;
};

function formatTodayLabel() {
  const now = new Date();
  return now.toLocaleDateString("it-IT");
}

function isTodayEntry(entry: ArchivedMovement) {
  const today = new Date().toLocaleDateString("it-IT");
  return entry.date === today;
}

function isSaleEntry(entry: ArchivedMovement) {
  return entry.operationKind === "sale" && entry.status === "Pagato";
}

function isUnclosedFiscalDayEntry(entry: ArchivedMovement) {
  return !entry.fiscalDayClosedAt;
}

export function buildTodayFinancialSummary() {
  const salesEntries = getDocumentArchive().filter(
    (entry) => isTodayEntry(entry) && isSaleEntry(entry) && isUnclosedFiscalDayEntry(entry)
  );
  const byPaymentMethod = salesEntries.reduce<Record<string, number>>((accumulator, entry) => {
    const paymentMethod = entry.paymentMethod || "Altro";
    accumulator[paymentMethod] = (accumulator[paymentMethod] ?? 0) + entry.finalTotal;
    return accumulator;
  }, {});

  return {
    totalSales: salesEntries.reduce((total, entry) => total + entry.finalTotal, 0),
    totalDocuments: salesEntries.length,
    receiptCount: salesEntries.filter((entry) => entry.documentType !== "Fattura").length,
    invoiceCount: salesEntries.filter((entry) => entry.documentType === "Fattura").length,
    openTablesCount: 0,
    byPaymentMethod,
  } satisfies FinancialSummary;
}

export function createFinancialReportDocument(input: BaseCashCloseInput) {
  const summary = buildTodayFinancialSummary();

  return addOperationalArchivedMovement({
    tableId: "cash-close",
    tableLabel: "Chiusura cassa",
    roomLabel: "Cassa",
    saleMode: "Gestionale",
    customerName: "",
    companyName: "",
    operator: input.operator,
    paymentMethod: "Report finanziario",
    total: summary.totalSales,
    originalTotal: summary.totalSales,
    finalTotal: summary.totalSales,
    operatorId: input.operatorId,
    note: `Report finanziario del ${formatTodayLabel()}`,
    lines: [],
    operationKind: "financial-report",
    closureMethod: "report",
    deviceLabel: input.workstationId,
    outcome: "success",
    referenceNumber: `REPORT-${new Date().toISOString().slice(0, 10)}`,
    financialSummary: {
      ...summary,
      openTablesCount: input.openTablesCount,
    },
  });
}

export function canRunDailyClose() {
  const printer = getPrinterSettings().find((entry) => entry.role === "fiscal" && entry.enabled);
  return Boolean(printer);
}

export async function runDailyClose(input: BaseCashCloseInput) {
  const summary = buildTodayFinancialSummary();
  const printerConfigService = new PrinterConfigService();
  const printer = printerConfigService.getPrinters().find((entry) => entry.role === "fiscal" && entry.enabled) ?? null;

  if (!printer) {
    const archivedEntry = addOperationalArchivedMovement({
      tableId: "cash-close",
      tableLabel: "Chiusura cassa",
      roomLabel: "Cassa",
      saleMode: "Gestionale",
      customerName: "",
      companyName: "",
      operator: input.operator,
      paymentMethod: "Chiusura giornaliera",
      total: summary.totalSales,
      originalTotal: summary.totalSales,
      finalTotal: summary.totalSales,
      operatorId: input.operatorId,
      note: "Nessuna stampante RT fiscale configurata",
      lines: [],
      operationKind: "daily-close",
      closureMethod: "daily-close",
      deviceLabel: input.workstationId,
      outcome: "error",
      referenceNumber: "",
      financialSummary: {
        ...summary,
        openTablesCount: input.openTablesCount,
      },
      rtDeviceId: "",
    });

    return {
      success: false as const,
      message: "Nessuna stampante RT fiscale configurata",
      archivedEntry,
      printJobs: [],
    };
  }

  const printJobs = await new PrintJobService().dispatchFiscalPrintJob({
    tableId: "cash-close",
    tableLabel: "Chiusura cassa",
    roomLabel: "Cassa",
    operator: input.operator,
    documentType: "Chiusura giornaliera",
    paymentMethod: "CHIUSURA_GIORNALIERA_RT",
    total: summary.totalSales,
    items: [],
    products: [],
  });
  const failedJob = printJobs.find((job) => job.status === "failed");
  const closureReference = printJobs[0]?.id ?? "";

  if (!failedJob) {
    const now = new Date().toISOString();
    const nextEntries = getDocumentArchive().map((entry) =>
      isTodayEntry(entry) && isSaleEntry(entry) && isUnclosedFiscalDayEntry(entry)
        ? {
            ...entry,
            fiscalDayClosedAt: now,
            fiscalClosureDocumentId: closureReference,
          }
        : entry
    );
    saveDocumentArchive(nextEntries);
  }

  const archivedEntry = addOperationalArchivedMovement({
    tableId: "cash-close",
    tableLabel: "Chiusura cassa",
    roomLabel: "Cassa",
    saleMode: "Gestionale",
    customerName: "",
    companyName: "",
    operator: input.operator,
    paymentMethod: "Chiusura giornaliera",
    total: summary.totalSales,
    originalTotal: summary.totalSales,
    finalTotal: summary.totalSales,
    operatorId: input.operatorId,
    note: failedJob?.errorMessage || "Chiusura giornaliera RT eseguita",
    lines: [],
    operationKind: "daily-close",
    closureMethod: "daily-close",
    deviceLabel: input.workstationId,
    outcome: failedJob ? "error" : "success",
    referenceNumber: closureReference,
    financialSummary: {
      ...summary,
      openTablesCount: input.openTablesCount,
    },
    rtDeviceId: printer.fiscalDeviceId || printer.name,
  });

  return {
    success: !failedJob,
    message: failedJob
      ? failedJob.errorMessage || "Errore durante la chiusura giornaliera RT"
      : "Chiusura giornaliera fiscale completata",
    archivedEntry,
    printJobs,
  };
}
