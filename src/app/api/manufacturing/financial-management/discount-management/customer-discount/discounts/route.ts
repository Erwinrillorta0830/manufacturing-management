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
    
    // Check for existing active discount with the same scope
    let filterString = `filter[customer_code][_eq]=${body.customer_code}&filter[deleted_at][_null]=true`;
    if (body.supplier_id) {
      filterString += `&filter[supplier_id][_eq]=${body.supplier_id}`;
    } else {
      filterString += `&filter[supplier_id][_null]=true`;
    }
    if (body.category_id) {
      filterString += `&filter[category_id][_eq]=${body.category_id}`;
    } else {
      filterString += `&filter[category_id][_null]=true`;
    }

    const existingRes = await fetchDirectus("supplier_category_discount_per_customer", "GET", null, filterString);
    if (existingRes.data && existingRes.data.length > 0) {
      // Soft delete existing records
      for (const existing of existingRes.data) {
        await fetchDirectus(`supplier_category_discount_per_customer/${existing.id}`, "PATCH", {
          deleted_at: new Date().toISOString(),
          deleted_by: body.created_by || null,
          updated_by: body.created_by || null,
        });
        
        // Log deletion
        await fetchDirectus("customer_discount_log", "POST", {
          discount_record_id: existing.id,
          action_type: "DELETE",
          customer_code: existing.customer_code,
          discount_type: existing.discount_type,
          supplier_id: existing.supplier_id,
          category_id: existing.category_id,
          changed_by_user_id: body.created_by || null,
        });
      }
    }

    // Create the new record
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
      updated_by: userId ? Number(userId) : null,
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

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, updated_by, ...updateData } = body;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    // Update the record
    const res = await fetchDirectus(`supplier_category_discount_per_customer/${id}`, "PATCH", {
      ...updateData,
      updated_by: updated_by ? Number(updated_by) : null,
      updated_at: new Date().toISOString()
    });
    const updatedRecord = res.data;

    // Log the action
    await fetchDirectus("customer_discount_log", "POST", {
      discount_record_id: updatedRecord.id,
      action_type: "UPDATE",
      customer_code: updatedRecord.customer_code,
      discount_type: updatedRecord.discount_type,
      supplier_id: updatedRecord.supplier_id,
      category_id: updatedRecord.category_id,
      changed_by_user_id: updated_by ? Number(updated_by) : null,
    });

    return NextResponse.json(updatedRecord);
  } catch (error) {
    console.error("PATCH Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}
