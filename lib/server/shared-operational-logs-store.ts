import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { FiscalPrinterLogEntry } from "@/lib/fiscal-printer-log";
import type { StornoRecord } from "@/lib/storno-log";
import type { AuditLogEntry } from "@/types/audit";
import {
  readRelationalPrintingOpsState,
  writeRelationalOperationalLogs,
  writeRelationalPrintingConfigState,
} from "@/lib/server/supabase-relational-ops-repository";
import {
  allowsFallbackRead,
  prefersSupabaseRead,
} from "@/lib/server/supabase-read-mode";
import type { PrinterRoutingRule } from "@/lib/printer-routing";
import type { PrinterRecord } from "@/lib/printer-settings";
import type { PrintingFeatureFlags } from "@/lib/printer-config-service";
import type { OrderCommandSettings } from "@/lib/order-command-settings";

export type SharedOperationalLogsState = {
  fiscalPrinterLogs: FiscalPrinterLogEntry[];
  voidLogs: StornoRecord[];
  auditLogs: AuditLogEntry[];
  updatedAt: string;
};

export type SharedPrintingOpsState = {
  printers: PrinterRecord[];
  routingRules: PrinterRoutingRule[];
  updatedAt: string;
};

const DATA_DIR = path.join(process.cwd(), "data");
const OPERATIONAL_LOGS_FILE = path.join(DATA_DIR, "shared-operational-logs.json");

function nowIso() {
  return new Date().toISOString();
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function ensureDataDir() {
  await mkdir(DATA_DIR, { recursive: true });
}

export async function readFallbackOperationalLogsState(
  fallback: Omit<SharedOperationalLogsState, "updatedAt">
): Promise<SharedOperationalLogsState> {
  await ensureDataDir();

  try {
    const rawValue = await readFile(OPERATIONAL_LOGS_FILE, "utf8");
    const parsedValue = JSON.parse(rawValue) as Partial<SharedOperationalLogsState>;

    return {
      fiscalPrinterLogs: Array.isArray(parsedValue.fiscalPrinterLogs)
        ? clone(parsedValue.fiscalPrinterLogs)
        : clone(fallback.fiscalPrinterLogs),
      voidLogs: Array.isArray(parsedValue.voidLogs)
        ? clone(parsedValue.voidLogs)
        : clone(fallback.voidLogs),
      auditLogs: Array.isArray(parsedValue.auditLogs)
        ? clone(parsedValue.auditLogs)
        : clone(fallback.auditLogs),
      updatedAt:
        typeof parsedValue.updatedAt === "string" && parsedValue.updatedAt.length > 0
          ? parsedValue.updatedAt
          : nowIso(),
    };
  } catch {
    return {
      fiscalPrinterLogs: clone(fallback.fiscalPrinterLogs),
      voidLogs: clone(fallback.voidLogs),
      auditLogs: clone(fallback.auditLogs),
      updatedAt: nowIso(),
    };
  }
}

export async function readSharedOperationalLogsState(
  fallback: Omit<SharedOperationalLogsState, "updatedAt">
): Promise<SharedOperationalLogsState> {
  const fallbackState = await readFallbackOperationalLogsState(fallback);

  if (prefersSupabaseRead("operational-logs")) {
    try {
      const relational = await readRelationalPrintingOpsState();
      if (relational) {
        return {
          fiscalPrinterLogs:
            relational.fiscalPrinterLogs.length > 0 ? clone(relational.fiscalPrinterLogs) : clone(fallbackState.fiscalPrinterLogs),
          voidLogs: relational.voidLogs.length > 0 ? clone(relational.voidLogs) : clone(fallbackState.voidLogs),
          auditLogs: relational.auditLogs.length > 0 ? clone(relational.auditLogs) : clone(fallbackState.auditLogs),
          updatedAt: relational.updatedAt,
        };
      }
    } catch {
      // fallback locale
    }
  }

  if (!allowsFallbackRead("operational-logs")) {
    return fallbackState;
  }

  return fallbackState;
}

export async function writeSharedOperationalLogsState(
  state: Omit<SharedOperationalLogsState, "updatedAt">
): Promise<SharedOperationalLogsState> {
  const nextState = {
    ...clone({
      ...state,
      updatedAt: nowIso(),
    }),
  };

  await ensureDataDir();
  await writeFile(OPERATIONAL_LOGS_FILE, JSON.stringify(nextState, null, 2), "utf8");

  try {
    await writeRelationalOperationalLogs(nextState);
  } catch (error) {
    console.error("[shared-operational-logs-store] Relational Supabase write failed", error);
  }

  return nextState;
}

export async function readSharedPrintingOpsState(
  fallback: { printers: PrinterRecord[]; routingRules: PrinterRoutingRule[] }
): Promise<SharedPrintingOpsState> {
  if (prefersSupabaseRead("printer-configs") || prefersSupabaseRead("printer-routing-rules")) {
    try {
      const relational = await readRelationalPrintingOpsState();
      if (relational) {
        return {
          printers: relational.printers.length > 0 ? clone(relational.printers) : clone(fallback.printers),
          routingRules:
            relational.routingRules.length > 0 ? clone(relational.routingRules) : clone(fallback.routingRules),
          updatedAt: relational.updatedAt,
        };
      }
    } catch {
      // fallback locale
    }
  }

  return {
    printers: clone(fallback.printers),
    routingRules: clone(fallback.routingRules),
    updatedAt: nowIso(),
  };
}

export async function writeSharedPrintingOpsState(input: {
  printers: PrinterRecord[];
  routingRules: PrinterRoutingRule[];
  featureFlags?: PrintingFeatureFlags | null;
  commandSettings?: OrderCommandSettings | null;
}) {
  try {
    await writeRelationalPrintingConfigState(input);
  } catch (error) {
    console.error("[shared-operational-logs-store] Relational printing config write failed", error);
  }
}
