export type ArchivedFinancialDomainLike = Record<string, unknown> & {
  id: string;
  createdAt?: string;
  created_at?: string;
  operationKind?: string;
  closureMethod?: string | null;
  referenceNumber?: string;
  finalTotal?: number;
  total?: number;
  status?: string;
  documentType?: string;
  date?: string;
};

export type FinancialDomainParityMismatch = {
  key: string;
  fields: string[];
};

export type FinancialDomainParitySnapshot = {
  fallbackCount: number;
  supabaseCount: number;
  fallbackTotalAmount: number;
  supabaseTotalAmount: number;
  missingInSupabase: string[];
  extraInSupabase: string[];
  mismatches: FinancialDomainParityMismatch[];
  clean: boolean;
};

export type FinancialDomainParitySelector = {
  filter: (entry: ArchivedFinancialDomainLike) => boolean;
  getMatchKey?: (entry: ArchivedFinancialDomainLike) => string;
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

export function getArchivedFinancialAmount(entry: Record<string, unknown>) {
  return normalizeNumber(entry.finalTotal ?? entry.final_total_amount ?? entry.total ?? 0);
}

function defaultMatchKey(entry: ArchivedFinancialDomainLike) {
  return normalizeText(entry.id);
}

function buildComparableMap(
  entries: ArchivedFinancialDomainLike[],
  getMatchKey: (entry: ArchivedFinancialDomainLike) => string
) {
  return new Map(
    entries
      .filter((entry) => entry.id)
      .map((entry) => [
        getMatchKey(entry) || entry.id,
        {
          id: entry.id,
          operationKind: normalizeText(entry.operationKind),
          closureMethod: normalizeText(entry.closureMethod),
          referenceNumber: normalizeText(entry.referenceNumber),
          documentType: normalizeText(entry.documentType),
          status: normalizeText(entry.status),
          amount: getArchivedFinancialAmount(entry),
          date: normalizeText(entry.date),
          createdAt: normalizeTimestamp(entry.createdAt ?? entry.created_at),
        },
      ])
  );
}

export function buildFinancialDomainParitySnapshot(
  fallbackEntries: ArchivedFinancialDomainLike[],
  supabaseEntries: ArchivedFinancialDomainLike[],
  selector: FinancialDomainParitySelector
): FinancialDomainParitySnapshot {
  const getMatchKey = selector.getMatchKey ?? defaultMatchKey;
  const fallbackDomain = fallbackEntries.filter(selector.filter);
  const supabaseDomain = supabaseEntries.filter(selector.filter);
  const fallbackMap = buildComparableMap(fallbackDomain, getMatchKey);
  const supabaseMap = buildComparableMap(supabaseDomain, getMatchKey);

  const missingInSupabase: string[] = [];
  const extraInSupabase: string[] = [];
  const mismatches: FinancialDomainParityMismatch[] = [];

  for (const [key, fallbackEntry] of fallbackMap.entries()) {
    const supabaseEntry = supabaseMap.get(key);
    if (!supabaseEntry) {
      missingInSupabase.push(key);
      continue;
    }

    const fields: string[] = [];
    if (fallbackEntry.operationKind !== supabaseEntry.operationKind) fields.push("operationKind");
    if (fallbackEntry.closureMethod !== supabaseEntry.closureMethod) fields.push("closureMethod");
    if (fallbackEntry.referenceNumber !== supabaseEntry.referenceNumber) fields.push("referenceNumber");
    if (fallbackEntry.documentType !== supabaseEntry.documentType) fields.push("documentType");
    if (fallbackEntry.status !== supabaseEntry.status) fields.push("status");
    if (fallbackEntry.amount !== supabaseEntry.amount) fields.push("amount");
    if (fallbackEntry.date !== supabaseEntry.date) fields.push("date");
    if (fallbackEntry.createdAt !== supabaseEntry.createdAt) fields.push("createdAt");

    if (fields.length > 0) {
      mismatches.push({ key: fallbackEntry.id, fields });
    }
  }

  for (const key of supabaseMap.keys()) {
    if (!fallbackMap.has(key)) {
      extraInSupabase.push(key);
    }
  }

  const fallbackTotalAmount = fallbackDomain.reduce(
    (sum, entry) => sum + getArchivedFinancialAmount(entry),
    0
  );
  const supabaseTotalAmount = supabaseDomain.reduce(
    (sum, entry) => sum + getArchivedFinancialAmount(entry),
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
