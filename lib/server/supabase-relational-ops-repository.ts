import { getActiveRestaurantId } from "@/lib/restaurant-config";
import type { PrinterRoutingRule } from "@/lib/printer-routing";
import type { PrinterRecord } from "@/lib/printer-settings";
import {
  createSupabaseRows,
  deleteSupabaseRows,
  isSupabaseConfigured,
  readSupabaseRows,
  updateSupabaseRows,
} from "@/lib/server/supabase-json-store";
import type { PrintingFeatureFlags } from "@/lib/printer-config-service";
import type { OrderCommandSettings } from "@/lib/order-command-settings";
import type { FiscalPrinterLogEntry } from "@/lib/fiscal-printer-log";
import type { StornoRecord } from "@/lib/storno-log";
import type { AuditLogEntry } from "@/types/audit";

type RelationalPrinterConfigRow = {
  id: string;
  legacy_printer_id: string | null;
  code: string | null;
  name: string;
  role: string;
  model: string | null;
  connection_mode: string;
  host: string | null;
  port: number | null;
  is_default: boolean;
  is_enabled: boolean;
  last_connection_result: string | null;
  last_connection_at: string | null;
  metadata: Record<string, unknown> | null;
  legacy_payload: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type RelationalPrinterRoutingRow = {
  id: string;
  printer_id: string | null;
  category_id: string | null;
  target_printer_role: string | null;
  production_station: string | null;
  rule_scope: string;
  priority: number;
  is_enabled: boolean;
  conditions: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  legacy_payload: Record<string, unknown> | null;
  legacy_rule_key: string | null;
  created_at: string;
  updated_at: string;
};

type RelationalCategoryRow = {
  id: string;
  name: string;
  code: string | null;
};

type RelationalFiscalPrinterLogRow = {
  id: string;
  legacy_fiscal_log_id: string | null;
  legacy_payload: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type RelationalVoidLogRow = {
  id: string;
  legacy_void_log_id: string | null;
  legacy_payload: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type RelationalAuditLogRow = {
  id: string;
  legacy_audit_log_id: string | null;
  legacy_payload: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
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

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function syncByKey<TRow extends { id: string }>(
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
    if (!key) continue;
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

export async function readRelationalPrintingOpsState() {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const [printers, routingRules, fiscalLogs, voidLogs, auditLogs] = await Promise.all([
    readSupabaseRows<RelationalPrinterConfigRow>("printer_configs", {
      filters: [getRestaurantIdFilter()],
      orderBy: "name",
    }),
    readSupabaseRows<RelationalPrinterRoutingRow>("printer_routing_rules", {
      filters: [getRestaurantIdFilter()],
      orderBy: "priority",
    }),
    readSupabaseRows<RelationalFiscalPrinterLogRow>("fiscal_printer_logs", {
      filters: [getRestaurantIdFilter()],
      orderBy: "created_at",
      ascending: false,
    }),
    readSupabaseRows<RelationalVoidLogRow>("void_logs", {
      filters: [getRestaurantIdFilter()],
      orderBy: "created_at",
      ascending: false,
    }),
    readSupabaseRows<RelationalAuditLogRow>("audit_logs", {
      filters: [getRestaurantIdFilter()],
      orderBy: "created_at",
      ascending: false,
    }),
  ]);

  if (!printers && !routingRules && !fiscalLogs && !voidLogs && !auditLogs) {
    return null;
  }

  return {
    printers: (printers ?? []).map((row) => row.legacy_payload as unknown as PrinterRecord),
    routingRules: (routingRules ?? []).map((row) => row.legacy_payload as unknown as PrinterRoutingRule),
    fiscalPrinterLogs: (fiscalLogs ?? []).map((row) => row.legacy_payload as unknown as FiscalPrinterLogEntry),
    voidLogs: (voidLogs ?? []).map((row) => row.legacy_payload as unknown as StornoRecord),
    auditLogs: (auditLogs ?? []).map((row) => row.legacy_payload as unknown as AuditLogEntry),
    updatedAt:
      [printers ?? [], routingRules ?? [], fiscalLogs ?? [], voidLogs ?? [], auditLogs ?? []]
        .flat()
        .map((row) => row.updated_at)
        .sort()
        .at(-1) ?? nowIso(),
  };
}

export async function writeRelationalPrintingConfigState(input: {
  printers: PrinterRecord[];
  routingRules: PrinterRoutingRule[];
  featureFlags?: PrintingFeatureFlags | null;
  commandSettings?: OrderCommandSettings | null;
}) {
  if (!isSupabaseConfigured()) {
    return;
  }

  const [existingPrinters, existingRoutingRules, categoryRows] = await Promise.all([
    readSupabaseRows<RelationalPrinterConfigRow>("printer_configs", { filters: [getRestaurantIdFilter()] }),
    readSupabaseRows<RelationalPrinterRoutingRow>("printer_routing_rules", { filters: [getRestaurantIdFilter()] }),
    readSupabaseRows<RelationalCategoryRow>("categories", { filters: [getRestaurantIdFilter()] }),
  ]);

  const printerRows = input.printers.map((printer, index) => ({
    restaurant_id: getActiveRestaurantId(),
    legacy_printer_id: printer.id,
    code: slugify(printer.id || printer.name),
    name: printer.name,
    role: printer.role,
    model: printer.model,
    connection_mode: printer.connectionMode,
    host: printer.ipAddress || null,
    port: printer.port,
    device_path: null,
    is_default: index === 0,
    is_enabled: printer.enabled,
    last_connection_result: printer.lastConnectionResult,
    last_connection_at: printer.lastSeenAt ?? printer.lastTestedAt ?? null,
    metadata: {
      timeoutMs: printer.timeoutMs,
      paperColumns: printer.paperColumns,
      status: printer.status,
      lastTestedAt: printer.lastTestedAt ?? null,
      lastErrorMessage: printer.lastErrorMessage ?? "",
      fiscalDeviceId: printer.fiscalDeviceId ?? "",
      featureFlags: input.featureFlags ?? null,
      commandSettings: input.commandSettings ?? null,
    },
    legacy_payload: printer,
    created_at: printer.createdAt || nowIso(),
    updated_at: printer.updatedAt || nowIso(),
  }));

  await syncByKey(
    "printer_configs",
    existingPrinters ?? [],
    printerRows,
    (row) => row.legacy_printer_id ?? row.code ?? row.id,
    (row) => String(row.legacy_printer_id ?? row.code ?? "")
  );

  const refreshedPrinters =
    (await readSupabaseRows<RelationalPrinterConfigRow>("printer_configs", {
      filters: [getRestaurantIdFilter()],
    })) ?? [];
  const printerIdByLegacy = new Map(
    refreshedPrinters
      .filter((row) => Boolean(row.legacy_printer_id))
      .map((row) => [row.legacy_printer_id as string, row.id])
  );
  const categoryIdByName = new Map(
    (categoryRows ?? []).map((row) => [row.name, row.id])
  );

  const routingRows = input.routingRules.map((rule) => ({
    restaurant_id: getActiveRestaurantId(),
    printer_id: null,
    department_id: null,
    category_id: categoryIdByName.get(rule.category) ?? null,
    product_id: null,
    target_printer_role: rule.printerRole,
    production_station: null,
    rule_scope: "kitchen",
    priority: 100,
    is_enabled: true,
    conditions: {},
    metadata: {},
    legacy_payload: rule,
    legacy_rule_key: `${rule.category}::${rule.printerRole}`,
    created_at: rule.updatedAt || nowIso(),
    updated_at: rule.updatedAt || nowIso(),
  }));

  await syncByKey(
    "printer_routing_rules",
    existingRoutingRules ?? [],
    routingRows,
    (row) => row.legacy_rule_key ?? row.id,
    (row) => String(row.legacy_rule_key ?? "")
  );
}

export async function writeRelationalOperationalLogs(input: {
  fiscalPrinterLogs: FiscalPrinterLogEntry[];
  voidLogs: StornoRecord[];
  auditLogs: AuditLogEntry[];
}) {
  if (!isSupabaseConfigured()) {
    return;
  }

  const [existingFiscalLogs, existingVoidLogs, existingAuditLogs] = await Promise.all([
    readSupabaseRows<RelationalFiscalPrinterLogRow>("fiscal_printer_logs", { filters: [getRestaurantIdFilter()] }),
    readSupabaseRows<RelationalVoidLogRow>("void_logs", { filters: [getRestaurantIdFilter()] }),
    readSupabaseRows<RelationalAuditLogRow>("audit_logs", { filters: [getRestaurantIdFilter()] }),
  ]);

  const fiscalRows = input.fiscalPrinterLogs.map((entry) => ({
    restaurant_id: getActiveRestaurantId(),
    printer_id: null,
    order_id: null,
    document_id: null,
    log_level: entry.outcome === "failed" ? "error" : "info",
    event_type: entry.outcome,
    message: entry.payloadSummary,
    payload: entry,
    legacy_payload: entry,
    legacy_fiscal_log_id: entry.id,
    created_at: entry.timestamp || nowIso(),
    updated_at: entry.timestamp || nowIso(),
  }));

  await syncByKey(
    "fiscal_printer_logs",
    existingFiscalLogs ?? [],
    fiscalRows,
    (row) => row.legacy_fiscal_log_id ?? row.id,
    (row) => String(row.legacy_fiscal_log_id ?? "")
  );

  const voidRows = input.voidLogs.map((entry) => ({
    restaurant_id: getActiveRestaurantId(),
    order_id: null,
    payment_id: null,
    document_id: null,
    operator_id: null,
    reason: entry.reason || entry.type,
    payload: entry,
    metadata: {
      tableId: entry.tableId,
      printerNames: entry.printerNames,
    },
    legacy_payload: entry,
    legacy_void_log_id: entry.id,
    created_at: entry.createdAt || nowIso(),
    updated_at: entry.createdAt || nowIso(),
  }));

  await syncByKey(
    "void_logs",
    existingVoidLogs ?? [],
    voidRows,
    (row) => row.legacy_void_log_id ?? row.id,
    (row) => String(row.legacy_void_log_id ?? "")
  );

  const auditRows = input.auditLogs.map((entry) => ({
    restaurant_id: getActiveRestaurantId(),
    actor_operator_id: null,
    entity_type: entry.entityType,
    entity_id: entry.entityId,
    event_type: entry.eventType,
    origin: entry.origin,
    message: entry.notes ?? "",
    payload: entry,
    legacy_payload: entry,
    legacy_audit_log_id: entry.id,
    created_at: entry.timestamp || nowIso(),
    updated_at: entry.timestamp || nowIso(),
  }));

  await syncByKey(
    "audit_logs",
    existingAuditLogs ?? [],
    auditRows,
    (row) => row.legacy_audit_log_id ?? row.id,
    (row) => String(row.legacy_audit_log_id ?? "")
  );
}
