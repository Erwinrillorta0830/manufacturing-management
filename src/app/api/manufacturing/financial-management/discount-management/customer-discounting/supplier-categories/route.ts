import { NextRequest, NextResponse } from "next/server";
import {
  addRelatedParentProductFilter,
  asNumber,
  directusFetch,
  DirectusList,
  jsonError,
  relationId,
  relationName,
} from "../_utils";

type SupplierProductRow = {
  product_id?: unknown;
};

type ProductRelation = {
  product_category?: unknown;
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Returns categories represented by a supplier's active parent products.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const supplierId = asNumber(searchParams.get("supplier_id") ?? searchParams.get("supplierId"));

    if (!supplierId) {
      return NextResponse.json({ error: "supplier_id is required" }, { status: 400 });
    }

    const params = new URLSearchParams();
    let filterIndex = 0;
    params.set("limit", "-1");
    params.set("sort", "product_id.product_category.category_name");
    params.set(
      "fields",
      [
        "product_id",
        "product_id.product_category",
        "product_id.product_category.category_id",
        "product_id.product_category.category_name",
      ].join(","),
    );
    params.set(`filter[_and][${filterIndex}][supplier_id][_eq]`, String(supplierId));
    filterIndex += 1;
    addRelatedParentProductFilter(params, filterIndex);
    filterIndex += 1;
    params.set(`filter[_and][${filterIndex}][product_id][isActive][_eq]`, "1");

    const res = await directusFetch<DirectusList<SupplierProductRow>>(
      `/items/product_per_supplier?${params.toString()}`,
    );
    const categories = new Map<number, string>();

    for (const row of res.data ?? []) {
      const product = row.product_id && typeof row.product_id === "object"
        ? row.product_id as ProductRelation
        : {};
      const categoryId = relationId(product.product_category, "category_id");
      if (!categoryId) continue;
      categories.set(
        categoryId,
        relationName(product.product_category, "category_name") || `Category #${categoryId}`,
      );
    }

    return NextResponse.json({
      data: Array.from(categories, ([categoryId, categoryName]) => ({ categoryId, categoryName }))
        .sort((a, b) => a.categoryName.localeCompare(b.categoryName)),
    });
  } catch (error) {
    return jsonError(error);
  }
}
