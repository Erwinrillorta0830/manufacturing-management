import { Product, ProductsResponse } from "../types/product.schema";

/**
 * Base Directus API URL
 */
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;
const API_BASE = `${API_BASE_URL}/items`;

/**
 * Get headers with authentication token
 */
const getHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${process.env.DIRECTUS_STATIC_TOKEN}`,
});

/**
 * Fetch units mapping
 */
export async function fetchUnitsMap(): Promise<Record<number, string>> {
  try {
    const response = await fetch(`${API_BASE}/units?limit=-1&fields=*`, {
      method: "GET",
      headers: getHeaders(),
      cache: "no-store",
    });
    if (!response.ok) {
      console.error("Failed to fetch units:", response.status, response.statusText);
      return {};
    }
    const result = await response.json();
    const map: Record<number, string> = {};
    for (const u of result.data || []) {
      const id = u.unit_id ?? u.id;
      if (id != null) {
        map[id] = u.unit_name;
      }
    }
    return map;
  } catch (error) {
    console.error("Error fetching units:", error);
    return {};
  }
}

/**
 * Fetch all products
 */
export async function fetchAllProducts(): Promise<Product[]> {
  try {
    const [response, unitsMap] = await Promise.all([
      fetch(`${API_BASE}/products?limit=-1&fields=*`, {
        method: "GET",
        headers: getHeaders(),
        cache: "no-store",
      }),
      fetchUnitsMap(),
    ]);

    if (!response.ok) {
      throw new Error(`Failed to fetch products: ${response.statusText}`);
    }

    const result: ProductsResponse = await response.json();
    const data = result.data || [];
    return data.map((item: Product) => ({
      ...item,
      unit_of_measurement: unitsMap[item.unit_of_measurement as number] || item.unit_of_measurement || null,
    }));
  } catch (error) {
    console.error("Error fetching products:", error);
    throw error;
  }
}

/**
 * Search products by name or code
 */
export async function searchProducts(query: string): Promise<Product[]> {
  try {
    const filter = {
      _or: [
        { product_name: { _contains: query } },
        { product_code: { _contains: query } },
        { short_description: { _contains: query } },
      ],
    };

    const [response, unitsMap] = await Promise.all([
      fetch(
        `${API_BASE}/products?limit=-1&fields=*&filter=${encodeURIComponent(
          JSON.stringify(filter),
        )}`,
        {
          method: "GET",
          headers: getHeaders(),
          cache: "no-store",
        },
      ),
      fetchUnitsMap(),
    ]);

    if (!response.ok) {
      throw new Error(`Failed to search products: ${response.statusText}`);
    }

    const result: ProductsResponse = await response.json();
    const data = result.data || [];
    return data.map((item: Product) => ({
      ...item,
      unit_of_measurement: unitsMap[item.unit_of_measurement as number] || item.unit_of_measurement || null,
    }));
  } catch (error) {
    console.error("Error searching products:", error);
    throw error;
  }
}

/**
 * Fetch product by ID
 */
export async function fetchProductById(id: number): Promise<Product> {
  try {
    const [response, unitsMap] = await Promise.all([
      fetch(`${API_BASE}/products/${id}?fields=*`, {
        method: "GET",
        headers: getHeaders(),
        cache: "no-store",
      }),
      fetchUnitsMap(),
    ]);

    if (!response.ok) {
      throw new Error(`Failed to fetch product: ${response.statusText}`);
    }

    const result = await response.json();
    const item = result.data;
    if (item) {
      item.unit_of_measurement = unitsMap[item.unit_of_measurement as number] || item.unit_of_measurement || null;
    }
    return item;
  } catch (error) {
    console.error(`Error fetching product ${id}:`, error);
    throw error;
  }
}
