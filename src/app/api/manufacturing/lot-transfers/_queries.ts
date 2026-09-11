import { LotTransferError } from "./_errors";
import { LOT_TRANSFER_COLLECTION, LOT_TRANSFER_DETAIL_COLLECTION } from "./_config";
import { directusItem, directusRequest, directusRows, type RecordValue } from "./_directus";
import {
    attachLinkedReversal,
    hydrateTransferRecord,
    mapTransferRow,
    readLinkedReversals
} from "./_record-mappers";
import type { LotTransferRecord } from "./_types";
import { isRecord, numeric, transferId } from "./_values";

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
    const boundary = new Date(Date.UTC(year, month - 1, day + (endExclusive ? 1 : 0)));
    return `${boundary.toISOString().slice(0, 10)} 00:00:00`;
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

interface NormalizedDateFilters {
    requestedFrom: string | null;
    requestedToExclusive: string | null;
    transferDateFrom: string | null;
    transferDateTo: string | null;
}

function normalizeDateFilters(options: LotTransferListOptions): NormalizedDateFilters {
    const requestedFrom = options.requestedFrom ? requestedDateBoundary(options.requestedFrom) : null;
    const requestedToExclusive = options.requestedTo ? requestedDateBoundary(options.requestedTo, true) : null;
    if (requestedFrom && requestedToExclusive && requestedFrom > requestedToExclusive) {
        throw new LotTransferError(400, "Requested date range is invalid: the start date must be on or before the end date.");
    }

    const transferDateFrom = options.transferDateFrom ? validDateFilter(options.transferDateFrom, "Transfer date") : null;
    const transferDateTo = options.transferDateTo ? validDateFilter(options.transferDateTo, "Transfer date") : null;
    if (transferDateFrom && transferDateTo && transferDateFrom > transferDateTo) {
        throw new LotTransferError(400, "Transfer date range is invalid: the start date must be on or before the end date.");
    }

    return { requestedFrom, requestedToExclusive, transferDateFrom, transferDateTo };
}

function applyHeaderFilters(
    params: URLSearchParams,
    options: LotTransferListOptions,
    dates: NormalizedDateFilters,
    includeSearch: boolean
) {
    const statuses = Array.isArray(options.status)
        ? options.status
        : options.status
            ? options.status.split(",").map((status) => status.trim()).filter(Boolean)
            : [];
    if (statuses.length > 0) params.set("filter[status][_in]", statuses.join(","));
    if (options.branchId && options.branchId > 0) params.set("filter[branch_id][_eq]", String(options.branchId));
    if (includeSearch && options.search?.trim()) params.set("search", options.search.trim());
    if (dates.requestedFrom) params.set("filter[requested_at][_gte]", dates.requestedFrom);
    if (dates.requestedToExclusive) params.set("filter[requested_at][_lt]", dates.requestedToExclusive);
    if (dates.transferDateFrom) params.set("filter[transfer_date][_gte]", dates.transferDateFrom);
    if (dates.transferDateTo) params.set("filter[transfer_date][_lte]", dates.transferDateTo);
    if (options.sourceLotId && options.sourceLotId > 0) params.set("filter[source_lot_id][_eq]", String(options.sourceLotId));
    if (options.targetLotId && options.targetLotId > 0) params.set("filter[target_lot_id][_eq]", String(options.targetLotId));
    if (options.requestedBy && options.requestedBy > 0) params.set("filter[requested_by][_eq]", String(options.requestedBy));
    if (options.approvedBy && options.approvedBy > 0) params.set("filter[approved_by][_eq]", String(options.approvedBy));
    if (options.postedBy && options.postedBy > 0) params.set("filter[posted_by][_eq]", String(options.postedBy));
}

function applyLineFilters(params: URLSearchParams, options: LotTransferListOptions) {
    if (options.productId && options.productId > 0) params.set("filter[product_id][_eq]", String(options.productId));
    if (options.sourceBatchNo?.trim()) params.set("filter[source_batch_no][_icontains]", options.sourceBatchNo.trim());
    if (options.targetBatchNo?.trim()) params.set("filter[target_batch_no][_icontains]", options.targetBatchNo.trim());
}

function createHeaderParams(
    options: LotTransferListOptions,
    dates: NormalizedDateFilters,
    fields: string,
    limit: number,
    offset: number,
    includeSearch: boolean
): URLSearchParams {
    const params = new URLSearchParams({
        fields,
        limit: String(limit),
        offset: String(offset),
        sort: "-transfer_date,-requested_at,-lot_transfer_id"
    });
    applyHeaderFilters(params, options, dates, includeSearch);
    return params;
}

function chunkIds(ids: number[], size = 200): number[][] {
    const chunks: number[][] = [];
    for (let index = 0; index < ids.length; index += size) chunks.push(ids.slice(index, index + size));
    return chunks;
}

export async function listLotTransfers(options: LotTransferListOptions): Promise<{ data: LotTransferRecord[]; totalCount: number }> {
    const detailFilterActive = Boolean(
        (options.productId && options.productId > 0)
        || options.sourceBatchNo?.trim()
        || options.targetBatchNo?.trim()
    );
    const expandedFilterActive = detailFilterActive || Boolean(options.search?.trim());
    const dates = normalizeDateFilters(options);
    const limit = Math.min(500, Math.max(1, options.limit || 200));
    const offset = Math.max(0, options.offset || 0);
    let headerRows: RecordValue[];
    let directusTotalCount: number | null = null;

    if (!expandedFilterActive) {
        const params = createHeaderParams(options, dates, "*", limit, offset, true);
        params.set("meta", "filter_count");
        const payload = await directusRequest(`/items/${LOT_TRANSFER_COLLECTION}?${params.toString()}`, {}, "Lot-transfer list lookup");
        if (!isRecord(payload) || !Array.isArray(payload.data)) {
            throw new LotTransferError(502, "Lot-transfer list returned an invalid Directus response.");
        }
        directusTotalCount = isRecord(payload.meta) ? numeric(payload.meta.filter_count) : payload.data.length;
        headerRows = payload.data.filter(isRecord);
    } else {
        const detailParams = new URLSearchParams({
            fields: "lot_transfer_id",
            limit: "-1"
        });
        applyLineFilters(detailParams, options);
        if (options.search?.trim()) detailParams.set("search", options.search.trim());
        const detailRows = await directusRows(
            `/items/${LOT_TRANSFER_DETAIL_COLLECTION}?${detailParams.toString()}`,
            "Lot-transfer report detail filter lookup"
        );

        const headerCandidateParams = createHeaderParams(options, dates, "lot_transfer_id", -1, 0, true);
        applyLineFilters(headerCandidateParams, options);
        const headerCandidateRows = await directusRows(
            `/items/${LOT_TRANSFER_COLLECTION}?${headerCandidateParams.toString()}`,
            "Lot-transfer report header filter lookup"
        );
        const candidateIds = [...new Set([
            ...detailRows.map((row) => transferId(row)),
            ...headerCandidateRows.map((row) => transferId(row))
        ].filter((id) => id > 0))];

        if (candidateIds.length === 0) {
            return { data: [], totalCount: 0 };
        }

        const expandedRows = (await Promise.all(chunkIds(candidateIds).map(async (ids) => {
            const params = createHeaderParams(options, dates, "*", -1, 0, false);
            params.set("filter[lot_transfer_id][_in]", ids.join(","));
            return directusRows(`/items/${LOT_TRANSFER_COLLECTION}?${params.toString()}`, "Lot-transfer report record lookup");
        }))).flat();
        const uniqueHeaderRows = new Map<number, RecordValue>();
        for (const row of expandedRows) {
            const id = transferId(row);
            if (id > 0) uniqueHeaderRows.set(id, row);
        }
        headerRows = [...uniqueHeaderRows.values()];
    }

    const recordsWithoutLinks = await Promise.all(headerRows.map(async (row) => hydrateTransferRecord(mapTransferRow(row), false)));
    const linkedReversals = await readLinkedReversals(recordsWithoutLinks.map((record) => record.id));
    const records = recordsWithoutLinks.map((record) => attachLinkedReversal(record, linkedReversals.get(record.id)));
    const searchText = options.search?.trim().toLowerCase() || "";
    const filteredRecords = expandedFilterActive
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
    const pagedRecords = expandedFilterActive
        ? filteredRecords.slice(offset, offset + limit)
        : filteredRecords;
    return {
        data: pagedRecords,
        totalCount: expandedFilterActive ? filteredRecords.length : directusTotalCount || headerRows.length
    };
}

export async function getLotTransfer(id: number): Promise<LotTransferRecord> {
    const row = await directusItem(`/items/${LOT_TRANSFER_COLLECTION}/${encodeURIComponent(String(id))}?fields=*`, "Lot-transfer lookup");
    return hydrateTransferRecord(mapTransferRow(row));
}
