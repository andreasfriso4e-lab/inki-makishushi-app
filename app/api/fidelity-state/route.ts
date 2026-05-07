import { NextResponse } from "next/server";

import {
  readSharedFidelityState,
  writeSharedFidelityState,
} from "@/lib/server/shared-fidelity-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const state = await readSharedFidelityState({
      customers: [],
      rewards: [],
      pointsMovements: [],
      rewardRedemptions: [],
    });
    return NextResponse.json(state, {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Impossibile leggere stato fidelity condiviso",
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as {
      customers?: unknown[];
      rewards?: unknown[];
      pointsMovements?: unknown[];
      rewardRedemptions?: unknown[];
    };

    const state = await writeSharedFidelityState({
      customers: Array.isArray(body.customers) ? (body.customers as never[]) : [],
      rewards: Array.isArray(body.rewards) ? (body.rewards as never[]) : [],
      pointsMovements: Array.isArray(body.pointsMovements) ? (body.pointsMovements as never[]) : [],
      rewardRedemptions: Array.isArray(body.rewardRedemptions) ? (body.rewardRedemptions as never[]) : [],
    });

    return NextResponse.json(state, {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (error) {
    console.error("[api/fidelity-state] Fidelity sync failed", error);
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Impossibile sincronizzare fidelity",
      },
      { status: 500 }
    );
  }
}
