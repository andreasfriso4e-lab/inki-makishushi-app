import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  getDefaultHomeAreas,
  type HomeAreaRecord,
} from "@/lib/home-settings";
import {
  isSupabaseConfigured,
  readSupabaseJsonState,
  writeSupabaseJsonState,
} from "@/lib/server/supabase-json-store";
import {
  readRelationalRoomsAndTablesState,
  writeRelationalRoomsState,
} from "@/lib/server/supabase-relational-read-repository";
import {
  allowsFallbackRead,
  prefersSupabaseRead,
} from "@/lib/server/supabase-read-mode";

export type SharedHomeAreasState = {
  areas: HomeAreaRecord[];
  updatedAt: string;
};

const DATA_DIR = path.join(process.cwd(), "data");
const HOME_AREAS_STATE_FILE = path.join(DATA_DIR, "shared-home-areas-state.json");
const SUPABASE_HOME_AREAS_TABLE = "pos_home_areas_state";

function getNowIso() {
  return new Date().toISOString();
}

function cloneAreas(areas: HomeAreaRecord[]) {
  return areas.map((area) => ({ ...area }));
}

function buildInitialSharedState(): SharedHomeAreasState {
  return {
    areas: cloneAreas(getDefaultHomeAreas()),
    updatedAt: getNowIso(),
  };
}

async function ensureDataDir() {
  await mkdir(DATA_DIR, { recursive: true });
}

export async function readFallbackSharedHomeAreasState(): Promise<SharedHomeAreasState | null> {
  await ensureDataDir();

  try {
    const rawValue = await readFile(HOME_AREAS_STATE_FILE, "utf8");
    const parsedValue = JSON.parse(rawValue) as Partial<SharedHomeAreasState>;

    if (!Array.isArray(parsedValue.areas)) {
      throw new Error("Invalid home areas payload");
    }

    return {
      areas: cloneAreas(parsedValue.areas),
      updatedAt:
        typeof parsedValue.updatedAt === "string" && parsedValue.updatedAt.length > 0
          ? parsedValue.updatedAt
          : getNowIso(),
    };
  } catch {
    return null;
  }
}

export async function readSharedHomeAreasState(): Promise<SharedHomeAreasState> {
  if (isSupabaseConfigured() && prefersSupabaseRead("rooms")) {
    try {
      const relationalState = await readRelationalRoomsAndTablesState();

      if (Array.isArray(relationalState?.areas) && relationalState.areas.length > 0) {
        console.info("[shared-home-areas-store] read source=supabase");
        return {
          areas: cloneAreas(relationalState.areas),
          updatedAt: relationalState.updatedAt,
        };
      }

      const remoteState = await readSupabaseJsonState<{ areas?: HomeAreaRecord[] }>(
        SUPABASE_HOME_AREAS_TABLE
      );

      if (Array.isArray(remoteState?.payload?.areas)) {
        console.info("[shared-home-areas-store] read source=fallback-blob");
        return {
          areas: cloneAreas(remoteState.payload.areas),
          updatedAt: remoteState.updatedAt,
        };
      }
    } catch {
      // Fallback locale/blob: non bloccare la cassa se Supabase non risponde.
    }
  }

  if (!allowsFallbackRead("rooms")) {
    const initialState = buildInitialSharedState();
    console.info("[shared-home-areas-store] read source=default");
    return initialState;
  }

  const fallbackState = await readFallbackSharedHomeAreasState();
  if (fallbackState) {
    console.info("[shared-home-areas-store] read source=fallback-file");
    return fallbackState;
  }

  const initialState = buildInitialSharedState();
  await writeSharedHomeAreasState(initialState.areas);
  console.info("[shared-home-areas-store] read source=default");
  return initialState;
}

export async function writeSharedHomeAreasState(areas: HomeAreaRecord[]): Promise<SharedHomeAreasState> {
  const normalizedAreas = cloneAreas(areas);
  let nextState: SharedHomeAreasState | null = null;

  if (isSupabaseConfigured()) {
    try {
      const remoteState = await writeSupabaseJsonState(SUPABASE_HOME_AREAS_TABLE, {
        areas: normalizedAreas,
      });

      if (Array.isArray(remoteState?.payload?.areas)) {
        nextState = {
          areas: cloneAreas(remoteState.payload.areas),
          updatedAt: remoteState.updatedAt,
        };
      }
    } catch (error) {
      console.error("[shared-home-areas-store] Blob Supabase write failed", error);
    }
  }

  if (!nextState) {
    await ensureDataDir();

    nextState = {
      areas: normalizedAreas,
      updatedAt: getNowIso(),
    };

    await writeFile(HOME_AREAS_STATE_FILE, JSON.stringify(nextState, null, 2), "utf8");
  }

  if (isSupabaseConfigured()) {
    try {
      await writeRelationalRoomsState(nextState.areas);
    } catch (error) {
      console.error("[shared-home-areas-store] Relational Supabase write failed", error);
    }
  }

  return nextState;
}
