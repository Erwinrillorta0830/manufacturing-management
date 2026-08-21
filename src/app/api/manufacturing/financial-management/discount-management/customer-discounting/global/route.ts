// src/app/api/fm/accounting/discount-management/customer-discounting/global/route.ts
import { NextRequest, NextResponse } from "next/server";
import { asNumber, asString, directusFetch, DirectusList, DirectusItem, jsonError } from "../_utils";

type CustomerRow = {
  id?: unknown;
  customer_code?: unknown;
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Resolves the customer primary key when callers only have the customer code.
 */
async function resolveCustomerId(customerCode: string) {
  const params = new URLSearchParams();
  params.set("limit", "1");
  params.set("fields", "id,customer_code");
  params.set("filter[customer_code][_eq]", customerCode);

  const res = await directusFetch<DirectusList<CustomerRow>>(`/items/customer?${params.toString()}`);
  return asNumber(res.data?.[0]?.id);
}

/**
 * Updates the customer's global discount_type relation.
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const customerCode = asString(body.customerCode ?? body.customer_code);
    const discountTypeId = asNumber(body.discountTypeId ?? body.discount_type);
    const updatedBy = asNumber(body.updatedBy ?? body.updated_by);

    if (!customerCode) {
      return NextResponse.json({ error: "customerCode is required" }, { status: 400 });
    }

    const customerId = asNumber(body.customerId ?? body.id) ?? await resolveCustomerId(customerCode);
    if (!customerId) {
      return NextResponse.json({ error: "Customer was not found" }, { status: 404 });
    }

    const payload: Record<string, unknown> = {
      discount_type: discountTypeId,
    };
    if (updatedBy) payload.updated_by = updatedBy;

    const res = await directusFetch<DirectusItem<CustomerRow>>(`/items/customer/${customerId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });

    return NextResponse.json(res.data ?? { success: true });
  } catch (error) {
    return jsonError(error);
  }
}
