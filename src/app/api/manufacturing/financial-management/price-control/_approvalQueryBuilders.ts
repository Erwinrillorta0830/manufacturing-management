import { toInclusiveDateToEnd } from "./_dateFilters";

type CreateApprovalListParamsArgs = {
    offset: number;
    limit: number;
    fields: string[];
    sort?: string;
};

export function createApprovalListParams({
    offset,
    limit,
    fields,
    sort = "-requested_at",
}: CreateApprovalListParamsArgs): URLSearchParams {
    const params = new URLSearchParams();
    params.set("limit", String(Math.max(1, limit)));
    params.set("offset", String(Math.max(0, offset)));
    params.set("meta", "filter_count,total_count");
    params.set("sort", sort);
    params.set("fields", fields.join(","));
    return params;
}

export function appendApprovalDateRangeFilters(
    params: URLSearchParams,
    andIdx: number,
    dateFrom: string,
    dateTo: string,
): number {
    if (dateFrom) {
        params.set(`filter[_and][${andIdx}][requested_at][_gte]`, dateFrom);
        andIdx += 1;
    }
    if (dateTo) {
        params.set(`filter[_and][${andIdx}][requested_at][_lte]`, toInclusiveDateToEnd(dateTo));
        andIdx += 1;
    }
    return andIdx;
}

export function appendChunkedApprovalInFilter(
    params: URLSearchParams,
    andIdx: number,
    field: string,
    ids: number[],
    options: { emptyMatchesNone?: boolean; chunkSize?: number } = {},
): number {
    const chunkSize = options.chunkSize ?? 200;
    if (ids.length === 0) {
        if (options.emptyMatchesNone) {
            params.set(`filter[_and][${andIdx}][${field}][_in]`, "0");
            return andIdx + 1;
        }
        return andIdx;
    }

    if (ids.length <= chunkSize) {
        params.set(`filter[_and][${andIdx}][${field}][_in]`, ids.join(","));
        return andIdx + 1;
    }

    for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);
        const orIdx = Math.floor(i / chunkSize);
        params.set(`filter[_and][${andIdx}][_or][${orIdx}][${field}][_in]`, chunk.join(","));
    }
    return andIdx + 1;
}
