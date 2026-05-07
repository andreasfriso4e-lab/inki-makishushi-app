"use client";

import { useEffect, useMemo, useState } from "react";

import { CompanyFormFields } from "@/components/company-form-fields";
import { createEmptyCompanyRecord, normalizeCompanyRecord } from "@/lib/company-records";
import { lookupCompanyByVatNumber } from "@/lib/company-vat-lookup";
import {
  getCustomers,
  getCompanies,
  hydrateBusinessDirectoryFromServer,
  persistBusinessDirectoryToServer,
  saveCompanies,
  type CompanyRecord,
} from "@/lib/pos-data";

type CompanyModalState =
  | { mode: "create"; company: CompanyRecord }
  | { mode: "edit"; company: CompanyRecord };

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

function scoreCompanySearch(company: CompanyRecord, normalizedSearch: string) {
  if (!normalizedSearch) {
    return 0;
  }

  const numericSearch = /^\d+$/.test(normalizedSearch);
  const normalizedName = normalizeSearchValue(company.name);
  const normalizedVat = normalizeSearchValue(company.vatNumber);

  if (numericSearch) {
    if (normalizedVat.startsWith(normalizedSearch)) {
      return 0;
    }

    if (normalizedVat.includes(normalizedSearch)) {
      return 1;
    }
  }

  if (normalizedName.startsWith(normalizedSearch)) {
    return 2;
  }

  if (normalizedName.includes(normalizedSearch)) {
    return 3;
  }

  if (normalizedVat.includes(normalizedSearch)) {
    return 4;
  }

  return 10;
}

export function CompaniesSettingsView() {
  const [companies, setCompanies] = useState<CompanyRecord[]>(() => getCompanies());
  const [searchValue, setSearchValue] = useState("");
  const [modalState, setModalState] = useState<CompanyModalState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CompanyRecord | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupMessage, setLookupMessage] = useState("");
  const [lookupError, setLookupError] = useState("");

  useEffect(() => {
    setCompanies(getCompanies());
    void hydrateBusinessDirectoryFromServer().then((directory) => {
      setCompanies(directory.companies);
    });
  }, []);

  const normalizedSearch = normalizeSearchValue(searchValue.trim());
  const filteredCompanies = useMemo(
    () =>
      companies
        .filter((company) => {
          if (!normalizedSearch) {
            return true;
          }

          const normalizedName = normalizeSearchValue(company.name);
          const normalizedVat = normalizeSearchValue(company.vatNumber);
          const normalizedTaxCode = normalizeSearchValue(company.taxCode ?? "");
          const normalizedCity = normalizeSearchValue(company.city ?? "");

          return (
            normalizedName.includes(normalizedSearch) ||
            normalizedVat.includes(normalizedSearch) ||
            normalizedTaxCode.includes(normalizedSearch) ||
            normalizedCity.includes(normalizedSearch)
          );
        })
        .sort((firstCompany, secondCompany) => {
          if (!normalizedSearch) {
            return firstCompany.name.localeCompare(secondCompany.name, "it");
          }

          const scoreDifference =
            scoreCompanySearch(firstCompany, normalizedSearch) -
            scoreCompanySearch(secondCompany, normalizedSearch);

          if (scoreDifference !== 0) {
            return scoreDifference;
          }

          return firstCompany.name.localeCompare(secondCompany.name, "it");
        }),
    [companies, normalizedSearch]
  );

  const updateModalCompany = <Key extends keyof CompanyRecord>(
    field: Key,
    value: CompanyRecord[Key]
  ) => {
    setLookupError("");
    setLookupMessage("");
    setModalState((currentState) =>
      currentState
        ? {
            ...currentState,
            company: {
              ...currentState.company,
              [field]: value,
            },
          }
        : currentState
    );
  };

  const closeModal = () => {
    setModalState(null);
    setLookupLoading(false);
    setLookupMessage("");
    setLookupError("");
  };

  const handleLookupCompany = async () => {
    if (!modalState) {
      return;
    }

    setLookupLoading(true);
    setLookupMessage("");
    setLookupError("");

    const result = await lookupCompanyByVatNumber(modalState.company.vatNumber, companies);

    setLookupLoading(false);

    if (!result.ok) {
      setLookupError(result.message);
      return;
    }

    setModalState((currentState) =>
      currentState
        ? {
            ...currentState,
            company: normalizeCompanyRecord({
              ...currentState.company,
              name: result.data.companyName || currentState.company.name,
              vatNumber: result.data.vatNumber || currentState.company.vatNumber,
              taxCode: result.data.taxCode || currentState.company.taxCode,
              sdiCode: result.data.sdiCode || currentState.company.sdiCode,
              pec: result.data.pec || currentState.company.pec,
              addressStreet: result.data.addressStreet || currentState.company.addressStreet,
              addressNumber: result.data.addressNumber || currentState.company.addressNumber,
              postalCode: result.data.postalCode || currentState.company.postalCode,
              city: result.data.city || currentState.company.city,
              province: result.data.province || currentState.company.province,
              country: result.data.country || currentState.company.country,
              phone: result.data.phone || currentState.company.phone,
              email: result.data.email || currentState.company.email,
              contactPerson: result.data.contactPerson || currentState.company.contactPerson,
              note: result.data.note || currentState.company.note,
              isActive: result.data.isActive ?? currentState.company.isActive,
            }),
          }
        : currentState
    );
    setLookupMessage(result.message || "Dati azienda recuperati.");
  };

  const handleSaveCompany = () => {
    if (!modalState) {
      return;
    }

    const trimmedName = modalState.company.name.trim();
    const trimmedVatNumber = modalState.company.vatNumber.trim();

    if (!trimmedName || !trimmedVatNumber) {
      return;
    }

    const companyToSave: CompanyRecord = {
      ...normalizeCompanyRecord(modalState.company),
      id:
        modalState.mode === "create"
          ? `company-${slugify(trimmedName) || Date.now().toString()}`
          : modalState.company.id,
      name: trimmedName,
      vatNumber: trimmedVatNumber,
    };

    setCompanies((currentCompanies) => {
      const nextCompanies =
        modalState.mode === "create"
          ? [...currentCompanies, companyToSave]
          : currentCompanies.map((company) =>
              company.id === companyToSave.id ? companyToSave : company
            );

      saveCompanies(nextCompanies);
      void persistBusinessDirectoryToServer(getCustomers(), nextCompanies).then((directory) => {
        setCompanies(directory.companies);
      });
      return nextCompanies;
    });
    setModalState(null);
  };

  const confirmDelete = () => {
    if (!deleteTarget) {
      return;
    }

    setCompanies((currentCompanies) => {
      const nextCompanies = currentCompanies.filter((company) => company.id !== deleteTarget.id);
      saveCompanies(nextCompanies);
      void persistBusinessDirectoryToServer(getCustomers(), nextCompanies).then((directory) => {
        setCompanies(directory.companies);
      });
      return nextCompanies;
    });
    setDeleteTarget(null);
  };

  return (
    <section className="relative flex min-h-0 flex-1 flex-col bg-[#fffefb]">
      <div className="border-b border-[#d8d5cc] bg-[#f7f4ee] px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-base font-bold text-[#2e2a25]">Aziende</h2>
          <div className="flex items-center gap-2">
            <div className="flex h-10 items-center rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] px-3 text-[#6a645b]">
              <SearchIcon />
              <input
                type="text"
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder="Cerca per partita IVA, ragione sociale o città"
                className="ml-2 h-full w-[280px] bg-transparent text-sm text-[#2e2a25] outline-none placeholder:text-[#9a948a]"
              />
            </div>
            <button
              type="button"
              onClick={() => setModalState({ mode: "create", company: createEmptyCompanyRecord() })}
              className="flex h-10 items-center gap-2 rounded-[4px] border border-[#b7cfe4] bg-[#cfe8ff] px-3 text-sm font-semibold text-[#0b3c5d]"
            >
              <PlusIcon />
              <span>Nuova azienda</span>
            </button>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col p-4">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[4px] border border-[#d8d5cc] bg-[#ffffff]">
          <div className="grid grid-cols-[minmax(0,1.3fr)_160px_160px_220px_56px_56px] items-center border-b border-[#d8d5cc] bg-[#fbf8f2] px-4 py-3 text-[11px] font-bold uppercase tracking-[0.04em] text-[#5d564e]">
            <div>Ragione sociale</div>
            <div>Partita IVA</div>
            <div>Codice fiscale</div>
            <div>Telefono / Email</div>
            <div className="text-center">Mod.</div>
            <div className="text-center">Elim.</div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto bg-white">
            {filteredCompanies.map((company, index) => (
              <div
                key={company.id}
                className={[
                  "grid grid-cols-[minmax(0,1.3fr)_160px_160px_220px_56px_56px] items-center px-4 py-2 text-sm text-[#2e2a25]",
                  index !== filteredCompanies.length - 1 ? "border-b border-[#ece7dd]" : "",
                ].join(" ")}
              >
                <button
                  type="button"
                  onClick={() => setModalState({ mode: "edit", company: { ...company } })}
                  className="truncate text-left font-medium hover:underline"
                >
                  {company.name}
                </button>
                <div className="truncate text-xs text-[#5d564e]">{company.vatNumber}</div>
                <div className="truncate text-xs text-[#5d564e]">{company.taxCode || "—"}</div>
                <div className="truncate text-xs text-[#5d564e]">
                  {company.phone || company.email || "—"}
                </div>
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => setModalState({ mode: "edit", company: { ...company } })}
                    className="flex h-9 w-9 items-center justify-center rounded-[4px] border border-[#d8d5cc] bg-[#ffffff] text-[#4d473f] hover:bg-[#fbf8f2]"
                    aria-label={`Modifica ${company.name}`}
                  >
                    <PencilIcon />
                  </button>
                </div>
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(company)}
                    className="flex h-9 w-9 items-center justify-center rounded-[4px] border border-[#e1c7c7] bg-[#faf4f4] text-[#8b3a3a] hover:bg-[#f3dede]"
                    aria-label={`Elimina ${company.name}`}
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>
            ))}

            {filteredCompanies.length === 0 ? (
              <div className="px-4 py-6 text-sm text-[#7a736a]">Nessuna azienda trovata</div>
            ) : null}
          </div>
        </div>
      </div>

      {modalState ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/20 px-6 py-6">
          <div className="flex max-h-full w-full max-w-[860px] flex-col overflow-hidden rounded-[6px] border border-[#d8d5cc] bg-[#ffffff]">
            <div className="border-b border-[#d8d5cc] bg-[#f7f4ee] px-5 py-4">
              <div className="text-base font-bold text-[#2e2a25]">
                {modalState.mode === "create" ? "Nuova azienda" : "Modifica azienda"}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <CompanyFormFields
                company={modalState.company}
                onChange={updateModalCompany}
                onLookup={handleLookupCompany}
                lookupLoading={lookupLoading}
                lookupMessage={lookupMessage}
                lookupError={lookupError}
              />
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
                  onClick={handleSaveCompany}
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
          <div className="w-full max-w-[360px] rounded-[6px] border border-[#d8d5cc] bg-[#ffffff] p-5">
            <div className="text-base font-bold text-[#2e2a25]">Conferma eliminazione</div>
            <div className="mt-2 text-sm text-[#5d564e]">{`Eliminare l'azienda ${deleteTarget.name}?`}</div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="h-10 rounded-[4px] border border-[#c7c1b6] bg-[#ffffff] px-4 text-sm font-semibold text-[#2e2a25]"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="h-10 rounded-[4px] border border-[#e1c7c7] bg-[#f7e0e0] px-4 text-sm font-semibold text-[#8b3a3a]"
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
