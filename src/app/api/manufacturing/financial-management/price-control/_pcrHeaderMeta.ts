import {
    HEADERS,
    type BatchHeaderRow,
    directusHeaders,
    fetchDirectus,
    isRecord,
    mustBase,
} from "./price-change-batches/_batch";

const IN_CHUNK_SIZE = 200;

export type PcrHeaderIdRef =
    | number
    | string
    | {
          header_id?: number | string | null;
          id?: number | string | null;
          remarks?: string | null;
          reference_no?: string | null;
          status?: string | null;
      }
    | null;

export type PcrHeaderMeta = {
    batch_header_id: number | null;
    remarks: string | null;
    reference_no: string | null;
};

export function resolveHeaderMeta(headerId: PcrHeaderIdRef): PcrHeaderMeta {
    if (headerId === null || headerId === undefined) {
        return { batch_header_id: null, remarks: null, reference_no: null };
    }

    if (isRecord(headerId)) {
        const batchHeaderId = Number(headerId.header_id ?? headerId.id);
        const remarks = String(headerId.remarks ?? "").trim();
        const referenceNo = String(headerId.reference_no ?? "").trim();
        return {
            batch_header_id: Number.isFinite(batchHeaderId) && batchHeaderId > 0 ? batchHeaderId : null,
            remarks: remarks || null,
            reference_no: referenceNo || null,
        };
    }

    const batchHeaderId = Number(headerId);
    return {
        batch_header_id: Number.isFinite(batchHeaderId) && batchHeaderId > 0 ? batchHeaderId : null,
        remarks: null,
        reference_no: null,
    };
}

export function resolveHeaderId(headerId: PcrHeaderIdRef): number | null {
    return resolveHeaderMeta(headerId).batch_header_id;
}

export function headerIdNeedsFetch(headerId: PcrHeaderIdRef): boolean {
    if (headerId === null || headerId === undefined) return false;
    if (isRecord(headerId)) return false;
    const batchHeaderId = Number(headerId);
    return Number.isFinite(batchHeaderId) && batchHeaderId > 0;
}

export async function fetchHeaderMetaByIds(
    ids: number[],
): Promise<Map<number, { remarks: string | null; reference_no: string | null }>> {
    const uniqueIds = Array.from(new Set(ids)).filter((id) => Number.isFinite(id) && id > 0);
    const out = new Map<number, { remarks: string | null; reference_no: string | null }>();

    if (uniqueIds.length === 0) return out;

    for (let offset = 0; offset < uniqueIds.length; offset += IN_CHUNK_SIZE) {
        const chunk = uniqueIds.slice(offset, offset + IN_CHUNK_SIZE);
        const params = new URLSearchParams();
        params.set("fields", "header_id,remarks,reference_no");
        params.set("filter[header_id][_in]", chunk.join(","));
        params.set("limit", String(chunk.length));

        const url = `${mustBase()}/items/${HEADERS}?${params.toString()}`;
        const json = await fetchDirectus<{ data?: BatchHeaderRow[] }>(url, {
            headers: directusHeaders(),
        });

        for (const header of json.data ?? []) {
            const batchHeaderId = Number(header.header_id ?? header.id);
            if (!Number.isFinite(batchHeaderId) || batchHeaderId <= 0) continue;

            const remarks = String(header.remarks ?? "").trim();
            const referenceNo = String(header.reference_no ?? "").trim();
            out.set(batchHeaderId, {
                remarks: remarks || null,
                reference_no: referenceNo || null,
            });
        }
    }

    return out;
}

export type EnrichablePcrRow = {
    header_id?: PcrHeaderIdRef;
    batch_header_id?: number | null;
    remarks?: string | null;
    reference_no?: string | null;
};

export async function enrichPcrRows<T extends EnrichablePcrRow>(rows: T[]): Promise<T[]> {
    const headerIds = rows
        .filter((row) => headerIdNeedsFetch(row.header_id ?? null))
        .map((row) => resolveHeaderId(row.header_id ?? null))
        .filter((id): id is number => id != null);

    const headerMap =
        headerIds.length > 0 ? await fetchHeaderMetaByIds(headerIds) : new Map();

    return rows.map((row) => {
        const base = resolveHeaderMeta(row.header_id ?? null);
        const batchHeaderId = base.batch_header_id ?? row.batch_header_id ?? null;
        const fromMap = batchHeaderId != null ? headerMap.get(batchHeaderId) : undefined;

        return {
            ...row,
            batch_header_id: batchHeaderId,
            remarks: base.remarks ?? fromMap?.remarks ?? row.remarks ?? null,
            reference_no: base.reference_no ?? fromMap?.reference_no ?? row.reference_no ?? null,
        };
    });
}
