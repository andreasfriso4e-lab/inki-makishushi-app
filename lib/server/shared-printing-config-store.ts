import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { PrintingFeatureFlags } from "@/lib/printer-config-service";
import type { OrderCommandSettings } from "@/lib/order-command-settings";
import type { PrinterRoutingRule } from "@/lib/printer-routing";
import type { PrinterRecord } from "@/lib/printer-settings";
import {
  isSupabaseConfigured,
  readSupabaseJsonState,
  writeSupabaseJsonState,
} from "@/lib/server/supabase-json-store";
import {
  readSharedPrintingOpsState,
  writeSharedPrintingOpsState,
} from "@/lib/server/shared-operational-logs-store";
import {
  allowsFallbackRead,
  prefersSupabaseRead,
} from "@/lib/server/supabase-read-mode";

export type SharedPrintingConfig = {
  printers: PrinterRecord[];
  featureFlags: PrintingFeatureFlags | null;
  routingRules: PrinterRoutingRule[];
  commandSettings: OrderCommandSettings | null;
  updatedAt: string;
};

const DATA_DIR = path.join(process.cwd(), "data");
const PRINTING_CONFIG_FILE = path.join(DATA_DIR, "shared-printing-config.json");
const SUPABASE_PRINTING_CONFIG_TABLE = "pos_printing_config_state";

function getNowIso() {
  return new Date().toISOString();
}

function normalizeKey(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function buildParity(keysFallback: string[], keysSupabase: string[]) {
  const fallbackSet = new Set(keysFallback.filter(Boolean));
  const supabaseSet = new Set(keysSupabase.filter(Boolean));
  const missingInSupabase = Array.from(fallbackSet).filter((key) => !supabaseSet.has(key));
  const extraInSupabase = Array.from(supabaseSet).filter((key) => !fallbackSet.has(key));
  return {
    clean: missingInSupabase.length === 0 && extraInSupabase.length === 0,
  };
}

async function ensureDataDir() {
  await mkdir(DATA_DIR, { recursive: true });
}

export async function readFallbackSharedPrintingConfig(): Promise<SharedPrintingConfig | null> {
  if (isSupabaseConfigured()) {
    try {
      const remoteConfig = await readSupabaseJsonState<Partial<SharedPrintingConfig>>(
        SUPABASE_PRINTING_CONFIG_TABLE
      );

      if (remoteConfig?.payload) {
        return {
          printers: Array.isArray(remoteConfig.payload.printers) ? remoteConfig.payload.printers : [],
          featureFlags:
            remoteConfig.payload.featureFlags &&
            typeof remoteConfig.payload.featureFlags === "object"
              ? (remoteConfig.payload.featureFlags as PrintingFeatureFlags)
              : null,
          routingRules: Array.isArray(remoteConfig.payload.routingRules)
            ? remoteConfig.payload.routingRules
            : [],
          commandSettings:
            remoteConfig.payload.commandSettings &&
            typeof remoteConfig.payload.commandSettings === "object"
              ? (remoteConfig.payload.commandSettings as OrderCommandSettings)
              : null,
          updatedAt: remoteConfig.updatedAt,
        };
      }
    } catch {
      // fallback file below
    }
  }

  await ensureDataDir();

  try {
    const rawValue = await readFile(PRINTING_CONFIG_FILE, "utf8");
    const parsedValue = JSON.parse(rawValue) as Partial<SharedPrintingConfig>;

    return {
      printers: Array.isArray(parsedValue.printers) ? parsedValue.printers : [],
      featureFlags:
        parsedValue.featureFlags && typeof parsedValue.featureFlags === "object"
          ? (parsedValue.featureFlags as PrintingFeatureFlags)
          : null,
      routingRules: Array.isArray(parsedValue.routingRules) ? parsedValue.routingRules : [],
      commandSettings:
        parsedValue.commandSettings && typeof parsedValue.commandSettings === "object"
          ? (parsedValue.commandSettings as OrderCommandSettings)
          : null,
      updatedAt:
        typeof parsedValue.updatedAt === "string" && parsedValue.updatedAt.length > 0
          ? parsedValue.updatedAt
          : getNowIso(),
    };
  } catch {
    return null;
  }
}

export async function readSharedPrintingConfig(): Promise<SharedPrintingConfig | null> {
  let relationalConfig: SharedPrintingConfig | null = null;

  const blobConfig = await readFallbackSharedPrintingConfig();

  if (isSupabaseConfigured() && (prefersSupabaseRead("printer-configs") || prefersSupabaseRead("printer-routing-rules"))) {
    try {
      const relationalState = await readSharedPrintingOpsState({
        printers: [],
        routingRules: [],
      });

      const printersParity = buildParity(
        (blobConfig?.printers ?? []).map((printer) => normalizeKey(printer.id || printer.name)),
        (relationalState.printers ?? []).map((printer) => normalizeKey(printer.id || printer.name))
      );
      const routingParity = buildParity(
        (blobConfig?.routingRules ?? []).map((rule) =>
          normalizeKey(`${rule.category}::${rule.printerRole}`)
        ),
        (relationalState.routingRules ?? []).map((rule) =>
          normalizeKey(`${rule.category}::${rule.printerRole}`)
        )
      );

      if (
        printersParity.clean &&
        routingParity.clean &&
        (relationalState.printers.length > 0 || relationalState.routingRules.length > 0)
      ) {
        relationalConfig = {
          printers: relationalState.printers,
          featureFlags: null,
          routingRules: relationalState.routingRules,
          commandSettings: null,
          updatedAt: relationalState.updatedAt,
        };
        console.info("[shared-printing-config-store] read source=supabase");
      }
    } catch {
      // fallback below
    }
  }

  if (blobConfig) {
      return relationalConfig
        ? {
            printers: relationalConfig.printers.length > 0 ? relationalConfig.printers : blobConfig.printers,
            featureFlags: blobConfig.featureFlags,
            routingRules:
              relationalConfig.routingRules.length > 0 ? relationalConfig.routingRules : blobConfig.routingRules,
            commandSettings: blobConfig.commandSettings,
            updatedAt:
              relationalConfig.updatedAt > blobConfig.updatedAt
                ? relationalConfig.updatedAt
                : blobConfig.updatedAt,
          }
        : blobConfig;
  }

  if (relationalConfig) {
    return relationalConfig;
  }

  return relationalConfig;
}

export async function writeSharedPrintingConfig(
  config: Omit<SharedPrintingConfig, "updatedAt">
): Promise<SharedPrintingConfig> {
  const normalizedPayload = {
    printers: Array.isArray(config.printers) ? config.printers : [],
    featureFlags: config.featureFlags ?? null,
    routingRules: Array.isArray(config.routingRules) ? config.routingRules : [],
    commandSettings: config.commandSettings ?? null,
  };

  if (isSupabaseConfigured()) {
    const remoteConfig = await writeSupabaseJsonState(
      SUPABASE_PRINTING_CONFIG_TABLE,
      normalizedPayload
    );

    await writeSharedPrintingOpsState(normalizedPayload);

    if (remoteConfig?.payload) {
      return {
        printers: Array.isArray(remoteConfig.payload.printers) ? remoteConfig.payload.printers : [],
        featureFlags:
          remoteConfig.payload.featureFlags &&
          typeof remoteConfig.payload.featureFlags === "object"
            ? (remoteConfig.payload.featureFlags as PrintingFeatureFlags)
            : null,
        routingRules: Array.isArray(remoteConfig.payload.routingRules)
          ? remoteConfig.payload.routingRules
          : [],
        commandSettings:
          remoteConfig.payload.commandSettings &&
          typeof remoteConfig.payload.commandSettings === "object"
            ? (remoteConfig.payload.commandSettings as OrderCommandSettings)
            : null,
        updatedAt: remoteConfig.updatedAt,
      };
    }
  }

  await ensureDataDir();

  const nextConfig: SharedPrintingConfig = {
    ...normalizedPayload,
    updatedAt: getNowIso(),
  };

  await writeFile(PRINTING_CONFIG_FILE, JSON.stringify(nextConfig, null, 2), "utf8");

  await writeSharedPrintingOpsState(normalizedPayload);

  return nextConfig;
}
