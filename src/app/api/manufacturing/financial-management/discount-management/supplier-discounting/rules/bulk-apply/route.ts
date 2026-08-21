// src/app/api/fm/accounting/discount-management/supplier-discounting/rules/bulk-apply/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  addParentProductFilter,
  asNumber,
  asString,
  directusFetch,
  DirectusItem,
  DirectusList,
  jsonError,
  relationId,
} from "../../_utils";

type RuleRow = {
  id?: unknown;
  supplier_id?: unknown;
  product_id?: unknown;
};

type ProductRow = {
  product_id?: unknown;
  product_name?: unknown;
  parent_id?: unknown;
};

type ExistingLink = {
  id: number;
  productId: number;
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function numberArray(value: unknown) {
  return Array.isArray(value)
    ? Array.from(new Set(value.map((item) => asNumber(item)).filter((item): item is number => !!item)))
    : [];
}

function existingLinks(value: unknown) {
  return Array.isArray(value)
    ? value
        .map((item) => {
          const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
          return {
            id: asNumber(record.id) ?? 0,
            productId: asNumber(record.productId ?? record.product_id) ?? 0,
          };
        })
        .filter((item): item is ExistingLink => item.id > 0 && item.productId > 0)
    : [];
}

async function verifyExistingLinks(supplierId: number, links: ExistingLink[]) {
  if (links.length === 0) return { valid: [], rejected: [] };

  const ids = links.map((link) => link.id);
  const params = new URLSearchParams();
  params.set("limit", "-1");
  params.set("fields", "id,product_id,product_id.product_id");
  params.set("filter[_and][0][id][_in]", ids.join(","));
  params.set("filter[_and][1][supplier_id][_eq]", String(supplierId));

  type VerifyRow = { id?: unknown; product_id?: unknown };
  const res = await directusFetch<DirectusList<VerifyRow>>(`/items/product_per_supplier?${params.toString()}`);
  const validEntries = new Map((res.data ?? []).map((row) => [
    asNumber(row.id) ?? 0,
    relationId(row.product_id, "product_id") ?? 0,
  ]));

  const valid: ExistingLink[] = [];
  const rejected: ExistingLink[] = [];

  for (const link of links) {
    const storedProductId = validEntries.get(link.id);
    if (storedProductId && storedProductId === link.productId) {
      valid.push(link);
    } else {
      rejected.push(link);
    }
  }

  return { valid, rejected };
}

async function productNameMap(productIds: number[]) {
  if (productIds.length === 0) return new Map<number, string>();

  const params = new URLSearchParams();
  params.set("limit", "-1");
  params.set("fields", "product_id,product_name");
  params.set("filter[product_id][_in]", productIds.join(","));
  const res = await directusFetch<DirectusList<ProductRow>>(`/items/products?${params.toString()}`);
  return new Map(
    (res.data ?? []).map((row) => [
      asNumber(row.product_id) ?? 0,
      asString(row.product_name) || `Product #${asNumber(row.product_id) ?? 0}`,
    ]),
  );
}

async function validateParentProducts(productIds: number[]) {
  if (productIds.length === 0) return [];

  const params = new URLSearchParams();
  params.set("limit", "-1");
  params.set("fields", "product_id");
  params.set("filter[_and][0][product_id][_in]", productIds.join(","));
  addParentProductFilter(params, 1);

  const res = await directusFetch<DirectusList<ProductRow>>(`/items/products?${params.toString()}`);
  const validIds = new Set((res.data ?? []).map((row) => asNumber(row.product_id)).filter(Boolean));
  return productIds.filter((productId) => !validIds.has(productId));
}

async function fetchChildProductIds(parentIds: number[]) {
  if (parentIds.length === 0) return new Map<number, number[]>();

  const params = new URLSearchParams();
  params.set("limit", "-1");
  params.set("fields", "product_id,parent_id");
  params.set("filter[_and][0][parent_id][_in]", parentIds.join(","));
  params.set("filter[_and][1][isActive][_eq]", "1");

  const res = await directusFetch<DirectusList<ProductRow>>(`/items/products?${params.toString()}`);
  const childrenByParent = new Map<number, number[]>();

  for (const row of res.data ?? []) {
    const childId = asNumber(row.product_id);
    const parentId = relationId(row.parent_id, "product_id");
    if (childId && parentId) {
      const existing = childrenByParent.get(parentId) ?? [];
      existing.push(childId);
      childrenByParent.set(parentId, existing);
    }
  }

  return childrenByParent;
}

async function findExistingChildRules(supplierId: number, childIds: number[]) {
  if (childIds.length === 0) return new Map<number, number>();

  const params = new URLSearchParams();
  params.set("limit", "-1");
  params.set("fields", "id,product_id");
  params.set("filter[_and][0][supplier_id][_eq]", String(supplierId));
  params.set("filter[_and][1][product_id][_in]", childIds.join(","));

  const res = await directusFetch<DirectusList<RuleRow>>(`/items/product_per_supplier?${params.toString()}`);
  const map = new Map<number, number>();
  for (const row of res.data ?? []) {
    const productId = relationId(row.product_id, "product_id");
    const id = asNumber(row.id);
    if (productId && id) map.set(productId, id);
  }
  return map;
}

async function createItems(
  supplierId: number,
  discountTypeId: number,
  productIds: number[],
  names: Map<number, string>,
) {
  if (productIds.length === 0) return { count: 0, failed: [] as Array<{ productId: number; productName: string; reason: string }> };

  const payload = productIds.map((productId) => ({
    supplier_id: supplierId,
    product_id: productId,
    discount_type: discountTypeId,
  }));

  try {
    await directusFetch<DirectusList<RuleRow> | DirectusItem<RuleRow[]>>("/items/product_per_supplier", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return { count: payload.length, failed: [] };
  } catch {
    let count = 0;
    const failed: Array<{ productId: number; productName: string; reason: string }> = [];

    for (const item of payload) {
      try {
        await directusFetch<DirectusItem<RuleRow>>("/items/product_per_supplier", {
          method: "POST",
          body: JSON.stringify(item),
        });
        count += 1;
      } catch (error) {
        failed.push({
          productId: item.product_id,
          productName: names.get(item.product_id) ?? `Product #${item.product_id}`,
          reason: error instanceof Error ? error.message : "Create failed",
        });
      }
    }

    return { count, failed };
  }
}

async function updateItems(
  discountTypeId: number,
  links: ExistingLink[],
  names: Map<number, string>,
) {
  if (links.length === 0) return { count: 0, failed: [] as Array<{ productId: number; productName: string; reason: string }> };

  const payload = links.map((link) => ({
    id: link.id,
    discount_type: discountTypeId,
  }));

  try {
    await directusFetch<DirectusList<RuleRow> | DirectusItem<RuleRow[]>>("/items/product_per_supplier", {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    return { count: payload.length, failed: [] };
  } catch {
    let count = 0;
    const failed: Array<{ productId: number; productName: string; reason: string }> = [];

    for (const link of links) {
      try {
        await directusFetch<DirectusItem<RuleRow>>(`/items/product_per_supplier/${link.id}`, {
          method: "PATCH",
          body: JSON.stringify({ discount_type: discountTypeId }),
        });
        count += 1;
      } catch (error) {
        failed.push({
          productId: link.productId,
          productName: names.get(link.productId) ?? `Product #${link.productId}`,
          reason: error instanceof Error ? error.message : "Update failed",
        });
      }
    }

    return { count, failed };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const supplierId = asNumber(body.supplierId ?? body.supplier_id);
    const discountTypeId = asNumber(body.discountTypeId ?? body.discount_type);
    const newLinks = numberArray(body.newLinks ?? body.new_links);
    const existing = existingLinks(body.existingLinks ?? body.existing_links);

    if (!supplierId || !discountTypeId || (newLinks.length === 0 && existing.length === 0)) {
      return NextResponse.json(
        { error: "supplierId, discountTypeId, and at least one link are required" },
        { status: 400 },
      );
    }

    const parentProductIds = Array.from(new Set([...newLinks, ...existing.map((link) => link.productId)]));
    const names = await productNameMap(parentProductIds);
    const invalidProductIds = await validateParentProducts(parentProductIds);

    if (invalidProductIds.length > 0) {
      return NextResponse.json(
        {
          error: "Discounts can only be assigned to parent products.",
          invalidProductIds,
        },
        { status: 400 },
      );
    }

    // Cascade to child UOMs: fetch all child products of the selected parents
    const childrenByParent = await fetchChildProductIds(parentProductIds);
    const allChildIds = Array.from(childrenByParent.values()).flat();

    // Merge child product names into the existing names map
    const childNames = await productNameMap(allChildIds);
    for (const [childId, childName] of childNames) {
      names.set(childId, childName);
    }

    // Check which children already have product_per_supplier records for this supplier
    const existingChildRules = await findExistingChildRules(supplierId, allChildIds);
    const childNewLinks: number[] = [];
    const childExistingLinks: ExistingLink[] = [];

    for (const childId of allChildIds) {
      const ruleId = existingChildRules.get(childId);
      if (ruleId) {
        childExistingLinks.push({ id: ruleId, productId: childId });
      } else {
        childNewLinks.push(childId);
      }
    }

    const { valid: validLinks, rejected: rejectedLinks } = await verifyExistingLinks(supplierId, [
      ...existing,
      ...childExistingLinks,
    ]);
    const rejectedFailures = rejectedLinks.map((link) => ({
      productId: link.productId,
      productName: names.get(link.productId) ?? `Product #${link.productId}`,
      reason: "Rule does not belong to this supplier",
    }));

    const created = await createItems(supplierId, discountTypeId, [...newLinks, ...childNewLinks], names);
    const updated = await updateItems(discountTypeId, [...validLinks], names);

    return NextResponse.json({
      created: created.count,
      updated: updated.count,
      failed: [...rejectedFailures, ...created.failed, ...updated.failed],
      childCount: allChildIds.length,
    });
  } catch (error) {
    return jsonError(error);
  }
}
