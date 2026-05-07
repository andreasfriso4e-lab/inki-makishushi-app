import type { CompanyRecord } from "@/lib/pos-data";

function sanitizeText(value: string | undefined | null) {
  return value?.trim() ?? "";
}

export function buildCompanyAddress(addressStreet?: string, addressNumber?: string) {
  const street = sanitizeText(addressStreet);
  const number = sanitizeText(addressNumber);

  if (street && number) {
    return `${street} ${number}`.trim();
  }

  return street || number;
}

export function splitCompanyAddress(address?: string) {
  const trimmedAddress = sanitizeText(address);

  if (!trimmedAddress) {
    return { addressStreet: "", addressNumber: "" };
  }

  const match = trimmedAddress.match(/^(.*?)(?:\s+(\d[\w/-]*))?$/);

  if (!match) {
    return { addressStreet: trimmedAddress, addressNumber: "" };
  }

  return {
    addressStreet: sanitizeText(match[1]) || trimmedAddress,
    addressNumber: sanitizeText(match[2]),
  };
}

export function createEmptyCompanyRecord(): CompanyRecord {
  return {
    id: `company-${Date.now()}`,
    name: "",
    vatNumber: "",
    taxCode: "",
    sdiCode: "",
    pec: "",
    address: "",
    addressStreet: "",
    addressNumber: "",
    postalCode: "",
    city: "",
    province: "",
    country: "Italia",
    contactPerson: "",
    phone: "",
    email: "",
    note: "",
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function normalizeCompanyRecord(company: Partial<CompanyRecord>): CompanyRecord {
  const fallbackAddressParts = splitCompanyAddress(company.address);
  const addressStreet = sanitizeText(company.addressStreet) || fallbackAddressParts.addressStreet;
  const addressNumber = sanitizeText(company.addressNumber) || fallbackAddressParts.addressNumber;
  const address = buildCompanyAddress(addressStreet, addressNumber);
  const createdAt = sanitizeText(company.createdAt) || new Date().toISOString();

  return {
    id: sanitizeText(company.id) || `company-${Date.now()}`,
    name: sanitizeText(company.name),
    vatNumber: sanitizeText(company.vatNumber),
    taxCode: sanitizeText(company.taxCode),
    sdiCode: sanitizeText(company.sdiCode),
    pec: sanitizeText(company.pec),
    address,
    addressStreet,
    addressNumber,
    postalCode: sanitizeText(company.postalCode),
    city: sanitizeText(company.city),
    province: sanitizeText(company.province),
    country: sanitizeText(company.country) || "Italia",
    contactPerson: sanitizeText(company.contactPerson),
    phone: sanitizeText(company.phone),
    email: sanitizeText(company.email),
    note: sanitizeText(company.note),
    isActive: company.isActive ?? true,
    createdAt,
    updatedAt: new Date().toISOString(),
  };
}
