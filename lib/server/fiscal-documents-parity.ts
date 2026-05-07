export type ArchivedFiscalDocumentLike = Record<string, unknown> & {
  id: string;
  createdAt?: string;
  created_at?: string;
  tableId?: string;
  table_id?: string;
  orderId?: string;
  order_id?: string;
  paymentId?: string;
  payment_id?: string;
  documentType?: string;
  documentNumber?: string;
  referenceNumber?: string;
  finalTotal?: number;
  total?: number;
  status?: string;
};

export type FiscalDocumentsParityMismatch = {
  key: string;
  legacyOrderKey: string;
  fields: string[];
};

export type FiscalDocumentsParitySnapshot = {
  fallbackCount: number;
  supabaseCount: number;
  fallbackTotalAmount: number;
  supabaseTotalAmount: number;
  missingInSupabase: string[];
  extraInSupabase: string[];
  mismatches: FiscalDocumentsParityMismatch[];
  clean: boolean;
};

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeNumber(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function normalizeTimestamp(value: unknown) {
  return normalizeText(value);
}

export function isFiscalDocumentArchivedEntry(entry: Record<string, unknown>) {
  return (
    Boolean(normalizeText(entry.documentType)) ||
    Boolean(normalizeText(entry.documentNumber)) ||
    Boolean(normalizeText(entry.referenceNumber))
  );
}

export function getArchivedFiscalDocumentAmount(entry: Record<string, unknown>) {
  return normalizeNumber(entry.finalTotal ?? entry.final_total_amount ?? entry.total ?? 0);
}

function getArchivedFiscalLegacyOrderKey(entry: Record<string, unknown>) {
  return normalizeText(entry.tableId ?? entry.table_id ?? entry.orderId ?? entry.order_id);
}

function getArchivedFiscalPaymentKey(entry: Record<string, unknown>) {
  return normalizeText(entry.paymentId ?? entry.payment_id);
}

function getArchivedFiscalDocumentType(entry: Record<string, unknown>) {
  return normalizeText(entry.documentType);
}

function getArchivedFiscalDocumentNumber(entry: Record<string, unknown>) {
  return normalizeText(entry.documentNumber ?? entry.referenceNumber);
}

function getArchivedFiscalStatus(entry: Record<string, unknown>) {
  return normalizeText(entry.status);
}

function getArchivedFiscalCreatedAt(entry: Record<string, unknown>) {
  return normalizeTimestamp(entry.createdAt ?? entry.created_at);
}

function buildComparableMap(entries: ArchivedFiscalDocumentLike[]) {
  return new Map(
    entries
      .filter((entry) => entry.id)
      .map((entry) => [
        entry.id,
        {
          legacyOrderKey: getArchivedFiscalLegacyOrderKey(entry),
          paymentKey: getArchivedFiscalPaymentKey(entry),
          documentType: getArchivedFiscalDocumentType(entry),
          documentNumber: getArchivedFiscalDocumentNumber(entry),
          amount: getArchivedFiscalDocumentAmount(entry),
          status: getArchivedFiscalStatus(entry),
          createdAt: getArchivedFiscalCreatedAt(entry),
        },
      ])
  );
}

export function buildFiscalDocumentsParitySnapshot(
  fallbackEntries: ArchivedFiscalDocumentLike[],
  supabaseEntries: ArchivedFiscalDocumentLike[]
): FiscalDocumentsParitySnapshot {
  const fallbackDocuments = fallbackEntries.filter(isFiscalDocumentArchivedEntry);
  const supabaseDocuments = supabaseEntries.filter(isFiscalDocumentArchivedEntry);
  const fallbackMap = buildComparableMap(fallbackDocuments);
  const supabaseMap = buildComparableMap(supabaseDocuments);

  const missingInSupabase: string[] = [];
  const extraInSupabase: string[] = [];
  const mismatches: FiscalDocumentsParityMismatch[] = [];

  for (const [key, fallbackEntry] of fallbackMap.entries()) {
    const supabaseEntry = supabaseMap.get(key);
    if (!supabaseEntry) {
      missingInSupabase.push(key);
      continue;
    }

    const fields: string[] = [];
    if (fallbackEntry.legacyOrderKey !== supabaseEntry.legacyOrderKey) {
      fields.push("legacyOrderKey");
    }
    if (fallbackEntry.paymentKey !== supabaseEntry.paymentKey) {
      fields.push("paymentKey");
    }
    if (fallbackEntry.documentType !== supabaseEntry.documentType) {
      fields.push("documentType");
    }
    if (fallbackEntry.documentNumber !== supabaseEntry.documentNumber) {
      fields.push("documentNumber");
    }
    if (fallbackEntry.amount !== supabaseEntry.amount) {
      fields.push("amount");
    }
    if (fallbackEntry.status !== supabaseEntry.status) {
      fields.push("status");
    }
    if (fallbackEntry.createdAt !== supabaseEntry.createdAt) {
      fields.push("createdAt");
    }

    if (fields.length > 0) {
      mismatches.push({
        key,
        legacyOrderKey: fallbackEntry.legacyOrderKey,
        fields,
      });
    }
  }

  for (const key of supabaseMap.keys()) {
    if (!fallbackMap.has(key)) {
      extraInSupabase.push(key);
    }
  }

  const fallbackTotalAmount = fallbackDocuments.reduce(
    (sum, entry) => sum + getArchivedFiscalDocumentAmount(entry),
    0
  );
  const supabaseTotalAmount = supabaseDocuments.reduce(
    (sum, entry) => sum + getArchivedFiscalDocumentAmount(entry),
    0
  );

  return {
    fallbackCount: fallbackMap.size,
    supabaseCount: supabaseMap.size,
    fallbackTotalAmount,
    supabaseTotalAmount,
    missingInSupabase,
    extraInSupabase,
    mismatches,
    clean:
      missingInSupabase.length === 0 &&
      extraInSupabase.length === 0 &&
      mismatches.length === 0 &&
      fallbackTotalAmount === supabaseTotalAmount,
  };
}
