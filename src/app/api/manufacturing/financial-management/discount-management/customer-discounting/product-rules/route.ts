// src/app/api/fm/accounting/discount-management/customer-discounting/product-rules/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  addSoftDeleteFilters,
  asNumber,
  asString,
  directusFetch,
  DirectusItem,
  DirectusList,
  isDeletedAtAccessError,
  jsonError,
} from "../_utils";

type RuleRow = {
  id?: unknown;
  deleted_at?: unknown;
};

type ProductRow = {
  product_id?: unknown;
  parent_id?: unknown;
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Product-specific customer rules are stored on the parent product so child/UOM variants inherit them.
 */
async function parentProductId(productId: number) {
  const params = new URLSearchParams();
  params.set("limit", "1");
  params.set("fields", "product_id,parent_id");
  params.set("filter[product_id][_eq]", String(productId));

  const res = await directusFetch<DirectusList<ProductRow>>(`/items/products?${params.toString()}`);
  const row = res.data?.[0];
  return asNumber(row?.parent_id) ?? asNumber(row?.product_id) ?? productId;
}

/**
 * Finds an existing active product-specific rule before insert/update.
 */
async function findExistingRule(customerCode: string, productId: number) {
  const params = new URLSearchParams();
  params.set("limit", "1");
  params.set("fields", "id");
  params.set("filter[customer_code][_eq]", customerCode);
  params.set("filter[product_id][_eq]", String(productId));

  const paramsWithSoftDelete = new URLSearchParams(params);
  addSoftDeleteFilters(paramsWithSoftDelete);

  let res: DirectusList<RuleRow>;
  try {
    res = await directusFetch<DirectusList<RuleRow>>(
      `/items/product_per_customer?${paramsWithSoftDelete.toString()}`,
    );
  } catch (error) {
    if (!isDeletedAtAccessError(error)) throw error;
    res = await directusFetch<DirectusList<RuleRow>>(`/items/product_per_customer?${params.toString()}`);
  }

  return asNumber(res.data?.[0]?.id);
}

async function hardDeleteRule(id: number) {
  await directusFetch<unknown>(`/items/product_per_customer/${id}`, {
    method: "DELETE",
  });
}

async function deletedAtFilterIsAvailable(id: number) {
  const params = new URLSearchParams();
  params.set("limit", "1");
  params.set("fields", "id");
  params.set("filter[id][_eq]", String(id));
  addSoftDeleteFilters(params);

  const res = await directusFetch<DirectusList<RuleRow>>(
    `/items/product_per_customer?${params.toString()}`,
  );
  return (res.data ?? []).length === 0;
}

/**
 * Creates or updates a customer/product rule with either a discount type or explicit unit price.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const customerCode = asString(body.customerCode ?? body.customer_code);
    const productId = asNumber(body.productId ?? body.product_id);
    const discountTypeId = asNumber(body.discountTypeId ?? body.discount_type);
    const unitPrice = asNumber(body.unitPrice ?? body.unit_price);
    const createdBy = asNumber(body.createdBy ?? body.created_by);

    if (!customerCode || !productId) {
      return NextResponse.json({ error: "customerCode and productId are required" }, { status: 400 });
    }

    if (!discountTypeId && unitPrice === null) {
      return NextResponse.json({ error: "Select a discount type or enter a unit price" }, { status: 400 });
    }

    const normalizedProductId = await parentProductId(productId);
    const existingId = await findExistingRule(customerCode, normalizedProductId);
    if (existingId) {
      const updatePayload: Record<string, unknown> = {
        discount_type: discountTypeId,
        unit_price: unitPrice,
      };
      if (createdBy) updatePayload.updated_by = createdBy;

      await directusFetch<DirectusItem<RuleRow>>(`/items/product_per_customer/${existingId}`, {
        method: "PATCH",
        body: JSON.stringify(updatePayload),
      });

      return NextResponse.json({ success: true, updated: true, id: existingId });
    }

    const payload: Record<string, unknown> = {
      customer_code: customerCode,
      product_id: normalizedProductId,
      discount_type: discountTypeId,
    };
    if (unitPrice !== null) payload.unit_price = unitPrice;
    if (createdBy) payload.created_by = createdBy;

    const res = await directusFetch<DirectusItem<RuleRow>>("/items/product_per_customer", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    return NextResponse.json(res.data ?? { success: true }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

/**
 * Deletes a product-specific rule. Soft-delete is preferred, but Directus
 * instances that cannot filter deleted_at need a hard-delete fallback so the
 * rule does not reappear after the list reloads.
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

    try {
      await directusFetch<DirectusItem<RuleRow>>(`/items/product_per_customer/${id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
    } catch (error) {
      if (!isDeletedAtAccessError(error)) throw error;

      await hardDeleteRule(id);
      return NextResponse.json({ success: true, hardDeleted: true });
    }

    try {
      const deletedRowIsHidden = await deletedAtFilterIsAvailable(id);
      if (!deletedRowIsHidden) {
        await hardDeleteRule(id);
        return NextResponse.json({ success: true, hardDeleted: true });
      }
    } catch (error) {
      if (!isDeletedAtAccessError(error)) throw error;

      try {
        await hardDeleteRule(id);
        return NextResponse.json({ success: true, hardDeleted: true });
      } catch {
        return NextResponse.json({
          success: true,
          localOnly: true,
          warning:
            "Rule was soft-deleted, but this Directus role cannot filter deleted_at.",
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return jsonError(error);
  }
}
