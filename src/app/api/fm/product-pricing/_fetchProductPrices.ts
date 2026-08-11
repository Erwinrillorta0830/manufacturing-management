import { chunkArray, IN_CHUNK_SIZE } from "./_directusPaging";
import { directusHeaders, fetchDirectus, mustBase } from "./price-change-batches/_batch";

const PRICES = "product_per_price_type";

export type DirectusProductPriceRow = {
    id?: number | string | null;
    product_id?: number | string | null;
    price_type_id?: number | string | null;
    price?: number | string | null;
    status?: string | null;
    updated_at?: string | null;
};

export async function fetchDirectusPricesByProductIds(
    productIds: number[],
): Promise<DirectusProductPriceRow[]> {
    if (productIds.length === 0) return [];

    mustBase();

    const uniqueIds = Array.from(
        new Set(productIds.filter((id) => Number.isFinite(id) && id > 0)),
    );
    if (uniqueIds.length === 0) return [];

    const idChunks = chunkArray(uniqueIds, IN_CHUNK_SIZE);
    const chunkResults = await Promise.all(
        idChunks.map(async (chunk) => {
            const params = new URLSearchParams();
            params.set("limit", "-1");
            params.set("fields", "id,product_id,price_type_id,price,status,updated_at");
            params.set("filter[product_id][_in]", chunk.join(","));

            const url = `${mustBase()}/items/${PRICES}?${params.toString()}`;
            const json = await fetchDirectus<{ data: DirectusProductPriceRow[] }>(url, {
                headers: directusHeaders(),
            });
            return json.data ?? [];
        }),
    );

    return chunkResults.flat();
}
