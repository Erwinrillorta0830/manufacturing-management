// src/modules/financial-management/accounting/discount-management/supplier-discounting/providers/supplierDiscountingApi.ts
import type {
  SupplierDiscountBulkResult,
  SupplierDiscountFilterState,
  SupplierDiscountModuleData,
  SupplierDiscountPreflightResult,
  SupplierDiscountPricingResult,
  SupplierDiscountProductPage,
  SupplierDiscountRule,
} from "../types";

const BASE = "/api/manufacturing/financial-management/discount-management/supplier-discounting";

/**
 * Parses BFF responses and promotes API error payloads into thrown Error messages.
 */
async function parseResponse<T>(res: Response, fallback: string): Promise<T> {
  const json = await res.json().catch(() => null);

  if (!res.ok) {
    const message =
      json && typeof json === "object" && "error" in json
        ? String((json as { error?: unknown }).error ?? fallback)
        : fallback;
    throw new Error(message);
  }

  return json as T;
}

/**
 * Client-side API adapter for the supplier discounting BFF routes.
 */
export const supplierDiscountingApi = {
  /**
   * Loads dropdown metadata for suppliers, products, categories, brands, and discounts.
   */
  async getModuleData(): Promise<SupplierDiscountModuleData> {
    const res = await fetch(`${BASE}/module-data`, { cache: "no-store" });
    return parseResponse<SupplierDiscountModuleData>(res, "Failed to load supplier discounting data");
  },

  /**
   * Loads parent products eligible for supplier discount assignment.
   */
  async getProducts(query?: {
    page?: number;
    pageSize?: number;
    search?: string;
    categoryId?: number | null;
    brandId?: number | null;
    supplierId?: number | null;
    discountState?: SupplierDiscountFilterState;
    discountTypeId?: number | null;
  }): Promise<SupplierDiscountProductPage> {
    const params = new URLSearchParams();
    if (query?.page) params.set("page", String(query.page));
    if (query?.pageSize) params.set("page_size", String(query.pageSize));
    if (query?.search) params.set("q", query.search);
    if (query?.categoryId) params.set("category_id", String(query.categoryId));
    if (query?.brandId) params.set("brand_id", String(query.brandId));
    if (query?.supplierId) params.set("supplier_id", String(query.supplierId));
    if (query?.discountState && query.discountState !== "all") params.set("discount_state", query.discountState);
    if (query?.discountTypeId) params.set("discount_type_id", String(query.discountTypeId));

    const url = params.size > 0 ? `${BASE}/products?${params.toString()}` : `${BASE}/products`;
    const res = await fetch(url, { cache: "no-store" });
    return parseResponse<SupplierDiscountProductPage>(res, "Failed to load parent products");
  },

  /**
   * Loads the selected supplier's current product discount rules.
   */
  async getRules(supplierId: number, includeChildren?: boolean): Promise<SupplierDiscountRule[]> {
    const params = new URLSearchParams({ supplier_id: String(supplierId) });
    if (includeChildren) params.set("include_children", "true");
    const res = await fetch(`${BASE}/rules?${params.toString()}`, { cache: "no-store" });
    const json = await parseResponse<{ rules: SupplierDiscountRule[] }>(res, "Failed to load supplier discount rules");
    return Array.isArray(json.rules) ? json.rules : [];
  },

  /**
   * Splits selected products into new links and existing links before bulk assignment.
   */
  async preflightRules(payload: {
    supplierId: number;
    productIds: number[];
  }): Promise<SupplierDiscountPreflightResult> {
    const res = await fetch(`${BASE}/rules/preflight`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return parseResponse<SupplierDiscountPreflightResult>(res, "Failed to inspect existing supplier discounts");
  },

  /**
   * Creates or updates supplier discount rules in a single bulk operation.
   */
  async bulkApplyRules(payload: {
    supplierId: number;
    discountTypeId: number;
    newLinks: number[];
    existingLinks: Array<{ id: number; productId: number }>;
  }): Promise<SupplierDiscountBulkResult> {
    const res = await fetch(`${BASE}/rules/bulk-apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return parseResponse<SupplierDiscountBulkResult>(res, "Failed to apply supplier discounts");
  },

  /**
   * Clears the discount from a supplier product rule.
   */
  async deleteRule(id: number, supplierId?: number) {
    const params = new URLSearchParams({ id: String(id) });
    if (supplierId) params.set("supplier_id", String(supplierId));
    const res = await fetch(`${BASE}/rules?${params.toString()}`, { method: "DELETE" });
    return parseResponse<unknown>(res, "Failed to clear supplier discount");
  },

  /**
   * Resolves the discounted supplier cost for a product.
   */
  async resolvePrice(payload: {
    supplierId: number;
    productId: number;
    baseCost?: number | null;
  }): Promise<SupplierDiscountPricingResult> {
    const res = await fetch(`${BASE}/pricing`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return parseResponse<SupplierDiscountPricingResult>(res, "Failed to resolve supplier discount price");
  },
};
