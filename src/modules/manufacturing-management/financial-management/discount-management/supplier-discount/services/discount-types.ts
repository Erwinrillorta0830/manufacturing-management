/**
 * Base Directus API URL
 */

import {
  DiscountType,
  DiscountTypesResponse,
} from "../types/discount-type.schema";

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
 * Fetch all discount types
 */
export async function fetchAllDiscountTypes(): Promise<DiscountType[]> {
  try {
    const response = await fetch(
      `${API_BASE}/discount_type?limit=-1&fields=*`,
      {
        method: "GET",
        headers: getHeaders(),
        cache: "no-store",
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch discount types: ${response.statusText}`);
    }

    const result: DiscountTypesResponse = await response.json();
    return result.data || [];
  } catch (error) {
    console.error("Error fetching discount types:", error);
    throw error;
  }
}

/**
 * Fetch discount type by ID
 */
export async function fetchDiscountTypeById(id: number): Promise<DiscountType> {
  try {
    const response = await fetch(`${API_BASE}/discount_type/${id}?fields=*`, {
      method: "GET",
      headers: getHeaders(),
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch discount type: ${response.statusText}`);
    }

    const result = await response.json();
    return result.data;
  } catch (error) {
    console.error(`Error fetching discount type ${id}:`, error);
    throw error;
  }
}
