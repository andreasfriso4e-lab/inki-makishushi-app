import { NextResponse } from "next/server";

import { getActiveRestaurantId } from "@/lib/restaurant-config";
import {
  isSupabaseConfigured,
  probeSupabaseTable,
  readSupabaseRows,
  updateSupabaseRows,
} from "@/lib/server/supabase-json-store";
import {
  buildFinancialDomainParitySnapshot,
  getArchivedFinancialAmount,
  type ArchivedFinancialDomainLike,
} from "@/lib/server/financial-archive-domain-parity";
import {
  buildFiscalDocumentsParitySnapshot,
  type ArchivedFiscalDocumentLike,
} from "@/lib/server/fiscal-documents-parity";
import {
  buildPaymentsParitySnapshot,
  type ArchivedPaymentLike,
} from "@/lib/server/payments-parity";
import { runParityCheck } from "@/lib/server/parity-check-service";
import { getSupabaseReadMode } from "@/lib/server/supabase-read-mode";
import {
  readFallbackSharedBusinessDirectoryState,
} from "@/lib/server/shared-business-directory-store";
import {
  readFallbackFidelityState,
} from "@/lib/server/shared-fidelity-store";
import {
  readFallbackSharedFinancialArchiveState,
} from "@/lib/server/shared-financial-archive-store";
import {
  readFallbackSharedPrintingConfig,
} from "@/lib/server/shared-printing-config-store";
import {
  readFallbackSharedCatalogConfigState,
} from "@/lib/server/shared-catalog-config-store";
import {
  readFallbackSharedHomeAreasState,
} from "@/lib/server/shared-home-areas-store";
import {
  getDefaultSharedOperatorRolesState,
  readFallbackSharedOperatorRolesState,
} from "@/lib/server/shared-operator-roles-store";
import {
  readFallbackSharedTablesState,
} from "@/lib/server/shared-tables-store";
import { readRelationalCatalogState } from "@/lib/server/supabase-relational-catalog-repository";
import {
  readFallbackOperationalLogsState,
} from "@/lib/server/shared-operational-logs-store";
import {
  readRelationalFidelityState,
} from "@/lib/server/supabase-relational-fidelity-repository";
import {
  readRelationalPrintingOpsState,
} from "@/lib/server/supabase-relational-ops-repository";
import {
  readRelationalCashClosureArchiveEntries,
  readRelationalDailyReportArchiveEntries,
  readRelationalFiscalDocumentArchiveEntries,
  readRelationalPaymentArchiveEntries,
} from "@/lib/server/supabase-relational-financial-repository";
import {
  readRelationalOperationalTableOverlays,
} from "@/lib/server/supabase-relational-order-repository";
import {
  readRelationalBusinessDirectoryState,
  readRelationalOperatorRolesState,
  readRelationalRoomsAndTablesState,
} from "@/lib/server/supabase-relational-read-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function hasEnvValue(value: string | undefined) {
  return Boolean(value?.trim());
}

function resolveSource(isSupabaseSource: boolean) {
  return isSupabaseSource ? "supabase" : "fallback";
}

function resolveParityStatus(supabaseCount: number, fallbackCount: number) {
  return supabaseCount === fallbackCount ? "ok" : "mismatch";
}

function normalizeTextKey(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function buildDomainParityDetails(
  fallbackKeys: string[],
  supabaseKeys: string[],
  matchingKey: string
) {
  const fallbackCounts = new Map<string, number>();
  for (const key of fallbackKeys) {
    fallbackCounts.set(key, (fallbackCounts.get(key) ?? 0) + 1);
  }

  const canonicalFallbackKeys = Array.from(fallbackCounts.keys());
  const supabaseSet = new Set(supabaseKeys);
  const fallbackSet = new Set(canonicalFallbackKeys);

  const missingInSupabase = canonicalFallbackKeys.filter((key) => !supabaseSet.has(key));
  const extraInSupabase = supabaseKeys.filter((key) => !fallbackSet.has(key));
  const duplicatesInFallback = Array.from(fallbackCounts.entries())
    .filter(([, count]) => count > 1)
    .map(([key, count]) => ({ key, count }));

  return {
    matchingKey,
    fallbackCount: fallbackKeys.length,
    fallbackCanonicalCount: canonicalFallbackKeys.length,
    supabaseCount: supabaseKeys.length,
    difference: supabaseKeys.length - canonicalFallbackKeys.length,
    missingInSupabase,
    extraInSupabase,
    duplicatesInFallback,
  };
}

function flattenOrderItems(
  tables: Array<{ id: string; orders?: Array<{ id?: string | null }> }>
) {
  return tables.flatMap((table) =>
    (table.orders ?? []).map((item) => ({
      tableId: table.id,
      itemId: item.id ?? "",
    }))
  );
}

function countUniqueCourses(
  tables: Array<{ id: string; orders?: Array<{ course?: string | null }> }>
) {
  return tables.reduce((total, table) => {
    const courses = new Set(
      (table.orders ?? [])
        .map((item) => normalizeTextKey(item.course ?? ""))
        .filter((course) => course.length > 0)
    );
    return total + courses.size;
  }, 0);
}

function countUniqueGuests(
  tables: Array<{ id: string; orders?: Array<{ commensaleCode?: string | null }> }>
) {
  return tables.reduce((total, table) => {
    const guests = new Set(
      (table.orders ?? [])
        .map((item) => normalizeTextKey(item.commensaleCode ?? ""))
        .filter((guest) => guest.length > 0)
    );
    return total + guests.size;
  }, 0);
}

function countFinancialEntries(
  entries: Array<Record<string, unknown> & { id: string }>,
  predicate: (entry: Record<string, unknown> & { id: string }) => boolean
) {
  return entries.filter(predicate).length;
}

function sumFinancialEntries(
  entries: Array<Record<string, unknown> & { id: string }>,
  predicate: (entry: Record<string, unknown> & { id: string }) => boolean
) {
  return entries
    .filter(predicate)
    .reduce((sum, entry) => sum + getArchivedFinancialAmount(entry), 0);
}

const isCashClosureEntry = (entry: Record<string, unknown> & { id: string }) =>
  String(entry.operationKind ?? "") === "daily-close";
const isDailyReportEntry = (entry: Record<string, unknown> & { id: string }) =>
  String(entry.operationKind ?? "") === "financial-report";

const STABLE_TABLE_PROBES = [
  "rooms",
  "tables",
  "operator_roles",
  "operators",
  "companies",
  "customers",
  "departments",
  "categories",
  "products",
  "payment_methods",
  "vat_rates",
] as const;

const LIVE_ORDER_TABLE_PROBES = [
  "orders",
  "order_lines",
  "order_courses",
  "order_guests",
  "order_transmissions",
  "order_transmission_lines",
] as const;

const FINANCIAL_TABLE_PROBES = ["payments", "fiscal_documents", "cash_closures", "daily_reports"] as const;
const OPS_TABLE_PROBES = [
  "printer_configs",
  "printer_routing_rules",
  "fiscal_printer_logs",
  "void_logs",
  "audit_logs",
  "fidelity_profiles",
  "fidelity_rewards",
  "fidelity_points_movements",
  "fidelity_reward_redemptions",
  "print_jobs",
] as const;

export async function GET() {
  const diagnostics = {
    supabaseConfigured: isSupabaseConfigured(),
    env: {
      urlPresent: hasEnvValue(process.env.NEXT_PUBLIC_SUPABASE_URL),
      anonKeyPresent: hasEnvValue(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      publishableKeyPresent: hasEnvValue(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
      serviceRolePresent: hasEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY),
    },
    readModes: {
      rooms: getSupabaseReadMode("rooms"),
      tablesMetadata: getSupabaseReadMode("tables-metadata"),
      ordersLive: getSupabaseReadMode("orders-live"),
      payments: getSupabaseReadMode("payments"),
      fiscalDocuments: getSupabaseReadMode("fiscal-documents"),
      cashClosures: getSupabaseReadMode("cash-closures"),
      dailyReports: getSupabaseReadMode("daily-reports"),
      printerConfigs: getSupabaseReadMode("printer-configs"),
      printerRoutingRules: getSupabaseReadMode("printer-routing-rules"),
      fidelity: getSupabaseReadMode("fidelity"),
      operationalLogs: getSupabaseReadMode("operational-logs"),
      operators: getSupabaseReadMode("operators"),
      operatorRoles: getSupabaseReadMode("operator-roles"),
      companies: getSupabaseReadMode("companies"),
      customers: getSupabaseReadMode("customers"),
      departments: getSupabaseReadMode("departments"),
      categories: getSupabaseReadMode("categories"),
      products: getSupabaseReadMode("products"),
      paymentMethods: getSupabaseReadMode("payment-methods"),
      vatRates: getSupabaseReadMode("vat-rates"),
    },
    sources: {
      rooms: "fallback" as "supabase" | "fallback",
      tables: "fallback" as "supabase" | "fallback",
      orders: "fallback" as "supabase" | "fallback",
      orderLines: "fallback" as "supabase" | "fallback",
      payments: "fallback" as "supabase" | "fallback",
      fiscalDocuments: "fallback" as "supabase" | "fallback",
      cashClosures: "fallback" as "supabase" | "fallback",
      dailyReports: "fallback" as "supabase" | "fallback",
      printerConfig: "fallback" as "supabase" | "fallback",
      printerRoutingRules: "fallback" as "supabase" | "fallback",
      fidelity: "fallback" as "supabase" | "fallback",
      operationalLogs: "fallback" as "supabase" | "fallback",
      operators: "fallback" as "supabase" | "fallback",
      companiesCustomers: "fallback" as "supabase" | "fallback",
      catalog: "fallback" as "supabase" | "fallback",
      paymentsConfig: "fallback" as "supabase" | "fallback",
    },
    sourceErrors: {
      rooms: null as string | null,
      tables: null as string | null,
      orders: null as string | null,
      orderLines: null as string | null,
      payments: null as string | null,
      fiscalDocuments: null as string | null,
      cashClosures: null as string | null,
      dailyReports: null as string | null,
      printerConfig: null as string | null,
      printerRoutingRules: null as string | null,
      fidelity: null as string | null,
      operationalLogs: null as string | null,
      operators: null as string | null,
      companiesCustomers: null as string | null,
      catalog: null as string | null,
      paymentsConfig: null as string | null,
    },
    checks: {
      auditLogsWriteNoop: {
        status: "fallback" as "ok" | "fallback",
      },
    },
    parity: {
      rooms: { supabase: 0, fallback: 0 },
      tables: { supabase: 0, fallback: 0 },
      orders: { supabase: 0, fallback: 0 },
      orderLines: { supabase: 0, fallback: 0 },
      orderCourses: { supabase: 0, fallback: 0 },
      orderGuests: { supabase: 0, fallback: 0 },
      orderTransmissions: { supabase: 0, fallback: 0 },
      orderTransmissionLines: { supabase: 0, fallback: 0 },
      payments: { supabase: 0, fallback: 0 },
      fiscalDocuments: { supabase: 0, fallback: 0 },
      cashClosures: { supabase: 0, fallback: 0 },
      dailyReports: { supabase: 0, fallback: 0 },
      printerConfigs: { supabase: 0, fallback: 0 },
      printerRoutingRules: { supabase: 0, fallback: 0 },
      fidelityProfiles: { supabase: 0, fallback: 0 },
      fidelityRewards: { supabase: 0, fallback: 0 },
      fidelityPointsMovements: { supabase: 0, fallback: 0 },
      fidelityRewardRedemptions: { supabase: 0, fallback: 0 },
      fiscalPrinterLogs: { supabase: 0, fallback: 0 },
      voidLogs: { supabase: 0, fallback: 0 },
      auditLogs: { supabase: 0, fallback: 0 },
      printJobs: { supabase: 0, fallback: 0 },
      operators: { supabase: 0, fallback: 0 },
      companies: { supabase: 0, fallback: 0 },
      customers: { supabase: 0, fallback: 0 },
      departments: { supabase: 0, fallback: 0 },
      categories: { supabase: 0, fallback: 0 },
      products: { supabase: 0, fallback: 0 },
      paymentMethods: { supabase: 0, fallback: 0 },
      vatRates: { supabase: 0, fallback: 0 },
    },
    parityStatus: {
      rooms: "ok" as "ok" | "mismatch",
      tables: "ok" as "ok" | "mismatch",
      orders: "ok" as "ok" | "mismatch",
      orderLines: "ok" as "ok" | "mismatch",
      orderCourses: "ok" as "ok" | "mismatch",
      orderGuests: "ok" as "ok" | "mismatch",
      orderTransmissions: "ok" as "ok" | "mismatch" | "not_comparable",
      orderTransmissionLines: "ok" as "ok" | "mismatch" | "not_comparable",
      payments: "ok" as "ok" | "mismatch",
      fiscalDocuments: "ok" as "ok" | "mismatch",
      cashClosures: "ok" as "ok" | "mismatch",
      dailyReports: "ok" as "ok" | "mismatch",
      printerConfigs: "ok" as "ok" | "mismatch",
      printerRoutingRules: "ok" as "ok" | "mismatch",
      fidelity: "ok" as "ok" | "mismatch",
      operationalLogs: "ok" as "ok" | "mismatch",
      operators: "ok" as "ok" | "mismatch",
      companies: "ok" as "ok" | "mismatch",
      customers: "ok" as "ok" | "mismatch",
      departments: "ok" as "ok" | "mismatch",
      categories: "ok" as "ok" | "mismatch",
      products: "ok" as "ok" | "mismatch",
      paymentMethods: "ok" as "ok" | "mismatch",
      vatRates: "ok" as "ok" | "mismatch",
    },
    usage: {
      relationalReadsActive: [] as string[],
      relationalWritesActive: [] as string[],
      fallbackDomains: [] as string[],
    },
    liveOrders: {
      supabaseConfiguredForRead: false,
      fallbackActive: true,
      source: "fallback" as "supabase" | "fallback",
      countSupabase: {
        orders: 0,
        orderLines: 0,
        orderCourses: 0,
        orderGuests: 0,
        orderTransmissions: 0,
        orderTransmissionLines: 0,
      },
      countFallback: {
        orders: 0,
        orderLines: 0,
        orderCourses: 0,
        orderGuests: 0,
        orderTransmissions: null as number | null,
        orderTransmissionLines: null as number | null,
      },
      parity: {
        orders: "ok" as "ok" | "mismatch",
        orderLines: "ok" as "ok" | "mismatch",
        orderCourses: "ok" as "ok" | "mismatch",
        orderGuests: "ok" as "ok" | "mismatch",
        orderTransmissions: "not_comparable" as "ok" | "mismatch" | "not_comparable",
        orderTransmissionLines: "not_comparable" as "ok" | "mismatch" | "not_comparable",
      },
      fallbackOnlyOrderIds: [] as string[],
      supabaseOnlyOrderIds: [] as string[],
      lastError: null as string | null,
    },
    payments: {
      source: "fallback" as "supabase" | "fallback",
      fallbackActive: true,
      countSupabase: 0,
      countFallback: 0,
      totalAmountSupabase: 0,
      totalAmountFallback: 0,
      parity: "ok" as "ok" | "mismatch",
      missingInSupabase: [] as string[],
      extraInSupabase: [] as string[],
      mismatches: [] as Array<{ key: string; legacyOrderKey: string; fields: string[] }>,
      lastError: null as string | null,
    },
    fiscalDocuments: {
      source: "fallback" as "supabase" | "fallback",
      fallbackActive: true,
      countSupabase: 0,
      countFallback: 0,
      totalAmountSupabase: 0,
      totalAmountFallback: 0,
      parity: "ok" as "ok" | "mismatch",
      missingInSupabase: [] as string[],
      extraInSupabase: [] as string[],
      mismatches: [] as Array<{ key: string; legacyOrderKey: string; fields: string[] }>,
      lastError: null as string | null,
    },
    cashClosures: {
      source: "fallback" as "supabase" | "fallback",
      fallbackActive: true,
      countSupabase: 0,
      countFallback: 0,
      totalAmountSupabase: 0,
      totalAmountFallback: 0,
      parity: "ok" as "ok" | "mismatch",
      missingInSupabase: [] as string[],
      extraInSupabase: [] as string[],
      mismatches: [] as Array<{ key: string; fields: string[] }>,
      lastError: null as string | null,
    },
    dailyReports: {
      source: "fallback" as "supabase" | "fallback",
      fallbackActive: true,
      countSupabase: 0,
      countFallback: 0,
      totalAmountSupabase: 0,
      totalAmountFallback: 0,
      parity: "ok" as "ok" | "mismatch",
      missingInSupabase: [] as string[],
      extraInSupabase: [] as string[],
      mismatches: [] as Array<{ key: string; fields: string[] }>,
      lastError: null as string | null,
    },
    printerConfig: {
      source: "fallback" as "supabase" | "fallback",
      printersCountSupabase: 0,
      printersCountFallback: 0,
      routingRulesCountSupabase: 0,
      routingRulesCountFallback: 0,
      parity: "ok" as "ok" | "mismatch",
      lastError: null as string | null,
    },
    fidelity: {
      source: "fallback" as "supabase" | "fallback",
      profilesCountSupabase: 0,
      profilesCountFallback: 0,
      rewardsCountSupabase: 0,
      rewardsCountFallback: 0,
      pointsMovementsCountSupabase: 0,
      pointsMovementsCountFallback: 0,
      rewardRedemptionsCountSupabase: 0,
      rewardRedemptionsCountFallback: 0,
      parity: "ok" as "ok" | "mismatch",
      lastError: null as string | null,
    },
    operationalLogs: {
      source: "fallback" as "supabase" | "fallback",
      fiscalPrinterLogsCountSupabase: 0,
      fiscalPrinterLogsCountFallback: 0,
      voidLogsCountSupabase: 0,
      voidLogsCountFallback: 0,
      auditLogsCountSupabase: 0,
      auditLogsCountFallback: 0,
      printJobsCountSupabase: 0,
      parity: "ok" as "ok" | "mismatch",
      lastError: null as string | null,
    },
    tables: {
      relationalReads: [] as string[],
      relationalWrites: [] as string[],
      fallbackBridge: [] as string[],
    },
    tablesExist: {} as Record<string, boolean>,
    restTables: {} as Record<
      string,
      {
        tableName: string;
        schema: string;
        existsInDatabase: boolean;
        restAccessible: boolean;
        statusCode: number | null;
        error: string | null;
        serviceRolePresent: boolean;
        source: "supabase" | "fallback";
      }
    >,
    parityDetails: {} as Record<
      string,
      {
        matchingKey: string;
        fallbackCount: number;
        fallbackCanonicalCount: number;
        supabaseCount: number;
        difference: number;
        missingInSupabase: string[];
        extraInSupabase: string[];
        duplicatesInFallback: Array<{ key: string; count: number }>;
      }
    >,
  };

  const fallbackHomeAreas = await readFallbackSharedHomeAreasState();
  const fallbackTables = await readFallbackSharedTablesState();
  const fallbackOperatorRoles = await readFallbackSharedOperatorRolesState();
  const effectiveFallbackOperatorRoles =
    fallbackOperatorRoles ?? getDefaultSharedOperatorRolesState();
  const fallbackBusinessDirectory = await readFallbackSharedBusinessDirectoryState({
    customers: [],
    companies: [],
  });
  const fallbackFinancialArchive = await readFallbackSharedFinancialArchiveState();
  const fallbackPrintingConfig = await readFallbackSharedPrintingConfig();
  const fallbackFidelity = await readFallbackFidelityState({
    customers: [],
    rewards: [],
    pointsMovements: [],
    rewardRedemptions: [],
  });
  const fallbackOperationalLogs = await readFallbackOperationalLogsState({
    fiscalPrinterLogs: [],
    voidLogs: [],
    auditLogs: [],
  });
  const fallbackCatalog = await readFallbackSharedCatalogConfigState();
  let relationalRoomsState: Awaited<ReturnType<typeof readRelationalRoomsAndTablesState>> = null;
  let relationalOperationalOverlays: Awaited<
    ReturnType<typeof readRelationalOperationalTableOverlays>
  > = null;
  let relationalOperatorsState: Awaited<ReturnType<typeof readRelationalOperatorRolesState>> = null;
  let relationalDirectoryState: Awaited<ReturnType<typeof readRelationalBusinessDirectoryState>> = null;
  let relationalCatalogState: Awaited<ReturnType<typeof readRelationalCatalogState>> = null;
  let relationalPaymentEntries: Awaited<ReturnType<typeof readRelationalPaymentArchiveEntries>> = null;
  let relationalFiscalDocumentEntries: Awaited<
    ReturnType<typeof readRelationalFiscalDocumentArchiveEntries>
  > = null;
  let relationalCashClosureEntries: Awaited<
    ReturnType<typeof readRelationalCashClosureArchiveEntries>
  > = null;
  let relationalDailyReportEntries: Awaited<
    ReturnType<typeof readRelationalDailyReportArchiveEntries>
  > = null;
  let relationalPrintingOpsState: Awaited<ReturnType<typeof readRelationalPrintingOpsState>> = null;
  let relationalFidelityState: Awaited<ReturnType<typeof readRelationalFidelityState>> = null;

  if (!isSupabaseConfigured()) {
    diagnostics.parity.rooms.fallback = fallbackHomeAreas?.areas.length ?? 0;
    diagnostics.parity.tables.fallback = fallbackTables?.tables.length ?? 0;
    diagnostics.parity.orders.fallback = (fallbackTables?.tables ?? []).filter((table) => table.orders.length > 0).length;
    diagnostics.parity.orderLines.fallback = flattenOrderItems(fallbackTables?.tables ?? []).length;
    diagnostics.parity.orderCourses.fallback = countUniqueCourses(fallbackTables?.tables ?? []);
    diagnostics.parity.orderGuests.fallback = countUniqueGuests(fallbackTables?.tables ?? []);
    diagnostics.parity.operators.fallback = effectiveFallbackOperatorRoles.roles.length;
    const fallbackPaymentsParity = buildPaymentsParitySnapshot(
      (fallbackFinancialArchive?.entries ?? []) as ArchivedPaymentLike[],
      []
    );
    const fallbackFiscalDocumentsParity = buildFiscalDocumentsParitySnapshot(
      (fallbackFinancialArchive?.entries ?? []) as ArchivedFiscalDocumentLike[],
      []
    );
    diagnostics.parity.payments.fallback = fallbackPaymentsParity.fallbackCount;
    diagnostics.parity.fiscalDocuments.fallback = fallbackFiscalDocumentsParity.fallbackCount;
    diagnostics.parity.cashClosures.fallback = countFinancialEntries(
      (fallbackFinancialArchive?.entries ?? []) as Array<Record<string, unknown> & { id: string }>,
      isCashClosureEntry
    );
    diagnostics.parity.dailyReports.fallback = countFinancialEntries(
      (fallbackFinancialArchive?.entries ?? []) as Array<Record<string, unknown> & { id: string }>,
      isDailyReportEntry
    );
    diagnostics.parity.printerConfigs.fallback = fallbackPrintingConfig?.printers.length ?? 0;
    diagnostics.parity.printerRoutingRules.fallback = fallbackPrintingConfig?.routingRules.length ?? 0;
    diagnostics.parity.fidelityProfiles.fallback = fallbackFidelity.customers.length;
    diagnostics.parity.fidelityRewards.fallback = fallbackFidelity.rewards.length;
    diagnostics.parity.fidelityPointsMovements.fallback = fallbackFidelity.pointsMovements.length;
    diagnostics.parity.fidelityRewardRedemptions.fallback = fallbackFidelity.rewardRedemptions.length;
    diagnostics.parity.fiscalPrinterLogs.fallback = fallbackOperationalLogs.fiscalPrinterLogs.length;
    diagnostics.parity.voidLogs.fallback = fallbackOperationalLogs.voidLogs.length;
    diagnostics.parity.auditLogs.fallback = fallbackOperationalLogs.auditLogs.length;
    diagnostics.parity.companies.fallback = fallbackBusinessDirectory?.companies.length ?? 0;
    diagnostics.parity.customers.fallback = fallbackBusinessDirectory?.customers.length ?? 0;
    diagnostics.parity.departments.fallback = fallbackCatalog?.departments.length ?? 0;
    diagnostics.parity.categories.fallback = fallbackCatalog?.categories.length ?? 0;
    diagnostics.parity.products.fallback = fallbackCatalog?.products.length ?? 0;
    diagnostics.parity.paymentMethods.fallback = fallbackCatalog?.paymentMethods.length ?? 0;
    diagnostics.parity.vatRates.fallback = fallbackCatalog?.vatRates.length ?? 0;
    diagnostics.parityStatus.rooms = resolveParityStatus(
      diagnostics.parity.rooms.supabase,
      diagnostics.parity.rooms.fallback
    );
    diagnostics.parityStatus.tables = resolveParityStatus(
      diagnostics.parity.tables.supabase,
      diagnostics.parity.tables.fallback
    );
    diagnostics.parityStatus.orders = resolveParityStatus(
      diagnostics.parity.orders.supabase,
      diagnostics.parity.orders.fallback
    );
    diagnostics.parityStatus.orderLines = resolveParityStatus(
      diagnostics.parity.orderLines.supabase,
      diagnostics.parity.orderLines.fallback
    );
    diagnostics.parityStatus.orderCourses = resolveParityStatus(
      diagnostics.parity.orderCourses.supabase,
      diagnostics.parity.orderCourses.fallback
    );
    diagnostics.parityStatus.orderGuests = resolveParityStatus(
      diagnostics.parity.orderGuests.supabase,
      diagnostics.parity.orderGuests.fallback
    );
    diagnostics.parityStatus.payments = resolveParityStatus(
      diagnostics.parity.payments.supabase,
      diagnostics.parity.payments.fallback
    );
    diagnostics.parityStatus.fiscalDocuments = resolveParityStatus(
      diagnostics.parity.fiscalDocuments.supabase,
      diagnostics.parity.fiscalDocuments.fallback
    );
    diagnostics.parityStatus.cashClosures = resolveParityStatus(
      diagnostics.parity.cashClosures.supabase,
      diagnostics.parity.cashClosures.fallback
    );
    diagnostics.parityStatus.dailyReports = resolveParityStatus(
      diagnostics.parity.dailyReports.supabase,
      diagnostics.parity.dailyReports.fallback
    );
    diagnostics.parityStatus.printerConfigs = resolveParityStatus(
      diagnostics.parity.printerConfigs.supabase,
      diagnostics.parity.printerConfigs.fallback
    );
    diagnostics.parityStatus.printerRoutingRules = resolveParityStatus(
      diagnostics.parity.printerRoutingRules.supabase,
      diagnostics.parity.printerRoutingRules.fallback
    );
    diagnostics.parityStatus.fidelity = "ok";
    diagnostics.parityStatus.operationalLogs = "ok";
    diagnostics.parityStatus.operators = resolveParityStatus(
      diagnostics.parity.operators.supabase,
      diagnostics.parity.operators.fallback
    );
    diagnostics.parityStatus.companies = resolveParityStatus(
      diagnostics.parity.companies.supabase,
      diagnostics.parity.companies.fallback
    );
    diagnostics.parityStatus.customers = resolveParityStatus(
      diagnostics.parity.customers.supabase,
      diagnostics.parity.customers.fallback
    );
    diagnostics.parityStatus.departments = resolveParityStatus(
      diagnostics.parity.departments.supabase,
      diagnostics.parity.departments.fallback
    );
    diagnostics.parityStatus.categories = resolveParityStatus(
      diagnostics.parity.categories.supabase,
      diagnostics.parity.categories.fallback
    );
    diagnostics.parityStatus.products = resolveParityStatus(
      diagnostics.parity.products.supabase,
      diagnostics.parity.products.fallback
    );
    diagnostics.parityStatus.paymentMethods = resolveParityStatus(
      diagnostics.parity.paymentMethods.supabase,
      diagnostics.parity.paymentMethods.fallback
    );
    diagnostics.parityStatus.vatRates = resolveParityStatus(
      diagnostics.parity.vatRates.supabase,
      diagnostics.parity.vatRates.fallback
    );

    diagnostics.usage.fallbackDomains = [
      "rooms",
      "tables metadata",
      "orders live",
      "operators / roles",
      "companies / customers",
      "catalog",
      "payment config",
      "printer config",
      "fidelity",
      "operational logs",
    ];

    diagnostics.liveOrders.countFallback.orders = diagnostics.parity.orders.fallback;
    diagnostics.liveOrders.countFallback.orderLines = diagnostics.parity.orderLines.fallback;
    diagnostics.liveOrders.countFallback.orderCourses = diagnostics.parity.orderCourses.fallback;
    diagnostics.liveOrders.countFallback.orderGuests = diagnostics.parity.orderGuests.fallback;
    diagnostics.liveOrders.parity.orders = diagnostics.parityStatus.orders;
    diagnostics.liveOrders.parity.orderLines = diagnostics.parityStatus.orderLines;
    diagnostics.liveOrders.parity.orderCourses = diagnostics.parityStatus.orderCourses;
    diagnostics.liveOrders.parity.orderGuests = diagnostics.parityStatus.orderGuests;
    diagnostics.payments.countFallback = fallbackPaymentsParity.fallbackCount;
    diagnostics.payments.totalAmountFallback = fallbackPaymentsParity.fallbackTotalAmount;
    diagnostics.payments.parity = diagnostics.parityStatus.payments;
    diagnostics.fiscalDocuments.countFallback = fallbackFiscalDocumentsParity.fallbackCount;
    diagnostics.fiscalDocuments.totalAmountFallback =
      fallbackFiscalDocumentsParity.fallbackTotalAmount;
    diagnostics.fiscalDocuments.parity = diagnostics.parityStatus.fiscalDocuments;
    diagnostics.cashClosures.countFallback = diagnostics.parity.cashClosures.fallback;
    diagnostics.cashClosures.totalAmountFallback = sumFinancialEntries(
      (fallbackFinancialArchive?.entries ?? []) as Array<Record<string, unknown> & { id: string }>,
      isCashClosureEntry
    );
    diagnostics.cashClosures.parity = diagnostics.parityStatus.cashClosures;
    diagnostics.dailyReports.countFallback = diagnostics.parity.dailyReports.fallback;
    diagnostics.dailyReports.totalAmountFallback = sumFinancialEntries(
      (fallbackFinancialArchive?.entries ?? []) as Array<Record<string, unknown> & { id: string }>,
      isDailyReportEntry
    );
    diagnostics.dailyReports.parity = diagnostics.parityStatus.dailyReports;
    diagnostics.printerConfig.printersCountFallback = fallbackPrintingConfig?.printers.length ?? 0;
    diagnostics.printerConfig.routingRulesCountFallback =
      fallbackPrintingConfig?.routingRules.length ?? 0;
    diagnostics.fidelity.profilesCountFallback = fallbackFidelity.customers.length;
    diagnostics.fidelity.rewardsCountFallback = fallbackFidelity.rewards.length;
    diagnostics.fidelity.pointsMovementsCountFallback = fallbackFidelity.pointsMovements.length;
    diagnostics.fidelity.rewardRedemptionsCountFallback =
      fallbackFidelity.rewardRedemptions.length;
    diagnostics.operationalLogs.fiscalPrinterLogsCountFallback =
      fallbackOperationalLogs.fiscalPrinterLogs.length;
    diagnostics.operationalLogs.voidLogsCountFallback = fallbackOperationalLogs.voidLogs.length;
    diagnostics.operationalLogs.auditLogsCountFallback = fallbackOperationalLogs.auditLogs.length;

    diagnostics.tables.fallbackBridge = [
      "pos_home_areas_state",
      "pos_tables_state",
      "pos_operator_roles_state",
      "pos_business_directory_state",
      "pos_catalog_state",
    ];

    await Promise.all(
      [...STABLE_TABLE_PROBES, ...LIVE_ORDER_TABLE_PROBES, ...FINANCIAL_TABLE_PROBES, ...OPS_TABLE_PROBES].map(async (tableName) => {
        try {
          const probe = await probeSupabaseTable(tableName);
          diagnostics.restTables[tableName] = {
            ...probe,
            serviceRolePresent: diagnostics.env.serviceRolePresent,
            source: "fallback",
          };
          diagnostics.tablesExist[tableName] = probe.existsInDatabase;
        } catch (error) {
          diagnostics.restTables[tableName] = {
            tableName,
            schema: "public",
            existsInDatabase: false,
            restAccessible: false,
            statusCode: null,
            error: error instanceof Error ? error.message : "REST probe failed",
            serviceRolePresent: diagnostics.env.serviceRolePresent,
            source: "fallback",
          };
          diagnostics.tablesExist[tableName] = false;
        }
      })
    );

    return NextResponse.json(diagnostics, {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  }

  try {
    [relationalRoomsState, relationalOperationalOverlays] = await Promise.all([
      readRelationalRoomsAndTablesState(),
      readRelationalOperationalTableOverlays(),
    ]);
    const roomsSupabase = relationalRoomsState?.areas.length ?? 0;
    const tablesSupabase = relationalRoomsState?.tables.length ?? 0;
    const fallbackLiveTables = (fallbackTables?.tables ?? []).filter((table) => table.orders.length > 0);
    const supabaseLiveTables = relationalOperationalOverlays ?? [];

    diagnostics.parity.rooms = {
      supabase: roomsSupabase,
      fallback: fallbackHomeAreas?.areas.length ?? 0,
    };
    diagnostics.parity.tables = {
      supabase: tablesSupabase,
      fallback: fallbackTables?.tables.length ?? 0,
    };
    diagnostics.parity.orders = {
      supabase: supabaseLiveTables.length,
      fallback: fallbackLiveTables.length,
    };
    diagnostics.parity.orderLines = {
      supabase: flattenOrderItems(supabaseLiveTables).length,
      fallback: flattenOrderItems(fallbackLiveTables).length,
    };
    diagnostics.parity.orderCourses = {
      supabase: countUniqueCourses(supabaseLiveTables),
      fallback: countUniqueCourses(fallbackLiveTables),
    };
    diagnostics.parity.orderGuests = {
      supabase: countUniqueGuests(supabaseLiveTables),
      fallback: countUniqueGuests(fallbackLiveTables),
    };
    diagnostics.sources.rooms = resolveSource(roomsSupabase > 0);
    diagnostics.sources.tables = resolveSource(tablesSupabase > 0);
    diagnostics.sources.orders = resolveSource((relationalOperationalOverlays?.length ?? 0) > 0);
    diagnostics.sources.orderLines = diagnostics.sources.orders;
    diagnostics.liveOrders.supabaseConfiguredForRead = true;
    diagnostics.liveOrders.source = diagnostics.sources.orders;
    diagnostics.liveOrders.countSupabase.orders = diagnostics.parity.orders.supabase;
    diagnostics.liveOrders.countSupabase.orderLines = diagnostics.parity.orderLines.supabase;
    diagnostics.liveOrders.countSupabase.orderCourses = diagnostics.parity.orderCourses.supabase;
    diagnostics.liveOrders.countSupabase.orderGuests = diagnostics.parity.orderGuests.supabase;
    diagnostics.liveOrders.countFallback.orders = diagnostics.parity.orders.fallback;
    diagnostics.liveOrders.countFallback.orderLines = diagnostics.parity.orderLines.fallback;
    diagnostics.liveOrders.countFallback.orderCourses = diagnostics.parity.orderCourses.fallback;
    diagnostics.liveOrders.countFallback.orderGuests = diagnostics.parity.orderGuests.fallback;
  } catch {
    diagnostics.sources.rooms = "fallback";
    diagnostics.sources.tables = "fallback";
    diagnostics.sources.orders = "fallback";
    diagnostics.sources.orderLines = "fallback";
    diagnostics.sourceErrors.rooms = "Supabase relational read failed";
    diagnostics.sourceErrors.tables = "Supabase relational read failed";
    diagnostics.sourceErrors.orders = "Supabase relational read failed";
    diagnostics.sourceErrors.orderLines = "Supabase relational read failed";
    diagnostics.liveOrders.lastError = "Supabase relational read failed";
  }

  try {
    relationalOperatorsState = await readRelationalOperatorRolesState();
    const operatorsSupabase = relationalOperatorsState?.roles.length ?? 0;
    diagnostics.parity.operators = {
      supabase: operatorsSupabase,
      fallback: effectiveFallbackOperatorRoles.roles.length,
    };
    diagnostics.sources.operators = resolveSource(operatorsSupabase > 0);
  } catch {
    diagnostics.sources.operators = "fallback";
    diagnostics.sourceErrors.operators = "Supabase relational read failed";
  }

  try {
    relationalDirectoryState = await readRelationalBusinessDirectoryState();
    const companiesSupabase = relationalDirectoryState?.companies.length ?? 0;
    const customersSupabase = relationalDirectoryState?.customers.length ?? 0;
    diagnostics.parity.companies = {
      supabase: companiesSupabase,
      fallback: fallbackBusinessDirectory?.companies.length ?? 0,
    };
    diagnostics.parity.customers = {
      supabase: customersSupabase,
      fallback: fallbackBusinessDirectory?.customers.length ?? 0,
    };
    diagnostics.sources.companiesCustomers = resolveSource(
      companiesSupabase > 0 || customersSupabase > 0
    );
  } catch {
    diagnostics.sources.companiesCustomers = "fallback";
    diagnostics.sourceErrors.companiesCustomers = "Supabase relational read failed";
  }

  try {
    relationalCatalogState = await readRelationalCatalogState();
    const departmentsSupabase = relationalCatalogState?.departments.length ?? 0;
    const categoriesSupabase = relationalCatalogState?.categories.length ?? 0;
    const productsSupabase = relationalCatalogState?.products.length ?? 0;
    const paymentMethodsSupabase = relationalCatalogState?.paymentMethods.length ?? 0;
    const vatRatesSupabase = relationalCatalogState?.vatRates.length ?? 0;

    diagnostics.parity.departments = {
      supabase: departmentsSupabase,
      fallback: fallbackCatalog?.departments.length ?? 0,
    };
    diagnostics.parity.categories = {
      supabase: categoriesSupabase,
      fallback: fallbackCatalog?.categories.length ?? 0,
    };
    diagnostics.parity.products = {
      supabase: productsSupabase,
      fallback: fallbackCatalog?.products.length ?? 0,
    };
    diagnostics.parity.paymentMethods = {
      supabase: paymentMethodsSupabase,
      fallback: fallbackCatalog?.paymentMethods.length ?? 0,
    };
    diagnostics.parity.vatRates = {
      supabase: vatRatesSupabase,
      fallback: fallbackCatalog?.vatRates.length ?? 0,
    };
    diagnostics.sources.catalog = resolveSource(
      departmentsSupabase > 0 || categoriesSupabase > 0 || productsSupabase > 0
    );
    diagnostics.sources.paymentsConfig = resolveSource(
      paymentMethodsSupabase > 0 || vatRatesSupabase > 0
    );
  } catch {
    diagnostics.sources.catalog = "fallback";
    diagnostics.sources.paymentsConfig = "fallback";
    diagnostics.sourceErrors.catalog = "Supabase relational read failed";
    diagnostics.sourceErrors.paymentsConfig = "Supabase relational read failed";
  }

  try {
    relationalPaymentEntries = await readRelationalPaymentArchiveEntries();
    const paymentsParity = buildPaymentsParitySnapshot(
      (fallbackFinancialArchive?.entries ?? []) as ArchivedPaymentLike[],
      (relationalPaymentEntries ?? []) as ArchivedPaymentLike[]
    );

    diagnostics.parity.payments = {
      supabase: paymentsParity.supabaseCount,
      fallback: paymentsParity.fallbackCount,
    };
    diagnostics.parityStatus.payments = paymentsParity.clean ? "ok" : "mismatch";
    diagnostics.sources.payments =
      paymentsParity.clean && paymentsParity.supabaseCount > 0 ? "supabase" : "fallback";
    diagnostics.payments.source = diagnostics.sources.payments;
    diagnostics.payments.countSupabase = paymentsParity.supabaseCount;
    diagnostics.payments.countFallback = paymentsParity.fallbackCount;
    diagnostics.payments.totalAmountSupabase = paymentsParity.supabaseTotalAmount;
    diagnostics.payments.totalAmountFallback = paymentsParity.fallbackTotalAmount;
    diagnostics.payments.parity = diagnostics.parityStatus.payments;
    diagnostics.payments.missingInSupabase = paymentsParity.missingInSupabase.slice(0, 10);
    diagnostics.payments.extraInSupabase = paymentsParity.extraInSupabase.slice(0, 10);
    diagnostics.payments.mismatches = paymentsParity.mismatches.slice(0, 10);
  } catch (error) {
    diagnostics.sources.payments = "fallback";
    diagnostics.sourceErrors.payments = "Supabase relational payments read failed";
    diagnostics.payments.lastError =
      error instanceof Error ? error.message : "Supabase relational payments read failed";
  }

  try {
    relationalFiscalDocumentEntries = await readRelationalFiscalDocumentArchiveEntries();
    const fiscalDocumentsParity = buildFiscalDocumentsParitySnapshot(
      (fallbackFinancialArchive?.entries ?? []) as ArchivedFiscalDocumentLike[],
      (relationalFiscalDocumentEntries ?? []) as ArchivedFiscalDocumentLike[]
    );

    diagnostics.parity.fiscalDocuments = {
      supabase: fiscalDocumentsParity.supabaseCount,
      fallback: fiscalDocumentsParity.fallbackCount,
    };
    diagnostics.parityStatus.fiscalDocuments = fiscalDocumentsParity.clean ? "ok" : "mismatch";
    diagnostics.sources.fiscalDocuments =
      fiscalDocumentsParity.clean && fiscalDocumentsParity.supabaseCount > 0
        ? "supabase"
        : "fallback";
    diagnostics.fiscalDocuments.source = diagnostics.sources.fiscalDocuments;
    diagnostics.fiscalDocuments.countSupabase = fiscalDocumentsParity.supabaseCount;
    diagnostics.fiscalDocuments.countFallback = fiscalDocumentsParity.fallbackCount;
    diagnostics.fiscalDocuments.totalAmountSupabase = fiscalDocumentsParity.supabaseTotalAmount;
    diagnostics.fiscalDocuments.totalAmountFallback = fiscalDocumentsParity.fallbackTotalAmount;
    diagnostics.fiscalDocuments.parity = diagnostics.parityStatus.fiscalDocuments;
    diagnostics.fiscalDocuments.missingInSupabase =
      fiscalDocumentsParity.missingInSupabase.slice(0, 10);
    diagnostics.fiscalDocuments.extraInSupabase =
      fiscalDocumentsParity.extraInSupabase.slice(0, 10);
    diagnostics.fiscalDocuments.mismatches = fiscalDocumentsParity.mismatches.slice(0, 10);
  } catch (error) {
    diagnostics.sources.fiscalDocuments = "fallback";
    diagnostics.sourceErrors.fiscalDocuments = "Supabase relational fiscal_documents read failed";
    diagnostics.fiscalDocuments.lastError =
      error instanceof Error
        ? error.message
        : "Supabase relational fiscal_documents read failed";
  }

  try {
    relationalCashClosureEntries = await readRelationalCashClosureArchiveEntries();
    const cashClosuresParity = buildFinancialDomainParitySnapshot(
      (fallbackFinancialArchive?.entries ?? []) as ArchivedFinancialDomainLike[],
      (relationalCashClosureEntries ?? []) as ArchivedFinancialDomainLike[],
      { filter: isCashClosureEntry }
    );

    diagnostics.parity.cashClosures = {
      supabase: cashClosuresParity.supabaseCount,
      fallback: cashClosuresParity.fallbackCount,
    };
    diagnostics.parityStatus.cashClosures = cashClosuresParity.clean ? "ok" : "mismatch";
    diagnostics.sources.cashClosures =
      cashClosuresParity.clean && cashClosuresParity.supabaseCount > 0 ? "supabase" : "fallback";
    diagnostics.cashClosures.source = diagnostics.sources.cashClosures;
    diagnostics.cashClosures.countSupabase = cashClosuresParity.supabaseCount;
    diagnostics.cashClosures.countFallback = cashClosuresParity.fallbackCount;
    diagnostics.cashClosures.totalAmountSupabase = cashClosuresParity.supabaseTotalAmount;
    diagnostics.cashClosures.totalAmountFallback = cashClosuresParity.fallbackTotalAmount;
    diagnostics.cashClosures.parity = diagnostics.parityStatus.cashClosures;
    diagnostics.cashClosures.missingInSupabase = cashClosuresParity.missingInSupabase.slice(0, 10);
    diagnostics.cashClosures.extraInSupabase = cashClosuresParity.extraInSupabase.slice(0, 10);
    diagnostics.cashClosures.mismatches = cashClosuresParity.mismatches.slice(0, 10);
  } catch (error) {
    diagnostics.sources.cashClosures = "fallback";
    diagnostics.sourceErrors.cashClosures = "Supabase relational cash_closures read failed";
    diagnostics.cashClosures.lastError =
      error instanceof Error ? error.message : "Supabase relational cash_closures read failed";
  }

  try {
    relationalDailyReportEntries = await readRelationalDailyReportArchiveEntries();
    const dailyReportsParity = buildFinancialDomainParitySnapshot(
      (fallbackFinancialArchive?.entries ?? []) as ArchivedFinancialDomainLike[],
      (relationalDailyReportEntries ?? []) as ArchivedFinancialDomainLike[],
      { filter: isDailyReportEntry }
    );

    diagnostics.parity.dailyReports = {
      supabase: dailyReportsParity.supabaseCount,
      fallback: dailyReportsParity.fallbackCount,
    };
    diagnostics.parityStatus.dailyReports = dailyReportsParity.clean ? "ok" : "mismatch";
    diagnostics.sources.dailyReports =
      dailyReportsParity.clean && dailyReportsParity.supabaseCount > 0 ? "supabase" : "fallback";
    diagnostics.dailyReports.source = diagnostics.sources.dailyReports;
    diagnostics.dailyReports.countSupabase = dailyReportsParity.supabaseCount;
    diagnostics.dailyReports.countFallback = dailyReportsParity.fallbackCount;
    diagnostics.dailyReports.totalAmountSupabase = dailyReportsParity.supabaseTotalAmount;
    diagnostics.dailyReports.totalAmountFallback = dailyReportsParity.fallbackTotalAmount;
    diagnostics.dailyReports.parity = diagnostics.parityStatus.dailyReports;
    diagnostics.dailyReports.missingInSupabase = dailyReportsParity.missingInSupabase.slice(0, 10);
    diagnostics.dailyReports.extraInSupabase = dailyReportsParity.extraInSupabase.slice(0, 10);
    diagnostics.dailyReports.mismatches = dailyReportsParity.mismatches.slice(0, 10);
  } catch (error) {
    diagnostics.sources.dailyReports = "fallback";
    diagnostics.sourceErrors.dailyReports = "Supabase relational daily_reports read failed";
    diagnostics.dailyReports.lastError =
      error instanceof Error ? error.message : "Supabase relational daily_reports read failed";
  }

  try {
    relationalPrintingOpsState = await readRelationalPrintingOpsState();
    const printerConfigParity = await runParityCheck(["printer_configs", "printer_routing_rules"]);
    const printerConfigsParity = printerConfigParity.printer_configs;
    const printerRoutingParity = printerConfigParity.printer_routing_rules;

    diagnostics.parity.printerConfigs = {
      supabase: relationalPrintingOpsState?.printers.length ?? 0,
      fallback: fallbackPrintingConfig?.printers.length ?? 0,
    };
    diagnostics.parity.printerRoutingRules = {
      supabase: relationalPrintingOpsState?.routingRules.length ?? 0,
      fallback: fallbackPrintingConfig?.routingRules.length ?? 0,
    };
    diagnostics.parityStatus.printerConfigs =
      printerConfigsParity.mismatched === 0 &&
      printerConfigsParity.missingInSupabase === 0 &&
      printerConfigsParity.missingInFallback === 0
        ? "ok"
        : "mismatch";
    diagnostics.parityStatus.printerRoutingRules =
      printerRoutingParity.mismatched === 0 &&
      printerRoutingParity.missingInSupabase === 0 &&
      printerRoutingParity.missingInFallback === 0
        ? "ok"
        : "mismatch";
    const printerParityClean =
      diagnostics.parityStatus.printerConfigs === "ok" &&
      diagnostics.parityStatus.printerRoutingRules === "ok";
    diagnostics.sources.printerConfig =
      printerParityClean && (relationalPrintingOpsState?.printers.length ?? 0) > 0 ? "supabase" : "fallback";
    diagnostics.sources.printerRoutingRules =
      printerParityClean && (relationalPrintingOpsState?.routingRules.length ?? 0) > 0
        ? "supabase"
        : "fallback";
    diagnostics.printerConfig.source = diagnostics.sources.printerConfig;
    diagnostics.printerConfig.printersCountSupabase = relationalPrintingOpsState?.printers.length ?? 0;
    diagnostics.printerConfig.printersCountFallback = fallbackPrintingConfig?.printers.length ?? 0;
    diagnostics.printerConfig.routingRulesCountSupabase =
      relationalPrintingOpsState?.routingRules.length ?? 0;
    diagnostics.printerConfig.routingRulesCountFallback =
      fallbackPrintingConfig?.routingRules.length ?? 0;
    diagnostics.printerConfig.parity = printerParityClean ? "ok" : "mismatch";
  } catch (error) {
    diagnostics.sources.printerConfig = "fallback";
    diagnostics.sources.printerRoutingRules = "fallback";
    diagnostics.sourceErrors.printerConfig = "Supabase relational printer config read failed";
    diagnostics.sourceErrors.printerRoutingRules = "Supabase relational printer routing read failed";
    diagnostics.printerConfig.lastError =
      error instanceof Error ? error.message : "Supabase relational printer config read failed";
  }

  try {
    relationalFidelityState = await readRelationalFidelityState();
    const fidelityParity = await runParityCheck(["fidelity"]);
    const fidelityResult = fidelityParity.fidelity;
    diagnostics.parity.fidelityProfiles = {
      supabase: relationalFidelityState?.customers.length ?? 0,
      fallback: fallbackFidelity.customers.length,
    };
    diagnostics.parity.fidelityRewards = {
      supabase: relationalFidelityState?.rewards.length ?? 0,
      fallback: fallbackFidelity.rewards.length,
    };
    diagnostics.parity.fidelityPointsMovements = {
      supabase: relationalFidelityState?.pointsMovements.length ?? 0,
      fallback: fallbackFidelity.pointsMovements.length,
    };
    diagnostics.parity.fidelityRewardRedemptions = {
      supabase: relationalFidelityState?.rewardRedemptions.length ?? 0,
      fallback: fallbackFidelity.rewardRedemptions.length,
    };
    diagnostics.parityStatus.fidelity =
      fidelityResult.mismatched === 0 &&
      fidelityResult.missingInSupabase === 0 &&
      fidelityResult.missingInFallback === 0
        ? "ok"
        : "mismatch";
    const fidelityHasRows =
      (relationalFidelityState?.customers.length ?? 0) > 0 ||
      (relationalFidelityState?.rewards.length ?? 0) > 0 ||
      (relationalFidelityState?.pointsMovements.length ?? 0) > 0 ||
      (relationalFidelityState?.rewardRedemptions.length ?? 0) > 0;
    diagnostics.sources.fidelity =
      diagnostics.parityStatus.fidelity === "ok" && fidelityHasRows ? "supabase" : "fallback";
    diagnostics.fidelity.source = diagnostics.sources.fidelity;
    diagnostics.fidelity.profilesCountSupabase = relationalFidelityState?.customers.length ?? 0;
    diagnostics.fidelity.profilesCountFallback = fallbackFidelity.customers.length;
    diagnostics.fidelity.rewardsCountSupabase = relationalFidelityState?.rewards.length ?? 0;
    diagnostics.fidelity.rewardsCountFallback = fallbackFidelity.rewards.length;
    diagnostics.fidelity.pointsMovementsCountSupabase =
      relationalFidelityState?.pointsMovements.length ?? 0;
    diagnostics.fidelity.pointsMovementsCountFallback = fallbackFidelity.pointsMovements.length;
    diagnostics.fidelity.rewardRedemptionsCountSupabase =
      relationalFidelityState?.rewardRedemptions.length ?? 0;
    diagnostics.fidelity.rewardRedemptionsCountFallback =
      fallbackFidelity.rewardRedemptions.length;
    diagnostics.fidelity.parity = diagnostics.parityStatus.fidelity;
  } catch (error) {
    diagnostics.sources.fidelity = "fallback";
    diagnostics.sourceErrors.fidelity = "Supabase relational fidelity read failed";
    diagnostics.fidelity.lastError =
      error instanceof Error ? error.message : "Supabase relational fidelity read failed";
  }

  try {
    relationalPrintingOpsState ??= await readRelationalPrintingOpsState();
    const operationalLogsParity = await runParityCheck(["operational_logs"]);
    const opsResult = operationalLogsParity.operational_logs;
    diagnostics.parity.fiscalPrinterLogs = {
      supabase: relationalPrintingOpsState?.fiscalPrinterLogs.length ?? 0,
      fallback: fallbackOperationalLogs.fiscalPrinterLogs.length,
    };
    diagnostics.parity.voidLogs = {
      supabase: relationalPrintingOpsState?.voidLogs.length ?? 0,
      fallback: fallbackOperationalLogs.voidLogs.length,
    };
    diagnostics.parity.auditLogs = {
      supabase: relationalPrintingOpsState?.auditLogs.length ?? 0,
      fallback: fallbackOperationalLogs.auditLogs.length,
    };
    diagnostics.parityStatus.operationalLogs =
      opsResult.mismatched === 0 &&
      opsResult.missingInSupabase === 0 &&
      opsResult.missingInFallback === 0
        ? "ok"
        : "mismatch";
    diagnostics.sources.operationalLogs =
      diagnostics.parityStatus.operationalLogs === "ok" &&
      ((relationalPrintingOpsState?.fiscalPrinterLogs.length ?? 0) > 0 ||
        (relationalPrintingOpsState?.voidLogs.length ?? 0) > 0 ||
        (relationalPrintingOpsState?.auditLogs.length ?? 0) > 0)
        ? "supabase"
        : "fallback";
    diagnostics.operationalLogs.source = diagnostics.sources.operationalLogs;
    diagnostics.operationalLogs.fiscalPrinterLogsCountSupabase =
      relationalPrintingOpsState?.fiscalPrinterLogs.length ?? 0;
    diagnostics.operationalLogs.fiscalPrinterLogsCountFallback =
      fallbackOperationalLogs.fiscalPrinterLogs.length;
    diagnostics.operationalLogs.voidLogsCountSupabase =
      relationalPrintingOpsState?.voidLogs.length ?? 0;
    diagnostics.operationalLogs.voidLogsCountFallback = fallbackOperationalLogs.voidLogs.length;
    diagnostics.operationalLogs.auditLogsCountSupabase =
      relationalPrintingOpsState?.auditLogs.length ?? 0;
    diagnostics.operationalLogs.auditLogsCountFallback = fallbackOperationalLogs.auditLogs.length;
    diagnostics.operationalLogs.parity = diagnostics.parityStatus.operationalLogs;

    const printJobs = await readSupabaseRows<{ id: string }>("print_jobs", {
      filters: [{ column: "restaurant_id", value: getActiveRestaurantId() }],
    });
    diagnostics.parity.printJobs.supabase = printJobs?.length ?? 0;
    diagnostics.operationalLogs.printJobsCountSupabase = printJobs?.length ?? 0;
  } catch (error) {
    diagnostics.sources.operationalLogs = "fallback";
    diagnostics.sourceErrors.operationalLogs = "Supabase relational operational logs read failed";
    diagnostics.operationalLogs.lastError =
      error instanceof Error ? error.message : "Supabase relational operational logs read failed";
  }

  try {
    await updateSupabaseRows<Record<string, unknown>>(
      "audit_logs",
      { message: "supabase-diagnostic-noop" },
      [
        { column: "restaurant_id", value: getActiveRestaurantId() },
        { column: "id", value: "00000000-0000-0000-0000-000000000000" },
      ]
    );
    diagnostics.checks.auditLogsWriteNoop = {
      status: "ok",
    };
  } catch {
    diagnostics.checks.auditLogsWriteNoop = {
      status: "fallback",
    };
  }

  diagnostics.usage.relationalReadsActive = [
    "rooms",
    "tables metadata",
    "orders live",
    "payments (gated by parity)",
    "fiscal documents (gated by parity)",
    "cash closures (gated by parity)",
    "daily reports (gated by parity)",
    "operators / roles",
    "companies / customers",
    "catalog",
    "payment config",
    "printer config (gated by parity)",
    "fidelity (gated by parity)",
  ];

  diagnostics.usage.relationalWritesActive = [
    "rooms / tables",
    "operators / roles",
    "companies / customers",
    "orders / order_lines / order_courses / order_guests",
    "order_transmissions / order_transmission_lines",
    "catalog",
    "payments / fiscal_documents / cash_closures / daily_reports",
    "fidelity",
    "printer configs / routing rules",
    "fiscal / void / audit logs",
  ];

  diagnostics.usage.fallbackDomains = [
    "printer config operational source",
    "operational logs primary safety net",
  ];

  diagnostics.tables.relationalReads = [
    "rooms",
    "tables",
    "orders",
    "order_lines",
    "order_courses",
    "order_guests",
    "payments",
    "fiscal_documents",
    "cash_closures",
    "daily_reports",
    "operator_roles",
    "operators",
    "companies",
    "customers",
    "departments",
    "categories",
    "products",
    "payment_methods",
    "vat_rates",
    "printer_configs",
    "printer_routing_rules",
    "fidelity_profiles",
    "fidelity_rewards",
    "fidelity_points_movements",
    "fidelity_reward_redemptions",
  ];

  diagnostics.tables.relationalWrites = [
    ...diagnostics.tables.relationalReads,
    "orders",
    "order_lines",
    "order_courses",
    "order_guests",
    "order_transmissions",
    "order_transmission_lines",
    "payments",
    "fiscal_documents",
    "cash_closures",
    "daily_reports",
    "fidelity_profiles",
    "fidelity_rewards",
    "fidelity_points_movements",
    "fidelity_reward_redemptions",
    "printer_configs",
    "printer_routing_rules",
    "fiscal_printer_logs",
    "void_logs",
    "audit_logs",
  ];

  diagnostics.tables.fallbackBridge = [
    "pos_home_areas_state",
    "pos_tables_state",
    "pos_operator_roles_state",
    "pos_business_directory_state",
    "pos_catalog_state",
    "pos_printing_config_state",
  ];

  const sourceByTable: Record<string, "supabase" | "fallback"> = {
    rooms: diagnostics.sources.rooms,
    tables: diagnostics.sources.tables,
    orders: diagnostics.sources.orders,
    order_lines: diagnostics.sources.orderLines,
    order_courses: diagnostics.sources.orders,
    order_guests: diagnostics.sources.orders,
    order_transmissions: diagnostics.sources.orders,
    order_transmission_lines: diagnostics.sources.orders,
    payments: diagnostics.sources.payments,
    fiscal_documents: diagnostics.sources.fiscalDocuments,
    cash_closures: diagnostics.sources.cashClosures,
    daily_reports: diagnostics.sources.dailyReports,
    operator_roles: diagnostics.sources.operators,
    operators: diagnostics.sources.operators,
    companies: diagnostics.sources.companiesCustomers,
    customers: diagnostics.sources.companiesCustomers,
    departments: diagnostics.sources.catalog,
    categories: diagnostics.sources.catalog,
    products: diagnostics.sources.catalog,
    payment_methods: diagnostics.sources.paymentsConfig,
    vat_rates: diagnostics.sources.paymentsConfig,
    printer_configs: diagnostics.sources.printerConfig,
    printer_routing_rules: diagnostics.sources.printerRoutingRules,
    fiscal_printer_logs: diagnostics.sources.operationalLogs,
    void_logs: diagnostics.sources.operationalLogs,
    audit_logs: diagnostics.sources.operationalLogs,
    fidelity_profiles: diagnostics.sources.fidelity,
    fidelity_rewards: diagnostics.sources.fidelity,
    fidelity_points_movements: diagnostics.sources.fidelity,
    fidelity_reward_redemptions: diagnostics.sources.fidelity,
    print_jobs: diagnostics.sources.operationalLogs,
  };

  diagnostics.parityStatus.rooms = resolveParityStatus(
    diagnostics.parity.rooms.supabase,
    diagnostics.parity.rooms.fallback
  );
  diagnostics.parityStatus.tables = resolveParityStatus(
    diagnostics.parity.tables.supabase,
    diagnostics.parity.tables.fallback
  );
  diagnostics.parityStatus.orders = resolveParityStatus(
    diagnostics.parity.orders.supabase,
    diagnostics.parity.orders.fallback
  );
  diagnostics.parityStatus.orderLines = resolveParityStatus(
    diagnostics.parity.orderLines.supabase,
    diagnostics.parity.orderLines.fallback
  );
  diagnostics.parityStatus.orderCourses = resolveParityStatus(
    diagnostics.parity.orderCourses.supabase,
    diagnostics.parity.orderCourses.fallback
  );
  diagnostics.parityStatus.orderGuests = resolveParityStatus(
    diagnostics.parity.orderGuests.supabase,
    diagnostics.parity.orderGuests.fallback
  );
  diagnostics.parityStatus.operators = resolveParityStatus(
    diagnostics.parity.operators.supabase,
    diagnostics.parity.operators.fallback
  );
  diagnostics.parityStatus.companies = resolveParityStatus(
    diagnostics.parity.companies.supabase,
    diagnostics.parity.companies.fallback
  );
  diagnostics.parityStatus.customers = resolveParityStatus(
    diagnostics.parity.customers.supabase,
    diagnostics.parity.customers.fallback
  );
  diagnostics.parityStatus.departments = resolveParityStatus(
    diagnostics.parity.departments.supabase,
    diagnostics.parity.departments.fallback
  );
  diagnostics.parityStatus.categories = resolveParityStatus(
    diagnostics.parity.categories.supabase,
    diagnostics.parity.categories.fallback
  );
  diagnostics.parityStatus.products = resolveParityStatus(
    diagnostics.parity.products.supabase,
    diagnostics.parity.products.fallback
  );
  diagnostics.parityStatus.paymentMethods = resolveParityStatus(
    diagnostics.parity.paymentMethods.supabase,
    diagnostics.parity.paymentMethods.fallback
  );
  diagnostics.parityStatus.vatRates = resolveParityStatus(
    diagnostics.parity.vatRates.supabase,
    diagnostics.parity.vatRates.fallback
  );
  diagnostics.liveOrders.parity.orders = diagnostics.parityStatus.orders;
  diagnostics.liveOrders.parity.orderLines = diagnostics.parityStatus.orderLines;
  diagnostics.liveOrders.parity.orderCourses = diagnostics.parityStatus.orderCourses;
  diagnostics.liveOrders.parity.orderGuests = diagnostics.parityStatus.orderGuests;

  await Promise.all(
    [...STABLE_TABLE_PROBES, ...LIVE_ORDER_TABLE_PROBES, ...FINANCIAL_TABLE_PROBES, ...OPS_TABLE_PROBES].map(async (tableName) => {
      try {
        const probe = await probeSupabaseTable(tableName);
        diagnostics.restTables[tableName] = {
          ...probe,
          serviceRolePresent: diagnostics.env.serviceRolePresent,
          source: sourceByTable[tableName] ?? "fallback",
        };
        diagnostics.tablesExist[tableName] = probe.existsInDatabase;
      } catch (error) {
        diagnostics.restTables[tableName] = {
          tableName,
          schema: "public",
          existsInDatabase: false,
          restAccessible: false,
          statusCode: null,
          error: error instanceof Error ? error.message : "REST probe failed",
          serviceRolePresent: diagnostics.env.serviceRolePresent,
          source: sourceByTable[tableName] ?? "fallback",
        };
        diagnostics.tablesExist[tableName] = false;
      }
    })
  );

  diagnostics.parityDetails.rooms = buildDomainParityDetails(
    uniqueValues((fallbackHomeAreas?.areas ?? []).map((room) => normalizeTextKey(room.id))),
    uniqueValues((relationalRoomsState?.areas ?? []).map((room) => normalizeTextKey(room.id))),
    "legacy_room_id"
  );
  diagnostics.parityDetails.tables = buildDomainParityDetails(
    uniqueValues((fallbackTables?.tables ?? []).map((table) => normalizeTextKey(table.id))),
    uniqueValues((relationalRoomsState?.tables ?? []).map((table) => normalizeTextKey(table.id))),
    "legacy_table_id"
  );
  diagnostics.parityDetails.operators = buildDomainParityDetails(
    uniqueValues((effectiveFallbackOperatorRoles.roles ?? []).map((operator) => normalizeTextKey(operator.id))),
    uniqueValues((relationalOperatorsState?.roles ?? []).map((operator) => normalizeTextKey(operator.id))),
    "operator code/id"
  );
  diagnostics.parityDetails.companies = buildDomainParityDetails(
    (fallbackBusinessDirectory?.companies ?? []).map((company) =>
      [
        normalizeTextKey(company.vatNumber),
        normalizeTextKey(company.taxCode),
        normalizeTextKey(company.name),
      ].join("|")
    ),
    uniqueValues((relationalDirectoryState?.companies ?? []).map((company) =>
      [
        normalizeTextKey(company.vatNumber),
        normalizeTextKey(company.taxCode),
        normalizeTextKey(company.name),
      ].join("|")
    )),
    "vat_number|tax_code|name"
  );
  diagnostics.parityDetails.customers = buildDomainParityDetails(
    uniqueValues((fallbackBusinessDirectory?.customers ?? []).map((customer) => normalizeTextKey(customer.id))),
    uniqueValues((relationalDirectoryState?.customers ?? []).map((customer) => normalizeTextKey(customer.id))),
    "legacy_customer_id"
  );
  diagnostics.parityDetails.departments = buildDomainParityDetails(
    uniqueValues((fallbackCatalog?.departments ?? []).map((department) => normalizeTextKey(department.slug || department.id))),
    uniqueValues((relationalCatalogState?.departments ?? []).map((department) => normalizeTextKey(department.slug || department.id))),
    "department slug"
  );
  diagnostics.parityDetails.categories = buildDomainParityDetails(
    uniqueValues((fallbackCatalog?.categories ?? []).map((category) => normalizeTextKey(category.id))),
    uniqueValues((relationalCatalogState?.categories ?? []).map((category) => normalizeTextKey(category.id))),
    "category id"
  );
  diagnostics.parityDetails.products = buildDomainParityDetails(
    uniqueValues((fallbackCatalog?.products ?? []).map((product) => normalizeTextKey(product.id))),
    uniqueValues((relationalCatalogState?.products ?? []).map((product) => normalizeTextKey(product.id))),
    "legacy_product_id"
  );
  diagnostics.parityDetails.paymentMethods = buildDomainParityDetails(
    uniqueValues((fallbackCatalog?.paymentMethods ?? []).map((method) => normalizeTextKey(method.id))),
    uniqueValues((relationalCatalogState?.paymentMethods ?? []).map((method) => normalizeTextKey(method.id))),
    "payment method code"
  );
  diagnostics.parityDetails.vatRates = buildDomainParityDetails(
    uniqueValues((fallbackCatalog?.vatRates ?? []).map((rate) => normalizeTextKey(rate.key))),
    uniqueValues((relationalCatalogState?.vatRates ?? []).map((rate) => normalizeTextKey(rate.key))),
    "vat rate key"
  );
  diagnostics.parityDetails.orders = buildDomainParityDetails(
    uniqueValues(
      (fallbackTables?.tables ?? [])
        .filter((table) => table.orders.length > 0)
        .map((table) => normalizeTextKey(table.id))
    ),
    uniqueValues((relationalOperationalOverlays ?? []).map((table) => normalizeTextKey(table.id))),
    "legacy_order_key"
  );
  diagnostics.parityDetails.orderLines = buildDomainParityDetails(
    uniqueValues(
      flattenOrderItems(
        (fallbackTables?.tables ?? []).filter((table) => table.orders.length > 0)
      ).map((item) => normalizeTextKey(item.itemId))
    ),
    uniqueValues(
      flattenOrderItems(relationalOperationalOverlays ?? []).map((item) => normalizeTextKey(item.itemId))
    ),
    "legacy_order_line_id"
  );
  diagnostics.parityDetails.orderCourses = buildDomainParityDetails(
    uniqueValues(
      (fallbackTables?.tables ?? []).flatMap((table) =>
        Array.from(
          new Set(
            table.orders
              .map((item) => normalizeTextKey(item.course))
              .filter((course) => course.length > 0)
          )
        ).map((course) => `${normalizeTextKey(table.id)}:${course}`)
      )
    ),
    uniqueValues(
      (relationalOperationalOverlays ?? []).flatMap((table) =>
        Array.from(
          new Set(
            (table.orders ?? [])
              .map((item) => normalizeTextKey(item.course))
              .filter((course) => course.length > 0)
          )
        ).map((course) => `${normalizeTextKey(table.id)}:${course}`)
      )
    ),
    "table_id:course"
  );
  diagnostics.parityDetails.orderGuests = buildDomainParityDetails(
    uniqueValues(
      (fallbackTables?.tables ?? []).flatMap((table) =>
        Array.from(
          new Set(
            table.orders
              .map((item) => normalizeTextKey(item.commensaleCode))
              .filter((guest) => guest.length > 0)
          )
        ).map((guest) => `${normalizeTextKey(table.id)}:${guest}`)
      )
    ),
    uniqueValues(
      (relationalOperationalOverlays ?? []).flatMap((table) =>
        Array.from(
          new Set(
            (table.orders ?? [])
              .map((item) => normalizeTextKey(item.commensaleCode))
              .filter((guest) => guest.length > 0)
          )
        ).map((guest) => `${normalizeTextKey(table.id)}:${guest}`)
      )
    ),
    "table_id:guest_code"
  );
  diagnostics.parityDetails.fiscalDocuments = buildDomainParityDetails(
    uniqueValues(
      ((fallbackFinancialArchive?.entries ?? []) as ArchivedFiscalDocumentLike[])
        .filter((entry) =>
          Boolean(entry.documentType) || Boolean(entry.documentNumber) || Boolean(entry.referenceNumber)
        )
        .map((entry) => normalizeTextKey(entry.id))
    ),
    uniqueValues(
      ((relationalFiscalDocumentEntries ?? []) as ArchivedFiscalDocumentLike[])
        .filter((entry) =>
          Boolean(entry.documentType) || Boolean(entry.documentNumber) || Boolean(entry.referenceNumber)
        )
        .map((entry) => normalizeTextKey(entry.id))
    ),
    "legacy_document_id"
  );

  diagnostics.parity.companies.fallback = diagnostics.parityDetails.companies.fallbackCanonicalCount;
  diagnostics.parityStatus.companies = resolveParityStatus(
    diagnostics.parity.companies.supabase,
    diagnostics.parity.companies.fallback
  );

  diagnostics.liveOrders.fallbackOnlyOrderIds = diagnostics.parityDetails.orders.missingInSupabase;
  diagnostics.liveOrders.supabaseOnlyOrderIds = diagnostics.parityDetails.orders.extraInSupabase;

  try {
    const parityResults = await runParityCheck([
      "orders",
      "order_lines",
      "order_courses",
      "order_guests",
    ]);
    for (const result of Object.values(parityResults)) {
      const status =
        result.mismatched === 0 &&
        result.missingInSupabase === 0 &&
        result.missingInFallback === 0
          ? "ok"
          : "mismatch";

      if (result.domain === "orders") {
        diagnostics.parityStatus.orders = status;
        diagnostics.liveOrders.parity.orders = status;
      } else if (result.domain === "order_lines") {
        diagnostics.parityStatus.orderLines = status;
        diagnostics.liveOrders.parity.orderLines = status;
      } else if (result.domain === "order_courses") {
        diagnostics.parityStatus.orderCourses = status;
        diagnostics.liveOrders.parity.orderCourses = status;
      } else if (result.domain === "order_guests") {
        diagnostics.parityStatus.orderGuests = status;
        diagnostics.liveOrders.parity.orderGuests = status;
      }
    }
  } catch (error) {
    diagnostics.liveOrders.lastError =
      error instanceof Error ? error.message : "Order parity check failed";
  }

  try {
    const [transmissions, transmissionLines] = await Promise.all([
      readSupabaseRows<{ id: string }>("order_transmissions", {
        filters: [{ column: "restaurant_id", value: getActiveRestaurantId() }],
      }),
      readSupabaseRows<{ id: string }>("order_transmission_lines", {
        filters: [{ column: "restaurant_id", value: getActiveRestaurantId() }],
      }),
    ]);

    diagnostics.parity.orderTransmissions.supabase = (transmissions ?? []).length;
    diagnostics.parity.orderTransmissionLines.supabase = (transmissionLines ?? []).length;
    diagnostics.liveOrders.countSupabase.orderTransmissions = (transmissions ?? []).length;
    diagnostics.liveOrders.countSupabase.orderTransmissionLines = (transmissionLines ?? []).length;
  } catch (error) {
    diagnostics.liveOrders.lastError =
      diagnostics.liveOrders.lastError ??
      (error instanceof Error
        ? error.message
        : "Order transmission relational read failed");
  }

  return NextResponse.json(diagnostics, {
    status: 200,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
