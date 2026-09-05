import {
  ProductPerSupplier,
  ProductPerSupplierWithDetails,
  ProductsPerSupplierResponse,
  ProductPerSupplierResponse,
} from "../types/product-per-suppplier.schema";
import { fetchUnitsMap } from "./products";

/**
 * Base Directus API URL
 */
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;
const API_BASE = `${API_BASE_URL}/items`;

/**
 * Get headers with authentication token
 */
const getHeaders = () => {
  const token = process.env.DIRECTUS_STATIC_TOKEN;

  // DEBUGGER: Check if token is missing on the server
  if (!token) {
    console.error(
      "[SERVER ERROR] DIRECTUS_STATIC_TOKEN is undefined in environment variables.",
    );
  }

  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
};

/**
 * Fetch all products for a specific supplier with product details
 */
export async function fetchSupplierProducts(
  supplierId: number,
): Promise<ProductPerSupplierWithDetails[]> {
  try {
    const filter = { supplier_id: { _eq: supplierId } };
    const fields =
      "id,supplier_id,product_id,discount_type,product_id.product_id,product_id.product_name,product_id.product_code,product_id.short_description,product_id.unit_of_measurement";

    const url = `${API_BASE}/product_per_supplier?limit=-1&fields=${fields}&filter=${encodeURIComponent(
      JSON.stringify(filter),
    )}`;

    // DEBUGGER: Check the exact URL being constructed
    console.log(`[SERVER FETCH] Requesting Supplier ID: ${supplierId}`);
    console.log(`[SERVER FETCH] URL: ${url}`);

    const [response, unitsMap] = await Promise.all([
      fetch(url, {
        method: "GET",
        headers: getHeaders(),
        cache: "no-store",
      }),
      fetchUnitsMap(),
    ]);

    if (!response.ok) {
      // DEBUGGER: Get the actual error message from Directus
      const errorBody = await response.json().catch(() => ({}));
      console.error(
        "[SERVER ERROR] Directus Response:",
        response.status,
        errorBody,
      );

      throw new Error(
        `Directus Error: ${response.statusText} - ${JSON.stringify(errorBody)}`,
      );
    }

    const result = await response.json();

    return (result.data || []).map(
      (item: {
        id: number;
        supplier_id: number;
        product_id: unknown;
        discount_type: number | null;
      }) => {
        const isObject =
          typeof item.product_id === "object" && item.product_id !== null;
        const expanded = isObject
          ? (item.product_id as Record<string, unknown>)
          : null;

        return {
          id: item.id,
          supplier_id: item.supplier_id,
          product_id: expanded
            ? ((expanded.product_id || expanded.id) as number)
            : (item.product_id as number),
          discount_type: item.discount_type,
          product_name:
             (expanded?.product_name as string) || "Unknown Product",
          product_code: (expanded?.product_code as string) || null,
          unit_of_measurement:
            unitsMap[expanded?.unit_of_measurement as number] ||
            (expanded?.unit_of_measurement as string) ||
            null,
        };
      },
    );
  } catch (error: unknown) {
    console.error(
      `[SERVER FATAL] Error for supplier ${supplierId}:`,
      (error as Error).message,
    );
    throw error;
  }
}

/**
 * Add product to supplier
 */
export async function addProductToSupplier(
  data: Omit<ProductPerSupplier, "id">,
): Promise<ProductPerSupplier> {
  try {
    const response = await fetch(`${API_BASE}/product_per_supplier`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(
        error.errors?.[0]?.message || "Failed to add product to supplier",
      );
    }

    const result: ProductPerSupplierResponse = await response.json();
    return result.data;
  } catch (error) {
    console.error("Error adding product to supplier:", error);
    throw error;
  }
}

/**
 * Add products to supplier in bulk
 */
export async function createBulkSupplierProducts(
  items: Partial<ProductPerSupplier>[],
): Promise<ProductPerSupplier[]> {
  try {
    const response = await fetch(`${API_BASE}/product_per_supplier`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(items),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(
        error.errors?.[0]?.message || "Failed to add products in bulk",
      );
    }

    const result = await response.json();
    return result.data;
  } catch (error) {
    console.error("Error bulk adding products to supplier:", error);
    throw error;
  }
}

/**
 * Update discount type for product-supplier relationship
 */
export async function updateProductDiscount(
  id: number,
  discountType: number | null,
): Promise<ProductPerSupplier> {
  try {
    const response = await fetch(`${API_BASE}/product_per_supplier/${id}`, {
      method: "PATCH",
      headers: getHeaders(),
      body: JSON.stringify({ discount_type: discountType }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(
        error.errors?.[0]?.message || "Failed to update discount type",
      );
    }

    const result: ProductPerSupplierResponse = await response.json();
    return result.data;
  } catch (error) {
    console.error(`Error updating discount for product ${id}:`, error);
    throw error;
  }
}

/**
 * Remove product from supplier
 */
export async function removeProductFromSupplier(id: number): Promise<void> {
  try {
    const response = await fetch(`${API_BASE}/product_per_supplier/${id}`, {
      method: "DELETE",
      headers: getHeaders(),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(
        error.errors?.[0]?.message || "Failed to remove product from supplier",
      );
    }
  } catch (error) {
    console.error(`Error removing product ${id} from supplier:`, error);
    throw error;
  }
}

/**
 * Check if product already exists for supplier
 */
export async function isProductAlreadyAdded(
  supplierId: number,
  productId: number,
): Promise<boolean> {
  try {
    const filter = {
      _and: [
        { supplier_id: { _eq: supplierId } },
        { product_id: { _eq: productId } },
      ],
    };

    const response = await fetch(
      `${API_BASE}/product_per_supplier?limit=1&fields=id&filter=${encodeURIComponent(
        JSON.stringify(filter),
      )}`,
      {
        method: "GET",
        headers: getHeaders(),
        cache: "no-store",
      },
    );

    if (!response.ok) {
      throw new Error("Failed to check product existence");
    }

    const result: ProductsPerSupplierResponse = await response.json();
    return (result.data || []).length > 0;
  } catch (error) {
    console.error("Error checking product existence:", error);
    throw error;
  }
}
