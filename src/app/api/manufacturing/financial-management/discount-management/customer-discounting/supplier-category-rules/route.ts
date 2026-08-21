// src/app/api/fm/accounting/discount-management/customer-discounting/supplier-category-rules/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  addSoftDeleteFilters,
  asNumber,
  asString,
  directusFetch,
  DirectusItem,
  DirectusList,
  jsonError,
} from "../_utils";

type RuleRow = {
  id?: unknown;
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Finds an existing active rule for the exact customer, supplier, and category combination.
 * Returns the found record's id, or null if not found.
 */
async function findExistingBySupplier(customerCode: string, supplierId: number, categoryId: number | null) {
  const params = new URLSearchParams();
  params.set("limit", "1");
  params.set("fields", "id");
  params.set("filter[customer_code][_eq]", customerCode);
  params.set("filter[supplier_id][_eq]", String(supplierId));
  if (categoryId !== null) {
    params.set("filter[category_id][_eq]", String(categoryId));
  } else {
    params.set("filter[category_id][_null]", "true");
  }
  addSoftDeleteFilters(params);

  const res = await directusFetch<DirectusList<RuleRow>>(
    `/items/supplier_category_discount_per_customer?${params.toString()}`,
  );
  const rows = res.data ?? [];
  if (rows.length === 0) return null;
  return asNumber(rows[0].id) ?? null;
}

/**
 * Creates or updates a customer supplier/category discount rule.
 * Supplier-level null-category rules and category-specific rules are kept separate.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const customerCode = asString(body.customerCode ?? body.customer_code);
    const supplierId = asNumber(body.supplierId ?? body.supplier_id);
    const categoryId = asNumber(body.categoryId ?? body.category_id);
    const discountTypeId = asNumber(body.discountTypeId ?? body.discount_type);
    const createdBy = asNumber(body.createdBy ?? body.created_by);

    if (!customerCode || !supplierId || !discountTypeId) {
      return NextResponse.json(
        { error: "customerCode, supplierId, and discountTypeId are required" },
        { status: 400 },
      );
    }

    const existingId = await findExistingBySupplier(customerCode, supplierId, categoryId);
    if (existingId) {
      const updatePayload: Record<string, unknown> = {
        category_id: categoryId,
        discount_type: discountTypeId,
      };
      if (createdBy) updatePayload.updated_by = createdBy;

      await directusFetch<DirectusItem<RuleRow>>(
        `/items/supplier_category_discount_per_customer/${existingId}`,
        { method: "PATCH", body: JSON.stringify(updatePayload) },
      );

      return NextResponse.json({ success: true, updated: true, id: existingId });
    }

    const payload: Record<string, unknown> = {
      customer_code: customerCode,
      supplier_id: supplierId,
      category_id: categoryId,
      discount_type: discountTypeId,
    };
    if (createdBy) payload.created_by = createdBy;

    const createRes = await directusFetch<DirectusItem<RuleRow>>("/items/supplier_category_discount_per_customer", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    return NextResponse.json(createRes.data ?? { success: true }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

/**
 * Soft-deletes a supplier/category rule by setting deleted_at/deleted_by.
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = asNumber(searchParams.get("id"));
    const userId = asNumber(searchParams.get("userId"));

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const payload: Record<string, unknown> = {
      deleted_at: new Date().toISOString(),
    };
    if (userId) payload.deleted_by = userId;

    await directusFetch<DirectusItem<RuleRow>>(`/items/supplier_category_discount_per_customer/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return jsonError(error);
  }
}
