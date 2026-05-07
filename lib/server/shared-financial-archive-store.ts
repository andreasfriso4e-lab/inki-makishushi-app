import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  isSupabaseConfigured,
} from "@/lib/server/supabase-json-store";
import {
  buildFinancialDomainParitySnapshot,
  type ArchivedFinancialDomainLike,
} from "@/lib/server/financial-archive-domain-parity";
import {
  readRelationalFiscalDocumentArchiveEntries,
  readRelationalCashClosureArchiveEntries,
  readRelationalDailyReportArchiveEntries,
  readRelationalPaymentArchiveEntries,
  writeRelationalFinancialArchiveEntries,
} from "@/lib/server/supabase-relational-financial-repository";
import {
  allowsFallbackRead,
  prefersSupabaseRead,
} from "@/lib/server/supabase-read-mode";
import {
  buildFiscalDocumentsParitySnapshot,
  isFiscalDocumentArchivedEntry,
  type ArchivedFiscalDocumentLike,
} from "@/lib/server/fiscal-documents-parity";
import {
  buildPaymentsParitySnapshot,
  isSaleArchivedEntry,
  type ArchivedPaymentLike,
} from "@/lib/server/payments-parity";

export type ArchivedMovementLike = Record<string, unknown> & {
  id: string;
  createdAt?: string;
  created_at?: string;
};

export type SharedFinancialArchiveState = {
  entries: ArchivedMovementLike[];
  updatedAt: string;
};

const DATA_DIR = path.join(process.cwd(), "data");
const FINANCIAL_ARCHIVE_FILE = path.join(DATA_DIR, "shared-financial-archive.json");

function nowIso() {
  return new Date().toISOString();
}

function cloneEntries(entries: ArchivedMovementLike[]) {
  return JSON.parse(JSON.stringify(entries)) as ArchivedMovementLike[];
}

function mergeEntriesById(entries: ArchivedMovementLike[]) {
  const merged = new Map<string, ArchivedMovementLike>();
  for (const entry of entries) {
    if (entry.id) {
      merged.set(entry.id, entry);
    }
  }
  return Array.from(merged.values()).sort((left, right) =>
    String(right.created_at ?? right.createdAt ?? "").localeCompare(
      String(left.created_at ?? left.createdAt ?? "")
    )
  );
}

async function ensureDataDir() {
  await mkdir(DATA_DIR, { recursive: true });
}

async function readLocalSharedFinancialArchiveState() {
  await ensureDataDir();

  try {
    const rawValue = await readFile(FINANCIAL_ARCHIVE_FILE, "utf8");
    const parsedValue = JSON.parse(rawValue) as Partial<SharedFinancialArchiveState>;
    return {
      entries: Array.isArray(parsedValue.entries) ? cloneEntries(parsedValue.entries) : [],
      updatedAt:
        typeof parsedValue.updatedAt === "string" && parsedValue.updatedAt.length > 0
          ? parsedValue.updatedAt
          : nowIso(),
    } satisfies SharedFinancialArchiveState;
  } catch {
    return null;
  }
}

export async function readFallbackSharedFinancialArchiveState() {
  return readLocalSharedFinancialArchiveState();
}

export async function readSharedFinancialArchiveState(): Promise<SharedFinancialArchiveState> {
  const localState = await readLocalSharedFinancialArchiveState();
  const baselineEntries = localState?.entries ?? [];
  let effectiveEntries = baselineEntries;
  let effectiveUpdatedAt = localState?.updatedAt ?? nowIso();

  if (isSupabaseConfigured() && prefersSupabaseRead("payments")) {
    try {
      let relationalPaymentEntries = (await readRelationalPaymentArchiveEntries()) ?? [];
      let paymentParity = buildPaymentsParitySnapshot(
        baselineEntries as ArchivedPaymentLike[],
        relationalPaymentEntries as ArchivedPaymentLike[]
      );

      if (
        baselineEntries.some((entry) => isSaleArchivedEntry(entry)) &&
        !paymentParity.clean
      ) {
        try {
          await writeRelationalFinancialArchiveEntries(baselineEntries);
          relationalPaymentEntries = (await readRelationalPaymentArchiveEntries()) ?? [];
          paymentParity = buildPaymentsParitySnapshot(
            baselineEntries as ArchivedPaymentLike[],
            relationalPaymentEntries as ArchivedPaymentLike[]
          );
        } catch (error) {
          console.error("[shared-financial-archive-store] Payment backfill failed", error);
        }
      }

      if (paymentParity.clean && relationalPaymentEntries.length > 0) {
        const nonSaleEntries = effectiveEntries.filter((entry) => !isSaleArchivedEntry(entry));
        effectiveEntries = mergeEntriesById([
          ...nonSaleEntries,
          ...relationalPaymentEntries,
        ]);
        console.info("[shared-financial-archive-store] payments read source=supabase");
      }
    } catch {
      // fallback locale/file for payments
    }
  }

  if (isSupabaseConfigured() && prefersSupabaseRead("fiscal-documents")) {
    try {
      let relationalDocumentEntries = (await readRelationalFiscalDocumentArchiveEntries()) ?? [];
      let fiscalParity = buildFiscalDocumentsParitySnapshot(
        baselineEntries as ArchivedFiscalDocumentLike[],
        relationalDocumentEntries as ArchivedFiscalDocumentLike[]
      );

      if (
        baselineEntries.some((entry) => isFiscalDocumentArchivedEntry(entry)) &&
        !fiscalParity.clean
      ) {
        try {
          await writeRelationalFinancialArchiveEntries(baselineEntries);
          relationalDocumentEntries = (await readRelationalFiscalDocumentArchiveEntries()) ?? [];
          fiscalParity = buildFiscalDocumentsParitySnapshot(
            baselineEntries as ArchivedFiscalDocumentLike[],
            relationalDocumentEntries as ArchivedFiscalDocumentLike[]
          );
        } catch (error) {
          console.error("[shared-financial-archive-store] Fiscal documents backfill failed", error);
        }
      }

      if (fiscalParity.clean && relationalDocumentEntries.length > 0) {
        const nonDocumentEntries = effectiveEntries.filter(
          (entry) => !isFiscalDocumentArchivedEntry(entry)
        );
        effectiveEntries = mergeEntriesById([
          ...nonDocumentEntries,
          ...relationalDocumentEntries,
        ]);
        console.info("[shared-financial-archive-store] fiscal-documents read source=supabase");
      }
    } catch {
      // fallback locale/file
    }
  }

  if (isSupabaseConfigured() && prefersSupabaseRead("cash-closures")) {
    try {
      let relationalClosureEntries = (await readRelationalCashClosureArchiveEntries()) ?? [];
      let closureParity = buildFinancialDomainParitySnapshot(
        baselineEntries as ArchivedFinancialDomainLike[],
        relationalClosureEntries as ArchivedFinancialDomainLike[],
        {
          filter: (entry) => String(entry.operationKind ?? "") === "daily-close",
        }
      );

      if (
        baselineEntries.some((entry) => String(entry.operationKind ?? "") === "daily-close") &&
        !closureParity.clean
      ) {
        try {
          await writeRelationalFinancialArchiveEntries(baselineEntries);
          relationalClosureEntries = (await readRelationalCashClosureArchiveEntries()) ?? [];
          closureParity = buildFinancialDomainParitySnapshot(
            baselineEntries as ArchivedFinancialDomainLike[],
            relationalClosureEntries as ArchivedFinancialDomainLike[],
            {
              filter: (entry) => String(entry.operationKind ?? "") === "daily-close",
            }
          );
        } catch (error) {
          console.error("[shared-financial-archive-store] Cash closures backfill failed", error);
        }
      }

      if (closureParity.clean && relationalClosureEntries.length > 0) {
        const nonClosureEntries = effectiveEntries.filter(
          (entry) => String(entry.operationKind ?? "") !== "daily-close"
        );
        effectiveEntries = mergeEntriesById([
          ...nonClosureEntries,
          ...relationalClosureEntries,
        ]);
        console.info("[shared-financial-archive-store] cash-closures read source=supabase");
      }
    } catch {
      // fallback locale/file
    }
  }

  if (isSupabaseConfigured() && prefersSupabaseRead("daily-reports")) {
    try {
      let relationalReportEntries = (await readRelationalDailyReportArchiveEntries()) ?? [];
      let reportParity = buildFinancialDomainParitySnapshot(
        baselineEntries as ArchivedFinancialDomainLike[],
        relationalReportEntries as ArchivedFinancialDomainLike[],
        {
          filter: (entry) => String(entry.operationKind ?? "") === "financial-report",
        }
      );

      if (
        baselineEntries.some((entry) => String(entry.operationKind ?? "") === "financial-report") &&
        !reportParity.clean
      ) {
        try {
          await writeRelationalFinancialArchiveEntries(baselineEntries);
          relationalReportEntries = (await readRelationalDailyReportArchiveEntries()) ?? [];
          reportParity = buildFinancialDomainParitySnapshot(
            baselineEntries as ArchivedFinancialDomainLike[],
            relationalReportEntries as ArchivedFinancialDomainLike[],
            {
              filter: (entry) => String(entry.operationKind ?? "") === "financial-report",
            }
          );
        } catch (error) {
          console.error("[shared-financial-archive-store] Daily reports backfill failed", error);
        }
      }

      if (reportParity.clean && relationalReportEntries.length > 0) {
        const nonReportEntries = effectiveEntries.filter(
          (entry) => String(entry.operationKind ?? "") !== "financial-report"
        );
        effectiveEntries = mergeEntriesById([
          ...nonReportEntries,
          ...relationalReportEntries,
        ]);
        console.info("[shared-financial-archive-store] daily-reports read source=supabase");
      }
    } catch {
      // fallback locale/file
    }
  }

  if (!allowsFallbackRead("payments") || !allowsFallbackRead("fiscal-documents")) {
    return {
      entries: [],
      updatedAt: nowIso(),
    };
  }

  if (localState) {
    console.info("[shared-financial-archive-store] financial archive read source=fallback");
    return {
      entries: effectiveEntries,
      updatedAt: effectiveUpdatedAt,
    };
  }

  const initialState = {
    entries: [],
    updatedAt: nowIso(),
  } satisfies SharedFinancialArchiveState;
  await writeSharedFinancialArchiveState(initialState.entries);
  return initialState;
}

export async function writeSharedFinancialArchiveState(
  entries: ArchivedMovementLike[]
): Promise<SharedFinancialArchiveState> {
  await ensureDataDir();

  const nextState: SharedFinancialArchiveState = {
    entries: cloneEntries(entries),
    updatedAt: nowIso(),
  };

  await writeFile(FINANCIAL_ARCHIVE_FILE, JSON.stringify(nextState, null, 2), "utf8");

  if (isSupabaseConfigured()) {
    try {
      await writeRelationalFinancialArchiveEntries(nextState.entries);
    } catch (error) {
      console.error("[shared-financial-archive-store] Relational Supabase write failed", error);
    }
  }

  return nextState;
}
