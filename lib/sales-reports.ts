"use client";

import { getDocumentArchive, type ArchivedMovement } from "@/lib/document-archive";
import { getProducts } from "@/lib/pos-data";

export type ReportSectionId =
  | "prodotti"
  | "categorie"
  | "incassi"
  | "vendite-giornaliere"
  | "vendite-mensili"
  | "vendite-annuali";

export type ReportPeriodKey =
  | "oggi"
  | "ieri"
  | "settimana"
  | "mese"
  | "anno"
  | "ultimi-15-giorni"
  | "intervallo-personalizzato";

export type ReportPeriodRange = {
  start: Date;
  end: Date;
};

export type ProductReportRow = {
  productId: string;
  productName: string;
  quantitySold: number;
  revenue: number;
  revenueShare: number;
};

export type CategoryReportRow = {
  categoryName: string;
  quantitySold: number;
  revenue: number;
  revenueShare: number;
};

export type RevenueByMethodRow = {
  method: string;
  total: number;
};

export type RevenueTrendRow = {
  label: string;
  total: number;
  movements: number;
};

export type SalesTimelineRow = {
  label: string;
  total: number;
  movements: number;
  itemsSold: number;
};

const allowedCompletedStatuses = new Set<ArchivedMovement["status"]>(["Pagato", "Trasformato in fattura"]);

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function startOfWeek(date: Date) {
  const next = new Date(date);
  const day = next.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + diff);
  return startOfDay(next);
}

function startOfMonth(date: Date) {
  return startOfDay(new Date(date.getFullYear(), date.getMonth(), 1));
}

function startOfYear(date: Date) {
  return startOfDay(new Date(date.getFullYear(), 0, 1));
}

function parseDateInput(value: string, fallback: Date) {
  if (!value) {
    return fallback;
  }

  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toMonthKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function getMovementDate(entry: ArchivedMovement) {
  const parsed = new Date(entry.createdAt);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export function getReportRange(period: ReportPeriodKey, customStart: string, customEnd: string, now = new Date()) {
  if (period === "oggi") {
    return { start: startOfDay(now), end: endOfDay(now) };
  }

  if (period === "ieri") {
    const yesterday = addDays(now, -1);
    return { start: startOfDay(yesterday), end: endOfDay(yesterday) };
  }

  if (period === "settimana") {
    return { start: startOfWeek(now), end: endOfDay(now) };
  }

  if (period === "mese") {
    return { start: startOfMonth(now), end: endOfDay(now) };
  }

  if (period === "anno") {
    return { start: startOfYear(now), end: endOfDay(now) };
  }

  if (period === "ultimi-15-giorni") {
    return { start: startOfDay(addDays(now, -14)), end: endOfDay(now) };
  }

  const start = startOfDay(parseDateInput(customStart, addDays(now, -6)));
  const end = endOfDay(parseDateInput(customEnd, now));

  return start <= end
    ? { start, end }
    : {
        start: startOfDay(parseDateInput(customEnd, now)),
        end: endOfDay(parseDateInput(customStart, addDays(now, -6))),
      };
}

export function getCompletedSalesMovements(range: ReportPeriodRange) {
  return getDocumentArchive()
    .filter((entry) => allowedCompletedStatuses.has(entry.status))
    .filter((entry) => {
      const movementDate = getMovementDate(entry);
      return movementDate >= range.start && movementDate <= range.end;
    });
}

export function getProductReportRows(movements: ArchivedMovement[]): ProductReportRow[] {
  const totals = new Map<string, ProductReportRow>();
  const revenueTotal = movements.reduce((sum, movement) => sum + movement.total, 0);

  movements.forEach((movement) => {
    movement.lines.forEach((line) => {
      const current = totals.get(line.productId) ?? {
        productId: line.productId,
        productName: line.name,
        quantitySold: 0,
        revenue: 0,
        revenueShare: 0,
      };

      current.quantitySold += line.quantity;
      current.revenue += line.quantity * line.unitPrice;
      totals.set(line.productId, current);
    });
  });

  return Array.from(totals.values())
    .map((row) => ({
      ...row,
      revenueShare: revenueTotal > 0 ? (row.revenue / revenueTotal) * 100 : 0,
    }))
    .sort((left, right) => right.quantitySold - left.quantitySold || right.revenue - left.revenue);
}

export function getCategoryReportRows(movements: ArchivedMovement[]): CategoryReportRow[] {
  const productsById = new Map(getProducts().map((product) => [product.id, product]));
  const totals = new Map<string, CategoryReportRow>();
  const revenueTotal = movements.reduce((sum, movement) => sum + movement.total, 0);

  movements.forEach((movement) => {
    movement.lines.forEach((line) => {
      const fallbackCategory = line.productId.includes("service") || line.name.startsWith("Coperti") ? "Servizi" : "Altro";
      const categoryName = productsById.get(line.productId)?.category ?? fallbackCategory;
      const current = totals.get(categoryName) ?? {
        categoryName,
        quantitySold: 0,
        revenue: 0,
        revenueShare: 0,
      };

      current.quantitySold += line.quantity;
      current.revenue += line.quantity * line.unitPrice;
      totals.set(categoryName, current);
    });
  });

  return Array.from(totals.values())
    .map((row) => ({
      ...row,
      revenueShare: revenueTotal > 0 ? (row.revenue / revenueTotal) * 100 : 0,
    }))
    .sort((left, right) => right.revenue - left.revenue || right.quantitySold - left.quantitySold);
}

export function getRevenueSummary(movements: ArchivedMovement[]) {
  const totalCollected = movements.reduce((sum, movement) => sum + movement.total, 0);
  const totalMovements = movements.length;
  const paymentMethods = ["Contanti", "Carta", "Bancomat", "Fidelity", "Assegno"];
  const byMethod = new Map<string, number>(paymentMethods.map((method) => [method, 0]));

  movements.forEach((movement) => {
    const currentValue = byMethod.get(movement.paymentMethod) ?? 0;
    byMethod.set(movement.paymentMethod, currentValue + movement.total);
  });

  const trendMap = new Map<string, RevenueTrendRow>();
  movements.forEach((movement) => {
    const movementDate = getMovementDate(movement);
    const label = movementDate.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" });
    const current = trendMap.get(label) ?? { label, total: 0, movements: 0 };
    current.total += movement.total;
    current.movements += 1;
    trendMap.set(label, current);
  });

  return {
    totalCollected,
    totalMovements,
    byMethod: Array.from(byMethod.entries()).map(([method, total]) => ({ method, total })),
    trend: Array.from(trendMap.values()).sort((left, right) => left.label.localeCompare(right.label, "it")),
  };
}

function getItemsSold(movement: ArchivedMovement) {
  return movement.lines.reduce((sum, line) => sum + line.quantity, 0);
}

export function getDailySalesRows(movements: ArchivedMovement[]): SalesTimelineRow[] {
  const totals = new Map<string, SalesTimelineRow>();

  movements.forEach((movement) => {
    const movementDate = getMovementDate(movement);
    const key = toDateKey(movementDate);
    const current = totals.get(key) ?? { label: key, total: 0, movements: 0, itemsSold: 0 };
    current.total += movement.total;
    current.movements += 1;
    current.itemsSold += getItemsSold(movement);
    totals.set(key, current);
  });

  return Array.from(totals.values()).sort((left, right) => right.label.localeCompare(left.label, "it"));
}

export function getMonthlySalesRows(movements: ArchivedMovement[]): SalesTimelineRow[] {
  const totals = new Map<string, SalesTimelineRow>();

  movements.forEach((movement) => {
    const movementDate = getMovementDate(movement);
    const key = toMonthKey(movementDate);
    const label = movementDate.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
    const current = totals.get(key) ?? { label, total: 0, movements: 0, itemsSold: 0 };
    current.total += movement.total;
    current.movements += 1;
    current.itemsSold += getItemsSold(movement);
    totals.set(key, current);
  });

  return Array.from(totals.entries())
    .sort(([left], [right]) => right.localeCompare(left, "it"))
    .map(([, value]) => value);
}

export function getYearlySalesRows(movements: ArchivedMovement[]): SalesTimelineRow[] {
  const totals = new Map<string, SalesTimelineRow>();

  movements.forEach((movement) => {
    const movementDate = getMovementDate(movement);
    const key = String(movementDate.getFullYear());
    const current = totals.get(key) ?? { label: key, total: 0, movements: 0, itemsSold: 0 };
    current.total += movement.total;
    current.movements += 1;
    current.itemsSold += getItemsSold(movement);
    totals.set(key, current);
  });

  return Array.from(totals.entries())
    .sort(([left], [right]) => right.localeCompare(left, "it"))
    .map(([, value]) => value);
}
