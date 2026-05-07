"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  APP_ORDERS_CHANGED_EVENT,
  APP_ORDER_EVENTS_CHANGED_EVENT,
  buildAppOrderMapsLink,
  getAppOrderEventsForOrder,
  getAppOrders,
  recordAppOrderEvent,
  saveAppOrders,
  type AppOrderEvent,
  type AppOrderPaymentStatus,
  type AppOrderRecord,
  type AppOrderStatus,
  type AppOrderType,
} from "@/lib/app-orders";
import {
  addOperationalArchivedMovement,
  DOCUMENT_ARCHIVE_CHANGED_EVENT,
  getDocumentArchive,
  hydrateDocumentArchiveFromServer,
  type ArchivedMovement,
} from "@/lib/document-archive";
import { getProducts, type OrderItem } from "@/lib/pos-data";
import { PrintJobService, type PrintJob } from "@/lib/print-job-service";
import { recordAuditEvent } from "@/services/audit-log-service";
import { useAuth } from "@/store/auth-context";
import { useTables } from "@/store/table-context";

type StatusFilter =
  | "all"
  | "Richiesti"
  | "In produzione"
  | "Pronti"
  | "Completati"
  | "Annullati";

type SortKey = "orderTime" | "requestedTime" | "orderNumber" | "status";

function formatDateTime(value?: string | null) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  return date.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTime(value?: string | null) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  return date.toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatEuro(value: number) {
  return `EUR ${value.toFixed(2)}`;
}

function getPaymentBadgeStyles(status: AppOrderPaymentStatus) {
  if (status === "Pagato online" || status === "Pagato in cassa") {
    return "bg-[#e6f5e8] text-[#25613a] border-[#b6ddbd]";
  }

  if (status === "Annullato / rimborsato" || status === "Non pagato") {
    return "bg-[#fff1f1] text-[#9a3d3d] border-[#e5c1c1]";
  }

  return "bg-[#fff8e5] text-[#8a6b17] border-[#ead9a1]";
}

function getStatusBadgeStyles(status: AppOrderStatus) {
  if (status === "Pronto" || status === "Ritirato" || status === "Consegnato") {
    return "bg-[#eef7ff] text-[#0b3c5d] border-[#cfe0ee]";
  }

  if (status === "Annullato") {
    return "bg-[#fff1f1] text-[#9a3d3d] border-[#e5c1c1]";
  }

  if (status === "In produzione") {
    return "bg-[#fff8e5] text-[#8a6b17] border-[#ead9a1]";
  }

  return "bg-[#f4f1eb] text-[#5f584f] border-[#ddd6cb]";
}

function buildOrderItemFromAppItem(
  appOrder: AppOrderRecord,
  appItem: AppOrderRecord["items"][number],
  operatorName: string,
  operatorId: string
): OrderItem {
  const now = new Date().toISOString();

  return {
    id: `${appOrder.id}-${appItem.id}-${Math.random().toString(36).slice(2, 6)}`,
    productId: appItem.product_id || `app-${appItem.id}`,
    name: appItem.product_name,
    quantity: appItem.quantity,
    sentQuantity: appOrder.production_sent_at ? appItem.quantity : 0,
    unitPrice: appItem.unit_price,
    originalUnitPrice: appItem.unit_price,
    course: "PRIMA PORTATA",
    status: appOrder.production_sent_at ? "sent" : "draft",
    paymentState: "unpaid",
    operatorLabel: operatorName,
    note: [appItem.notes, appItem.variant_text ? `Varianti: ${appItem.variant_text}` : ""]
      .filter(Boolean)
      .join(" · "),
    additions: appItem.variants ?? [],
    orderId: appOrder.internal_order_id,
    operatorId,
    createdAt: now,
    updatedAt: now,
    createdByOperatorId: operatorId,
    updatedByOperatorId: operatorId,
  };
}

function isOrderPaid(order: AppOrderRecord) {
  return order.payment_status === "Pagato online" || order.payment_status === "Pagato in cassa";
}

export function AppOrdersView() {
  const router = useRouter();
  const { currentUser, currentActor } = useAuth();
  const { rooms, tables, updateTable, setTableOrders } = useTables();
  const [orders, setOrders] = useState<AppOrderRecord[]>(() => getAppOrders());
  const [documents, setDocuments] = useState<ArchivedMovement[]>(() => getDocumentArchive());
  const [searchValue, setSearchValue] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | AppOrderType>("all");
  const [paidFilter, setPaidFilter] = useState<"all" | "paid" | "unpaid">("all");
  const [sortKey, setSortKey] = useState<SortKey>("requestedTime");
  const [selectedOrderId, setSelectedOrderId] = useState<string>("");
  const [statusMessage, setStatusMessage] = useState("");
  const [tableSelectionOrderId, setTableSelectionOrderId] = useState<string | null>(null);
  const [historyOrderId, setHistoryOrderId] = useState<string | null>(null);
  const [selectedHistoryEvents, setSelectedHistoryEvents] = useState<AppOrderEvent[]>([]);

  useEffect(() => {
    setOrders(getAppOrders());
    setDocuments(getDocumentArchive());
    void hydrateDocumentArchiveFromServer().then((nextDocuments) => {
      setDocuments(nextDocuments);
    });
  }, []);

  useEffect(() => {
    const handleOrdersChanged = () => {
      setOrders(getAppOrders());
    };
    const handleEventsChanged = () => {
      if (historyOrderId) {
        setSelectedHistoryEvents(getAppOrderEventsForOrder(historyOrderId));
      }
    };
    const handleArchiveChanged = () => {
      setDocuments(getDocumentArchive());
    };

    window.addEventListener(APP_ORDERS_CHANGED_EVENT, handleOrdersChanged);
    window.addEventListener(APP_ORDER_EVENTS_CHANGED_EVENT, handleEventsChanged);
    window.addEventListener(DOCUMENT_ARCHIVE_CHANGED_EVENT, handleArchiveChanged);

    return () => {
      window.removeEventListener(APP_ORDERS_CHANGED_EVENT, handleOrdersChanged);
      window.removeEventListener(APP_ORDER_EVENTS_CHANGED_EVENT, handleEventsChanged);
      window.removeEventListener(DOCUMENT_ARCHIVE_CHANGED_EVENT, handleArchiveChanged);
    };
  }, [historyOrderId]);

  const searchableValue = searchValue.trim().toLowerCase();
  const filteredOrders = useMemo(() => {
    const nextOrders = orders.filter((order) => {
      const matchesSearch =
        !searchableValue ||
        order.external_order_code.toLowerCase().includes(searchableValue) ||
        order.customer_name.toLowerCase().includes(searchableValue) ||
        order.customer_phone.toLowerCase().includes(searchableValue);

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "Richiesti" && order.status === "Richiesto") ||
        (statusFilter === "In produzione" && order.status === "In produzione") ||
        (statusFilter === "Pronti" && order.status === "Pronto") ||
        (statusFilter === "Completati" &&
          (order.status === "Consegnato" || order.status === "Ritirato")) ||
        (statusFilter === "Annullati" && order.status === "Annullato");

      const matchesType = typeFilter === "all" || order.type === typeFilter;
      const paid = isOrderPaid(order);
      const matchesPaid =
        paidFilter === "all" ||
        (paidFilter === "paid" && paid) ||
        (paidFilter === "unpaid" && !paid);

      return matchesSearch && matchesStatus && matchesType && matchesPaid;
    });

    return [...nextOrders].sort((left, right) => {
      if (sortKey === "orderNumber") {
        return left.external_order_code.localeCompare(right.external_order_code, "it");
      }
      if (sortKey === "status") {
        return left.status.localeCompare(right.status, "it");
      }

      const leftValue =
        sortKey === "requestedTime" ? left.requested_fulfillment_at : left.order_created_at;
      const rightValue =
        sortKey === "requestedTime" ? right.requested_fulfillment_at : right.order_created_at;
      return new Date(leftValue).getTime() - new Date(rightValue).getTime();
    });
  }, [orders, paidFilter, searchableValue, sortKey, statusFilter, typeFilter]);

  useEffect(() => {
    if (!filteredOrders.some((order) => order.id === selectedOrderId)) {
      setSelectedOrderId(filteredOrders[0]?.id ?? "");
    }
  }, [filteredOrders, selectedOrderId]);

  const selectedOrder = filteredOrders.find((order) => order.id === selectedOrderId) ?? null;
  const linkedDocument = selectedOrder
    ? documents.find((entry) => entry.id === selectedOrder.internal_document_id) ?? null
    : null;
  const selectedOrderIsProductionPhase = Boolean(selectedOrder?.production_sent_at);
  const selectedOrderCanPrintReceipt = selectedOrder
    ? selectedOrderIsProductionPhase && isOrderPaid(selectedOrder)
    : false;

  const products = getProducts();

  const saveOrdersState = (nextOrders: AppOrderRecord[]) => {
    const savedOrders = saveAppOrders(nextOrders);
    setOrders(savedOrders);
    return savedOrders;
  };

  const patchOrder = (orderId: string, updater: (order: AppOrderRecord) => AppOrderRecord) => {
    const previousOrder = orders.find((order) => order.id === orderId) ?? null;
    const nextOrders = orders.map((order) =>
      order.id === orderId ? updater(order) : order
    );
    const nextOrder = nextOrders.find((order) => order.id === orderId) ?? null;
    saveOrdersState(nextOrders);
    return { previousOrder, nextOrder };
  };

  const registerHistoryAndAudit = (
    order: AppOrderRecord,
    eventType: AppOrderEvent["event_type"],
    auditType:
      | "APP_ORDER_STATUS_CHANGED"
      | "APP_ORDER_DETAIL_OPENED"
      | "APP_ORDER_MOVED"
      | "APP_ORDER_PRODUCTION_SENT"
      | "APP_ORDER_REPRINTED"
      | "APP_ORDER_PAYMENT_UPDATED"
      | "APP_ORDER_DOCUMENT_CREATED"
      | "APP_ORDER_DOCUMENT_OPENED"
      | "RECEIPT_PRINTED",
    oldValue: unknown,
    newValue: unknown,
    notes?: string,
    origin: "ui_pos" | "table" | "printing" | "payment" | "document" = "ui_pos"
  ) => {
    recordAppOrderEvent({
      app_order_id: order.id,
      operator_id: currentActor.operatorId,
      operator_name: currentUser.displayName,
      event_type: eventType,
      old_value: oldValue,
      new_value: newValue,
      notes,
    });

    recordAuditEvent({
      eventType: auditType,
      entityType: "app-order",
      entityId: order.id,
      tableId: order.moved_to_table_id ?? undefined,
      previousValue: oldValue,
      nextValue: newValue,
      notes,
      origin,
    });
  };

  const refreshDocuments = () => {
    setDocuments(getDocumentArchive());
  };

  const ensureDocumentForOrder = (
    order: AppOrderRecord,
    resolvedPaymentMethod: string,
    nextStatus?: AppOrderStatus
  ) => {
    const existingDocument =
      documents.find((entry) => entry.id === order.internal_document_id) ?? null;

    if (existingDocument) {
      return existingDocument;
    }

    const sourceType = order.type === "takeaway" ? "takeaway" : "takeaway";
    const document = addOperationalArchivedMovement({
      tableId: order.moved_to_table_id || order.internal_order_id,
      tableLabel:
        order.type === "delivery"
          ? `Domicilio ${order.external_order_code}`
          : order.moved_to_takeaway
            ? `Take Away ${order.external_order_code}`
            : `Ordine App ${order.external_order_code}`,
      roomLabel: order.type === "delivery" ? "Domicilio" : "Ordini App",
      saleMode: order.type === "delivery" ? "Domicilio" : "Take Away",
      customerName: order.customer_name,
      companyName: "",
      operator: currentUser.displayName,
      paymentMethod: resolvedPaymentMethod,
      total: order.total_amount,
      originalTotal: order.original_total_amount ?? order.subtotal,
      finalTotal: order.total_amount,
      subtotalAmount: order.subtotal,
      serviceAmount: 0,
      discountType: order.discount_type ?? (order.discount_total > 0 ? "fixed" : "none"),
      discountPercentage: order.discount_percent ?? null,
      discountFixedAmount:
        (order.discount_type ?? "none") === "fixed" && order.discount_total > 0
          ? order.discount_total
          : null,
      discountValue: order.discount_total,
      discountLabel:
        order.discount_label || (order.discount_total > 0 ? "Sconto ordine app" : ""),
      discountSummary:
        order.discount_total > 0
          ? order.discount_label || `Sconto ordine app -${formatEuro(order.discount_total)}`
          : "",
      operatorId: currentActor.operatorId,
      note: [
        `Origine: APP`,
        `Ordine esterno: ${order.external_order_code}`,
        order.notes,
      ]
        .filter(Boolean)
        .join(" · "),
      guests: order.items.reduce((total, item) => total + item.quantity, 0),
      sourceType,
      appOrderId: order.id,
      appOrderExternalCode: order.external_order_code,
      appOrderInternalId: order.internal_order_id,
      orderFinalStatus: nextStatus ?? order.status,
      origin: "APP",
      lines: order.items.map((item) => ({
        id: item.id,
        productId: item.product_id || `app-${item.id}`,
        name: item.product_name,
        quantity: item.quantity,
        unitPrice: item.unit_price,
        originalUnitPrice: item.unit_price,
        course: "PRIMA PORTATA",
        status: order.production_sent_at ? "sent" : "draft",
        paymentState: "paid",
        operatorLabel: currentUser.displayName,
        note: [item.notes, item.variant_text].filter(Boolean).join(" · "),
        additions: item.variants ?? [],
      })),
    });

    refreshDocuments();

    const { nextOrder } = patchOrder(order.id, (currentOrder) => ({
      ...currentOrder,
      internal_document_id: document.id,
      internal_document_number: document.documentNumber,
    }));

    registerHistoryAndAudit(
      order,
      "DOCUMENT_CREATED",
      "APP_ORDER_DOCUMENT_CREATED",
      order,
      nextOrder,
      `Documento ${document.documentNumber} collegato all'ordine`,
      "document"
    );

    return document;
  };

  const applyPrintResultEvents = (
    order: AppOrderRecord,
    printJobs: PrintJob[],
    mode: "production" | "reprint"
  ) => {
    const departments = Array.from(new Set(order.items.map((item) => item.department)));
    const failures = printJobs.filter((job) => job.status === "failed");

    registerHistoryAndAudit(
      order,
      mode === "production" ? "PRODUCTION_SENT" : "REPRINT_REQUESTED",
      mode === "production" ? "APP_ORDER_PRODUCTION_SENT" : "APP_ORDER_REPRINTED",
      null,
      {
        departments,
        printJobs: printJobs.map((job) => ({
          id: job.id,
          printer: job.printerName,
          role: job.printerRole,
          status: job.status,
          error: job.errorMessage,
        })),
      },
      failures.length > 0
        ? `Invio reparti con errori: ${failures.map((job) => job.printerName).join(", ")}`
        : `Invio reparti completato: ${departments.join(", ")}`,
      "printing"
    );

    printJobs.forEach((job) => {
      recordAppOrderEvent({
        app_order_id: order.id,
        operator_id: currentActor.operatorId,
        operator_name: currentUser.displayName,
        event_type:
          job.status === "failed" ? "DEPARTMENT_PRINT_FAILED" : "DEPARTMENT_PRINTED",
        old_value: null,
        new_value: {
          printer: job.printerName,
          printerRole: job.printerRole,
          status: job.status,
        },
        notes:
          job.status === "failed"
            ? job.errorMessage || `Errore stampa su ${job.printerName}`
            : `${job.summary} -> ${job.printerName}`,
      });
    });
  };

  const handleOpenOrder = (order: AppOrderRecord) => {
    setSelectedOrderId(order.id);
    registerHistoryAndAudit(
      order,
      "DETAIL_OPENED",
      "APP_ORDER_DETAIL_OPENED",
      null,
      { selected: true },
      `Dettaglio aperto per ${order.external_order_code}`
    );
  };

  const handleSetStatus = (order: AppOrderRecord, nextStatus: AppOrderStatus) => {
    if ((nextStatus === "Consegnato" || nextStatus === "Ritirato") && !isOrderPaid(order)) {
      setStatusMessage("Registra prima il pagamento oppure usa un ordine già pagato online.");
      return;
    }

    const now = new Date().toISOString();
    const linkedDoc =
      nextStatus === "Consegnato" || nextStatus === "Ritirato"
        ? ensureDocumentForOrder(order, order.payment_method || "Carta online", nextStatus)
        : null;

    const { previousOrder, nextOrder } = patchOrder(order.id, (currentOrder) => ({
      ...currentOrder,
      status: nextStatus,
      ready_at: nextStatus === "Pronto" ? now : currentOrder.ready_at,
      completed_at:
        nextStatus === "Consegnato" || nextStatus === "Ritirato" ? now : currentOrder.completed_at,
      internal_document_id: currentOrder.internal_document_id ?? linkedDoc?.id ?? null,
      internal_document_number:
        currentOrder.internal_document_number ?? linkedDoc?.documentNumber ?? null,
    }));

    registerHistoryAndAudit(
      order,
      nextStatus === "Annullato"
        ? "CANCELLED"
        : nextStatus === "Consegnato" || nextStatus === "Ritirato"
          ? "COMPLETED"
          : "STATUS_CHANGED",
      "APP_ORDER_STATUS_CHANGED",
      previousOrder,
      nextOrder,
      `Ordine aggiornato a ${nextStatus}`
    );

    setStatusMessage(`Ordine ${order.external_order_code} aggiornato a ${nextStatus}`);
  };

  const handlePrintReceipt = async (order: AppOrderRecord, mode: "print" | "reprint") => {
    const resolvedPaymentMethod = order.payment_method || "Carta online";
    const document = ensureDocumentForOrder(order, resolvedPaymentMethod, order.status);
    const fiscalPrintJobs = await new PrintJobService().dispatchFiscalPrintJob({
      tableId: order.id,
      tableLabel: order.external_order_code,
      roomLabel: order.type === "delivery" ? "Domicilio" : "Ordini App",
      operator: currentUser.displayName,
      documentType: "Scontrino",
      paymentMethod: resolvedPaymentMethod,
      total: order.total_amount,
      items: order.items.map((item) => ({
        id: item.id,
        productId: item.product_id || `app-${item.id}`,
        name: item.product_name,
        quantity: item.quantity,
        course: "PRIMA PORTATA",
        note: [item.notes, item.variant_text].filter(Boolean).join(" · "),
      })),
      products,
    });

    const now = new Date().toISOString();
    const hasFailure = fiscalPrintJobs.some((job) => job.status === "failed");
    const { previousOrder, nextOrder } = patchOrder(order.id, (currentOrder) => ({
      ...currentOrder,
      receipt_printed_at: hasFailure ? currentOrder.receipt_printed_at ?? null : now,
      internal_document_id: currentOrder.internal_document_id ?? document.id,
      internal_document_number:
        currentOrder.internal_document_number ?? document.documentNumber,
    }));

    registerHistoryAndAudit(
      order,
      mode === "print" ? "DOCUMENT_CREATED" : "REPRINT_REQUESTED",
      mode === "print" ? "RECEIPT_PRINTED" : "APP_ORDER_REPRINTED",
      previousOrder,
      {
        ...nextOrder,
        fiscalPrintJobs: fiscalPrintJobs.map((job) => ({
          id: job.id,
          status: job.status,
          printer: job.printerName,
          error: job.errorMessage,
        })),
      },
      hasFailure
        ? "Errore in stampa scontrino fiscale"
        : mode === "print"
          ? `Scontrino stampato (${document.documentNumber})`
          : `Scontrino ristampato (${document.documentNumber})`,
      "document"
    );

    setStatusMessage(
      hasFailure
        ? `Errore stampa scontrino per ${order.external_order_code}`
        : mode === "print"
          ? `Scontrino stampato per ${order.external_order_code}`
          : `Scontrino ristampato per ${order.external_order_code}`
    );
  };

  const ensureOperationalTargetTableId = (order: AppOrderRecord) => {
    if (order.moved_to_table_id) {
      return order.moved_to_table_id;
    }

    const takeAwayRoom = rooms.find((room) => room.roomType === "takeaway");
    const targetTable =
      takeAwayRoom?.tables.find((table) => table.status === "free") ??
      takeAwayRoom?.tables[0] ??
      null;

    if (!targetTable) {
      setStatusMessage("Nessun Take Away interno disponibile per aprire il pagamento standard.");
      return null;
    }

    const orderItems = order.items.map((item) =>
      buildOrderItemFromAppItem(order, item, currentUser.displayName, currentActor.operatorId)
    );

    setTableOrders(targetTable.id, (currentItems) => [...currentItems, ...orderItems]);
    updateTable(targetTable.id, {
      status: "occupied",
      paymentStatus: isOrderPaid(order) ? "paid" : "idle",
      operator: currentUser.displayName,
      guests: Math.max(
        targetTable.guests,
        order.items.reduce((total, item) => total + item.quantity, 0)
      ),
      customerName: order.customer_name,
      note: [targetTable.note, `Origine ordine APP ${order.external_order_code}`]
        .filter(Boolean)
        .join(" · "),
    });

    const { previousOrder, nextOrder } = patchOrder(order.id, (currentOrder) => ({
      ...currentOrder,
      moved_to_takeaway: true,
      moved_to_table_id: targetTable.id,
      status: currentOrder.status === "Richiesto" ? "Confermato" : currentOrder.status,
    }));

    registerHistoryAndAudit(
      order,
      "MOVED_TO_TAKEAWAY",
      "APP_ORDER_MOVED",
      previousOrder,
      nextOrder,
      "Ordine app agganciato al flusso Take Away per pagamento standard",
      "table"
    );

    return targetTable.id;
  };

  const handleOpenStandardPayment = (order: AppOrderRecord) => {
    if (!order.production_sent_at) {
      setStatusMessage("Metti prima l'ordine in produzione.");
      return;
    }

    if (isOrderPaid(order)) {
      setStatusMessage("Ordine già pagato: puoi stampare lo scontrino.");
      return;
    }

    const targetTableId = ensureOperationalTargetTableId(order);

    if (!targetTableId) {
      return;
    }

    router.push(`/order/${targetTableId}?panelMode=payment`);
  };

  const handleSendToProduction = async (order: AppOrderRecord, mode: "production" | "reprint") => {
    const printJobs = await new PrintJobService().dispatchTaggedDepartmentPrintJobs({
      tableId: order.id,
      tableLabel: order.external_order_code,
      roomLabel: order.type === "delivery" ? "Domicilio" : "Ordini App",
      operator: currentUser.displayName,
      type: "order",
      summaryPrefix: mode === "production" ? "Comanda Ordine App" : "Ristampa Ordine App",
      items: order.items.map((item) => ({
        id: item.id,
        productId: item.product_id || `app-${item.id}`,
        name: item.product_name,
        quantity: item.quantity,
        note: [item.notes, item.variant_text ? `Varianti: ${item.variant_text}` : ""]
          .filter(Boolean)
          .join(" · "),
        course: "PRIMA PORTATA",
        department: item.department,
      })),
    });

    const now = new Date().toISOString();

    if (mode === "production") {
      patchOrder(order.id, (currentOrder) => ({
        ...currentOrder,
        status: "In produzione",
        production_sent_at: now,
        sent_to_production_at: now,
      }));
    }

    applyPrintResultEvents(order, printJobs, mode);

    setStatusMessage(
      printJobs.some((job) => job.status === "failed")
        ? `Ordine ${order.external_order_code} inviato con alcuni errori di stampa`
        : mode === "production"
          ? `Ordine ${order.external_order_code} messo in produzione`
          : `Ristampa comanda completata per ${order.external_order_code}`
    );
  };

  const handleMoveToTable = (order: AppOrderRecord, tableId: string) => {
    const targetTable = tables.find((table) => table.id === tableId);

    if (!targetTable) {
      setStatusMessage("Tavolo non disponibile");
      return;
    }

    if (
      targetTable.status === "occupied" &&
      !window.confirm(
        `Il tavolo ${targetTable.name} è già aperto. Vuoi aggiungere l'ordine app a questo tavolo?`
      )
    ) {
      return;
    }

    const orderItems = order.items.map((item) =>
      buildOrderItemFromAppItem(order, item, currentUser.displayName, currentActor.operatorId)
    );

    setTableOrders(tableId, (currentItems) => [...currentItems, ...orderItems]);
    updateTable(tableId, {
      status: "occupied",
      paymentStatus: isOrderPaid(order) ? "paid" : "idle",
      operator: currentUser.displayName,
      guests: Math.max(
        targetTable.guests,
        order.items.reduce((total, item) => total + item.quantity, 0)
      ),
      customerName: order.customer_name,
      note: [targetTable.note, `Origine ordine APP ${order.external_order_code}`]
        .filter(Boolean)
        .join(" · "),
    });

    const { previousOrder, nextOrder } = patchOrder(order.id, (currentOrder) => ({
      ...currentOrder,
      moved_to_table_id: tableId,
      moved_to_takeaway: false,
      status: currentOrder.status === "Richiesto" ? "Confermato" : currentOrder.status,
    }));

    registerHistoryAndAudit(
      order,
      "MOVED_TO_TABLE",
      "APP_ORDER_MOVED",
      previousOrder,
      nextOrder,
      `Ordine app spostato su tavolo ${targetTable.name}`,
      "table"
    );

    setTableSelectionOrderId(null);
    setStatusMessage(
      `Ordine ${order.external_order_code} spostato su ${targetTable.room} · Tavolo ${targetTable.name}`
    );
  };

  const handleMoveToTakeAway = (order: AppOrderRecord) => {
    const takeAwayRoom = rooms.find((room) => room.roomType === "takeaway");
    const targetTable =
      takeAwayRoom?.tables.find((table) => table.status === "free") ??
      takeAwayRoom?.tables[0] ??
      null;

    if (!targetTable) {
      setStatusMessage("Nessun tavolo Take Away disponibile");
      return;
    }

    const orderItems = order.items.map((item) =>
      buildOrderItemFromAppItem(order, item, currentUser.displayName, currentActor.operatorId)
    );

    setTableOrders(targetTable.id, (currentItems) => [...currentItems, ...orderItems]);
    updateTable(targetTable.id, {
      status: "occupied",
      paymentStatus: isOrderPaid(order) ? "paid" : "idle",
      operator: currentUser.displayName,
      guests: Math.max(
        targetTable.guests,
        order.items.reduce((total, item) => total + item.quantity, 0)
      ),
      customerName: order.customer_name,
      note: [targetTable.note, `Origine ordine APP ${order.external_order_code}`]
        .filter(Boolean)
        .join(" · "),
    });

    const { previousOrder, nextOrder } = patchOrder(order.id, (currentOrder) => ({
      ...currentOrder,
      moved_to_takeaway: true,
      moved_to_table_id: targetTable.id,
      status: currentOrder.status === "Richiesto" ? "Confermato" : currentOrder.status,
    }));

    registerHistoryAndAudit(
      order,
      "MOVED_TO_TAKEAWAY",
      "APP_ORDER_MOVED",
      previousOrder,
      nextOrder,
      "Ordine app spostato su Take Away interno",
      "table"
    );

    setStatusMessage(`Ordine ${order.external_order_code} spostato su Take Away`);
  };

  const handleOpenHistory = (order: AppOrderRecord) => {
    setHistoryOrderId(order.id);
    setSelectedHistoryEvents(getAppOrderEventsForOrder(order.id));
  };

  const handleOpenDocument = (order: AppOrderRecord) => {
    if (!order.internal_document_id) {
      setStatusMessage("Nessun documento collegato a questo ordine.");
      return;
    }

    registerHistoryAndAudit(
      order,
      "DOCUMENT_OPENED",
      "APP_ORDER_DOCUMENT_OPENED",
      null,
      { documentId: order.internal_document_id },
      `Apertura documento ${order.internal_document_number || order.internal_document_id}`,
      "document"
    );

    router.push("/?view=documenti");
  };

  const availableDiningTables = rooms
    .filter((room) => room.roomType !== "takeaway")
    .flatMap((room) => room.tables.map((table) => ({ ...table, roomName: room.roomName })));

  return (
    <section className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.2fr)_440px] overflow-hidden bg-[#fffefb]">
      <div className="flex min-h-0 flex-col border-r border-[#d8d5cc] bg-[#fffefb]">
        <div className="border-b border-[#d8d5cc] bg-[#f7f4ee] px-4 py-3">
          <div className="text-sm font-bold text-[#2e2a25]">Ordini App</div>
          <div className="mt-1 text-xs text-[#6a645b]">
            Ordini cliente collegati a produzione, documenti, pagamento e storico.
          </div>

          <div className="mt-3 grid grid-cols-[minmax(0,1fr)_160px] gap-2">
            <input
              type="text"
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder="Cerca per numero ordine, cliente o telefono"
              className="h-11 rounded-[8px] border border-[#d8d5cc] bg-[#ffffff] px-3 text-sm outline-none"
            />
            <select
              value={sortKey}
              onChange={(event) => setSortKey(event.target.value as SortKey)}
              className="h-11 rounded-[8px] border border-[#d8d5cc] bg-[#ffffff] px-3 text-sm outline-none"
            >
              <option value="requestedTime">Orario richiesto</option>
              <option value="orderTime">Orario ordine</option>
              <option value="orderNumber">Numero ordine</option>
              <option value="status">Stato</option>
            </select>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {([
              { key: "all", label: "Tutti" },
              { key: "Richiesti", label: "Richiesti" },
              { key: "In produzione", label: "In produzione" },
              { key: "Pronti", label: "Pronti" },
              { key: "Completati", label: "Consegnati / Ritirati" },
              { key: "Annullati", label: "Annullati" },
            ] as const).map((filter) => (
              <button
                key={filter.key}
                type="button"
                onClick={() => setStatusFilter(filter.key)}
                className={[
                  "h-9 rounded-[8px] border px-3 text-xs font-semibold",
                  statusFilter === filter.key
                    ? "border-[#a9c9e6] bg-[#cfe8ff] text-[#0b3c5d]"
                    : "border-[#d8d5cc] bg-[#ffffff] text-[#5f584f]",
                ].join(" ")}
              >
                {filter.label}
              </button>
            ))}
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            {([
              { key: "all", label: "Tutti i tipi" },
              { key: "takeaway", label: "Asporto" },
              { key: "delivery", label: "Domicilio" },
            ] as const).map((filter) => (
              <button
                key={filter.key}
                type="button"
                onClick={() => setTypeFilter(filter.key)}
                className={[
                  "h-9 rounded-[8px] border px-3 text-xs font-semibold",
                  typeFilter === filter.key
                    ? "border-[#a9c9e6] bg-[#eef7ff] text-[#0b3c5d]"
                    : "border-[#d8d5cc] bg-[#ffffff] text-[#5f584f]",
                ].join(" ")}
              >
                {filter.label}
              </button>
            ))}
            {([
              { key: "all", label: "Tutti i pagamenti" },
              { key: "paid", label: "Pagati" },
              { key: "unpaid", label: "Non pagati" },
            ] as const).map((filter) => (
              <button
                key={filter.key}
                type="button"
                onClick={() => setPaidFilter(filter.key)}
                className={[
                  "h-9 rounded-[8px] border px-3 text-xs font-semibold",
                  paidFilter === filter.key
                    ? "border-[#a9c9e6] bg-[#eef7ff] text-[#0b3c5d]"
                    : "border-[#d8d5cc] bg-[#ffffff] text-[#5f584f]",
                ].join(" ")}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-[110px_88px_82px_104px_minmax(0,1fr)_116px_150px_118px_128px_100px] gap-3 border-b border-[#ece8de] bg-[#fbf8f2] px-4 py-3 text-[11px] font-bold uppercase tracking-[0.08em] text-[#6a645b]">
          <span># Ordine</span>
          <span>Tipo</span>
          <span>Ora ordine</span>
          <span>Ora richiesta</span>
          <span>Cliente</span>
          <span>Telefono</span>
          <span>Indirizzo</span>
          <span>Stato</span>
          <span>Pagamento</span>
          <span>Totale</span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {filteredOrders.length > 0 ? (
            filteredOrders.map((order) => (
              <button
                key={order.id}
                type="button"
                onClick={() => handleOpenOrder(order)}
                className={[
                  "grid w-full grid-cols-[110px_88px_82px_104px_minmax(0,1fr)_116px_150px_118px_128px_100px] gap-3 border-b border-[#ece8de] px-4 py-4 text-left text-sm hover:bg-[#fffefc]",
                  selectedOrder?.id === order.id ? "bg-[#eef7ff]" : "bg-white",
                ].join(" ")}
              >
                <div>
                  <div className="font-semibold text-[#2e2a25]">{order.external_order_code}</div>
                  <div className="mt-1 text-xs text-[#7a746c]">{order.internal_order_id}</div>
                </div>
                <div className="text-[#2e2a25]">{order.type === "delivery" ? "Domicilio" : "Asporto"}</div>
                <div className="text-[#2e2a25]">{formatTime(order.order_created_at)}</div>
                <div className="text-[#2e2a25]">{formatTime(order.requested_fulfillment_at)}</div>
                <div className="min-w-0">
                  <div className="truncate font-medium text-[#2e2a25]">{order.customer_name}</div>
                  <div className="mt-1 text-xs text-[#7a746c]">{order.payment_method || "—"}</div>
                </div>
                <div className="text-[#2e2a25]">{order.customer_phone}</div>
                <div className="truncate text-[#5f584f]">{order.delivery_address || "—"}</div>
                <div>
                  <div
                    className={[
                      "inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold",
                      getStatusBadgeStyles(order.status),
                    ].join(" ")}
                  >
                    {order.status}
                  </div>
                </div>
                <div>
                  <div
                    className={[
                      "inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold",
                      getPaymentBadgeStyles(order.payment_status),
                    ].join(" ")}
                  >
                    {order.payment_status}
                  </div>
                </div>
                <div className="text-right font-semibold text-[#2e2a25]">
                  {formatEuro(order.total_amount)}
                </div>
              </button>
            ))
          ) : (
            <div className="px-4 py-8 text-sm text-[#7a746c]">Nessun ordine app da mostrare.</div>
          )}
        </div>
      </div>

      <aside className="flex min-h-0 flex-col overflow-hidden bg-[#ffffff]">
        <div className="border-b border-[#d8d5cc] bg-[#f7f4ee] px-4 py-3">
          <div className="text-sm font-bold text-[#2e2a25]">Dettaglio ordine</div>
          {statusMessage ? <div className="mt-2 text-xs text-[#6a645b]">{statusMessage}</div> : null}
        </div>

        {selectedOrder ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <div className="rounded-[10px] border border-[#ece8de] bg-[#fffefc] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-bold text-[#2e2a25]">{selectedOrder.external_order_code}</div>
                  <div className="mt-1 text-sm text-[#6a645b]">
                    {selectedOrder.type === "delivery" ? "Domicilio" : "Asporto"} · APP · {selectedOrder.internal_order_id}
                  </div>
                </div>
                <div className="space-y-2 text-right">
                  <div
                    className={[
                      "inline-flex rounded-full border px-3 py-1 text-xs font-semibold",
                      getStatusBadgeStyles(selectedOrder.status),
                    ].join(" ")}
                  >
                    {selectedOrder.status}
                  </div>
                  <div
                    className={[
                      "inline-flex rounded-full border px-3 py-1 text-xs font-semibold",
                      getPaymentBadgeStyles(selectedOrder.payment_status),
                    ].join(" ")}
                  >
                    {selectedOrder.payment_status}
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-3 text-sm text-[#2e2a25]">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-[11px] uppercase text-[#6a645b]">Data e ora ordine</div>
                    <div className="mt-1 font-medium">{formatDateTime(selectedOrder.order_created_at)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase text-[#6a645b]">Orario richiesto</div>
                    <div className="mt-1 font-medium">{formatDateTime(selectedOrder.requested_fulfillment_at)}</div>
                  </div>
                </div>

                <div className="rounded-[8px] border border-[#ece8de] bg-white p-3">
                  <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#6a645b]">Cliente</div>
                  <div className="mt-2 font-semibold text-[#2e2a25]">{selectedOrder.customer_name}</div>
                  <div className="mt-1">{selectedOrder.customer_phone}</div>
                  {selectedOrder.customer_email ? <div className="mt-1">{selectedOrder.customer_email}</div> : null}
                  {selectedOrder.delivery_address ? (
                    <a
                      href={buildAppOrderMapsLink(selectedOrder.delivery_address)}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 block font-medium text-[#0b3c5d] underline"
                    >
                      {selectedOrder.delivery_address}
                    </a>
                  ) : null}
                  {selectedOrder.delivery_notes ? (
                    <div className="mt-2 text-[#6a645b]">Note indirizzo: {selectedOrder.delivery_notes}</div>
                  ) : null}
                  {selectedOrder.notes ? <div className="mt-2 text-[#6a645b]">Note: {selectedOrder.notes}</div> : null}
                </div>

                <div className="rounded-[8px] border border-[#ece8de] bg-white">
                  <div className="border-b border-[#ece8de] px-3 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[#6a645b]">
                    Prodotti
                  </div>
                  <div className="divide-y divide-[#efebe2]">
                    {selectedOrder.items.map((item) => (
                      <div key={item.id} className="px-3 py-3 text-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-semibold text-[#2e2a25]">
                              {item.quantity}x {item.product_name}
                            </div>
                            {item.variant_text ? (
                              <div className="mt-1 text-xs text-[#6a645b]">{item.variant_text}</div>
                            ) : null}
                            {item.notes ? <div className="mt-1 text-xs text-[#6a645b]">{item.notes}</div> : null}
                            <div className="mt-1 text-xs text-[#7b7369]">Reparto: {item.department}</div>
                          </div>
                          <div className="text-right">
                            <div className="font-semibold text-[#2e2a25]">{formatEuro(item.unit_price)}</div>
                            <div className="mt-1 text-xs text-[#6a645b]">
                              Subtotale {formatEuro(item.total_price ?? item.quantity * item.unit_price)}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-[8px] border border-[#ece8de] bg-white p-3">
                  <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#6a645b]">Pagamento</div>
                  <div className="mt-2 grid gap-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span>Stato pagamento</span>
                      <span className="font-semibold">{selectedOrder.payment_status}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Metodo pagamento</span>
                      <span className="font-semibold">{selectedOrder.payment_method || "—"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Documento collegato</span>
                      <span className="font-semibold">
                        {selectedOrder.internal_document_number || "Non ancora emesso"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-t border-[#ece8de] pt-2">
                      <span>Totale finale</span>
                      <span className="font-bold">{formatEuro(selectedOrder.total_amount)}</span>
                    </div>
                  </div>
                </div>

                {selectedOrderIsProductionPhase ? (
                  <div className="rounded-[8px] border border-[#ece8de] bg-white p-3">
                    <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#6a645b]">
                      {selectedOrderCanPrintReceipt ? "Fase scontrino" : "Fase operativa"}
                    </div>
                    <div className="mt-2 text-sm text-[#5f584f]">
                      {selectedOrderCanPrintReceipt
                        ? "Ordine già pagato: puoi emettere o ristampare lo scontrino."
                        : "Ordine in produzione: puoi spostarlo oppure aprire direttamente la schermata pagamento standard del gestionale."}
                    </div>
                    {!selectedOrderCanPrintReceipt ? (
                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={() => handleOpenStandardPayment(selectedOrder)}
                          className="h-11 rounded-[8px] border border-[#a9c9e6] bg-[#cfe8ff] px-3 text-sm font-semibold text-[#0b3c5d]"
                        >
                          Paga
                        </button>
                      </div>
                    ) : null}

                    {selectedOrderCanPrintReceipt ? (
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => handlePrintReceipt(selectedOrder, "print")}
                          className="h-11 rounded-[8px] border border-[#a9c9e6] bg-[#cfe8ff] px-3 text-sm font-semibold text-[#0b3c5d]"
                        >
                          {selectedOrder.receipt_printed_at ? "Stampa scontrino" : "Stampa scontrino"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePrintReceipt(selectedOrder, "reprint")}
                          disabled={!selectedOrder.internal_document_id}
                          className="h-11 rounded-[8px] border border-[#d8d5cc] bg-white px-3 text-sm font-semibold text-[#2e2a25] disabled:opacity-40"
                        >
                          Ristampa scontrino
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleSendToProduction(selectedOrder, "production")}
                    disabled={selectedOrder.status === "Annullato" || Boolean(selectedOrder.production_sent_at)}
                    className="h-11 rounded-[8px] border border-[#a9c9e6] bg-[#cfe8ff] px-3 text-sm font-semibold text-[#0b3c5d] disabled:opacity-40"
                  >
                    Metti in produzione
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSendToProduction(selectedOrder, "reprint")}
                    disabled={!selectedOrder.production_sent_at}
                    className="h-11 rounded-[8px] border border-[#d8d5cc] bg-[#ffffff] px-3 text-sm font-semibold text-[#2e2a25] disabled:opacity-40"
                  >
                    Ristampa comanda
                  </button>
                  <button
                    type="button"
                    onClick={() => setTableSelectionOrderId(selectedOrder.id)}
                    disabled={selectedOrder.status === "Annullato"}
                    className="h-11 rounded-[8px] border border-[#d8d5cc] bg-[#ffffff] px-3 text-sm font-semibold text-[#2e2a25] disabled:opacity-40"
                  >
                    Sposta su tavolo
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMoveToTakeAway(selectedOrder)}
                    disabled={selectedOrder.status === "Annullato"}
                    className="h-11 rounded-[8px] border border-[#d8d5cc] bg-[#ffffff] px-3 text-sm font-semibold text-[#2e2a25] disabled:opacity-40"
                  >
                    Sposta su Take Away
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetStatus(selectedOrder, "Pronto")}
                    disabled={selectedOrder.status === "Annullato"}
                    className="h-11 rounded-[8px] border border-[#d8d5cc] bg-[#ffffff] px-3 text-sm font-semibold text-[#2e2a25] disabled:opacity-40"
                  >
                    Segna pronto
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleSetStatus(
                        selectedOrder,
                        selectedOrder.type === "delivery" ? "Consegnato" : "Ritirato"
                      )
                    }
                    disabled={selectedOrder.status === "Annullato"}
                    className="h-11 rounded-[8px] border border-[#d8d5cc] bg-[#ffffff] px-3 text-sm font-semibold text-[#2e2a25] disabled:opacity-40"
                  >
                    {selectedOrder.type === "delivery" ? "Segna consegnato" : "Segna ritirato"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenStandardPayment(selectedOrder)}
                    disabled={
                      isOrderPaid(selectedOrder) ||
                      selectedOrder.status === "Annullato" ||
                      !selectedOrder.production_sent_at
                    }
                    className="h-11 rounded-[8px] border border-[#d8d5cc] bg-[#ffffff] px-3 text-sm font-semibold text-[#2e2a25] disabled:opacity-40"
                  >
                    Paga
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenDocument(selectedOrder)}
                    disabled={!selectedOrder.internal_document_id}
                    className="h-11 rounded-[8px] border border-[#d8d5cc] bg-[#ffffff] px-3 text-sm font-semibold text-[#2e2a25] disabled:opacity-40"
                  >
                    Apri documento
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenHistory(selectedOrder)}
                    className="h-11 rounded-[8px] border border-[#d8d5cc] bg-[#ffffff] px-3 text-sm font-semibold text-[#2e2a25]"
                  >
                    Apri storico
                  </button>
                  {selectedOrder.type === "delivery" ? (
                    <a
                      href={buildAppOrderMapsLink(selectedOrder.delivery_address)}
                      target="_blank"
                      rel="noreferrer"
                      className="flex h-11 items-center justify-center rounded-[8px] border border-[#d8d5cc] bg-[#ffffff] px-3 text-sm font-semibold text-[#2e2a25]"
                    >
                      Apri mappa
                    </a>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleSetStatus(selectedOrder, "Confermato")}
                      className="h-11 rounded-[8px] border border-[#d8d5cc] bg-[#ffffff] px-3 text-sm font-semibold text-[#2e2a25]"
                    >
                      Conferma ordine
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => handleSetStatus(selectedOrder, "Annullato")}
                  className="h-11 rounded-[8px] border border-[#e5c8c8] bg-[#fff5f5] px-3 text-sm font-semibold text-[#8a3434]"
                >
                  Annulla ordine
                </button>

                {(selectedOrder.moved_to_table_id || linkedDocument) ? (
                  <div className="rounded-[8px] border border-[#ece8de] bg-[#fbfaf5] px-3 py-3 text-sm text-[#5f584f]">
                    {selectedOrder.moved_to_table_id ? (
                      <div>
                        Ordine collegato internamente a: {selectedOrder.moved_to_table_id}
                        {selectedOrder.moved_to_takeaway ? " · Take Away" : ""}
                      </div>
                    ) : null}
                    {linkedDocument ? (
                      <div className={selectedOrder.moved_to_table_id ? "mt-2" : ""}>
                        Documento collegato: {linkedDocument.documentNumber} · {linkedDocument.paymentMethod}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : (
          <div className="px-4 py-8 text-sm text-[#7a746c]">Seleziona un ordine app.</div>
        )}
      </aside>

      {tableSelectionOrderId ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/35 px-4">
          <div className="w-full max-w-[560px] rounded-[10px] border border-[#d8d5cc] bg-white shadow-[0_24px_60px_rgba(31,26,21,0.18)]">
            <div className="border-b border-[#ece8de] px-5 py-4">
              <div className="text-base font-semibold text-[#2e2a25]">Sposta su tavolo</div>
            </div>
            <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
              <div className="grid gap-2">
                {availableDiningTables.map((table) => (
                  <button
                    key={table.id}
                    type="button"
                    onClick={() => {
                      const order = orders.find((entry) => entry.id === tableSelectionOrderId);
                      if (order) {
                        handleMoveToTable(order, table.id);
                      }
                    }}
                    className="flex items-center justify-between rounded-[8px] border border-[#d8d5cc] bg-[#ffffff] px-4 py-3 text-left text-sm hover:bg-[#fffefc]"
                  >
                    <span className="font-semibold text-[#2e2a25]">
                      {table.roomName} · Tavolo {table.name}
                    </span>
                    <span className="text-xs text-[#6a645b]">
                      {table.status === "occupied" ? "Occupato" : "Libero"}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-end border-t border-[#ece8de] px-5 py-4">
              <button
                type="button"
                onClick={() => setTableSelectionOrderId(null)}
                className="h-10 rounded-[8px] border border-[#d8d5cc] bg-[#ffffff] px-4 text-sm font-medium text-[#4a4540]"
              >
                Annulla
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {historyOrderId ? (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/35 px-4">
          <div className="w-full max-w-[760px] rounded-[10px] border border-[#d8d5cc] bg-white shadow-[0_24px_60px_rgba(31,26,21,0.18)]">
            <div className="flex items-center justify-between border-b border-[#ece8de] px-5 py-4">
              <div className="text-base font-semibold text-[#2e2a25]">Storico ordine app</div>
              <button
                type="button"
                onClick={() => setHistoryOrderId(null)}
                className="h-10 rounded-[8px] border border-[#d8d5cc] bg-[#ffffff] px-4 text-sm font-medium text-[#4a4540]"
              >
                Chiudi
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
              {selectedHistoryEvents.length > 0 ? (
                <div className="space-y-3">
                  {selectedHistoryEvents.map((event) => (
                    <div
                      key={event.id}
                      className="rounded-[8px] border border-[#ece8de] bg-[#fffefc] px-4 py-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-[#2e2a25]">{event.event_type}</div>
                        <div className="text-xs text-[#6a645b]">{formatDateTime(event.created_at)}</div>
                      </div>
                      <div className="mt-1 text-xs text-[#6a645b]">Operatore: {event.operator_name}</div>
                      {event.notes ? <div className="mt-2 text-sm text-[#5f584f]">{event.notes}</div> : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-[#7a746c]">Nessun evento registrato.</div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
