import { DIRECTUS_URL, headers as directusHeaders } from "../directus-api";

export interface VersionResult {
    versionId: number | null;
    versionName: string | null;
}

export async function resolveVersions(
    pairs: { customerId: number; productId: number }[]
): Promise<Map<string, VersionResult>> {
    const versionMap = new Map<string, VersionResult>();
    if (pairs.length === 0) return versionMap;

    const versionPairs = new Map<string, { customerId: number; productId: number }>();
    for (const p of pairs) {
        const key = `${p.customerId}:${p.productId}`;
        if (!versionPairs.has(key)) {
            versionPairs.set(key, p);
        }
    }

    const custVersionFilter = encodeURIComponent(JSON.stringify({
        _or: Array.from(versionPairs.values()).map((p) => ({
            _and: [
                { customer_id: { _eq: p.customerId } },
                { product_id: { _eq: p.productId } },
            ],
        })),
    }));
    const cpvRes = await fetch(
        `${DIRECTUS_URL}/items/customer_product_version?filter=${custVersionFilter}&limit=-1&fields=customer_id,product_id,version_id`,
        { headers: directusHeaders, cache: "no-store" }
    );
    const cpvData: { customer_id: number; product_id: number; version_id: number | null }[] = cpvRes.ok ? (await cpvRes.json()).data || [] : [];

    const cpvLookup = new Map<string, number>();
    for (const cpv of cpvData) {
        if (cpv.version_id != null) {
            cpvLookup.set(`${cpv.customer_id}:${cpv.product_id}`, cpv.version_id);
        }
    }

    const activeVersionProductIds = new Set<number>();
    const resolvedVersionIds = new Set<number>();
    for (const [key, pair] of versionPairs) {
        const overrideVersionId = cpvLookup.get(key);
        if (overrideVersionId != null) {
            resolvedVersionIds.add(overrideVersionId);
            versionMap.set(key, { versionId: overrideVersionId, versionName: null });
        } else {
            activeVersionProductIds.add(pair.productId);
        }
    }

    if (activeVersionProductIds.size > 0) {
        const activeFilter = encodeURIComponent(JSON.stringify({
            _and: [
                { product_id: { _in: Array.from(activeVersionProductIds) } },
                { status: { _eq: "Active" } },
            ],
        }));
        const activeRes = await fetch(
            `${DIRECTUS_URL}/items/product_manufacturing_version?filter=${activeFilter}&limit=-1&fields=version_id,product_id,version_name`,
            { headers: directusHeaders, cache: "no-store" }
        );
        const activeData: { version_id: number; product_id: number; version_name: string }[] = activeRes.ok ? (await activeRes.json()).data || [] : [];
        for (const av of activeData) {
            resolvedVersionIds.add(av.version_id);
        }

        const activeByProduct = new Map<number, { versionId: number; versionName: string }>();
        for (const av of activeData) {
            if (!activeByProduct.has(av.product_id)) {
                activeByProduct.set(av.product_id, { versionId: av.version_id, versionName: av.version_name });
            }
        }

        // Fallback: For products with no "Active" status version, fetch any latest version
        const missingProductIds = Array.from(activeVersionProductIds).filter((pid) => !activeByProduct.has(pid));
        if (missingProductIds.length > 0) {
            const fallbackFilter = encodeURIComponent(JSON.stringify({ product_id: { _in: missingProductIds } }));
            const fallbackRes = await fetch(
                `${DIRECTUS_URL}/items/product_manufacturing_version?filter=${fallbackFilter}&sort=-version_id&limit=-1&fields=version_id,product_id,version_name`,
                { headers: directusHeaders, cache: "no-store" }
            );
            if (fallbackRes.ok) {
                const fallbackData: { version_id: number; product_id: number; version_name: string }[] = (await fallbackRes.json()).data || [];
                for (const fv of fallbackData) {
                    if (!activeByProduct.has(fv.product_id)) {
                        activeByProduct.set(fv.product_id, { versionId: fv.version_id, versionName: fv.version_name });
                        resolvedVersionIds.add(fv.version_id);
                    }
                }
            }
        }

        for (const key of Array.from(versionPairs.keys())) {
            if (versionMap.has(key)) continue;
            const pair = versionPairs.get(key)!;
            const active = activeByProduct.get(pair.productId);
            versionMap.set(key, {
                versionId: active?.versionId ?? null,
                versionName: active?.versionName ?? null,
            });
        }
    }

    const nameLookupIds = Array.from(resolvedVersionIds).filter((vid) =>
        Array.from(versionMap.values()).some((v) => v.versionId === vid && v.versionName === null)
    );
    if (nameLookupIds.length > 0) {
        const nameFilter = encodeURIComponent(JSON.stringify({ version_id: { _in: nameLookupIds } }));
        const nameRes = await fetch(
            `${DIRECTUS_URL}/items/product_manufacturing_version?filter=${nameFilter}&limit=-1&fields=version_id,version_name`,
            { headers: directusHeaders, cache: "no-store" }
        );
        if (nameRes.ok) {
            const nameData: { version_id: number; version_name: string }[] = (await nameRes.json()).data || [];
            const nameLookup = new Map(nameData.map((n) => [n.version_id, n.version_name]));
            for (const [, vEntry] of versionMap) {
                if (vEntry.versionId != null && vEntry.versionName === null) {
                    vEntry.versionName = nameLookup.get(vEntry.versionId) ?? null;
                }
            }
        }
    }

    return versionMap;
}
