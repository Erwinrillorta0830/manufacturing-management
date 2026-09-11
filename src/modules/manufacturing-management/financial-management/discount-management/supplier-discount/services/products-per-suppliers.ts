import {
  ProductPerSupplierWithDetails,
  ProductPerSupplierResponse,
  ProductPerSupplier,
} from "../types/product-per-suppplier.schema";

/**
 * Base Directus API URL
 */
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;
const API_BASE = `${API_BASE_URL}/items`;
const SUPPLIER_ELIGIBLE_PRODUCT_TYPES = "389,390";

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
 * Fetch units map from unit_of_measurement table
 */
export async function fetchUnitsMap(): Promise<Record<number, string>> {
  try {
    const url = `${API_BASE}/unit_of_measurement?limit=-1&fields=id,name,abbreviation`;
    const response = await fetch(url, {
      method: "GET",
      headers: getHeaders(),
      cache: "no-store",
    });

    if (!response.ok) return {};

    const result = await response.json();
    const map: Record<number, string> = {};
    (result.data || []).forEach(
      (item: { id: number; name?: string; abbreviation?: string }) => {
        map[item.id] = item.abbreviation || item.name || String(item.id);
      },
    );
    return map;
  } catch (error) {
    console.error("Error fetching units map:", error);
    return {};
  }
}

/**
 * Fetch all products for a specific supplier with product details
 */
export async function fetchSupplierProducts(
  supplierId: number,
): Promise<ProductPerSupplierWithDetails[]> {
  try {
    const fields =
      "id,supplier_id,product_id,discount_type,product_id.product_id,product_id.product_name,product_id.product_code,product_id.short_description,product_id.unit_of_measurement.*";

    const url = `${API_BASE}/product_per_supplier?limit=-1&fields=${fields}&filter[supplier_id][_eq]=${supplierId}&filter[product_id][product_type][_in]=${SUPPLIER_ELIGIBLE_PRODUCT_TYPES}`;

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

        const uomRaw = expanded?.unit_of_measurement;
        let uomDisplay: string | null = null;

        if (typeof uomRaw === "object" && uomRaw !== null) {
          const uomObj = uomRaw as { unit_name?: string; abbreviation?: string; name?: string };
          uomDisplay = uomObj.abbreviation || uomObj.unit_name || uomObj.name || null;
        } else if (typeof uomRaw === "number") {
          uomDisplay = unitsMap[uomRaw] || String(uomRaw);
        } else if (typeof uomRaw === "string") {
          uomDisplay = uomRaw;
        }

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
          unit_of_measurement: uomDisplay,
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

