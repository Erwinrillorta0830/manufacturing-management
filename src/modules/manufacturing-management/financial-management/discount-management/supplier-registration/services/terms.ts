/**
 * Terms Service - Handles fetching payment and delivery terms from Directus
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

export interface Term {
  id: number;
  name: string;
}

/**
 * Fetch all payment terms
 */
export async function fetchPaymentTerms(): Promise<Term[]> {
  try {
    const response = await fetch(
      `${API_BASE}/payment_terms?limit=-1&fields=id,payment_name`,
      {
        method: "GET",
        headers: getHeaders(),
        cache: "no-store",
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch payment terms: ${response.statusText}`);
    }

    const result = await response.json();
    return (result.data || []).map(
      (item: { id: number; payment_name: string }) => ({
        id: item.id,
        name: item.payment_name,
      }),
    );
  } catch (error) {
    console.error("Error fetching payment terms:", error);
    throw error;
  }
}

/**
 * Fetch all delivery terms
 */
export async function fetchDeliveryTerms(): Promise<Term[]> {
  try {
    const response = await fetch(
      `${API_BASE}/delivery_terms?limit=-1&fields=id,delivery_name`,
      {
        method: "GET",
        headers: getHeaders(),
        cache: "no-store",
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch delivery terms: ${response.statusText}`);
    }

    const result = await response.json();
    return (result.data || []).map(
      (item: { id: number; delivery_name: string }) => ({
        id: item.id,
        name: item.delivery_name,
      }),
    );
  } catch (error) {
    console.error("Error fetching delivery terms:", error);
    throw error;
  }
}
