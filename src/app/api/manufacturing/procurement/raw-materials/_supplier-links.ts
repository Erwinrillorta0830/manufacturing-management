import { DIRECTUS_URL, headers } from "../_directus";
import { RawMaterialQaError } from "./_purchase-qa";

export type SupplierLinkRecord = {
    id?: unknown;
    supplier_id?: unknown;
};

type SupplierRecord = {
    id?: unknown;
    isActive?: unknown;
};

export function resolvePositiveInteger(value: unknown): number | null {
    if (value && typeof value === "object") {
        const record = value as Record<string, unknown>;
        return resolvePositiveInteger(record.id ?? record.product_id ?? record.supplier_id);
    }

    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function normalizeSupplierIds(value: unknown): number[] | undefined {
    if (value === undefined) return undefined;
    if (!Array.isArray(value)) {
        throw new RawMaterialQaError(400, "supplierIds must be an array.");
    }

    const ids: number[] = [];
    for (const rawId of value) {
        const id = resolvePositiveInteger(rawId);
        if (id === null) {
            throw new RawMaterialQaError(400, "supplierIds must contain only positive integer IDs.");
        }
        if (!ids.includes(id)) ids.push(id);
    }
    return ids;
}

export function supplierIdsFromLinks(links: SupplierLinkRecord[], productId: number): number[] {
    const ids: number[] = [];
    for (const link of links) {
        const supplierId = resolvePositiveInteger(link.supplier_id);
        if (supplierId === null) {
            throw new Error(`Supplier link for product ${productId} has an invalid supplier ID.`);
        }
        if (!ids.includes(supplierId)) ids.push(supplierId);
    }
    return ids;
}

export async function readProductSupplierLinks(productId: number): Promise<SupplierLinkRecord[]> {
    const params = new URLSearchParams({
        "filter[product_id][_eq]": String(productId),
        fields: "id,supplier_id",
        limit: "-1"
    });
    const response = await fetch(`${DIRECTUS_URL}/items/product_per_supplier?${params.toString()}`, {
        headers,
        cache: "no-store"
    });
    const body = await response.json().catch(() => null) as { data?: unknown; error?: unknown } | null;
    if (!response.ok) {
        const detail = typeof body?.error === "string" ? `: ${body.error}` : "";
        throw new Error(`Directus failed to fetch supplier links for product ${productId}: ${response.status}${detail}`);
    }
    if (!Array.isArray(body?.data)) {
        throw new Error(`Directus returned an invalid supplier-link response for product ${productId}.`);
    }
    return body.data as SupplierLinkRecord[];
}

async function readSupplierRecords(supplierIds: number[]): Promise<Map<number, SupplierRecord>> {
    const recordsById = new Map<number, SupplierRecord>();
    if (supplierIds.length === 0) return recordsById;

    const params = new URLSearchParams({
        "filter[id][_in]": supplierIds.join(","),
        fields: "id,isActive",
        limit: "-1"
    });
    const response = await fetch(`${DIRECTUS_URL}/items/suppliers?${params.toString()}`, {
        headers,
        cache: "no-store"
    });
    const body = await response.json().catch(() => null) as { data?: unknown; error?: unknown } | null;
    if (!response.ok) {
        const detail = typeof body?.error === "string" ? `: ${body.error}` : "";
        throw new Error(`Directus failed to validate suppliers: ${response.status}${detail}`);
    }
    if (!Array.isArray(body?.data)) {
        throw new Error("Directus returned an invalid supplier response.");
    }

    for (const rawRecord of body.data) {
        if (!rawRecord || typeof rawRecord !== "object") continue;
        const record = rawRecord as SupplierRecord;
        const id = resolvePositiveInteger(record.id);
        if (id !== null) recordsById.set(id, record);
    }

    const missingIds = supplierIds.filter(id => !recordsById.has(id));
    if (missingIds.length > 0) {
        throw new RawMaterialQaError(400, `Supplier record(s) not found: ${missingIds.join(", ")}.`);
    }
    return recordsById;
}

function isActiveSupplier(value: unknown): boolean {
    if (value === true || value === 1) return true;
    return typeof value === "string" && ["true", "1"].includes(value.trim().toLowerCase());
}

export async function validateSupplierSelection(supplierIds: number[], existingSupplierIds: number[] = []): Promise<void> {
    const idsToCheck = [...new Set([...supplierIds, ...existingSupplierIds])];
    const recordsById = await readSupplierRecords(idsToCheck);
    const existingSet = new Set(existingSupplierIds);
    const inactiveNewSupplierIds = supplierIds.filter(id => !existingSet.has(id) && !isActiveSupplier(recordsById.get(id)?.isActive));

    if (inactiveNewSupplierIds.length > 0) {
        throw new RawMaterialQaError(
            400,
            `Only active suppliers can be newly linked. Inactive supplier(s): ${inactiveNewSupplierIds.join(", ")}.`
        );
    }
}

async function ensureSupplierMutationSucceeded(response: Response, action: string): Promise<void> {
    if (response.ok) return;
    const detail = (await response.text().catch(() => "")).trim().slice(0, 500);
    throw new Error(`${action} failed with HTTP ${response.status}${detail ? `: ${detail}` : "."}`);
}

export async function synchronizeProductSupplierLinks(productId: number, desiredSupplierIds: number[]): Promise<void> {
    const existingLinks = await readProductSupplierLinks(productId);
    const desiredSet = new Set(desiredSupplierIds);
    const retainedSupplierIds = new Set<number>();

    for (const link of existingLinks) {
        const linkId = resolvePositiveInteger(link.id);
        const supplierId = resolvePositiveInteger(link.supplier_id);
        if (linkId === null || supplierId === null) {
            throw new Error(`Supplier link for product ${productId} has invalid relationship data.`);
        }

        const keep = desiredSet.has(supplierId) && !retainedSupplierIds.has(supplierId);
        if (keep) {
            retainedSupplierIds.add(supplierId);
            continue;
        }

        const response = await fetch(`${DIRECTUS_URL}/items/product_per_supplier/${encodeURIComponent(String(linkId))}`, {
            method: "DELETE",
            headers
        });
        await ensureSupplierMutationSucceeded(response, `Removing supplier ${supplierId} from product ${productId}`);
    }

    for (const supplierId of desiredSupplierIds) {
        if (retainedSupplierIds.has(supplierId)) continue;

        const response = await fetch(`${DIRECTUS_URL}/items/product_per_supplier`, {
            method: "POST",
            headers,
            body: JSON.stringify({
                product_id: productId,
                supplier_id: supplierId
            })
        });
        await ensureSupplierMutationSucceeded(response, `Linking supplier ${supplierId} to product ${productId}`);
        retainedSupplierIds.add(supplierId);
    }
}

export async function readChildProductIds(parentProductId: number): Promise<number[]> {
    const params = new URLSearchParams({
        "filter[parent_id][_eq]": String(parentProductId),
        fields: "product_id",
        limit: "-1"
    });
    const response = await fetch(`${DIRECTUS_URL}/items/products?${params.toString()}`, { headers, cache: "no-store" });
    const body = await response.json().catch(() => null) as { data?: unknown; error?: unknown } | null;
    if (!response.ok) {
        const detail = typeof body?.error === "string" ? `: ${body.error}` : "";
        throw new Error(`Directus failed to fetch child products for ${parentProductId}: ${response.status}${detail}`);
    }
    if (!Array.isArray(body?.data)) {
        throw new Error(`Directus returned an invalid child-product response for ${parentProductId}.`);
    }

    const childIds: number[] = [];
    for (const rawChild of body.data) {
        const childId = rawChild && typeof rawChild === "object"
            ? resolvePositiveInteger((rawChild as Record<string, unknown>).product_id)
            : null;
        if (childId === null) throw new Error(`Directus returned an invalid child product for ${parentProductId}.`);
        if (!childIds.includes(childId)) childIds.push(childId);
    }
    return childIds;
}

export function haveSameIds(left: number[], right: number[]): boolean {
    if (left.length !== right.length) return false;
    const rightSet = new Set(right);
    return left.every(id => rightSet.has(id));
}

async function restoreSupplierSnapshots(snapshots: Map<number, number[]>): Promise<void> {
    for (const [productId, supplierIds] of snapshots) {
        try {
            await synchronizeProductSupplierLinks(productId, supplierIds);
        } catch (restoreError) {
            console.error("Failed to restore supplier links after family synchronization failure:", {
                productId,
                supplierIds,
                error: restoreError
            });
        }
    }
}

export async function synchronizeFamilySupplierLinks(parentProductId: number, desiredSupplierIds: number[]): Promise<void> {
    const childProductIds = await readChildProductIds(parentProductId);
    const familyProductIds = [parentProductId, ...childProductIds];
    const snapshots = new Map<number, number[]>();

    for (const productId of familyProductIds) {
        snapshots.set(
            productId,
            supplierIdsFromLinks(await readProductSupplierLinks(productId), productId)
        );
    }

    try {
        await synchronizeProductSupplierLinks(parentProductId, desiredSupplierIds);

        const persistedParentIds = supplierIdsFromLinks(
            await readProductSupplierLinks(parentProductId),
            parentProductId
        );
        if (!haveSameIds(persistedParentIds, desiredSupplierIds)) {
            throw new Error(`Supplier links for parent product ${parentProductId} could not be verified after saving.`);
        }

        for (const childProductId of childProductIds) {
            await synchronizeProductSupplierLinks(childProductId, persistedParentIds);
            const persistedChildIds = supplierIdsFromLinks(
                await readProductSupplierLinks(childProductId),
                childProductId
            );
            if (!haveSameIds(persistedChildIds, persistedParentIds)) {
                throw new Error(`Supplier links for child product ${childProductId} could not be verified after saving.`);
            }
        }
    } catch (error) {
        console.error("Supplier family synchronization failed; restoring previous links:", {
            parentProductId,
            familyProductIds,
            error
        });
        await restoreSupplierSnapshots(snapshots);
        throw error;
    }
}
