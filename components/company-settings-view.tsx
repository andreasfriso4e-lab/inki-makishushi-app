"use client";

import { useEffect, useState } from "react";
import { getRestaurantConfig } from "@/lib/restaurant-config";
import { getRestaurantStorageKey } from "@/lib/restaurant-storage";

type CompanySettingsState = {
  businessName: string;
  tradeName: string;
  vatNumber: string;
  taxCode: string;
  address: string;
  postalCode: string;
  city: string;
  province: string;
  country: string;
  phone: string;
  email: string;
  pec: string;
  sdiCode: string;
  website: string;
  vatRegime: string;
  reaNumber: string;
  shareCapital: string;
  businessType: string;
  receiptHeader: string;
  invoiceHeader: string;
  documentFooter: string;
};

const initialState: CompanySettingsState = getRestaurantConfig().company ?? {
  businessName: "Ristorante Demo Srl",
  tradeName: "Inki Makisushi app",
  vatNumber: "01234567890",
  taxCode: "01234567890",
  address: "Via Roma 25",
  postalCode: "20100",
  city: "Milano",
  province: "MI",
  country: "Italia",
  phone: "+39 02 1234567",
  email: "info@ristorantedemo.it",
  pec: "demo@pec.it",
  sdiCode: "ABC1234",
  website: "www.ristorantedemo.it",
  vatRegime: "Ordinario",
  reaNumber: "MI-1234567",
  shareCapital: "10000",
  businessType: "Ristorazione",
  receiptHeader: "Grazie per averci scelto",
  invoiceHeader: "Ristorante Demo Srl",
  documentFooter: "Arrivederci e a presto",
};

const COMPANY_SETTINGS_STORAGE_KEY = getRestaurantStorageKey("pos-settings-company");

type CompanySettingsErrors = Partial<Record<keyof CompanySettingsState, string>>;

export function CompanySettingsView() {
  const [savedValues, setSavedValues] = useState<CompanySettingsState>(initialState);
  const [formValues, setFormValues] = useState<CompanySettingsState>(initialState);
  const [fieldErrors, setFieldErrors] = useState<CompanySettingsErrors>({});
  const [saveSuccessMessage, setSaveSuccessMessage] = useState("");
  const [saveErrorMessage, setSaveErrorMessage] = useState("");

  useEffect(() => {
    const storedCompanySettings = window.localStorage.getItem(COMPANY_SETTINGS_STORAGE_KEY);

    if (!storedCompanySettings) {
      return;
    }

    try {
      const parsedCompanySettings = JSON.parse(storedCompanySettings) as CompanySettingsState;
      setSavedValues(parsedCompanySettings);
      setFormValues(parsedCompanySettings);
    } catch {
      window.localStorage.removeItem(COMPANY_SETTINGS_STORAGE_KEY);
    }
  }, []);

  const updateField = <Key extends keyof CompanySettingsState>(
    field: Key,
    value: CompanySettingsState[Key]
  ) => {
    setSaveSuccessMessage("");
    setSaveErrorMessage("");
    setFormValues((currentValues) => ({
      ...currentValues,
      [field]: value,
    }));
    setFieldErrors((currentErrors) => {
      if (!currentErrors[field]) {
        return currentErrors;
      }

      const nextErrors = { ...currentErrors };
      delete nextErrors[field];
      return nextErrors;
    });
  };

  const handleCancel = () => {
    setSaveSuccessMessage("");
    setSaveErrorMessage("");
    setFieldErrors({});
    setFormValues(savedValues);
  };

  const validateForm = () => {
    const nextErrors: CompanySettingsErrors = {};

    if (!formValues.businessName.trim()) {
      nextErrors.businessName = "Inserisci la ragione sociale.";
    }

    if (!formValues.vatNumber.trim()) {
      nextErrors.vatNumber = "Inserisci la partita IVA.";
    }

    if (!formValues.taxCode.trim()) {
      nextErrors.taxCode = "Inserisci il codice fiscale.";
    }

    if (!formValues.address.trim()) {
      nextErrors.address = "Inserisci l'indirizzo.";
    }

    if (!formValues.city.trim()) {
      nextErrors.city = "Inserisci la citta'.";
    }

    if (!formValues.country.trim()) {
      nextErrors.country = "Inserisci la nazione.";
    }

    if (!formValues.email.trim()) {
      nextErrors.email = "Inserisci l'email.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formValues.email.trim())) {
      nextErrors.email = "Inserisci un'email valida.";
    }

    if (formValues.pec.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formValues.pec.trim())) {
      nextErrors.pec = "Inserisci una PEC valida.";
    }

    return nextErrors;
  };

  const handleSave = () => {
    const validationErrors = validateForm();

    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(validationErrors);
      setSaveSuccessMessage("");
      setSaveErrorMessage("Controlla i campi evidenziati.");
      return;
    }

    try {
      window.localStorage.setItem(COMPANY_SETTINGS_STORAGE_KEY, JSON.stringify(formValues));
      const persistedValues = window.localStorage.getItem(COMPANY_SETTINGS_STORAGE_KEY);
      const parsedValues = persistedValues
        ? (JSON.parse(persistedValues) as CompanySettingsState)
        : formValues;

      setSavedValues(parsedValues);
      setFormValues(parsedValues);
      setFieldErrors({});
      setSaveErrorMessage("");
      setSaveSuccessMessage("Ragione sociale salvata");
    } catch {
      setSaveSuccessMessage("");
      setSaveErrorMessage("Errore durante il salvataggio. Riprova.");
    }
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-[#fffefb]">
      <div className="border-b border-[#d8d5cc] bg-[#f7f4ee] px-4 py-3">
        <h2 className="text-base font-bold text-[#2e2a25]">Ragione sociale</h2>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          <section className="rounded-[6px] border border-[#d8d5cc] bg-[#ffffff] p-4">
            <div className="text-xs font-bold uppercase tracking-[0.04em] text-[#5d564e]">
              Dati aziendali
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="block">
                <div className="mb-1 text-xs font-semibold text-[#5d564e]">Ragione sociale</div>
                <input
                  value={formValues.businessName}
                  onChange={(event) => updateField("businessName", event.target.value)}
                  aria-invalid={fieldErrors.businessName ? "true" : "false"}
                  className={[
                    "h-10 w-full rounded-[4px] bg-white px-3 text-sm outline-none",
                    fieldErrors.businessName ? "border border-[#c95a5a]" : "border border-[#d8d5cc]",
                  ].join(" ")}
                />
                {fieldErrors.businessName ? (
                  <div className="mt-1 text-xs text-[#b44343]">{fieldErrors.businessName}</div>
                ) : null}
              </label>
              <label className="block">
                <div className="mb-1 text-xs font-semibold text-[#5d564e]">Nome insegna</div>
                <input
                  value={formValues.tradeName}
                  onChange={(event) => updateField("tradeName", event.target.value)}
                  className="h-10 w-full rounded-[4px] border border-[#d8d5cc] bg-white px-3 text-sm outline-none"
                />
              </label>
              <label className="block">
                <div className="mb-1 text-xs font-semibold text-[#5d564e]">Partita IVA</div>
                <input
                  value={formValues.vatNumber}
                  onChange={(event) => updateField("vatNumber", event.target.value)}
                  aria-invalid={fieldErrors.vatNumber ? "true" : "false"}
                  className={[
                    "h-10 w-full rounded-[4px] bg-white px-3 text-sm outline-none",
                    fieldErrors.vatNumber ? "border border-[#c95a5a]" : "border border-[#d8d5cc]",
                  ].join(" ")}
                />
                {fieldErrors.vatNumber ? (
                  <div className="mt-1 text-xs text-[#b44343]">{fieldErrors.vatNumber}</div>
                ) : null}
              </label>
              <label className="block">
                <div className="mb-1 text-xs font-semibold text-[#5d564e]">Codice fiscale</div>
                <input
                  value={formValues.taxCode}
                  onChange={(event) => updateField("taxCode", event.target.value)}
                  aria-invalid={fieldErrors.taxCode ? "true" : "false"}
                  className={[
                    "h-10 w-full rounded-[4px] bg-white px-3 text-sm outline-none",
                    fieldErrors.taxCode ? "border border-[#c95a5a]" : "border border-[#d8d5cc]",
                  ].join(" ")}
                />
                {fieldErrors.taxCode ? (
                  <div className="mt-1 text-xs text-[#b44343]">{fieldErrors.taxCode}</div>
                ) : null}
              </label>
              <label className="block md:col-span-2">
                <div className="mb-1 text-xs font-semibold text-[#5d564e]">Indirizzo</div>
                <input
                  value={formValues.address}
                  onChange={(event) => updateField("address", event.target.value)}
                  aria-invalid={fieldErrors.address ? "true" : "false"}
                  className={[
                    "h-10 w-full rounded-[4px] bg-white px-3 text-sm outline-none",
                    fieldErrors.address ? "border border-[#c95a5a]" : "border border-[#d8d5cc]",
                  ].join(" ")}
                />
                {fieldErrors.address ? (
                  <div className="mt-1 text-xs text-[#b44343]">{fieldErrors.address}</div>
                ) : null}
              </label>
              <label className="block">
                <div className="mb-1 text-xs font-semibold text-[#5d564e]">CAP</div>
                <input
                  value={formValues.postalCode}
                  onChange={(event) => updateField("postalCode", event.target.value)}
                  className="h-10 w-full rounded-[4px] border border-[#d8d5cc] bg-white px-3 text-sm outline-none"
                />
              </label>
              <label className="block">
                <div className="mb-1 text-xs font-semibold text-[#5d564e]">Città</div>
                <input
                  value={formValues.city}
                  onChange={(event) => updateField("city", event.target.value)}
                  aria-invalid={fieldErrors.city ? "true" : "false"}
                  className={[
                    "h-10 w-full rounded-[4px] bg-white px-3 text-sm outline-none",
                    fieldErrors.city ? "border border-[#c95a5a]" : "border border-[#d8d5cc]",
                  ].join(" ")}
                />
                {fieldErrors.city ? (
                  <div className="mt-1 text-xs text-[#b44343]">{fieldErrors.city}</div>
                ) : null}
              </label>
              <label className="block">
                <div className="mb-1 text-xs font-semibold text-[#5d564e]">Provincia</div>
                <input
                  value={formValues.province}
                  onChange={(event) => updateField("province", event.target.value)}
                  className="h-10 w-full rounded-[4px] border border-[#d8d5cc] bg-white px-3 text-sm outline-none"
                />
              </label>
              <label className="block">
                <div className="mb-1 text-xs font-semibold text-[#5d564e]">Nazione</div>
                <input
                  value={formValues.country}
                  onChange={(event) => updateField("country", event.target.value)}
                  aria-invalid={fieldErrors.country ? "true" : "false"}
                  className={[
                    "h-10 w-full rounded-[4px] bg-white px-3 text-sm outline-none",
                    fieldErrors.country ? "border border-[#c95a5a]" : "border border-[#d8d5cc]",
                  ].join(" ")}
                />
                {fieldErrors.country ? (
                  <div className="mt-1 text-xs text-[#b44343]">{fieldErrors.country}</div>
                ) : null}
              </label>
              <label className="block">
                <div className="mb-1 text-xs font-semibold text-[#5d564e]">Telefono</div>
                <input
                  value={formValues.phone}
                  onChange={(event) => updateField("phone", event.target.value)}
                  className="h-10 w-full rounded-[4px] border border-[#d8d5cc] bg-white px-3 text-sm outline-none"
                />
              </label>
              <label className="block">
                <div className="mb-1 text-xs font-semibold text-[#5d564e]">Email</div>
                <input
                  value={formValues.email}
                  onChange={(event) => updateField("email", event.target.value)}
                  aria-invalid={fieldErrors.email ? "true" : "false"}
                  className={[
                    "h-10 w-full rounded-[4px] bg-white px-3 text-sm outline-none",
                    fieldErrors.email ? "border border-[#c95a5a]" : "border border-[#d8d5cc]",
                  ].join(" ")}
                />
                {fieldErrors.email ? (
                  <div className="mt-1 text-xs text-[#b44343]">{fieldErrors.email}</div>
                ) : null}
              </label>
              <label className="block">
                <div className="mb-1 text-xs font-semibold text-[#5d564e]">PEC</div>
                <input
                  value={formValues.pec}
                  onChange={(event) => updateField("pec", event.target.value)}
                  aria-invalid={fieldErrors.pec ? "true" : "false"}
                  className={[
                    "h-10 w-full rounded-[4px] bg-white px-3 text-sm outline-none",
                    fieldErrors.pec ? "border border-[#c95a5a]" : "border border-[#d8d5cc]",
                  ].join(" ")}
                />
                {fieldErrors.pec ? (
                  <div className="mt-1 text-xs text-[#b44343]">{fieldErrors.pec}</div>
                ) : null}
              </label>
              <label className="block">
                <div className="mb-1 text-xs font-semibold text-[#5d564e]">Codice SDI</div>
                <input
                  value={formValues.sdiCode}
                  onChange={(event) => updateField("sdiCode", event.target.value)}
                  className="h-10 w-full rounded-[4px] border border-[#d8d5cc] bg-white px-3 text-sm outline-none"
                />
              </label>
              <label className="block md:col-span-2">
                <div className="mb-1 text-xs font-semibold text-[#5d564e]">Sito web</div>
                <input
                  value={formValues.website}
                  onChange={(event) => updateField("website", event.target.value)}
                  className="h-10 w-full rounded-[4px] border border-[#d8d5cc] bg-white px-3 text-sm outline-none"
                />
              </label>
            </div>
          </section>

          <section className="rounded-[6px] border border-[#d8d5cc] bg-[#ffffff] p-4">
            <div className="text-xs font-bold uppercase tracking-[0.04em] text-[#5d564e]">
              Sezione fiscale
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="block">
                <div className="mb-1 text-xs font-semibold text-[#5d564e]">Regime IVA</div>
                <input
                  value={formValues.vatRegime}
                  onChange={(event) => updateField("vatRegime", event.target.value)}
                  className="h-10 w-full rounded-[4px] border border-[#d8d5cc] bg-white px-3 text-sm outline-none"
                />
              </label>
              <label className="block">
                <div className="mb-1 text-xs font-semibold text-[#5d564e]">Numero REA</div>
                <input
                  value={formValues.reaNumber}
                  onChange={(event) => updateField("reaNumber", event.target.value)}
                  className="h-10 w-full rounded-[4px] border border-[#d8d5cc] bg-white px-3 text-sm outline-none"
                />
              </label>
              <label className="block">
                <div className="mb-1 text-xs font-semibold text-[#5d564e]">Capitale sociale</div>
                <input
                  value={formValues.shareCapital}
                  onChange={(event) => updateField("shareCapital", event.target.value)}
                  className="h-10 w-full rounded-[4px] border border-[#d8d5cc] bg-white px-3 text-sm outline-none"
                />
              </label>
              <label className="block">
                <div className="mb-1 text-xs font-semibold text-[#5d564e]">Tipo attività</div>
                <input
                  value={formValues.businessType}
                  onChange={(event) => updateField("businessType", event.target.value)}
                  className="h-10 w-full rounded-[4px] border border-[#d8d5cc] bg-white px-3 text-sm outline-none"
                />
              </label>
            </div>
          </section>

          <section className="rounded-[6px] border border-[#d8d5cc] bg-[#ffffff] p-4">
            <div className="text-xs font-bold uppercase tracking-[0.04em] text-[#5d564e]">
              Sezione documenti
            </div>
            <div className="mt-4 grid gap-4">
              <label className="block">
                <div className="mb-1 text-xs font-semibold text-[#5d564e]">Intestazione scontrino</div>
                <textarea
                  value={formValues.receiptHeader}
                  onChange={(event) => updateField("receiptHeader", event.target.value)}
                  className="min-h-[96px] w-full rounded-[4px] border border-[#d8d5cc] bg-white px-3 py-2 text-sm outline-none"
                />
              </label>
              <label className="block">
                <div className="mb-1 text-xs font-semibold text-[#5d564e]">Intestazione fattura</div>
                <textarea
                  value={formValues.invoiceHeader}
                  onChange={(event) => updateField("invoiceHeader", event.target.value)}
                  className="min-h-[96px] w-full rounded-[4px] border border-[#d8d5cc] bg-white px-3 py-2 text-sm outline-none"
                />
              </label>
              <label className="block">
                <div className="mb-1 text-xs font-semibold text-[#5d564e]">Piè di pagina documento</div>
                <textarea
                  value={formValues.documentFooter}
                  onChange={(event) => updateField("documentFooter", event.target.value)}
                  className="min-h-[96px] w-full rounded-[4px] border border-[#d8d5cc] bg-white px-3 py-2 text-sm outline-none"
                />
              </label>
            </div>
          </section>
        </div>
      </div>

      <div className="border-t border-[#d8d5cc] bg-[#f3f0e8] px-4 py-4">
        {saveErrorMessage ? (
          <div className="mb-3 text-sm font-semibold text-[#b44343]">{saveErrorMessage}</div>
        ) : null}
        {saveSuccessMessage ? (
          <div className="mb-3 text-sm font-semibold text-[#356b3c]">{saveSuccessMessage}</div>
        ) : null}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={handleCancel}
            className="h-10 rounded-[4px] border border-[#c7c1b6] bg-[#ffffff] px-4 text-sm font-semibold text-[#2e2a25]"
          >
            Annulla
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="h-10 rounded-[4px] border border-[#8db5d4] bg-[#cfe8ff] px-5 text-sm font-semibold text-[#0b3c5d]"
          >
            Salva modifiche
          </button>
        </div>
      </div>
    </section>
  );
}
