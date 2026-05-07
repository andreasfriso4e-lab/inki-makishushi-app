"use client";

export type AppOrderType = "takeaway" | "delivery";
export type AppOrderStatus =
  | "Richiesto"
  | "Confermato"
  | "In produzione"
  | "Pronto"
  | "Ritirato"
  | "Consegnato"
  | "Annullato";
export type AppOrderPaymentStatus =
  | "Pagato online"
  | "Da pagare al ritiro"
  | "Da pagare alla consegna"
  | "Non pagato"
  | "Pagato in cassa"
  | "Annullato / rimborsato";

export type AppOrderEventType =
  | "CREATED_FROM_APP"
  | "DETAIL_OPENED"
  | "STATUS_CHANGED"
  | "PRODUCTION_SENT"
  | "DEPARTMENT_PRINTED"
  | "DEPARTMENT_PRINT_FAILED"
  | "REPRINT_REQUESTED"
  | "MOVED_TO_TABLE"
  | "MOVED_TO_TAKEAWAY"
  | "PAYMENT_REGISTERED"
  | "DOCUMENT_CREATED"
  | "DOCUMENT_OPENED"
  | "COMPLETED"
  | "CANCELLED";

export type AppOrderItem = {
  id: string;
  app_order_id?: string;
  product_id?: string;
  product_name: string;
  quantity: number;
  qty?: number;
  unit_price: number;
  total_price?: number;
  notes?: string;
  department: string;
  department_id?: string;
  variants?: string[];
  variant_text?: string;
};

export type AppOrderRecord = {
  id: string;
  internal_order_id: string;
  external_order_code: string;
  external_code?: string;
  source: "app";
  type: AppOrderType;
  status: AppOrderStatus;
  payment_status: AppOrderPaymentStatus;
  payment_method: string;
  payment_transaction_reference?: string;
  customer_id?: string | null;
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  delivery_address?: string;
  delivery_notes?: string;
  notes?: string;
  original_total_amount: number;
  subtotal: number;
  discount_total: number;
  discount_type?: "none" | "fixed" | "percent";
  discount_label?: string;
  discount_value?: number;
  discount_percent?: number | null;
  total: number;
  total_amount: number;
  order_created_at: string;
  ordered_at: string;
  requested_fulfillment_at: string;
  requested_at: string;
  production_sent_at: string | null;
  sent_to_production_at: string | null;
  payment_registered_at?: string | null;
  receipt_printed_at?: string | null;
  ready_at: string | null;
  completed_at: string | null;
  moved_to_table_id: string | null;
  moved_to_takeaway: boolean;
  internal_document_id?: string | null;
  internal_document_number?: string | null;
  origin_label?: string;
  items: AppOrderItem[];
};

export type AppOrderEvent = {
  id: string;
  app_order_id: string;
  operator_id: string;
  operator_name: string;
  event_type: AppOrderEventType;
  old_value?: unknown;
  new_value?: unknown;
  notes?: string;
  created_at: string;
};

export const APP_ORDERS_STORAGE_KEY = "pos-app-orders";
export const APP_ORDERS_CHANGED_EVENT = "pos-app-orders-changed";
export const APP_ORDER_EVENTS_STORAGE_KEY = "pos-app-order-events";
export const APP_ORDER_EVENTS_CHANGED_EVENT = "pos-app-order-events-changed";

function nowIsoWithOffset(hoursOffset = 0) {
  const date = new Date();
  date.setHours(date.getHours() + hoursOffset);
  return date.toISOString();
}

function createInternalOrderId(externalOrderCode: string) {
  return `APPINT-${externalOrderCode.replace(/[^0-9A-Z]/gi, "").toUpperCase()}`;
}

function calculateSubtotal(items: AppOrderItem[]) {
  return Number(
    items.reduce((total, item) => total + item.quantity * item.unit_price, 0).toFixed(2)
  );
}

function normalizeItem(orderId: string, item: AppOrderItem): AppOrderItem {
  const quantity = item.quantity ?? item.qty ?? 0;
  const unitPrice = item.unit_price ?? 0;
  const variants = Array.isArray(item.variants) ? item.variants : [];

  return {
    ...item,
    app_order_id: item.app_order_id ?? orderId,
    quantity,
    qty: quantity,
    unit_price: unitPrice,
    total_price: item.total_price ?? Number((quantity * unitPrice).toFixed(2)),
    department_id: item.department_id ?? item.department,
    variants,
    variant_text: item.variant_text ?? variants.join(", "),
  };
}

type MockAppOrderInput = {
  external_order_code: string;
  type: AppOrderType;
  status: AppOrderStatus;
  payment_status: AppOrderPaymentStatus;
  payment_method: string;
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  delivery_address?: string;
  delivery_notes?: string;
  notes?: string;
  order_created_at: string;
  requested_fulfillment_at: string;
  total_amount: number;
  items: AppOrderItem[];
  moved_to_table_id: string | null;
  moved_to_takeaway: boolean;
  production_sent_at: string | null;
  ready_at: string | null;
  completed_at: string | null;
  origin_label?: string;
};

function createMockOrder(input: MockAppOrderInput): AppOrderRecord {
  const subtotal = calculateSubtotal(input.items);

  return normalizeOrder({
    id: `app-order-${input.external_order_code.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    internal_order_id: createInternalOrderId(input.external_order_code),
    source: "app",
    ...input,
    original_total_amount: input.total_amount,
    subtotal,
    discount_total: 0,
    total: input.total_amount,
    total_amount: input.total_amount,
    ordered_at: input.order_created_at,
    requested_at: input.requested_fulfillment_at,
    sent_to_production_at: input.production_sent_at,
  });
}

const defaultAppOrders: AppOrderRecord[] = [
  createMockOrder({
    external_order_code: "APP-1042",
    type: "takeaway",
    status: "Richiesto",
    payment_status: "Pagato online",
    payment_method: "Carta online",
    customer_name: "Giulia Rossi",
    customer_phone: "333 1234567",
    customer_email: "giulia.rossi@example.com",
    notes: "Senza wasabi",
    order_created_at: nowIsoWithOffset(-1),
    requested_fulfillment_at: nowIsoWithOffset(1),
    total_amount: 28,
    items: [
      {
        id: "app-1042-item-1",
        product_id: "california",
        product_name: "California",
        quantity: 1,
        unit_price: 9,
        department: "cucina",
        variants: ["8 pezzi"],
      },
      {
        id: "app-1042-item-2",
        product_id: "coca-cola",
        product_name: "Coca-Cola",
        quantity: 1,
        unit_price: 3,
        department: "bar",
      },
      {
        id: "app-1042-item-3",
        product_name: "Coperti app",
        quantity: 2,
        unit_price: 8,
        department: "servizi",
        notes: "Packaging takeaway",
      },
    ],
    moved_to_table_id: null,
    moved_to_takeaway: false,
    production_sent_at: null,
    ready_at: null,
    completed_at: null,
    origin_label: "App cliente",
  }),
  createMockOrder({
    external_order_code: "APP-1043",
    type: "delivery",
    status: "Confermato",
    payment_status: "Da pagare alla consegna",
    payment_method: "Contanti alla consegna",
    customer_name: "Marco Bianchi",
    customer_phone: "334 5558877",
    customer_email: "marco.bianchi@example.com",
    delivery_address: "Via Roma 21, Padova",
    delivery_notes: "Citofono Bianchi, piano 2",
    notes: "Citofono Bianchi, piano 2",
    order_created_at: nowIsoWithOffset(-2),
    requested_fulfillment_at: nowIsoWithOffset(0),
    total_amount: 34.5,
    items: [
      {
        id: "app-1043-item-1",
        product_id: "spicy-salmone",
        product_name: "Spicy salmone",
        quantity: 1,
        unit_price: 12,
        department: "cucina",
        variants: ["8 pezzi"],
      },
      {
        id: "app-1043-item-2",
        product_id: "ginger-beer",
        product_name: "Ginger Beer",
        quantity: 1,
        unit_price: 4,
        department: "bar",
      },
      {
        id: "app-1043-item-3",
        product_id: "temaki-spicy-tuna",
        product_name: "Temaki Spicy Tuna",
        quantity: 1,
        unit_price: 5.5,
        department: "cucina",
      },
      {
        id: "app-1043-item-4",
        product_name: "Consegna domicilio",
        quantity: 1,
        unit_price: 13,
        department: "servizi",
      },
    ],
    moved_to_table_id: null,
    moved_to_takeaway: false,
    production_sent_at: null,
    ready_at: null,
    completed_at: null,
    origin_label: "App cliente",
  }),
  createMockOrder({
    external_order_code: "APP-1044",
    type: "takeaway",
    status: "In produzione",
    payment_status: "Da pagare al ritiro",
    payment_method: "Da definire al ritiro",
    customer_name: "Sara Verdi",
    customer_phone: "348 9990012",
    order_created_at: nowIsoWithOffset(-3),
    requested_fulfillment_at: nowIsoWithOffset(-1),
    total_amount: 19,
    items: [
      {
        id: "app-1044-item-1",
        product_id: "philadelphia",
        product_name: "Philadelphia",
        quantity: 1,
        unit_price: 9,
        department: "cucina",
        variants: ["8 pezzi"],
      },
      {
        id: "app-1044-item-2",
        product_id: "red-bull",
        product_name: "Red Bull",
        quantity: 1,
        unit_price: 4,
        department: "bar",
      },
      {
        id: "app-1044-item-3",
        product_id: "wakame",
        product_name: "Wakame",
        quantity: 1,
        unit_price: 6,
        department: "cucina",
      },
    ],
    moved_to_table_id: null,
    moved_to_takeaway: false,
    production_sent_at: nowIsoWithOffset(-2),
    ready_at: null,
    completed_at: null,
    origin_label: "App cliente",
  }),
  createMockOrder({
    external_order_code: "APP-1045",
    type: "delivery",
    status: "Pronto",
    payment_status: "Pagato online",
    payment_method: "Apple Pay",
    customer_name: "Luca Neri",
    customer_phone: "349 2227788",
    delivery_address: "Piazza Mazzini 4, Padova",
    order_created_at: nowIsoWithOffset(-4),
    requested_fulfillment_at: nowIsoWithOffset(-1),
    total_amount: 42,
    items: [
      {
        id: "app-1045-item-1",
        product_id: "california-in-tempura",
        product_name: "California in tempura",
        quantity: 1,
        unit_price: 12,
        department: "cucina",
        variants: ["8 pezzi"],
      },
      {
        id: "app-1045-item-2",
        product_id: "fanta",
        product_name: "Fanta",
        quantity: 2,
        unit_price: 3,
        department: "bar",
      },
      {
        id: "app-1045-item-3",
        product_id: "sashimi-mix",
        product_name: "Sashimi mix",
        quantity: 2,
        unit_price: 12,
        department: "cucina",
      },
    ],
    moved_to_table_id: null,
    moved_to_takeaway: false,
    production_sent_at: nowIsoWithOffset(-3),
    ready_at: nowIsoWithOffset(-1),
    completed_at: null,
    origin_label: "App cliente",
  }),
];

function normalizeOrder(order: AppOrderRecord): AppOrderRecord {
  const items = Array.isArray(order.items) ? order.items.map((item) => normalizeItem(order.id, item)) : [];
  const subtotal = order.subtotal ?? calculateSubtotal(items);
  const discountTotal = order.discount_total ?? 0;
  const total = order.total ?? order.total_amount ?? Number((subtotal - discountTotal).toFixed(2));

  return {
    ...order,
    internal_order_id:
      order.internal_order_id ??
      createInternalOrderId(order.external_order_code ?? order.external_code ?? order.id),
    external_code: order.external_code ?? order.external_order_code,
    source: "app",
    payment_method: order.payment_method ?? "",
    delivery_notes: order.delivery_notes ?? order.notes ?? "",
    subtotal,
    original_total_amount: order.original_total_amount ?? subtotal,
    discount_total: discountTotal,
    discount_type: order.discount_type ?? (discountTotal > 0 ? "fixed" : "none"),
    discount_label: order.discount_label ?? "",
    discount_value: order.discount_value ?? discountTotal,
    discount_percent: order.discount_percent ?? null,
    total,
    total_amount: total,
    order_created_at: order.order_created_at ?? order.ordered_at,
    ordered_at: order.ordered_at ?? order.order_created_at,
    requested_fulfillment_at: order.requested_fulfillment_at ?? order.requested_at,
    requested_at: order.requested_at ?? order.requested_fulfillment_at,
    production_sent_at: order.production_sent_at ?? order.sent_to_production_at ?? null,
    sent_to_production_at: order.sent_to_production_at ?? order.production_sent_at ?? null,
    payment_registered_at: order.payment_registered_at ?? null,
    receipt_printed_at: order.receipt_printed_at ?? null,
    moved_to_table_id: order.moved_to_table_id ?? null,
    moved_to_takeaway: order.moved_to_takeaway ?? false,
    ready_at: order.ready_at ?? null,
    completed_at: order.completed_at ?? null,
    internal_document_id: order.internal_document_id ?? null,
    internal_document_number: order.internal_document_number ?? null,
    items,
  };
}

function createDefaultEvents(): AppOrderEvent[] {
  return defaultAppOrders.map((order) => ({
    id: `app-order-event-created-${order.id}`,
    app_order_id: order.id,
    operator_id: "system",
    operator_name: "App cliente",
    event_type: "CREATED_FROM_APP",
    old_value: null,
    new_value: {
      status: order.status,
      payment_status: order.payment_status,
      total: order.total_amount,
    },
    notes: `Ordine ricevuto dall'app (${order.external_order_code})`,
    created_at: order.order_created_at,
  }));
}

function normalizeEvent(event: AppOrderEvent): AppOrderEvent {
  return {
    ...event,
    operator_id: event.operator_id || "admin",
    operator_name: event.operator_name || "Admin",
    created_at: event.created_at || new Date().toISOString(),
  };
}

export function getDefaultAppOrders() {
  return defaultAppOrders.map((order) => ({
    ...order,
    items: order.items.map((item) => ({
      ...item,
      variants: item.variants ? [...item.variants] : [],
    })),
  }));
}

export function getAppOrders() {
  if (typeof window === "undefined") {
    return getDefaultAppOrders();
  }

  const rawValue = window.localStorage.getItem(APP_ORDERS_STORAGE_KEY);

  if (!rawValue) {
    return getDefaultAppOrders();
  }

  try {
    const parsedValue = JSON.parse(rawValue) as AppOrderRecord[];
    return Array.isArray(parsedValue) ? parsedValue.map(normalizeOrder) : getDefaultAppOrders();
  } catch {
    window.localStorage.removeItem(APP_ORDERS_STORAGE_KEY);
    return getDefaultAppOrders();
  }
}

export function saveAppOrders(orders: AppOrderRecord[]) {
  const normalizedOrders = orders.map(normalizeOrder);

  if (typeof window !== "undefined") {
    window.localStorage.setItem(APP_ORDERS_STORAGE_KEY, JSON.stringify(normalizedOrders));
    window.dispatchEvent(new CustomEvent(APP_ORDERS_CHANGED_EVENT, { detail: normalizedOrders }));
  }

  return normalizedOrders;
}

export function getAppOrderEvents() {
  if (typeof window === "undefined") {
    return createDefaultEvents();
  }

  const rawValue = window.localStorage.getItem(APP_ORDER_EVENTS_STORAGE_KEY);

  if (!rawValue) {
    return createDefaultEvents();
  }

  try {
    const parsedValue = JSON.parse(rawValue) as AppOrderEvent[];
    return Array.isArray(parsedValue) ? parsedValue.map(normalizeEvent) : createDefaultEvents();
  } catch {
    window.localStorage.removeItem(APP_ORDER_EVENTS_STORAGE_KEY);
    return createDefaultEvents();
  }
}

export function saveAppOrderEvents(events: AppOrderEvent[]) {
  const normalizedEvents = events.map(normalizeEvent).sort((left, right) =>
    right.created_at.localeCompare(left.created_at)
  );

  if (typeof window !== "undefined") {
    window.localStorage.setItem(APP_ORDER_EVENTS_STORAGE_KEY, JSON.stringify(normalizedEvents));
    window.dispatchEvent(
      new CustomEvent(APP_ORDER_EVENTS_CHANGED_EVENT, { detail: normalizedEvents })
    );
  }

  return normalizedEvents;
}

export function recordAppOrderEvent(
  input: Omit<AppOrderEvent, "id" | "created_at"> & { created_at?: string }
) {
  const nextEvent: AppOrderEvent = normalizeEvent({
    id: `app-order-event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    created_at: input.created_at ?? new Date().toISOString(),
    ...input,
  });

  saveAppOrderEvents([nextEvent, ...getAppOrderEvents()]);
  return nextEvent;
}

export function getAppOrderEventsForOrder(appOrderId: string) {
  return getAppOrderEvents().filter((event) => event.app_order_id === appOrderId);
}

export function buildAppOrderMapsLink(address?: string) {
  if (!address?.trim()) {
    return "";
  }

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.trim())}`;
}
