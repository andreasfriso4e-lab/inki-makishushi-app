import {
  createSupabaseRows,
  deleteSupabaseRows,
  isSupabaseConfigured,
  readSupabaseRows,
  updateSupabaseRows,
} from "@/lib/server/supabase-json-store";
import { getActiveRestaurantId } from "@/lib/restaurant-config";

type ArchivedMovementLike = {
  id: string;
  createdAt?: string;
  created_at?: string;
  date?: string;
  time?: string;
  documentNumber?: string;
  tableId?: string;
  tableLabel?: string;
  roomLabel?: string;
  saleMode?: string;
  customerName?: string;
  companyName?: string;
  operator?: string;
  documentType?: string;
  paymentMethod?: string;
  total?: number;
  originalTotal?: number;
  finalTotal?: number;
  discountType?: string;
  discountPercentage?: number | null;
  discountFixedAmount?: number | null;
  discountValue?: number;
  discountLabel?: string;
  discountSummary?: string;
  subtotal_amount?: number;
  service_amount?: number;
  payment_method?: string;
  operator_id?: string;
  table_id?: string;
  notes?: string;
  note?: string;
  status?: string;
  transmissionState?: string | null;
  transmissionNote?: string;
  guests?: number;
  sourceType?: string;
  operationKind?: "sale" | "financial-report" | "daily-close";
  closureMethod?: "report" | "daily-close" | null;
  deviceLabel?: string;
  rtDeviceId?: string;
  outcome?: "success" | "error" | null;
  referenceNumber?: string;
  financialSummary?: Record<string, unknown> | null;
  fiscalDayClosedAt?: string | null;
  fiscalClosureDocumentId?: string;
  lines?: unknown[];
  actionLog?: unknown[];
};

export type { ArchivedMovementLike };

type RelationalOrderRow = {
  id: string;
  legacy_order_key: string | null;
};

type RelationalOperatorRow = {
  id: string;
  legacy_role_code: string | null;
  username: string | null;
  display_name: string;
};

type RelationalCustomerRow = {
  id: string;
  legacy_customer_id: string | null;
  full_name: string;
};

type RelationalCompanyRow = {
  id: string;
  legacy_company_id: string | null;
  business_name: string;
};

type RelationalPaymentMethodRow = {
  id: string;
  code: string;
  name: string;
};

type RelationalPaymentRow = {
  id: string;
  legacy_payment_id: string | null;
  created_at: string;
  updated_at: string;
  legacy_payload: ArchivedMovementLike | null;
};

type RelationalFiscalDocumentRow = {
  id: string;
  legacy_document_id: string | null;
  created_at: string;
  updated_at: string;
  legacy_payload: ArchivedMovementLike | null;
};

type RelationalCashClosureRow = {
  id: string;
  legacy_cash_closure_id: string | null;
  created_at: string;
  updated_at: string;
  legacy_payload: ArchivedMovementLike | null;
};

type RelationalDailyReportRow = {
  id: string;
  legacy_report_date: string | null;
  report_type: string;
  created_at: string;
  updated_at: string;
  legacy_payload: ArchivedMovementLike | null;
};

function getRestaurantIdFilter() {
  return {
    column: "restaurant_id",
    value: getActiveRestaurantId(),
  } as const;
}

function nowIso() {
  return new Date().toISOString();
}

function toNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

function getMovementCreatedAt(entry: ArchivedMovementLike) {
  return entry.created_at || entry.createdAt || nowIso();
}

function getMovementOperationKind(entry: ArchivedMovementLike) {
  return entry.operationKind ?? "sale";
}

function getMovementDateKey(entry: ArchivedMovementLike) {
  if (typeof entry.date === "string" && entry.date.length > 0) {
    const [day, month, year] = entry.date.split("/");
    if (day && month && year) {
      return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }
  }

  return getMovementCreatedAt(entry).slice(0, 10);
}

function normalizeLookupKeys(...values: Array<string | null | undefined>) {
  return values
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
}

function coerceArchivedMovement(entry: ArchivedMovementLike): ArchivedMovementLike {
  return {
    ...entry,
    createdAt: entry.createdAt ?? entry.created_at ?? nowIso(),
    created_at: entry.created_at ?? entry.createdAt ?? nowIso(),
    paymentMethod: entry.paymentMethod ?? entry.payment_method ?? "",
    payment_method: entry.payment_method ?? entry.paymentMethod ?? "",
    notes: entry.notes ?? entry.note ?? "",
    note: entry.note ?? entry.notes ?? "",
    status: entry.status ?? "Pagato",
    sourceType: entry.sourceType ?? "tavolo",
    operationKind: getMovementOperationKind(entry),
    lines: Array.isArray(entry.lines) ? entry.lines : [],
    actionLog: Array.isArray(entry.actionLog) ? entry.actionLog : [],
  };
}

async function syncByLegacyKey<TRow extends { id: string }>(
  tableName: string,
  existingRows: TRow[],
  nextRows: Array<Record<string, unknown>>,
  getExistingKey: (row: TRow) => string,
  getNextKey: (row: Record<string, unknown>) => string
) {
  const existingByKey = new Map(existingRows.map((row) => [getExistingKey(row), row]));
  const nextKeys = new Set<string>();

  for (const nextRow of nextRows) {
    const key = getNextKey(nextRow);
    if (!key) {
      continue;
    }

    nextKeys.add(key);
    const existing = existingByKey.get(key);

    if (existing) {
      await updateSupabaseRows<Record<string, unknown>>(tableName, nextRow, [
        { column: "restaurant_id", value: getActiveRestaurantId() },
        { column: "id", value: existing.id },
      ]);
    } else {
      await createSupabaseRows<Record<string, unknown>>(tableName, [nextRow]);
    }
  }

  const idsToDelete = existingRows
    .filter((row) => {
      const key = getExistingKey(row);
      return key && !nextKeys.has(key);
    })
    .map((row) => row.id);

  if (idsToDelete.length > 0) {
    await deleteSupabaseRows(tableName, [
      { column: "restaurant_id", value: getActiveRestaurantId() },
      { column: "id", operator: "in", value: idsToDelete },
    ]);
  }
}

export async function readRelationalFinancialArchiveEntries(): Promise<ArchivedMovementLike[] | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const [documents, reports, closures] = await Promise.all([
    readSupabaseRows<RelationalFiscalDocumentRow>("fiscal_documents", {
      filters: [getRestaurantIdFilter()],
      orderBy: "created_at",
      ascending: false,
    }),
    readSupabaseRows<RelationalDailyReportRow>("daily_reports", {
      filters: [getRestaurantIdFilter()],
      orderBy: "created_at",
      ascending: false,
    }),
    readSupabaseRows<RelationalCashClosureRow>("cash_closures", {
      filters: [getRestaurantIdFilter()],
      orderBy: "created_at",
      ascending: false,
    }),
  ]);

  const entries = [
    ...(documents ?? []).map((row) => row.legacy_payload).filter(Boolean),
    ...(reports ?? []).map((row) => row.legacy_payload).filter(Boolean),
    ...(closures ?? []).map((row) => row.legacy_payload).filter(Boolean),
  ].map((entry) => coerceArchivedMovement(entry as ArchivedMovementLike));

  if (entries.length === 0) {
    return null;
  }

  const dedupedById = new Map<string, ArchivedMovementLike>();
  for (const entry of entries) {
    if (!entry.id) {
      continue;
    }
    dedupedById.set(entry.id, entry);
  }

  return Array.from(dedupedById.values()).sort((left, right) =>
    getMovementCreatedAt(right).localeCompare(getMovementCreatedAt(left))
  );
}

export async function readRelationalPaymentArchiveEntries(): Promise<ArchivedMovementLike[] | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const payments = await readSupabaseRows<RelationalPaymentRow>("payments", {
    filters: [getRestaurantIdFilter()],
    orderBy: "created_at",
    ascending: false,
  });

  const entries = (payments ?? [])
    .map((row) => row.legacy_payload)
    .filter(Boolean)
    .map((entry) => coerceArchivedMovement(entry as ArchivedMovementLike));

  if (entries.length === 0) {
    return null;
  }

  const dedupedById = new Map<string, ArchivedMovementLike>();
  for (const entry of entries) {
    if (!entry.id) {
      continue;
    }
    dedupedById.set(entry.id, entry);
  }

  return Array.from(dedupedById.values()).sort((left, right) =>
    getMovementCreatedAt(right).localeCompare(getMovementCreatedAt(left))
  );
}

export async function readRelationalFiscalDocumentArchiveEntries(): Promise<ArchivedMovementLike[] | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const documents = await readSupabaseRows<RelationalFiscalDocumentRow>("fiscal_documents", {
    filters: [getRestaurantIdFilter()],
    orderBy: "created_at",
    ascending: false,
  });

  const entries = (documents ?? [])
    .map((row) => row.legacy_payload)
    .filter(Boolean)
    .map((entry) => coerceArchivedMovement(entry as ArchivedMovementLike));

  if (entries.length === 0) {
    return null;
  }

  const dedupedById = new Map<string, ArchivedMovementLike>();
  for (const entry of entries) {
    if (!entry.id) {
      continue;
    }
    dedupedById.set(entry.id, entry);
  }

  return Array.from(dedupedById.values()).sort((left, right) =>
    getMovementCreatedAt(right).localeCompare(getMovementCreatedAt(left))
  );
}

export async function readRelationalCashClosureArchiveEntries(): Promise<ArchivedMovementLike[] | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const closures = await readSupabaseRows<RelationalCashClosureRow>("cash_closures", {
    filters: [getRestaurantIdFilter()],
    orderBy: "created_at",
    ascending: false,
  });

  const entries = (closures ?? [])
    .map((row) => row.legacy_payload)
    .filter(Boolean)
    .map((entry) => coerceArchivedMovement(entry as ArchivedMovementLike));

  if (entries.length === 0) {
    return null;
  }

  const dedupedById = new Map<string, ArchivedMovementLike>();
  for (const entry of entries) {
    if (!entry.id) {
      continue;
    }
    dedupedById.set(entry.id, entry);
  }

  return Array.from(dedupedById.values()).sort((left, right) =>
    getMovementCreatedAt(right).localeCompare(getMovementCreatedAt(left))
  );
}

export async function readRelationalDailyReportArchiveEntries(): Promise<ArchivedMovementLike[] | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const reports = await readSupabaseRows<RelationalDailyReportRow>("daily_reports", {
    filters: [getRestaurantIdFilter()],
    orderBy: "created_at",
    ascending: false,
  });

  const entries = (reports ?? [])
    .map((row) => row.legacy_payload)
    .filter(Boolean)
    .map((entry) => coerceArchivedMovement(entry as ArchivedMovementLike));

  if (entries.length === 0) {
    return null;
  }

  const dedupedById = new Map<string, ArchivedMovementLike>();
  for (const entry of entries) {
    if (!entry.id) {
      continue;
    }
    dedupedById.set(entry.id, entry);
  }

  return Array.from(dedupedById.values()).sort((left, right) =>
    getMovementCreatedAt(right).localeCompare(getMovementCreatedAt(left))
  );
}

export async function writeRelationalFinancialArchiveEntries(
  entries: ArchivedMovementLike[]
): Promise<void> {
  if (!isSupabaseConfigured()) {
    return;
  }

  const [orders, operators, customers, companies, paymentMethods, existingPayments, existingDocuments, existingClosures, existingReports] =
    await Promise.all([
      readSupabaseRows<RelationalOrderRow>("orders", { filters: [getRestaurantIdFilter()] }),
      readSupabaseRows<RelationalOperatorRow>("operators", { filters: [getRestaurantIdFilter()] }),
      readSupabaseRows<RelationalCustomerRow>("customers", { filters: [getRestaurantIdFilter()] }),
      readSupabaseRows<RelationalCompanyRow>("companies", { filters: [getRestaurantIdFilter()] }),
      readSupabaseRows<RelationalPaymentMethodRow>("payment_methods", { filters: [getRestaurantIdFilter()] }),
      readSupabaseRows<RelationalPaymentRow>("payments", { filters: [getRestaurantIdFilter()] }),
      readSupabaseRows<RelationalFiscalDocumentRow>("fiscal_documents", { filters: [getRestaurantIdFilter()] }),
      readSupabaseRows<RelationalCashClosureRow>("cash_closures", { filters: [getRestaurantIdFilter()] }),
      readSupabaseRows<RelationalDailyReportRow>("daily_reports", { filters: [getRestaurantIdFilter()] }),
    ]);

  const orderIdByLegacyKey = new Map(
    (orders ?? [])
      .filter((row) => Boolean(row.legacy_order_key))
      .map((row) => [row.legacy_order_key as string, row.id])
  );

  const operatorIdByLookupKey = new Map<string, string>();
  for (const operator of operators ?? []) {
    for (const key of normalizeLookupKeys(
      operator.id,
      operator.legacy_role_code,
      operator.username,
      operator.display_name
    )) {
      operatorIdByLookupKey.set(key, operator.id);
    }
  }

  const customerIdByName = new Map(
    (customers ?? []).map((row) => [row.full_name.trim().toLowerCase(), row.id])
  );
  const companyIdByName = new Map(
    (companies ?? []).map((row) => [row.business_name.trim().toLowerCase(), row.id])
  );
  const paymentMethodIdByCode = new Map(
    (paymentMethods ?? []).map((row) => [row.code, row.id])
  );

  const saleEntries = entries
    .map(coerceArchivedMovement)
    .filter((entry) => getMovementOperationKind(entry) === "sale");
  const reportEntries = entries
    .map(coerceArchivedMovement)
    .filter((entry) => getMovementOperationKind(entry) === "financial-report");
  const closureEntries = entries
    .map(coerceArchivedMovement)
    .filter((entry) => getMovementOperationKind(entry) === "daily-close");

  const paymentRows = saleEntries.flatMap((entry) => {
    const orderId = orderIdByLegacyKey.get(entry.tableId ?? "");
    if (!orderId) {
      console.error("[financial-relational-sync] Missing order for payment", {
        movementId: entry.id,
        tableId: entry.tableId,
      });
      return [];
    }

    const operatorId =
      operatorIdByLookupKey.get(entry.operator_id ?? "") ??
      operatorIdByLookupKey.get(entry.operator ?? "") ??
      null;
    const paymentMethodCode = entry.payment_method || entry.paymentMethod || "";

    return [
      {
        restaurant_id: getActiveRestaurantId(),
        order_id: orderId,
        operator_id: operatorId,
        payment_method_id: paymentMethodIdByCode.get(paymentMethodCode) ?? null,
        payment_method_name_snapshot: paymentMethodCode || null,
        document_type: entry.documentType ?? "Scontrino",
        status: "confirmed",
        subtotal_amount: toNumber(entry.subtotal_amount, toNumber(entry.originalTotal, toNumber(entry.total))),
        discount_amount: toNumber(entry.discountValue),
        surcharge_amount: 0,
        paid_amount: toNumber(entry.finalTotal, toNumber(entry.total)),
        tendered_amount: toNumber(entry.finalTotal, toNumber(entry.total)),
        change_amount: 0,
        notes: entry.notes ?? entry.note ?? null,
        metadata: {
          legacy_order_id: entry.tableId ?? null,
          legacy_table_id: entry.tableId ?? null,
          payment_status: entry.status ?? "Pagato",
        },
        legacy_payload: entry,
        legacy_payment_id: entry.id,
        legacy_order_id: entry.tableId ?? null,
        legacy_table_id: entry.tableId ?? null,
        created_at: getMovementCreatedAt(entry),
        updated_at: getMovementCreatedAt(entry),
      },
    ];
  });

  await syncByLegacyKey(
    "payments",
    existingPayments ?? [],
    paymentRows,
    (row) => row.legacy_payment_id ?? row.id,
    (row) => String(row.legacy_payment_id ?? "")
  );

  const refreshedPayments =
    (await readSupabaseRows<RelationalPaymentRow>("payments", {
      filters: [getRestaurantIdFilter()],
    })) ?? [];
  const paymentIdByLegacyId = new Map(
    refreshedPayments
      .filter((row) => Boolean(row.legacy_payment_id))
      .map((row) => [row.legacy_payment_id as string, row.id])
  );

  const documentRows = saleEntries.map((entry) => {
    const orderId = orderIdByLegacyKey.get(entry.tableId ?? "") ?? null;
    const customerId = customerIdByName.get((entry.customerName ?? "").trim().toLowerCase()) ?? null;
    const companyId = companyIdByName.get((entry.companyName ?? "").trim().toLowerCase()) ?? null;

    return {
      restaurant_id: getActiveRestaurantId(),
      order_id: orderId,
      payment_id: paymentIdByLegacyId.get(entry.id) ?? null,
      customer_id: customerId,
      company_id: companyId,
      document_type: entry.documentType ?? "Scontrino",
      document_number: entry.documentNumber ?? null,
      document_status: entry.status === "Annullato" ? "voided" : "issued",
      subtotal_amount: toNumber(entry.subtotal_amount, toNumber(entry.originalTotal, toNumber(entry.total))),
      discount_amount: toNumber(entry.discountValue),
      surcharge_amount: 0,
      total_amount: toNumber(entry.finalTotal, toNumber(entry.total)),
      issue_date: getMovementCreatedAt(entry),
      payload: {
        lines: entry.lines ?? [],
        transmissionState: entry.transmissionState ?? null,
        transmissionNote: entry.transmissionNote ?? "",
      },
      metadata: {
        legacy_order_id: entry.tableId ?? null,
        legacy_table_id: entry.tableId ?? null,
      },
      legacy_payload: entry,
      legacy_document_id: entry.id,
      legacy_order_id: entry.tableId ?? null,
      legacy_table_id: entry.tableId ?? null,
      created_at: getMovementCreatedAt(entry),
      updated_at: getMovementCreatedAt(entry),
    };
  });

  await syncByLegacyKey(
    "fiscal_documents",
    existingDocuments ?? [],
    documentRows,
    (row) => row.legacy_document_id ?? row.id,
    (row) => String(row.legacy_document_id ?? "")
  );

  const reportRows = reportEntries.map((entry) => ({
    restaurant_id: getActiveRestaurantId(),
    report_date: getMovementDateKey(entry),
    report_type: "financial-report",
    period_start: getMovementCreatedAt(entry),
    period_end: getMovementCreatedAt(entry),
    payload: {
      financialSummary: entry.financialSummary ?? null,
      lines: entry.lines ?? [],
    },
    metadata: {
      closureMethod: entry.closureMethod ?? null,
      referenceNumber: entry.referenceNumber ?? null,
    },
    legacy_payload: entry,
    legacy_report_date: getMovementDateKey(entry),
    created_at: getMovementCreatedAt(entry),
    updated_at: getMovementCreatedAt(entry),
  }));

  await syncByLegacyKey(
    "daily_reports",
    existingReports ?? [],
    reportRows,
    (row) => `${row.report_type}::${row.legacy_report_date ?? row.id}`,
    (row) => `${String(row.report_type ?? "")}::${String(row.legacy_report_date ?? "")}`
  );

  const closureRows = closureEntries.map((entry) => {
    const paymentBreakdown = (entry.financialSummary?.byPaymentMethod as Record<string, number> | undefined) ?? {};
    return {
      restaurant_id: getActiveRestaurantId(),
      room_id: null,
      closed_by_operator_id:
        operatorIdByLookupKey.get(entry.operator_id ?? "") ??
        operatorIdByLookupKey.get(entry.operator ?? "") ??
        null,
      closure_code: entry.referenceNumber || entry.id,
      period_start: getMovementCreatedAt(entry),
      period_end: entry.fiscalDayClosedAt || getMovementCreatedAt(entry),
      cash_total: toNumber(paymentBreakdown["Contanti"]),
      card_total: toNumber(paymentBreakdown["Carta"]) + toNumber(paymentBreakdown["BANCOMAT"]) + toNumber(paymentBreakdown["Bancomat"]),
      other_total:
        toNumber(entry.finalTotal, toNumber(entry.total)) -
        toNumber(paymentBreakdown["Contanti"]) -
        (toNumber(paymentBreakdown["Carta"]) + toNumber(paymentBreakdown["BANCOMAT"]) + toNumber(paymentBreakdown["Bancomat"])),
      grand_total: toNumber(entry.finalTotal, toNumber(entry.total)),
      notes: entry.notes ?? entry.note ?? null,
      payload: {
        financialSummary: entry.financialSummary ?? null,
        rtDeviceId: entry.rtDeviceId ?? "",
        deviceLabel: entry.deviceLabel ?? "",
      },
      metadata: {
        outcome: entry.outcome ?? null,
        fiscalDayClosedAt: entry.fiscalDayClosedAt ?? null,
      },
      legacy_payload: entry,
      legacy_cash_closure_id: entry.id,
      legacy_report_date: getMovementDateKey(entry),
      created_at: getMovementCreatedAt(entry),
      updated_at: getMovementCreatedAt(entry),
    };
  });

  await syncByLegacyKey(
    "cash_closures",
    existingClosures ?? [],
    closureRows,
    (row) => row.legacy_cash_closure_id ?? row.id,
    (row) => String(row.legacy_cash_closure_id ?? "")
  );
}
