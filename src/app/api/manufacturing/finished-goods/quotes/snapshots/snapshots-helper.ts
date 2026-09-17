import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";

export async function fetchQuotationSnapshots(quoteId: number): Promise<unknown[]> {
    try {
        const url = `${DIRECTUS_URL}/items/quotation_snapshots?filter[quotation_id][_eq]=${quoteId}&limit=-1`;
        const res = await fetch(url, { headers, cache: "no-store" });
        if (!res.ok) return [];
        const snapshots = ((await res.json()).data || []) as Record<string, unknown>[];

        const versionIds = Array.from(new Set(snapshots.map(s => s.version_id).filter(Boolean)));
        const typeIds = Array.from(new Set(snapshots.map(s => s.product_type_id).filter(Boolean)));

        const versionMap = new Map<number, string>();
        const typeMap = new Map<number, string>();

        const promises: Promise<void>[] = [];

        if (versionIds.length > 0) {
            const verUrl = `${DIRECTUS_URL}/items/product_manufacturing_version?filter[id][_in]=${versionIds.join(",")}&limit=-1&fields=id,version_name`;
            promises.push(
                fetch(verUrl, { headers, cache: "no-store" })
                    .then(async vRes => {
                        if (vRes.ok) {
                            const vData = (await vRes.json()).data || [];
                            vData.forEach((v: { id: number; version_name: string }) => {
                                if (v.id && v.version_name) versionMap.set(Number(v.id), v.version_name);
                            });
                        }
                    })
                    .catch(() => {})
            );
        }

        if (typeIds.length > 0) {
            const typeUrl = `${DIRECTUS_URL}/items/product_type?filter[id][_in]=${typeIds.join(",")}&limit=-1&fields=id,name`;
            promises.push(
                fetch(typeUrl, { headers, cache: "no-store" })
                    .then(async tRes => {
                        if (tRes.ok) {
                            const tData = (await tRes.json()).data || [];
                            tData.forEach((t: { id: number; name: string }) => {
                                if (t.id && t.name) typeMap.set(Number(t.id), t.name);
                            });
                        }
                    })
                    .catch(() => {})
            );
        }

        if (promises.length > 0) {
            await Promise.all(promises);
        }

        return snapshots.map(s => {
            const mapped = { ...s };
            if (!mapped.version_name && mapped.version_id) {
                mapped.version_name = versionMap.get(Number(mapped.version_id)) || `v${mapped.version_id}.0`;
            }
            if (!mapped.product_type_name && mapped.product_type_id) {
                mapped.product_type_name = typeMap.get(Number(mapped.product_type_id)) || "Finished Goods";
            }
            if (!mapped.product_type_name) {
                mapped.product_type_name = "Finished Goods";
            }
            return mapped;
        });
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed to fetch quotation snapshots:", e);
        return [];
    }
}


