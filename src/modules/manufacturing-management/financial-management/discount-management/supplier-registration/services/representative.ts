import {
  Representative,
  RepresentativesResponse,
  RepresentativeResponse,
} from "@/modules/manufacturing-management/financial-management/discount-management/supplier-registration/types/representative.schema";
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
 * Fetch all representatives for a specific supplier
 */
export async function fetchRepresentativesBySupplier(
  supplierId: number,
): Promise<Representative[]> {
  try {
    const filter = {
      supplier_id: { _eq: supplierId },
    };

    const response = await fetch(
      `${API_BASE}/suppliers_representative?limit=-1&fields=*&filter=${encodeURIComponent(
        JSON.stringify(filter),
      )}`,
      {
        method: "GET",
        headers: getHeaders(),
        cache: "no-store",
      },
    );

    if (!response.ok) {
      throw new Error(
        `Failed to fetch representatives: ${response.statusText}`,
      );
    }

    const result: RepresentativesResponse = await response.json();
    return result.data || [];
  } catch (error) {
    console.error(
      `Error fetching representatives for supplier ${supplierId}:`,
      error,
    );
    throw error;
  }
}

/**
 * Fetch all representatives (for admin purposes)
 */
export async function fetchAllRepresentatives(): Promise<Representative[]> {
  try {
    const response = await fetch(
      `${API_BASE}/suppliers_representative?limit=-1&fields=*`,
      {
        method: "GET",
        headers: getHeaders(),
        cache: "no-store",
      },
    );

    if (!response.ok) {
      throw new Error(
        `Failed to fetch representatives: ${response.statusText}`,
      );
    }

    const result: RepresentativesResponse = await response.json();
    return result.data || [];
  } catch (error) {
    console.error("Error fetching all representatives:", error);
    throw error;
  }
}

/**
 * Create new representative
 */
export async function createRepresentative(
  data: Omit<Representative, "id" | "created_at" | "updated_at">,
): Promise<Representative> {
  try {
    const response = await fetch(`${API_BASE}/suppliers_representative`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(
        error.errors?.[0]?.message || "Failed to create representative",
      );
    }

    const result: RepresentativeResponse = await response.json();
    return result.data;
  } catch (error) {
    console.error("Error creating representative:", error);
    throw error;
  }
}

/**
 * Update existing representative
 */
export async function updateRepresentative(
  id: number,
  data: Partial<Representative>,
): Promise<Representative> {
  try {
    const response = await fetch(`${API_BASE}/suppliers_representative/${id}`, {
      method: "PATCH",
      headers: getHeaders(),
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(
        error.errors?.[0]?.message || "Failed to update representative",
      );
    }

    const result: RepresentativeResponse = await response.json();
    return result.data;
  } catch (error) {
    console.error(`Error updating representative ${id}:`, error);
    throw error;
  }
}

/**
 * Delete representative
 */
export async function deleteRepresentative(id: number): Promise<void> {
  try {
    const response = await fetch(`${API_BASE}/suppliers_representative/${id}`, {
      method: "DELETE",
      headers: getHeaders(),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(
        error.errors?.[0]?.message || "Failed to delete representative",
      );
    }
  } catch (error) {
    console.error(`Error deleting representative ${id}:`, error);
    throw error;
  }
}

/**
 * Check if a representative already exists for a supplier
 * Checks for: Email, Contact Number, or Full Name (First + Middle + Last + Suffix)
 */
export async function checkRepresentativeDuplicate(
  data: Partial<Representative>,
  supplierId: number,
  excludeId?: number,
): Promise<{ isDuplicate: boolean; type?: "email" | "contact" | "name" }> {
  try {
    const filters: Record<string, unknown>[] = [
      { supplier_id: { _eq: supplierId } },
    ];

    if (excludeId) {
      filters.push({ id: { _neq: excludeId } });
    }

    // We check each condition separately to identify which field is duplicated
    const checkFields = async (
      fieldFilter: Record<string, unknown>,
    ) => {
      const combinedFilter = {
        _and: [...filters, fieldFilter],
      };

      const response = await fetch(
        `${API_BASE}/suppliers_representative?limit=1&fields=id&filter=${encodeURIComponent(
          JSON.stringify(combinedFilter),
        )}`,
        {
          method: "GET",
          headers: getHeaders(),
          cache: "no-store",
        },
      );

      if (!response.ok) return false;
      const result: RepresentativesResponse = await response.json();
      return (result.data || []).length > 0;
    };

    // 1. Check Email
    if (data.email) {
      if (await checkFields({ email: { _eq: data.email } })) {
        return { isDuplicate: true, type: "email" };
      }
    }

    // 2. Check Contact Number
    if (data.contact_number) {
      if (
        await checkFields({ contact_number: { _eq: data.contact_number } })
      ) {
        return { isDuplicate: true, type: "contact" };
      }
    }

    // 3. Check Name (Only if both first and last are provided)
    if (data.first_name && data.last_name) {
      const nameFilter: Record<string, unknown> = {
        _and: [
          { first_name: { _eq: data.first_name } },
          { last_name: { _eq: data.last_name } },
          { middle_name: { _eq: data.middle_name || null } },
          { suffix: { _eq: data.suffix || null } },
        ],
      };

      if (await checkFields(nameFilter)) {
        return { isDuplicate: true, type: "name" };
      }
    }

    return { isDuplicate: false };
  } catch (error) {
    console.error("Error checking representative duplicate:", error);
    throw error;
  }
}

