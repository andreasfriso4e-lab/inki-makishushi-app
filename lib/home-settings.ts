import type { PosRoom, PosTableState, RestaurantTable } from "@/lib/pos-data";
import { getRestaurantConfig } from "@/lib/restaurant-config";
import { getRestaurantStorageKey } from "@/lib/restaurant-storage";
import { recordAuditEvent } from "@/services/audit-log-service";

export type HomeAreaType = "room" | "takeaway";

export type HomeAreaRecord = {
  id: string;
  name: string;
  type: HomeAreaType;
  is_active: boolean;
  start_table_number: number;
  end_table_number: number;
  created_at: string;
  updated_at: string;
};

export const HOME_SETTINGS_STORAGE_KEY = getRestaurantStorageKey("pos-home-settings");
export const HOME_SETTINGS_CHANGED_EVENT = "pos-home-settings-changed";
const HOME_AREAS_API_ENDPOINT = "/api/home-areas";

function createHomeArea(
  id: string,
  name: string,
  type: HomeAreaType,
  startTableNumber: number,
  endTableNumber: number
): HomeAreaRecord {
  const now = new Date().toISOString();

  return {
    id,
    name,
    type,
    is_active: true,
    start_table_number: startTableNumber,
    end_table_number: endTableNumber,
    created_at: now,
    updated_at: now,
  };
}

function getDefaultHomeAreasConfig(): HomeAreaRecord[] {
  const configuredAreas = getRestaurantConfig().homeAreas;

  if (configuredAreas && configuredAreas.length > 0) {
    return configuredAreas.map((area) =>
      createHomeArea(
        area.id,
        area.name,
        area.type,
        area.startTableNumber,
        area.endTableNumber
      )
    );
  }

  return [
    createHomeArea("sala-1", "Sala 1", "room", 1, 50),
    createHomeArea("take-away", "Take Away", "takeaway", 1, 20),
  ];
}

function slugifyHomeAreaName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function clampTableNumber(value: number) {
  return Math.min(200, Math.max(1, Math.trunc(value)));
}

function normalizeHomeArea(area: HomeAreaRecord, fallback?: HomeAreaRecord): HomeAreaRecord {
  const start = clampTableNumber(area.start_table_number ?? fallback?.start_table_number ?? 1);
  const end = clampTableNumber(area.end_table_number ?? fallback?.end_table_number ?? start);
  const normalizedId = area.id || fallback?.id || `room-${Date.now()}`;
  const normalizedName = area.name?.trim() || fallback?.name || "Nuova sala";

  return {
    id: normalizedId,
    name: normalizedName,
    type: area.type ?? fallback?.type ?? "room",
    is_active: area.is_active ?? fallback?.is_active ?? true,
    start_table_number: Math.min(start, end),
    end_table_number: Math.max(start, end),
    created_at: area.created_at || fallback?.created_at || new Date().toISOString(),
    updated_at: area.updated_at || new Date().toISOString(),
  };
}

function normalizeHomeAreas(settings: HomeAreaRecord[]) {
  const defaultHomeAreas = getDefaultHomeAreasConfig();
  const defaultsById = new Map(defaultHomeAreas.map((area) => [area.id, area]));
  const normalizedAreas = settings
    .filter(
      (area): area is HomeAreaRecord =>
        Boolean(area) && typeof area.name === "string" && typeof area.id === "string"
    )
    .map((area) => normalizeHomeArea(area, defaultsById.get(area.id)))
    .filter(
      (area, index, collection) =>
        collection.findIndex((entry) => entry.id === area.id) === index
    );

  const existingIds = new Set(normalizedAreas.map((area) => area.id));
  const missingDefaults = defaultHomeAreas
    .filter((area) => !existingIds.has(area.id))
    .map((area) => ({ ...area }));

  return [...normalizedAreas, ...missingDefaults].sort((left, right) => {
    if (left.type !== right.type) {
      return left.type === "room" ? -1 : 1;
    }

    if (left.id === "sala-1") {
      return -1;
    }

    if (right.id === "sala-1") {
      return 1;
    }

    if (left.id === "take-away") {
      return 1;
    }

    if (right.id === "take-away") {
      return -1;
    }

    return left.name.localeCompare(right.name, "it");
  });
}

function getTableIdNumberFragment(tableNumber: number) {
  return tableNumber < 100 ? String(tableNumber).padStart(2, "0") : String(tableNumber);
}

function buildTableName(area: HomeAreaRecord, tableNumber: number) {
  if (area.type === "takeaway") {
    return `TA_${getTableIdNumberFragment(tableNumber)}`;
  }

  return String(tableNumber);
}

function buildDefaultTable(area: HomeAreaRecord, tableNumber: number): RestaurantTable {
  const now = new Date().toISOString();
  const idNumber = getTableIdNumberFragment(tableNumber);

  return {
    id: `${area.id}-${idNumber}`,
    name: buildTableName(area, tableNumber),
    room: area.name,
    roomId: area.id,
    status: "free",
    paymentStatus: "idle",
    covers: ((tableNumber - 1) % 6) + 1,
    guests: 0,
    customerName: "",
    companyName: "",
    operator: "Admin",
    operatorId: "admin",
    saleMode: area.type === "takeaway" ? "Take Away" : "Sala",
    servicePriceLabel: "2,50 EUR",
    discountType: "Nessuno",
    note: "",
    createdAt: now,
    updatedAt: now,
    createdByOperatorId: "admin",
    updatedByOperatorId: "admin",
    deletedByOperatorId: null,
    paidByOperatorId: null,
    approvedByOperatorId: null,
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

export function getDefaultHomeAreas() {
  const defaultHomeAreas = getDefaultHomeAreasConfig();
  return defaultHomeAreas.map((area) => ({ ...area }));
}

export function getHomeAreaSettings() {
  if (typeof window === "undefined") {
    return getDefaultHomeAreas();
  }

  const rawValue = window.localStorage.getItem(HOME_SETTINGS_STORAGE_KEY);

  if (!rawValue) {
    return getDefaultHomeAreas();
  }

  try {
    const parsedValue = JSON.parse(rawValue) as HomeAreaRecord[];
    return normalizeHomeAreas(Array.isArray(parsedValue) ? parsedValue : []);
  } catch {
    window.localStorage.removeItem(HOME_SETTINGS_STORAGE_KEY);
    return getDefaultHomeAreas();
  }
}

export function saveHomeAreaSettings(settings: HomeAreaRecord[]) {
  const previousSettings = getHomeAreaSettings();
  const normalizedSettings = normalizeHomeAreas(settings).map((area) => ({
    ...area,
    updated_at: new Date().toISOString(),
  }));

  if (typeof window !== "undefined") {
    window.localStorage.setItem(HOME_SETTINGS_STORAGE_KEY, JSON.stringify(normalizedSettings));
    window.dispatchEvent(new CustomEvent(HOME_SETTINGS_CHANGED_EVENT, { detail: normalizedSettings }));
  }

  recordAuditEvent({
    eventType: "CONFIG_HOME_CHANGED",
    entityType: "home-settings",
    entityId: "home-settings",
    previousValue: previousSettings,
    nextValue: normalizedSettings,
    origin: "configuration",
  });

  return normalizedSettings;
}

export async function fetchSharedHomeAreaSettings() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const response = await fetch(HOME_AREAS_API_ENDPOINT, {
      method: "GET",
      cache: "no-store",
      headers: {
        "Cache-Control": "no-store",
      },
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as { areas?: HomeAreaRecord[]; updatedAt?: string | null };
  } catch {
    return null;
  }
}

export async function hydrateHomeAreaSettingsFromServer() {
  const remoteState = await fetchSharedHomeAreaSettings();

  if (!Array.isArray(remoteState?.areas) || remoteState.areas.length === 0) {
    return getHomeAreaSettings();
  }

  return saveHomeAreaSettings(remoteState.areas);
}

export async function persistHomeAreaSettingsToServer(settings: HomeAreaRecord[]) {
  if (typeof window === "undefined") {
    return settings;
  }

  try {
    const response = await fetch(HOME_AREAS_API_ENDPOINT, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
      cache: "no-store",
      body: JSON.stringify({ areas: settings }),
    });

    if (!response.ok) {
      return settings;
    }

    const payload = (await response.json()) as { areas?: HomeAreaRecord[] };
    return Array.isArray(payload.areas) ? saveHomeAreaSettings(payload.areas) : settings;
  } catch {
    return settings;
  }
}

export function getActiveHomeAreas() {
  return getHomeAreaSettings().filter((area) => area.is_active);
}

export function buildRoomsFromHomeAreas(areas: HomeAreaRecord[]) {
  return areas
    .filter((area) => area.is_active)
    .map<PosRoom>((area) => ({
      roomId: area.id,
      roomName: area.name,
      roomType: area.type,
      tables: Array.from(
        { length: area.end_table_number - area.start_table_number + 1 },
        (_, index) => buildDefaultTable(area, area.start_table_number + index)
      ),
    }));
}

export function findGeneratedTableById(tableId: string, areas = getHomeAreaSettings()) {
  return buildRoomsFromHomeAreas(areas)
    .flatMap((room) => room.tables)
    .find((table) => table.id === tableId);
}

export function getInitialTablesStateFromHomeAreas(areas = getHomeAreaSettings()) {
  return areas.flatMap<PosTableState>((area) =>
    Array.from({ length: area.end_table_number - area.start_table_number + 1 }, (_, index) => {
      const table = buildDefaultTable(area, area.start_table_number + index);

      return {
        ...table,
        orders: [],
      };
    })
  );
}

export function createHomeAreaId(name: string) {
  const slug = slugifyHomeAreaName(name);
  return slug || `sala-${Date.now()}`;
}

export function countConfiguredTables(area: HomeAreaRecord) {
  return area.end_table_number - area.start_table_number + 1;
}

export function getHomeAreaTableNumbers(area: HomeAreaRecord) {
  return Array.from(
    { length: countConfiguredTables(area) },
    (_, index) => area.start_table_number + index
  );
}
