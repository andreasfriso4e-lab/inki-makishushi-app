"use client";

import { createStableId } from "@/utils/id";
import type {
  OperatorActorSnapshot,
  OperatorRoleId,
  OperatorRoleType,
  PosOperatorRecord,
  PosOperatorSession,
} from "@/types/operator";

const OPERATOR_SESSION_STORAGE_KEY = "pos-active-operator-session";
const WORKSTATION_ID_STORAGE_KEY = "pos-workstation-id";
export const LOCAL_WORKSTATION_PLACEHOLDER = "workstation-local";

function getNowIso() {
  return new Date().toISOString();
}

export function getOrCreateWorkstationId() {
  if (typeof window === "undefined") {
    return LOCAL_WORKSTATION_PLACEHOLDER;
  }

  const existingWorkstationId = window.localStorage.getItem(WORKSTATION_ID_STORAGE_KEY);

  if (existingWorkstationId) {
    return existingWorkstationId;
  }

  const nextWorkstationId = createStableId("workstation");
  window.localStorage.setItem(WORKSTATION_ID_STORAGE_KEY, nextWorkstationId);
  return nextWorkstationId;
}

export function createOperatorSession(
  operator: PosOperatorRecord,
  overrides?: Partial<PosOperatorSession>
): PosOperatorSession {
  const now = getNowIso();

  return {
    sessionId: overrides?.sessionId ?? createStableId("session"),
    authenticated: overrides?.authenticated ?? true,
    operatorId: overrides?.operatorId ?? operator.id,
    operatorName: overrides?.operatorName ?? operator.displayName,
    role: overrides?.role ?? operator.roleType,
    loginAt: overrides?.loginAt ?? now,
    workstationId: overrides?.workstationId ?? getOrCreateWorkstationId(),
    updatedAt: overrides?.updatedAt ?? now,
  };
}

export function getDefaultOperatorSession(): PosOperatorSession {
  const now = getNowIso();

  return {
    sessionId: createStableId("session"),
    authenticated: true,
    operatorId: "admin",
    operatorName: "Admin",
    role: "admin",
    loginAt: now,
    workstationId: getOrCreateWorkstationId(),
    updatedAt: now,
  };
}

export function createInitialOperatorSession(): PosOperatorSession {
  return {
    sessionId: "session-local",
    authenticated: true,
    operatorId: "admin",
    operatorName: "Admin",
    role: "admin",
    loginAt: "",
    workstationId: LOCAL_WORKSTATION_PLACEHOLDER,
    updatedAt: "",
  };
}

export function getStoredOperatorSession() {
  if (typeof window === "undefined") {
    return getDefaultOperatorSession();
  }

  const rawValue = window.localStorage.getItem(OPERATOR_SESSION_STORAGE_KEY);

  if (!rawValue) {
    const defaultSession = getDefaultOperatorSession();
    saveOperatorSession(defaultSession);
    return defaultSession;
  }

  try {
    const parsedValue = JSON.parse(rawValue) as Partial<PosOperatorSession>;
    return {
      ...getDefaultOperatorSession(),
      ...parsedValue,
      operatorId: (parsedValue.operatorId ?? "admin") as OperatorRoleId,
      role: (parsedValue.role ?? "admin") as OperatorRoleType,
      workstationId: parsedValue.workstationId ?? getOrCreateWorkstationId(),
      updatedAt: parsedValue.updatedAt ?? getNowIso(),
    } as PosOperatorSession;
  } catch {
    const defaultSession = getDefaultOperatorSession();
    saveOperatorSession(defaultSession);
    return defaultSession;
  }
}

export function saveOperatorSession(session: PosOperatorSession) {
  const normalizedSession = {
    ...session,
    workstationId: session.workstationId || getOrCreateWorkstationId(),
    updatedAt: getNowIso(),
  };

  if (typeof window !== "undefined") {
    window.localStorage.setItem(OPERATOR_SESSION_STORAGE_KEY, JSON.stringify(normalizedSession));
  }

  return normalizedSession;
}

export function getCurrentAuditActor(): OperatorActorSnapshot {
  const session = getStoredOperatorSession();

  return {
    operatorId: session.operatorId,
    operatorName: session.operatorName,
    role: session.role,
    sessionId: session.sessionId,
    workstationId: session.workstationId,
  };
}
