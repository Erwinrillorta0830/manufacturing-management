import { NextResponse } from "next/server";
import {
    fetchMmInventoryMovements,
    movementErrorStatus,
    type MmInventoryMovement
} from "@/app/api/manufacturing/services/mm-inventory-movements.service";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function valueOrNull(value: string | null): string | null {
    const normalized = value?.trim() || null;
    return normalized && normalized.toUpperCase() !== "ALL" ? normalized : null;
}

function numberOrNull(value: string | null): number | null {
    const normalized = valueOrNull(value);
    if (!normalized) return null;
    const number = Number(normalized);
    return Number.isSafeInteger(number) && number > 0 ? number : null;
}

interface ProductSmallestMetadata {
    productId: number;
    parentProductId: number;
    productName: string;
    productCode: string;
    description: string;
    unitName: string;
    unitShortcut: string;
    unitOfMeasurementCount: number;
    isSmallest: boolean;
}

/**
 * Loads all active products from Directus to resolve any child packaging variants (e.g. Boxes, Cases)
 * back to their parent / smallest unit product (e.g. Piece, Pouch).
 */
async function loadProductSmallestMapping(): Promise<{
    productMap: Map<number, ProductSmallestMetadata>;
    parentChildMap: Map<number, Set<number>>;
}> {
    const productMap = new Map<number, ProductSmallestMetadata>();
    const parentChildMap = new Map<number, Set<number>>();

    try {
        const fields = [
            "product_id",
            "product_name",
            "product_code",
            "description",
            "parent_id",
            "parent_id.product_id",
            "parent_id.id",
            "unit_of_measurement.unit_name",
            "unit_of_measurement.unit_shortcut",
            "unit_of_measurement_count"
        ].join(",");

        const url = `${DIRECTUS_URL}/items/products?limit=-1&fields=${fields}&filter[isActive][_eq]=1`;
        const res = await fetch(url, { headers, cache: "no-store" });
        if (res.ok) {
            const json = await res.json();
            const list = Array.isArray(json.data) ? json.data : [];

            for (const p of list) {
                const pid = Number(p.product_id ?? p.id ?? 0);
                if (!Number.isSafeInteger(pid) || pid <= 0) continue;

                const rawParent = p.parent_id;
                const parentIdNum = Number(
                    rawParent && typeof rawParent === "object"
                        ? (rawParent as Record<string, unknown>).product_id ?? (rawParent as Record<string, unknown>).id
                        : rawParent
                );

                const hasDifferentParent =
                    Number.isSafeInteger(parentIdNum) && parentIdNum > 0 && parentIdNum !== pid;
                const parentProductId = hasDifferentParent ? parentIdNum : pid;

                const uom = typeof p.unit_of_measurement === "object" && p.unit_of_measurement !== null
                    ? (p.unit_of_measurement as { unit_name?: string; unit_shortcut?: string })
                    : null;

                const uomCount = Number(p.unit_of_measurement_count ?? 1);

                productMap.set(pid, {
                    productId: pid,
                    parentProductId,
                    productName: String(p.product_name || p.description || `Product #${pid}`).trim(),
                    productCode: String(p.product_code || "").trim(),
                    description: String(p.description || p.product_name || `Product #${pid}`).trim(),
                    unitName: uom?.unit_name ? String(uom.unit_name).trim() : "",
                    unitShortcut: uom?.unit_shortcut ? String(uom.unit_shortcut).trim() : "",
                    unitOfMeasurementCount: Number.isFinite(uomCount) && uomCount > 0 ? uomCount : 1,
                    isSmallest: !hasDifferentParent && (!Number.isFinite(uomCount) || uomCount <= 1)
                });

                if (!parentChildMap.has(parentProductId)) {
                    parentChildMap.set(parentProductId, new Set<number>());
                }
                parentChildMap.get(parentProductId)!.add(pid);
            }
        }
    } catch (err) {
        console.warn("[ProductTracing BFF] Failed to load product smallest mapping:", err);
    }

    return { productMap, parentChildMap };
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const branch = numberOrNull(searchParams.get("branch") || searchParams.get("branch_id"));
        const productType = numberOrNull(searchParams.get("productType") || searchParams.get("product_type_id"));
        const productId = numberOrNull(searchParams.get("productId") || searchParams.get("product_id"));
        const startDateStr = valueOrNull(searchParams.get("startDate") || searchParams.get("start_date"));
        const endDateStr = valueOrNull(searchParams.get("endDate") || searchParams.get("end_date"));

        // Load mapping to convert all packaging units to smallest units
        const { productMap, parentChildMap } = await loadProductSmallestMapping();

        // If a parent product ID is specified, resolve all child variant product IDs
        let matchedProductIds: Set<number> | null = null;
        if (productId) {
            matchedProductIds = parentChildMap.get(productId) || new Set<number>([productId]);
        }

        // Fetch movements from Spring Boot backend service
        const movements: MmInventoryMovement[] = await fetchMmInventoryMovements({
            branch: branch || null,
            productType: productType || null,
            product: matchedProductIds && matchedProductIds.size === 1 ? productId : null
        });

        let filtered = movements;

        // Filter by branch if present
        if (branch) {
            filtered = filtered.filter((m) => Number(m.branchId) === branch);
        }

        // Filter by product type if present
        if (productType) {
            filtered = filtered.filter((m) => Number(m.productTypeId) === productType);
        }

        // Filter by parent product family if present
        if (matchedProductIds) {
            filtered = filtered.filter((m) => {
                const pid = Number(m.productId);
                return matchedProductIds!.has(pid);
            });
        }

        // Filter by date range if provided
        if (startDateStr) {
            const startEpoch = new Date(startDateStr).getTime();
            if (!Number.isNaN(startEpoch)) {
                filtered = filtered.filter((m) => {
                    const t = new Date(m.transactionDate || m.postedAt || "").getTime();
                    return Number.isNaN(t) || t >= startEpoch;
                });
            }
        }

        if (endDateStr) {
            const endEpoch = new Date(endDateStr).getTime();
            if (!Number.isNaN(endEpoch)) {
                filtered = filtered.filter((m) => {
                    const t = new Date(m.transactionDate || m.postedAt || "").getTime();
                    return Number.isNaN(t) || t <= endEpoch;
                });
            }
        }

        // Normalize all movements so the product is ONLY shown as the smallest unit
        // (Child packaging units like Box/Carton are converted and displayed as the parent smallest unit)
        const normalizedMovements = filtered.map((m) => {
            const originalPid = Number(m.productId || 0);
            const currentMeta = productMap.get(originalPid);

            if (!currentMeta) {
                return m;
            }

            // If it's a child packaging variant, resolve to parent smallest product
            if (currentMeta.parentProductId && currentMeta.parentProductId !== originalPid) {
                const parentMeta = productMap.get(currentMeta.parentProductId);
                if (parentMeta) {
                    const ratio = currentMeta.unitOfMeasurementCount > 1 ? currentMeta.unitOfMeasurementCount : 1;
                    const qIn = Number(m.quantityIn || 0);
                    const qOut = Number(m.quantityOut || 0);

                    return {
                        ...m,
                        productId: parentMeta.productId,
                        productName: parentMeta.productName,
                        productCode: parentMeta.productCode,
                        description: parentMeta.description,
                        unitName: parentMeta.unitName || m.unitName,
                        unitShortcut: parentMeta.unitShortcut || m.unitShortcut,
                        // Convert quantity to base smallest units if recorded in packaging units
                        quantityIn: qIn > 0 ? qIn * ratio : qIn,
                        quantityOut: qOut > 0 ? qOut * ratio : qOut,
                        remarks: m.remarks
                            ? `${m.remarks} (Converted from ${currentMeta.productCode || currentMeta.productName})`
                            : `Converted from ${currentMeta.productCode || currentMeta.productName}`
                    };
                }
            }

            return m;
        });

        return NextResponse.json(normalizedMovements);
    } catch (error) {
        const status = movementErrorStatus(error);
        let message = error instanceof Error ? error.message : "Failed to load inventory movements.";
        message = message
            .replace(/,\s*"path":\s*"[^"]*"/g, "")
            .replace(/"path":\s*"[^"]*"/g, "")
            .replace(/https?:\/\/[^\s]+/g, "")
            .trim();
        console.error("[ProductTracing BFF] Read failed:", error);
        return NextResponse.json({ error: message }, { status });
    }
}
