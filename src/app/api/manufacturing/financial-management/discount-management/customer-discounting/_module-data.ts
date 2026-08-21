// src/app/api/fm/accounting/discount-management/customer-discounting/_module-data.ts
import type { CustomerDiscountingModuleData } from "@/modules/manufacturing-management/financial-management/discount-management/customer-discounting";
import {
  asNumber,
  asString,
  directusFetch,
  discountLabel,
  discountTypeParams,
  DirectusList,
  relationId,
  relationName,
  storeTypeParams,
  tradeSupplierParams,
} from "./_utils";

type CustomerRow = {
  id?: unknown;
  customer_code?: unknown;
  customer_name?: unknown;
  store_name?: unknown;
  store_type?: unknown;
  discount_type?: unknown;
};

type StoreTypeRow = {
  id?: unknown;
  store_type?: unknown;
};

type DiscountTypeRow = {
  id?: unknown;
  discount_type?: unknown;
  total_percent?: unknown;
};

type SupplierRow = {
  id?: unknown;
  supplier_name?: unknown;
  supplier_shortcut?: unknown;
};

type ModuleDataQuery = {
  page?: number;
  pageSize?: number;
  search?: string;
  storeTypeId?: number | null;
};

const defaultPageSize = 10;
const maxPageSize = 100;

/**
 * Coerces incoming page values into a positive page number for Directus offsets.
 */
function normalizePage(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
}

/**
 * Keeps requested page sizes within the supported customer-discounting bounds.
 */
function normalizePageSize(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return defaultPageSize;
  return Math.min(maxPageSize, Math.floor(parsed));
}

/**
 * Builds the Directus customer list query, including active filtering and search.
 */
function customerParams(query: Required<ModuleDataQuery>) {
  const params = new URLSearchParams();
  const offset = (query.page - 1) * query.pageSize;
  const search = query.search.trim();
  let filterIndex = 0;

  params.set("limit", String(query.pageSize));
  params.set("offset", String(offset));
  params.set("meta", "filter_count");
  params.set("sort", "customer_name");
  params.set(
    "fields",
    [
      "id",
      "customer_code",
      "customer_name",
      "store_name",
      "store_type",
      "store_type.id",
      "store_type.store_type",
      "isActive",
      "discount_type",
      "discount_type.id",
      "discount_type.discount_type",
      "discount_type.total_percent",
    ].join(","),
  );

  params.set(`filter[_and][${filterIndex}][isActive][_eq]`, "1");
  filterIndex += 1;

  if (query.storeTypeId) {
    params.set(`filter[_and][${filterIndex}][store_type][_eq]`, String(query.storeTypeId));
    filterIndex += 1;
  }

  if (search) {
    params.set(`filter[_and][${filterIndex}][_or][0][customer_name][_contains]`, search);
    params.set(`filter[_and][${filterIndex}][_or][1][customer_code][_contains]`, search);
    params.set(`filter[_and][${filterIndex}][_or][2][store_name][_contains]`, search);
  }

  return params;
}

/**
 * Loads the server-rendered customer-discounting dashboard data in one pass.
 */
export async function getCustomerDiscountingModuleData(query: ModuleDataQuery = {}): Promise<CustomerDiscountingModuleData> {
  const normalizedQuery = {
    page: normalizePage(query.page),
    pageSize: normalizePageSize(query.pageSize),
    search: asString(query.search),
    storeTypeId: query.storeTypeId ?? null,
  };

  const [customersRes, discountTypesRes, storeTypesRes, suppliersRes] = await Promise.all([
    directusFetch<DirectusList<CustomerRow>>(`/items/customer?${customerParams(normalizedQuery).toString()}`),
    directusFetch<DirectusList<DiscountTypeRow>>(`/items/discount_type?${discountTypeParams().toString()}`),
    directusFetch<DirectusList<StoreTypeRow>>(`/items/store_type?${storeTypeParams().toString()}`),
    directusFetch<DirectusList<SupplierRow>>(`/items/suppliers?${tradeSupplierParams().toString()}`),
  ]);

  const total = asNumber(customersRes.meta?.filter_count) ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / normalizedQuery.pageSize));

  if (total > 0 && normalizedQuery.page > totalPages) {
    return getCustomerDiscountingModuleData({ ...normalizedQuery, page: totalPages });
  }

  const customers = (customersRes.data ?? [])
    .map((row) => ({
      id: asNumber(row.id) ?? 0,
      customerCode: asString(row.customer_code),
      customerName: asString(row.customer_name),
      storeName: asString(row.store_name),
      storeTypeId: relationId(row.store_type),
      storeTypeName: relationName(row.store_type, "store_type"),
      globalDiscount: discountLabel(row.discount_type),
    }))
    .filter((row) => row.id > 0 && row.customerCode && row.customerName);

  const discountTypes = (discountTypesRes.data ?? [])
    .map((row) => ({
      id: asNumber(row.id) ?? 0,
      discountType: asString(row.discount_type),
      totalPercent: asNumber(row.total_percent) ?? 0,
    }))
    .filter((row) => row.id > 0 && row.discountType);

  const storeTypes = (storeTypesRes.data ?? [])
    .map((row) => ({
      id: asNumber(row.id) ?? 0,
      storeType: asString(row.store_type),
    }))
    .filter((row) => row.id > 0 && row.storeType);

  const suppliers = (suppliersRes.data ?? [])
    .map((row) => ({
      id: asNumber(row.id) ?? 0,
      supplierName: asString(row.supplier_name),
      supplierShortcut: asString(row.supplier_shortcut),
    }))
    .filter((row) => row.id > 0 && row.supplierName);

  return {
    customers,
    discountTypes,
    storeTypes,
    suppliers,
    pagination: {
      page: normalizedQuery.page,
      pageSize: normalizedQuery.pageSize,
      total,
      totalPages,
      search: normalizedQuery.search,
      storeTypeId: normalizedQuery.storeTypeId,
    },
  };
}
