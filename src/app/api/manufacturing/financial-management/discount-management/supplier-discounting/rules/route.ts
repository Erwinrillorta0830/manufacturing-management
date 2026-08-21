// src/app/api/fm/accounting/discount-management/supplier-discounting/rules/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  addRelatedParentProductFilter,
  asNumber,
  asString,
  directusFetch,
  discountLabel,
  DirectusItem,
  DirectusList,
  jsonError,
  relationId,
  relationName,
} from "../_utils";

type RuleRow = {
  id?: unknown;
  supplier_id?: unknown;
  product_id?: unknown;
  discount_type?: unknown;
};

type ActivityRow = {
  item?: unknown;
  timestamp?: unknown;
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function productRelation(value: unknown) {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function timestampMs(value: unknown) {
  const text = asString(value);
  if (!text) return 0;

  const time = new Date(text).getTime();
  return Number.isFinite(time) ? time : 0;
}

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

async function latestRuleActivity(ruleIds: number[]) {
  const activityByRuleId = new Map<number, number>();
  if (ruleIds.length === 0) return activityByRuleId;

  for (const ids of chunks(ruleIds, 100)) {
    const params = new URLSearchParams();
    params.set("limit", "-1");
    params.set("sort", "-timestamp,-id");
    params.set("fields", "item,timestamp");
    params.set("filter[_and][0][collection][_eq]", "product_per_supplier");
    params.set("filter[_and][1][item][_in]", ids.join(","));
    params.set("filter[_and][2][action][_in]", "create,update");

    try {
      const res = await directusFetch<DirectusList<ActivityRow>>(`/activity?${params.toString()}`);
      for (const row of res.data ?? []) {
        const id = asNumber(row.item);
        const time = timestampMs(row.timestamp);
        if (id && time && !activityByRuleId.has(id)) activityByRuleId.set(id, time);
      }
    } catch {
      return new Map<number, number>();
    }
  }

  return activityByRuleId;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const supplierId = asNumber(searchParams.get("supplier_id") ?? searchParams.get("supplierId"));

    if (!supplierId) {
      return NextResponse.json({ error: "supplier_id is required" }, { status: 400 });
    }

    const params = new URLSearchParams();
    params.set("limit", "-1");
    params.set("sort", "-id");
    params.set(
      "fields",
      [
        "id",
        "supplier_id",
        "supplier_id.id",
        "supplier_id.supplier_name",
        "product_id",
        "product_id.product_id",
        "product_id.product_code",
        "product_id.barcode",
        "product_id.product_name",
        "product_id.parent_id",
        "product_id.product_category",
        "product_id.product_category.category_id",
        "product_id.product_category.category_name",
        "product_id.product_brand",
        "product_id.product_brand.brand_id",
        "product_id.product_brand.brand_name",
        "discount_type",
        "discount_type.id",
        "discount_type.discount_type",
        "discount_type.total_percent",
      ].join(","),
    );
    params.set("filter[_and][0][supplier_id][_eq]", String(supplierId));
    params.set("filter[_and][1][discount_type][_nnull]", "true");
    const includeChildren = searchParams.get("include_children") === "true";
    if (!includeChildren) addRelatedParentProductFilter(params, 2);

    const res = await directusFetch<DirectusList<RuleRow>>(`/items/product_per_supplier?${params.toString()}`);
    const rules = (res.data ?? [])
      .map((row) => {
        const product = productRelation(row.product_id);
        return {
          id: asNumber(row.id) ?? 0,
          supplierId: relationId(row.supplier_id),
          supplierName: relationName(row.supplier_id, "supplier_name"),
          productId: relationId(row.product_id, "product_id"),
          productCode: asString(product.product_code),
          productName: asString(product.product_name),
          barcode: asString(product.barcode),
          categoryId: relationId(product.product_category, "category_id"),
          categoryName: relationName(product.product_category, "category_name"),
          brandId: relationId(product.product_brand, "brand_id"),
          brandName: relationName(product.product_brand, "brand_name"),
          discount: discountLabel(row.discount_type),
        };
      })
      .filter((row) => row.id > 0 && row.discount);
    const activityByRuleId = await latestRuleActivity(rules.map((rule) => rule.id));
    rules.sort((a, b) =>
      (activityByRuleId.get(b.id) ?? 0) - (activityByRuleId.get(a.id) ?? 0)
      || b.id - a.id,
    );

    return NextResponse.json({ rules });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = asNumber(searchParams.get("id"));
    const supplierId = asNumber(searchParams.get("supplier_id") ?? searchParams.get("supplierId"));

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    if (!supplierId) {
      return NextResponse.json({ error: "supplier_id is required" }, { status: 400 });
    }

    const existing = await directusFetch<DirectusItem<RuleRow>>(`/items/product_per_supplier/${id}?fields=id,supplier_id,product_id`);
    if (!existing.data) {
      return NextResponse.json({ error: "Rule not found" }, { status: 404 });
    }

    const existingSupplierId = relationId(existing.data.supplier_id);
    if (existingSupplierId !== supplierId) {
      return NextResponse.json({ error: "Rule does not belong to this supplier" }, { status: 403 });
    }

    const parentProductId = relationId(existing.data.product_id, "product_id");
    let cascadedChildCount = 0;

    // Cascade to child UOMs: find all child products and clear their discount records
    if (parentProductId) {
      const childParams = new URLSearchParams();
      childParams.set("limit", "-1");
      childParams.set("fields", "product_id");
      childParams.set("filter[parent_id][_eq]", String(parentProductId));
      childParams.set("filter[isActive][_eq]", "1");

      type ChildRow = { product_id?: unknown };
      const childRes = await directusFetch<DirectusList<ChildRow>>(`/items/products?${childParams.toString()}`);
      const childIds = (childRes.data ?? [])
        .map((row) => asNumber(row.product_id))
        .filter((pid): pid is number => pid != null);

      if (childIds.length > 0) {
        const ruleParams = new URLSearchParams();
        ruleParams.set("limit", "-1");
        ruleParams.set("fields", "id,product_id");
        ruleParams.set("filter[_and][0][supplier_id][_eq]", String(supplierId));
        ruleParams.set("filter[_and][1][product_id][_in]", childIds.join(","));

        const childRulesRes = await directusFetch<DirectusList<RuleRow>>(`/items/product_per_supplier?${ruleParams.toString()}`);

        for (const childRule of childRulesRes.data ?? []) {
          const childRuleId = asNumber(childRule.id);
          if (childRuleId) {
            await directusFetch<DirectusItem<RuleRow>>(`/items/product_per_supplier/${childRuleId}`, {
              method: "PATCH",
              body: JSON.stringify({ discount_type: null }),
            });
            cascadedChildCount += 1;
          }
        }
      }
    }

    await directusFetch<DirectusItem<RuleRow>>(`/items/product_per_supplier/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ discount_type: null }),
    });

    return NextResponse.json({ success: true, cascadedChildCount });
  } catch (error) {
    return jsonError(error);
  }
}
