import { getActiveRestaurantId } from "@/lib/restaurant-config";
import {
  createSupabaseRows,
  deleteSupabaseRows,
  isSupabaseConfigured,
  readSupabaseRows,
  updateSupabaseRows,
} from "@/lib/server/supabase-json-store";

export type FidelityProfileRecord = {
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

export type FidelityRewardRecord = {
  id: string;
  name: string;
  pointsRequired: number;
  discountAmount: number;
  isActive: boolean;
  displayOrder: number;
};

export type FidelityPointsMovementRecord = {
  id: string;
  customerId: string;
  orderId?: string;
  paymentId?: string;
  type: "earn" | "redeem" | "refund" | "cancel";
  points: number;
  euroAmount: number;
  description: string;
  operatorId?: string;
  createdAt: string;
};

export type FidelityRewardRedemptionRecord = {
  id: string;
  customerId: string;
  orderId?: string;
  paymentId?: string;
  rewardId: string;
  rewardName: string;
  pointsUsed: number;
  discountApplied: number;
  status: "pending" | "confirmed" | "cancelled";
  operatorId?: string;
  createdAt: string;
  confirmedAt?: string;
};

type RelationalFidelityProfileRow = {
  id: string;
  customer_id: string | null;
  legacy_fidelity_customer_id: string | null;
  card_code: string | null;
  qr_code: string | null;
  full_name: string;
  phone: string | null;
  email: string | null;
  birth_date: string | null;
  points_balance: number;
  total_spent: number | string;
  notes: string | null;
  is_active: boolean;
  metadata: Record<string, unknown> | null;
  legacy_payload: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type RelationalFidelityRewardRow = {
  id: string;
  legacy_reward_id: string | null;
  code: string | null;
  title: string;
  points_cost: number;
  monetary_value: number | string | null;
  is_active: boolean;
  metadata: Record<string, unknown> | null;
  legacy_payload: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type RelationalFidelityPointsMovementRow = {
  id: string;
  legacy_points_movement_id: string | null;
  fidelity_profile_id: string;
  order_id: string | null;
  document_id: string | null;
  movement_type: string;
  points: number;
  reason: string | null;
  balance_after: number | null;
  metadata: Record<string, unknown> | null;
  legacy_payload: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type RelationalFidelityRewardRedemptionRow = {
  id: string;
  legacy_redemption_id: string | null;
  fidelity_profile_id: string;
  reward_id: string;
  order_id: string | null;
  status: string;
  points_spent: number;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  legacy_payload: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type RelationalCustomerRow = {
  id: string;
  legacy_customer_id: string | null;
  full_name: string;
};

type RelationalOrderRow = {
  id: string;
  legacy_order_key: string | null;
};

type RelationalPaymentRow = {
  id: string;
  legacy_payment_id: string | null;
};

function getRestaurantIdFilter() {
  return {
    column: "restaurant_id",
    value: getActiveRestaurantId(),
  } as const;
}

function nowIso() {
  return new Date().toISOString();
}

function toNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function normalizeLookup(value?: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

function fullName(firstName?: string, lastName?: string) {
  return `${firstName ?? ""} ${lastName ?? ""}`.trim();
}

function buildRewardCode(reward: FidelityRewardRecord) {
  return reward.id || reward.name;
}

async function syncByKey<TRow extends { id: string }>(
  tableName: string,
  existingRows: TRow[],
  nextRows: Array<Record<string, unknown>>,
  getExistingKey: (row: TRow) => string,
  getNextKey: (row: Record<string, unknown>) => string
) {
  const existingByKey = new Map(existingRows.map((row) => [getExistingKey(row), row]));
  const nextKeys = new Set<string>();

  for (const nextRow of nextRows) {
    const key = getNextKey(nextRow);
    if (!key) continue;
    nextKeys.add(key);
    const existing = existingByKey.get(key);

    if (existing) {
      await updateSupabaseRows<Record<string, unknown>>(tableName, nextRow, [
        { column: "restaurant_id", value: getActiveRestaurantId() },
        { column: "id", value: existing.id },
      ]);
    } else {
      await createSupabaseRows<Record<string, unknown>>(tableName, [nextRow]);
    }
  }

  const idsToDelete = existingRows
    .filter((row) => {
      const key = getExistingKey(row);
      return key && !nextKeys.has(key);
    })
    .map((row) => row.id);

  if (idsToDelete.length > 0) {
    await deleteSupabaseRows(tableName, [
      { column: "restaurant_id", value: getActiveRestaurantId() },
      { column: "id", operator: "in", value: idsToDelete },
    ]);
  }
}

export async function readRelationalFidelityState() {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const [profiles, rewards, movements, redemptions] = await Promise.all([
    readSupabaseRows<RelationalFidelityProfileRow>("fidelity_profiles", {
      filters: [getRestaurantIdFilter()],
      orderBy: "updated_at",
      ascending: false,
    }),
    readSupabaseRows<RelationalFidelityRewardRow>("fidelity_rewards", {
      filters: [getRestaurantIdFilter()],
      orderBy: "created_at",
    }),
    readSupabaseRows<RelationalFidelityPointsMovementRow>("fidelity_points_movements", {
      filters: [getRestaurantIdFilter()],
      orderBy: "created_at",
      ascending: false,
    }),
    readSupabaseRows<RelationalFidelityRewardRedemptionRow>("fidelity_reward_redemptions", {
      filters: [getRestaurantIdFilter()],
      orderBy: "created_at",
      ascending: false,
    }),
  ]);

  if (!profiles && !rewards && !movements && !redemptions) {
    return null;
  }

  return {
    customers: (profiles ?? []).map((row) => row.legacy_payload as unknown as FidelityProfileRecord),
    rewards: (rewards ?? []).map((row) => row.legacy_payload as unknown as FidelityRewardRecord),
    pointsMovements: (movements ?? []).map(
      (row) => row.legacy_payload as unknown as FidelityPointsMovementRecord
    ),
    rewardRedemptions: (redemptions ?? []).map(
      (row) => row.legacy_payload as unknown as FidelityRewardRedemptionRecord
    ),
    updatedAt:
      [profiles ?? [], rewards ?? [], movements ?? [], redemptions ?? []]
        .flat()
        .map((row) => row.updated_at)
        .sort()
        .at(-1) ?? nowIso(),
  };
}

export async function writeRelationalFidelityState(input: {
  customers: FidelityProfileRecord[];
  rewards: FidelityRewardRecord[];
  pointsMovements: FidelityPointsMovementRecord[];
  rewardRedemptions: FidelityRewardRedemptionRecord[];
}) {
  if (!isSupabaseConfigured()) {
    return;
  }

  const [existingProfiles, existingRewards, existingMovements, existingRedemptions, customerRows, orderRows, paymentRows] =
    await Promise.all([
      readSupabaseRows<RelationalFidelityProfileRow>("fidelity_profiles", { filters: [getRestaurantIdFilter()] }),
      readSupabaseRows<RelationalFidelityRewardRow>("fidelity_rewards", { filters: [getRestaurantIdFilter()] }),
      readSupabaseRows<RelationalFidelityPointsMovementRow>("fidelity_points_movements", { filters: [getRestaurantIdFilter()] }),
      readSupabaseRows<RelationalFidelityRewardRedemptionRow>("fidelity_reward_redemptions", { filters: [getRestaurantIdFilter()] }),
      readSupabaseRows<RelationalCustomerRow>("customers", { filters: [getRestaurantIdFilter()] }),
      readSupabaseRows<RelationalOrderRow>("orders", { filters: [getRestaurantIdFilter()] }),
      readSupabaseRows<RelationalPaymentRow>("payments", { filters: [getRestaurantIdFilter()] }),
    ]);

  const customerIdByLegacy = new Map(
    (customerRows ?? []).flatMap((row) => {
      const keys = [row.legacy_customer_id, normalizeLookup(row.full_name)].filter(Boolean) as string[];
      return keys.map((key) => [key, row.id] as const);
    })
  );
  const orderIdByLegacy = new Map(
    (orderRows ?? [])
      .filter((row) => Boolean(row.legacy_order_key))
      .map((row) => [row.legacy_order_key as string, row.id])
  );
  const paymentIdByLegacy = new Map(
    (paymentRows ?? [])
      .filter((row) => Boolean(row.legacy_payment_id))
      .map((row) => [row.legacy_payment_id as string, row.id])
  );

  const rewardRows = input.rewards.map((reward) => ({
    restaurant_id: getActiveRestaurantId(),
    legacy_reward_id: reward.id,
    code: buildRewardCode(reward),
    title: reward.name,
    description: reward.name,
    points_cost: reward.pointsRequired,
    monetary_value: reward.discountAmount,
    is_active: reward.isActive,
    metadata: { displayOrder: reward.displayOrder },
    legacy_payload: reward,
    created_at: nowIso(),
    updated_at: nowIso(),
  }));

  await syncByKey(
    "fidelity_rewards",
    existingRewards ?? [],
    rewardRows,
    (row) => row.legacy_reward_id ?? row.code ?? row.id,
    (row) => String(row.legacy_reward_id ?? row.code ?? "")
  );

  const refreshedRewards =
    (await readSupabaseRows<RelationalFidelityRewardRow>("fidelity_rewards", {
      filters: [getRestaurantIdFilter()],
    })) ?? [];
  const rewardIdByLegacy = new Map(
    refreshedRewards
      .filter((row) => Boolean(row.legacy_reward_id))
      .map((row) => [row.legacy_reward_id as string, row.id])
  );

  const profileRows = input.customers.map((customer) => ({
    restaurant_id: getActiveRestaurantId(),
    customer_id:
      customerIdByLegacy.get(customer.id) ??
      customerIdByLegacy.get(normalizeLookup(fullName(customer.firstName, customer.lastName))) ??
      null,
    company_id: null,
    legacy_fidelity_customer_id: customer.id,
    card_code: customer.cardCode || null,
    qr_code: customer.qrCodeValue || null,
    full_name: fullName(customer.firstName, customer.lastName),
    phone: customer.phone || null,
    email: customer.email || null,
    birth_date: customer.birthDate || null,
    points_balance: customer.currentPoints,
    total_spent: customer.totalPointsLoaded * 2,
    tier_name: null,
    notes: customer.notes || null,
    is_active: customer.isActive,
    metadata: {
      firstName: customer.firstName,
      lastName: customer.lastName,
      marketingConsent: customer.marketingConsent,
      pendingPoints: customer.pendingPoints,
      lastScanAt: customer.lastScanAt ?? null,
      lastTransactionId: customer.lastTransactionId ?? null,
      totalPointsLoaded: customer.totalPointsLoaded,
    },
    legacy_payload: customer,
    created_at: customer.createdAt || nowIso(),
    updated_at: customer.updatedAt || nowIso(),
  }));

  await syncByKey(
    "fidelity_profiles",
    existingProfiles ?? [],
    profileRows,
    (row) => row.legacy_fidelity_customer_id ?? row.card_code ?? row.qr_code ?? row.id,
    (row) =>
      String(
        row.legacy_fidelity_customer_id ?? row.card_code ?? row.qr_code ?? ""
      )
  );

  const refreshedProfiles =
    (await readSupabaseRows<RelationalFidelityProfileRow>("fidelity_profiles", {
      filters: [getRestaurantIdFilter()],
    })) ?? [];
  const profileIdByLegacy = new Map(
    refreshedProfiles
      .filter((row) => Boolean(row.legacy_fidelity_customer_id))
      .map((row) => [row.legacy_fidelity_customer_id as string, row.id])
  );

  const movementRows = input.pointsMovements.flatMap((movement) => {
    const profileId = profileIdByLegacy.get(movement.customerId);
    if (!profileId) {
      return [];
    }

    return [
      {
        restaurant_id: getActiveRestaurantId(),
        legacy_points_movement_id: movement.id,
        fidelity_profile_id: profileId,
        order_id: movement.orderId ? orderIdByLegacy.get(movement.orderId) ?? null : null,
        document_id: movement.paymentId ? paymentIdByLegacy.get(movement.paymentId) ?? null : null,
        movement_type: movement.type,
        points: movement.points,
        reason: movement.description,
        balance_after: null,
        metadata: {
          euroAmount: movement.euroAmount,
          operatorId: movement.operatorId ?? null,
          legacy_payment_id: movement.paymentId ?? null,
          legacy_order_id: movement.orderId ?? null,
        },
        legacy_payload: movement,
        created_at: movement.createdAt || nowIso(),
        updated_at: movement.createdAt || nowIso(),
      },
    ];
  });

  await syncByKey(
    "fidelity_points_movements",
    existingMovements ?? [],
    movementRows,
    (row) => row.legacy_points_movement_id ?? row.id,
    (row) => String(row.legacy_points_movement_id ?? "")
  );

  const redemptionRows = input.rewardRedemptions.flatMap((redemption) => {
    const profileId = profileIdByLegacy.get(redemption.customerId);
    const rewardId = rewardIdByLegacy.get(redemption.rewardId);
    if (!profileId || !rewardId) {
      return [];
    }

    return [
      {
        restaurant_id: getActiveRestaurantId(),
        legacy_redemption_id: redemption.id,
        fidelity_profile_id: profileId,
        reward_id: rewardId,
        order_id: redemption.orderId ? orderIdByLegacy.get(redemption.orderId) ?? null : null,
        status: redemption.status,
        points_spent: redemption.pointsUsed,
        notes: redemption.rewardName,
        metadata: {
          rewardName: redemption.rewardName,
          discountApplied: redemption.discountApplied,
          operatorId: redemption.operatorId ?? null,
          paymentId: redemption.paymentId ?? null,
          confirmedAt: redemption.confirmedAt ?? null,
        },
        legacy_payload: redemption,
        created_at: redemption.createdAt || nowIso(),
        updated_at: redemption.confirmedAt || redemption.createdAt || nowIso(),
      },
    ];
  });

  await syncByKey(
    "fidelity_reward_redemptions",
    existingRedemptions ?? [],
    redemptionRows,
    (row) => row.legacy_redemption_id ?? row.id,
    (row) => String(row.legacy_redemption_id ?? "")
  );
}
