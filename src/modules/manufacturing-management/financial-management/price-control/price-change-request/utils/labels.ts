import type {
    CostChangeRequestRow,
    ItemUnifiedApprovalRow,
    ListCostSelectionSnapshot,
    PriceChangeRequestRow,
    PriceTypeSelectionSnapshot,
    PriceTypeUnifiedApprovalRow,
    UnifiedApprovalRow,
} from "../types";

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

export function productLabel(r: PriceChangeRequestRow | CostChangeRequestRow) {
    const product = r.product_id;

    if (isRecord(product)) {
        const code =
            typeof product.product_code === "string" ? product.product_code : String(product.product_code ?? "");
        const name =
            typeof product.product_name === "string" ? product.product_name : String(product.product_name ?? "");

        return [code, name].filter(Boolean).join(" - ");
    }

    return `Product #${r.product_id}`;
}

export function uomLabel(r: PriceChangeRequestRow | CostChangeRequestRow): string {
    const product = r.product_id;
    if (!isRecord(product)) return "—";

    const uom = product.unit_of_measurement;
    if (!isRecord(uom)) return "—";

    const shortcut = typeof uom.unit_shortcut === "string" ? uom.unit_shortcut.trim() : "";
    const name = typeof uom.unit_name === "string" ? uom.unit_name.trim() : "";

    return shortcut || name || "—";
}

export function costRequestToUnifiedRow(row: CostChangeRequestRow): UnifiedApprovalRow {
    const requestId = Number(row.request_id);
    const product = isRecord(row.product_id) ? row.product_id : null;
    const productCode =
        product && typeof product.product_code === "string"
            ? product.product_code
            : product?.product_code != null
              ? String(product.product_code)
              : undefined;
    const productName =
        product && typeof product.product_name === "string"
            ? product.product_name
            : product?.product_name != null
              ? String(product.product_name)
              : undefined;

    return {
        row_key: `cost:${requestId}`,
        kind: "list_price",
        record_label: `CCR-${requestId}`,
        title: productName || productLabel(row),
        subtitle: productCode || undefined,
        status: row.status,
        requested_at: row.requested_at,
        request_id: requestId,
        product_id: row.product_id,
        requested_by: row.requested_by,
        current_cost: row.current_cost ?? null,
        proposed_cost: row.proposed_cost,
        reject_reason: row.reject_reason ?? null,
    };
}

export function pcrBatchMeta(row: PriceChangeRequestRow) {
    const header = row.header_id;
    if (isRecord(header)) {
        const batchHeaderId = Number(header.header_id ?? header.id);
        const remarks = String(header.remarks ?? row.remarks ?? "").trim();
        const referenceNo = String(header.reference_no ?? row.reference_no ?? "").trim();
        return {
            batch_header_id: Number.isFinite(batchHeaderId) && batchHeaderId > 0 ? batchHeaderId : null,
            remarks: remarks || null,
            reference_no: referenceNo || null,
        };
    }

    const numericHeader = Number(header ?? row.batch_header_id);
    return {
        batch_header_id: Number.isFinite(numericHeader) && numericHeader > 0 ? numericHeader : null,
        remarks: row.remarks ?? null,
        reference_no: row.reference_no ?? null,
    };
}

export function priceRowHasBatchLink(
    row: PriceChangeRequestRow | PriceTypeUnifiedApprovalRow,
): boolean {
    if ("kind" in row && row.kind === "price_type") {
        return Number(row.batch_header_id ?? 0) > 0;
    }
    return Boolean(pcrBatchMeta(row as PriceChangeRequestRow).batch_header_id);
}

export function priceRequestToUnifiedRow(row: PriceChangeRequestRow): PriceTypeUnifiedApprovalRow {
    const requestId = Number(row.request_id);
    const product = isRecord(row.product_id) ? row.product_id : null;
    const productCode =
        product && typeof product.product_code === "string"
            ? product.product_code
            : product?.product_code != null
              ? String(product.product_code)
              : undefined;
    const productName =
        product && typeof product.product_name === "string"
            ? product.product_name
            : product?.product_name != null
              ? String(product.product_name)
              : undefined;
    const batchMeta = pcrBatchMeta(row);

    return {
        row_key: `price:${requestId}`,
        kind: "price_type",
        record_label: `PCR-${requestId}`,
        title: productName || productLabel(row),
        subtitle: productCode || undefined,
        status: row.status,
        requested_at: row.requested_at,
        request_id: requestId,
        product_id: row.product_id,
        price_type_id: row.price_type_id,
        proposed_price: row.proposed_price,
        requested_by: row.requested_by,
        batch_header_id: batchMeta.batch_header_id,
        remarks: batchMeta.remarks,
        reference_no: batchMeta.reference_no,
        current_price: row.current_price ?? null,
    };
}

export function snapshotFromCostRow(row: CostChangeRequestRow): ListCostSelectionSnapshot {
    const requestId = Number(row.request_id);
    return {
        request_id: requestId,
        record_label: `CCR-${requestId}`,
        product_label: productLabel(row),
        current_cost: row.current_cost ?? null,
        proposed_cost: Number(row.proposed_cost),
    };
}

export function snapshotFromUnifiedRow(row: ItemUnifiedApprovalRow): ListCostSelectionSnapshot {
    const requestId = Number(row.request_id);
    const currentCost = "current_cost" in row ? row.current_cost : null;
    const proposedCost = "proposed_cost" in row ? row.proposed_cost : 0;

    return {
        request_id: requestId,
        record_label: row.record_label || `CCR-${requestId}`,
        product_label: row.title,
        current_cost: currentCost ?? null,
        proposed_cost: Number(proposedCost ?? 0),
    };
}

function toMoneySnapshot(value: number | string | null | undefined): number | null {
    if (value === null || value === undefined || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

export function snapshotFromPriceRow(row: PriceChangeRequestRow): PriceTypeSelectionSnapshot {
    const requestId = Number(row.request_id);
    const batchMeta = pcrBatchMeta(row);
    const batchHeaderId = batchMeta.batch_header_id ?? 0;

    return {
        request_id: requestId,
        record_label: `PCR-${requestId}`,
        product_label: productLabel(row),
        price_type_label: priceTypeLabel(row),
        batch_header_id: batchHeaderId,
        batch_label: batchHeaderId > 0 ? `PCB-${batchHeaderId}` : "—",
        current_price: toMoneySnapshot(row.current_price),
        proposed_price: Number(row.proposed_price),
    };
}

export function snapshotFromPriceUnifiedRow(row: PriceTypeUnifiedApprovalRow): PriceTypeSelectionSnapshot {
    const requestId = Number(row.request_id);
    const batchHeaderId = Number(row.batch_header_id ?? 0);

    return {
        request_id: requestId,
        record_label: row.record_label || `PCR-${requestId}`,
        product_label: row.title,
        price_type_label: priceTypeLabel(row),
        batch_header_id: batchHeaderId,
        batch_label: batchHeaderId > 0 ? `PCB-${batchHeaderId}` : "—",
        current_price: row.current_price ?? null,
        proposed_price: Number(row.proposed_price),
    };
}

export function snapshotFromPriceApprovalRow(row: UnifiedApprovalRow): PriceTypeSelectionSnapshot {
    if (row.kind === "price_batch") {
        const headerId = Number(row.batch_id ?? row.request_id ?? 0);
        return {
            request_id: -headerId,
            record_label: row.record_label || `PCB-${headerId}`,
            product_label: row.title || `Price change batch #${headerId}`,
            price_type_label: "Batch",
            batch_header_id: headerId,
            batch_label: `PCB-${headerId}`,
            current_price: null,
            proposed_price: Number(row.proposed_min ?? row.proposed_price ?? 0),
        };
    }

    if (row.kind !== "price_type") {
        throw new Error("Only price approval rows can be converted to price snapshots.");
    }

    return snapshotFromPriceUnifiedRow(row);
}

export function priceTypeLabel(r: PriceChangeRequestRow) {
    const priceType = r.price_type_id;

    if (isRecord(priceType)) {
        const priceTypeName =
            typeof priceType.price_type_name === "string"
                ? priceType.price_type_name
                : String(priceType.price_type_name ?? "");

        const priceTypeId =
            typeof priceType.price_type_id === "number" || typeof priceType.price_type_id === "string"
                ? String(priceType.price_type_id)
                : "";

        return priceTypeName || `#${priceTypeId}`;
    }

    return `#${r.price_type_id}`;
}

export function decisionUserLabel(
    _userId: number | string | null | undefined,
    userName: string | null | undefined,
): string {
    const resolvedName = String(userName ?? "").trim();
    if (resolvedName) return resolvedName;
    return "-";
}
