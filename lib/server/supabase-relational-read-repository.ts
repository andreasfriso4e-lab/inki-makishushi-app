import type { HomeAreaRecord } from "@/lib/home-settings";
import type { CompanyRecord, CustomerRecord, PosTableState } from "@/lib/pos-data";
import { getActiveRestaurantId } from "@/lib/restaurant-config";
import {
  createSupabaseRows,
  deleteSupabaseRows,
  isSupabaseConfigured,
  readSupabaseRows,
  updateSupabaseRows,
} from "@/lib/server/supabase-json-store";
import type { OperatorPermissions, PosOperatorRecord } from "@/types/operator";

type RoomRow = {
  id: string;
  legacy_room_id: string | null;
  code: string | null;
  name: string;
  room_type: "room" | "takeaway";
  sort_order: number | null;
  is_active: boolean;
  metadata: Record<string, unknown> | null;
  legacy_payload: Partial<HomeAreaRecord> | null;
  created_at: string;
  updated_at: string;
};

type TableRow = {
  id: string;
  room_id: string | null;
  legacy_table_id: string | null;
  code: string | null;
  name: string;
  seats: number | null;
  sort_order: number | null;
  status: "free" | "occupied" | "reserved" | "maintenance";
  current_cover_count: number | null;
  metadata: Record<string, unknown> | null;
  legacy_payload: Partial<PosTableState> | null;
  created_at: string;
  updated_at: string;
};

type OperatorRoleRow = {
  id: string;
  code: string | null;
  name: string;
  role_type: "admin" | "operator";
  permissions: Record<string, boolean> | null;
  legacy_payload: Partial<PosOperatorRecord> | null;
  created_at: string;
  updated_at: string;
};

type OperatorRow = {
  id: string;
  role_id: string | null;
  legacy_role_code: string | null;
  display_name: string;
  username: string | null;
  password_hash: string | null;
  is_active: boolean;
  metadata: Record<string, unknown> | null;
  legacy_payload: Partial<PosOperatorRecord> | null;
  created_at: string;
  updated_at: string;
};

type CompanyRow = {
  id: string;
  legacy_company_id: string | null;
  company_name: string;
  vat_number: string | null;
  tax_code: string | null;
  sdi_code: string | null;
  pec: string | null;
  address_street: string | null;
  address_number: string | null;
  zip_code: string | null;
  city: string | null;
  province: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  is_active: boolean;
  metadata: Record<string, unknown> | null;
  legacy_payload: Partial<CompanyRecord> | null;
  created_at: string;
  updated_at: string;
};

type CustomerRow = {
  id: string;
  legacy_customer_id: string | null;
  company_id: string | null;
  full_name: string;
  phone: string | null;
  email: string | null;
  tax_code: string | null;
  notes: string | null;
  is_active: boolean;
  metadata: Record<string, unknown> | null;
  legacy_payload: Partial<CustomerRecord> | null;
  created_at: string;
  updated_at: string;
};

function getRestaurantIdFilter() {
  return {
    column: "restaurant_id",
    value: getActiveRestaurantId(),
  } as const;
}

function toIntegerFromLabel(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const match = value.match(/\d+/);
  return match ? Number(match[0]) : null;
}

function normalizeRoomId(row: RoomRow) {
  return row.legacy_room_id?.trim() || row.code?.trim() || row.id;
}

function normalizeTableId(row: TableRow) {
  return row.legacy_table_id?.trim() || row.code?.trim() || row.id;
}

function normalizeOperatorId(row: OperatorRow, role?: OperatorRoleRow | null) {
  return (
    row.legacy_role_code?.trim() ||
    role?.code?.trim() ||
    row.legacy_payload?.id?.trim() ||
    row.username?.trim() ||
    row.id
  );
}

function buildEmptyOperatorPermissions(): OperatorPermissions {
  return {
    canManageCash: false,
    canOpenDrawer: false,
    canCloseCash: false,
    canAccessBasePrices: false,
    canApplyDiscounts: false,
    canApplySurcharges: false,
    canEditPaymentCalculator: false,
    canAccessPayments: false,
    canConfirmPayments: false,
    canUseCashPayments: false,
    canUseCardPayments: false,
    canUseOtherPaymentMethods: false,
    canOpenTables: false,
    canEditTables: false,
    canMergeTables: false,
    canSplitTables: false,
    canCloseTables: false,
    canInsertProducts: false,
    canEditOrders: false,
    canDeleteOrderLines: false,
    canSendOrders: false,
    canSaveOrderChanges: false,
    canAccessSettings: false,
    canManagePrinters: false,
    canManagePaymentsSettings: false,
    canManageVatSettings: false,
    canManageOrderSettings: false,
    canManageRoles: false,
    canAssignCustomer: false,
    canAssignCompany: false,
    canManageCustomersBilling: false,
  };
}

function buildHomeAreaRecord(
  row: RoomRow,
  relatedTables: TableRow[]
): HomeAreaRecord {
  const payload = row.legacy_payload ?? {};
  const numericTableLabels = relatedTables
    .map((table) => toIntegerFromLabel(table.name) ?? toIntegerFromLabel(table.legacy_payload?.name))
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
    .sort((left, right) => left - right);

  return {
    id: normalizeRoomId(row),
    name: payload.name?.trim() || row.name,
    type: payload.type ?? row.room_type,
    is_active: payload.is_active ?? row.is_active,
    start_table_number:
      payload.start_table_number ??
      numericTableLabels[0] ??
      1,
    end_table_number:
      payload.end_table_number ??
      numericTableLabels[numericTableLabels.length - 1] ??
      payload.start_table_number ??
      1,
    created_at: payload.created_at ?? row.created_at,
    updated_at: payload.updated_at ?? row.updated_at,
  };
}

function buildTableState(row: TableRow, room?: RoomRow | null): PosTableState {
  const payload = row.legacy_payload ?? {};
  const roomId = room ? normalizeRoomId(room) : payload.roomId || row.room_id || "";
  const roomName = room?.name ?? payload.room ?? "";

  return {
    id: normalizeTableId(row),
    name: payload.name?.trim() || row.name,
    room: roomName,
    roomId,
    status: row.status === "occupied" ? "occupied" : "free",
    paymentStatus: payload.paymentStatus ?? "idle",
    covers: payload.covers ?? row.seats ?? 0,
    guests: payload.guests ?? row.current_cover_count ?? 0,
    customerName: payload.customerName ?? "",
    companyName: payload.companyName ?? "",
    operator: payload.operator ?? "",
    saleMode: payload.saleMode ?? roomName,
    servicePriceLabel: payload.servicePriceLabel ?? "",
    discountType: payload.discountType ?? "",
    note: payload.note ?? "",
    prebillPrintedAt: payload.prebillPrintedAt ?? null,
    splitBillState: payload.splitBillState ?? null,
    operatorId: payload.operatorId ?? undefined,
    createdAt: payload.createdAt ?? row.created_at,
    updatedAt: payload.updatedAt ?? row.updated_at,
    createdByOperatorId: payload.createdByOperatorId ?? undefined,
    updatedByOperatorId: payload.updatedByOperatorId ?? undefined,
    deletedByOperatorId: payload.deletedByOperatorId ?? null,
    paidByOperatorId: payload.paidByOperatorId ?? null,
    approvedByOperatorId: payload.approvedByOperatorId ?? null,
    fidelityCustomerId: payload.fidelityCustomerId ?? null,
    fidelityCustomerLabel: payload.fidelityCustomerLabel ?? "",
    fidelityCardCode: payload.fidelityCardCode ?? "",
    fidelityQrCodeValue: payload.fidelityQrCodeValue ?? "",
    fidelityScannedBeforePayment: payload.fidelityScannedBeforePayment ?? false,
    pointsEligible: payload.pointsEligible ?? false,
    pointsProcessed: payload.pointsProcessed ?? false,
    pendingPoints: payload.pendingPoints ?? 0,
    lastFidelityScanAt: payload.lastFidelityScanAt ?? null,
    selectedRewardId: payload.selectedRewardId ?? null,
    selectedRewardName: payload.selectedRewardName ?? "",
    selectedRewardDiscount: payload.selectedRewardDiscount ?? 0,
    selectedRewardPoints: payload.selectedRewardPoints ?? 0,
    rewardRedemptionId: payload.rewardRedemptionId ?? null,
    earnedPoints: payload.earnedPoints ?? 0,
    finalPointsBalanceSnapshot: payload.finalPointsBalanceSnapshot ?? null,
    pointsBeforePayment: payload.pointsBeforePayment ?? null,
    orders: Array.isArray(payload.orders) ? payload.orders : [],
  };
}

function buildOperatorRecord(
  operator: OperatorRow,
  role?: OperatorRoleRow | null
): Partial<PosOperatorRecord> {
  const roleId = normalizeOperatorId(operator, role);
  const rolePayload = role?.legacy_payload ?? {};
  const operatorPayload = operator.legacy_payload ?? {};

  return {
    id: roleId as PosOperatorRecord["id"],
    internalKey:
      operatorPayload.internalKey?.trim() ||
      rolePayload.internalKey?.trim() ||
      roleId,
    username: operator.username?.trim() || operatorPayload.username?.trim() || roleId,
    roleType: role?.role_type ?? operatorPayload.roleType ?? "operator",
    role: role?.role_type ?? operatorPayload.role ?? "operator",
    defaultName:
      rolePayload.defaultName?.trim() ||
      role?.name?.trim() ||
      operator.display_name,
    displayName: operator.display_name.trim() || operatorPayload.displayName?.trim() || role?.name || roleId,
    enabled: operator.is_active,
    passwordHash: operator.password_hash ?? operatorPayload.passwordHash ?? "",
    order:
      operatorPayload.order ??
      rolePayload.order ??
      0,
    permissions: {
      ...buildEmptyOperatorPermissions(),
      ...(role?.permissions ?? {}),
      ...(rolePayload.permissions ?? {}),
      ...(operatorPayload.permissions ?? {}),
    } satisfies OperatorPermissions,
    createdAt: operatorPayload.createdAt ?? operator.created_at,
    updatedAt: operatorPayload.updatedAt ?? operator.updated_at,
  };
}

function buildCompanyRecord(row: CompanyRow): CompanyRecord {
  const payload = row.legacy_payload ?? {};
  const street = payload.addressStreet ?? row.address_street ?? "";
  const number = payload.addressNumber ?? row.address_number ?? "";

  return {
    id: row.legacy_company_id?.trim() || payload.id?.trim() || row.id,
    name: payload.name?.trim() || row.company_name,
    vatNumber: payload.vatNumber ?? row.vat_number ?? "",
    taxCode: payload.taxCode ?? row.tax_code ?? "",
    sdiCode: payload.sdiCode ?? row.sdi_code ?? "",
    pec: payload.pec ?? row.pec ?? "",
    address: payload.address ?? [street, number].filter(Boolean).join(" ").trim(),
    addressStreet: street || undefined,
    addressNumber: number || undefined,
    postalCode: payload.postalCode ?? row.zip_code ?? "",
    city: payload.city ?? row.city ?? "",
    province: payload.province ?? row.province ?? "",
    country: payload.country ?? row.country ?? "IT",
    contactPerson: payload.contactPerson ?? "",
    phone: payload.phone ?? row.phone ?? "",
    email: payload.email ?? row.email ?? "",
    note: payload.note ?? row.notes ?? "",
    isActive: payload.isActive ?? row.is_active,
    createdAt: payload.createdAt ?? row.created_at,
    updatedAt: payload.updatedAt ?? row.updated_at,
  };
}

function buildCustomerRecord(row: CustomerRow): CustomerRecord {
  const payload = row.legacy_payload ?? {};

  return {
    id: row.legacy_customer_id?.trim() || payload.id?.trim() || row.id,
    name: payload.name?.trim() || row.full_name,
    taxCode: payload.taxCode ?? row.tax_code ?? "",
    phone: payload.phone ?? row.phone ?? "",
    email: payload.email ?? row.email ?? "",
    note: payload.note ?? row.notes ?? "",
  };
}

export async function readRelationalRoomsAndTablesState() {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const [rooms, tables] = await Promise.all([
    readSupabaseRows<RoomRow>("rooms", {
      filters: [getRestaurantIdFilter()],
      orderBy: "sort_order",
    }),
    readSupabaseRows<TableRow>("tables", {
      filters: [getRestaurantIdFilter()],
      orderBy: "sort_order",
    }),
  ]);

  if (!rooms || !tables || (rooms.length === 0 && tables.length === 0)) {
    return null;
  }

  const roomsById = new Map(rooms.map((room) => [room.id, room]));
  const areas = rooms.map((room) =>
    buildHomeAreaRecord(
      room,
      tables.filter((table) => table.room_id === room.id)
    )
  );
  const tableStates = tables.map((table) => buildTableState(table, roomsById.get(table.room_id ?? "") ?? null));
  const latestUpdatedAt = [rooms, tables]
    .flat()
    .map((record) => record.updated_at)
    .sort()
    .at(-1) ?? new Date().toISOString();

  return {
    areas,
    tables: tableStates,
    updatedAt: latestUpdatedAt,
  };
}

export async function readRelationalOperatorRolesState() {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const [roles, operators] = await Promise.all([
    readSupabaseRows<OperatorRoleRow>("operator_roles", {
      filters: [getRestaurantIdFilter()],
      orderBy: "created_at",
    }),
    readSupabaseRows<OperatorRow>("operators", {
      filters: [getRestaurantIdFilter()],
      orderBy: "created_at",
    }),
  ]);

  if (!roles || !operators || (roles.length === 0 && operators.length === 0)) {
    return null;
  }

  const rolesById = new Map(roles.map((role) => [role.id, role]));
  const mappedRoles = operators.map((operator) =>
    buildOperatorRecord(operator, operator.role_id ? rolesById.get(operator.role_id) ?? null : null)
  );
  const latestUpdatedAt = [roles, operators]
    .flat()
    .map((record) => record.updated_at)
    .sort()
    .at(-1) ?? new Date().toISOString();

  return {
    roles: mappedRoles,
    updatedAt: latestUpdatedAt,
  };
}

export async function readRelationalBusinessDirectoryState() {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const [companies, customers] = await Promise.all([
    readSupabaseRows<CompanyRow>("companies", {
      filters: [getRestaurantIdFilter()],
      orderBy: "company_name",
    }),
    readSupabaseRows<CustomerRow>("customers", {
      filters: [getRestaurantIdFilter()],
      orderBy: "full_name",
    }),
  ]);

  if (!companies || !customers || (companies.length === 0 && customers.length === 0)) {
    return null;
  }

  const latestUpdatedAt = [companies, customers]
    .flat()
    .map((record) => record.updated_at)
    .sort()
    .at(-1) ?? new Date().toISOString();

  return {
    companies: companies.map(buildCompanyRecord),
    customers: customers.map(buildCustomerRecord),
    updatedAt: latestUpdatedAt,
  };
}

function nowIso() {
  return new Date().toISOString();
}

function buildRoomWriteRow(area: HomeAreaRecord) {
  return {
    restaurant_id: getActiveRestaurantId(),
    legacy_room_id: area.id,
    code: area.id,
    name: area.name,
    room_type: area.type,
    sort_order: area.type === "room" ? 0 : 1000,
    is_active: area.is_active,
    metadata: {
      start_table_number: area.start_table_number,
      end_table_number: area.end_table_number,
    },
    legacy_payload: area,
    created_at: area.created_at || nowIso(),
    updated_at: area.updated_at || nowIso(),
  };
}

function buildTableWriteRow(table: PosTableState) {
  return {
    restaurant_id: getActiveRestaurantId(),
    room_id: null,
    legacy_table_id: table.id,
    code: table.id,
    name: table.name,
    seats: table.covers,
    sort_order: toIntegerFromLabel(table.name) ?? 0,
    status: table.status,
    current_cover_count: table.guests,
    metadata: {
      room: table.room,
      room_id: table.roomId ?? null,
      payment_status: table.paymentStatus ?? "idle",
    },
    legacy_payload: table,
    created_at: table.createdAt || nowIso(),
    updated_at: table.updatedAt || nowIso(),
  };
}

function buildOperatorRoleWriteRow(role: PosOperatorRecord) {
  return {
    restaurant_id: getActiveRestaurantId(),
    code: role.id,
    name: role.displayName,
    role_type: role.roleType,
    description: role.defaultName,
    permissions: role.permissions,
    metadata: {
      order: role.order,
      enabled: role.enabled,
    },
    legacy_payload: role,
    created_at: role.createdAt || nowIso(),
    updated_at: role.updatedAt || nowIso(),
  };
}

function buildOperatorWriteRow(role: PosOperatorRecord) {
  return {
    restaurant_id: getActiveRestaurantId(),
    role_id: null,
    legacy_role_code: role.id,
    display_name: role.displayName,
    username: role.username || role.id,
    password_hash: role.passwordHash || "",
    is_active: role.enabled,
    metadata: {
      order: role.order,
      default_name: role.defaultName,
    },
    legacy_payload: role,
    created_at: role.createdAt || nowIso(),
    updated_at: role.updatedAt || nowIso(),
  };
}

function buildCompanyWriteRow(company: CompanyRecord) {
  return {
    restaurant_id: getActiveRestaurantId(),
    legacy_company_id: company.id,
    company_name: company.name,
    vat_number: company.vatNumber || null,
    tax_code: company.taxCode || null,
    sdi_code: company.sdiCode || null,
    pec: company.pec || null,
    address_street: company.addressStreet || null,
    address_number: company.addressNumber || null,
    zip_code: company.postalCode || null,
    city: company.city || null,
    province: company.province || null,
    country: company.country || "IT",
    phone: company.phone || null,
    email: company.email || null,
    notes: company.note || null,
    is_active: company.isActive ?? true,
    metadata: {
      address: company.address || "",
      contact_person: company.contactPerson || "",
    },
    legacy_payload: company,
    created_at: company.createdAt || nowIso(),
    updated_at: company.updatedAt || nowIso(),
  };
}

function buildCustomerWriteRow(customer: CustomerRecord) {
  return {
    restaurant_id: getActiveRestaurantId(),
    legacy_customer_id: customer.id,
    company_id: null,
    full_name: customer.name,
    phone: customer.phone || null,
    email: customer.email || null,
    tax_code: customer.taxCode || null,
    notes: customer.note || null,
    is_active: true,
    metadata: {},
    legacy_payload: customer,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
}

async function syncByLegacyId<TRow extends { id: string; updated_at: string | null }>(
  tableName: string,
  existingRows: TRow[],
  nextRows: Array<Record<string, unknown>>,
  legacyIdColumn: string
) {
  const restaurantId = getActiveRestaurantId();
  const existingByLegacyId = new Map(
    existingRows
      .map((row) => {
        const legacyId = (row as Record<string, unknown>)[legacyIdColumn];
        return typeof legacyId === "string" && legacyId.length > 0 ? [legacyId, row] : null;
      })
      .filter((entry): entry is [string, TRow] => Boolean(entry))
  );

  const nextLegacyIds = new Set<string>();

  for (const row of nextRows) {
    const legacyId = row[legacyIdColumn];
    if (typeof legacyId !== "string" || legacyId.length === 0) {
      continue;
    }
    nextLegacyIds.add(legacyId);
    const existing = existingByLegacyId.get(legacyId);
    if (existing) {
      await updateSupabaseRows<Record<string, unknown>>(tableName, row, [
        { column: "restaurant_id", value: restaurantId },
        { column: "id", value: existing.id },
      ]);
    } else {
      await createSupabaseRows<Record<string, unknown>>(tableName, [row]);
    }
  }

  const idsToDelete = existingRows
    .filter((row) => {
      const legacyId = (row as Record<string, unknown>)[legacyIdColumn];
      return typeof legacyId === "string" && legacyId.length > 0 && !nextLegacyIds.has(legacyId);
    })
    .map((row) => row.id);

  if (idsToDelete.length > 0) {
    await deleteSupabaseRows(tableName, [
      { column: "restaurant_id", value: restaurantId },
      { column: "id", operator: "in", value: idsToDelete },
    ]);
  }
}

export async function writeRelationalRoomsState(areas: HomeAreaRecord[]) {
  if (!isSupabaseConfigured()) {
    return;
  }

  const existingRows =
    (await readSupabaseRows<RoomRow>("rooms", {
      filters: [getRestaurantIdFilter()],
    })) ?? [];
  await syncByLegacyId(
    "rooms",
    existingRows,
    areas.map(buildRoomWriteRow),
    "legacy_room_id"
  );
}

export async function writeRelationalTablesState(tables: PosTableState[]) {
  if (!isSupabaseConfigured()) {
    return;
  }

  const [existingTables, existingRooms] = await Promise.all([
    readSupabaseRows<TableRow>("tables", {
      filters: [getRestaurantIdFilter()],
    }),
    readSupabaseRows<RoomRow>("rooms", {
      filters: [getRestaurantIdFilter()],
    }),
  ]);
  const roomIdByLegacyId = new Map(
    (existingRooms ?? []).map((room) => [normalizeRoomId(room), room.id])
  );
  const nextRows = tables.map((table) => ({
    ...buildTableWriteRow(table),
    room_id: table.roomId ? roomIdByLegacyId.get(table.roomId) ?? null : null,
  }));

  await syncByLegacyId(
    "tables",
    existingTables ?? [],
    nextRows,
    "legacy_table_id"
  );
}

export async function writeRelationalOperatorRolesState(roles: PosOperatorRecord[]) {
  if (!isSupabaseConfigured()) {
    return;
  }

  const [existingRoleRows, existingOperatorRows] = await Promise.all([
    readSupabaseRows<OperatorRoleRow>("operator_roles", {
      filters: [getRestaurantIdFilter()],
    }),
    readSupabaseRows<OperatorRow>("operators", {
      filters: [getRestaurantIdFilter()],
    }),
  ]);

  await syncByLegacyId(
    "operator_roles",
    existingRoleRows ?? [],
    roles.map(buildOperatorRoleWriteRow),
    "code"
  );

  const refreshedRoleRows =
    (await readSupabaseRows<OperatorRoleRow>("operator_roles", {
      filters: [getRestaurantIdFilter()],
    })) ?? [];
  const roleIdByCode = new Map(refreshedRoleRows.map((role) => [role.code ?? role.id, role.id]));
  const nextOperatorRows = roles.map((role) => ({
    ...buildOperatorWriteRow(role),
    role_id: roleIdByCode.get(role.id) ?? null,
  }));

  await syncByLegacyId(
    "operators",
    existingOperatorRows ?? [],
    nextOperatorRows,
    "legacy_role_code"
  );
}

export async function writeRelationalBusinessDirectoryState(
  customers: CustomerRecord[],
  companies: CompanyRecord[]
) {
  if (!isSupabaseConfigured()) {
    return;
  }

  const [existingCompanies, existingCustomers] = await Promise.all([
    readSupabaseRows<CompanyRow>("companies", {
      filters: [getRestaurantIdFilter()],
    }),
    readSupabaseRows<CustomerRow>("customers", {
      filters: [getRestaurantIdFilter()],
    }),
  ]);

  await syncByLegacyId(
    "companies",
    existingCompanies ?? [],
    companies.map(buildCompanyWriteRow),
    "legacy_company_id"
  );

  await syncByLegacyId(
    "customers",
    existingCustomers ?? [],
    customers.map(buildCustomerWriteRow),
    "legacy_customer_id"
  );
}
