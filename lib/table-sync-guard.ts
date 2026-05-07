import type { OrderItem, PosTableState } from "@/lib/pos-data";

export type TableSyncSource =
  | "hydrate"
  | "storage"
  | "polling"
  | "refetch"
  | "backend"
  | "user_action"
  | "payment"
  | "clear_table"
  | "save_changes"
  | "send_command";

export type TableSyncDecisionReason =
  | "APPLIED_INCOMING"
  | "BLOCKED_EMPTY_INCOMING"
  | "BLOCKED_SHRINKING_INCOMING"
  | "DIRTY_DRAFT_PROTECTED"
  | "LOCAL_REVISION_NEWER"
  | "INCOMING_WITHOUT_REVISION"
  | "LOCAL_UPDATED_AT_NEWER"
  | "INTENTIONAL_CLEAR"
  | "PAYMENT_CLEAR";

export type DraftSnapshotLike = {
  orderLines?: OrderItem[];
  updatedAt?: string | null;
  clientRevision?: number | null;
  hasUnsavedChanges?: boolean | null;
};

type IncomingStateDecision = {
  allowed: boolean;
  reason: TableSyncDecisionReason;
};

type IncomingStateOptions = {
  source: TableSyncSource;
  isDirtyDraft?: boolean;
  currentClientRevision?: number | null;
  incomingClientRevision?: number | null;
  currentUpdatedAt?: string | null;
  incomingUpdatedAt?: string | null;
  currentLinesCount: number;
  incomingLinesCount: number;
  reason?: string;
};

type SafeApplyOrderOptions = Omit<IncomingStateOptions, "currentLinesCount" | "incomingLinesCount"> & {
  currentLines: OrderItem[];
  incomingLines: OrderItem[];
};

type SafeApplyTableOptions = Omit<IncomingStateOptions, "currentLinesCount" | "incomingLinesCount"> & {
  currentTable: PosTableState;
  incomingTable: PosTableState;
};

const AUTO_COVER_PRODUCT_ID = "auto-cover-charge";

function isProduction() {
  return process.env.NODE_ENV === "production";
}

export function getRealOrderLines(items: OrderItem[]) {
  return items.filter((item) => item.productId !== AUTO_COVER_PRODUCT_ID && item.quantity > 0);
}

export function getRealOrderLinesCount(items: OrderItem[]) {
  return getRealOrderLines(items).length;
}

export function getOrderUpdatedAtValue(value?: string | null) {
  if (!value) {
    return 0;
  }

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function getClientRevisionValue(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function logTableSyncDecision(
  decision: IncomingStateDecision,
  {
    tableId,
    source,
    currentLinesCount,
    incomingLinesCount,
    currentRevision,
    incomingRevision,
    reason,
  }: {
    tableId: string;
    source: TableSyncSource;
    currentLinesCount: number;
    incomingLinesCount: number;
    currentRevision: number;
    incomingRevision: number;
    reason?: string;
  }
) {
  if (isProduction()) {
    return;
  }

  const prefix =
    decision.reason === "APPLIED_INCOMING"
      ? "[TABLE_SYNC][APPLIED_INCOMING]"
      : decision.reason === "BLOCKED_SHRINKING_INCOMING"
        ? "[TABLE_SYNC][BLOCKED_SHRINKING_INCOMING]"
      : decision.reason === "DIRTY_DRAFT_PROTECTED"
        ? "[TABLE_SYNC][DIRTY_DRAFT_PROTECTED]"
        : decision.reason === "LOCAL_REVISION_NEWER"
          ? "[TABLE_SYNC][LOCAL_REVISION_NEWER]"
          : decision.reason === "INCOMING_WITHOUT_REVISION"
            ? "[TABLE_SYNC][LOCAL_REVISION_NEWER]"
            : decision.reason === "LOCAL_UPDATED_AT_NEWER"
              ? "[TABLE_SYNC][LOCAL_REVISION_NEWER]"
          : decision.reason === "INTENTIONAL_CLEAR"
            ? "[TABLE_SYNC][INTENTIONAL_CLEAR]"
            : decision.reason === "PAYMENT_CLEAR"
              ? "[TABLE_SYNC][PAYMENT_CLEAR]"
              : "[TABLE_SYNC][BLOCKED_EMPTY_INCOMING]";

  console.info(prefix, {
    tableId,
    source,
    currentLinesCount,
    incomingLinesCount,
    currentRevision,
    incomingRevision,
    reason: reason ?? decision.reason,
  });
}

export function isIncomingStateAllowedToReplaceCurrent(
  options: IncomingStateOptions
): IncomingStateDecision {
  const currentRevision = getClientRevisionValue(options.currentClientRevision);
  const incomingRevision = getClientRevisionValue(options.incomingClientRevision);
  const currentUpdatedAt = getOrderUpdatedAtValue(options.currentUpdatedAt);
  const incomingUpdatedAt = getOrderUpdatedAtValue(options.incomingUpdatedAt);
  const isIntentionalClear = options.source === "payment" || options.source === "clear_table";

  if (isIntentionalClear) {
    return {
      allowed: true,
      reason: options.source === "payment" ? "PAYMENT_CLEAR" : "INTENTIONAL_CLEAR",
    };
  }

  if (options.currentLinesCount > 0 && options.incomingLinesCount === 0) {
    return {
      allowed: false,
      reason: "BLOCKED_EMPTY_INCOMING",
    };
  }

  if (options.currentLinesCount > options.incomingLinesCount && options.incomingLinesCount > 0) {
    return {
      allowed: false,
      reason: "BLOCKED_SHRINKING_INCOMING",
    };
  }

  if (options.isDirtyDraft) {
    return {
      allowed: false,
      reason: "DIRTY_DRAFT_PROTECTED",
    };
  }

  if (currentRevision > 0 && incomingRevision === 0) {
    return {
      allowed: false,
      reason: "INCOMING_WITHOUT_REVISION",
    };
  }

  if (incomingRevision > 0 && currentRevision > incomingRevision) {
    return {
      allowed: false,
      reason: "LOCAL_REVISION_NEWER",
    };
  }

  if (currentUpdatedAt > 0 && incomingUpdatedAt > 0 && currentUpdatedAt > incomingUpdatedAt) {
    return {
      allowed: false,
      reason: "LOCAL_UPDATED_AT_NEWER",
    };
  }

  return {
    allowed: true,
    reason: "APPLIED_INCOMING",
  };
}

export function safeApplyIncomingOrderState(
  options: SafeApplyOrderOptions
) {
  const decision = isIncomingStateAllowedToReplaceCurrent({
    ...options,
    currentLinesCount: getRealOrderLinesCount(options.currentLines),
    incomingLinesCount: getRealOrderLinesCount(options.incomingLines),
  });

  return {
    nextLines: decision.allowed ? options.incomingLines : options.currentLines,
    decision,
  };
}

export function safeApplyIncomingTableState(
  options: SafeApplyTableOptions
) {
  const decision = isIncomingStateAllowedToReplaceCurrent({
    ...options,
    currentLinesCount: getRealOrderLinesCount(options.currentTable.orders),
    incomingLinesCount: getRealOrderLinesCount(options.incomingTable.orders),
  });

  if (decision.allowed) {
    return {
      nextTable: options.incomingTable,
      decision,
    };
  }

  return {
    nextTable: {
      ...options.incomingTable,
      ...options.currentTable,
      id: options.currentTable.id,
      name: options.incomingTable.name || options.currentTable.name,
      room: options.incomingTable.room || options.currentTable.room,
      roomId: options.incomingTable.roomId || options.currentTable.roomId,
      status:
        options.currentTable.status === "occupied" && getRealOrderLinesCount(options.currentTable.orders) > 0
          ? options.currentTable.status
          : options.incomingTable.status,
      paymentStatus:
        options.currentTable.paymentStatus === "paid"
          ? options.currentTable.paymentStatus
          : options.incomingTable.paymentStatus ?? options.currentTable.paymentStatus,
      orders: options.currentTable.orders,
      clientRevision: Math.max(
        getClientRevisionValue(options.currentTable.clientRevision),
        getClientRevisionValue(options.incomingTable.clientRevision)
      ),
      updatedAt:
        getOrderUpdatedAtValue(options.currentTable.updatedAt) >=
        getOrderUpdatedAtValue(options.incomingTable.updatedAt)
          ? options.currentTable.updatedAt
          : options.incomingTable.updatedAt,
    },
    decision,
  };
}
