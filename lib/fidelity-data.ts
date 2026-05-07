"use client";

import { recordAuditEvent } from "@/services/audit-log-service";
import { createStableId } from "@/utils/id";

export const FIDELITY_DATA_CHANGED_EVENT = "pos-fidelity-data-changed";

const FIDELITY_CUSTOMERS_STORAGE_KEY = "pos-fidelity-customers";
const FIDELITY_SCAN_LOGS_STORAGE_KEY = "pos-fidelity-scan-logs";
const FIDELITY_REDEMPTIONS_STORAGE_KEY = "pos-fidelity-redemptions";
const FIDELITY_POINTS_MOVEMENTS_STORAGE_KEY = "pos-fidelity-points-movements";
const FIDELITY_STATE_API_ENDPOINT = "/api/fidelity-state";

export const EURO_PER_POINT = 2;

export type FidelityCustomer = {
  id: string;
  firstName: string;
  lastName: string;
  phone?: string;
  email?: string;
  birthDate?: string;
  notes?: string;
  isActive: boolean;
  marketingConsent: boolean;
  cardCode?: string;
  qrCodeValue?: string;
  currentPoints: number;
  pendingPoints: number;
  totalPointsLoaded: number;
  lastScanAt?: string;
  lastTransactionId?: string;
  createdAt: string;
  updatedAt: string;
};

export type FidelityReward = {
  id: string;
  name: string;
  pointsRequired: number;
  discountAmount: number;
  isActive: boolean;
  displayOrder: number;
};

export type FidelityScanType = "barcode" | "qr";

export type FidelityScanSource =
  | "fidelity_section"
  | "payment_screen"
  | "customer_form"
  | "payment_method";

export type FidelityScanLog = {
  id: string;
  customerId?: string;
  scanType: FidelityScanType;
  codeValue: string;
  sourceScreen: FidelityScanSource;
  tableId?: string;
  orderId?: string;
  operatorId?: string;
  createdAt: string;
};

export type RewardRedemptionStatus = "pending" | "confirmed" | "cancelled";

export type RewardRedemption = {
  id: string;
  customerId: string;
  orderId?: string;
  paymentId?: string;
  rewardId: string;
  rewardName: string;
  pointsUsed: number;
  discountApplied: number;
  status: RewardRedemptionStatus;
  operatorId?: string;
  createdAt: string;
  confirmedAt?: string;
};

export type FidelityPointsMovementType = "earn" | "redeem" | "refund" | "cancel";

export type FidelityPointsMovement = {
  id: string;
  customerId: string;
  orderId?: string;
  paymentId?: string;
  type: FidelityPointsMovementType;
  points: number;
  euroAmount: number;
  description: string;
  operatorId?: string;
  createdAt: string;
};

export const fidelityRewards: FidelityReward[] = [
  {
    id: "reward-10",
    name: "Premio 10€",
    pointsRequired: 200,
    discountAmount: 10,
    isActive: true,
    displayOrder: 0,
  },
  {
    id: "reward-25",
    name: "Premio 25€",
    pointsRequired: 400,
    discountAmount: 25,
    isActive: true,
    displayOrder: 1,
  },
  {
    id: "reward-50",
    name: "Premio 50€",
    pointsRequired: 600,
    discountAmount: 50,
    isActive: true,
    displayOrder: 2,
  },
];

function getNowIso() {
  return new Date().toISOString();
}

function dispatchDataChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(FIDELITY_DATA_CHANGED_EVENT));
  }
}

function mergeById<T extends { id: string }>(primary: T[], secondary: T[]) {
  const merged = new Map<string, T>();

  for (const entry of secondary) {
    merged.set(entry.id, entry);
  }

  for (const entry of primary) {
    merged.set(entry.id, entry);
  }

  return [...merged.values()];
}

function normalizeSearchValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function readStoredRecords<T>(storageKey: string, fallback: T[]): T[] {
  if (typeof window === "undefined") {
    return fallback;
  }

  const rawValue = window.localStorage.getItem(storageKey);

  if (!rawValue) {
    return fallback;
  }

  try {
    const parsedValue = JSON.parse(rawValue) as T[];
    return Array.isArray(parsedValue) ? parsedValue : fallback;
  } catch {
    window.localStorage.removeItem(storageKey);
    return fallback;
  }
}

function writeStoredRecords<T>(
  storageKey: string,
  records: T[],
  options?: { dispatch?: boolean }
) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(storageKey, JSON.stringify(records));
  }

  if (options?.dispatch !== false) {
    dispatchDataChanged();
  }

  return records;
}

function getLocalFidelityStateSnapshot() {
  return {
    customers: readStoredRecords<FidelityCustomer>(FIDELITY_CUSTOMERS_STORAGE_KEY, []),
    rewards: getFidelityRewards(),
    pointsMovements: readStoredRecords<FidelityPointsMovement>(
      FIDELITY_POINTS_MOVEMENTS_STORAGE_KEY,
      []
    ),
    rewardRedemptions: readStoredRecords<RewardRedemption>(
      FIDELITY_REDEMPTIONS_STORAGE_KEY,
      []
    ),
  };
}

async function persistFidelityStateToServer() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const response = await fetch(FIDELITY_STATE_API_ENDPOINT, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
      cache: "no-store",
      body: JSON.stringify(getLocalFidelityStateSnapshot()),
    });

    if (!response.ok) {
      return null;
    }

    return response.json();
  } catch {
    return null;
  }
}

export async function hydrateFidelityStateFromServer() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const response = await fetch(FIDELITY_STATE_API_ENDPOINT, {
      method: "GET",
      cache: "no-store",
      headers: {
        "Cache-Control": "no-store",
      },
    });

    if (!response.ok) {
      return null;
    }

    const remoteState = (await response.json()) as Partial<ReturnType<typeof getLocalFidelityStateSnapshot>>;

    const mergedCustomers = mergeById(
      Array.isArray(remoteState.customers) ? remoteState.customers : [],
      getFidelityCustomers()
    ).sort((left, right) => {
      const lastNameComparison = left.lastName.localeCompare(right.lastName, "it");
      if (lastNameComparison !== 0) {
        return lastNameComparison;
      }

      return left.firstName.localeCompare(right.firstName, "it");
    });
    const mergedRewards = mergeById(
      Array.isArray(remoteState.rewards) ? remoteState.rewards : [],
      [...fidelityRewards]
    ).sort((left, right) => left.displayOrder - right.displayOrder);
    const mergedPointsMovements = mergeById(
      Array.isArray(remoteState.pointsMovements) ? remoteState.pointsMovements : [],
      getFidelityPointsMovements()
    ).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const mergedRewardRedemptions = mergeById(
      Array.isArray(remoteState.rewardRedemptions) ? remoteState.rewardRedemptions : [],
      getFidelityRewardRedemptions()
    ).sort((left, right) => right.createdAt.localeCompare(left.createdAt));

    writeStoredRecords(FIDELITY_CUSTOMERS_STORAGE_KEY, mergedCustomers, { dispatch: false });
    writeStoredRecords(FIDELITY_REDEMPTIONS_STORAGE_KEY, mergedRewardRedemptions, {
      dispatch: false,
    });
    writeStoredRecords(FIDELITY_POINTS_MOVEMENTS_STORAGE_KEY, mergedPointsMovements, {
      dispatch: false,
    });

    fidelityRewards.splice(0, fidelityRewards.length, ...mergedRewards);
    dispatchDataChanged();

    return {
      customers: mergedCustomers,
      rewards: mergedRewards,
      pointsMovements: mergedPointsMovements,
      rewardRedemptions: mergedRewardRedemptions,
    };
  } catch {
    return null;
  }
}

export function createEmptyFidelityCustomer(): FidelityCustomer {
  const now = getNowIso();

  return {
    id: createStableId("fidelity-customer"),
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    birthDate: "",
    notes: "",
    isActive: true,
    marketingConsent: false,
    cardCode: "",
    qrCodeValue: "",
    currentPoints: 0,
    pendingPoints: 0,
    totalPointsLoaded: 0,
    lastScanAt: "",
    lastTransactionId: "",
    createdAt: now,
    updatedAt: now,
  };
}

export function getFidelityCustomers() {
  return readStoredRecords<FidelityCustomer>(FIDELITY_CUSTOMERS_STORAGE_KEY, []).sort((left, right) => {
    const lastNameComparison = left.lastName.localeCompare(right.lastName, "it");

    if (lastNameComparison !== 0) {
      return lastNameComparison;
    }

    return left.firstName.localeCompare(right.firstName, "it");
  });
}

export function getFidelityRewards() {
  return [...fidelityRewards].sort((left, right) => left.displayOrder - right.displayOrder);
}

export function getAvailableFidelityRewards(currentPoints: number) {
  return getFidelityRewards().filter(
    (reward) => reward.isActive && currentPoints >= reward.pointsRequired
  );
}

export function getFidelityScanLogs() {
  return readStoredRecords<FidelityScanLog>(FIDELITY_SCAN_LOGS_STORAGE_KEY, []).sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt)
  );
}

export function getFidelityRewardRedemptions() {
  return readStoredRecords<RewardRedemption>(FIDELITY_REDEMPTIONS_STORAGE_KEY, []).sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt)
  );
}

export function getFidelityPointsMovements() {
  return readStoredRecords<FidelityPointsMovement>(FIDELITY_POINTS_MOVEMENTS_STORAGE_KEY, []).sort(
    (left, right) => right.createdAt.localeCompare(left.createdAt)
  );
}

export function saveFidelityCustomers(nextCustomers: FidelityCustomer[]) {
  const sortedCustomers = [...nextCustomers].sort((left, right) => {
    const lastNameComparison = left.lastName.localeCompare(right.lastName, "it");

    if (lastNameComparison !== 0) {
      return lastNameComparison;
    }

    return left.firstName.localeCompare(right.firstName, "it");
  });

  writeStoredRecords(FIDELITY_CUSTOMERS_STORAGE_KEY, sortedCustomers);
  void persistFidelityStateToServer();
  return sortedCustomers;
}

function saveFidelityRewardRedemptions(nextRedemptions: RewardRedemption[]) {
  writeStoredRecords(FIDELITY_REDEMPTIONS_STORAGE_KEY, nextRedemptions);
  void persistFidelityStateToServer();
  return nextRedemptions;
}

function saveFidelityPointsMovements(nextMovements: FidelityPointsMovement[]) {
  writeStoredRecords(FIDELITY_POINTS_MOVEMENTS_STORAGE_KEY, nextMovements);
  void persistFidelityStateToServer();
  return nextMovements;
}

export function appendFidelityScanLog(input: Omit<FidelityScanLog, "id" | "createdAt">) {
  const nextEntry: FidelityScanLog = {
    id: createStableId("fidelity-scan"),
    createdAt: getNowIso(),
    ...input,
  };

  const nextLogs = [nextEntry, ...getFidelityScanLogs()];

  if (typeof window !== "undefined") {
    window.localStorage.setItem(FIDELITY_SCAN_LOGS_STORAGE_KEY, JSON.stringify(nextLogs));
  }

  recordAuditEvent({
    eventType: "FIDELITY_CODE_SCANNED",
    entityType: "fidelity-scan",
    entityId: nextEntry.id,
    tableId: nextEntry.tableId,
    orderId: nextEntry.orderId,
    nextValue: nextEntry,
    origin: nextEntry.sourceScreen === "payment_screen" || nextEntry.sourceScreen === "payment_method" ? "payment" : "ui_pos",
  });

  dispatchDataChanged();
  return nextEntry;
}

export function calculateEarnedPoints(euroAmount: number) {
  return Math.max(0, Math.floor(euroAmount / EURO_PER_POINT));
}

export function createPendingRewardRedemption(input: {
  customerId: string;
  orderId?: string;
  paymentId?: string;
  rewardId: string;
  rewardName: string;
  pointsUsed: number;
  discountApplied: number;
  operatorId?: string;
}) {
  const nextRedemption: RewardRedemption = {
    id: createStableId("fidelity-redemption"),
    status: "pending",
    createdAt: getNowIso(),
    ...input,
  };

  saveFidelityRewardRedemptions([nextRedemption, ...getFidelityRewardRedemptions()]);
  recordAuditEvent({
    eventType: "FIDELITY_REWARD_SELECTED",
    entityType: "fidelity-redemption",
    entityId: nextRedemption.id,
    nextValue: nextRedemption,
    origin: "fidelity",
  });
  return nextRedemption;
}

export function updateRewardRedemptionStatus(
  redemptionId: string,
  status: RewardRedemptionStatus
) {
  const existingRedemptions = getFidelityRewardRedemptions();
  const existingRedemption = existingRedemptions.find((redemption) => redemption.id === redemptionId);

  if (!existingRedemption) {
    return null;
  }

  const nextRedemption: RewardRedemption = {
    ...existingRedemption,
    status,
    confirmedAt: status === "confirmed" ? getNowIso() : existingRedemption.confirmedAt,
  };

  saveFidelityRewardRedemptions(
    existingRedemptions.map((redemption) =>
      redemption.id === redemptionId ? nextRedemption : redemption
    )
  );

  recordAuditEvent({
    eventType:
      status === "cancelled" ? "FIDELITY_REWARD_CANCELLED" : "FIDELITY_REWARD_SELECTED",
    entityType: "fidelity-redemption",
    entityId: redemptionId,
    previousValue: existingRedemption,
    nextValue: nextRedemption,
    origin: "fidelity",
  });

  return nextRedemption;
}

export function appendFidelityPointsMovement(
  input: Omit<FidelityPointsMovement, "id" | "createdAt">
) {
  const nextMovement: FidelityPointsMovement = {
    id: createStableId("fidelity-points"),
    createdAt: getNowIso(),
    ...input,
  };

  saveFidelityPointsMovements([nextMovement, ...getFidelityPointsMovements()]);
  recordAuditEvent({
    eventType: "FIDELITY_POINTS_PROCESSED",
    entityType: "fidelity-points",
    entityId: nextMovement.id,
    nextValue: nextMovement,
    origin: "fidelity",
  });
  return nextMovement;
}

export function findFidelityCustomerByCode(codeValue: string) {
  const normalizedCode = normalizeSearchValue(codeValue);

  if (!normalizedCode) {
    return null;
  }

  return (
    getFidelityCustomers().find(
      (customer) =>
        normalizeSearchValue(customer.cardCode ?? "") === normalizedCode ||
        normalizeSearchValue(customer.qrCodeValue ?? "") === normalizedCode
    ) ?? null
  );
}

export function searchFidelityCustomers(query: string) {
  const normalizedQuery = normalizeSearchValue(query);

  if (!normalizedQuery) {
    return getFidelityCustomers();
  }

  return getFidelityCustomers().filter((customer) =>
    [
      customer.firstName,
      customer.lastName,
      customer.phone ?? "",
      customer.cardCode ?? "",
      customer.qrCodeValue ?? "",
      `${customer.firstName} ${customer.lastName}`.trim(),
    ].some((value) => normalizeSearchValue(value).includes(normalizedQuery))
  );
}

export function validateFidelityCodeUniqueness(
  customers: FidelityCustomer[],
  codeValue: string,
  codeField: "cardCode" | "qrCodeValue",
  currentCustomerId?: string
) {
  const normalizedCode = normalizeSearchValue(codeValue);

  if (!normalizedCode) {
    return null;
  }

  return (
    customers.find((customer) => {
      if (currentCustomerId && customer.id === currentCustomerId) {
        return false;
      }

      return normalizeSearchValue(customer[codeField] ?? "") === normalizedCode;
    }) ?? null
  );
}

export function upsertFidelityCustomer(customer: FidelityCustomer) {
  const now = getNowIso();
  const existingCustomers = getFidelityCustomers();
  const existingCustomer = existingCustomers.find((currentCustomer) => currentCustomer.id === customer.id);
  const nextCustomer: FidelityCustomer = {
    ...customer,
    createdAt: existingCustomer?.createdAt ?? customer.createdAt ?? now,
    updatedAt: now,
  };
  const nextCustomers = existingCustomer
    ? existingCustomers.map((currentCustomer) =>
        currentCustomer.id === nextCustomer.id ? nextCustomer : currentCustomer
      )
    : [...existingCustomers, nextCustomer];

  const savedCustomers = saveFidelityCustomers(nextCustomers);

  recordAuditEvent({
    eventType: existingCustomer ? "FIDELITY_CUSTOMER_UPDATED" : "FIDELITY_CUSTOMER_CREATED",
    entityType: "fidelity-customer",
    entityId: nextCustomer.id,
    previousValue: existingCustomer,
    nextValue: nextCustomer,
    origin: "configuration",
  });

  return savedCustomers.find((currentCustomer) => currentCustomer.id === nextCustomer.id) ?? nextCustomer;
}

export function updateFidelityCustomerAfterPayment(
  customerId: string,
  updates: Partial<Pick<FidelityCustomer, "lastScanAt" | "lastTransactionId" | "pendingPoints" | "currentPoints" | "totalPointsLoaded">>
) {
  const existingCustomers = getFidelityCustomers();
  const existingCustomer = existingCustomers.find((customer) => customer.id === customerId);

  if (!existingCustomer) {
    return null;
  }

  const nextCustomer: FidelityCustomer = {
    ...existingCustomer,
    ...updates,
    updatedAt: getNowIso(),
  };

  saveFidelityCustomers(
    existingCustomers.map((customer) => (customer.id === customerId ? nextCustomer : customer))
  );

  recordAuditEvent({
    eventType: "FIDELITY_CUSTOMER_UPDATED",
    entityType: "fidelity-customer",
    entityId: customerId,
    previousValue: existingCustomer,
    nextValue: nextCustomer,
    origin: "payment",
  });

  return nextCustomer;
}

export function finalizeFidelityPayment(input: {
  customerId: string;
  orderId?: string;
  paymentId?: string;
  operatorId?: string;
  paidEuroAmount: number;
  rewardRedemptionId?: string;
  rewardId?: string;
  rewardName?: string;
  rewardPointsUsed?: number;
  rewardDiscountApplied?: number;
  lastScanAt?: string;
}) {
  const existingCustomer = getFidelityCustomers().find((customer) => customer.id === input.customerId);

  if (!existingCustomer) {
    return null;
  }

  const earnedPoints = calculateEarnedPoints(input.paidEuroAmount);
  const usedPoints = input.rewardPointsUsed ?? 0;
  const nextPointsBalance = Math.max(
    0,
    existingCustomer.currentPoints - usedPoints + earnedPoints
  );

  if (input.rewardRedemptionId) {
    updateRewardRedemptionStatus(input.rewardRedemptionId, "confirmed");
  }

  const nextCustomer: FidelityCustomer = {
    ...existingCustomer,
    currentPoints: nextPointsBalance,
    pendingPoints: 0,
    totalPointsLoaded: existingCustomer.totalPointsLoaded + earnedPoints,
    lastTransactionId: input.paymentId ?? input.orderId ?? existingCustomer.lastTransactionId,
    lastScanAt: input.lastScanAt ?? existingCustomer.lastScanAt,
    updatedAt: getNowIso(),
  };

  saveFidelityCustomers(
    getFidelityCustomers().map((customer) =>
      customer.id === existingCustomer.id ? nextCustomer : customer
    )
  );

  if (usedPoints > 0) {
    appendFidelityPointsMovement({
      customerId: existingCustomer.id,
      orderId: input.orderId,
      paymentId: input.paymentId,
      type: "redeem",
      points: usedPoints,
      euroAmount: input.rewardDiscountApplied ?? 0,
      description: input.rewardName
        ? `Premio riscattato: ${input.rewardName}`
        : "Premio fidelity riscattato",
      operatorId: input.operatorId,
    });
  }

  appendFidelityPointsMovement({
    customerId: existingCustomer.id,
    orderId: input.orderId,
    paymentId: input.paymentId,
    type: "earn",
    points: earnedPoints,
    euroAmount: input.paidEuroAmount,
    description: `Punti caricati sul pagato di EUR ${input.paidEuroAmount.toFixed(2)}`,
    operatorId: input.operatorId,
  });

  return {
    customer: nextCustomer,
    earnedPoints,
    finalPointsBalance: nextPointsBalance,
  };
}

export function cancelPendingFidelityReward(redemptionId?: string) {
  if (!redemptionId) {
    return null;
  }

  const cancelledRedemption = updateRewardRedemptionStatus(redemptionId, "cancelled");

  if (cancelledRedemption) {
    appendFidelityPointsMovement({
      customerId: cancelledRedemption.customerId,
      orderId: cancelledRedemption.orderId,
      paymentId: cancelledRedemption.paymentId,
      type: "cancel",
      points: cancelledRedemption.pointsUsed,
      euroAmount: cancelledRedemption.discountApplied,
      description: `Premio annullato: ${cancelledRedemption.rewardName}`,
      operatorId: cancelledRedemption.operatorId,
    });
  }

  return cancelledRedemption;
}
