export type ArchivedPaymentLike = Record<string, unknown> & {
  id: string;
  createdAt?: string;
  created_at?: string;
  tableId?: string;
  table_id?: string;
  paymentMethod?: string;
  payment_method?: string;
  finalTotal?: number;
  total?: number;
  operationKind?: string;
};

export type PaymentParityMismatch = {
  key: string;
  legacyOrderKey: string;
  fields: string[];
};

export type PaymentsParitySnapshot = {
  fallbackCount: number;
  supabaseCount: number;
  fallbackTotalAmount: number;
  supabaseTotalAmount: number;
  missingInSupabase: string[];
  extraInSupabase: string[];
  mismatches: PaymentParityMismatch[];
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

export function isSaleArchivedEntry(entry: Record<string, unknown>) {
  return String(entry.operationKind ?? "sale") === "sale";
}

export function getArchivedPaymentAmount(entry: Record<string, unknown>) {
  return normalizeNumber(entry.finalTotal ?? entry.final_total_amount ?? entry.total ?? 0);
}

function getArchivedPaymentMethod(entry: Record<string, unknown>) {
  return normalizeText(entry.paymentMethod ?? entry.payment_method);
}

function getArchivedLegacyOrderKey(entry: Record<string, unknown>) {
  return normalizeText(entry.tableId ?? entry.table_id ?? entry.orderId ?? entry.order_id);
}

function getArchivedCreatedAt(entry: Record<string, unknown>) {
  return normalizeTimestamp(entry.createdAt ?? entry.created_at);
}

function buildComparableMap(entries: ArchivedPaymentLike[]) {
  return new Map(
    entries
      .filter((entry) => entry.id)
      .map((entry) => [
        entry.id,
        {
          legacyOrderKey: getArchivedLegacyOrderKey(entry),
          paymentMethod: getArchivedPaymentMethod(entry),
          amount: getArchivedPaymentAmount(entry),
          createdAt: getArchivedCreatedAt(entry),
        },
      ])
  );
}

export function buildPaymentsParitySnapshot(
  fallbackEntries: ArchivedPaymentLike[],
  supabaseEntries: ArchivedPaymentLike[]
): PaymentsParitySnapshot {
  const fallbackSales = fallbackEntries.filter(isSaleArchivedEntry);
  const supabaseSales = supabaseEntries.filter(isSaleArchivedEntry);
  const fallbackMap = buildComparableMap(fallbackSales);
  const supabaseMap = buildComparableMap(supabaseSales);

  const missingInSupabase: string[] = [];
  const extraInSupabase: string[] = [];
  const mismatches: PaymentParityMismatch[] = [];

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
    if (fallbackEntry.paymentMethod !== supabaseEntry.paymentMethod) {
      fields.push("paymentMethod");
    }
    if (fallbackEntry.amount !== supabaseEntry.amount) {
      fields.push("amount");
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

  const fallbackTotalAmount = fallbackSales.reduce(
    (sum, entry) => sum + getArchivedPaymentAmount(entry),
    0
  );
  const supabaseTotalAmount = supabaseSales.reduce(
    (sum, entry) => sum + getArchivedPaymentAmount(entry),
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
