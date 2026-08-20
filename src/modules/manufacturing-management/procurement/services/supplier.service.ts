import { Supplier } from "../types";
import {
    fetchSuppliers,
    fetchActiveSupplierCurrencies,
    createSupplier,
    updateSupplier,
    fetchLinkedProducts,
    linkProductToSupplier,
    unlinkProductFromSupplier,
    saveSupplierCatalogUpdates,
    fetchPHProvinces,
    fetchPHCities,
    fetchPHBarangays
} from "./procurement-api";
import { isForeignCountry } from "../supplier-country";

export {
    fetchSuppliers,
    fetchActiveSupplierCurrencies,
    createSupplier,
    updateSupplier,
    fetchLinkedProducts,
    linkProductToSupplier,
    unlinkProductFromSupplier,
    saveSupplierCatalogUpdates,
    fetchPHProvinces,
    fetchPHCities,
    fetchPHBarangays
};

export const isSupplierActive = (supplier: Supplier): boolean => Number(supplier.isActive) !== 0;

export const isSupplierNonBuy = (supplier: Supplier): boolean => supplier.nonBuy === true || Number(supplier.nonBuy) === 1;

export const isSupplierForeign = (s: Supplier | null | undefined): boolean => {
    if (!s) return false;
    if (Number(s.is_foreign) === 1 || (s.is_foreign as unknown) === true) return true;
    const curr = String(s.currency || s.default_currency || "").toUpperCase();
    if (curr && curr !== "PHP") return true;
    return isForeignCountry(s.country);
};

export const cleanNotes = (notes: string | null | undefined): string => {
    if (!notes) return "";
    return notes.replace(/\[Currency:\s*\w+\]/, "").trim();
};
