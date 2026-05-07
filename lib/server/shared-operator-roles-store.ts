import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { OperatorPermissions, OperatorRoleId, PosOperatorRecord } from "@/types/operator";
import {
  isSupabaseConfigured,
  readSupabaseJsonState,
  writeSupabaseJsonState,
} from "@/lib/server/supabase-json-store";
import {
  readRelationalOperatorRolesState,
  writeRelationalOperatorRolesState,
} from "@/lib/server/supabase-relational-read-repository";
import {
  allowsFallbackRead,
  prefersSupabaseRead,
} from "@/lib/server/supabase-read-mode";

export type SharedOperatorRolesState = {
  roles: PosOperatorRecord[];
  updatedAt: string;
};

const DATA_DIR =
  process.env.POS_RUNTIME_DATA_DIR?.trim() ||
  path.join(os.tmpdir(), "inki-pos-runtime");
const OPERATOR_ROLES_FILE = path.join(DATA_DIR, "shared-operator-roles.json");
const SUPABASE_OPERATOR_ROLES_TABLE = "pos_operator_roles_state";
let inMemorySharedOperatorRolesState: SharedOperatorRolesState | null = null;

function getNowIso() {
  return new Date().toISOString();
}

function buildFullPermissions(): OperatorPermissions {
  return {
    canManageCash: true,
    canOpenDrawer: true,
    canCloseCash: true,
    canAccessBasePrices: true,
    canApplyDiscounts: true,
    canApplySurcharges: true,
    canEditPaymentCalculator: true,
    canAccessPayments: true,
    canConfirmPayments: true,
    canUseCashPayments: true,
    canUseCardPayments: true,
    canUseOtherPaymentMethods: true,
    canOpenTables: true,
    canEditTables: true,
    canMergeTables: true,
    canSplitTables: true,
    canCloseTables: true,
    canInsertProducts: true,
    canEditOrders: true,
    canDeleteOrderLines: true,
    canSendOrders: true,
    canSaveOrderChanges: true,
    canAccessSettings: true,
    canManagePrinters: true,
    canManagePaymentsSettings: true,
    canManageVatSettings: true,
    canManageOrderSettings: true,
    canManageRoles: true,
    canAssignCustomer: true,
    canAssignCompany: true,
    canManageCustomersBilling: true,
  };
}

function buildOperator1Permissions(): OperatorPermissions {
  return {
    ...buildFullPermissions(),
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
    canMergeTables: false,
    canSplitTables: false,
    canCloseTables: false,
    canAccessSettings: false,
    canManagePrinters: false,
    canManagePaymentsSettings: false,
    canManageVatSettings: false,
    canManageOrderSettings: false,
    canManageRoles: false,
    canManageCustomersBilling: false,
  };
}

function buildOperator2Permissions(): OperatorPermissions {
  return {
    ...buildFullPermissions(),
    canOpenTables: true,
    canEditTables: true,
    canMergeTables: false,
    canSplitTables: false,
    canCloseTables: true,
    canInsertProducts: true,
    canEditOrders: true,
    canDeleteOrderLines: true,
    canSendOrders: true,
    canSaveOrderChanges: true,
    canManageCash: true,
    canOpenDrawer: true,
    canCloseCash: false,
    canAccessBasePrices: false,
    canApplyDiscounts: true,
    canApplySurcharges: true,
    canEditPaymentCalculator: true,
    canAccessPayments: true,
    canConfirmPayments: true,
    canUseCashPayments: true,
    canUseCardPayments: true,
    canUseOtherPaymentMethods: true,
    canAccessSettings: false,
    canManagePrinters: false,
    canManagePaymentsSettings: false,
    canManageVatSettings: false,
    canManageOrderSettings: false,
    canManageRoles: false,
  };
}

function buildOperator3Permissions(): OperatorPermissions {
  return {
    ...buildFullPermissions(),
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
    canMergeTables: false,
    canSplitTables: false,
    canCloseTables: false,
    canDeleteOrderLines: false,
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

function defaultRoleRecord(
  id: OperatorRoleId,
  displayName: string,
  roleType: "admin" | "operator",
  permissions: OperatorPermissions,
  enabled: boolean,
  order: number
): PosOperatorRecord {
  const now = getNowIso();

  return {
    id,
    roleType,
    role: roleType,
    internalKey: id,
    username: id,
    defaultName: displayName,
    displayName,
    enabled,
    passwordHash: "",
    order,
    permissions,
    createdAt: now,
    updatedAt: now,
  };
}

const defaultOperatorRoles: PosOperatorRecord[] = [
  defaultRoleRecord("admin", "Admin", "admin", buildFullPermissions(), true, 0),
  defaultRoleRecord("operator1", "Operatore 1", "operator", buildOperator1Permissions(), false, 1),
  defaultRoleRecord("operator2", "Operatore 2", "operator", buildOperator2Permissions(), false, 2),
  defaultRoleRecord("operator3", "Operatore 3", "operator", buildOperator3Permissions(), false, 3),
];

function normalizeRoles(roles: Partial<PosOperatorRecord>[]) {
  const defaultsById = new Map(defaultOperatorRoles.map((role) => [role.id, role]));
  const nextRoles = roles
    .filter((role): role is Partial<PosOperatorRecord> & { id: OperatorRoleId } =>
      typeof role.id === "string" && defaultsById.has(role.id as OperatorRoleId)
    )
    .map((role) => {
      const fallbackRole = defaultsById.get(role.id)!;
      return {
        ...fallbackRole,
        ...role,
        role: role.role ?? fallbackRole.role,
        internalKey: role.internalKey?.trim() || fallbackRole.internalKey,
        username: role.username?.trim() || fallbackRole.username,
        displayName: role.displayName?.trim() || fallbackRole.defaultName,
        enabled: role.id === "admin" ? true : role.enabled ?? fallbackRole.enabled,
        passwordHash: role.passwordHash ?? fallbackRole.passwordHash,
        permissions: {
          ...fallbackRole.permissions,
          ...(role.permissions ?? {}),
        },
        createdAt: role.createdAt ?? fallbackRole.createdAt,
        updatedAt: role.updatedAt ?? getNowIso(),
      };
    });

  const existingIds = new Set(nextRoles.map((role) => role.id));
  const mergedRoles = [
    ...nextRoles,
    ...defaultOperatorRoles.filter((role) => !existingIds.has(role.id)),
  ];

  return mergedRoles
    .sort((left, right) => left.order - right.order)
    .map((role, index) => ({
      ...role,
      order: index,
      enabled: role.id === "admin" ? true : role.enabled,
      displayName: role.displayName.trim() || role.defaultName,
      updatedAt: role.updatedAt || getNowIso(),
    }));
}

function buildInitialSharedState(): SharedOperatorRolesState {
  return {
    roles: normalizeRoles(defaultOperatorRoles),
    updatedAt: getNowIso(),
  };
}

export function getDefaultSharedOperatorRolesState(): SharedOperatorRolesState {
  return buildInitialSharedState();
}

async function ensureDataDir() {
  await mkdir(DATA_DIR, { recursive: true });
}

export async function readFallbackSharedOperatorRolesState(): Promise<SharedOperatorRolesState | null> {
  await ensureDataDir();

  try {
    const rawValue = await readFile(OPERATOR_ROLES_FILE, "utf8");
    const parsedValue = JSON.parse(rawValue) as Partial<SharedOperatorRolesState>;

    if (!Array.isArray(parsedValue.roles)) {
      throw new Error("Invalid operator roles payload");
    }

    return {
      roles: normalizeRoles(parsedValue.roles),
      updatedAt:
        typeof parsedValue.updatedAt === "string" && parsedValue.updatedAt.length > 0
          ? parsedValue.updatedAt
          : getNowIso(),
    };
  } catch {
    return null;
  }
}

export async function readSharedOperatorRolesState(): Promise<SharedOperatorRolesState> {
  if (inMemorySharedOperatorRolesState) {
    return inMemorySharedOperatorRolesState;
  }

  if (isSupabaseConfigured() && (prefersSupabaseRead("operators") || prefersSupabaseRead("operator-roles"))) {
    try {
      const relationalState = await readRelationalOperatorRolesState();

      if (Array.isArray(relationalState?.roles) && relationalState.roles.length > 0) {
        inMemorySharedOperatorRolesState = {
          roles: normalizeRoles(relationalState.roles),
          updatedAt: relationalState.updatedAt,
        };
        console.info("[shared-operator-roles-store] read source=supabase");
        return inMemorySharedOperatorRolesState;
      }

      const remoteState = await readSupabaseJsonState<{ roles?: Partial<PosOperatorRecord>[] }>(
        SUPABASE_OPERATOR_ROLES_TABLE
      );

      if (Array.isArray(remoteState?.payload?.roles)) {
        inMemorySharedOperatorRolesState = {
          roles: normalizeRoles(remoteState.payload.roles),
          updatedAt: remoteState.updatedAt,
        };
        console.info("[shared-operator-roles-store] read source=fallback-blob");
        return inMemorySharedOperatorRolesState;
      }
    } catch {
      // Fallback locale/file: non bloccare login operatori.
    }
  }

  if (!allowsFallbackRead("operators") || !allowsFallbackRead("operator-roles")) {
    const initialState = buildInitialSharedState();
    inMemorySharedOperatorRolesState = initialState;
    console.info("[shared-operator-roles-store] read source=default");
    return initialState;
  }

  const fallbackState = await readFallbackSharedOperatorRolesState();
  if (fallbackState) {
    inMemorySharedOperatorRolesState = fallbackState;
    console.info("[shared-operator-roles-store] read source=fallback-file");
    return inMemorySharedOperatorRolesState;
  }

  const initialState = buildInitialSharedState();
  inMemorySharedOperatorRolesState = initialState;
  console.info("[shared-operator-roles-store] read source=default");
  return initialState;
}

export async function writeSharedOperatorRolesState(
  roles: PosOperatorRecord[]
): Promise<SharedOperatorRolesState> {
  const normalizedRoles = normalizeRoles(roles);
  let nextState: SharedOperatorRolesState | null = null;

  if (isSupabaseConfigured()) {
    try {
      const remoteState = await writeSupabaseJsonState(SUPABASE_OPERATOR_ROLES_TABLE, {
        roles: normalizedRoles,
      });

      if (Array.isArray(remoteState?.payload?.roles)) {
        nextState = {
          roles: normalizeRoles(remoteState.payload.roles),
          updatedAt: remoteState.updatedAt,
        };
      }
    } catch (error) {
      console.error("[shared-operator-roles-store] Blob Supabase write failed", error);
    }
  }

  if (!nextState) {
    await ensureDataDir();

    nextState = {
      roles: normalizedRoles,
      updatedAt: getNowIso(),
    };

    await writeFile(OPERATOR_ROLES_FILE, JSON.stringify(nextState, null, 2), "utf8");
  }

  if (isSupabaseConfigured()) {
    try {
      await writeRelationalOperatorRolesState(nextState.roles);
    } catch (error) {
      console.error("[shared-operator-roles-store] Relational Supabase write failed", error);
    }
  }

  inMemorySharedOperatorRolesState = nextState;

  return nextState;
}
