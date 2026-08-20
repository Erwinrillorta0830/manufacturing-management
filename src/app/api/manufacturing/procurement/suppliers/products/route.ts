import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "../../_directus";
import { fetchProductsBySupplier, fetchProductsBySupplierPage } from "../suppliers-helper";

const TRANSIENT_UPSTREAM_STATUSES = new Set([502, 503, 504]);

interface SupplierProductLinkRow {
    id: number;
    supplier_id: number;
    product_id?: number | string | { product_id?: number | string; id?: number | string } | null;
}

function productIdFromLink(row: SupplierProductLinkRow): number {
    const relation = row.product_id;
    if (typeof relation === "number" || typeof relation === "string") return Number(relation);
    if (relation && typeof relation === "object") return Number(relation.product_id ?? relation.id);
    return NaN;
}

function parseIdArray(value: unknown, fieldName: string): number[] {
    if (value === undefined) return [];
    if (!Array.isArray(value)) throw new Error(`${fieldName} must be an array.`);

    const ids = value.map(valueItem => Number(valueItem));
    if (ids.some(id => !Number.isInteger(id) || id <= 0)) {
        throw new Error(`${fieldName} must contain positive integer IDs.`);
    }
    return Array.from(new Set(ids));
}

async function fetchSupplierLinks(supplierId: number, linkIds?: number[]): Promise<SupplierProductLinkRow[]> {
    const linkFilter = linkIds && linkIds.length > 0
        ? `&filter[id][_in]=${encodeURIComponent(linkIds.join(","))}`
        : "";
    const response = await fetch(
        `${DIRECTUS_URL}/items/product_per_supplier?filter[supplier_id][_eq]=${supplierId}${linkFilter}&fields=id,supplier_id,product_id&limit=-1`,
        { headers, cache: "no-store" }
    );
    if (!response.ok) throw new Error(`Failed to load supplier catalog links: ${response.status}`);
    const body = await response.json();
    return Array.isArray(body?.data) ? body.data : [];
}

async function fetchLinksByIds(linkIds: number[]): Promise<SupplierProductLinkRow[]> {
    if (linkIds.length === 0) return [];
    const response = await fetch(
        `${DIRECTUS_URL}/items/product_per_supplier?filter[id][_in]=${encodeURIComponent(linkIds.join(","))}&fields=id,supplier_id,product_id&limit=-1`,
        { headers, cache: "no-store" }
    );
    if (!response.ok) throw new Error(`Failed to validate supplier catalog removals: ${response.status}`);
    const body = await response.json();
    return Array.isArray(body?.data) ? body.data : [];
}

async function createSupplierLinks(supplierId: number, productIds: number[]): Promise<number[]> {
    if (productIds.length === 0) return [];
    const response = await fetch(`${DIRECTUS_URL}/items/product_per_supplier`, {
        method: "POST",
        headers,
        body: JSON.stringify(productIds.map(productId => ({ supplier_id: supplierId, product_id: productId })))
    });
    if (!response.ok) throw new Error(`Failed to bulk link supplier catalog products: ${response.status}`);

    const body = await response.json();
    const rows: Array<{ id?: number | string }> = Array.isArray(body?.data) ? body.data : body?.data ? [body.data] : [];
    return rows.map((row: { id?: number | string }) => Number(row.id)).filter(id => Number.isInteger(id) && id > 0);
}

async function deleteSupplierLinks(linkIds: number[]): Promise<void> {
    if (linkIds.length === 0) return;
    const results = await Promise.all(linkIds.map(linkId => fetch(
        `${DIRECTUS_URL}/items/product_per_supplier/${linkId}`,
        { method: "DELETE", headers }
    )));
    const failed = results.find(response => !response.ok && response.status !== 404);
    if (failed) throw new Error(`Failed to bulk unlink supplier catalog products: ${failed.status}`);
}

function wait(milliseconds: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function linkExists(linkId: string): Promise<boolean | null> {
    try {
        const response = await fetch(`${DIRECTUS_URL}/items/product_per_supplier/${linkId}`, {
            headers,
            cache: "no-store"
        });
        if (response.status === 404) return false;
        if (response.ok) return true;
        return null;
    } catch {
        return null;
    }
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const supplierId = searchParams.get("supplierId");
        if (!supplierId) {
            return NextResponse.json({ error: "Supplier ID is required" }, { status: 400 });
        }

        const pageParam = searchParams.get("page");
        const pageSizeParam = searchParams.get("pageSize");
        if (pageParam !== null || pageSizeParam !== null) {
            const page = pageParam === null ? 1 : Number(pageParam);
            const pageSize = pageSizeParam === null ? 10 : Number(pageSizeParam);
            const search = searchParams.get("search") ?? "";
            if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1) {
                return NextResponse.json({ error: "page and pageSize must be positive integers" }, { status: 400 });
            }

            const result = await fetchProductsBySupplierPage(Number(supplierId), page, pageSize, search);
            return NextResponse.json(result);
        }

        const products = await fetchProductsBySupplier(Number(supplierId));
        return NextResponse.json(products);
    } catch (e) {
        console.error("API Error fetching linked products:", e);
        return NextResponse.json({ error: (e as Error).message || "Failed to fetch linked products" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { supplierId, productId } = body;
        if (!supplierId || !productId) {
            return NextResponse.json({ error: "supplierId and productId are required" }, { status: 400 });
        }

        const res = await fetch(`${DIRECTUS_URL}/items/product_per_supplier`, {
            method: "POST",
            headers,
            body: JSON.stringify({
                supplier_id: Number(supplierId),
                product_id: Number(productId)
            })
        });

        if (!res.ok) {
            let errorMsg = `Failed to link product: ${res.status}`;
            try {
                const errorJson = await res.json();
                if (errorJson.errors && errorJson.errors[0]?.message) {
                    errorMsg = errorJson.errors[0].message;
                }
            } catch {}
            throw new Error(errorMsg);
        }

        const data = (await res.json()).data;
        return NextResponse.json({ success: true, data });
    } catch (e) {
        console.error("API Error linking product to supplier:", e);
        return NextResponse.json({ error: (e as Error).message || "Failed to link product" }, { status: 500 });
    }
}

export async function PATCH(request: Request) {
    let createdLinkIds: number[] = [];
    try {
        const body = await request.json() as {
            supplierId?: unknown;
            addProductIds?: unknown;
            removeLinkIds?: unknown;
        };
        const supplierId = Number(body.supplierId);
        if (!Number.isInteger(supplierId) || supplierId <= 0) {
            return NextResponse.json({ error: "supplierId must be a positive integer." }, { status: 400 });
        }

        let addProductIds: number[];
        let removeLinkIds: number[];
        try {
            addProductIds = parseIdArray(body.addProductIds, "addProductIds");
            removeLinkIds = parseIdArray(body.removeLinkIds, "removeLinkIds");
        } catch (error) {
            return NextResponse.json({ error: (error as Error).message }, { status: 400 });
        }

        const [supplierLinks, requestedRemovalRows] = await Promise.all([
            fetchSupplierLinks(supplierId),
            fetchLinksByIds(removeLinkIds)
        ]);

        const foreignRemoval = requestedRemovalRows.find(row => Number(row.supplier_id) !== supplierId);
        if (foreignRemoval) {
            return NextResponse.json({ error: `Catalog link ${foreignRemoval.id} does not belong to supplier ${supplierId}.` }, { status: 400 });
        }

        const currentByProductId = new Map<number, SupplierProductLinkRow>();
        supplierLinks.forEach(row => {
            const productId = productIdFromLink(row);
            if (Number.isInteger(productId) && productId > 0) currentByProductId.set(productId, row);
        });

        const requestedAdditions = new Set(addProductIds);
        const removalRows = supplierLinks.filter(row => removeLinkIds.includes(Number(row.id)));
        const effectiveRemoveLinkIds = removalRows
            .filter(row => !requestedAdditions.has(productIdFromLink(row)))
            .map(row => Number(row.id));
        const effectiveAddProductIds = addProductIds.filter(productId => !currentByProductId.has(productId));

        createdLinkIds = await createSupplierLinks(supplierId, effectiveAddProductIds);
        try {
            await deleteSupplierLinks(effectiveRemoveLinkIds);
        } catch (error) {
            if (createdLinkIds.length > 0) {
                try {
                    await deleteSupplierLinks(createdLinkIds);
                } catch (compensationError) {
                    console.error("Failed to compensate bulk supplier catalog additions:", compensationError);
                }
            }
            throw error;
        }

        return NextResponse.json({
            success: true,
            added: effectiveAddProductIds,
            removed: effectiveRemoveLinkIds
        });
    } catch (e) {
        console.error("API Error saving bulk supplier catalog updates:", e);
        return NextResponse.json({ error: (e as Error).message || "Failed to save supplier catalog updates" }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const linkId = searchParams.get("linkId");
        if (!linkId) {
            return NextResponse.json({ error: "Link ID is required" }, { status: 400 });
        }

        let res: Response | null = null;
        let networkError: unknown = null;

        for (let attempt = 0; attempt < 2; attempt += 1) {
            networkError = null;
            try {
                res = await fetch(`${DIRECTUS_URL}/items/product_per_supplier/${linkId}`, {
                    method: "DELETE",
                    headers
                });
            } catch (error) {
                networkError = error;
            }

            if (res?.ok || res?.status === 404) {
                return NextResponse.json({ success: true });
            }

            const isTransientFailure = networkError !== null || (res !== null && TRANSIENT_UPSTREAM_STATUSES.has(res.status));
            if (!isTransientFailure || attempt === 1) break;

            // A failed response can mean Directus completed the delete but the
            // response was lost. Check the desired state before retrying.
            if (await linkExists(linkId) === false) {
                return NextResponse.json({ success: true });
            }
            await wait(250);
        }

        if (networkError !== null || res === null) {
            return NextResponse.json({ error: "The product unlink service is temporarily unavailable. Please try again." }, { status: 503 });
        }

        let errorMessage = `Failed to unlink product: ${res.statusText || res.status}`;
        try {
            const errorJson = await res.json();
            if (errorJson.errors?.[0]?.message) errorMessage = errorJson.errors[0].message;
        } catch {}

        const status = TRANSIENT_UPSTREAM_STATUSES.has(res.status) ? res.status : 500;
        return NextResponse.json({ error: errorMessage }, { status });
    } catch (e) {
        console.error("API Error unlinking product:", e);
        return NextResponse.json({ error: (e as Error).message || "Failed to unlink product" }, { status: 500 });
    }
}
