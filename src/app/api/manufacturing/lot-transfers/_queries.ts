import { LotTransferError } from "./_errors";
import { LOT_TRANSFER_COLLECTION } from "./_config";
import { directusItem, directusRequest } from "./_directus";
import {
    attachLinkedReversal,
    hydrateTransferRecord,
    mapTransferRow,
    readLinkedReversals
} from "./_record-mappers";
import type { LotTransferRecord } from "./_types";
import { isRecord, numeric } from "./_values";

function validDateFilter(value: string, label: string): string {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) throw new LotTransferError(400, `${label} filters must use YYYY-MM-DD.`);
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const utcMidnight = Date.UTC(year, month - 1, day);
    const canonicalDate = new Date(utcMidnight).toISOString().slice(0, 10);
    if (canonicalDate !== value) throw new LotTransferError(400, `${label} ${value} is invalid.`);
    return value;
}

function requestedDateBoundary(value: string, endExclusive = false): string {
    const canonicalDate = validDateFilter(value, "Requested date");
    const year = Number(canonicalDate.slice(0, 4));
    const month = Number(canonicalDate.slice(5, 7));
    const day = Number(canonicalDate.slice(8, 10));
    const utcMidnight = Date.UTC(year, month - 1, day);
    const boundary = utcMidnight + (endExclusive ? 24 * 60 * 60 * 1000 : 0) - (8 * 60 * 60 * 1000);
    return new Date(boundary).toISOString();
}

export interface LotTransferListOptions {
    status?: string | string[] | null;
    branchId?: number | null;
    search?: string | null;
    requestedFrom?: string | null;
    requestedTo?: string | null;
    transferDateFrom?: string | null;
    transferDateTo?: string | null;
    productId?: number | null;
    sourceLotId?: number | null;
    targetLotId?: number | null;
    sourceBatchNo?: string | null;
    targetBatchNo?: string | null;
    requestedBy?: number | null;
    approvedBy?: number | null;
    postedBy?: number | null;
    limit?: number;
    offset?: number;
}

export async function listLotTransfers(options: LotTransferListOptions): Promise<{ data: LotTransferRecord[]; totalCount: number }> {
    const lineFilterActive = Boolean(
        (options.productId && options.productId > 0)
        || options.sourceBatchNo?.trim()
        || options.targetBatchNo?.trim()
        || options.search?.trim()
    );
    const params = new URLSearchParams({
        fields: "*",
        limit: String(lineFilterActive ? 500 : Math.min(500, Math.max(1, options.limit || 200))),
        offset: String(lineFilterActive ? 0 : Math.max(0, options.offset || 0)),
        meta: "filter_count",
        sort: "-transfer_date,-requested_at,-lot_transfer_id"
    });
    const statuses = Array.isArray(options.status)
        ? options.status
        : options.status
            ? options.status.split(",").map((status) => status.trim()).filter(Boolean)
            : [];
    if (statuses.length > 0) params.set("filter[status][_in]", statuses.join(","));
    if (options.branchId && options.branchId > 0) params.set("filter[branch_id][_eq]", String(options.branchId));
    if (options.search?.trim() && !lineFilterActive) params.set("search", options.search.trim());
    if (options.requestedFrom) params.set("filter[requested_at][_gte]", requestedDateBoundary(options.requestedFrom));
    if (options.requestedTo) params.set("filter[requested_at][_lt]", requestedDateBoundary(options.requestedTo, true));
    if (options.requestedFrom && options.requestedTo && requestedDateBoundary(options.requestedFrom) > requestedDateBoundary(options.requestedTo, true)) {
        throw new LotTransferError(400, "Requested date range is invalid: the start date must be on or before the end date.");
    }
    const transferDateFrom = options.transferDateFrom ? validDateFilter(options.transferDateFrom, "Transfer date") : null;
    const transferDateTo = options.transferDateTo ? validDateFilter(options.transferDateTo, "Transfer date") : null;
    if (transferDateFrom && transferDateTo && transferDateFrom > transferDateTo) {
        throw new LotTransferError(400, "Transfer date range is invalid: the start date must be on or before the end date.");
    }
    if (transferDateFrom) params.set("filter[transfer_date][_gte]", transferDateFrom);
    if (transferDateTo) params.set("filter[transfer_date][_lte]", transferDateTo);
    if (options.productId && options.productId > 0 && !lineFilterActive) params.set("filter[product_id][_eq]", String(options.productId));
    if (options.sourceLotId && options.sourceLotId > 0) params.set("filter[source_lot_id][_eq]", String(options.sourceLotId));
    if (options.targetLotId && options.targetLotId > 0) params.set("filter[target_lot_id][_eq]", String(options.targetLotId));
    if (options.sourceBatchNo?.trim() && !lineFilterActive) params.set("filter[source_batch_no][_icontains]", options.sourceBatchNo.trim());
    if (options.targetBatchNo?.trim() && !lineFilterActive) params.set("filter[target_batch_no][_icontains]", options.targetBatchNo.trim());
    if (options.requestedBy && options.requestedBy > 0) params.set("filter[requested_by][_eq]", String(options.requestedBy));
    if (options.approvedBy && options.approvedBy > 0) params.set("filter[approved_by][_eq]", String(options.approvedBy));
    if (options.postedBy && options.postedBy > 0) params.set("filter[posted_by][_eq]", String(options.postedBy));

    const payload = await directusRequest(`/items/${LOT_TRANSFER_COLLECTION}?${params.toString()}`, {}, "Lot-transfer list lookup");
    if (!isRecord(payload) || !Array.isArray(payload.data)) {
        throw new LotTransferError(502, "Lot-transfer list returned an invalid Directus response.");
    }
    const meta = isRecord(payload.meta) ? numeric(payload.meta.filter_count) : payload.data.length;
    const recordsWithoutLinks = await Promise.all(payload.data.filter(isRecord).map(async (row) => hydrateTransferRecord(mapTransferRow(row), false)));
    const linkedReversals = await readLinkedReversals(recordsWithoutLinks.map((record) => record.id));
    const records = recordsWithoutLinks.map((record) => attachLinkedReversal(record, linkedReversals.get(record.id)));
    const searchText = options.search?.trim().toLowerCase() || "";
    const filteredRecords = lineFilterActive
        ? records.filter((record) => {
            const detailMatches = record.details.some((detail) => {
                const productMatches = !options.productId || detail.productId === options.productId;
                const sourceBatchMatches = !options.sourceBatchNo?.trim() || detail.sourceBatchNo.toLowerCase().includes(options.sourceBatchNo.trim().toLowerCase());
                const targetBatchMatches = !options.targetBatchNo?.trim() || detail.targetBatchNo.toLowerCase().includes(options.targetBatchNo.trim().toLowerCase());
                return productMatches && sourceBatchMatches && targetBatchMatches;
            });
            const searchMatches = !searchText || [
                record.requestNo,
                record.reason,
                ...record.details.flatMap((detail) => [detail.sourceBatchNo, detail.targetBatchNo, String(detail.productId)])
            ].some((value) => value.toLowerCase().includes(searchText));
            return detailMatches && searchMatches;
        })
        : records;
    const pagedRecords = lineFilterActive
        ? filteredRecords.slice(Math.max(0, options.offset || 0), Math.max(0, options.offset || 0) + Math.min(500, Math.max(1, options.limit || 200)))
        : filteredRecords;
    return {
        data: pagedRecords,
        totalCount: lineFilterActive ? filteredRecords.length : meta || payload.data.length
    };
}

export async function getLotTransfer(id: number): Promise<LotTransferRecord> {
    const row = await directusItem(`/items/${LOT_TRANSFER_COLLECTION}/${encodeURIComponent(String(id))}?fields=*`, "Lot-transfer lookup");
    return hydrateTransferRecord(mapTransferRow(row));
}
