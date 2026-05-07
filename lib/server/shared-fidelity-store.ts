import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  readRelationalFidelityState,
  type FidelityPointsMovementRecord,
  type FidelityProfileRecord,
  type FidelityRewardRecord,
  type FidelityRewardRedemptionRecord,
  writeRelationalFidelityState,
} from "@/lib/server/supabase-relational-fidelity-repository";
import {
  allowsFallbackRead,
  prefersSupabaseRead,
} from "@/lib/server/supabase-read-mode";

export type SharedFidelityState = {
  customers: FidelityProfileRecord[];
  rewards: FidelityRewardRecord[];
  pointsMovements: FidelityPointsMovementRecord[];
  rewardRedemptions: FidelityRewardRedemptionRecord[];
  updatedAt: string;
};

const DATA_DIR = path.join(process.cwd(), "data");
const FIDELITY_STATE_FILE = path.join(DATA_DIR, "shared-fidelity-state.json");

function nowIso() {
  return new Date().toISOString();
}

function cloneState(state: SharedFidelityState): SharedFidelityState {
  return JSON.parse(JSON.stringify(state)) as SharedFidelityState;
}

function normalizeKey(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function buildParity(keysFallback: string[], keysSupabase: string[]) {
  const fallbackSet = new Set(keysFallback.filter(Boolean));
  const supabaseSet = new Set(keysSupabase.filter(Boolean));
  const missingInSupabase = Array.from(fallbackSet).filter((key) => !supabaseSet.has(key));
  const extraInSupabase = Array.from(supabaseSet).filter((key) => !fallbackSet.has(key));
  return {
    clean: missingInSupabase.length === 0 && extraInSupabase.length === 0,
  };
}

async function ensureDataDir() {
  await mkdir(DATA_DIR, { recursive: true });
}

export async function readFallbackFidelityState(
  fallback: Omit<SharedFidelityState, "updatedAt">
): Promise<SharedFidelityState> {
  await ensureDataDir();

  try {
    const rawValue = await readFile(FIDELITY_STATE_FILE, "utf8");
    const parsedValue = JSON.parse(rawValue) as Partial<SharedFidelityState>;
    return cloneState({
      customers: Array.isArray(parsedValue.customers) ? parsedValue.customers : fallback.customers,
      rewards: Array.isArray(parsedValue.rewards) ? parsedValue.rewards : fallback.rewards,
      pointsMovements: Array.isArray(parsedValue.pointsMovements)
        ? parsedValue.pointsMovements
        : fallback.pointsMovements,
      rewardRedemptions: Array.isArray(parsedValue.rewardRedemptions)
        ? parsedValue.rewardRedemptions
        : fallback.rewardRedemptions,
      updatedAt:
        typeof parsedValue.updatedAt === "string" && parsedValue.updatedAt.length > 0
          ? parsedValue.updatedAt
          : nowIso(),
    });
  } catch {
    return cloneState({
      ...fallback,
      updatedAt: nowIso(),
    });
  }
}

export async function readSharedFidelityState(
  fallback: Omit<SharedFidelityState, "updatedAt">
): Promise<SharedFidelityState> {
  const fallbackState = await readFallbackFidelityState(fallback);

  if (prefersSupabaseRead("fidelity")) {
    try {
      const relationalState = await readRelationalFidelityState();

      const customersParity = buildParity(
        fallbackState.customers.map((record) => normalizeKey(record.id)),
        (relationalState?.customers ?? []).map((record) => normalizeKey(record.id))
      );
      const rewardsParity = buildParity(
        fallbackState.rewards.map((record) => normalizeKey(record.id)),
        (relationalState?.rewards ?? []).map((record) => normalizeKey(record.id))
      );
      const movementsParity = buildParity(
        fallbackState.pointsMovements.map((record) => normalizeKey(record.id)),
        (relationalState?.pointsMovements ?? []).map((record) => normalizeKey(record.id))
      );
      const redemptionsParity = buildParity(
        fallbackState.rewardRedemptions.map((record) => normalizeKey(record.id)),
        (relationalState?.rewardRedemptions ?? []).map((record) => normalizeKey(record.id))
      );

      if (
        relationalState &&
        customersParity.clean &&
        rewardsParity.clean &&
        movementsParity.clean &&
        redemptionsParity.clean &&
        (
          relationalState.customers.length > 0 ||
          relationalState.rewards.length > 0 ||
          relationalState.pointsMovements.length > 0 ||
          relationalState.rewardRedemptions.length > 0
        )
      ) {
        console.info("[shared-fidelity-store] read source=supabase");
        return cloneState({
          customers:
            relationalState.customers.length > 0 ? relationalState.customers : fallbackState.customers,
          rewards: relationalState.rewards.length > 0 ? relationalState.rewards : fallbackState.rewards,
          pointsMovements:
            relationalState.pointsMovements.length > 0
              ? relationalState.pointsMovements
              : fallbackState.pointsMovements,
          rewardRedemptions:
            relationalState.rewardRedemptions.length > 0
              ? relationalState.rewardRedemptions
              : fallbackState.rewardRedemptions,
          updatedAt: relationalState.updatedAt,
        });
      }
    } catch {
      // fallback locale
    }
  }

  if (!allowsFallbackRead("fidelity")) {
    return fallbackState;
  }

  console.info("[shared-fidelity-store] read source=fallback");
  return fallbackState;
}

export async function writeSharedFidelityState(
  state: Omit<SharedFidelityState, "updatedAt">
): Promise<SharedFidelityState> {
  const nextState = {
    ...cloneState({
      ...state,
      updatedAt: nowIso(),
    }),
  };

  await ensureDataDir();
  await writeFile(FIDELITY_STATE_FILE, JSON.stringify(nextState, null, 2), "utf8");

  try {
    await writeRelationalFidelityState(nextState);
  } catch (error) {
    console.error("[shared-fidelity-store] Relational Supabase write failed", error);
  }

  return nextState;
}
