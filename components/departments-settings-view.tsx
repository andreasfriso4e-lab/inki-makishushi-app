"use client";

import { useEffect, useMemo, useState } from "react";

import {
  getDepartmentSettings,
  hydrateDepartmentSettingsFromServer,
  normalizeDepartmentValue,
  persistDepartmentSettingsToServer,
  PRODUCTS_SETTINGS_STORAGE_KEY,
  saveDepartmentSettings,
  slugifyDepartmentName,
  type DepartmentRecord,
} from "@/lib/department-settings";

type DepartmentModalState =
  | {
      mode: "create";
      department: DepartmentRecord;
    }
  | {
      mode: "edit";
      department: DepartmentRecord;
    };

type ProductDepartmentReference = {
  id?: string;
  name?: string;
  department?: string;
};

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
      <path d="M4 20h4l10-10-4-4L4 16v4Z" />
      <path d="m12 6 4 4" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
      <path d="M4 7h16" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M6 7l1 12h10l1-12" />
      <path d="M9 7V4h6v3" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function normalizeSearchValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function createEmptyDepartment(): DepartmentRecord {
  const now = new Date().toISOString();

  return {
    id: `department-${Date.now()}`,
    name: "",
    slug: "",
    is_active: true,
    description: "",
    created_at: now,
    updated_at: now,
  };
}

function readProductsDepartmentUsage() {
  if (typeof window === "undefined") {
    return [] as ProductDepartmentReference[];
  }

  const rawValue = window.localStorage.getItem(PRODUCTS_SETTINGS_STORAGE_KEY);

  if (!rawValue) {
    return [] as ProductDepartmentReference[];
  }

  try {
    const parsedValue = JSON.parse(rawValue) as ProductDepartmentReference[];
    return Array.isArray(parsedValue) ? parsedValue : [];
  } catch {
    return [] as ProductDepartmentReference[];
  }
}

export function DepartmentsSettingsView() {
  const [departments, setDepartments] = useState<DepartmentRecord[]>(() => getDepartmentSettings());
  const [searchValue, setSearchValue] = useState("");
  const [modalState, setModalState] = useState<DepartmentModalState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DepartmentRecord | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    setDepartments(getDepartmentSettings());
    void hydrateDepartmentSettingsFromServer().then((nextDepartments) => {
      setDepartments(nextDepartments);
    });
  }, []);

  const normalizedSearch = normalizeSearchValue(searchValue);
  const filteredDepartments = useMemo(
    () =>
      departments.filter((department) => {
        const haystack = `${department.name} ${department.description} ${department.slug}`;
        return normalizeSearchValue(haystack).includes(normalizedSearch);
      }),
    [departments, normalizedSearch]
  );

  const departmentUsageBySlug = useMemo(() => {
    const usageMap = new Map<string, number>();

    for (const product of readProductsDepartmentUsage()) {
      const slug = normalizeDepartmentValue(product.department, "");

      if (!slug) {
        continue;
      }

      usageMap.set(slug, (usageMap.get(slug) ?? 0) + 1);
    }

    return usageMap;
  }, [departments]);

  const openCreateModal = () => {
    setFeedback(null);
    setModalState({ mode: "create", department: createEmptyDepartment() });
  };

  const openEditModal = (department: DepartmentRecord) => {
    setFeedback(null);
    setModalState({ mode: "edit", department: { ...department } });
  };

  const closeModal = () => {
    setModalState(null);
  };

  const updateModalDepartment = <Key extends keyof DepartmentRecord>(field: Key, value: DepartmentRecord[Key]) => {
    setModalState((currentState) =>
      currentState
        ? {
            ...currentState,
            department: {
              ...currentState.department,
              [field]: value,
            },
          }
        : currentState
    );
  };

  const persistDepartments = (
    updater: (currentDepartments: DepartmentRecord[]) => DepartmentRecord[],
    nextFeedback?: { type: "success" | "error"; message: string } | null
  ) => {
    setDepartments((currentDepartments) => {
      const nextDepartments = saveDepartmentSettings(updater(currentDepartments));
      void persistDepartmentSettingsToServer(nextDepartments);
      return nextDepartments;
    });

    if (nextFeedback) {
      setFeedback(nextFeedback);
    }
  };

  const handleSaveDepartment = () => {
    if (!modalState) {
      return;
    }

    const trimmedName = modalState.department.name.trim();

    if (!trimmedName) {
      setFeedback({ type: "error", message: "Inserisci il nome del reparto." });
      return;
    }

    const nextSlug = slugifyDepartmentName(trimmedName);

    if (!nextSlug) {
      setFeedback({ type: "error", message: "Il nome del reparto non è valido." });
      return;
    }

    const duplicateDepartment = departments.find(
      (department) =>
        department.slug === nextSlug &&
        (modalState.mode === "create" || department.id !== modalState.department.id)
    );

    if (duplicateDepartment) {
      setFeedback({ type: "error", message: "Esiste già un reparto con questo nome." });
      return;
    }

    const now = new Date().toISOString();
    const departmentToSave: DepartmentRecord = {
      ...modalState.department,
      name: trimmedName,
      slug: modalState.mode === "create" ? nextSlug : modalState.department.slug || nextSlug,
      description: modalState.department.description.trim(),
      updated_at: now,
      created_at: modalState.department.created_at || now,
    };

    persistDepartments((currentDepartments) => {
      if (modalState.mode === "create") {
        return [...currentDepartments, departmentToSave];
      }

      return currentDepartments.map((department) =>
        department.id === departmentToSave.id ? departmentToSave : department
      );
    }, {
      type: "success",
      message: modalState.mode === "create" ? "Reparto creato correttamente." : "Reparto aggiornato correttamente.",
    });

    setModalState(null);
  };

  const toggleDepartment = (departmentId: string, isActive: boolean) => {
    persistDepartments(
      (currentDepartments) =>
        currentDepartments.map((department) =>
          department.id === departmentId
            ? { ...department, is_active: isActive, updated_at: new Date().toISOString() }
            : department
        ),
      {
        type: "success",
        message: isActive ? "Reparto attivato." : "Reparto disattivato.",
      }
    );
  };

  const confirmDelete = () => {
    if (!deleteTarget) {
      return;
    }

    const usageCount = departmentUsageBySlug.get(deleteTarget.slug) ?? 0;

    if (usageCount > 0) {
      if (deleteTarget.is_active) {
        persistDepartments(
          (currentDepartments) =>
            currentDepartments.map((department) =>
              department.id === deleteTarget.id
                ? { ...department, is_active: false, updated_at: new Date().toISOString() }
                : department
            ),
          {
            type: "success",
            message: `Il reparto ${deleteTarget.name} è già collegato ai prodotti e può solo essere disattivato.`,
          }
        );
      } else {
        setFeedback({
          type: "error",
          message: `Il reparto ${deleteTarget.name} è già usato da prodotti esistenti e non può essere eliminato.`,
        });
      }

      setDeleteTarget(null);
      return;
    }

    persistDepartments(
      (currentDepartments) => currentDepartments.filter((department) => department.id !== deleteTarget.id),
      {
        type: "success",
        message: "Reparto eliminato correttamente.",
      }
    );
    setDeleteTarget(null);
  };

  return (
    <section className="relative flex min-h-0 flex-1 flex-col bg-[#fffefb]">
      <div className="border-b border-[#d8d5cc] bg-[#f7f4ee] px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-base font-bold text-[#2e2a25]">Reparti</h2>
          <div className="flex items-center gap-2">
            <div className="flex h-10 items-center rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] px-3 text-[#6a645b]">
              <SearchIcon />
              <input
                type="text"
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder="Cerca reparto"
                className="ml-2 h-full w-[240px] bg-transparent text-sm text-[#2e2a25] outline-none placeholder:text-[#9a948a]"
              />
            </div>
            <button
              type="button"
              onClick={openCreateModal}
              className="flex h-10 items-center gap-2 rounded-[4px] border border-[#b7cfe4] bg-[#cfe8ff] px-3 text-sm font-semibold text-[#0b3c5d]"
            >
              <PlusIcon />
              <span>Nuovo reparto</span>
            </button>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col p-4">
        {feedback ? (
          <div
            className={[
              "mb-4 rounded-[4px] border px-4 py-3 text-sm",
              feedback.type === "success"
                ? "border-[#c8dec9] bg-[#eff9ef] text-[#2d5e32]"
                : "border-[#e5c8c8] bg-[#fff5f5] text-[#9a3d3d]",
            ].join(" ")}
          >
            {feedback.message}
          </div>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[4px] border border-[#d8d5cc] bg-[#ffffff]">
          <div className="grid grid-cols-[minmax(0,1.6fr)_140px_110px_56px_56px] items-center border-b border-[#d8d5cc] bg-[#fbf8f2] px-4 py-3 text-[11px] font-bold uppercase tracking-[0.04em] text-[#5d564e]">
            <div>Reparto</div>
            <div>Stato</div>
            <div className="text-center">Attivo</div>
            <div className="text-center">Mod.</div>
            <div className="text-center">Elim.</div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto bg-white">
            {filteredDepartments.map((department, index) => {
              const usageCount = departmentUsageBySlug.get(department.slug) ?? 0;

              return (
                <div
                  key={department.id}
                  className={[
                    "grid grid-cols-[minmax(0,1.6fr)_140px_110px_56px_56px] items-center px-4 py-3 text-sm text-[#2e2a25]",
                    index !== filteredDepartments.length - 1 ? "border-b border-[#ece7dd]" : "",
                  ].join(" ")}
                >
                  <div className="min-w-0 pr-4">
                    <div className="truncate font-semibold">{department.name}</div>
                    <div className="truncate text-xs text-[#6a645b]">
                      {department.description || "Nessuna descrizione"}
                    </div>
                    {usageCount > 0 ? (
                      <div className="mt-1 text-[11px] font-medium text-[#8a5a16]">
                        Usato da {usageCount} prodott{usageCount === 1 ? "o" : "i"}
                      </div>
                    ) : null}
                  </div>
                  <div>
                    <span
                      className={[
                        "inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold",
                        department.is_active
                          ? "bg-[#e8f7ea] text-[#2d7a39]"
                          : "bg-[#f2ece6] text-[#8a7460]",
                      ].join(" ")}
                    >
                      {department.is_active ? "Attivo" : "Non attivo"}
                    </span>
                  </div>
                  <div className="flex justify-center">
                    <label className="inline-flex cursor-pointer items-center">
                      <input
                        type="checkbox"
                        checked={department.is_active}
                        onChange={(event) => toggleDepartment(department.id, event.target.checked)}
                        className="h-4 w-4 accent-[#0b3c5d]"
                      />
                    </label>
                  </div>
                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={() => openEditModal(department)}
                      className="flex h-8 w-8 items-center justify-center rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] text-[#2e2a25] hover:bg-[#fbf8f2]"
                      aria-label={`Modifica ${department.name}`}
                    >
                      <PencilIcon />
                    </button>
                  </div>
                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(department)}
                      className="flex h-8 w-8 items-center justify-center rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] text-[#7c2626] hover:bg-[#f6e3e3]"
                      aria-label={`Elimina ${department.name}`}
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </div>
              );
            })}
            {filteredDepartments.length === 0 ? (
              <div className="px-4 py-6 text-sm text-[#6a645b]">Nessun reparto trovato</div>
            ) : null}
          </div>
        </div>
      </div>

      {modalState ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/20 px-6">
          <div className="w-full max-w-[520px] rounded-[6px] border border-[#d8d5cc] bg-[#ffffff] shadow-sm">
            <div className="border-b border-[#d8d5cc] bg-[#f7f4ee] px-5 py-4">
              <div className="text-base font-bold text-[#2e2a25]">
                {modalState.mode === "create" ? "Nuovo reparto" : "Modifica reparto"}
              </div>
            </div>

            <div className="space-y-4 px-5 py-5">
              <label className="block">
                <div className="mb-1 text-xs font-semibold text-[#5d564e]">Nome reparto *</div>
                <input
                  value={modalState.department.name}
                  onChange={(event) => updateModalDepartment("name", event.target.value)}
                  className="h-10 w-full rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] px-3 text-sm outline-none"
                />
              </label>

              <label className="block">
                <div className="mb-1 text-xs font-semibold text-[#5d564e]">Descrizione</div>
                <textarea
                  value={modalState.department.description}
                  onChange={(event) => updateModalDepartment("description", event.target.value)}
                  rows={4}
                  className="w-full rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] px-3 py-2 text-sm outline-none"
                />
              </label>

              <label className="flex items-center gap-2 text-sm text-[#2e2a25]">
                <input
                  type="checkbox"
                  checked={modalState.department.is_active}
                  onChange={(event) => updateModalDepartment("is_active", event.target.checked)}
                />
                <span>Reparto attivo</span>
              </label>
            </div>

            <div className="flex justify-end gap-2 border-t border-[#d8d5cc] bg-[#f3f0e8] px-5 py-4">
              <button
                type="button"
                onClick={closeModal}
                className="h-10 rounded-[4px] border border-[#c7c1b6] bg-[#ffffff] px-4 text-sm font-semibold text-[#2e2a25]"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={handleSaveDepartment}
                className="h-10 rounded-[4px] border border-[#8db5d4] bg-[#cfe8ff] px-5 text-sm font-semibold text-[#0b3c5d]"
              >
                Salva
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/20 px-6">
          <div className="w-full max-w-[360px] rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] p-4">
            <div className="text-sm font-bold text-[#2e2a25]">Conferma eliminazione</div>
            <div className="mt-2 text-sm text-[#5d564e]">{`Vuoi eliminare il reparto '${deleteTarget.name}'?`}</div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="h-10 rounded-[4px] border border-[#c7c1b6] bg-white text-sm font-semibold text-[#2e2a25]"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="h-10 rounded-[4px] border border-[#d9b5b5] bg-[#fce8e8] text-sm font-semibold text-[#8a2f2f]"
              >
                Conferma
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
