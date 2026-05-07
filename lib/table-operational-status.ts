import type { OrderItem, RestaurantTable } from "@/lib/pos-data";

const AUTO_COVER_PRODUCT_ID = "auto-cover-charge";

export type TableOperationalStateKey =
  | "free"
  | "open-no-command"
  | "command-sent"
  | "changes-pending"
  | "ready-payment"
  | "prebill-printed";

export type TableOperationalState = {
  key: TableOperationalStateKey;
  label: string;
  shortLabel: string;
  accentLabel?: string;
  total: number;
  covers: number;
  hasPendingChanges: boolean;
  hasPrintedPrebill: boolean;
};

export function getTableOperationalModeLabel(
  stateKey: TableOperationalStateKey,
  mode: "cassa" | "palmare" = "cassa"
) {
  if (mode === "palmare") {
    switch (stateKey) {
      case "free":
        return "Libero";
      case "open-no-command":
        return "Occupato";
      case "changes-pending":
        return "In lavorazione";
      case "command-sent":
        return "Da servire";
      case "ready-payment":
      case "prebill-printed":
        return "Conto richiesto";
      default:
        return "Libero";
    }
  }

  switch (stateKey) {
    case "free":
      return "Libero";
    case "open-no-command":
      return "Aperto senza comanda";
    case "changes-pending":
      return "Modifiche da inviare";
    case "command-sent":
      return "Comanda inviata";
    case "ready-payment":
      return "Pronto per pagamento";
    case "prebill-printed":
      return "Preconto stampato";
    default:
      return "Libero";
  }
}

export type TableOperationalStatusSource = RestaurantTable & {
  orders?: OrderItem[];
};

function getVisibleSentQuantity(item: OrderItem) {
  return Math.min(item.sentQuantity ?? 0, item.quantity);
}

function getPendingQuantity(item: OrderItem) {
  return Math.max(item.quantity - getVisibleSentQuantity(item), 0);
}

function getRealOrderItems(table: TableOperationalStatusSource) {
  return (table.orders ?? []).filter(
    (item) => item.productId !== AUTO_COVER_PRODUCT_ID && item.quantity > 0
  );
}

export function getTableOperationalState(table: TableOperationalStatusSource): TableOperationalState {
  const realItems = getRealOrderItems(table);
  const hasRealItems = realItems.length > 0;
  const hasSentItems = realItems.some((item) => getVisibleSentQuantity(item) > 0);
  const hasPendingChanges = realItems.some((item) => getPendingQuantity(item) > 0);
  const hasPrintedPrebill = Boolean(table.prebillPrintedAt);
  const hasOpenMetadata =
    table.guests > 0 ||
    Boolean(table.note?.trim()) ||
    Boolean(table.customerName?.trim()) ||
    Boolean(table.companyName?.trim());
  const total = realItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

  if (!hasRealItems && !hasOpenMetadata && table.status === "free") {
    return {
      key: "free",
      label: "Libero",
      shortLabel: "Libero",
      total,
      covers: table.guests,
      hasPendingChanges,
      hasPrintedPrebill,
    };
  }

  if (hasPendingChanges) {
    return {
      key: "changes-pending",
      label: "Modifiche da inviare",
      shortLabel: "Da inviare",
      accentLabel: "!",
      total,
      covers: table.guests,
      hasPendingChanges,
      hasPrintedPrebill,
    };
  }

  if (hasPrintedPrebill && hasSentItems) {
    return {
      key: "prebill-printed",
      label: "Preconto stampato",
      shortLabel: "Preconto",
      accentLabel: "PC",
      total,
      covers: table.guests,
      hasPendingChanges,
      hasPrintedPrebill,
    };
  }

  if ((table.paymentStatus ?? "idle") === "pending" && hasRealItems) {
    return {
      key: "ready-payment",
      label: "Pronto per pagamento",
      shortLabel: "Pagamento",
      accentLabel: "€",
      total,
      covers: table.guests,
      hasPendingChanges,
      hasPrintedPrebill,
    };
  }

  if (hasSentItems) {
    return {
      key: "command-sent",
      label: "Comanda inviata",
      shortLabel: "Inviata",
      accentLabel: "OK",
      total,
      covers: table.guests,
      hasPendingChanges,
      hasPrintedPrebill,
    };
  }

  if (table.status === "occupied" || hasRealItems || hasOpenMetadata) {
    return {
      key: "open-no-command",
      label: "Aperto senza comanda",
      shortLabel: "Aperto",
      accentLabel: "AP",
      total,
      covers: table.guests,
      hasPendingChanges,
      hasPrintedPrebill,
    };
  }

  return {
    key: "free",
    label: "Libero",
    shortLabel: "Libero",
    total,
    covers: table.guests,
    hasPendingChanges,
    hasPrintedPrebill,
  };
}
