"use client";

import { useEffect, useMemo, useState } from "react";

import { getProductCategories, type ProductCategory } from "@/lib/pos-data";
import {
  hydrateCatalogConfigFromServer,
  persistCatalogConfigToServer,
  readStoredManagedCategories,
  saveManagedCategories,
  slugifyCatalogValue,
  type ManagedCategoryRecord,
} from "@/lib/catalog-config";

type ManagedCategory = ManagedCategoryRecord & {
  name: ProductCategory | string;
};

type CategoryModalState =
  | { mode: "create"; category: ManagedCategory }
  | { mode: "edit"; category: ManagedCategory };

function normalizeSearchValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

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

function buildInitialCategories(): ManagedCategory[] {
  return getProductCategories().map((category, index) => ({
    id: `category-${slugifyCatalogValue(category) || index}`,
    name: category,
    description: "",
    color: "#f7f9fb",
    icon: "",
    order: index + 1,
  }));
}

function createEmptyCategory(nextOrder: number): ManagedCategory {
  return {
    id: `new-category-${nextOrder}`,
    name: "",
    description: "",
    color: "#f7f9fb",
    icon: "",
    order: nextOrder,
  };
}

export function CategoriesSettingsView() {
  const [categories, setCategories] = useState<ManagedCategory[]>(() => buildInitialCategories());
  const [searchValue, setSearchValue] = useState("");
  const [modalState, setModalState] = useState<CategoryModalState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ManagedCategory | null>(null);

  useEffect(() => {
    setCategories(readStoredManagedCategories() as ManagedCategory[]);
    void hydrateCatalogConfigFromServer().then((state) => {
      if (Array.isArray(state.categories) && state.categories.length > 0) {
        setCategories(state.categories as ManagedCategory[]);
      }
    });
  }, []);

  const normalizedSearch = normalizeSearchValue(searchValue);
  const filteredCategories = useMemo(
    () =>
      categories
        .filter((category) => normalizeSearchValue(category.name).includes(normalizedSearch))
        .sort((firstCategory, secondCategory) => firstCategory.name.localeCompare(secondCategory.name, "it")),
    [categories, normalizedSearch]
  );

  const openCreateModal = () => {
    setModalState({
      mode: "create",
      category: createEmptyCategory(categories.length + 1),
    });
  };

  const openEditModal = (category: ManagedCategory) => {
    setModalState({
      mode: "edit",
      category: { ...category },
    });
  };

  const closeModal = () => {
    setModalState(null);
  };

  const updateModalCategory = <Key extends keyof ManagedCategory>(
    field: Key,
    value: ManagedCategory[Key]
  ) => {
    setModalState((currentState) =>
      currentState
        ? {
            ...currentState,
            category: {
              ...currentState.category,
              [field]: value,
            },
          }
        : currentState
    );
  };

  const handleSaveCategory = () => {
    if (!modalState) {
      return;
    }

    const trimmedName = modalState.category.name.trim();
    if (!trimmedName) {
      return;
    }

    const safeOrder = Number.isFinite(Number(modalState.category.order))
      ? Number(modalState.category.order)
      : categories.length + 1;

    const categoryToSave: ManagedCategory = {
      ...modalState.category,
      id:
        modalState.mode === "create"
          ? `category-${slugifyCatalogValue(trimmedName) || Date.now().toString()}`
          : modalState.category.id,
      name: trimmedName,
      order: safeOrder,
    };

    setCategories((currentCategories) => {
      const nextCategories =
        modalState.mode === "create"
          ? [...currentCategories, categoryToSave]
          : currentCategories.map((category) =>
              category.id === categoryToSave.id ? categoryToSave : category
            );

      saveManagedCategories(nextCategories);
      void persistCatalogConfigToServer({ categories: nextCategories });

      return nextCategories;
    });
    setModalState(null);
  };

  const confirmDelete = () => {
    if (!deleteTarget) {
      return;
    }

    setCategories((currentCategories) => {
      const nextCategories = currentCategories.filter((category) => category.id !== deleteTarget.id);
      saveManagedCategories(nextCategories);
      void persistCatalogConfigToServer({ categories: nextCategories });
      return nextCategories;
    });
    setDeleteTarget(null);
  };

  return (
    <section className="relative flex min-h-0 flex-1 flex-col bg-[#fffefb]">
      <div className="border-b border-[#d8d5cc] bg-[#f7f4ee] px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-base font-bold text-[#2e2a25]">Categorie</h2>
          <div className="flex items-center gap-2">
            <div className="flex h-10 items-center rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] px-3 text-[#6a645b]">
              <SearchIcon />
              <input
                type="text"
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder="Cerca categoria"
                className="ml-2 h-full w-[240px] bg-transparent text-sm text-[#2e2a25] outline-none placeholder:text-[#9a948a]"
              />
            </div>
            <button
              type="button"
              onClick={openCreateModal}
              className="flex h-10 items-center gap-2 rounded-[4px] border border-[#b7cfe4] bg-[#cfe8ff] px-3 text-sm font-semibold text-[#0b3c5d]"
            >
              <PlusIcon />
              <span>Nuova categoria</span>
            </button>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col p-4">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[4px] border border-[#d8d5cc] bg-[#ffffff]">
          <div className="grid grid-cols-[minmax(0,1.6fr)_120px_72px_56px_56px] items-center border-b border-[#d8d5cc] bg-[#fbf8f2] px-4 py-3 text-[11px] font-bold uppercase tracking-[0.04em] text-[#5d564e]">
            <div>Nome categoria</div>
            <div>Ordine</div>
            <div className="text-center">Colore</div>
            <div className="text-center">Mod.</div>
            <div className="text-center">Elim.</div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto bg-white">
            {filteredCategories.map((category, index) => (
              <div
                key={category.id}
                className={[
                  "grid grid-cols-[minmax(0,1.6fr)_120px_72px_56px_56px] items-center px-4 py-2 text-sm text-[#2e2a25]",
                  index !== filteredCategories.length - 1 ? "border-b border-[#ece7dd]" : "",
                ].join(" ")}
              >
                <div className="truncate pr-4 font-medium">{category.name}</div>
                <div className="text-sm text-[#5d564e]">{category.order}</div>
                <div className="flex justify-center">
                  <div
                    className="h-6 w-6 rounded-[4px] border border-[#d8d5cc]"
                    style={{ backgroundColor: category.color || "#f7f9fb" }}
                    aria-label={`Colore ${category.name}`}
                    title={category.color || "Nessun colore"}
                  />
                </div>
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => openEditModal(category)}
                    className="flex h-8 w-8 items-center justify-center rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] text-[#2e2a25] hover:bg-[#fbf8f2]"
                    aria-label={`Modifica ${category.name}`}
                  >
                    <PencilIcon />
                  </button>
                </div>
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(category)}
                    className="flex h-8 w-8 items-center justify-center rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] text-[#7c2626] hover:bg-[#f6e3e3]"
                    aria-label={`Elimina ${category.name}`}
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>
            ))}
            {filteredCategories.length === 0 ? (
              <div className="px-4 py-6 text-sm text-[#6a645b]">Nessuna categoria trovata</div>
            ) : null}
          </div>
        </div>
      </div>

      {modalState ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/20 px-8 py-6">
          <div className="flex max-h-full w-full max-w-[720px] flex-col overflow-hidden rounded-[6px] border border-[#d8d5cc] bg-[#ffffff] shadow-sm">
            <div className="border-b border-[#d8d5cc] bg-[#f7f4ee] px-5 py-4">
              <div className="text-base font-bold text-[#2e2a25]">
                {modalState.mode === "create" ? "Nuova categoria" : "Modifica categoria"}
              </div>
            </div>

            <div className="min-h-0 overflow-y-auto px-5 py-5">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <div className="mb-1 text-xs font-semibold text-[#5d564e]">Nome categoria *</div>
                  <input
                    value={modalState.category.name}
                    onChange={(event) => updateModalCategory("name", event.target.value)}
                    className="h-10 w-full rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] px-3 text-sm outline-none"
                  />
                </label>
                <label className="block">
                  <div className="mb-1 text-xs font-semibold text-[#5d564e]">Descrizione breve</div>
                  <input
                    value={modalState.category.description}
                    onChange={(event) => updateModalCategory("description", event.target.value)}
                    className="h-10 w-full rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] px-3 text-sm outline-none"
                  />
                </label>
                <label className="block">
                  <div className="mb-1 text-xs font-semibold text-[#5d564e]">Colore</div>
                  <input
                    type="color"
                    value={modalState.category.color}
                    onChange={(event) => updateModalCategory("color", event.target.value)}
                    className="h-10 w-full rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] px-2"
                  />
                </label>
                <div className="block">
                  <div className="mb-1 text-xs font-semibold text-[#5d564e]">Icona</div>
                  <button
                    type="button"
                    onClick={() =>
                      updateModalCategory("icon", modalState.category.icon ? "" : "icona")
                    }
                    className="flex h-10 w-full items-center justify-between rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] px-3 text-sm text-[#2e2a25]"
                  >
                    <span>{modalState.category.icon || "Seleziona icona"}</span>
                    <span className="text-xs text-[#6a645b]">Placeholder</span>
                  </button>
                </div>
                <label className="block md:col-span-2">
                  <div className="mb-1 text-xs font-semibold text-[#5d564e]">Ordine visualizzazione</div>
                  <input
                    type="number"
                    min="1"
                    value={modalState.category.order}
                    onChange={(event) =>
                      updateModalCategory("order", Number(event.target.value) || 1)
                    }
                    className="h-10 w-full rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] px-3 text-sm outline-none"
                  />
                </label>
              </div>
            </div>

            <div className="border-t border-[#d8d5cc] bg-[#f3f0e8] px-5 py-4">
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="h-10 rounded-[4px] border border-[#c7c1b6] bg-[#ffffff] px-4 text-sm font-semibold text-[#2e2a25]"
                >
                  Annulla
                </button>
                <button
                  type="button"
                  onClick={handleSaveCategory}
                  className="h-10 rounded-[4px] border border-[#8db5d4] bg-[#cfe8ff] px-5 text-sm font-semibold text-[#0b3c5d]"
                >
                  Salva
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/20 px-6">
          <div className="w-full max-w-[360px] rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] p-4">
            <div className="text-sm font-bold text-[#2e2a25]">Conferma eliminazione</div>
            <div className="mt-2 text-sm text-[#5d564e]">
              {`Eliminare la categoria ${deleteTarget.name}?`}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="h-10 rounded-[4px] border border-[#c7c1b6] bg-[#ffffff] px-3 text-sm font-semibold text-[#2e2a25]"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="h-10 rounded-[4px] border border-[#d97070] bg-[#f3d0d0] px-3 text-sm font-semibold text-[#7c2626]"
              >
                Elimina
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
