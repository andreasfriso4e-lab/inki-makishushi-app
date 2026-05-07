"use client";

import type { OrderItem } from "@/lib/pos-data";
import { getRestaurantStorageKey } from "@/lib/restaurant-storage";

export type ArchivedMovementStatus =
  | "Pagato"
  | "Annullato"
  | "Riaperto"
  | "Stornato"
  | "Trasformato in fattura"
  | "Corretto";

export type ArchivedTransmissionState = "Inviato" | "Da inviare" | "Errore invio" | null;

export type ArchivedDocumentType = "Scontrino" | "Scontrino parlante" | "Fattura";
export type ArchivedOperationKind = "sale" | "financial-report" | "daily-close";

export type ArchiveActionType =
  | "created"
  | "paid"
  | "reopened"
  | "moved"
  | "annulled"
  | "converted-to-invoice"
  | "reprinted"
  | "corrected"
  | "marked-sent"
  | "transmission-error";

export type ArchivedMovementActionLog = {
  id: string;
  at: string;
  operator: string;
  action: ArchiveActionType;
  note?: string;
};

export type ArchivedMovementLine = {
  id: string;
  productId: string;
  name: string;
  quantity: number;
  sentQuantity?: number;
  unitPrice: number;
  originalUnitPrice?: number;
  course: OrderItem["course"];
  status: OrderItem["status"];
  paymentState?: OrderItem["paymentState"];
  operatorLabel?: string;
  note?: string;
  additions?: string[];
  removals?: string[];
  vatRateKey?: string;
  vatRateLabel?: string;
  vatRateValue?: number | null;
};

export type ArchivedMovement = {
  id: string;
  createdAt: string;
  created_at: string;
  date: string;
  time: string;
  documentNumber: string;
  tableId: string;
  tableLabel: string;
  roomLabel: string;
  saleMode: string;
  customerName: string;
  companyName: string;
  operator: string;
  documentType: ArchivedDocumentType;
  paymentMethod: string;
  total: number;
  originalTotal: number;
  finalTotal: number;
  discountType: "none" | "fixed" | "percent" | "fidelity" | "mixed";
  discountPercentage: number | null;
  discountFixedAmount: number | null;
  discountValue: number;
  discountLabel: string;
  discountSummary: string;
  subtotal_amount: number;
  service_amount: number;
  discount_type: "none" | "fixed" | "percent" | "fidelity" | "mixed";
  discount_label: string;
  discount_value: number;
  discount_percent: number | null;
  total_amount: number;
  final_total_amount: number;
  payment_method: string;
  operator_id: string;
  table_id: string;
  appOrderId?: string;
  appOrderExternalCode?: string;
  appOrderInternalId?: string;
  orderFinalStatus?: string;
  origin?: "POS" | "APP";
  notes: string;
  status: ArchivedMovementStatus;
  transmissionState: ArchivedTransmissionState;
  transmissionNote: string;
  note: string;
  guests: number;
  sourceType: "tavolo" | "takeaway";
  operationKind: ArchivedOperationKind;
  closureMethod?: "report" | "daily-close" | null;
  deviceLabel?: string;
  rtDeviceId?: string;
  outcome?: "success" | "error" | null;
  referenceNumber?: string;
  financialSummary?: {
    totalSales: number;
    totalDocuments: number;
    receiptCount?: number;
    invoiceCount?: number;
    openTablesCount?: number;
    byPaymentMethod: Record<string, number>;
  } | null;
  fiscalDayClosedAt?: string | null;
  fiscalClosureDocumentId?: string;
  lines: ArchivedMovementLine[];
  actionLog: ArchivedMovementActionLog[];
  reopenedTableId?: string;
};

type NewArchivedMovementInput = {
  tableId: string;
  tableLabel: string;
  roomLabel: string;
  saleMode: string;
  customerName: string;
  companyName: string;
  operator: string;
  documentType: ArchivedDocumentType;
  paymentMethod: string;
  total: number;
  originalTotal: number;
  finalTotal: number;
  subtotalAmount: number;
  serviceAmount: number;
  discountType: "none" | "fixed" | "percent" | "fidelity" | "mixed";
  discountPercentage: number | null;
  discountFixedAmount: number | null;
  discountValue: number;
  discountLabel: string;
  discountSummary: string;
  operatorId: string;
  appOrderId?: string;
  appOrderExternalCode?: string;
  appOrderInternalId?: string;
  orderFinalStatus?: string;
  origin?: "POS" | "APP";
  note: string;
  guests: number;
  sourceType: "tavolo" | "takeaway";
  lines: ArchivedMovementLine[];
  operationKind?: ArchivedOperationKind;
  closureMethod?: "report" | "daily-close" | null;
  deviceLabel?: string;
  rtDeviceId?: string;
  outcome?: "success" | "error" | null;
  referenceNumber?: string;
  financialSummary?: {
    totalSales: number;
    totalDocuments: number;
    receiptCount?: number;
    invoiceCount?: number;
    openTablesCount?: number;
    byPaymentMethod: Record<string, number>;
  } | null;
  fiscalDayClosedAt?: string | null;
  fiscalClosureDocumentId?: string;
};

const DOCUMENT_ARCHIVE_STORAGE_KEY = getRestaurantStorageKey("pos-document-archive");
const FINANCIAL_ARCHIVE_API_ENDPOINT = "/api/financial-archive";
export const DOCUMENT_ARCHIVE_CHANGED_EVENT = "pos:document-archive-changed";

function getNowParts() {
  const now = new Date();
  const date = now.toLocaleDateString("it-IT");
  const time = now.toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const compactDate = now
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, "");

  return {
    iso: now.toISOString(),
    date,
    time,
    compactDate,
  };
}

function readArchiveStorage(): ArchivedMovement[] {
  if (typeof window === "undefined") {
    return [];
  }

  const rawValue = window.localStorage.getItem(DOCUMENT_ARCHIVE_STORAGE_KEY);

  if (!rawValue) {
    return [];
  }

  try {
    const parsedValue = JSON.parse(rawValue) as ArchivedMovement[];
    return Array.isArray(parsedValue)
      ? parsedValue.map((entry) => ({
          ...entry,
          created_at: entry.created_at ?? entry.createdAt ?? new Date().toISOString(),
          originalTotal: entry.originalTotal ?? entry.total ?? 0,
          finalTotal: entry.finalTotal ?? entry.total ?? 0,
          discountType: entry.discountType ?? "none",
          discountPercentage: entry.discountPercentage ?? null,
          discountFixedAmount: entry.discountFixedAmount ?? null,
          discountValue: entry.discountValue ?? 0,
          discountLabel: entry.discountLabel ?? "",
          discountSummary: entry.discountSummary ?? "",
          subtotal_amount: entry.subtotal_amount ?? entry.originalTotal ?? entry.total ?? 0,
          service_amount: entry.service_amount ?? 0,
          discount_type: entry.discount_type ?? entry.discountType ?? "none",
          discount_label: entry.discount_label ?? entry.discountLabel ?? "",
          discount_value: entry.discount_value ?? entry.discountValue ?? 0,
          discount_percent: entry.discount_percent ?? entry.discountPercentage ?? null,
          total_amount: entry.total_amount ?? entry.finalTotal ?? entry.total ?? 0,
          final_total_amount:
            entry.final_total_amount ?? entry.total_amount ?? entry.finalTotal ?? entry.total ?? 0,
          payment_method: entry.payment_method ?? entry.paymentMethod ?? "",
          operator_id: entry.operator_id ?? "",
          table_id: entry.table_id ?? entry.tableId ?? "",
          appOrderId: entry.appOrderId ?? "",
          appOrderExternalCode: entry.appOrderExternalCode ?? "",
          appOrderInternalId: entry.appOrderInternalId ?? "",
          orderFinalStatus: entry.orderFinalStatus ?? "",
          origin: entry.origin ?? "POS",
          notes: entry.notes ?? entry.note ?? "",
          operationKind: entry.operationKind ?? "sale",
          closureMethod: entry.closureMethod ?? null,
          deviceLabel: entry.deviceLabel ?? "",
          rtDeviceId: entry.rtDeviceId ?? "",
          outcome: entry.outcome ?? null,
          referenceNumber: entry.referenceNumber ?? "",
          financialSummary: entry.financialSummary ?? null,
          fiscalDayClosedAt: entry.fiscalDayClosedAt ?? null,
          fiscalClosureDocumentId: entry.fiscalClosureDocumentId ?? "",
        }))
      : [];
  } catch {
    window.localStorage.removeItem(DOCUMENT_ARCHIVE_STORAGE_KEY);
    return [];
  }
}

export function getDocumentArchive() {
  return readArchiveStorage();
}

export function saveDocumentArchive(entries: ArchivedMovement[]) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(DOCUMENT_ARCHIVE_STORAGE_KEY, JSON.stringify(entries));
    window.dispatchEvent(
      new CustomEvent(DOCUMENT_ARCHIVE_CHANGED_EVENT, {
        detail: entries,
      })
    );
    void persistDocumentArchiveToServer(entries);
  }

  return entries;
}

export async function hydrateDocumentArchiveFromServer() {
  if (typeof window === "undefined") {
    return getDocumentArchive();
  }

  try {
    const response = await fetch(FINANCIAL_ARCHIVE_API_ENDPOINT, {
      method: "GET",
      cache: "no-store",
      headers: {
        "Cache-Control": "no-store",
      },
    });

    if (!response.ok) {
      return getDocumentArchive();
    }

    const payload = (await response.json()) as { entries?: ArchivedMovement[] };
    if (Array.isArray(payload.entries)) {
      saveDocumentArchive(payload.entries);
      return payload.entries;
    }
  } catch {
    // fallback locale
  }

  return getDocumentArchive();
}

export async function persistDocumentArchiveToServer(entries: ArchivedMovement[]) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const response = await fetch(FINANCIAL_ARCHIVE_API_ENDPOINT, {
      method: "PUT",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
      body: JSON.stringify({ entries }),
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as { entries?: ArchivedMovement[]; updatedAt?: string };
  } catch {
    return null;
  }
}

function buildDocumentPrefix(documentType: ArchivedDocumentType) {
  if (documentType === "Fattura") {
    return "FAT";
  }

  if (documentType === "Scontrino parlante") {
    return "PAR";
  }

  return "SCR";
}

function buildDocumentNumber(
  existingEntries: ArchivedMovement[],
  documentType: ArchivedDocumentType,
  compactDate: string
) {
  const prefix = buildDocumentPrefix(documentType);
  const dailyEntries = existingEntries.filter((entry) =>
    entry.documentNumber.startsWith(`${prefix}-${compactDate}-`)
  );

  return `${prefix}-${compactDate}-${String(dailyEntries.length + 1).padStart(4, "0")}`;
}

export function createArchiveLogEntry(
  operator: string,
  action: ArchiveActionType,
  note?: string
): ArchivedMovementActionLog {
  return {
    id: `archive-log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    operator: operator || "Admin",
    action,
    note,
  };
}

export function addArchivedMovement(input: NewArchivedMovementInput) {
  const existingEntries = getDocumentArchive();
  const { iso, date, time, compactDate } = getNowParts();
  const documentNumber = buildDocumentNumber(existingEntries, input.documentType, compactDate);
  const operationKind = input.operationKind ?? "sale";
  const shouldTrackTransmission = operationKind === "sale" ? input.documentType !== "Fattura" : operationKind === "daily-close";

  const newEntry: ArchivedMovement = {
    id: `archived-movement-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: iso,
    created_at: iso,
    date,
    time,
    documentNumber,
    tableId: input.tableId,
    tableLabel: input.tableLabel,
    roomLabel: input.roomLabel,
    saleMode: input.saleMode,
    customerName: input.customerName,
    companyName: input.companyName,
    operator: input.operator || "Admin",
    documentType: input.documentType,
    paymentMethod: input.paymentMethod,
    total: input.total,
    originalTotal: input.originalTotal,
    finalTotal: input.finalTotal,
    discountType: input.discountType,
    discountPercentage: input.discountPercentage,
    discountFixedAmount: input.discountFixedAmount,
    discountValue: input.discountValue,
    discountLabel: input.discountLabel,
    discountSummary: input.discountSummary,
    subtotal_amount: input.subtotalAmount,
    service_amount: input.serviceAmount,
    discount_type: input.discountType,
    discount_label: input.discountLabel,
    discount_value: input.discountValue,
    discount_percent: input.discountPercentage,
    total_amount: input.finalTotal,
    final_total_amount: input.finalTotal,
    payment_method: input.paymentMethod,
    operator_id: input.operatorId,
    table_id: input.tableId,
    appOrderId: input.appOrderId ?? "",
    appOrderExternalCode: input.appOrderExternalCode ?? "",
    appOrderInternalId: input.appOrderInternalId ?? "",
    orderFinalStatus: input.orderFinalStatus ?? "",
    origin: input.origin ?? "POS",
    notes: input.note,
    status: "Pagato",
    transmissionState:
      operationKind === "daily-close"
        ? input.outcome === "error"
          ? "Errore invio"
          : "Inviato"
        : shouldTrackTransmission
          ? "Da inviare"
          : null,
    transmissionNote:
      operationKind === "daily-close"
        ? input.note
        : shouldTrackTransmission
          ? "In attesa di invio"
          : "",
    note: input.note,
    guests: input.guests,
    sourceType: input.sourceType,
    operationKind,
    closureMethod: input.closureMethod ?? null,
    deviceLabel: input.deviceLabel ?? "",
    rtDeviceId: input.rtDeviceId ?? "",
    outcome: input.outcome ?? null,
    referenceNumber: input.referenceNumber ?? "",
    financialSummary: input.financialSummary ?? null,
    fiscalDayClosedAt: input.fiscalDayClosedAt ?? null,
    fiscalClosureDocumentId: input.fiscalClosureDocumentId ?? "",
    lines: input.lines,
    actionLog: [
      createArchiveLogEntry(input.operator, "created", "Movimento archiviato"),
      createArchiveLogEntry(input.operator, "paid", `Documento ${documentNumber} registrato`),
    ],
  };

  saveDocumentArchive([newEntry, ...existingEntries]);

  return newEntry;
}

export function addOperationalArchivedMovement(
  input: Omit<
    NewArchivedMovementInput,
    "documentType" | "sourceType" | "guests" | "discountType" | "discountPercentage" | "discountFixedAmount" | "discountValue" | "discountLabel" | "discountSummary" | "subtotalAmount" | "serviceAmount"
  > & {
    documentType?: ArchivedDocumentType;
    sourceType?: "tavolo" | "takeaway";
    guests?: number;
    subtotalAmount?: number;
    serviceAmount?: number;
    discountType?: NewArchivedMovementInput["discountType"];
    discountPercentage?: number | null;
    discountFixedAmount?: number | null;
    discountValue?: number;
    discountLabel?: string;
    discountSummary?: string;
  }
) {
  return addArchivedMovement({
    ...input,
    documentType: input.documentType ?? "Scontrino",
    sourceType: input.sourceType ?? "tavolo",
    guests: input.guests ?? 0,
    subtotalAmount: input.subtotalAmount ?? input.originalTotal,
    serviceAmount: input.serviceAmount ?? 0,
    discountType: input.discountType ?? "none",
    discountPercentage: input.discountPercentage ?? null,
    discountFixedAmount: input.discountFixedAmount ?? null,
    discountValue: input.discountValue ?? 0,
    discountLabel: input.discountLabel ?? "",
    discountSummary: input.discountSummary ?? "",
  });
}
