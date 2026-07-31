import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import { getTodayDateString } from "@/app/api/manufacturing/directus-api";
import { ProductVersion, RouteStep, RouteBOMItem, ProductOverhead } from "@/modules/manufacturing-management/finished-goods/types";

type DirectusOverheadRelation = {
    id?: number | string;
    overhead_id?: number | string;
    overhead_name?: string | null;
};

type DirectusProductOverhead = {
    id: number | string;
    amount?: number | string | null;
    overhead_id?: number | string | DirectusOverheadRelation | null;
};

type VersionSelectionCandidate = {
    version_name?: unknown;
    status?: unknown;
};

export function isStandardBOMVersion(version: VersionSelectionCandidate) {
    const normalizedName = String(version.version_name ?? "")
        .trim()
        .toLowerCase()
        .replace(/[._-]+/g, " ")
        .replace(/\s+/g, " ");

    return normalizedName === "v1"
        || normalizedName === "v1 0"
        || normalizedName === "version 1"
        || normalizedName === "version 1 0"
        || normalizedName === "standard bom version 1"
        || normalizedName === "standard bom version 1 0";
}

export function selectPreferredActiveVersion<T extends VersionSelectionCandidate>(versions: T[]) {
    if (!versions || versions.length === 0) return null;
    const activeVersions = versions.filter(version => {
        const s = String(version.status ?? "").toLowerCase();
        const verRecord = version as Record<string, unknown>;
        return s === "active" || s === "approved" || verRecord.is_active === true || verRecord.is_active === 1;
    });
    const pool = activeVersions.length > 0 ? activeVersions : versions;
    return pool.find(isStandardBOMVersion) || pool[0] || null;
}

export async function getBOMDetailsForVersion(
    productId: number,
    versionId: number,
    visitedProducts: Set<number> = new Set()
): Promise<{
    version: ProductVersion | null;
    routes: RouteStep[];
}> {
    if (!productId || visitedProducts.has(productId)) {
        return { version: null, routes: [] };
    }
    visitedProducts.add(productId);

    try {
        let version: ProductVersion | null = null;
        
        // 1. Try to fetch the version directly by ID (fastest, bypasses recursive fallbacks)
        const resVerDirect = await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version/${versionId}`, { headers, cache: "no-store" });
        if (resVerDirect.ok) {
            const verData = await resVerDirect.json();
            version = verData.data || null;
        }
        
        // 2. Fall back to filtered query if direct fetch did not find the version
        if (!version) {
            const filter = encodeURIComponent(JSON.stringify({
                _and: [
                    { product_id: { _eq: productId } },
                    { version_id: { _eq: versionId } }
                ]
            }));
            const resVer = await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version?filter=${filter}&limit=1`, { headers, cache: "no-store" });
            if (resVer.ok) {
                const verData = await resVer.json();
                version = verData.data?.[0] || null;
            }
        }
        
        if (!version) {
            try {
                const prodRes = await fetch(`${DIRECTUS_URL}/items/products/${productId}?fields=product_id,parent_id`, { headers });
                if (prodRes.ok) {
                    const prod = (await prodRes.json()).data;
                    const parentVal = prod?.parent_id;
                    const parentIdVal = parentVal && typeof parentVal === 'object' ? Number(parentVal.product_id) : (parentVal ? Number(parentVal) : null);
                    if (parentIdVal && !visitedProducts.has(parentIdVal)) {
                        const parentRes = await getBOMDetailsForVersion(parentIdVal, versionId, visitedProducts);
                        if (parentRes.version) return parentRes;
                    }
                }
            } catch (err) {
                console.error("Error resolving parent BOM details fallback:", err);
            }

            try {
                const childrenRes = await fetch(`${DIRECTUS_URL}/items/products?filter[parent_id][_eq]=${productId}&fields=product_id`, { headers });
                if (childrenRes.ok) {
                    const children = (await childrenRes.json()).data || [];
                    for (const child of children) {
                        const childId = Number(child.product_id);
                        if (childId && !visitedProducts.has(childId)) {
                            const childRes = await getBOMDetailsForVersion(childId, versionId, visitedProducts);
                            if (childRes.version) return childRes;
                        }
                    }
                }
            } catch (err) {
                console.error("Error resolving child BOM details fallback:", err);
            }

            return { version: null, routes: [] };
        }

        version.custom_overhead = Number(version.custom_overhead ?? 0);

        const overheadFilter = encodeURIComponent(JSON.stringify({
            _and: [
                { product_id: { _eq: productId } },
                { version_id: { _eq: version.version_id } }
            ]
        }));
        const overheadRes = await fetch(
            `${DIRECTUS_URL}/items/product_overheads?filter=${overheadFilter}&fields=*,overhead_id.*&limit=-1`,
            { headers, cache: "no-store" }
        );
        const overheadData = overheadRes.ok ? (await overheadRes.json()).data || [] : [];
        version.overheads = overheadData
            .map((item: DirectusProductOverhead): ProductOverhead | null => {
                const relation = item.overhead_id;
                const overheadId = typeof relation === "object" && relation !== null
                    ? Number(relation.id ?? relation.overhead_id ?? 0)
                    : Number(relation ?? 0);
                if (!Number.isFinite(overheadId) || overheadId <= 0) return null;
                return {
                    id: String(item.id),
                    overheadId,
                    overheadName: typeof relation === "object" && relation !== null
                        ? String(relation.overhead_name ?? "")
                        : "",
                    amount: Number(item.amount ?? 0)
                };
            })
            .filter((item: ProductOverhead | null): item is ProductOverhead => item !== null);

        const routesFilter = encodeURIComponent(JSON.stringify({ version_id: { _eq: version.version_id } }));
        const resRoutes = await fetch(`${DIRECTUS_URL}/items/manufacturing_routes?filter=${routesFilter}&sort=sequence_order&limit=-1`, { headers, cache: "no-store" });
        const routesJson = await resRoutes.json();
        let routes: RouteStep[] = routesJson.data || [];

        const getRouteId = (val: unknown): number => {
            if (!val) return 0;
            if (typeof val === "object") return Number((val as Record<string, unknown>).route_id || (val as Record<string, unknown>).id || 0);
            return Number(val) || 0;
        };
        const getProductId = (val: unknown): number => {
            if (!val) return 0;
            if (typeof val === "object") return Number((val as Record<string, unknown>).product_id || (val as Record<string, unknown>).id || 0);
            return Number(val) || 0;
        };

        const routeIds = routes.map(r => getRouteId(r.route_id)).filter(Boolean);
        const bomFilter = routeIds.length > 0
            ? encodeURIComponent(JSON.stringify({ route_id: { _in: routeIds } }))
            : "";
        const resBom = bomFilter
            ? await fetch(`${DIRECTUS_URL}/items/manufacturing_routes_bom?filter=${bomFilter}&limit=-1`, { headers, cache: "no-store" })
            : await fetch(`${DIRECTUS_URL}/items/manufacturing_routes_bom?limit=-1`, { headers, cache: "no-store" });
        const bomJson = resBom.ok ? await resBom.json() : { data: [] };
        const bomItems: RouteBOMItem[] = bomJson.data || [];

        bomItems.forEach(b => {
            b.product_id = getProductId(b.product_id);
        });

        (version as unknown as Record<string, unknown>).bom_items = bomItems;
        if (routes.length === 0 && bomItems.length > 0) {
            routes = [{
                route_id: 0,
                version_id: version.version_id,
                sequence_order: 1,
                setup_time_hours: 0,
                run_time_hours: 0,
                operation_name: "Standard Assembly",
                bom_items: bomItems
            } as unknown as RouteStep];
        } else if (routes.length > 0) {
            routes.forEach(r => {
                const rId = getRouteId(r.route_id);
                r.bom_items = bomItems.filter(b => {
                    const bRouteId = getRouteId(b.route_id);
                    return (bRouteId > 0 && bRouteId === rId) || routes.length === 1;
                });
            });
        }

        const bomProductIds = [...new Set(
            bomItems
                .map(item => Number(item.product_id))
                .filter(productId => Number.isFinite(productId) && productId > 0)
        )];
        if (bomProductIds.length > 0) {
            const productFilter = encodeURIComponent(JSON.stringify({ product_id: { _in: bomProductIds } }));
            const versionFilter = encodeURIComponent(JSON.stringify({ product_id: { _in: bomProductIds } }));
            const [productsRes, productVersionsRes] = await Promise.all([
                fetch(
                    `${DIRECTUS_URL}/items/products?filter=${productFilter}&fields=product_id,product_type&limit=-1`,
                    { headers, cache: "no-store" }
                ),
                fetch(
                    `${DIRECTUS_URL}/items/product_manufacturing_version?filter=${versionFilter}&fields=product_id&limit=-1`,
                    { headers, cache: "no-store" }
                )
            ]);

            const products = productsRes.ok ? (await productsRes.json()).data || [] : [];
            const productTypes = new Map<number, number | null>(
                products.map((product: { product_id?: number; product_type?: number | null }) => [
                    Number(product.product_id),
                    product.product_type == null ? null : Number(product.product_type)
                ])
            );
            const versionedProductIds = new Set<number>(
                productVersionsRes.ok
                    ? ((await productVersionsRes.json()).data || [])
                        .map((productVersion: { product_id?: number }) => Number(productVersion.product_id))
                        .filter((productId: number) => Number.isFinite(productId) && productId > 0)
                    : []
            );

            bomItems.forEach(item => {
                const productId = Number(item.product_id);
                item.product_type = productTypes.get(productId) ?? null;
                item.has_versions = versionedProductIds.has(productId);
            });
        }



        version.routes = routes;
        return { version, routes };
    } catch (e) {
        console.error(`[Versions Helper] Error fetching version details for version ID ${versionId}:`, e);
        return { version: null, routes: [] };
    }
}

export async function getActiveVersionForProduct(
    productId: number,
    customerId?: number,
    visitedProducts: Set<number> = new Set()
): Promise<{
    version: ProductVersion | null;
    routes: RouteStep[];
}> {
    if (!productId || visitedProducts.has(productId)) {
        return { version: null, routes: [] };
    }
    visitedProducts.add(productId);

    try {
        let resolvedVersionId: number | null = null;
        let version: ProductVersion | null = null;

        // 1. If customerId is provided, check for customer-specific version override
        if (customerId) {
            const custFilter = encodeURIComponent(JSON.stringify({
                customer_id: { _eq: Number(customerId) },
                product_id: { _eq: productId }
            }));
            const resOverride = await fetch(`${DIRECTUS_URL}/items/customer_product_version?filter=${custFilter}&limit=1`, { headers, cache: "no-store" });
            if (resOverride.ok) {
                const overrideJson = await resOverride.json();
                const overrideRecord = overrideJson.data?.[0];
                if (overrideRecord && overrideRecord.version_id) {
                    resolvedVersionId = Number(overrideRecord.version_id);
                }
            }
        }

        // 2. Retrieve version metadata
        if (resolvedVersionId) {
            const resVer = await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version/${resolvedVersionId}`, { headers, cache: "no-store" });
            if (resVer.ok) {
                const verJson = await resVer.json();
                version = verJson.data || null;
            }
        } else {
            const filter = encodeURIComponent(JSON.stringify({
                product_id: { _eq: productId }
            }));
            const resVer = await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version?filter=${filter}&limit=-1`, { headers, cache: "no-store" });
            if (resVer.ok) {
                const verJson = await resVer.json();
                version = selectPreferredActiveVersion<ProductVersion>(verJson.data || []);
            }
        }

        if (!version) {
            try {
                const prodRes = await fetch(`${DIRECTUS_URL}/items/products/${productId}?fields=product_id,parent_id`, { headers });
                if (prodRes.ok) {
                    const prod = (await prodRes.json()).data;
                    const parentVal = prod?.parent_id;
                    const parentIdVal = parentVal && typeof parentVal === 'object' ? Number(parentVal.product_id) : (parentVal ? Number(parentVal) : null);
                    if (parentIdVal && !visitedProducts.has(parentIdVal)) {
                        const parentRes = await getActiveVersionForProduct(parentIdVal, customerId, visitedProducts);
                        if (parentRes.version) return parentRes;
                    }
                }
            } catch (err) {
                console.error("Error resolving parent version fallback:", err);
            }

            try {
                const childrenRes = await fetch(`${DIRECTUS_URL}/items/products?filter[parent_id][_eq]=${productId}&fields=product_id`, { headers });
                if (childrenRes.ok) {
                    const children = (await childrenRes.json()).data || [];
                    for (const child of children) {
                        const childId = Number(child.product_id);
                        if (childId && !visitedProducts.has(childId)) {
                            const childRes = await getActiveVersionForProduct(childId, customerId, visitedProducts);
                            if (childRes.version) return childRes;
                        }
                    }
                }
            } catch (err) {
                console.error("Error resolving child version fallback:", err);
            }

            return { version: null, routes: [] };
        }

        return getBOMDetailsForVersion(productId, version.version_id, visitedProducts);
    } catch (e) {
        console.error(`[Versions Helper] Error fetching active version for product ID ${productId}:`, e);
        return { version: null, routes: [] };
    }
}

export async function createProductVersion(
    productId: number,
    versionName: string,
    expectedYield: number = 100,
    baseQuantity: number = 1,
    uomId?: number | null
): Promise<number | null> {
    try {
        const todayStr = await getTodayDateString();
        const url = `${DIRECTUS_URL}/items/product_manufacturing_version`;
        const payload = {
            product_id: productId,
            version_name: versionName,
            expected_yield_percentage: expectedYield,
            base_quantity: baseQuantity,
            uom_id: uomId || null,
            status: "For Approval",
            valid_from: todayStr
        };
        const res = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error(`Failed to create product version: ${res.status}`);
        const json = await res.json();
        return json.data?.version_id || null;
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed product version registration:", e);
        return null;
    }
}

export async function updateProductStandardCost(productId: number, standardCost: number): Promise<boolean> {
    try {
        const url = `${DIRECTUS_URL}/items/products/${productId}`;
        const res = await fetch(url, {
            method: "PATCH",
            headers,
            body: JSON.stringify({ cost_per_unit: standardCost })
        });
        return res.ok;
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed standard cost update:", e);
        return false;
    }
}

