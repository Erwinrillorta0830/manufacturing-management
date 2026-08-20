// src/modules/financial-management/accounting/discount-management/customer-discounting/providers/customerDiscountingApi.ts
import type {
  CustomerDiscountingModuleData,
  CustomerDiscountPricingResult,
  CustomerDiscountingCustomer,
  CustomerDiscountingProduct,
  CustomerDiscountingRules,
  CustomerDiscountingSupplier,
} from "../types";

const BASE = "/api/manufacturing/financial-management/discount-management/customer-discounting";

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
 * Client-side API adapter for the customer discounting BFF routes.
 */
export const customerDiscountingApi = {
  /**
   * Loads paginated module data for customer table refreshes.
   */
  async getModuleData(query?: {
    page?: number;
    pageSize?: number;
    search?: string;
    storeTypeId?: number | null;
  }): Promise<CustomerDiscountingModuleData> {
    const params = new URLSearchParams();
    if (query?.page) params.set("page", String(query.page));
    if (query?.pageSize) params.set("page_size", String(query.pageSize));
    if (query?.search) params.set("q", query.search);
    if (query?.storeTypeId) params.set("store_type_id", String(query.storeTypeId));

    const url = params.size > 0 ? `${BASE}/module-data?${params.toString()}` : `${BASE}/module-data`;
    const res = await fetch(url, { cache: "no-store" });
    return parseResponse<CustomerDiscountingModuleData>(res, "Failed to load customer discounting data");
  },

  /**
   * Loads the selected customer's supplier/category and product rules.
   */
  async getRules(customerCode: string): Promise<CustomerDiscountingRules> {
    const params = new URLSearchParams({ customer_code: customerCode });
    const res = await fetch(`${BASE}/rules?${params.toString()}`, { cache: "no-store" });
    return parseResponse<CustomerDiscountingRules>(res, "Failed to load customer discounting rules");
  },

  /**
   * Saves the customer's global discount assignment.
   */
  async updateGlobalDiscount(payload: {
    customerCode: string;
    customerId: number;
    discountTypeId: number | null;
    updatedBy: number | null;
  }) {
    const res = await fetch(`${BASE}/global`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return parseResponse<unknown>(res, "Failed to update global customer discount");
  },

  /**
   * Adds or updates a supplier/category discount rule for a customer.
   */
  async addSupplierCategoryRule(payload: {
    customerCode: string;
    supplierId: number;
    categoryId: number | null;
    discountTypeId: number;
    createdBy: number | null;
  }) {
    const res = await fetch(`${BASE}/supplier-category-rules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return parseResponse<unknown>(res, "Failed to save supplier/category discount");
  },

  /**
   * Soft-deletes a supplier/category discount rule.
   */
  async deleteSupplierCategoryRule(id: number, userId: number | null) {
    const params = new URLSearchParams({ id: String(id) });
    if (userId) params.set("userId", String(userId));
    const res = await fetch(`${BASE}/supplier-category-rules?${params.toString()}`, { method: "DELETE" });
    return parseResponse<unknown>(res, "Failed to delete supplier/category discount");
  },

  /**
   * Adds or updates a product-specific discount or unit price override for a customer.
   */
  async addProductRule(payload: {
    customerCode: string;
    productId: number;
    discountTypeId: number | null;
    unitPrice: number | null;
    createdBy: number | null;
  }) {
    const res = await fetch(`${BASE}/product-rules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return parseResponse<unknown>(res, "Failed to save product discount");
  },

  /**
   * Soft-deletes a product-specific rule.
   */
  async deleteProductRule(id: number, userId: number | null) {
    const params = new URLSearchParams({ id: String(id) });
    if (userId) params.set("userId", String(userId));
    const res = await fetch(`${BASE}/product-rules?${params.toString()}`, { method: "DELETE" });
    return parseResponse<{ success: boolean; hardDeleted?: boolean; localOnly?: boolean }>(
      res,
      "Failed to delete product discount",
    );
  },

  /**
   * Searches products, optionally including resolved customer pricing context.
   */
  async searchProducts(query: string, options?: {
    customerCode?: string;
    supplierId?: number | null;
    priceTier?: "price_per_unit" | "priceA" | "priceB" | "priceC" | "priceD" | "priceE" | null;
  }): Promise<CustomerDiscountingProduct[]> {
    const params = new URLSearchParams({ q: query });
    if (options?.customerCode) params.set("customer_code", options.customerCode);
    if (options?.supplierId) params.set("supplier_id", String(options.supplierId));
    if (options?.priceTier) params.set("price_tier", options.priceTier);
    const res = await fetch(`${BASE}/products/search?${params.toString()}`, { cache: "no-store" });
    const json = await parseResponse<{ data: CustomerDiscountingProduct[] }>(res, "Failed to search products");
    return Array.isArray(json.data) ? json.data : [];
  },

  /**
   * Searches active customers for the quick-open combobox.
   */
  async searchCustomers(query: string): Promise<CustomerDiscountingCustomer[]> {
    const params = new URLSearchParams({ q: query });
    const res = await fetch(`${BASE}/customers/search?${params.toString()}`, { cache: "no-store" });
    const json = await parseResponse<{ data: CustomerDiscountingCustomer[] }>(res, "Failed to search customers");
    return Array.isArray(json.data) ? json.data : [];
  },

  /**
   * Searches trade suppliers for supplier/category rule creation.
   */
  async searchSuppliers(query: string): Promise<CustomerDiscountingSupplier[]> {
    const params = new URLSearchParams({ q: query });
    const res = await fetch(`${BASE}/suppliers/search?${params.toString()}`, { cache: "no-store" });
    const json = await parseResponse<{ data: CustomerDiscountingSupplier[] }>(res, "Failed to search suppliers");
    return Array.isArray(json.data) ? json.data : [];
  },

  /**
   * Loads categories represented by a supplier's active parent products.
   */
  async getSupplierCategories(supplierId: number) {
    const params = new URLSearchParams({ supplier_id: String(supplierId) });
    const res = await fetch(`${BASE}/supplier-categories?${params.toString()}`, { cache: "no-store" });
    const json = await parseResponse<{ data: { categoryId: number; categoryName: string }[] }>(
      res,
      "Failed to load supplier categories",
    );
    return Array.isArray(json.data) ? json.data : [];
  },

  /**
   * Resolves final pricing using the customer discount hierarchy.
   */
  async resolvePrice(payload: {
    customerCode: string;
    productId: number;
    supplierId?: number | null;
    priceTier?: "price_per_unit" | "priceA" | "priceB" | "priceC" | "priceD" | "priceE" | null;
    basePrice?: number | null;
  }): Promise<CustomerDiscountPricingResult> {
    const res = await fetch(`${BASE}/pricing`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return parseResponse<CustomerDiscountPricingResult>(res, "Failed to resolve customer discount price");
  },
};
