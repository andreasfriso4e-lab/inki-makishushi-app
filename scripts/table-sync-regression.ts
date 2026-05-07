import type { OrderItem, PosTableState } from "../lib/pos-data";
import {
  safeApplyIncomingOrderState,
  safeApplyIncomingTableState,
} from "../lib/table-sync-guard";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function buildOrderItem(id: string, course: OrderItem["course"]): OrderItem {
  return {
    id,
    productId: id,
    name: id,
    quantity: 1,
    unitPrice: 10,
    course,
    status: "draft",
  };
}

function buildTable(id: string, orders: OrderItem[], clientRevision: number): PosTableState {
  return {
    id,
    name: id,
    room: "Sala",
    roomId: "sala",
    status: orders.length > 0 ? "occupied" : "free",
    paymentStatus: "idle",
    covers: 0,
    guests: orders.length > 0 ? 2 : 0,
    customerName: "",
    companyName: "",
    operator: "Admin",
    saleMode: "",
    servicePriceLabel: "",
    discountType: "",
    note: "",
    orders,
    clientRevision,
    updatedAt: new Date(2026, 4, clientRevision).toISOString(),
  };
}

function run() {
  const currentLines = [
    buildOrderItem("line-1", "PRIMA PORTATA"),
    buildOrderItem("line-2", "SECONDA PORTATA"),
  ];

  const blockedEmpty = safeApplyIncomingOrderState({
    currentLines,
    incomingLines: [],
    source: "polling",
    isDirtyDraft: true,
    currentClientRevision: 4,
    incomingClientRevision: 0,
    currentUpdatedAt: "2026-05-08T10:00:00.000Z",
    incomingUpdatedAt: "2026-05-08T09:59:00.000Z",
    reason: "regression-empty",
  });
  assert(blockedEmpty.nextLines.length === 2, "Incoming vuoto non deve cancellare il draft");

  const blockedShrink = safeApplyIncomingOrderState({
    currentLines,
    incomingLines: [buildOrderItem("line-1", "PRIMA PORTATA")],
    source: "refetch",
    isDirtyDraft: false,
    currentClientRevision: 5,
    incomingClientRevision: 4,
    currentUpdatedAt: "2026-05-08T10:01:00.000Z",
    incomingUpdatedAt: "2026-05-08T10:00:00.000Z",
    reason: "regression-shrink",
  });
  assert(blockedShrink.nextLines.length === 2, "Incoming con meno righe non deve vincere");

  const currentTable = buildTable("table-1", currentLines, 6);
  const incomingTable = buildTable("table-1", [], 0);
  const protectedTable = safeApplyIncomingTableState({
    currentTable,
    incomingTable,
    source: "polling",
    isDirtyDraft: true,
    currentClientRevision: 6,
    incomingClientRevision: 0,
    currentUpdatedAt: currentTable.updatedAt,
    incomingUpdatedAt: incomingTable.updatedAt,
    reason: "regression-table",
  });
  assert(protectedTable.nextTable.orders.length === 2, "Il tavolo attivo non deve perdere le righe");

  const paymentClear = safeApplyIncomingOrderState({
    currentLines,
    incomingLines: [],
    source: "payment",
    isDirtyDraft: false,
    currentClientRevision: 7,
    incomingClientRevision: 7,
    currentUpdatedAt: "2026-05-08T10:02:00.000Z",
    incomingUpdatedAt: "2026-05-08T10:03:00.000Z",
    reason: "payment-clear",
  });
  assert(paymentClear.nextLines.length === 0, "Il pagamento completato deve poter liberare l'ordine");

  console.log("table-sync regression: ok");
}

run();
