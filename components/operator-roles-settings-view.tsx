"use client";

import { useEffect, useState } from "react";

import {
  getOperatorRoles,
  hashOperatorPassword,
  hydrateOperatorRolesFromServer,
  persistOperatorRolesToServer,
  type OperatorRoleConfig,
  type OperatorRoleId,
  type OperatorPermissions,
} from "@/lib/operator-roles";
import { recordAuditEvent } from "@/services/audit-log-service";

type RoleDraft = OperatorRoleConfig & {
  password: string;
  confirmPassword: string;
};

function Toggle({
  checked,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  onChange: (nextValue: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={[
        "relative inline-flex h-7 w-12 items-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        checked ? "border-[#b9d3ee] bg-[#dff0ff]" : "border-[#d8d5cc] bg-[#fbf8f2]",
      ].join(" ")}
    >
      <span
        className={[
          "inline-block h-5 w-5 rounded-full border bg-white transition-transform",
          checked ? "translate-x-6 border-[#8fb8dc]" : "translate-x-1 border-[#d0cbc1]",
        ].join(" ")}
      />
    </button>
  );
}

function toDraft(role: OperatorRoleConfig): RoleDraft {
  return {
    ...role,
    password: "",
    confirmPassword: "",
  };
}

const permissionLabels: Array<{
  key: keyof OperatorPermissions;
  label: string;
}> = [
  { key: "canManageCash", label: "Può gestire cassa" },
  { key: "canOpenDrawer", label: "Può aprire cassetto" },
  { key: "canCloseCash", label: "Può chiudere cassa" },
  { key: "canAccessBasePrices", label: "Può accedere a Prezzi base" },
  { key: "canApplyDiscounts", label: "Può applicare sconti" },
  { key: "canApplySurcharges", label: "Può applicare maggiorazioni" },
  { key: "canEditPaymentCalculator", label: "Può modificare importi nella calcolatrice pagamenti" },
  { key: "canAccessPayments", label: "Può accedere ai pagamenti" },
  { key: "canConfirmPayments", label: "Può confermare pagamento" },
  { key: "canUseCashPayments", label: "Può usare contanti" },
  { key: "canUseCardPayments", label: "Può usare carta / bancomat" },
  { key: "canUseOtherPaymentMethods", label: "Può usare altri metodi attivi" },
  { key: "canOpenTables", label: "Può aprire tavolo" },
  { key: "canEditTables", label: "Può modificare tavolo" },
  { key: "canMergeTables", label: "Può unire tavoli" },
  { key: "canSplitTables", label: "Può separare tavoli" },
  { key: "canCloseTables", label: "Può chiudere tavolo" },
  { key: "canInsertProducts", label: "Può inserire prodotti" },
  { key: "canEditOrders", label: "Può modificare quantità / ordine" },
  { key: "canDeleteOrderLines", label: "Può eliminare righe" },
  { key: "canSendOrders", label: "Può inviare comande" },
  { key: "canSaveOrderChanges", label: "Può salvare modifiche ordine" },
  { key: "canAccessSettings", label: "Può accedere al burger impostazioni" },
  { key: "canManagePrinters", label: "Può gestire stampanti" },
  { key: "canManagePaymentsSettings", label: "Può gestire impostazioni pagamenti" },
  { key: "canManageVatSettings", label: "Può gestire IVA" },
  { key: "canManageOrderSettings", label: "Può gestire comande" },
  { key: "canManageRoles", label: "Può gestire ruoli" },
  { key: "canAssignCustomer", label: "Può associare cliente" },
  { key: "canAssignCompany", label: "Può associare azienda" },
  { key: "canManageCustomersBilling", label: "Può modificare intestazione pagamento / fattura" },
];

export function OperatorRolesSettingsView() {
  const [roles, setRoles] = useState<RoleDraft[]>(() => getOperatorRoles().map(toDraft));
  const [statusMessage, setStatusMessage] = useState("");
  const [savingRoleId, setSavingRoleId] = useState<OperatorRoleId | null>(null);

  useEffect(() => {
    setRoles(getOperatorRoles().map(toDraft));
    void hydrateOperatorRolesFromServer().then((nextRoles) => {
      setRoles(nextRoles.map(toDraft));
    });
  }, []);

  const updateRole = <Key extends keyof RoleDraft>(
    roleId: OperatorRoleId,
    field: Key,
    value: RoleDraft[Key]
  ) => {
    setRoles((currentRoles) =>
      currentRoles.map((role) =>
        role.id === roleId
          ? {
              ...role,
              [field]: value,
            }
          : role
      )
    );
  };

  const updatePermission = (
    roleId: OperatorRoleId,
    permission: keyof OperatorPermissions,
    enabled: boolean
  ) => {
    setRoles((currentRoles) =>
      currentRoles.map((role) =>
        role.id === roleId
          ? {
              ...role,
              permissions: {
                ...role.permissions,
                [permission]: enabled,
              },
            }
          : role
      )
    );
  };

  const handleSaveRole = async (roleId: OperatorRoleId) => {
    const targetRole = roles.find((role) => role.id === roleId);

    if (!targetRole) {
      return;
    }

    if (targetRole.password || targetRole.confirmPassword) {
      if (targetRole.password !== targetRole.confirmPassword) {
        setStatusMessage(`Le password di ${targetRole.defaultName} non coincidono`);
        return;
      }
    }

    if (
      targetRole.enabled &&
      !targetRole.passwordHash &&
      targetRole.password.trim().length === 0
    ) {
      setStatusMessage(`Imposta una password per attivare ${targetRole.defaultName}`);
      return;
    }

    setSavingRoleId(roleId);

    const passwordHash =
      targetRole.password.length > 0
        ? await hashOperatorPassword(targetRole.password)
        : targetRole.passwordHash;

    const nextRoles = roles.map((role) =>
      role.id === roleId
        ? {
            ...role,
            displayName: role.displayName.trim() || role.defaultName,
            enabled: role.id === "admin" ? true : role.enabled,
            passwordHash,
          }
        : {
            ...role,
            displayName: role.displayName.trim() || role.defaultName,
            enabled: role.id === "admin" ? true : role.enabled,
          }
    );

    const previousRole = getOperatorRoles().find((role) => role.id === roleId) ?? null;

    try {
      const savedRoles = await persistOperatorRolesToServer(
        nextRoles.map(({ password, confirmPassword, ...role }) => role)
      );
      setRoles(savedRoles.map(toDraft));
      setSavingRoleId(null);
      setStatusMessage(`Ruolo ${targetRole.defaultName} salvato`);

      const savedRole = savedRoles.find((role) => role.id === roleId) ?? null;

      recordAuditEvent({
        eventType: previousRole
          ? previousRole.enabled !== targetRole.enabled
            ? targetRole.enabled
              ? "OPERATOR_ENABLED"
              : "OPERATOR_DISABLED"
            : "OPERATOR_UPDATED"
          : "OPERATOR_CREATED",
        entityType: "operator",
        entityId: roleId,
        previousValue: previousRole,
        nextValue: savedRole,
        origin: "configuration",
      });

      if (targetRole.password.trim().length > 0) {
        recordAuditEvent({
          eventType: "PASSWORD_CHANGED",
          entityType: "operator",
          entityId: roleId,
          origin: "configuration",
          notes: `Password aggiornata per ${targetRole.displayName}`,
        });
      }
    } catch (error) {
      setStatusMessage(
        error instanceof Error
          ? error.message
          : `Impossibile salvare ${targetRole.defaultName} nello store condiviso`
      );
    } finally {
      setSavingRoleId(null);
    }
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-auto bg-[#fffefb] p-4">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-[#2e2a25]">Ruoli</h1>
        <p className="mt-1 text-sm text-[#6b645c]">
          Configura operatori, attivazione, nome visualizzato e password per il cambio utente.
        </p>
      </div>

      {statusMessage ? (
        <div className="mb-4 rounded-[8px] border border-[#bcd5ea] bg-[#eef6ff] px-3 py-2 text-sm text-[#0b3c5d]">
          {statusMessage}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        {roles.map((role) => (
          <div
            key={role.id}
            className="rounded-[12px] border border-[#ddd8ce] bg-white p-4"
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="text-base font-semibold text-[#2e2a25]">
                  {role.defaultName}
                </div>
                <div className="mt-1 text-xs text-[#6b645c]">
                  {role.roleType === "admin" ? "Ruolo principale" : "Operatore configurabile"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Toggle
                  checked={role.enabled}
                  disabled={role.id === "admin"}
                  onChange={(nextValue) => updateRole(role.id, "enabled", nextValue)}
                />
                <span className="text-xs font-semibold uppercase text-[#6b645c]">
                  {role.enabled ? "Attivo" : "Disattivo"}
                </span>
              </div>
            </div>

            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1 text-sm text-[#4a4540]">
                  <span className="font-medium">Ruolo associato</span>
                  <input
                    type="text"
                    value={role.roleType === "admin" ? "admin" : "operatore"}
                    readOnly
                    className="h-11 rounded-[8px] border border-[#d8d5cc] bg-[#fbf8f2] px-3 outline-none"
                  />
                </label>
                <label className="grid gap-1 text-sm text-[#4a4540]">
                  <span className="font-medium">Username interno</span>
                  <input
                    type="text"
                    value={role.username}
                    readOnly
                    className="h-11 rounded-[8px] border border-[#d8d5cc] bg-[#fbf8f2] px-3 outline-none"
                  />
                </label>
              </div>

              <label className="grid gap-1 text-sm text-[#4a4540]">
                <span className="font-medium">Nome visualizzato</span>
                <input
                  type="text"
                  value={role.displayName}
                  onChange={(event) => updateRole(role.id, "displayName", event.target.value)}
                  className="h-11 rounded-[8px] border border-[#d8d5cc] bg-[#ffffff] px-3 outline-none"
                />
              </label>

              <label className="grid gap-1 text-sm text-[#4a4540]">
                <span className="font-medium">Password</span>
                <input
                  type="password"
                  value={role.password}
                  onChange={(event) => updateRole(role.id, "password", event.target.value)}
                  className="h-11 rounded-[8px] border border-[#d8d5cc] bg-[#ffffff] px-3 outline-none"
                  placeholder={role.passwordHash ? "Lascia vuoto per mantenere" : "Imposta password"}
                />
              </label>

              <label className="grid gap-1 text-sm text-[#4a4540]">
                <span className="font-medium">Conferma password</span>
                <input
                  type="password"
                  value={role.confirmPassword}
                  onChange={(event) => updateRole(role.id, "confirmPassword", event.target.value)}
                  className="h-11 rounded-[8px] border border-[#d8d5cc] bg-[#ffffff] px-3 outline-none"
                />
              </label>

              <div className="rounded-[8px] border border-[#f7f4ee] bg-[#ffffff] px-3 py-3 text-sm text-[#4a4540]">
                <div className="font-medium">Stato sintetico</div>
                <div className="mt-1 text-xs text-[#6b645c]">
                  {role.enabled ? "Attivo" : "Disattivo"} · Nome attuale: {role.displayName.trim() || role.defaultName}
                </div>
                <div className="mt-1 text-xs text-[#6b645c]">
                  {role.passwordHash ? "Password configurata" : "Password non configurata"}
                </div>
                <div className="mt-1 text-xs text-[#6b645c]">
                  Creato: {new Date(role.createdAt).toLocaleString("it-IT")} · Aggiornato:{" "}
                  {new Date(role.updatedAt).toLocaleString("it-IT")}
                </div>
              </div>

              <div className="rounded-[8px] border border-[#f7f4ee] bg-[#ffffff] p-3">
                <div className="mb-3 text-sm font-medium text-[#2e2a25]">Permessi</div>
                <div className="grid gap-2">
                  {permissionLabels.map((permission) => (
                    <div
                      key={permission.key}
                      className="flex items-center justify-between gap-3 rounded-[8px] border border-[#f7f4ee] bg-white px-3 py-2"
                    >
                      <span className="text-sm text-[#4a4540]">{permission.label}</span>
                      <Toggle
                        checked={role.permissions[permission.key]}
                        disabled={role.roleType === "admin"}
                        onChange={(nextValue) =>
                          updatePermission(role.id, permission.key, nextValue)
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => void handleSaveRole(role.id)}
                  disabled={savingRoleId === role.id}
                  className="rounded-[8px] border border-[#b7cfe4] bg-[#cfe8ff] px-4 py-2 text-sm font-semibold text-[#0b3c5d] disabled:opacity-60"
                >
                  {savingRoleId === role.id ? "Salvataggio..." : "Salva"}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
