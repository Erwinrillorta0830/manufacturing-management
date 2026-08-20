// src/app/api/fm/accounting/discount-management/supplier-discounting/_module-data.ts
import type { SupplierDiscountModuleData } from "@/modules/manufacturing-management/financial-management/discount-management/supplier-discounting/types";
import {
  asNumber,
  asString,
  brandParams,
  categoryParams,
  directusFetch,
  discountTypeParams,
  DirectusList,
  supplierParams,
} from "./_utils";

type SupplierRow = {
  id?: unknown;
  supplier_name?: unknown;
  supplier_shortcut?: unknown;
};

type CategoryRow = {
  category_id?: unknown;
  category_name?: unknown;
};

type BrandRow = {
  brand_id?: unknown;
  brand_name?: unknown;
};

type DiscountTypeRow = {
  id?: unknown;
  discount_type?: unknown;
  total_percent?: unknown;
};

export async function getSupplierDiscountingModuleData(): Promise<SupplierDiscountModuleData> {
  const [suppliersRes, categoriesRes, brandsRes, discountTypesRes] = await Promise.all([
    directusFetch<DirectusList<SupplierRow>>(`/items/suppliers?${supplierParams().toString()}`),
    directusFetch<DirectusList<CategoryRow>>(`/items/categories?${categoryParams().toString()}`),
    directusFetch<DirectusList<BrandRow>>(`/items/brand?${brandParams().toString()}`),
    directusFetch<DirectusList<DiscountTypeRow>>(`/items/discount_type?${discountTypeParams().toString()}`),
  ]);

  return {
    suppliers: (suppliersRes.data ?? [])
      .map((row) => ({
        id: asNumber(row.id) ?? 0,
        supplierName: asString(row.supplier_name),
        supplierShortcut: asString(row.supplier_shortcut),
      }))
      .filter((row) => row.id > 0 && row.supplierName),
    categories: (categoriesRes.data ?? [])
      .map((row) => ({
        categoryId: asNumber(row.category_id) ?? 0,
        categoryName: asString(row.category_name),
      }))
      .filter((row) => row.categoryId > 0 && row.categoryName),
    brands: (brandsRes.data ?? [])
      .map((row) => ({
        brandId: asNumber(row.brand_id) ?? 0,
        brandName: asString(row.brand_name),
      }))
      .filter((row) => row.brandId > 0 && row.brandName),
    discountTypes: (discountTypesRes.data ?? [])
      .map((row) => ({
        id: asNumber(row.id) ?? 0,
        discountType: asString(row.discount_type),
        totalPercent: asNumber(row.total_percent) ?? 0,
      }))
      .filter((row) => row.id > 0 && row.discountType),
  };
}
