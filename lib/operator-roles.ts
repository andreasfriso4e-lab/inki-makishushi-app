"use client";

import { getRestaurantStorageKey } from "@/lib/restaurant-storage";
import type { OperatorPermissions, OperatorRoleId, PosOperatorRecord } from "@/types/operator";

export type OperatorRoleConfig = PosOperatorRecord;
export type { OperatorPermissions, OperatorRoleId };
const OPERATOR_ROLES_REQUEST_TIMEOUT_MS = 4000;

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

const OPERATOR_ROLES_STORAGE_KEY = getRestaurantStorageKey("pos-operator-roles");
const OPERATOR_ROLES_LAST_HYDRATION_STORAGE_KEY = getRestaurantStorageKey(
  "pos-operator-roles-last-hydration"
);
export const OPERATOR_ROLES_CHANGED_EVENT = "pos-operator-roles-changed";
const OPERATOR_ROLES_API_PATH = "/api/operator-roles";
const OPERATOR_ROLES_HYDRATE_MIN_INTERVAL_MS = 30000;
const DISABLE_AUTOMATIC_OPERATOR_ROLES_HYDRATION = false;
let operatorRolesHydrationPromise: Promise<OperatorRoleConfig[]> | null = null;
let lastOperatorRolesHydrationAt = 0;

function rightRotate(value: number, amount: number) {
  return (value >>> amount) | (value << (32 - amount));
}

function sha256Fallback(message: string) {
  const bytes = new TextEncoder().encode(message);
  const bitLength = bytes.length * 8;
  const totalLength = (((bytes.length + 9 + 63) >> 6) << 6);
  const padded = new Uint8Array(totalLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;

  const view = new DataView(padded.buffer);
  view.setUint32(totalLength - 4, bitLength >>> 0, false);
  view.setUint32(totalLength - 8, Math.floor(bitLength / 0x100000000), false);

  const initialHash = new Uint32Array([
    0x6a09e667,
    0xbb67ae85,
    0x3c6ef372,
    0xa54ff53a,
    0x510e527f,
    0x9b05688c,
    0x1f83d9ab,
    0x5be0cd19,
  ]);

  const roundConstants = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4,
    0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe,
    0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f,
    0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
    0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
    0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
    0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116,
    0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
    0xc67178f2,
  ]);

  const schedule = new Uint32Array(64);
  const hash = new Uint32Array(initialHash);

  for (let chunkOffset = 0; chunkOffset < padded.length; chunkOffset += 64) {
    for (let index = 0; index < 16; index += 1) {
      schedule[index] = view.getUint32(chunkOffset + index * 4, false);
    }

    for (let index = 16; index < 64; index += 1) {
      const sigma0 =
        rightRotate(schedule[index - 15], 7) ^
        rightRotate(schedule[index - 15], 18) ^
        (schedule[index - 15] >>> 3);
      const sigma1 =
        rightRotate(schedule[index - 2], 17) ^
        rightRotate(schedule[index - 2], 19) ^
        (schedule[index - 2] >>> 10);
      schedule[index] =
        (((schedule[index - 16] + sigma0) | 0) + ((schedule[index - 7] + sigma1) | 0)) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = hash;

    for (let index = 0; index < 64; index += 1) {
      const sum1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (((((h + sum1) | 0) + ch) | 0) + roundConstants[index] + schedule[index]) >>> 0;
      const sum0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (sum0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    hash[0] = (hash[0] + a) >>> 0;
    hash[1] = (hash[1] + b) >>> 0;
    hash[2] = (hash[2] + c) >>> 0;
    hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0;
    hash[5] = (hash[5] + f) >>> 0;
    hash[6] = (hash[6] + g) >>> 0;
    hash[7] = (hash[7] + h) >>> 0;
  }

  return Array.from(hash)
    .map((value) => value.toString(16).padStart(8, "0"))
    .join("");
}

async function fetchOperatorRolesWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit
) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), OPERATOR_ROLES_REQUEST_TIMEOUT_MS);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

const defaultOperatorRoles: OperatorRoleConfig[] = [
  {
    id: "admin",
    roleType: "admin",
    role: "admin",
    internalKey: "admin",
    username: "admin",
    defaultName: "Admin",
    displayName: "Admin",
    enabled: true,
    passwordHash: "",
    order: 0,
    permissions: buildFullPermissions(),
    createdAt: getNowIso(),
    updatedAt: getNowIso(),
  },
  {
    id: "operator1",
    roleType: "operator",
    role: "operator",
    internalKey: "operator1",
    username: "operator1",
    defaultName: "Operatore 1",
    displayName: "Operatore 1",
    enabled: false,
    passwordHash: "",
    order: 1,
    permissions: buildOperator1Permissions(),
    createdAt: getNowIso(),
    updatedAt: getNowIso(),
  },
  {
    id: "operator2",
    roleType: "operator",
    role: "operator",
    internalKey: "operator2",
    username: "operator2",
    defaultName: "Operatore 2",
    displayName: "Operatore 2",
    enabled: false,
    passwordHash: "",
    order: 2,
    permissions: buildOperator2Permissions(),
    createdAt: getNowIso(),
    updatedAt: getNowIso(),
  },
  {
    id: "operator3",
    roleType: "operator",
    role: "operator",
    internalKey: "operator3",
    username: "operator3",
    defaultName: "Operatore 3",
    displayName: "Operatore 3",
    enabled: false,
    passwordHash: "",
    order: 3,
    permissions: buildOperator3Permissions(),
    createdAt: getNowIso(),
    updatedAt: getNowIso(),
  },
];

function normalizeRoles(roles: Partial<OperatorRoleConfig>[]) {
  const defaultsById = new Map(defaultOperatorRoles.map((role) => [role.id, role]));
  const nextRoles = roles
    .filter((role): role is Partial<OperatorRoleConfig> & { id: OperatorRoleId } =>
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

function dispatchRolesChangedEvent() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(OPERATOR_ROLES_CHANGED_EVENT));
  }
}

function cacheOperatorRolesLocally(roles: OperatorRoleConfig[], shouldDispatch = true) {
  const normalized = normalizeRoles(roles);

  if (typeof window !== "undefined") {
    window.localStorage.setItem(OPERATOR_ROLES_STORAGE_KEY, JSON.stringify(normalized));
  }

  if (shouldDispatch) {
    dispatchRolesChangedEvent();
  }

  return normalized;
}

export function getDefaultOperatorRoles() {
  return defaultOperatorRoles.map((role) => ({ ...role }));
}

export function getOperatorRoles() {
  if (typeof window === "undefined") {
    return getDefaultOperatorRoles();
  }

  const rawValue = window.localStorage.getItem(OPERATOR_ROLES_STORAGE_KEY);

  if (!rawValue) {
    const defaults = getDefaultOperatorRoles();
    window.localStorage.setItem(OPERATOR_ROLES_STORAGE_KEY, JSON.stringify(defaults));
    return defaults;
  }

  try {
    const parsedValue = JSON.parse(rawValue) as Partial<OperatorRoleConfig>[];
    const normalized = normalizeRoles(Array.isArray(parsedValue) ? parsedValue : []);
    window.localStorage.setItem(OPERATOR_ROLES_STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
  } catch {
    const defaults = getDefaultOperatorRoles();
    window.localStorage.setItem(OPERATOR_ROLES_STORAGE_KEY, JSON.stringify(defaults));
    return defaults;
  }
}

function readLastHydrationAt() {
  if (typeof window === "undefined") {
    return 0;
  }

  const rawValue = window.sessionStorage.getItem(OPERATOR_ROLES_LAST_HYDRATION_STORAGE_KEY);
  const parsedValue = rawValue ? Number(rawValue) : 0;
  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

function writeLastHydrationAt(value: number) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(OPERATOR_ROLES_LAST_HYDRATION_STORAGE_KEY, String(value));
}

export function saveOperatorRoles(roles: OperatorRoleConfig[]) {
  return cacheOperatorRolesLocally(roles);
}

export function getActiveOperatorRoles() {
  return getOperatorRoles().filter((role) => role.enabled || role.id === "admin");
}

export function getOperatorRoleById(roleId: OperatorRoleId) {
  return getOperatorRoles().find((role) => role.id === roleId) ?? null;
}

export async function hydrateOperatorRolesFromServer(options?: { force?: boolean }) {
  if (typeof window === "undefined") {
    return getDefaultOperatorRoles();
  }

  if (DISABLE_AUTOMATIC_OPERATOR_ROLES_HYDRATION) {
    return getOperatorRoles();
  }

  if (operatorRolesHydrationPromise) {
    return operatorRolesHydrationPromise;
  }

  const lastHydrationAt = Math.max(lastOperatorRolesHydrationAt, readLastHydrationAt());

  if (
    !options?.force &&
    Date.now() - lastHydrationAt < OPERATOR_ROLES_HYDRATE_MIN_INTERVAL_MS
  ) {
    return getOperatorRoles();
  }

  operatorRolesHydrationPromise = (async () => {
    const response = await fetchOperatorRolesWithTimeout(OPERATOR_ROLES_API_PATH, {
      method: "GET",
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Impossibile leggere operatori condivisi (${response.status})`);
    }

    const payload = (await response.json()) as { roles?: Partial<OperatorRoleConfig>[] };
    const roles = Array.isArray(payload.roles)
      ? normalizeRoles(payload.roles)
      : getDefaultOperatorRoles();
    lastOperatorRolesHydrationAt = Date.now();
    writeLastHydrationAt(lastOperatorRolesHydrationAt);
    return cacheOperatorRolesLocally(roles, false);
  })();

  try {
    return await operatorRolesHydrationPromise;
  } finally {
    operatorRolesHydrationPromise = null;
  }
}

export async function persistOperatorRolesToServer(roles: OperatorRoleConfig[]) {
  const normalized = normalizeRoles(roles);

  if (typeof window === "undefined") {
    return normalized;
  }

  const response = await fetchOperatorRolesWithTimeout(OPERATOR_ROLES_API_PATH, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ roles: normalized }),
  });

  if (!response.ok) {
    throw new Error(`Impossibile salvare operatori condivisi (${response.status})`);
  }

  const payload = (await response.json()) as { roles?: Partial<OperatorRoleConfig>[] };
  const savedRoles = Array.isArray(payload.roles) ? normalizeRoles(payload.roles) : normalized;
  lastOperatorRolesHydrationAt = Date.now();
  writeLastHydrationAt(lastOperatorRolesHydrationAt);
  return cacheOperatorRolesLocally(savedRoles);
}

export async function hashOperatorPassword(password: string) {
  if (typeof window !== "undefined" && window.crypto?.subtle) {
    const buffer = await window.crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(password)
    );

    return Array.from(new Uint8Array(buffer))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  return sha256Fallback(password);
}

export async function verifyOperatorPassword(
  password: string,
  passwordHash: string
) {
  if (!passwordHash) {
    return false;
  }

  const hashedPassword = await hashOperatorPassword(password);
  return hashedPassword === passwordHash;
}
