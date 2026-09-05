import {
  Supplier,
  SuppliersResponse,
} from "@/modules/manufacturing-management/financial-management/discount-management/supplier-registration/types/supplier.schema";

/**
 * Base Directus API URL
 * Update this to match your environment
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
 * Fetch all suppliers with recursive pattern
 * Uses limit=-1 to get all data in single request
 */
export async function fetchAllSuppliers(): Promise<Supplier[]> {
  try {
    const response = await fetch(
      `${API_BASE}/suppliers?limit=-1&fields=*&filter[supplier_type][_eq]=Trade&sort=-id`,
      {
        method: "GET",
        headers: getHeaders(),
        cache: "no-store", // Ensure fresh data
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch suppliers: ${response.statusText}`);
    }

    const result: SuppliersResponse = await response.json();
    return result.data || [];
  } catch (error) {
    console.error("Error fetching suppliers:", error);
    throw error;
  }
}

/**
 * Fetch single supplier by ID
 */
export async function fetchSupplierById(id: number): Promise<Supplier> {
  try {
    const response = await fetch(`${API_BASE}/suppliers/${id}?fields=*`, {
      method: "GET",
      headers: getHeaders(),
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch supplier: ${response.statusText}`);
    }

    const result = await response.json();
    return result.data;
  } catch (error) {
    console.error(`Error fetching supplier ${id}:`, error);
    throw error;
  }
}

/**
 * Create new supplier
 */
export async function createSupplier(
  data: Partial<Supplier>,
): Promise<Supplier> {
  try {
    const response = await fetch(`${API_BASE}/suppliers`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(
        error.errors?.[0]?.message || "Failed to create supplier",
      );
    }

    const result = await response.json();
    return result.data;
  } catch (error) {
    console.error("Error creating supplier:", error);
    throw error;
  }
}

/**
 * Update existing supplier
 */
export async function updateSupplier(
  id: number,
  data: Partial<Supplier>,
): Promise<Supplier> {
  try {
    const response = await fetch(`${API_BASE}/suppliers/${id}`, {
      method: "PATCH",
      headers: getHeaders(),
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(
        error.errors?.[0]?.message || "Failed to update supplier",
      );
    }

    const result = await response.json();
    return result.data;
  } catch (error) {
    console.error(`Error updating supplier ${id}:`, error);
    throw error;
  }
}

/**
 * Search suppliers by name, TIN, or contact person
 */
export async function searchSuppliers(query: string): Promise<Supplier[]> {
  try {
    // Build filter: Must be Trade AND match query
    const filter = {
      _and: [
        { supplier_type: { _eq: "Trade" } },
        {
          _or: [
            { supplier_name: { _contains: query } },
            { tin_number: { _contains: query } },
            { contact_person: { _contains: query } },
          ],
        },
      ],
    };

    const response = await fetch(
      `${API_BASE}/suppliers?limit=-1&fields=*&filter=${encodeURIComponent(
        JSON.stringify(filter),
      )}&sort=-id`,
      {
        method: "GET",
        headers: getHeaders(),
        cache: "no-store",
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to search suppliers: ${response.statusText}`);
    }

    const result: SuppliersResponse = await response.json();
    return result.data || [];
  } catch (error) {
    console.error("Error searching suppliers:", error);
    throw error;
  }
}

