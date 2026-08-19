import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import { getTodayDateString } from "@/app/api/manufacturing/directus-api";
import { ProductVersion, RouteStep, RouteBOMItem, ProductOverhead, VersionPosition, RoutePosition } from "@/modules/manufacturing-management/finished-goods/types";

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

        const verOverheadFilter = encodeURIComponent(JSON.stringify({ version_id: { _eq: version.version_id } }));
        const verOverheadRes = await fetch(`${DIRECTUS_URL}/items/product_version_overheads?filter=${verOverheadFilter}&limit=-1`, { headers, cache: "no-store" }).catch(() => null);
        if (verOverheadRes && verOverheadRes.ok) {
            const verOverheadData = (await verOverheadRes.json()).data || [];
            if (verOverheadData.length > 0) {
                const typesRes = await fetch(`${DIRECTUS_URL}/items/overhead_types?limit=-1`, { headers, cache: "no-store" }).catch(() => null);
                const typesList = typesRes && typesRes.ok ? (await typesRes.json()).data || [] : [];
                const typesMap = new Map(typesList.map((t: Record<string, unknown>) => [Number(t.id), t.overhead_name as string]));

                version.overhead_items = verOverheadData.map((item: Record<string, unknown>) => ({
                    id: String(item.id),
                    overhead_type_id: Number(item.overhead_type_id),
                    overhead_name: typesMap.get(Number(item.overhead_type_id)) || (item.remarks as string) || "Overhead Item",
                    cost_per_unit: Number(item.cost || 0),
                    is_active: Boolean(item.is_active ?? true),
                    remarks: (item.remarks as string) || ""
                }));
            }
        }

        const posVersionFilter = encodeURIComponent(JSON.stringify({ version_id: { _eq: version.version_id } }));
        let verPositionsRes = await fetch(`${DIRECTUS_URL}/items/product_version_positions?filter=${posVersionFilter}&limit=-1`, { headers, cache: "no-store" }).catch(() => null);
        if (!verPositionsRes || !verPositionsRes.ok) {
            verPositionsRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_version_positions?filter=${posVersionFilter}&limit=-1`, { headers, cache: "no-store" }).catch(() => null);
        }
        const verPositionsData = (verPositionsRes && verPositionsRes.ok) ? (await verPositionsRes.json()).data || [] : [];
        version.labor_positions = verPositionsData.map((item: Record<string, unknown>): VersionPosition => ({
            id: item.id != null ? (item.id as string | number) : undefined,
            version_id: Number(item.version_id),
            position_id: item.position_id != null ? Number(item.position_id) : null,
            position_name: String(item.position_name || "Operator"),
            category: item.category === "maintenance" ? "maintenance" : "direct_labor",
            manpower_count: Number(item.manpower_count || 1),
            hourly_rate: Number(item.hourly_rate || 0),
            hours_required: item.hours_required != null ? Number(item.hours_required) : undefined,
            daily_rate: item.daily_rate != null ? Number(item.daily_rate) : undefined,
            ot_hours: item.ot_hours != null ? Number(item.ot_hours) : 0,
            include_mandates: item.include_mandates !== undefined ? Boolean(item.include_mandates) : true,
            sss_amount: item.sss_amount != null ? Number(item.sss_amount) : undefined,
            phic_amount: item.phic_amount != null ? Number(item.phic_amount) : undefined,
            hdmf_amount: item.hdmf_amount != null ? Number(item.hdmf_amount) : undefined
        }));

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
        const bomItems: RouteBOMItem[] = [];
        const positionItems: Record<string, unknown>[] = [];
        if (routeIds.length > 0) {
            const bomFilter = encodeURIComponent(JSON.stringify({ route_id: { _in: routeIds } }));
            const resBom = await fetch(
                `${DIRECTUS_URL}/items/manufacturing_routes_bom?filter=${bomFilter}&limit=-1`,
                { headers, cache: "no-store" }
            );
            const bomJson = resBom.ok ? await resBom.json() : { data: [] };
            bomItems.push(...((bomJson.data || []) as RouteBOMItem[]));

            const posFilter = encodeURIComponent(JSON.stringify({ route_id: { _in: routeIds } }));
            const resPos = await fetch(
                `${DIRECTUS_URL}/items/manufacturing_route_positions?filter=${posFilter}&limit=-1`,
                { headers, cache: "no-store" }
            ).catch(() => null);
            if (resPos && resPos.ok) {
                positionItems.push(...((await resPos.json()).data || []));
            }
        }

        if ((!version.labor_positions || version.labor_positions.length === 0) && positionItems.length > 0) {
            version.labor_positions = positionItems.map((item: Record<string, unknown>): VersionPosition => ({
                id: item.id != null ? (item.id as string | number) : undefined,
                version_id: version!.version_id,
                position_id: item.position_id != null ? Number(item.position_id) : null,
                position_name: String(item.position_name || "Operator"),
                manpower_count: Number(item.manpower_count || 1),
                hourly_rate: Number(item.hourly_rate || 0),
                daily_rate: item.daily_rate != null ? Number(item.daily_rate) : undefined
            }));
        }

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
                default_manpower: 1,
                expected_labor_cost: 0,
                operation_name: "Standard Assembly",
                bom_items: bomItems,
                positions: []
            } as unknown as RouteStep];
        } else if (routes.length > 0) {
            routes.forEach(r => {
                const rId = getRouteId(r.route_id);
                r.bom_items = bomItems.filter(b => {
                    const bRouteId = getRouteId(b.route_id);
                    return (bRouteId > 0 && bRouteId === rId) || routes.length === 1;
                });
                r.positions = positionItems
                    .filter(p => getRouteId(p.route_id) === rId)
                    .map((p): RoutePosition => ({
                        id: p.id != null ? (p.id as string | number) : undefined,
                        route_id: getRouteId(p.route_id),
                        position_id: p.position_id != null ? Number(p.position_id) : undefined,
                        position_name: String(p.position_name || "Operator"),
                        manpower_count: Number(p.manpower_count || 1),
                        hourly_rate: Number(p.hourly_rate || 0),
                        daily_rate: p.daily_rate != null ? Number(p.daily_rate) : undefined
                    }));
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
                    `${DIRECTUS_URL}/items/products?filter=${productFilter}&fields=product_id,product_name,product_code,product_type,unit_of_measurement.unit_shortcut,unit_of_measurement.unit_name&limit=-1`,
                    { headers, cache: "no-store" }
                ),
                fetch(
                    `${DIRECTUS_URL}/items/product_manufacturing_version?filter=${versionFilter}&fields=product_id&limit=-1`,
                    { headers, cache: "no-store" }
                )
            ]);

            const products = productsRes.ok ? (await productsRes.json()).data || [] : [];
            const productMap = new Map<number, { product_name?: string; product_code?: string; product_type?: number | null; uom?: string }>(
                products.map((product: { product_id?: number; product_name?: string; product_code?: string; product_type?: number | null; unit_of_measurement?: { unit_shortcut?: string; unit_name?: string } | null }) => [
                    Number(product.product_id),
                    {
                        product_name: product.product_name || "",
                        product_code: product.product_code || "",
                        product_type: product.product_type == null ? null : Number(product.product_type),
                        uom: product.unit_of_measurement?.unit_shortcut || product.unit_of_measurement?.unit_name || ""
                    }
                ])
            );
            const versionedProductIds = new Set<number>(
                productVersionsRes.ok
                    ? ((await productVersionsRes.json()).data || [])
                        .map((productVersion: { product_id?: number }) => Number(productVersion.product_id))
                        .filter((productId: number) => Number.isFinite(productId) && productId > 0)
                    : []
            );

            // Secondary fallback for component items that may reside in other inventory/item tables
            const missingIds = bomProductIds.filter(id => !productMap.has(id));
            if (missingIds.length > 0) {
                try {
                    const itemsFilter = encodeURIComponent(JSON.stringify({ id: { _in: missingIds } }));
                    const itemsRes = await fetch(
                        `${DIRECTUS_URL}/items/items?filter=${itemsFilter}&limit=-1`,
                        { headers, cache: "no-store" }
                    ).catch(() => null);
                    if (itemsRes && itemsRes.ok) {
                        const itemsData = (await itemsRes.json()).data || [];
                        itemsData.forEach((item: Record<string, unknown>) => {
                            const itemId = Number(item.id || item.item_id);
                            if (itemId && !productMap.has(itemId)) {
                                productMap.set(itemId, {
                                    product_name: String(item.item_name || item.name || item.description || `Material #${itemId}`),
                                    product_code: String(item.item_code || item.sku || `SKU-${itemId}`),
                                    product_type: 390,
                                    uom: String(item.uom || item.unit || "PCS")
                                });
                            }
                        });
                    }
                } catch { }
            }

            bomItems.forEach(item => {
                const productId = Number(item.product_id);
                const prodInfo = productMap.get(productId);
                if (prodInfo) {
                    if (prodInfo.product_name) item.product_name = prodInfo.product_name;
                    if (prodInfo.product_code) item.product_code = prodInfo.product_code;
                    if (prodInfo.uom && !item.unit_of_measurement) item.unit_of_measurement = prodInfo.uom;
                    item.product_type = prodInfo.product_type;
                } else {
                    item.product_type = null;
                }
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
            uom_id: uomId || 1,
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

