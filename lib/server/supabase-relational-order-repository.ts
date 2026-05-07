import type { PrintJob, PrintJobItem, PrintJobStatus } from "@/lib/print-job-service";
import type { CourseGroup, OrderItem, PosTableState, SplitBillState } from "@/lib/pos-data";
import { getActiveRestaurantId } from "@/lib/restaurant-config";
import {
  createSupabaseRows,
  deleteSupabaseRows,
  isSupabaseConfigured,
  readSupabaseRows,
  updateSupabaseRows,
} from "@/lib/server/supabase-json-store";

type RelationalRoomRow = {
  id: string;
  legacy_room_id: string | null;
  code: string | null;
  name: string;
};

type RelationalTableRow = {
  id: string;
  room_id: string | null;
  legacy_table_id: string | null;
  code: string | null;
  name: string;
  seats: number | null;
  legacy_payload: Partial<PosTableState> | null;
};

type RelationalOperatorRow = {
  id: string;
  legacy_role_code: string | null;
  username: string | null;
  display_name: string;
};

type RelationalOrderRow = {
  id: string;
  table_id: string | null;
  room_id: string | null;
  opened_by_operator_id: string | null;
  assigned_operator_id: string | null;
  customer_id: string | null;
  company_id: string | null;
  legacy_order_key: string | null;
  source_device_mode: "cassa" | "palmare" | null;
  table_name_snapshot: string | null;
  room_name_snapshot: string | null;
  status: "draft" | "in_work" | "sent" | "paid" | "cancelled" | "archived";
  table_status: "free" | "occupied" | "reserved" | "maintenance";
  command_status: "pending" | "partially_sent" | "sent" | "error";
  payment_status: "unpaid" | "partial" | "paid" | "voided";
  cover_count: number;
  subtotal_amount: number | string;
  discount_amount: number | string;
  surcharge_amount: number | string;
  total_amount: number | string;
  prebill_printed_at: string | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  legacy_payload: Partial<PosTableState> | null;
  created_at: string;
  updated_at: string;
};

type RelationalOrderCourseRow = {
  id: string;
  order_id: string;
  code: string;
  label: string;
  sort_order: number;
  metadata: Record<string, unknown> | null;
  legacy_payload: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type RelationalOrderGuestRow = {
  id: string;
  order_id: string;
  code: string;
  label: string;
  seat_index: number;
  metadata: Record<string, unknown> | null;
  legacy_payload: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type RelationalOrderLineRow = {
  id: string;
  order_id: string;
  course_id: string | null;
  guest_id: string | null;
  legacy_order_line_id: string | null;
  product_name_snapshot: string;
  line_number: number;
  status: string;
  unit_price: number | string;
  quantity: number | string;
  sent_quantity: number | string;
  queued_quantity: number | string | null;
  print_status: string | null;
  line_total: number | string;
  notes: string | null;
  additions: unknown[] | null;
  removals: unknown[] | null;
  sent_to_kitchen_at: string | null;
  last_print_job_id: string | null;
  metadata: Record<string, unknown> | null;
  legacy_payload: Partial<OrderItem> | null;
  created_at: string;
  updated_at: string;
};

type RelationalTransmissionRow = {
  id: string;
  order_id: string;
  legacy_print_job_id: string | null;
  printer_id: string | null;
  printer_role: string | null;
  triggered_by_operator_id: string | null;
  triggered_from_device: "cassa" | "palmare" | null;
  course_code: string | null;
  production_station: string | null;
  transmission_type: string;
  status: string;
  command_number: number | null;
  error_message: string | null;
  payload: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type OrderTransmissionSyncPayload = {
  tableId: string;
  deviceMode?: "cassa" | "palmare";
  operatorId?: string | null;
  operatorLabel?: string | null;
  commandNumber?: string | null;
  transmissionType?: "order" | "reprint";
  jobs: Array<
    Pick<
      PrintJob,
      | "id"
      | "type"
      | "status"
      | "printerId"
      | "printerName"
      | "printerRole"
      | "summary"
      | "errorMessage"
      | "commandNumber"
      | "createdAt"
      | "updatedAt"
    > & {
      items: Array<
        Pick<
          PrintJobItem,
          "id" | "productId" | "name" | "quantity" | "guestCode" | "course" | "printerRole" | "productionStation" | "note"
        >
      >;
    }
  >;
};

type TableOverlay = {
  id: string;
} & Partial<PosTableState>;

function getRestaurantIdFilter() {
  return {
    column: "restaurant_id",
    value: getActiveRestaurantId(),
  } as const;
}

function nowIso() {
  return new Date().toISOString();
}

function toNumber(value: number | string | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function normalizeOrderItemPrintStatus(
  value: unknown,
  fallback: OrderItem["printStatus"] = "pending"
): OrderItem["printStatus"] {
  return value === "queued" ||
    value === "sent" ||
    value === "cancelled" ||
    value === "modified" ||
    value === "pending"
    ? value
    : fallback;
}

function normalizeTableLegacyId(table: RelationalTableRow) {
  return table.legacy_table_id?.trim() || table.code?.trim() || table.id;
}

function normalizeRoomLegacyId(room: RelationalRoomRow) {
  return room.legacy_room_id?.trim() || room.code?.trim() || room.id;
}

function normalizeOperatorLookupKeys(operator: RelationalOperatorRow) {
  return [
    operator.legacy_role_code?.trim(),
    operator.username?.trim(),
    operator.display_name?.trim(),
  ].filter((value): value is string => Boolean(value));
}

function getCourseSortOrder(course: string) {
  const normalized = course.trim().toUpperCase();
  if (normalized === "PRIMA PORTATA") return 1;
  if (normalized === "SECONDA PORTATA") return 2;
  if (normalized === "TERZA PORTATA") return 3;
  return 999;
}

function mapTablePaymentStatusToOrderPaymentStatus(
  paymentStatus: PosTableState["paymentStatus"] | undefined
): RelationalOrderRow["payment_status"] {
  if (paymentStatus === "paid") {
    return "paid";
  }

  if (paymentStatus === "pending") {
    return "partial";
  }

  return "unpaid";
}

function mapOrderPaymentStatusToTablePaymentStatus(
  paymentStatus: RelationalOrderRow["payment_status"],
  fallback: PosTableState["paymentStatus"] | undefined
): PosTableState["paymentStatus"] {
  if (paymentStatus === "paid") {
    return "paid";
  }

  if (paymentStatus === "partial") {
    return "pending";
  }

  return fallback ?? "idle";
}

function computeOrderAmounts(items: OrderItem[]) {
  const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  return {
    subtotal,
    discount: 0,
    surcharge: 0,
    total: subtotal,
  };
}

function computeCommandStatus(items: OrderItem[]): RelationalOrderRow["command_status"] {
  if (items.length === 0) {
    return "pending";
  }

  const hasSent = items.some((item) => (item.sentQuantity ?? 0) > 0 || item.status === "sent");
  const hasPending = items.some((item) => (item.quantity - (item.sentQuantity ?? 0)) > 0);

  if (hasSent && hasPending) {
    return "partially_sent";
  }

  if (hasSent && !hasPending) {
    return "sent";
  }

  return "pending";
}

function computeOrderStatus(
  table: PosTableState,
  items: OrderItem[]
): RelationalOrderRow["status"] {
  if (table.paymentStatus === "paid") {
    return "paid";
  }

  const commandStatus = computeCommandStatus(items);
  if (commandStatus === "sent") {
    return "sent";
  }

  if (commandStatus === "partially_sent") {
    return "in_work";
  }

  return items.length > 0 || table.status === "occupied" ? "draft" : "archived";
}

function isOperationalTableActive(table: PosTableState) {
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

function buildOrderKey(table: PosTableState) {
  return table.id;
}

function buildGuestCodes(table: PosTableState) {
  const guestCodes = new Set<string>();

  table.orders.forEach((item) => {
    const code = item.commensaleCode?.trim();
    if (code) {
      guestCodes.add(code);
    }
  });

  const guestCount = Math.max(table.guests ?? 0, 0);
  if (guestCodes.size === 0 && guestCount > 0) {
    for (let index = 1; index <= guestCount; index += 1) {
      guestCodes.add(`Comm. ${index}`);
    }
  }

  return Array.from(guestCodes).sort((left, right) => getCourseSortOrder(left) - getCourseSortOrder(right));
}

function buildSplitBillStateFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
  fallback: SplitBillState | null | undefined
) {
  const candidate = metadata?.splitBillState;
  return candidate && typeof candidate === "object" ? (candidate as SplitBillState) : fallback ?? null;
}

function buildOrderOverlay(
  order: RelationalOrderRow,
  lineRows: RelationalOrderLineRow[],
  courseRows: RelationalOrderCourseRow[],
  guestRows: RelationalOrderGuestRow[]
) {
  const legacyTable = order.legacy_payload ?? {};
  const coursesById = new Map(courseRows.map((course) => [course.id, course]));
  const guestsById = new Map(guestRows.map((guest) => [guest.id, guest]));
  const normalizedItems = [...lineRows]
    .sort((left, right) => left.line_number - right.line_number)
    .map((line) => {
      const payload = line.legacy_payload ?? {};
      const course = line.course_id ? coursesById.get(line.course_id) : null;
      const guest = line.guest_id ? guestsById.get(line.guest_id) : null;
      const fallbackCourse = (payload.course ?? course?.label ?? "PRIMA PORTATA") as CourseGroup;

      return {
        id: line.legacy_order_line_id?.trim() || payload.id?.trim() || line.id,
        productId:
          payload.productId?.trim() ||
          (typeof line.metadata?.legacy_product_id === "string"
            ? line.metadata.legacy_product_id
            : ""),
        name: payload.name?.trim() || line.product_name_snapshot,
        quantity: toNumber(line.quantity),
        commensaleCode: guest?.code?.trim() || (payload.commensaleCode ?? null),
        sentQuantity: toNumber(line.sent_quantity),
        queuedQuantity: Math.max(
          0,
          Math.min(
            toNumber(line.queued_quantity ?? payload.queuedQuantity ?? 0),
            toNumber(line.quantity)
          )
        ),
        unitPrice: toNumber(line.unit_price),
        originalUnitPrice: payload.originalUnitPrice,
        course: fallbackCourse,
        status:
          line.status === "sent" || toNumber(line.sent_quantity) > 0
            ? ("sent" as const)
            : ("draft" as const),
        printStatus: normalizeOrderItemPrintStatus(
          typeof payload.printStatus === "string" ? payload.printStatus : line.print_status,
          toNumber(line.sent_quantity) > 0 ? "sent" : "pending"
        ),
        paymentState: payload.paymentState,
        operatorLabel: payload.operatorLabel,
        note: payload.note ?? line.notes ?? undefined,
        additions: Array.isArray(line.additions)
          ? line.additions.map((entry) => String(entry))
          : payload.additions ?? [],
        removals: Array.isArray(line.removals)
          ? line.removals.map((entry) => String(entry))
          : payload.removals ?? [],
        vatRateKey:
          payload.vatRateKey ??
          (typeof line.metadata?.vat_rate_key === "string" ? line.metadata.vat_rate_key : undefined),
        vatRateLabel:
          payload.vatRateLabel ??
          (typeof line.metadata?.vat_rate_label === "string" ? line.metadata.vat_rate_label : undefined),
        vatRateValue:
          typeof payload.vatRateValue === "number"
            ? payload.vatRateValue
            : typeof line.metadata?.vat_rate_value === "number"
              ? (line.metadata.vat_rate_value as number)
              : null,
        orderId: payload.orderId ?? order.legacy_order_key ?? undefined,
        operatorId: payload.operatorId,
        createdAt: payload.createdAt ?? line.created_at,
        updatedAt: payload.updatedAt ?? line.updated_at,
        createdByOperatorId: payload.createdByOperatorId,
        updatedByOperatorId: payload.updatedByOperatorId,
        deletedByOperatorId: payload.deletedByOperatorId ?? null,
        sentByOperatorId: payload.sentByOperatorId ?? null,
        lastPrintJobId: payload.lastPrintJobId ?? line.last_print_job_id ?? null,
        sentToKitchenAt: payload.sentToKitchenAt ?? line.sent_to_kitchen_at ?? null,
        paidByOperatorId: payload.paidByOperatorId ?? null,
        approvedByOperatorId: payload.approvedByOperatorId ?? null,
      } satisfies OrderItem;
    });

  return {
    id: order.legacy_order_key?.trim() || "",
    status: order.table_status === "free" ? "free" : "occupied",
    paymentStatus: mapOrderPaymentStatusToTablePaymentStatus(
      order.payment_status,
      legacyTable.paymentStatus
    ),
    guests: order.cover_count,
    note: order.notes ?? legacyTable.note ?? "",
    prebillPrintedAt: order.prebill_printed_at ?? legacyTable.prebillPrintedAt ?? null,
    customerName:
      (typeof order.metadata?.customerName === "string" ? order.metadata.customerName : "") ||
      legacyTable.customerName ||
      "",
    companyName:
      (typeof order.metadata?.companyName === "string" ? order.metadata.companyName : "") ||
      legacyTable.companyName ||
      "",
    operator:
      (typeof order.metadata?.operator === "string" ? order.metadata.operator : "") ||
      legacyTable.operator ||
      "",
    saleMode:
      (typeof order.metadata?.saleMode === "string" ? order.metadata.saleMode : "") ||
      legacyTable.saleMode ||
      "",
    servicePriceLabel:
      (typeof order.metadata?.servicePriceLabel === "string"
        ? order.metadata.servicePriceLabel
        : "") || legacyTable.servicePriceLabel || "",
    discountType:
      (typeof order.metadata?.discountType === "string" ? order.metadata.discountType : "") ||
      legacyTable.discountType ||
      "",
    splitBillState: buildSplitBillStateFromMetadata(order.metadata, legacyTable.splitBillState),
    operatorId:
      (typeof order.metadata?.operatorId === "string" ? order.metadata.operatorId : undefined) ??
      legacyTable.operatorId,
    fidelityCustomerId:
      (typeof order.metadata?.fidelityCustomerId === "string"
        ? order.metadata.fidelityCustomerId
        : null) ?? legacyTable.fidelityCustomerId ?? null,
    fidelityCustomerLabel:
      (typeof order.metadata?.fidelityCustomerLabel === "string"
        ? order.metadata.fidelityCustomerLabel
        : "") || legacyTable.fidelityCustomerLabel || "",
    fidelityCardCode:
      (typeof order.metadata?.fidelityCardCode === "string" ? order.metadata.fidelityCardCode : "") ||
      legacyTable.fidelityCardCode ||
      "",
    fidelityQrCodeValue:
      (typeof order.metadata?.fidelityQrCodeValue === "string"
        ? order.metadata.fidelityQrCodeValue
        : "") || legacyTable.fidelityQrCodeValue || "",
    fidelityScannedBeforePayment:
      typeof order.metadata?.fidelityScannedBeforePayment === "boolean"
        ? order.metadata.fidelityScannedBeforePayment
        : legacyTable.fidelityScannedBeforePayment ?? false,
    pointsEligible:
      typeof order.metadata?.pointsEligible === "boolean"
        ? order.metadata.pointsEligible
        : legacyTable.pointsEligible ?? false,
    pointsProcessed:
      typeof order.metadata?.pointsProcessed === "boolean"
        ? order.metadata.pointsProcessed
        : legacyTable.pointsProcessed ?? false,
    pendingPoints:
      typeof order.metadata?.pendingPoints === "number"
        ? order.metadata.pendingPoints
        : legacyTable.pendingPoints ?? 0,
    lastFidelityScanAt:
      (typeof order.metadata?.lastFidelityScanAt === "string"
        ? order.metadata.lastFidelityScanAt
        : null) ?? legacyTable.lastFidelityScanAt ?? null,
    selectedRewardId:
      (typeof order.metadata?.selectedRewardId === "string"
        ? order.metadata.selectedRewardId
        : null) ?? legacyTable.selectedRewardId ?? null,
    selectedRewardName:
      (typeof order.metadata?.selectedRewardName === "string"
        ? order.metadata.selectedRewardName
        : "") || legacyTable.selectedRewardName || "",
    selectedRewardDiscount:
      typeof order.metadata?.selectedRewardDiscount === "number"
        ? order.metadata.selectedRewardDiscount
        : legacyTable.selectedRewardDiscount ?? 0,
    selectedRewardPoints:
      typeof order.metadata?.selectedRewardPoints === "number"
        ? order.metadata.selectedRewardPoints
        : legacyTable.selectedRewardPoints ?? 0,
    rewardRedemptionId:
      (typeof order.metadata?.rewardRedemptionId === "string"
        ? order.metadata.rewardRedemptionId
        : null) ?? legacyTable.rewardRedemptionId ?? null,
    earnedPoints:
      typeof order.metadata?.earnedPoints === "number"
        ? order.metadata.earnedPoints
        : legacyTable.earnedPoints ?? 0,
    finalPointsBalanceSnapshot:
      typeof order.metadata?.finalPointsBalanceSnapshot === "number"
        ? order.metadata.finalPointsBalanceSnapshot
        : legacyTable.finalPointsBalanceSnapshot ?? null,
    pointsBeforePayment:
      typeof order.metadata?.pointsBeforePayment === "number"
        ? order.metadata.pointsBeforePayment
        : legacyTable.pointsBeforePayment ?? null,
    orders: normalizedItems,
  } satisfies TableOverlay;
}

function buildOrderWriteRow(
  table: PosTableState,
  tableRowId: string | null,
  roomRowId: string | null
) {
  const amounts = computeOrderAmounts(table.orders);
  const legacyKey = buildOrderKey(table);

  return {
    restaurant_id: getActiveRestaurantId(),
    table_id: tableRowId,
    room_id: roomRowId,
    opened_by_operator_id: null,
    assigned_operator_id: null,
    customer_id: null,
    company_id: null,
    legacy_order_key: legacyKey,
    source_device_mode: null,
    table_name_snapshot: table.name,
    room_name_snapshot: table.room,
    status: computeOrderStatus(table, table.orders),
    table_status: table.status === "occupied" ? "occupied" : "free",
    command_status: computeCommandStatus(table.orders),
    payment_status: mapTablePaymentStatusToOrderPaymentStatus(table.paymentStatus),
    cover_count: Math.max(table.guests ?? 0, 0),
    subtotal_amount: amounts.subtotal,
    discount_amount: amounts.discount,
    surcharge_amount: amounts.surcharge,
    total_amount: amounts.total,
    prebill_printed_at: table.prebillPrintedAt ?? null,
    notes: table.note || null,
    metadata: {
      customerName: table.customerName,
      companyName: table.companyName,
      operator: table.operator,
      operatorId: table.operatorId ?? null,
      saleMode: table.saleMode,
      servicePriceLabel: table.servicePriceLabel,
      discountType: table.discountType,
      splitBillState: table.splitBillState ?? null,
      fidelityCustomerId: table.fidelityCustomerId ?? null,
      fidelityCustomerLabel: table.fidelityCustomerLabel ?? "",
      fidelityCardCode: table.fidelityCardCode ?? "",
      fidelityQrCodeValue: table.fidelityQrCodeValue ?? "",
      fidelityScannedBeforePayment: table.fidelityScannedBeforePayment ?? false,
      pointsEligible: table.pointsEligible ?? false,
      pointsProcessed: table.pointsProcessed ?? false,
      pendingPoints: table.pendingPoints ?? 0,
      lastFidelityScanAt: table.lastFidelityScanAt ?? null,
      selectedRewardId: table.selectedRewardId ?? null,
      selectedRewardName: table.selectedRewardName ?? "",
      selectedRewardDiscount: table.selectedRewardDiscount ?? 0,
      selectedRewardPoints: table.selectedRewardPoints ?? 0,
      rewardRedemptionId: table.rewardRedemptionId ?? null,
      earnedPoints: table.earnedPoints ?? 0,
      finalPointsBalanceSnapshot: table.finalPointsBalanceSnapshot ?? null,
      pointsBeforePayment: table.pointsBeforePayment ?? null,
    },
    legacy_payload: table,
    created_at: table.createdAt || nowIso(),
    updated_at: table.updatedAt || nowIso(),
  };
}

function buildOrderCourseRows(
  table: PosTableState,
  orderRowId: string
) {
  return Array.from(new Set(table.orders.map((item) => item.course)))
    .sort((left, right) => getCourseSortOrder(left) - getCourseSortOrder(right))
    .map((course, index) => ({
      restaurant_id: getActiveRestaurantId(),
      order_id: orderRowId,
      code: course,
      label: course,
      sort_order: index + 1,
      metadata: {},
      legacy_payload: { course },
      created_at: nowIso(),
      updated_at: nowIso(),
    }));
}

function buildOrderGuestRows(
  table: PosTableState,
  orderRowId: string
) {
  return buildGuestCodes(table).map((guestCode, index) => {
    const numericMatch = guestCode.match(/\d+/);
    return {
      restaurant_id: getActiveRestaurantId(),
      order_id: orderRowId,
      code: guestCode,
      label: guestCode,
      seat_index: numericMatch ? Number(numericMatch[0]) : index + 1,
      metadata: {},
      legacy_payload: { guestCode },
      created_at: nowIso(),
      updated_at: nowIso(),
    };
  });
}

function buildOrderLineRows(
  table: PosTableState,
  orderRowId: string,
  courseIdByCode: Map<string, string>,
  guestIdByCode: Map<string, string>
) {
  return table.orders.map((item, index) => ({
    restaurant_id: getActiveRestaurantId(),
    order_id: orderRowId,
    course_id: courseIdByCode.get(item.course) ?? null,
    guest_id: item.commensaleCode ? guestIdByCode.get(item.commensaleCode) ?? null : null,
    legacy_order_line_id: item.id,
    product_id: null,
    vat_rate_id: null,
    category_id: null,
    department_id: null,
    line_number: index + 1,
    status: item.status,
    product_name_snapshot: item.name,
    category_name_snapshot: null,
    department_name_snapshot: null,
    unit_price: item.unitPrice,
    quantity: item.quantity,
    sent_quantity: Math.min(item.sentQuantity ?? 0, item.quantity),
    queued_quantity: Math.min(item.queuedQuantity ?? 0, item.quantity),
    print_status: item.printStatus ?? (Math.min(item.sentQuantity ?? 0, item.quantity) > 0 ? "sent" : "pending"),
    line_total: item.unitPrice * item.quantity,
    notes: item.note || null,
    additions: item.additions ?? [],
    removals: item.removals ?? [],
    sent_to_kitchen_at: item.sentToKitchenAt ?? null,
    last_print_job_id: item.lastPrintJobId ?? null,
    metadata: {
      legacy_product_id: item.productId,
      payment_state: item.paymentState ?? null,
      operator_label: item.operatorLabel ?? "",
      operator_id: item.operatorId ?? null,
      vat_rate_key: item.vatRateKey ?? null,
      vat_rate_label: item.vatRateLabel ?? null,
      vat_rate_value: item.vatRateValue ?? null,
      queued_quantity: Math.min(item.queuedQuantity ?? 0, item.quantity),
      print_status: item.printStatus ?? (Math.min(item.sentQuantity ?? 0, item.quantity) > 0 ? "sent" : "pending"),
    },
    legacy_payload: item,
    created_at: item.createdAt || nowIso(),
    updated_at: item.updatedAt || nowIso(),
  }));
}

async function syncByScopedKey<TRow extends { id: string }>(
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

export async function readRelationalOperationalTableOverlays(): Promise<TableOverlay[] | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const [orders, courses, guests, lines] = await Promise.all([
    readSupabaseRows<RelationalOrderRow>("orders", {
      filters: [getRestaurantIdFilter()],
      orderBy: "updated_at",
      ascending: false,
    }),
    readSupabaseRows<RelationalOrderCourseRow>("order_courses", {
      filters: [getRestaurantIdFilter()],
      orderBy: "sort_order",
    }),
    readSupabaseRows<RelationalOrderGuestRow>("order_guests", {
      filters: [getRestaurantIdFilter()],
      orderBy: "seat_index",
    }),
    readSupabaseRows<RelationalOrderLineRow>("order_lines", {
      filters: [getRestaurantIdFilter()],
      orderBy: "line_number",
    }),
  ]);

  if (!orders || orders.length === 0) {
    return null;
  }

  const coursesByOrderId = new Map<string, RelationalOrderCourseRow[]>();
  const guestsByOrderId = new Map<string, RelationalOrderGuestRow[]>();
  const linesByOrderId = new Map<string, RelationalOrderLineRow[]>();

  (courses ?? []).forEach((course) => {
    coursesByOrderId.set(course.order_id, [...(coursesByOrderId.get(course.order_id) ?? []), course]);
  });
  (guests ?? []).forEach((guest) => {
    guestsByOrderId.set(guest.order_id, [...(guestsByOrderId.get(guest.order_id) ?? []), guest]);
  });
  (lines ?? []).forEach((line) => {
    linesByOrderId.set(line.order_id, [...(linesByOrderId.get(line.order_id) ?? []), line]);
  });

  return orders
    .filter((order) => Boolean(order.legacy_order_key?.trim()))
    .map((order) =>
      buildOrderOverlay(
        order,
        linesByOrderId.get(order.id) ?? [],
        coursesByOrderId.get(order.id) ?? [],
        guestsByOrderId.get(order.id) ?? []
      )
    )
    .filter((overlay) => overlay.id);
}

export async function writeRelationalOperationalOrdersState(
  tables: PosTableState[]
): Promise<void> {
  if (!isSupabaseConfigured()) {
    return;
  }

  const activeTables = tables.filter(isOperationalTableActive);
  const [tableRows, roomRows, existingOrderRows, existingCourseRows, existingGuestRows, existingLineRows] =
    await Promise.all([
      readSupabaseRows<RelationalTableRow>("tables", {
        filters: [getRestaurantIdFilter()],
      }),
      readSupabaseRows<RelationalRoomRow>("rooms", {
        filters: [getRestaurantIdFilter()],
      }),
      readSupabaseRows<RelationalOrderRow>("orders", {
        filters: [getRestaurantIdFilter()],
      }),
      readSupabaseRows<RelationalOrderCourseRow>("order_courses", {
        filters: [getRestaurantIdFilter()],
      }),
      readSupabaseRows<RelationalOrderGuestRow>("order_guests", {
        filters: [getRestaurantIdFilter()],
      }),
      readSupabaseRows<RelationalOrderLineRow>("order_lines", {
        filters: [getRestaurantIdFilter()],
      }),
    ]);

  const tableIdByLegacyId = new Map(
    (tableRows ?? []).map((row) => [normalizeTableLegacyId(row), row.id])
  );
  const roomIdByLegacyId = new Map(
    (roomRows ?? []).map((row) => [normalizeRoomLegacyId(row), row.id])
  );

  const nextOrderRows = activeTables.map((table) =>
    buildOrderWriteRow(
      table,
      tableIdByLegacyId.get(table.id) ?? null,
      table.roomId ? roomIdByLegacyId.get(table.roomId) ?? null : null
    )
  );

  await syncByScopedKey(
    "orders",
    existingOrderRows ?? [],
    nextOrderRows,
    (row) => row.legacy_order_key ?? row.id,
    (row) => String(row.legacy_order_key ?? "")
  );

  const refreshedOrders =
    (await readSupabaseRows<RelationalOrderRow>("orders", {
      filters: [getRestaurantIdFilter()],
    })) ?? [];
  const orderIdByLegacyKey = new Map(
    refreshedOrders
      .filter((row) => Boolean(row.legacy_order_key))
      .map((row) => [row.legacy_order_key as string, row.id])
  );

  const nextCourseRows = activeTables.flatMap((table) => {
    const orderId = orderIdByLegacyKey.get(buildOrderKey(table));
    return orderId ? buildOrderCourseRows(table, orderId) : [];
  });

  await syncByScopedKey(
    "order_courses",
    existingCourseRows ?? [],
    nextCourseRows,
    (row) => `${row.order_id}::${row.code}`,
    (row) => `${String(row.order_id)}::${String(row.code)}`
  );

  const refreshedCourses =
    (await readSupabaseRows<RelationalOrderCourseRow>("order_courses", {
      filters: [getRestaurantIdFilter()],
    })) ?? [];
  const courseIdByOrderAndCode = new Map(
    refreshedCourses.map((row) => [`${row.order_id}::${row.code}`, row.id])
  );

  const nextGuestRows = activeTables.flatMap((table) => {
    const orderId = orderIdByLegacyKey.get(buildOrderKey(table));
    return orderId ? buildOrderGuestRows(table, orderId) : [];
  });

  await syncByScopedKey(
    "order_guests",
    existingGuestRows ?? [],
    nextGuestRows,
    (row) => `${row.order_id}::${row.code}`,
    (row) => `${String(row.order_id)}::${String(row.code)}`
  );

  const refreshedGuests =
    (await readSupabaseRows<RelationalOrderGuestRow>("order_guests", {
      filters: [getRestaurantIdFilter()],
    })) ?? [];
  const guestIdByOrderAndCode = new Map(
    refreshedGuests.map((row) => [`${row.order_id}::${row.code}`, row.id])
  );

  const nextLineRows = activeTables.flatMap((table) => {
    const orderId = orderIdByLegacyKey.get(buildOrderKey(table));
    if (!orderId) {
      return [];
    }

    const courseIdByCode = new Map<string, string>();
    const guestIdByCode = new Map<string, string>();

    table.orders.forEach((item) => {
      const courseId = courseIdByOrderAndCode.get(`${orderId}::${item.course}`);
      if (courseId) {
        courseIdByCode.set(item.course, courseId);
      }
      const guestCode = item.commensaleCode?.trim();
      if (guestCode) {
        const guestId = guestIdByOrderAndCode.get(`${orderId}::${guestCode}`);
        if (guestId) {
          guestIdByCode.set(guestCode, guestId);
        }
      }
    });

    return buildOrderLineRows(table, orderId, courseIdByCode, guestIdByCode);
  });

  await syncByScopedKey(
    "order_lines",
    existingLineRows ?? [],
    nextLineRows,
    (row) => `${row.order_id}::${row.legacy_order_line_id ?? row.id}`,
    (row) => `${String(row.order_id)}::${String(row.legacy_order_line_id ?? "")}`
  );
}

function mapPrintJobStatus(status: PrintJobStatus): RelationalTransmissionRow["status"] {
  if (status === "simulated") {
    return "simulated";
  }
  if (status === "sent") {
    return "sent";
  }
  if (status === "failed") {
    return "failed";
  }
  if (status === "cancelled") {
    return "cancelled";
  }
  return "pending";
}

function parseCommandNumber(value?: string | null) {
  if (!value) {
    return null;
  }

  const numeric = Number(value.replace(/[^\d]/g, ""));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

export async function writeRelationalOrderTransmissions(
  payload: OrderTransmissionSyncPayload
): Promise<void> {
  if (!isSupabaseConfigured() || payload.jobs.length === 0) {
    return;
  }

  const [orders, operators, transmissions, lines] = await Promise.all([
    readSupabaseRows<RelationalOrderRow>("orders", {
      filters: [getRestaurantIdFilter()],
    }),
    readSupabaseRows<RelationalOperatorRow>("operators", {
      filters: [getRestaurantIdFilter()],
    }),
    readSupabaseRows<RelationalTransmissionRow>("order_transmissions", {
      filters: [getRestaurantIdFilter()],
    }),
    readSupabaseRows<RelationalOrderLineRow>("order_lines", {
      filters: [getRestaurantIdFilter()],
    }),
  ]);

  const order = (orders ?? []).find((row) => row.legacy_order_key === payload.tableId);
  if (!order) {
    return;
  }

  const operatorId =
    (operators ?? []).find((row) =>
      normalizeOperatorLookupKeys(row).includes(payload.operatorId?.trim() || "")
    )?.id ??
    (operators ?? []).find((row) =>
      normalizeOperatorLookupKeys(row).includes(payload.operatorLabel?.trim() || "")
    )?.id ??
    null;

  const transmissionRows = payload.jobs.map((job) => {
    const firstItem = job.items[0];
    return {
      restaurant_id: getActiveRestaurantId(),
      order_id: order.id,
      triggered_by_operator_id: operatorId,
      triggered_from_device: payload.deviceMode ?? null,
      legacy_print_job_id: job.id,
      course_code: firstItem?.course ?? null,
      production_station: firstItem?.productionStation ?? null,
      printer_id: null,
      printer_role: job.printerRole,
      transmission_type: payload.transmissionType ?? "order",
      status: mapPrintJobStatus(job.status),
      command_number: parseCommandNumber(job.commandNumber ?? payload.commandNumber),
      error_message: job.errorMessage ?? null,
      payload: {
        printerName: job.printerName,
        summary: job.summary,
        items: job.items,
      },
      metadata: {},
      created_at: job.createdAt || nowIso(),
      updated_at: job.updatedAt || nowIso(),
    };
  });

  await syncByScopedKey(
    "order_transmissions",
    transmissions ?? [],
    transmissionRows,
    (row) => row.legacy_print_job_id ?? row.id,
    (row) => String(row.legacy_print_job_id ?? "")
  );

  const refreshedTransmissions =
    (await readSupabaseRows<RelationalTransmissionRow>("order_transmissions", {
      filters: [getRestaurantIdFilter()],
    })) ?? [];
  const transmissionIdByLegacyPrintJobId = new Map(
    refreshedTransmissions
      .filter((row) => Boolean(row.legacy_print_job_id))
      .map((row) => [row.legacy_print_job_id as string, row.id])
  );
  const lineIdByLegacyLineId = new Map(
    (lines ?? [])
      .filter((line) => line.order_id === order.id && Boolean(line.legacy_order_line_id))
      .map((line) => [line.legacy_order_line_id as string, line.id])
  );

  const transmissionIds = payload.jobs
    .map((job) => transmissionIdByLegacyPrintJobId.get(job.id))
    .filter((value): value is string => Boolean(value));

  if (transmissionIds.length > 0) {
    await deleteSupabaseRows("order_transmission_lines", [
      { column: "restaurant_id", value: getActiveRestaurantId() },
      { column: "transmission_id", operator: "in", value: transmissionIds },
    ]);
  }

  const transmissionLineRows = payload.jobs.flatMap((job) => {
    const transmissionId = transmissionIdByLegacyPrintJobId.get(job.id);
    if (!transmissionId) {
      return [];
    }

    return job.items
      .map((item) => {
        const orderLineId = lineIdByLegacyLineId.get(item.id);
        if (!orderLineId) {
          return null;
        }

        return {
          restaurant_id: getActiveRestaurantId(),
          transmission_id: transmissionId,
          order_line_id: orderLineId,
          quantity_sent: item.quantity,
          guest_code_snapshot: item.guestCode ?? null,
          metadata: {
            course: item.course ?? null,
            productionStation: item.productionStation ?? null,
            printerRole: item.printerRole,
          },
          created_at: nowIso(),
          updated_at: nowIso(),
        };
      })
      .filter((row) => row !== null);
  });

  if (transmissionLineRows.length > 0) {
    await createSupabaseRows("order_transmission_lines", transmissionLineRows);
  }
}
