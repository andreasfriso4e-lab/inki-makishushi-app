"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  hydrateHomeAreaSettingsFromServer,
  getHomeAreaSettings,
  HOME_SETTINGS_CHANGED_EVENT,
  type HomeAreaRecord,
} from "@/lib/home-settings";
import { getActiveRestaurantId } from "@/lib/restaurant-config";
import {
  getInitialTablesState,
  getLegacyGhostOrderProductIds,
  type OrderItem,
  type PosRoom,
  type PosTableState,
} from "@/lib/pos-data";
import { getRestaurantStorageKey } from "@/lib/restaurant-storage";
import { recordAuditEvent } from "@/services/audit-log-service";
import { useAuth } from "@/store/auth-context";

const TABLES_STORAGE_KEY = getRestaurantStorageKey("pos-tables-state");
const TABLES_DEBUG_STORAGE_KEY = getRestaurantStorageKey("pos-tables-debug");
const TABLES_STORAGE_VERSION_KEY = getRestaurantStorageKey("pos-tables-state-version");
const TABLES_RESET_BACKUP_META_STORAGE_KEY = getRestaurantStorageKey("pos-tables-reset-backup-meta");
const TABLES_STORAGE_RESET_VERSION = "2026-04-29-tables-clean-reset-v1";
const TABLES_SYNC_EVENT = "pos:tables-sync";
const TABLES_API_ENDPOINT = "/api/tables";
const REMOTE_TABLES_POLL_INTERVAL_MS = 10000;
const REMOTE_TABLES_SYNC_DEBOUNCE_MS = 180;

type UpdateTableInput = Partial<Omit<PosTableState, "id" | "room" | "orders">>;

type TablesContextValue = {
  tables: PosTableState[];
  rooms: PosRoom[];
  getTableById: (tableId: string) => PosTableState | undefined;
  updateTable: (tableId: string, data: UpdateTableInput) => void;
  setTableOrders: (tableId: string, orders: OrderItem[] | ((current: OrderItem[]) => OrderItem[])) => void;
  resetLocalTableState: () => Promise<{
    backupFileName: string | null;
    backupFilePath: string | null;
    resetAt: string;
  }>;
};

const TablesContext = createContext<TablesContextValue | undefined>(undefined);

const initialTablesState = getInitialTablesState();
const LEGACY_GHOST_ORDER_SET = new Set(getLegacyGhostOrderProductIds());

function getNowIso() {
  return new Date().toISOString();
}

function diffOrderCollections(
  tableId: string,
  previousOrders: OrderItem[],
  nextOrders: OrderItem[]
) {
  const previousById = new Map(previousOrders.map((item) => [item.id, item]));
  const nextById = new Map(nextOrders.map((item) => [item.id, item]));

  nextOrders.forEach((item) => {
    const previousItem = previousById.get(item.id);

    if (!previousItem) {
      recordAuditEvent({
        eventType: "ORDER_ITEM_ADDED",
        entityType: "order-item",
        entityId: item.id,
        tableId,
        orderId: item.orderId ?? item.id,
        nextValue: item,
        origin: "order",
      });
      return;
    }

    if (item.quantity > previousItem.quantity) {
      recordAuditEvent({
        eventType: "ORDER_ITEM_QTY_INCREASED",
        entityType: "order-item",
        entityId: item.id,
        tableId,
        orderId: item.orderId ?? item.id,
        previousValue: { quantity: previousItem.quantity },
        nextValue: { quantity: item.quantity },
        origin: "order",
      });
    }

    if (item.quantity < previousItem.quantity) {
      recordAuditEvent({
        eventType: "ORDER_ITEM_QTY_DECREASED",
        entityType: "order-item",
        entityId: item.id,
        tableId,
        orderId: item.orderId ?? item.id,
        previousValue: { quantity: previousItem.quantity },
        nextValue: { quantity: item.quantity },
        origin: "order",
      });
    }

    if (item.course !== previousItem.course) {
      recordAuditEvent({
        eventType: "ORDER_ITEM_MOVED_COURSE",
        entityType: "order-item",
        entityId: item.id,
        tableId,
        orderId: item.orderId ?? item.id,
        previousValue: { course: previousItem.course },
        nextValue: { course: item.course },
        origin: "order",
      });
    }

    const previousNotesState = JSON.stringify({
      note: previousItem.note ?? "",
      additions: previousItem.additions ?? [],
      removals: previousItem.removals ?? [],
      unitPrice: previousItem.unitPrice,
    });
    const nextNotesState = JSON.stringify({
      note: item.note ?? "",
      additions: item.additions ?? [],
      removals: item.removals ?? [],
      unitPrice: item.unitPrice,
    });

    if (previousNotesState !== nextNotesState) {
      recordAuditEvent({
        eventType: "ORDER_NOTE_CHANGED",
        entityType: "order-item",
        entityId: item.id,
        tableId,
        orderId: item.orderId ?? item.id,
        previousValue: previousItem,
        nextValue: item,
        origin: "order",
      });
    }
  });

  previousOrders.forEach((item) => {
    if (nextById.has(item.id)) {
      return;
    }

    recordAuditEvent({
      eventType: "ITEM_DELETED",
      entityType: "order-item",
      entityId: item.id,
      tableId,
      orderId: item.orderId ?? item.id,
      previousValue: item,
      origin: "order",
    });
  });
}

function readStoredTables(): PosTableState[] | null {
  if (typeof window === "undefined") {
    return null;
  }

  const rawValue = window.localStorage.getItem(TABLES_STORAGE_KEY);

  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as PosTableState[];
  } catch {
    return null;
  }
}

async function fetchSharedTablesFromApi() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const response = await fetch(TABLES_API_ENDPOINT, {
      method: "GET",
      cache: "no-store",
      headers: {
        "Cache-Control": "no-store",
      },
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as {
      tables?: PosTableState[];
      updatedAt?: string;
    };

    return Array.isArray(payload.tables)
      ? {
          tables: payload.tables,
          updatedAt: typeof payload.updatedAt === "string" ? payload.updatedAt : null,
        }
      : null;
  } catch {
    return null;
  }
}

async function persistSharedTablesToApi(tables: PosTableState[]) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const response = await fetch(TABLES_API_ENDPOINT, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
      cache: "no-store",
      body: JSON.stringify({ tables }),
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as {
      tables?: PosTableState[];
      updatedAt?: string;
    };

    return {
      tables: Array.isArray(payload.tables) ? payload.tables : tables,
      updatedAt: typeof payload.updatedAt === "string" ? payload.updatedAt : null,
    };
  } catch {
    return null;
  }
}

function resolveTableRoomId(table: PosTableState) {
  return table.roomId || table.id.split("-").slice(0, -1).join("-") || table.room;
}

function isLegacyGhostOrder(orders: OrderItem[]) {
  if (orders.length !== LEGACY_GHOST_ORDER_SET.size) {
    return false;
  }

  const productIds = new Set(orders.map((item) => item.productId));

  return (
    productIds.size === LEGACY_GHOST_ORDER_SET.size &&
    Array.from(LEGACY_GHOST_ORDER_SET).every((productId) => productIds.has(productId))
  );
}

function tableLooksUntouched(table: PosTableState) {
  return (
    table.status === "free" &&
    (table.paymentStatus ?? "idle") === "idle" &&
    table.guests === 0 &&
    !table.note &&
    !table.customerName &&
    !table.companyName
  );
}

function buildEmptyTableState(table: PosTableState): PosTableState {
  return {
    ...table,
    status: "free",
    paymentStatus: "idle",
    prebillPrintedAt: null,
    splitBillState: null,
    guests: 0,
    note: "",
    customerName: "",
    companyName: "",
    orders: [],
    fidelityCustomerId: null,
    fidelityCustomerLabel: "",
    fidelityCardCode: "",
    fidelityQrCodeValue: "",
    fidelityScannedBeforePayment: false,
    pointsEligible: false,
    pointsProcessed: false,
    pendingPoints: 0,
    lastFidelityScanAt: null,
    selectedRewardId: null,
    selectedRewardName: "",
    selectedRewardDiscount: 0,
    selectedRewardPoints: 0,
    rewardRedemptionId: null,
    earnedPoints: 0,
    finalPointsBalanceSnapshot: null,
    pointsBeforePayment: null,
  };
}

function createCleanTablesState(initialTables: PosTableState[]) {
  return initialTables.map((table) => buildEmptyTableState(table));
}

function sanitizeHydratedTables(tables: PosTableState[]) {
  const duplicatedOrderIds = new Map<string, string[]>();
  const nextTables = tables.map((table) => {
    table.orders.forEach((item) => {
      const currentTables = duplicatedOrderIds.get(item.id) ?? [];
      duplicatedOrderIds.set(item.id, [...currentTables, table.id]);
    });

    if (tableLooksUntouched(table) && isLegacyGhostOrder(table.orders)) {
      return buildEmptyTableState(table);
    }

    return {
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
    };
  });

  const duplicateOrderAssignments = Array.from(duplicatedOrderIds.entries())
    .filter(([, tableIds]) => tableIds.length > 1)
    .map(([orderId, tableIds]) => ({ orderId, tableIds }));

  return {
    tables: nextTables,
    debug: {
      totalTables: nextTables.length,
      tablesWithOrders: nextTables.filter((table) => table.orders.length > 0).length,
      duplicateOrderAssignments,
      tableSnapshots: nextTables.map((table) => ({
        tableId: table.id,
        status: table.status,
        paymentStatus: table.paymentStatus ?? "idle",
        itemsCount: table.orders.length,
        source:
          tableLooksUntouched(table) && isLegacyGhostOrder(table.orders)
            ? "legacy-ghost-order"
            : table.orders.length > 0
              ? "persisted-order"
              : "empty",
        orderIds: table.orders.map((item) => item.id),
        productIds: table.orders.map((item) => item.productId),
      })),
    },
  };
}

function normalizeStoredTables(
  storedTables: PosTableState[] | null,
  initialTables: PosTableState[]
): PosTableState[] {
  if (!storedTables || storedTables.length === 0) {
    return initialTables;
  }

  const storedTablesMap = new Map(storedTables.map((table) => [table.id, table]));

  const mergedTables = initialTables.map((initialTable) => {
    const storedTable = storedTablesMap.get(initialTable.id);

    if (!storedTable) {
      return initialTable;
    }

    return {
      ...initialTable,
      ...storedTable,
      orders: Array.isArray(storedTable.orders) ? storedTable.orders : initialTable.orders,
    };
  });

  return sanitizeHydratedTables(mergedTables).tables;
}

function buildRoomsFromTables(tables: PosTableState[]): PosRoom[] {
  return buildRoomsFromTablesWithConfig(tables, getHomeAreaSettings());
}

function buildRoomsFromTablesWithConfig(
  tables: PosTableState[],
  homeAreas: HomeAreaRecord[]
): PosRoom[] {
  return homeAreas
    .filter((area) => area.is_active)
    .map((area) => ({
      roomId: area.id,
      roomName: area.name,
      roomType: area.type,
      tables: tables.filter((table) => resolveTableRoomId(table) === area.id),
    }))
    .filter((room) => room.tables.length > 0);
}

function getPosStorageKeysFromBrowser() {
  if (typeof window === "undefined") {
    return {
      local: [] as string[],
      session: [] as string[],
    };
  }

  const activeRestaurantId = getActiveRestaurantId();
  const restaurantPrefix = activeRestaurantId === "default" ? "" : `${activeRestaurantId}:`;
  const isPosStorageKey = (key: string) =>
    key.startsWith("pos-") || (restaurantPrefix ? key.startsWith(restaurantPrefix) : false);

  return {
    local: Array.from({ length: window.localStorage.length }, (_, index) =>
      window.localStorage.key(index)
    ).filter((key): key is string => typeof key === "string" && isPosStorageKey(key)),
    session: Array.from({ length: window.sessionStorage.length }, (_, index) =>
      window.sessionStorage.key(index)
    ).filter((key): key is string => typeof key === "string" && isPosStorageKey(key)),
  };
}

async function backupBrowserPosStorage(reason: string) {
  if (typeof window === "undefined") {
    return {
      backupFileName: null,
      backupFilePath: null,
      createdAt: getNowIso(),
    };
  }

  const { local, session } = getPosStorageKeysFromBrowser();
  const createdAt = getNowIso();
  const payload = {
    reason,
    createdAt,
    restaurantId: getActiveRestaurantId(),
    localStorage: Object.fromEntries(
      local.map((key) => [key, window.localStorage.getItem(key)])
    ),
    sessionStorage: Object.fromEntries(
      session.map((key) => [key, window.sessionStorage.getItem(key)])
    ),
  };

  try {
    const response = await fetch("/api/admin/table-reset-backup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store",
      body: JSON.stringify(payload),
    });
    const result = (await response.json()) as {
      fileName?: string;
      filePath?: string;
      createdAt?: string;
    };

    window.localStorage.setItem(
      TABLES_RESET_BACKUP_META_STORAGE_KEY,
      JSON.stringify({
        ...result,
        createdAt: result.createdAt || createdAt,
        reason,
      })
    );

    return {
      backupFileName: result.fileName ?? null,
      backupFilePath: result.filePath ?? null,
      createdAt: result.createdAt || createdAt,
    };
  } catch {
    window.localStorage.setItem(
      TABLES_RESET_BACKUP_META_STORAGE_KEY,
      JSON.stringify({
        fileName: null,
        filePath: null,
        createdAt,
        reason,
        fallbackPayload: payload,
      })
    );

    return {
      backupFileName: null,
      backupFilePath: null,
      createdAt,
    };
  }
}

function clearLegacyTableStorage() {
  if (typeof window === "undefined") {
    return;
  }

  [
    TABLES_STORAGE_KEY,
    TABLES_DEBUG_STORAGE_KEY,
  ].forEach((key) => window.localStorage.removeItem(key));
}

export function TableProvider({ children }: { children: ReactNode }) {
  const { currentActor, currentUser } = useAuth();
  const [tables, setTables] = useState<PosTableState[]>(() => initialTablesState);
  const [homeAreas, setHomeAreas] = useState<HomeAreaRecord[]>(() => getHomeAreaSettings());
  const [hasHydratedStorage, setHasHydratedStorage] = useState(false);
  const remoteUpdatedAtRef = useRef<string | null>(null);
  const remoteSyncTimeoutRef = useRef<number | null>(null);
  const isApplyingRemoteStateRef = useRef(false);

  const resetLocalTableState = useCallback(async () => {
    const backup = await backupBrowserPosStorage("manual-reset-tables");
    const cleanTables = createCleanTablesState(getInitialTablesState());
    clearLegacyTableStorage();
    setTables(cleanTables);
    setHomeAreas(getHomeAreaSettings());

    if (typeof window !== "undefined") {
      window.localStorage.setItem(TABLES_STORAGE_KEY, JSON.stringify(cleanTables));
      window.localStorage.setItem(TABLES_STORAGE_VERSION_KEY, TABLES_STORAGE_RESET_VERSION);
      window.localStorage.setItem(
        TABLES_DEBUG_STORAGE_KEY,
        JSON.stringify(sanitizeHydratedTables(cleanTables).debug)
      );
    }

    const remoteState = await persistSharedTablesToApi(cleanTables);
    remoteUpdatedAtRef.current = remoteState?.updatedAt ?? remoteUpdatedAtRef.current;

    return {
      backupFileName: backup.backupFileName,
      backupFilePath: backup.backupFilePath,
      resetAt: getNowIso(),
    };
  }, []);

  useEffect(() => {
    const hydrateTables = async () => {
      const nextHomeAreas = await hydrateHomeAreaSettingsFromServer();
      setHomeAreas(nextHomeAreas);

      const remoteState = await fetchSharedTablesFromApi();
      if (remoteState?.tables) {
        const sanitizedTables = normalizeStoredTables(remoteState.tables, getInitialTablesState());
        setTables(sanitizedTables);
        remoteUpdatedAtRef.current = remoteState.updatedAt;

        if (typeof window !== "undefined") {
          const debugSnapshot = sanitizeHydratedTables(sanitizedTables).debug;
          window.localStorage.setItem(TABLES_STORAGE_KEY, JSON.stringify(sanitizedTables));
          window.localStorage.setItem(TABLES_STORAGE_VERSION_KEY, TABLES_STORAGE_RESET_VERSION);
          window.localStorage.setItem(TABLES_DEBUG_STORAGE_KEY, JSON.stringify(debugSnapshot));
          (window as typeof window & { __POS_TABLE_DEBUG__?: unknown }).__POS_TABLE_DEBUG__ =
            debugSnapshot;
        }

        setHasHydratedStorage(true);
        return;
      }

      if (typeof window !== "undefined") {
        const currentStorageVersion = window.localStorage.getItem(TABLES_STORAGE_VERSION_KEY);

        if (currentStorageVersion !== TABLES_STORAGE_RESET_VERSION) {
          const backup = await backupBrowserPosStorage("storage-migration-reset-tables");
          const cleanTables = createCleanTablesState(getInitialTablesState());
          clearLegacyTableStorage();
          setTables(cleanTables);
          window.localStorage.setItem(TABLES_STORAGE_KEY, JSON.stringify(cleanTables));
          window.localStorage.setItem(TABLES_STORAGE_VERSION_KEY, TABLES_STORAGE_RESET_VERSION);
          window.localStorage.setItem(
            TABLES_DEBUG_STORAGE_KEY,
            JSON.stringify(sanitizeHydratedTables(cleanTables).debug)
          );
          (window as typeof window & { __POS_TABLE_DEBUG__?: unknown }).__POS_TABLE_DEBUG__ =
            sanitizeHydratedTables(cleanTables).debug;
          (window as typeof window & { __POS_TABLE_RESET_BACKUP__?: unknown }).__POS_TABLE_RESET_BACKUP__ =
            backup;
          setHasHydratedStorage(true);
          return;
        }
      }

      const sanitizedTables = normalizeStoredTables(readStoredTables(), getInitialTablesState());
      setTables(sanitizedTables);

      if (typeof window !== "undefined") {
        const debugSnapshot = sanitizeHydratedTables(sanitizedTables).debug;
        window.localStorage.setItem(TABLES_DEBUG_STORAGE_KEY, JSON.stringify(debugSnapshot));
        (window as typeof window & { __POS_TABLE_DEBUG__?: unknown }).__POS_TABLE_DEBUG__ =
          debugSnapshot;
      }

      setHasHydratedStorage(true);
    };

    void hydrateTables();
  }, []);

  useEffect(() => {
    const handleHomeSettingsChanged = () => {
      const nextHomeAreas = getHomeAreaSettings();
      setHomeAreas(nextHomeAreas);
      setTables((currentTables) => normalizeStoredTables(currentTables, getInitialTablesState()));
    };

    window.addEventListener(HOME_SETTINGS_CHANGED_EVENT, handleHomeSettingsChanged);

    return () => {
      window.removeEventListener(HOME_SETTINGS_CHANGED_EVENT, handleHomeSettingsChanged);
    };
  }, []);

  useEffect(() => {
    if (!hasHydratedStorage) {
      return;
    }

    const debugSnapshot = sanitizeHydratedTables(tables).debug;
    window.localStorage.setItem(TABLES_STORAGE_KEY, JSON.stringify(tables));
    window.localStorage.setItem(TABLES_DEBUG_STORAGE_KEY, JSON.stringify(debugSnapshot));
    (window as typeof window & { __POS_TABLE_DEBUG__?: unknown }).__POS_TABLE_DEBUG__ =
      debugSnapshot;
    window.dispatchEvent(new CustomEvent(TABLES_SYNC_EVENT));

    if (isApplyingRemoteStateRef.current) {
      isApplyingRemoteStateRef.current = false;
      return;
    }

    if (remoteSyncTimeoutRef.current) {
      window.clearTimeout(remoteSyncTimeoutRef.current);
    }

    remoteSyncTimeoutRef.current = window.setTimeout(() => {
      void persistSharedTablesToApi(tables).then((remoteState) => {
        if (remoteState?.updatedAt) {
          remoteUpdatedAtRef.current = remoteState.updatedAt;
        }
      });
    }, REMOTE_TABLES_SYNC_DEBOUNCE_MS);
  }, [hasHydratedStorage, tables]);

  useEffect(() => {
    return () => {
      if (remoteSyncTimeoutRef.current) {
        window.clearTimeout(remoteSyncTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !hasHydratedStorage) {
      return;
    }

    const syncTablesFromStorage = () => {
      const nextHomeAreas = getHomeAreaSettings();
      const nextTables = normalizeStoredTables(readStoredTables(), getInitialTablesState());
      const debugSnapshot = sanitizeHydratedTables(nextTables).debug;

      setHomeAreas((currentAreas) =>
        JSON.stringify(currentAreas) === JSON.stringify(nextHomeAreas) ? currentAreas : nextHomeAreas
      );
      setTables((currentTables) =>
        JSON.stringify(currentTables) === JSON.stringify(nextTables) ? currentTables : nextTables
      );
      window.localStorage.setItem(TABLES_DEBUG_STORAGE_KEY, JSON.stringify(debugSnapshot));
      (window as typeof window & { __POS_TABLE_DEBUG__?: unknown }).__POS_TABLE_DEBUG__ =
        debugSnapshot;
    };

    const syncTablesFromServer = async () => {
      const remoteState = await fetchSharedTablesFromApi();
      if (!remoteState?.tables) {
        return;
      }

      if (remoteState.updatedAt && remoteState.updatedAt === remoteUpdatedAtRef.current) {
        return;
      }

      const nextHomeAreas = getHomeAreaSettings();
      const nextTables = normalizeStoredTables(remoteState.tables, getInitialTablesState());
      const debugSnapshot = sanitizeHydratedTables(nextTables).debug;

      remoteUpdatedAtRef.current = remoteState.updatedAt;
      isApplyingRemoteStateRef.current = true;

      setHomeAreas((currentAreas) =>
        JSON.stringify(currentAreas) === JSON.stringify(nextHomeAreas) ? currentAreas : nextHomeAreas
      );
      setTables((currentTables) =>
        JSON.stringify(currentTables) === JSON.stringify(nextTables) ? currentTables : nextTables
      );
      window.localStorage.setItem(TABLES_STORAGE_KEY, JSON.stringify(nextTables));
      window.localStorage.setItem(TABLES_STORAGE_VERSION_KEY, TABLES_STORAGE_RESET_VERSION);
      window.localStorage.setItem(TABLES_DEBUG_STORAGE_KEY, JSON.stringify(debugSnapshot));
      (window as typeof window & { __POS_TABLE_DEBUG__?: unknown }).__POS_TABLE_DEBUG__ =
        debugSnapshot;
    };

    const handleStorage = (event: StorageEvent) => {
      if (
        event.key &&
        event.key !== TABLES_STORAGE_KEY &&
        event.key !== TABLES_STORAGE_VERSION_KEY
      ) {
        return;
      }

      syncTablesFromStorage();
    };

    const handleLocalSync = () => {
      syncTablesFromStorage();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        syncTablesFromStorage();
        void syncTablesFromServer();
      }
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener(TABLES_SYNC_EVENT, handleLocalSync);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    const pollId = window.setInterval(() => {
      if (document.visibilityState !== "visible") {
        return;
      }

      void syncTablesFromServer();
    }, REMOTE_TABLES_POLL_INTERVAL_MS);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(TABLES_SYNC_EVENT, handleLocalSync);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.clearInterval(pollId);
    };
  }, [hasHydratedStorage]);

  const updateTable = useCallback((tableId: string, data: UpdateTableInput) => {
    setTables((currentTables) =>
      currentTables.map((table) => {
        if (table.id !== tableId) {
          return table;
        }

        const now = getNowIso();
          const updatedTable = {
            ...table,
            ...data,
            roomId: table.roomId ?? resolveTableRoomId(table),
            operator:
            typeof data.operator === "string"
              ? data.operator
              : data.operator ?? currentUser.displayName,
          operatorId: currentActor.operatorId,
          updatedAt: now,
          updatedByOperatorId: currentActor.operatorId,
        };

        if (table.status !== updatedTable.status) {
          recordAuditEvent({
            eventType:
              table.status === "free" && updatedTable.status === "occupied"
                ? "TABLE_OPENED"
                : table.status === "occupied" && updatedTable.status === "free"
                  ? "TABLE_CLOSED"
                  : "TABLE_REOPENED",
            entityType: "table",
            entityId: tableId,
            tableId,
            previousValue: table,
            nextValue: updatedTable,
            origin: "table",
          });
        }

        if (table.paymentStatus !== updatedTable.paymentStatus) {
          recordAuditEvent({
            eventType:
              updatedTable.paymentStatus === "pending"
                ? "PAYMENT_STARTED"
                : updatedTable.paymentStatus === "paid"
                  ? "PAYMENT_CONFIRMED"
                  : "PAYMENT_CANCELLED",
            entityType: "payment",
            entityId: `${tableId}-payment`,
            tableId,
            previousValue: { paymentStatus: table.paymentStatus },
            nextValue: { paymentStatus: updatedTable.paymentStatus },
            origin: "payment",
          });
        }

        console.log("TABLE UPDATED", updatedTable);
        return updatedTable;
      })
    );
  }, [currentActor.operatorId, currentUser.displayName]);

  const setTableOrders = useCallback(
    (tableId: string, nextOrders: OrderItem[] | ((current: OrderItem[]) => OrderItem[])) => {
      setTables((currentTables) =>
        currentTables.map((table) => {
          if (table.id !== tableId) {
            return table;
          }

          const resolvedOrders =
            typeof nextOrders === "function" ? nextOrders(table.orders) : nextOrders;
          const now = getNowIso();
          const normalizedOrders = resolvedOrders.map((item) => ({
            ...item,
            operatorLabel: item.operatorLabel ?? currentUser.displayName,
            operatorId: item.operatorId ?? currentActor.operatorId,
            createdAt: item.createdAt ?? now,
            updatedAt: now,
            createdByOperatorId: item.createdByOperatorId ?? currentActor.operatorId,
            updatedByOperatorId: currentActor.operatorId,
          }));

          diffOrderCollections(tableId, table.orders, normalizedOrders);
          const ordersChanged =
            JSON.stringify(table.orders) !== JSON.stringify(normalizedOrders);

          return {
            ...table,
            roomId: table.roomId ?? resolveTableRoomId(table),
            orders: normalizedOrders,
            prebillPrintedAt: ordersChanged ? null : table.prebillPrintedAt ?? null,
            updatedAt: now,
            updatedByOperatorId: currentActor.operatorId,
          };
        })
      );
    },
    [currentActor.operatorId, currentUser.displayName]
  );

  const getTableById = useCallback(
    (tableId: string) => tables.find((table) => table.id === tableId),
    [tables]
  );

  const value = useMemo<TablesContextValue>(
    () => ({
      tables,
      rooms: buildRoomsFromTablesWithConfig(tables, homeAreas),
      getTableById,
      updateTable,
      setTableOrders,
      resetLocalTableState,
    }),
    [getTableById, homeAreas, tables, updateTable, setTableOrders, resetLocalTableState]
  );

  return <TablesContext.Provider value={value}>{children}</TablesContext.Provider>;
}

export function useTables() {
  const context = useContext(TablesContext);

  if (!context) {
    throw new Error("useTables must be used within a TableProvider");
  }

  return context;
}
