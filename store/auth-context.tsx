"use client";

import {
  useCallback,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  getDefaultOperatorRoles,
  getOperatorRoleById,
  getOperatorRoles,
  hydrateOperatorRolesFromServer,
  verifyOperatorPassword,
  OPERATOR_ROLES_CHANGED_EVENT,
  type OperatorRoleConfig,
  type OperatorRoleId,
  type OperatorPermissions,
} from "@/lib/operator-roles";
import { recordAuditEvent } from "@/services/audit-log-service";
import {
  createInitialOperatorSession,
  createOperatorSession,
  getStoredOperatorSession,
  saveOperatorSession,
} from "@/services/operator-session-service";
import type { OperatorActorSnapshot, PosOperatorSession } from "@/types/operator";

type AuthContextValue = {
  users: OperatorRoleConfig[];
  activeUsers: OperatorRoleConfig[];
  currentUser: OperatorRoleConfig;
  currentSession: PosOperatorSession;
  currentActor: OperatorActorSnapshot;
  loginAsUser: (
    userId: OperatorRoleId,
    password: string
  ) => Promise<{ success: boolean; error?: string; warning?: string }>;
  hasPermission: (permission: keyof OperatorPermissions) => boolean;
  refreshUsers: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<OperatorRoleConfig[]>(() => getDefaultOperatorRoles());
  const [currentSession, setCurrentSession] = useState<PosOperatorSession>(() =>
    createInitialOperatorSession()
  );
  const currentSessionRef = useRef(currentSession);

  useEffect(() => {
    currentSessionRef.current = currentSession;
  }, [currentSession]);

  const applyUsersFromStorage = useCallback((baseSession?: PosOperatorSession) => {
    const nextUsers = getOperatorRoles();
    const effectiveSession = baseSession ?? currentSessionRef.current;
    const currentUser = nextUsers.find((user) => user.id === effectiveSession.operatorId);
    const fallbackUser =
      currentUser && (currentUser.enabled || currentUser.id === "admin")
        ? currentUser
        : nextUsers.find((user) => user.id === "admin") ?? nextUsers[0];

    setUsers(nextUsers);
    const nextSession = saveOperatorSession(
      createOperatorSession(fallbackUser, {
        sessionId: effectiveSession.sessionId,
        workstationId: effectiveSession.workstationId,
      })
    );
    setCurrentSession(nextSession);
  }, []);

  const refreshUsers = useCallback(async () => {
    applyUsersFromStorage();
  }, [applyUsersFromStorage]);

  useEffect(() => {
    let isMounted = true;

    const hydrate = async () => {
      await hydrateOperatorRolesFromServer();
      const hydratedSession = getStoredOperatorSession();
      if (!isMounted) {
        return;
      }

      setCurrentSession(hydratedSession);

      if (!isMounted) {
        return;
      }

      applyUsersFromStorage(hydratedSession);
    };

    void hydrate();

    const handleRolesChanged = () => {
      void refreshUsers();
    };

    window.addEventListener(OPERATOR_ROLES_CHANGED_EVENT, handleRolesChanged);

    return () => {
      isMounted = false;
      window.removeEventListener(OPERATOR_ROLES_CHANGED_EVENT, handleRolesChanged);
    };
  }, [applyUsersFromStorage, refreshUsers]);

  const value = useMemo<AuthContextValue>(() => {
    const activeUsers = users.filter((role) => role.enabled || role.id === "admin");
    const currentUser =
      users.find((user) => user.id === currentSession.operatorId) ??
      getOperatorRoleById("admin") ??
      users[0];
    const actor: OperatorActorSnapshot = {
      operatorId: currentUser.id,
      operatorName: currentUser.displayName,
      role: currentUser.roleType,
      sessionId: currentSession.sessionId,
      workstationId: currentSession.workstationId,
    };

    return {
      users,
      activeUsers,
      currentUser,
      currentSession,
      currentActor: actor,
      refreshUsers,
      loginAsUser: async (userId, password) => {
        const latestUsers = await hydrateOperatorRolesFromServer();
        setUsers(latestUsers);

        const user = latestUsers.find((currentUserConfig) => currentUserConfig.id === userId);

        if (!user || (!user.enabled && user.id !== "admin")) {
          recordAuditEvent({
            eventType: "LOGIN_FAILED",
            entityType: "session",
            entityId: userId,
            operatorId: userId,
            operatorName: user?.displayName ?? userId,
            role: user?.roleType ?? "operator",
            origin: "auth",
            notes: "Utente non disponibile",
          });
          return { success: false, error: "Utente non disponibile" };
        }

        if (!user.passwordHash) {
          recordAuditEvent({
            eventType: "LOGIN_FAILED",
            entityType: "session",
            entityId: user.id,
            operatorId: user.id,
            operatorName: user.displayName,
            role: user.roleType,
            origin: "auth",
            notes: "Password non configurata",
          });
          const nextSession = saveOperatorSession(
            createOperatorSession(user, {
              workstationId: currentSession.workstationId,
            })
          );
          setCurrentSession(nextSession);
          recordAuditEvent({
            eventType: "LOGIN_SUCCESS",
            entityType: "session",
            entityId: nextSession.sessionId,
            operatorId: user.id,
            operatorName: user.displayName,
            role: user.roleType,
            nextValue: nextSession,
            origin: "auth",
            notes: `Accesso demo senza password a ${nextSession.workstationId}`,
          });
          return {
            success: true,
            warning: "Password non configurata: accesso demo consentito",
          };
        }

        const isPasswordValid = await verifyOperatorPassword(password, user.passwordHash);

        if (!isPasswordValid) {
          recordAuditEvent({
            eventType: "LOGIN_FAILED",
            entityType: "session",
            entityId: user.id,
            operatorId: user.id,
            operatorName: user.displayName,
            role: user.roleType,
            origin: "auth",
            notes: "Password errata",
          });
          return { success: false, error: "Password errata" };
        }

        const nextSession = saveOperatorSession(
          createOperatorSession(user, {
            workstationId: currentSession.workstationId,
          })
        );
        setCurrentSession(nextSession);
        recordAuditEvent({
          eventType: "LOGIN_SUCCESS",
          entityType: "session",
          entityId: nextSession.sessionId,
          operatorId: user.id,
          operatorName: user.displayName,
          role: user.roleType,
          nextValue: nextSession,
          origin: "auth",
          notes: `Accesso a ${nextSession.workstationId}`,
        });
        return { success: true };
      },
      hasPermission: (permission) => {
        const role = users.find((user) => user.id === currentSession.operatorId);

        if (!role) {
          return false;
        }

        if (role.roleType === "admin") {
          return true;
        }

        return Boolean(role.permissions[permission]);
      },
    };
  }, [currentSession, users]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
}
