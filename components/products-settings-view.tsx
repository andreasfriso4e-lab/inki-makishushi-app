"use client";

import { useEffect, useMemo, useState } from "react";

import {
  DEPARTMENT_SETTINGS_CHANGED_EVENT,
  getDepartmentDisplayName,
  getDepartmentSettings,
  normalizeDepartmentValue,
  type DepartmentRecord,
} from "@/lib/department-settings";
import { getProductCategories, getProducts, type Product, type ProductCategory } from "@/lib/pos-data";
import {
  hydrateCatalogConfigFromServer,
  persistCatalogConfigToServer,
  readStoredManagedProducts,
  saveManagedProducts,
  type ManagedProductRecord,
} from "@/lib/catalog-config";
import {
  getDefaultOperationalVatRate,
  getVatRateSelectionOptions,
  type VatRateSelectionOption,
} from "@/lib/vat-rate-settings";

type SalesChannel =
  | "Inki Makisushi app"
  | "Inki Makisushi comande"
  | "Totem"
  | "Self Order Menu"
  | "e-Commerce"
  | "Mobile Commerce";

type ManagedProduct = Omit<ManagedProductRecord, "category" | "channels"> & {
  category: ProductCategory;
  channels: SalesChannel[];
};

type ProductModalState =
  | { mode: "create"; product: ManagedProduct }
  | { mode: "edit"; product: ManagedProduct };
const channelOptions: SalesChannel[] = [
  "Inki Makisushi app",
  "Totem",
  "e-Commerce",
  "Inki Makisushi comande",
  "Self Order Menu",
  "Mobile Commerce",
];

function getDefaultDepartment(category: ProductCategory) {
  if (category === "Food" || category === "Brunch") {
    return "cucina";
  }

  if (category === "Servizi") {
    return "servizi";
  }

  if (
    category === "Cocktail" ||
    category === "Cocktail classici" ||
    category === "Cocktail Canevone" ||
    category === "Cocktail analcolici" ||
    category === "Champagne" ||
    category === "Bollicine" ||
    category === "Vino" ||
    category === "Vini" ||
    category === "Vino mescita" ||
    category === "Birre" ||
    category === "Aperitivo" ||
    category === "Aperitivi" ||
    category === "Caffetteria" ||
    category === "Bevande" ||
    category === "Bibite" ||
    category === "Amari" ||
    category === "Distillati" ||
    category === "Spirits & Co" ||
    category === "Sakè"
  ) {
    return "bar";
  }

  return "cucina";
}

function createManagedProduct(product: Product): ManagedProduct {
  const defaultVatRate = getDefaultOperationalVatRate();

  return {
    id: product.id,
    name: product.name,
    category: product.category,
    price: product.price,
    pricePending: product.pricePending ?? false,
    department: getDefaultDepartment(product.category),
    favorite: false,
    buttonLabel: product.name,
    soldByWeight: false,
    taraGrams: "",
    color: "#f7f9fb",
    icon: "",
    receiptDescription: product.name,
    kitchenDescription: "",
    code: "",
    prebillDescription: product.name,
    barcode: "",
    hidden: false,
    channels: ["Inki Makisushi app", "Inki Makisushi comande"],
    vatRateKey: product.vatRateKey ?? defaultVatRate.key,
  };
}

function formatEuro(value: number) {
  return `EUR ${value.toFixed(2)}`;
}

function normalizeSearchValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function slugify(value: string) {
  return normalizeSearchValue(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function createEmptyProduct(): ManagedProduct {
  const defaultCategory = getProductCategories()[0];
  const defaultVatRate = getDefaultOperationalVatRate();

  return {
    id: `new-${Date.now()}`,
    name: "",
    category: defaultCategory,
    price: 0,
    pricePending: false,
    department: "altro",
    favorite: false,
    buttonLabel: "",
    soldByWeight: false,
    taraGrams: "",
    color: "#f7f9fb",
    icon: "",
    receiptDescription: "",
    kitchenDescription: "",
    code: "",
    prebillDescription: "",
    barcode: "",
    hidden: false,
    channels: ["Inki Makisushi app"],
    vatRateKey: defaultVatRate.key,
  };
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

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.7"
      className="h-4 w-4"
    >
      <path d="m12 3.8 2.5 5.1 5.6.8-4 4 1 5.7L12 16.7l-5.1 2.7 1-5.7-4-4 5.6-.8L12 3.8Z" />
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

export function ProductsSettingsView() {
  const [products, setProducts] = useState<ManagedProduct[]>(() => getProducts().map(createManagedProduct));
  const [departments, setDepartments] = useState<DepartmentRecord[]>(() => getDepartmentSettings());
  const [searchValue, setSearchValue] = useState("");
  const [modalState, setModalState] = useState<ProductModalState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ManagedProduct | null>(null);

  useEffect(() => {
    setDepartments(getDepartmentSettings());

    const handleDepartmentsChanged = () => {
      setDepartments(getDepartmentSettings());
    };

    window.addEventListener(DEPARTMENT_SETTINGS_CHANGED_EVENT, handleDepartmentsChanged);
    const applyProductsState = (parsedProducts: ManagedProduct[]) => {
      if (Array.isArray(parsedProducts) && parsedProducts.length > 0) {
        const baseProducts = getProducts().map(createManagedProduct);
        const strictCategories = new Set<ManagedProduct["category"]>([
          "Bao",
          "Uramaki classici",
          "Gunkan",
          "Ramen and soup",
          "Caffetteria",
          "Tempura",
          "Ravioli",
          "Hot",
          "Nigiri",
          "Futomaki",
          "Hosomaki",
          "Temaki",
          "Sashimi",
          "Crudità",
          "Inki box",
          "Chirashi",
          "Insalate",
          "Servizi",
          "Bollicine",
          "Sakè",
          "Bevande",
          "Birre",
        ]);
        const baseIds = new Set(baseProducts.map((product) => product.id));
        const normalizedStoredProducts = parsedProducts.map((product) =>
          ({
            ...product,
            department: normalizeDepartmentValue(product.department, getDefaultDepartment(product.category)),
            category:
              (product.category as string) === "Kirashi"
                ? ("Chirashi" as ManagedProduct["category"])
                : product.category,
            name:
              product.id === "coca-cola"
                ? "Coca-Cola"
                : product.id === "coca-cola-zero"
                  ? "Coca-Cola Zero"
                  : product.id === "soda-polpalmo" || product.id === "soda-al-pompelmo"
                    ? "Soda Polpalmo"
                    : product.id === "te-verde"
                      ? "Tè verde"
                      : product.id === "te-verde-al-gelsomino"
                        ? "Tè verde gelsomino"
                        : product.name,
            vatRateKey: product.vatRateKey ?? getDefaultOperationalVatRate().key,
          })
        );
        const cleanedStoredProducts = normalizedStoredProducts.filter(
          (product) => !strictCategories.has(product.category) || baseIds.has(product.id)
        );
        const storedIds = new Set(cleanedStoredProducts.map((product) => product.id));
        const missingBaseProducts = baseProducts.filter((product) => !storedIds.has(product.id));
        const mergedProducts = [...cleanedStoredProducts, ...missingBaseProducts];

        setProducts(mergedProducts);

        if (
          missingBaseProducts.length > 0 ||
          cleanedStoredProducts.length !== parsedProducts.length ||
          normalizedStoredProducts.some(
            (product, index) =>
                product.category !== parsedProducts[index]?.category ||
                product.department !== parsedProducts[index]?.department
          )
        ) {
          saveManagedProducts(mergedProducts);
        }
      }
    };

    applyProductsState(readStoredManagedProducts(getProducts().map(createManagedProduct)) as ManagedProduct[]);
    void hydrateCatalogConfigFromServer().then((state) => {
      if (Array.isArray(state.products) && state.products.length > 0) {
        applyProductsState(state.products as ManagedProduct[]);
      }
    });

    return () => {
      window.removeEventListener(DEPARTMENT_SETTINGS_CHANGED_EVENT, handleDepartmentsChanged);
    };
  }, []);

  const normalizedSearch = normalizeSearchValue(searchValue);
  const filteredProducts = useMemo(
    () =>
      products
        .filter((product) => normalizeSearchValue(product.name).includes(normalizedSearch))
        .sort((firstProduct, secondProduct) => firstProduct.name.localeCompare(secondProduct.name, "it")),
    [normalizedSearch, products]
  );
  const vatOptions = useMemo(
    () =>
      modalState
        ? getVatRateSelectionOptions(modalState.product.vatRateKey)
        : ([] as VatRateSelectionOption[]),
    [modalState]
  );
  const departmentLabelMap = useMemo(
    () => new Map(departments.map((department) => [department.slug, department.name])),
    [departments]
  );
  const departmentOptions = useMemo(() => {
    const activeDepartments = departments.filter((department) => department.is_active);
    const fallbackDepartments = activeDepartments.length > 0 ? activeDepartments : departments;

    if (!modalState) {
      return fallbackDepartments;
    }

    const currentDepartment = departments.find(
      (department) => department.slug === normalizeDepartmentValue(modalState.product.department)
    );

    if (currentDepartment && !fallbackDepartments.some((department) => department.slug === currentDepartment.slug)) {
      return [...fallbackDepartments, currentDepartment];
    }

    return fallbackDepartments;
  }, [departments, modalState]);

  const openCreateModal = () => {
    setModalState({ mode: "create", product: createEmptyProduct() });
  };

  const openEditModal = (product: ManagedProduct) => {
    setModalState({ mode: "edit", product: { ...product } });
  };

  const closeModal = () => {
    setModalState(null);
  };

  const updateModalProduct = <Key extends keyof ManagedProduct>(field: Key, value: ManagedProduct[Key]) => {
    setModalState((currentState) =>
      currentState
        ? {
            ...currentState,
            product: {
              ...currentState.product,
              [field]: value,
            },
          }
        : currentState
    );
  };

  const toggleChannel = (channel: SalesChannel) => {
    setModalState((currentState) => {
      if (!currentState) {
        return currentState;
      }

      const nextChannels = currentState.product.channels.includes(channel)
        ? currentState.product.channels.filter((entry) => entry !== channel)
        : [...currentState.product.channels, channel];

      return {
        ...currentState,
        product: {
          ...currentState.product,
          channels: nextChannels,
        },
      };
    });
  };

  const handleSaveProduct = () => {
    if (!modalState) {
      return;
    }

    const trimmedName = modalState.product.name.trim();
    if (!trimmedName) {
      return;
    }

    const nextPrice = Number(modalState.product.price);
    const safePrice = Number.isFinite(nextPrice) ? nextPrice : 0;
    const productToSave: ManagedProduct = {
      ...modalState.product,
      id:
        modalState.mode === "create"
          ? `custom-${slugify(trimmedName) || Date.now().toString()}`
          : modalState.product.id,
      name: trimmedName,
      buttonLabel: modalState.product.buttonLabel.trim() || trimmedName,
      receiptDescription: modalState.product.receiptDescription.trim() || trimmedName,
      prebillDescription: modalState.product.prebillDescription.trim() || trimmedName,
      price: safePrice,
      pricePending: modalState.product.pricePending && safePrice <= 0,
      department: normalizeDepartmentValue(modalState.product.department, getDefaultDepartment(modalState.product.category)),
      vatRateKey: modalState.product.vatRateKey || getDefaultOperationalVatRate().key,
    };

    setProducts((currentProducts) => {
      const nextProducts =
        modalState.mode === "create"
          ? [...currentProducts, productToSave]
          : currentProducts.map((product) => (product.id === productToSave.id ? productToSave : product));

      saveManagedProducts(nextProducts);
      void persistCatalogConfigToServer({ products: nextProducts });

      return nextProducts;
    });
    setModalState(null);
  };

  const confirmDelete = () => {
    if (!deleteTarget) {
      return;
    }

    setProducts((currentProducts) => {
      const nextProducts = currentProducts.filter((product) => product.id !== deleteTarget.id);
      saveManagedProducts(nextProducts);
      void persistCatalogConfigToServer({ products: nextProducts });
      return nextProducts;
    });
    setDeleteTarget(null);
  };

  return (
    <section className="relative flex min-h-0 flex-1 flex-col bg-[#fffefb]">
      <div className="border-b border-[#d8d5cc] bg-[#f7f4ee] px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-base font-bold text-[#2e2a25]">Prodotti</h2>
          <div className="flex items-center gap-2">
            <div className="flex h-10 items-center rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] px-3 text-[#6a645b]">
              <SearchIcon />
              <input
                type="text"
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder="Cerca prodotto"
                className="ml-2 h-full w-[240px] bg-transparent text-sm text-[#2e2a25] outline-none placeholder:text-[#9a948a]"
              />
            </div>
            <button
              type="button"
              onClick={openCreateModal}
              className="flex h-10 items-center gap-2 rounded-[4px] border border-[#b7cfe4] bg-[#cfe8ff] px-3 text-sm font-semibold text-[#0b3c5d]"
            >
              <PlusIcon />
              <span>Nuovo prodotto</span>
            </button>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col p-4">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[4px] border border-[#d8d5cc] bg-[#ffffff]">
          <div className="grid grid-cols-[minmax(0,1.6fr)_120px_120px_90px_56px_56px] items-center border-b border-[#d8d5cc] bg-[#fbf8f2] px-4 py-3 text-[11px] font-bold uppercase tracking-[0.04em] text-[#5d564e]">
            <div>Descrizione</div>
            <div className="text-right">Prezzo base</div>
            <div>Reparto</div>
            <div className="text-center">Preferito</div>
            <div className="text-center">Mod.</div>
            <div className="text-center">Elim.</div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto bg-white">
            {filteredProducts.map((product, index) => (
              <div
                key={product.id}
                className={[
                  "grid grid-cols-[minmax(0,1.6fr)_120px_120px_90px_56px_56px] items-center px-4 py-2 text-sm text-[#2e2a25]",
                  index !== filteredProducts.length - 1 ? "border-b border-[#ece7dd]" : "",
                ].join(" ")}
              >
                <button
                  type="button"
                  onClick={() => openEditModal(product)}
                  className="truncate pr-4 text-left font-medium hover:text-[#0b3c5d]"
                >
                  {product.name}
                </button>
                <div className="pr-3 text-right font-semibold text-[#433d36]">
                  {product.pricePending ? "Prezzo da definire" : formatEuro(product.price)}
                </div>
                <div className="text-xs font-semibold uppercase text-[#5d564e]">
                  {departmentLabelMap.get(normalizeDepartmentValue(product.department, "")) ??
                    getDepartmentDisplayName(product.department)}
                </div>
                <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={() =>
                        setProducts((currentProducts) => {
                          const nextProducts = currentProducts.map((entry) =>
                            entry.id === product.id ? { ...entry, favorite: !entry.favorite } : entry
                          );
                          saveManagedProducts(nextProducts);
                          void persistCatalogConfigToServer({ products: nextProducts });
                          return nextProducts;
                        })
                      }
                    className={[
                      "flex h-8 w-8 items-center justify-center rounded-[4px] border",
                      product.favorite
                        ? "border-[#b7cfe4] bg-[#e7f3ff] text-[#0b3c5d]"
                        : "border-[#d8d5cc] bg-[#ffffff] text-[#8b847b]",
                    ].join(" ")}
                    aria-label={`Preferito ${product.name}`}
                  >
                    <StarIcon filled={product.favorite} />
                  </button>
                </div>
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => openEditModal(product)}
                    className="flex h-8 w-8 items-center justify-center rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] text-[#2e2a25] hover:bg-[#fbf8f2]"
                    aria-label={`Modifica ${product.name}`}
                  >
                    <PencilIcon />
                  </button>
                </div>
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(product)}
                    className="flex h-8 w-8 items-center justify-center rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] text-[#7c2626] hover:bg-[#f6e3e3]"
                    aria-label={`Elimina ${product.name}`}
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>
            ))}
            {filteredProducts.length === 0 ? (
              <div className="px-4 py-6 text-sm text-[#6a645b]">Nessun prodotto trovato</div>
            ) : null}
          </div>
        </div>
      </div>

      {modalState ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/20 px-8 py-6">
          <div className="flex max-h-full w-full max-w-[1120px] flex-col overflow-hidden rounded-[6px] border border-[#d8d5cc] bg-[#ffffff] shadow-sm">
            <div className="border-b border-[#d8d5cc] bg-[#f7f4ee] px-5 py-4">
              <div className="text-base font-bold text-[#2e2a25]">
                {modalState.mode === "create" ? "Nuovo prodotto" : "Modifica prodotto"}
              </div>
            </div>

            <div className="min-h-0 overflow-y-auto px-5 py-5">
              <div className="space-y-5">
                <section className="rounded-[4px] border border-[#ddd9d0] bg-white p-4">
                  <div className="text-xs font-bold uppercase tracking-[0.04em] text-[#5d564e]">Generali</div>
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <label className="block">
                      <div className="mb-1 text-xs font-semibold text-[#5d564e]">Descrizione *</div>
                      <input
                        value={modalState.product.name}
                        onChange={(event) => updateModalProduct("name", event.target.value)}
                        className="h-10 w-full rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] px-3 text-sm outline-none"
                      />
                    </label>
                    <label className="block">
                      <div className="mb-1 text-xs font-semibold text-[#5d564e]">Descrizione sui bottoni *</div>
                      <input
                        value={modalState.product.buttonLabel}
                        onChange={(event) => updateModalProduct("buttonLabel", event.target.value)}
                        className="h-10 w-full rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] px-3 text-sm outline-none"
                      />
                    </label>
                    <label className="block">
                      <div className="mb-1 text-xs font-semibold text-[#5d564e]">Categoria *</div>
                      <select
                        value={modalState.product.category}
                        onChange={(event) => updateModalProduct("category", event.target.value as ProductCategory)}
                        className="h-10 w-full rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] px-3 text-sm outline-none"
                      >
                        {getProductCategories().map((category) => (
                          <option key={category} value={category}>
                            {category}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <div className="mb-1 text-xs font-semibold text-[#5d564e]">Reparto *</div>
                      <select
                        value={modalState.product.department}
                        onChange={(event) => updateModalProduct("department", event.target.value)}
                        className="h-10 w-full rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] px-3 text-sm outline-none"
                      >
                        {departmentOptions.map((department) => (
                          <option key={department.slug} value={department.slug}>
                            {department.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <label className="flex items-center gap-2 text-sm text-[#2e2a25]">
                      <input
                        type="checkbox"
                        checked={modalState.product.soldByWeight}
                        onChange={(event) => updateModalProduct("soldByWeight", event.target.checked)}
                      />
                      <span>Venduto al peso</span>
                    </label>
                    <label className="block">
                      <div className="mb-1 text-xs font-semibold text-[#5d564e]">Tara (grammi)</div>
                      <input
                        value={modalState.product.taraGrams}
                        onChange={(event) => updateModalProduct("taraGrams", event.target.value)}
                        className="h-10 w-full rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] px-3 text-sm outline-none"
                      />
                    </label>
                    <label className="block">
                      <div className="mb-1 text-xs font-semibold text-[#5d564e]">Selettore colore</div>
                      <input
                        type="color"
                        value={modalState.product.color}
                        onChange={(event) => updateModalProduct("color", event.target.value)}
                        className="h-10 w-full rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] px-2"
                      />
                    </label>
                    <div className="block">
                      <div className="mb-1 text-xs font-semibold text-[#5d564e]">Icona</div>
                      <button
                        type="button"
                        onClick={() => updateModalProduct("icon", modalState.product.icon ? "" : "icona")}
                        className="flex h-10 w-full items-center justify-between rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] px-3 text-sm text-[#2e2a25]"
                      >
                        <span>{modalState.product.icon || "Seleziona icona"}</span>
                        <span className="text-xs text-[#6a645b]">Placeholder</span>
                      </button>
                    </div>
                  </div>
                  <label className="mt-4 flex items-center gap-2 text-sm text-[#2e2a25]">
                    <input
                      type="checkbox"
                      checked={modalState.product.favorite}
                      onChange={(event) => updateModalProduct("favorite", event.target.checked)}
                    />
                    <span>Preferito</span>
                  </label>
                </section>

                <section className="rounded-[4px] border border-[#ddd9d0] bg-white p-4">
                  <div className="text-xs font-bold uppercase tracking-[0.04em] text-[#5d564e]">Prezzi</div>
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <label className="block">
                      <div className="mb-1 text-xs font-semibold text-[#5d564e]">Prezzo base *</div>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={modalState.product.price}
                        onChange={(event) => updateModalProduct("price", Number(event.target.value))}
                        className="h-10 w-full rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] px-3 text-sm outline-none"
                      />
                    </label>
                    <label className="block">
                      <div className="mb-1 text-xs font-semibold text-[#5d564e]">Aliquota IVA</div>
                      <select
                        value={modalState.product.vatRateKey}
                        onChange={(event) => updateModalProduct("vatRateKey", event.target.value)}
                        className="h-10 w-full rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] px-3 text-sm outline-none"
                      >
                        {vatOptions.map((vatRate) => (
                          <option key={vatRate.key} value={vatRate.key}>
                            {vatRate.historical ? `${vatRate.label} (storica)` : vatRate.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </section>

                <section className="rounded-[4px] border border-[#ddd9d0] bg-white p-4">
                  <div className="text-xs font-bold uppercase tracking-[0.04em] text-[#5d564e]">Dettaglio SKU</div>
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <label className="block">
                      <div className="mb-1 text-xs font-semibold text-[#5d564e]">Descrizione sullo scontrino *</div>
                      <input
                        value={modalState.product.receiptDescription}
                        onChange={(event) => updateModalProduct("receiptDescription", event.target.value)}
                        className="h-10 w-full rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] px-3 text-sm outline-none"
                      />
                    </label>
                    <label className="block">
                      <div className="mb-1 text-xs font-semibold text-[#5d564e]">Descrizione comanda</div>
                      <input
                        value={modalState.product.kitchenDescription}
                        onChange={(event) => updateModalProduct("kitchenDescription", event.target.value)}
                        className="h-10 w-full rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] px-3 text-sm outline-none"
                      />
                    </label>
                    <label className="block">
                      <div className="mb-1 text-xs font-semibold text-[#5d564e]">Codice</div>
                      <input
                        value={modalState.product.code}
                        onChange={(event) => updateModalProduct("code", event.target.value)}
                        className="h-10 w-full rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] px-3 text-sm outline-none"
                      />
                    </label>
                    <label className="block">
                      <div className="mb-1 text-xs font-semibold text-[#5d564e]">Descrizione sul preconto</div>
                      <input
                        value={modalState.product.prebillDescription}
                        onChange={(event) => updateModalProduct("prebillDescription", event.target.value)}
                        className="h-10 w-full rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] px-3 text-sm outline-none"
                      />
                    </label>
                    <label className="block md:col-span-2">
                      <div className="mb-1 text-xs font-semibold text-[#5d564e]">Codice a barre</div>
                      <input
                        value={modalState.product.barcode}
                        onChange={(event) => updateModalProduct("barcode", event.target.value)}
                        className="h-10 w-full rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] px-3 text-sm outline-none"
                      />
                    </label>
                  </div>
                  <label className="mt-4 flex items-center gap-2 text-sm text-[#2e2a25]">
                    <input
                      type="checkbox"
                      checked={modalState.product.hidden}
                      onChange={(event) => updateModalProduct("hidden", event.target.checked)}
                    />
                    <span>Elemento nascosto dalla schermata di vendita ed ordinazione</span>
                  </label>
                </section>

                <section className="rounded-[4px] border border-[#ddd9d0] bg-white p-4">
                  <div className="text-xs font-bold uppercase tracking-[0.04em] text-[#5d564e]">Canali di vendita</div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {channelOptions.map((channel) => (
                      <label key={channel} className="flex items-center gap-2 text-sm text-[#2e2a25]">
                        <input
                          type="checkbox"
                          checked={modalState.product.channels.includes(channel)}
                          onChange={() => toggleChannel(channel)}
                        />
                        <span>{channel}</span>
                      </label>
                    ))}
                  </div>
                </section>
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
                  onClick={handleSaveProduct}
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
            <div className="mt-2 text-sm text-[#5d564e]">{`Eliminare ${deleteTarget.name}?`}</div>
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
