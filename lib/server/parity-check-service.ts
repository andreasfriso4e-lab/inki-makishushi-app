import type { AuditLogEntry } from "@/types/audit";
import type { FidelityPointsMovementRecord, FidelityProfileRecord, FidelityRewardRecord, FidelityRewardRedemptionRecord } from "@/lib/server/supabase-relational-fidelity-repository";
import type { PrinterRoutingRule } from "@/lib/printer-routing";
import type { PrinterRecord } from "@/lib/printer-settings";
import type { FiscalPrinterLogEntry } from "@/lib/fiscal-printer-log";
import type { StornoRecord } from "@/lib/storno-log";
import type { OrderItem, PosTableState } from "@/lib/pos-data";
import {
  readFallbackSharedFinancialArchiveState,
} from "@/lib/server/shared-financial-archive-store";
import {
  readRelationalCashClosureArchiveEntries,
  readRelationalDailyReportArchiveEntries,
  readRelationalFiscalDocumentArchiveEntries,
  readRelationalPaymentArchiveEntries,
} from "@/lib/server/supabase-relational-financial-repository";
import {
  readFallbackSharedTablesState,
} from "@/lib/server/shared-tables-store";
import {
  readRelationalOperationalTableOverlays,
} from "@/lib/server/supabase-relational-order-repository";
import {
  readFallbackSharedPrintingConfig,
} from "@/lib/server/shared-printing-config-store";
import {
  readRelationalPrintingOpsState,
} from "@/lib/server/supabase-relational-ops-repository";
import {
  readFallbackFidelityState,
} from "@/lib/server/shared-fidelity-store";
import {
  readRelationalFidelityState,
} from "@/lib/server/supabase-relational-fidelity-repository";
import {
  readFallbackOperationalLogsState,
} from "@/lib/server/shared-operational-logs-store";

export type ParityCheckDomain =
  | "orders"
  | "order_lines"
  | "order_courses"
  | "order_guests"
  | "payments"
  | "fiscal_documents"
  | "cash_closures"
  | "daily_reports"
  | "printer_configs"
  | "printer_routing_rules"
  | "fidelity"
  | "operational_logs";

export type ParityCheckDifference = {
  key: string;
  legacyId?: string | null;
  relationalId?: string | null;
  differenceType: "mismatch" | "missingInSupabase" | "missingInFallback";
  fields?: string[];
};

export type ParityCheckDomainResult = {
  domain: ParityCheckDomain;
  checked: number;
  matched: number;
  mismatched: number;
  missingInSupabase: number;
  missingInFallback: number;
  errors: string[];
  differences: ParityCheckDifference[];
};

type ComparableRecord = {
  key: string;
  legacyId?: string | null;
  relationalId?: string | null;
  fields: Record<string, unknown>;
};

const ALL_PARITY_DOMAINS: ParityCheckDomain[] = [
  "orders",
  "order_lines",
  "order_courses",
  "order_guests",
  "payments",
  "fiscal_documents",
  "cash_closures",
  "daily_reports",
  "printer_configs",
  "printer_routing_rules",
  "fidelity",
  "operational_logs",
];

function stableNormalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => stableNormalize(entry));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, stableNormalize(nestedValue)])
    );
  }

  return value;
}

function equalValue(left: unknown, right: unknown) {
  return JSON.stringify(stableNormalize(left)) === JSON.stringify(stableNormalize(right));
}

function buildResult(domain: ParityCheckDomain): ParityCheckDomainResult {
  return {
    domain,
    checked: 0,
    matched: 0,
    mismatched: 0,
    missingInSupabase: 0,
    missingInFallback: 0,
    errors: [],
    differences: [],
  };
}

function compareComparableSets(
  domain: ParityCheckDomain,
  fallbackRecords: ComparableRecord[],
  supabaseRecords: ComparableRecord[]
): ParityCheckDomainResult {
  const result = buildResult(domain);
  const fallbackByKey = new Map(fallbackRecords.map((record) => [record.key, record]));
  const supabaseByKey = new Map(supabaseRecords.map((record) => [record.key, record]));
  const keys = new Set([...fallbackByKey.keys(), ...supabaseByKey.keys()]);

  result.checked = keys.size;

  for (const key of keys) {
    const fallbackRecord = fallbackByKey.get(key);
    const supabaseRecord = supabaseByKey.get(key);

    if (!fallbackRecord && supabaseRecord) {
      result.missingInFallback += 1;
      result.differences.push({
        key,
        legacyId: supabaseRecord.legacyId,
        relationalId: supabaseRecord.relationalId,
        differenceType: "missingInFallback",
      });
      continue;
    }

    if (fallbackRecord && !supabaseRecord) {
      result.missingInSupabase += 1;
      result.differences.push({
        key,
        legacyId: fallbackRecord.legacyId,
        relationalId: fallbackRecord.relationalId,
        differenceType: "missingInSupabase",
      });
      continue;
    }

    const differingFields = Object.keys({
      ...fallbackRecord?.fields,
      ...supabaseRecord?.fields,
    }).filter(
      (field) =>
        !equalValue(
          fallbackRecord?.fields[field],
          supabaseRecord?.fields[field]
        )
    );

    if (differingFields.length > 0) {
      result.mismatched += 1;
      result.differences.push({
        key,
        legacyId: fallbackRecord?.legacyId ?? supabaseRecord?.legacyId,
        relationalId: supabaseRecord?.relationalId ?? fallbackRecord?.relationalId,
        differenceType: "mismatch",
        fields: differingFields,
      });
      console.warn(`[parity-check][${domain}] mismatch`, {
        key,
        legacyId: fallbackRecord?.legacyId ?? supabaseRecord?.legacyId,
        relationalId: supabaseRecord?.relationalId ?? fallbackRecord?.relationalId,
        fields: differingFields,
      });
      continue;
    }

    result.matched += 1;
  }

  return result;
}

function summarizeTableOrder(table: PosTableState): ComparableRecord {
  const totalQuantity = table.orders.reduce((sum, item) => sum + item.quantity, 0);
  const totalAmount = table.orders.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

  return {
    key: table.id,
    legacyId: table.id,
    fields: {
      status: table.status,
      paymentStatus: table.paymentStatus ?? "idle",
      guests: table.guests,
      operatorId: table.operatorId ?? "",
      customerName: table.customerName,
      companyName: table.companyName,
      totalQuantity,
      totalAmount,
      notes: table.note,
      prebillPrintedAt: table.prebillPrintedAt ?? null,
    },
  };
}

function hasLiveOrderData(table: PosTableState) {
  return (
    table.orders.length > 0 ||
    table.status !== "free" ||
    (table.paymentStatus ?? "idle") !== "idle" ||
    Boolean(table.customerName?.trim()) ||
    Boolean(table.companyName?.trim()) ||
    Boolean(table.note?.trim()) ||
    Boolean(table.prebillPrintedAt) ||
    Boolean(table.splitBillState)
  );
}

function flattenOrderLines(tables: PosTableState[]) {
  return tables.flatMap((table) =>
    table.orders.map((item) => ({
      table,
      item,
    }))
  );
}

function summarizeOrderLine(table: PosTableState, item: OrderItem): ComparableRecord {
  return {
    key: item.id,
    legacyId: item.id,
    fields: {
      tableId: table.id,
      productId: item.productId,
      name: item.name,
      quantity: item.quantity,
      sentQuantity: item.sentQuantity ?? 0,
      unitPrice: item.unitPrice,
      course: item.course,
      commensaleCode: item.commensaleCode ?? "",
      status: item.status,
      note: item.note ?? "",
      additions: item.additions ?? [],
      removals: item.removals ?? [],
    },
  };
}

function summarizeCourses(tables: PosTableState[]) {
  const records = new Map<string, ComparableRecord>();

  for (const table of tables) {
    const courseGroups = new Map<string, number>();
    for (const item of table.orders) {
      courseGroups.set(item.course, (courseGroups.get(item.course) ?? 0) + 1);
    }

    for (const [course, itemCount] of courseGroups) {
      const key = `${table.id}:${course}`;
      records.set(key, {
        key,
        legacyId: key,
        fields: {
          tableId: table.id,
          course,
          itemCount,
        },
      });
    }
  }

  return [...records.values()];
}

function summarizeGuests(tables: PosTableState[]) {
  const records = new Map<string, ComparableRecord>();

  for (const table of tables) {
    const guestGroups = new Map<string, number>();
    for (const item of table.orders) {
      const guestCode = item.commensaleCode?.trim();
      if (!guestCode) continue;
      guestGroups.set(guestCode, (guestGroups.get(guestCode) ?? 0) + 1);
    }

    for (const [guestCode, itemCount] of guestGroups) {
      const key = `${table.id}:${guestCode}`;
      records.set(key, {
        key,
        legacyId: key,
        fields: {
          tableId: table.id,
          guestCode,
          itemCount,
        },
      });
    }
  }

  return [...records.values()];
}

function summarizeFinancialEntries(
  entries: Array<Record<string, unknown> & { id: string }>,
  filter: (entry: Record<string, unknown> & { id: string }) => boolean
) {
  return entries
    .filter(filter)
    .map((entry) => ({
      key: entry.id,
      legacyId: entry.id,
      fields: {
        documentType: String(entry.documentType ?? ""),
        paymentMethod: String(entry.paymentMethod ?? entry.payment_method ?? ""),
        total: Number(entry.total ?? entry.finalTotal ?? 0),
        status: String(entry.status ?? ""),
        tableId: String(entry.tableId ?? ""),
        orderId: String(entry.orderId ?? ""),
        operator: String(entry.operator ?? ""),
        createdAt: String(entry.createdAt ?? entry.created_at ?? ""),
      },
    }));
}

function summarizePrinters(printers: PrinterRecord[]) {
  return printers.map((printer) => ({
    key: printer.id,
    legacyId: printer.id,
    fields: {
      name: printer.name,
      role: printer.role,
      model: printer.model,
      ipAddress: printer.ipAddress,
      port: printer.port ?? null,
      enabled: printer.enabled,
      connectionMode: printer.connectionMode,
      timeoutMs: printer.timeoutMs,
      paperColumns: printer.paperColumns ?? null,
    },
  }));
}

function summarizeRoutingRules(rules: PrinterRoutingRule[]) {
  return rules.map((rule) => ({
    key: `${rule.category}::${rule.printerRole}`,
    legacyId: `${rule.category}::${rule.printerRole}`,
    fields: {
      category: rule.category,
      printerRole: rule.printerRole,
    },
  }));
}

function summarizeFidelityCustomers(customers: FidelityProfileRecord[]) {
  return customers.map((customer) => ({
    key: customer.id,
    legacyId: customer.id,
    fields: {
      firstName: customer.firstName,
      lastName: customer.lastName,
      cardCode: customer.cardCode ?? "",
      qrCodeValue: customer.qrCodeValue ?? "",
      currentPoints: customer.currentPoints,
      pendingPoints: customer.pendingPoints,
      totalPointsLoaded: customer.totalPointsLoaded,
      isActive: customer.isActive,
    },
  }));
}

function summarizeFidelityRewards(rewards: FidelityRewardRecord[]) {
  return rewards.map((reward) => ({
    key: reward.id,
    legacyId: reward.id,
    fields: {
      name: reward.name,
      pointsRequired: reward.pointsRequired,
      discountAmount: reward.discountAmount,
      isActive: reward.isActive,
      displayOrder: reward.displayOrder,
    },
  }));
}

function summarizeFidelityPoints(movements: FidelityPointsMovementRecord[]) {
  return movements.map((movement) => ({
    key: movement.id,
    legacyId: movement.id,
    fields: {
      customerId: movement.customerId,
      orderId: movement.orderId ?? "",
      paymentId: movement.paymentId ?? "",
      type: movement.type,
      points: movement.points,
      euroAmount: movement.euroAmount,
      description: movement.description,
    },
  }));
}

function summarizeFidelityRedemptions(redemptions: FidelityRewardRedemptionRecord[]) {
  return redemptions.map((redemption) => ({
    key: redemption.id,
    legacyId: redemption.id,
    fields: {
      customerId: redemption.customerId,
      rewardId: redemption.rewardId,
      pointsUsed: redemption.pointsUsed,
      discountApplied: redemption.discountApplied,
      status: redemption.status,
      paymentId: redemption.paymentId ?? "",
    },
  }));
}

function summarizeAuditLogs(logs: AuditLogEntry[]) {
  return logs.map((entry) => ({
    key: entry.id,
    legacyId: entry.id,
    fields: {
      eventType: entry.eventType,
      entityType: entry.entityType,
      entityId: entry.entityId,
      operatorId: entry.operatorId ?? "",
      origin: entry.origin ?? "",
      timestamp: entry.timestamp,
    },
  }));
}

function summarizeFiscalPrinterLogs(logs: FiscalPrinterLogEntry[]) {
  return logs.map((entry) => ({
    key: entry.id,
    legacyId: entry.id,
    fields: {
      printerId: entry.printerId,
      printerName: entry.printerName,
      tableId: entry.tableId ?? "",
      amount: entry.amount ?? 0,
      outcome: entry.outcome,
      payloadSummary: entry.payloadSummary,
      timestamp: entry.timestamp,
    },
  }));
}

function summarizeVoidLogs(logs: StornoRecord[]) {
  return logs.map((entry) => ({
    key: entry.id,
    legacyId: entry.id,
    fields: {
      type: entry.type,
      tableId: entry.tableId,
      operatorId: entry.operatorId,
      printed: entry.printed,
      reason: entry.reason ?? "",
      items: entry.items,
      createdAt: entry.createdAt,
    },
  }));
}

async function runOrdersParity() {
  const fallbackState = await readFallbackSharedTablesState();
  const relationalTables = (await readRelationalOperationalTableOverlays()) ?? [];
  return compareComparableSets(
    "orders",
    (fallbackState?.tables ?? []).filter(hasLiveOrderData).map(summarizeTableOrder),
    relationalTables.map((table) => summarizeTableOrder(table as PosTableState))
  );
}

async function runOrderLinesParity() {
  const fallbackState = await readFallbackSharedTablesState();
  const relationalTables = (await readRelationalOperationalTableOverlays()) ?? [];
  return compareComparableSets(
    "order_lines",
    flattenOrderLines(fallbackState?.tables ?? []).map(({ table, item }) => summarizeOrderLine(table, item)),
    flattenOrderLines(relationalTables as PosTableState[]).map(({ table, item }) => summarizeOrderLine(table, item))
  );
}

async function runOrderCoursesParity() {
  const fallbackState = await readFallbackSharedTablesState();
  const relationalTables = (await readRelationalOperationalTableOverlays()) ?? [];
  return compareComparableSets(
    "order_courses",
    summarizeCourses(fallbackState?.tables ?? []),
    summarizeCourses(relationalTables as PosTableState[])
  );
}

async function runOrderGuestsParity() {
  const fallbackState = await readFallbackSharedTablesState();
  const relationalTables = (await readRelationalOperationalTableOverlays()) ?? [];
  return compareComparableSets(
    "order_guests",
    summarizeGuests(fallbackState?.tables ?? []),
    summarizeGuests(relationalTables as PosTableState[])
  );
}

async function runPaymentsParity() {
  const fallbackEntries = (await readFallbackSharedFinancialArchiveState())?.entries ?? [];
  const relationalEntries = (await readRelationalPaymentArchiveEntries()) ?? [];
  return compareComparableSets(
    "payments",
    summarizeFinancialEntries(fallbackEntries, (entry) => String(entry.operationKind ?? "sale") === "sale"),
    summarizeFinancialEntries(relationalEntries, (entry) => String(entry.operationKind ?? "sale") === "sale")
  );
}

async function runFiscalDocumentsParity() {
  const fallbackEntries = (await readFallbackSharedFinancialArchiveState())?.entries ?? [];
  const relationalEntries = (await readRelationalFiscalDocumentArchiveEntries()) ?? [];
  return compareComparableSets(
    "fiscal_documents",
    summarizeFinancialEntries(
      fallbackEntries,
      (entry) =>
        Boolean(entry.documentType) ||
        Boolean(entry.documentNumber) ||
        Boolean(entry.referenceNumber)
    ),
    summarizeFinancialEntries(
      relationalEntries,
      (entry) =>
        Boolean(entry.documentType) ||
        Boolean(entry.documentNumber) ||
        Boolean(entry.referenceNumber)
    )
  );
}

async function runCashClosuresParity() {
  const fallbackEntries = (await readFallbackSharedFinancialArchiveState())?.entries ?? [];
  const relationalEntries = (await readRelationalCashClosureArchiveEntries()) ?? [];
  return compareComparableSets(
    "cash_closures",
    summarizeFinancialEntries(
      fallbackEntries,
      (entry) => String(entry.operationKind ?? "") === "daily-close"
    ),
    summarizeFinancialEntries(
      relationalEntries,
      (entry) => String(entry.operationKind ?? "") === "daily-close"
    )
  );
}

async function runDailyReportsParity() {
  const fallbackEntries = (await readFallbackSharedFinancialArchiveState())?.entries ?? [];
  const relationalEntries = (await readRelationalDailyReportArchiveEntries()) ?? [];
  return compareComparableSets(
    "daily_reports",
    summarizeFinancialEntries(
      fallbackEntries,
      (entry) => String(entry.operationKind ?? "") === "financial-report"
    ),
    summarizeFinancialEntries(
      relationalEntries,
      (entry) => String(entry.operationKind ?? "") === "financial-report"
    )
  );
}

async function runPrinterConfigsParity() {
  const fallbackConfig = await readFallbackSharedPrintingConfig();
  const relationalState = await readRelationalPrintingOpsState();
  return compareComparableSets(
    "printer_configs",
    summarizePrinters(fallbackConfig?.printers ?? []),
    summarizePrinters(relationalState?.printers ?? [])
  );
}

async function runPrinterRoutingParity() {
  const fallbackConfig = await readFallbackSharedPrintingConfig();
  const relationalState = await readRelationalPrintingOpsState();
  return compareComparableSets(
    "printer_routing_rules",
    summarizeRoutingRules(fallbackConfig?.routingRules ?? []),
    summarizeRoutingRules(relationalState?.routingRules ?? [])
  );
}

async function runFidelityParity() {
  const fallbackState = await readFallbackFidelityState({
    customers: [],
    rewards: [],
    pointsMovements: [],
    rewardRedemptions: [],
  });
  const relationalState = await readRelationalFidelityState();
  const customerResult = compareComparableSets(
    "fidelity",
    summarizeFidelityCustomers(fallbackState.customers),
    summarizeFidelityCustomers(relationalState?.customers ?? [])
  );
  const rewardResult = compareComparableSets(
    "fidelity",
    summarizeFidelityRewards(fallbackState.rewards),
    summarizeFidelityRewards(relationalState?.rewards ?? [])
  );
  const movementResult = compareComparableSets(
    "fidelity",
    summarizeFidelityPoints(fallbackState.pointsMovements),
    summarizeFidelityPoints(relationalState?.pointsMovements ?? [])
  );
  const redemptionResult = compareComparableSets(
    "fidelity",
    summarizeFidelityRedemptions(fallbackState.rewardRedemptions),
    summarizeFidelityRedemptions(relationalState?.rewardRedemptions ?? [])
  );

  return {
    domain: "fidelity" as const,
    checked:
      customerResult.checked +
      rewardResult.checked +
      movementResult.checked +
      redemptionResult.checked,
    matched:
      customerResult.matched +
      rewardResult.matched +
      movementResult.matched +
      redemptionResult.matched,
    mismatched:
      customerResult.mismatched +
      rewardResult.mismatched +
      movementResult.mismatched +
      redemptionResult.mismatched,
    missingInSupabase:
      customerResult.missingInSupabase +
      rewardResult.missingInSupabase +
      movementResult.missingInSupabase +
      redemptionResult.missingInSupabase,
    missingInFallback:
      customerResult.missingInFallback +
      rewardResult.missingInFallback +
      movementResult.missingInFallback +
      redemptionResult.missingInFallback,
    errors: [
      ...customerResult.errors,
      ...rewardResult.errors,
      ...movementResult.errors,
      ...redemptionResult.errors,
    ],
    differences: [
      ...customerResult.differences,
      ...rewardResult.differences,
      ...movementResult.differences,
      ...redemptionResult.differences,
    ],
  };
}

async function runOperationalLogsParity() {
  const fallbackState = await readFallbackOperationalLogsState({
    fiscalPrinterLogs: [],
    voidLogs: [],
    auditLogs: [],
  });
  const relationalState = await readRelationalPrintingOpsState();
  const fiscalResult = compareComparableSets(
    "operational_logs",
    summarizeFiscalPrinterLogs(fallbackState.fiscalPrinterLogs),
    summarizeFiscalPrinterLogs(relationalState?.fiscalPrinterLogs ?? [])
  );
  const voidResult = compareComparableSets(
    "operational_logs",
    summarizeVoidLogs(fallbackState.voidLogs),
    summarizeVoidLogs(relationalState?.voidLogs ?? [])
  );
  const auditResult = compareComparableSets(
    "operational_logs",
    summarizeAuditLogs(fallbackState.auditLogs),
    summarizeAuditLogs(relationalState?.auditLogs ?? [])
  );

  return {
    domain: "operational_logs" as const,
    checked: fiscalResult.checked + voidResult.checked + auditResult.checked,
    matched: fiscalResult.matched + voidResult.matched + auditResult.matched,
    mismatched: fiscalResult.mismatched + voidResult.mismatched + auditResult.mismatched,
    missingInSupabase:
      fiscalResult.missingInSupabase + voidResult.missingInSupabase + auditResult.missingInSupabase,
    missingInFallback:
      fiscalResult.missingInFallback + voidResult.missingInFallback + auditResult.missingInFallback,
    errors: [...fiscalResult.errors, ...voidResult.errors, ...auditResult.errors],
    differences: [...fiscalResult.differences, ...voidResult.differences, ...auditResult.differences],
  };
}

export async function runParityCheck(domains: ParityCheckDomain[]) {
  const uniqueDomains = [...new Set(domains)];
  const results: Record<ParityCheckDomain, ParityCheckDomainResult> = {} as Record<
    ParityCheckDomain,
    ParityCheckDomainResult
  >;

  for (const domain of uniqueDomains) {
    try {
      const result =
        domain === "orders"
          ? await runOrdersParity()
          : domain === "order_lines"
            ? await runOrderLinesParity()
            : domain === "order_courses"
              ? await runOrderCoursesParity()
              : domain === "order_guests"
                ? await runOrderGuestsParity()
                : domain === "payments"
                  ? await runPaymentsParity()
                  : domain === "fiscal_documents"
                    ? await runFiscalDocumentsParity()
                    : domain === "cash_closures"
                      ? await runCashClosuresParity()
                      : domain === "daily_reports"
                        ? await runDailyReportsParity()
                    : domain === "printer_configs"
                      ? await runPrinterConfigsParity()
                      : domain === "printer_routing_rules"
                        ? await runPrinterRoutingParity()
                        : domain === "fidelity"
                          ? await runFidelityParity()
                          : await runOperationalLogsParity();

      results[domain] = result;
    } catch (error) {
      const failedResult = buildResult(domain);
      failedResult.errors.push(error instanceof Error ? error.message : "Unknown parity check error");
      results[domain] = failedResult;
      console.error(`[parity-check][${domain}] failed`, error);
    }
  }

  return results;
}

export function parseParityDomains(input: string[] | string | null | undefined) {
  const rawDomains = Array.isArray(input) ? input : input ? [input] : ["all"];
  const tokens = rawDomains.flatMap((value) => value.split(",")).map((value) => value.trim());

  if (tokens.length === 0 || tokens.includes("all")) {
    return ALL_PARITY_DOMAINS;
  }

  return tokens.filter((value): value is ParityCheckDomain =>
    ALL_PARITY_DOMAINS.includes(value as ParityCheckDomain)
  );
}

export function getAllParityDomains() {
  return [...ALL_PARITY_DOMAINS];
}
