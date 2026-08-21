import { chunkArray, IN_CHUNK_SIZE } from "./_directusPaging";
import { directusHeaders, fetchDirectus, mustBase } from "./price-change-batches/_batch";

const PCR = "price_change_requests";
const CCR = "cost_change_requests";

export type PendingPcrRow = {
    request_id?: number | string | null;
    product_id?:
        | number
        | string
        | {
              product_id?: number | string | null;
              product_code?: string | null;
              product_name?: string | null;
          }
        | null;
    price_type_id?:
        | number
        | string
        | {
              price_type_id?: number | string | null;
              price_type_name?: string | null;
          }
        | null;
    proposed_price?: number | string | null;
    status?: string | null;
    effective_at?: string | null;
    application_status?: string | null;
};

export type PendingCcrRow = {
    request_id?: number | string | null;
    product_id?:
        | number
        | string
        | {
              product_id?: number | string | null;
              product_code?: string | null;
              product_name?: string | null;
          }
        | null;
    proposed_cost?: number | string | null;
    status?: string | null;
    effective_at?: string | null;
    application_status?: string | null;
};

function applyPendingOrScheduledFilter(params: URLSearchParams, status: string) {
    if (status !== "PENDING") {
        if (status) params.set("filter[status][_eq]", status);
        return;
    }

    params.set("filter[_and][0][_or][0][status][_eq]", "PENDING");
    params.set("filter[_and][0][_or][1][_and][0][status][_eq]", "APPROVED");
    params.set("filter[_and][0][_or][1][_and][1][application_status][_eq]", "SCHEDULED");
}

function isScheduleFieldAccessError(error: unknown) {
    if (!(error instanceof Error) || !error.message) return false;

    try {
        const parsed: unknown = JSON.parse(error.message);
        if (typeof parsed !== "object" || parsed === null) return false;
        const text = JSON.stringify(parsed).toLowerCase();
        return text.includes("application_status") || text.includes("effective_at");
    } catch {
        const text = error.message.toLowerCase();
        return text.includes("application_status") || text.includes("effective_at");
    }
}

export async function fetchPendingPcrByProductIds(
    productIds: number[],
    status = "PENDING",
): Promise<PendingPcrRow[]> {
    if (productIds.length === 0) return [];

    const fields = [
        "product_id",
        "price_type_id",
        "proposed_price",
        "product_id.product_id",
        "price_type_id.price_type_id",
        "status",
        "effective_at",
        "application_status",
    ].join(",");
    const legacyFields = [
        "product_id",
        "price_type_id",
        "proposed_price",
        "product_id.product_id",
        "price_type_id.price_type_id",
        "status",
    ].join(",");

    const batches = chunkArray(productIds, IN_CHUNK_SIZE);
    const results = await Promise.all(
        batches.map(async (batch) => {
            const params = new URLSearchParams();
            params.set("limit", "500");
            params.set("fields", fields);
            params.set("filter[product_id][_in]", batch.join(","));
            applyPendingOrScheduledFilter(params, status);

            const url = `${mustBase()}/items/${PCR}?${params.toString()}`;
            const json = await fetchDirectus<{ data?: PendingPcrRow[] }>(url, {
                headers: directusHeaders(),
            });
            return json.data ?? [];
        }).map((promise, index) =>
            promise.catch(async (error: unknown) => {
                if (!isScheduleFieldAccessError(error)) throw error;

                const batch = batches[index];
                const params = new URLSearchParams();
                params.set("limit", "500");
                params.set("fields", legacyFields);
                params.set("filter[product_id][_in]", batch.join(","));
                if (status) params.set("filter[status][_eq]", status);

                const url = `${mustBase()}/items/${PCR}?${params.toString()}`;
                const json = await fetchDirectus<{ data?: PendingPcrRow[] }>(url, {
                    headers: directusHeaders(),
                });
                return json.data ?? [];
            }),
        ),
    );

    return results.flat();
}

export async function fetchPendingCcrByProductIds(
    productIds: number[],
    status = "PENDING",
): Promise<PendingCcrRow[]> {
    if (productIds.length === 0) return [];

    const fields = ["product_id", "proposed_cost", "product_id.product_id", "status", "effective_at", "application_status"].join(",");
    const legacyFields = ["product_id", "proposed_cost", "product_id.product_id", "status"].join(",");

    const batches = chunkArray(productIds, IN_CHUNK_SIZE);
    const results = await Promise.all(
        batches.map(async (batch) => {
            const params = new URLSearchParams();
            params.set("limit", "500");
            params.set("fields", fields);
            params.set("filter[product_id][_in]", batch.join(","));
            applyPendingOrScheduledFilter(params, status);

            const url = `${mustBase()}/items/${CCR}?${params.toString()}`;
            const json = await fetchDirectus<{ data?: PendingCcrRow[] }>(url, {
                headers: directusHeaders(),
            });
            return json.data ?? [];
        }).map((promise, index) =>
            promise.catch(async (error: unknown) => {
                if (!isScheduleFieldAccessError(error)) throw error;

                const batch = batches[index];
                const params = new URLSearchParams();
                params.set("limit", "500");
                params.set("fields", legacyFields);
                params.set("filter[product_id][_in]", batch.join(","));
                if (status) params.set("filter[status][_eq]", status);

                const url = `${mustBase()}/items/${CCR}?${params.toString()}`;
                const json = await fetchDirectus<{ data?: PendingCcrRow[] }>(url, {
                    headers: directusHeaders(),
                });
                return json.data ?? [];
            }),
        ),
    );

    return results.flat();
}
