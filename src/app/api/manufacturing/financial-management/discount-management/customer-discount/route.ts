import { NextResponse } from "next/server";

const DIRECTUS_URL = process.env.NEXT_PUBLIC_API_BASE_URL;
const DIRECTUS_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;

async function fetchDirectus(collection: string, params: string = "") {
  const url = `${DIRECTUS_URL}/items/${collection}${params ? `?${params}` : ""}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${DIRECTUS_TOKEN}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Directus error (${collection}): ${response.statusText}. ${JSON.stringify(err)}`);
  }
  return response.json();
}

export async function GET() {
  try {
    // Fetch everything in parallel
    const [
      customersRes,
      storeTypesRes,
      classificationsRes,
      paymentTermsRes,
      suppliersRes,
      categoriesRes,
      discountTypesRes,
    ] = await Promise.all([
      fetchDirectus("customer", "limit=-1&fields=id,customer_code,customer_name,type,store_type,classification,payment_term,isActive&filter[isActive][_eq]=1"),
      fetchDirectus("store_type", "limit=-1&fields=id,store_type"),
      fetchDirectus("customer_classification", "limit=-1&fields=id,classification_name"),
      fetchDirectus("payment_terms", "limit=-1&fields=id,payment_name,payment_days"),
      fetchDirectus("suppliers", "limit=-1&fields=id,supplier_name&filter[isActive][_eq]=1&filter[supplier_type][_eq]=TRADE"),
      fetchDirectus("categories", "limit=-1&fields=category_id,category_name"),
      fetchDirectus("discount_type", "limit=-1&fields=id,discount_type,total_percent"),
    ]);

    return NextResponse.json({
      customers: customersRes.data || [],
      storeTypes: storeTypesRes.data || [],
      classifications: classificationsRes.data || [],
      paymentTerms: paymentTermsRes.data || [],
      suppliers: suppliersRes.data || [],
      categories: categoriesRes.data || [],
      discountTypes: discountTypesRes.data || [],
    });
  } catch (error) {
    console.error("Customer Discount API Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}
