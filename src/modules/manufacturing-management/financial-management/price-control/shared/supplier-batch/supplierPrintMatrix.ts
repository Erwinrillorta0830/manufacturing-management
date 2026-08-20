import * as pricingApi from "../../product-pricing/providers/pricingApi";
import type { MatrixRow } from "../../product-pricing/types";
import { PRINT_GROUP_CHUNK_SIZE } from "../print/printConstants";

export function buildSupplierPrintParams(supplierId: number): pricingApi.PrintFilterParams {
    return {
        supplier_ids: String(supplierId),
        supplier_scope: "LINKED_ONLY",
        active_only: "1",
    };
}

export async function fetchSupplierPrintMatrixPages(
    supplierId: number,
    groupIds: number[],
    init?: {
        signal?: AbortSignal;
        onProgress?: (done: number, total: number) => void;
    },
): Promise<{ rows: MatrixRow[]; usedUnitIds: Set<number> }> {
    const printParams = buildSupplierPrintParams(supplierId);
    const totalGroups = groupIds.length;
    const assembled: MatrixRow[] = [];
    const usedUnitIds = new Set<number>();
    const { signal, onProgress } = init ?? {};

    for (let offset = 0; offset < groupIds.length; offset += PRINT_GROUP_CHUNK_SIZE) {
        if (signal?.aborted) {
            throw new DOMException("Aborted", "AbortError");
        }

        const chunk = groupIds.slice(offset, offset + PRINT_GROUP_CHUNK_SIZE);
        const pageRes = await pricingApi.getPrintMatrixPage(
            {
                ...printParams,
                group_ids: chunk.join(","),
            },
            { signal },
        );

        assembled.push(...(pageRes.data ?? []));
        for (const unitId of pageRes.usedUnitIds ?? []) {
            usedUnitIds.add(unitId);
        }

        onProgress?.(Math.min(offset + chunk.length, totalGroups), totalGroups);
    }

    assembled.sort((a, b) =>
        (a.display.product_name || "").localeCompare(b.display.product_name || ""),
    );

    return { rows: assembled, usedUnitIds };
}

export async function fetchSupplierPrintMatrix(
    supplierId: number,
    init?: { signal?: AbortSignal; onProgress?: (done: number, total: number) => void },
): Promise<{
    rows: MatrixRow[];
    usedUnitIds: Set<number>;
    totalGroups: number;
}> {
    const metaRes = await pricingApi.getPrintMatrixMeta(buildSupplierPrintParams(supplierId), init);
    const { meta, groupIds } = metaRes;

    if (meta.totalGroups === 0) {
        return { rows: [], usedUnitIds: new Set(), totalGroups: 0 };
    }

    const { rows, usedUnitIds } = await fetchSupplierPrintMatrixPages(supplierId, groupIds, init);

    return { rows, usedUnitIds, totalGroups: meta.totalGroups };
}
