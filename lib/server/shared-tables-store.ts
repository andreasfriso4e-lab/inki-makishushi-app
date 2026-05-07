import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { getInitialTablesState, type PosTableState } from "@/lib/pos-data";
import {
  isSupabaseConfigured,
  readSupabaseJsonState,
  writeSupabaseJsonState,
} from "@/lib/server/supabase-json-store";
import {
  readRelationalOperationalTableOverlays,
  writeRelationalOperationalOrdersState,
} from "@/lib/server/supabase-relational-order-repository";
import {
  readRelationalRoomsAndTablesState,
  writeRelationalTablesState,
} from "@/lib/server/supabase-relational-read-repository";
import {
  allowsFallbackRead,
  prefersSupabaseRead,
} from "@/lib/server/supabase-read-mode";

export type SharedTablesState = {
  tables: PosTableState[];
  updatedAt: string;
};

const DATA_DIR = path.join(process.cwd(), "data");
const TABLES_STATE_FILE = path.join(DATA_DIR, "shared-tables-state.json");
const SUPABASE_TABLES_STATE_TABLE = "pos_tables_state";

function getNowIso() {
  return new Date().toISOString();
}

function cloneTables(tables: PosTableState[]) {
  return tables.map((table) => ({
    ...table,
    splitBillState: table.splitBillState
      ? {
          ...table.splitBillState,
          quotas: Array.isArray(table.splitBillState.quotas)
            ? table.splitBillState.quotas.map((quota) => ({
                ...quota,
                itemIds: quota.itemIds ? [...quota.itemIds] : [],
              }))
            : [],
        }
      : null,
    orders: Array.isArray(table.orders)
      ? table.orders.map((item) => ({
          ...item,
          additions: item.additions ? [...item.additions] : [],
          removals: item.removals ? [...item.removals] : [],
        }))
      : [],
  }));
}

function buildInitialSharedState(): SharedTablesState {
  return {
    tables: cloneTables(getInitialTablesState()),
    updatedAt: getNowIso(),
  };
}

function hasOperationalTableData(table: PosTableState) {
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

function mergeTableStates(baseTables: PosTableState[], overlayTables: PosTableState[]) {
  const overlayById = new Map(overlayTables.map((table) => [table.id, table]));
  const mergedTables = baseTables.map((baseTable) => {
    const overlayTable = overlayById.get(baseTable.id);

    if (!overlayTable) {
      return baseTable;
    }

    return {
      ...baseTable,
      ...overlayTable,
      id: baseTable.id,
      name: overlayTable.name || baseTable.name,
      room: overlayTable.room || baseTable.room,
      roomId: overlayTable.roomId || baseTable.roomId,
      orders: Array.isArray(overlayTable.orders) ? overlayTable.orders : baseTable.orders,
    };
  });

  const baseIds = new Set(baseTables.map((table) => table.id));
  const overlayOnlyTables = overlayTables.filter((table) => !baseIds.has(table.id));

  return [...mergedTables, ...overlayOnlyTables];
}

function mergeOperationalTableOverlays(
  baseTables: PosTableState[],
  overlayTables: Array<{ id: string } & Partial<PosTableState>>
) {
  const overlaysById = new Map(overlayTables.map((table) => [table.id, table]));

  return baseTables.map((table) => {
    const overlay = overlaysById.get(table.id);

    if (!overlay) {
      return table;
    }

    return {
      ...table,
      ...overlay,
      id: table.id,
      name: overlay.name || table.name,
      room: overlay.room || table.room,
      roomId: overlay.roomId || table.roomId,
      orders: Array.isArray(overlay.orders) ? overlay.orders : table.orders,
    };
  });
}

function mergeRelationalMetadataWithFallbackOperations(
  relationalTables: PosTableState[],
  fallbackTables: PosTableState[]
) {
  const fallbackById = new Map(fallbackTables.map((table) => [table.id, table]));

  return relationalTables.map((table) => {
    const fallbackTable = fallbackById.get(table.id);

    if (!fallbackTable) {
      return table;
    }

    return {
      ...table,
      status: fallbackTable.status,
      paymentStatus: fallbackTable.paymentStatus,
      covers: fallbackTable.covers,
      guests: fallbackTable.guests,
      customerName: fallbackTable.customerName,
      companyName: fallbackTable.companyName,
      operator: fallbackTable.operator,
      saleMode: fallbackTable.saleMode,
      servicePriceLabel: fallbackTable.servicePriceLabel,
      discountType: fallbackTable.discountType,
      note: fallbackTable.note,
      prebillPrintedAt: fallbackTable.prebillPrintedAt ?? null,
      splitBillState: fallbackTable.splitBillState ?? null,
      operatorId: fallbackTable.operatorId,
      createdAt: fallbackTable.createdAt ?? table.createdAt,
      updatedAt: fallbackTable.updatedAt ?? table.updatedAt,
      createdByOperatorId: fallbackTable.createdByOperatorId,
      updatedByOperatorId: fallbackTable.updatedByOperatorId,
      deletedByOperatorId: fallbackTable.deletedByOperatorId ?? null,
      paidByOperatorId: fallbackTable.paidByOperatorId ?? null,
      approvedByOperatorId: fallbackTable.approvedByOperatorId ?? null,
      fidelityCustomerId: fallbackTable.fidelityCustomerId ?? null,
      fidelityCustomerLabel: fallbackTable.fidelityCustomerLabel ?? "",
      fidelityCardCode: fallbackTable.fidelityCardCode ?? "",
      fidelityQrCodeValue: fallbackTable.fidelityQrCodeValue ?? "",
      fidelityScannedBeforePayment: fallbackTable.fidelityScannedBeforePayment ?? false,
      pointsEligible: fallbackTable.pointsEligible ?? false,
      pointsProcessed: fallbackTable.pointsProcessed ?? false,
      pendingPoints: fallbackTable.pendingPoints ?? 0,
      lastFidelityScanAt: fallbackTable.lastFidelityScanAt ?? null,
      selectedRewardId: fallbackTable.selectedRewardId ?? null,
      selectedRewardName: fallbackTable.selectedRewardName ?? "",
      selectedRewardDiscount: fallbackTable.selectedRewardDiscount ?? 0,
      selectedRewardPoints: fallbackTable.selectedRewardPoints ?? 0,
      rewardRedemptionId: fallbackTable.rewardRedemptionId ?? null,
      earnedPoints: fallbackTable.earnedPoints ?? 0,
      finalPointsBalanceSnapshot: fallbackTable.finalPointsBalanceSnapshot ?? null,
      pointsBeforePayment: fallbackTable.pointsBeforePayment ?? null,
      orders: Array.isArray(fallbackTable.orders) ? fallbackTable.orders : table.orders,
    };
  });
}

async function ensureDataDir() {
  await mkdir(DATA_DIR, { recursive: true });
}

async function readLocalSharedTablesState() {
  await ensureDataDir();

  try {
    const rawValue = await readFile(TABLES_STATE_FILE, "utf8");
    const parsedValue = JSON.parse(rawValue) as Partial<SharedTablesState>;

    if (!Array.isArray(parsedValue.tables)) {
      throw new Error("Invalid tables payload");
    }

    return {
      tables: cloneTables(parsedValue.tables),
      updatedAt:
        typeof parsedValue.updatedAt === "string" && parsedValue.updatedAt.length > 0
          ? parsedValue.updatedAt
          : getNowIso(),
    } satisfies SharedTablesState;
  } catch {
    return null;
  }
}

export async function readFallbackSharedTablesState(): Promise<SharedTablesState | null> {
  if (isSupabaseConfigured()) {
    try {
      const remoteState = await readSupabaseJsonState<{ tables?: PosTableState[] }>(
        SUPABASE_TABLES_STATE_TABLE
      );

      if (remoteState?.payload?.tables && Array.isArray(remoteState.payload.tables)) {
        return {
          tables: cloneTables(remoteState.payload.tables),
          updatedAt: remoteState.updatedAt,
        };
      }
    } catch {
      // fallback file below
    }
  }

  return readLocalSharedTablesState();
}

export async function readSharedTablesState(): Promise<SharedTablesState> {
  if (
    isSupabaseConfigured() &&
    (prefersSupabaseRead("tables-metadata") || prefersSupabaseRead("orders-live"))
  ) {
    try {
      const [relationalState, relationalOperationalOverlays] = await Promise.all([
        readRelationalRoomsAndTablesState(),
        readRelationalOperationalTableOverlays(),
      ]);
      const fallbackState = await readFallbackSharedTablesState();

      if (relationalState?.tables && relationalState.tables.length > 0) {
        let resolvedTables = cloneTables(relationalState.tables);

        if (prefersSupabaseRead("orders-live")) {
          let effectiveOperationalOverlays = relationalOperationalOverlays;
          const fallbackOperationalTables = (fallbackState?.tables ?? []).filter(
            hasOperationalTableData
          );

          if (
            (!effectiveOperationalOverlays || effectiveOperationalOverlays.length === 0) &&
            fallbackOperationalTables.length > 0
          ) {
            try {
              await writeRelationalOperationalOrdersState(fallbackState?.tables ?? []);
              effectiveOperationalOverlays =
                await readRelationalOperationalTableOverlays();
              console.info(
                "[shared-tables-store] operational backfill source=fallback->supabase"
              );
            } catch (error) {
              console.error(
                "[shared-tables-store] operational backfill failed",
                error
              );
            }
          }

          const relationalOperationalOverlayIds = new Set(
            (effectiveOperationalOverlays ?? []).map((table) => table.id)
          );
          const relationalTables =
            effectiveOperationalOverlays && effectiveOperationalOverlays.length > 0
              ? cloneTables(
                  mergeOperationalTableOverlays(
                    relationalState.tables,
                    effectiveOperationalOverlays
                  )
                )
              : cloneTables(relationalState.tables);
          const overlayTables = (fallbackState?.tables ?? []).filter(
            (table) => !relationalOperationalOverlayIds.has(table.id)
          );
          resolvedTables = cloneTables(mergeTableStates(relationalTables, overlayTables));
        } else {
          resolvedTables = cloneTables(
            mergeRelationalMetadataWithFallbackOperations(
              relationalState.tables,
              fallbackState?.tables ?? []
            )
          );
        }

        console.info(
          `[shared-tables-store] read source=${prefersSupabaseRead("orders-live") ? "supabase+operational-overlay" : "supabase-metadata+fallback-operations"}`
        );
        return {
          tables: resolvedTables,
          updatedAt: fallbackState?.updatedAt ?? relationalState.updatedAt,
        };
      }
    } catch {
      // Fallback locale/file: non bloccare tavoli e ordini se Supabase non risponde.
    }
  }

  if (!allowsFallbackRead("orders-live")) {
    const initialState = buildInitialSharedState();
    return initialState;
  }

  const localState = await readFallbackSharedTablesState();

  if (localState) {
    console.info("[shared-tables-store] read source=fallback");
    return localState;
  }

  const initialState = buildInitialSharedState();
  await writeSharedTablesState(initialState.tables);
  console.info("[shared-tables-store] read source=default");
  return initialState;
}

export async function writeSharedTablesState(tables: PosTableState[]): Promise<SharedTablesState> {
  const normalizedTables = cloneTables(tables);
  let nextState: SharedTablesState | null = null;

  if (isSupabaseConfigured()) {
    try {
      const remoteState = await writeSupabaseJsonState(SUPABASE_TABLES_STATE_TABLE, {
        tables: normalizedTables,
      });

      if (remoteState?.payload?.tables && Array.isArray(remoteState.payload.tables)) {
        nextState = {
          tables: cloneTables(remoteState.payload.tables),
          updatedAt: remoteState.updatedAt,
        };
      }
    } catch (error) {
      console.error("[shared-tables-store] Blob Supabase write failed", error);
    }
  }

  if (!nextState) {
    await ensureDataDir();

    nextState = {
      tables: normalizedTables,
      updatedAt: getNowIso(),
    };

    await writeFile(TABLES_STATE_FILE, JSON.stringify(nextState, null, 2), "utf8");
  }

  if (isSupabaseConfigured()) {
    try {
      await writeRelationalTablesState(nextState.tables);
    } catch (error) {
      console.error("[shared-tables-store] Relational Supabase write failed", error);
    }

    try {
      await writeRelationalOperationalOrdersState(nextState.tables);
    } catch (error) {
      console.error("[shared-tables-store] Relational order sync failed", error);
    }
  }

  return nextState;
}
