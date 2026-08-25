import { NextRequest, NextResponse } from "next/server";

const DIRECTUS_URL = process.env.NEXT_PUBLIC_API_BASE_URL;
const DIRECTUS_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;

async function fetchDirectus(collection: string, method: string = "GET", body: unknown = null, params: string = "") {
  const url = `${DIRECTUS_URL}/items/${collection}${params ? `?${params}` : ""}`;
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${DIRECTUS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : null,
    cache: "no-store",
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Directus error (${collection}): ${response.statusText}. ${JSON.stringify(err)}`);
  }
  return response.json();
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const customerCode = searchParams.get("customer_code");

  if (!customerCode) {
    return NextResponse.json({ error: "customer_code is required" }, { status: 400 });
  }

  try {
    const res = await fetchDirectus(
      "supplier_category_discount_per_customer",
      "GET",
      null,
      `filter[customer_code][_eq]=${customerCode}&filter[deleted_at][_null]=true&fields=*,discount_type.*,supplier_id.*,category_id.*`
    );
    return NextResponse.json(res.data || []);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Create the record
    const res = await fetchDirectus("supplier_category_discount_per_customer", "POST", body);
    const newRecord = res.data;

    // Log the action
    await fetchDirectus("customer_discount_log", "POST", {
      discount_record_id: newRecord.id,
      action_type: "INSERT",
      customer_code: newRecord.customer_code,
      discount_type: newRecord.discount_type,
      supplier_id: newRecord.supplier_id,
      category_id: newRecord.category_id,
      changed_by_user_id: body.created_by,
    });

    return NextResponse.json(newRecord);
  } catch (error) {
    console.error("POST Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const userId = searchParams.get("userId");

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  try {
    // 1. Get the current record data for logging
    const currentRes = await fetchDirectus(`supplier_category_discount_per_customer/${id}`, "GET");
    const record = currentRes.data;

    if (!record) {
      return NextResponse.json({ error: "Record not found" }, { status: 404 });
    }

    // 2. Soft delete the record
    await fetchDirectus(`supplier_category_discount_per_customer/${id}`, "PATCH", {
      deleted_at: new Date().toISOString(),
      deleted_by: userId ? Number(userId) : null,
    });

    // 3. Log the deletion
    await fetchDirectus("customer_discount_log", "POST", {
      discount_record_id: record.id,
      action_type: "DELETE",
      customer_code: record.customer_code,
      discount_type: record.discount_type,
      supplier_id: record.supplier_id,
      category_id: record.category_id,
      changed_by_user_id: userId ? Number(userId) : null,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}
