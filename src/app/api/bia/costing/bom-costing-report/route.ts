import { NextRequest, NextResponse } from "next/server";
import {
    BOMCostNode,
    BOMCostingReportData,
    BOMCostingSummary,
    InventoryRule,
    MaterialClassification,
    ProductOption,
    TargetProductSummary,
    VersionOption
} from "@/modules/business-intelligence-and-analytics/costing/bom-costing-report/types";

const DIRECTUS_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";
const DIRECTUS_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || "";

const getHeaders = (): Record<string, string> => {
    const h: Record<string, string> = {
        "Content-Type": "application/json"
    };
    if (DIRECTUS_TOKEN) {
        h["Authorization"] = `Bearer ${DIRECTUS_TOKEN}`;
    }
    return h;
};

// Map product_type code to classification
function determineMaterialClassification(
    productType: number | null | undefined,
    hasSubVersions: boolean
): MaterialClassification {
    const num = Number(productType);
    if (num === 389) return "raw_material";
    if (num === 390) return "packaging";
    if (num === 388) return hasSubVersions ? "sub_assembly" : "finished_good";
    return hasSubVersions ? "sub_assembly" : "raw_material";
}

function determineInventoryRule(classification: MaterialClassification): InventoryRule {
    if (classification === "packaging") return "FIFO";
    if (classification === "raw_material" || classification === "sub_assembly" || classification === "finished_good") {
        return "FEFO";
    }
    return "N/A";
}

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const action = searchParams.get("action") || "products";
        const headers = getHeaders();

        if (!DIRECTUS_URL) {
            return NextResponse.json(
                { ok: false, error: "Directus API base URL is not configured." },
                { status: 500 }
            );
        }

        // 1. ACTION: Get products eligible for BOM costing
        if (action === "products") {
            const [productsRes, versionsRes] = await Promise.all([
                fetch(
                    `${DIRECTUS_URL}/items/products?fields=product_id,product_name,product_code,description,product_type,parent_id,parent_id.product_id,unit_of_measurement.unit_id,unit_of_measurement.unit_shortcut,unit_of_measurement.unit_name,isActive&limit=-1&sort=product_name`,
                    { headers, cache: "no-store" }
                ),
                fetch(
                    `${DIRECTUS_URL}/items/product_manufacturing_version?fields=product_id,version_id,status,is_primary&limit=-1`,
                    { headers, cache: "no-store" }
                )
            ]);

            if (!productsRes.ok) {
                return NextResponse.json(
                    { ok: false, error: `Failed to fetch products from Directus (${productsRes.status})` },
                    { status: productsRes.status }
                );
            }

            const productsData = await productsRes.json();
            const versionsData = versionsRes.ok ? await versionsRes.json() : { data: [] };

            const allItems = (productsData.data || []) as Record<string, unknown>[];
            const parentToChildren = new Map<number, number[]>();
            const childToParent = new Map<number, number>();
            const productById = new Map<number, Record<string, unknown>>();

            allItems.forEach((p) => {
                const pid = Number(p.product_id);
                productById.set(pid, p);
                const parentVal = p.parent_id;
                const parentIdNum = parentVal && typeof parentVal === "object"
                    ? Number((parentVal as Record<string, unknown>).product_id)
                    : (parentVal ? Number(parentVal) : null);

                if (parentIdNum) {
                    childToParent.set(pid, parentIdNum);
                    if (!parentToChildren.has(parentIdNum)) parentToChildren.set(parentIdNum, []);
                    parentToChildren.get(parentIdNum)!.push(pid);
                }
            });

            // Collect product IDs that directly have versions
            const directVersionProductIds = new Set<number>();
            (versionsData.data || []).forEach((v: Record<string, unknown>) => {
                if (v.product_id) {
                    directVersionProductIds.add(Number(v.product_id));
                }
            });

            // Check recipe readiness bidirectionally (parent or child)
            const hasRecipeReady = (pid: number): boolean => {
                if (directVersionProductIds.has(pid)) return true;
                const parentId = childToParent.get(pid);
                if (parentId && directVersionProductIds.has(parentId)) return true;
                const children = parentToChildren.get(pid);
                if (children && children.some(cid => directVersionProductIds.has(cid))) return true;
                return false;
            };

            // Filter products to ONLY include Finished Goods (exclude raw materials 389 and packaging 390)
            const isFinishedGood = (p: Record<string, unknown>): boolean => {
                if (p.isActive === 0 || p.isActive === false) return false;

                const typeVal = p.product_type;
                const typeId = typeof typeVal === "object" && typeVal !== null
                    ? Number((typeVal as Record<string, unknown>).id)
                    : Number(typeVal);

                // Strictly exclude raw materials (389) and packaging materials (390)
                if (typeId === 389 || typeId === 390) return false;

                const pid = Number(p.product_id);
                if (typeId === 388 || hasRecipeReady(pid)) return true;

                // Parent is included if any child variant is a finished good or has a recipe
                const children = parentToChildren.get(pid);
                if (children && children.some(cid => {
                    const cp = productById.get(cid);
                    if (!cp) return false;
                    const ctype = typeof cp.product_type === "object" && cp.product_type !== null
                        ? Number((cp.product_type as Record<string, unknown>).id)
                        : Number(cp.product_type);
                    return ctype === 388 || hasRecipeReady(cid);
                })) {
                    return true;
                }

                // Child is included if parent is a finished good or has a recipe
                const parentId = childToParent.get(pid);
                if (parentId) {
                    const pp = productById.get(parentId);
                    if (pp) {
                        const ptype = typeof pp.product_type === "object" && pp.product_type !== null
                            ? Number((pp.product_type as Record<string, unknown>).id)
                            : Number(pp.product_type);
                        if (ptype === 388 || hasRecipeReady(parentId)) return true;
                    }
                }

                return false;
            };

            const rawProducts = allItems.filter(isFinishedGood);

            const products: ProductOption[] = rawProducts.map((p: Record<string, unknown>): ProductOption => {
                const pid = Number(p.product_id);
                const parentVal = p.parent_id;
                const parentIdNum = parentVal && typeof parentVal === "object"
                    ? Number((parentVal as Record<string, unknown>).product_id)
                    : (parentVal ? Number(parentVal) : null);
                const isParent = !parentIdNum;
                const recipeReady = hasRecipeReady(pid);
                const prodType = p.product_type != null
                    ? (typeof p.product_type === "object" ? Number((p.product_type as Record<string, unknown>).id) : Number(p.product_type))
                    : null;
                const desc = p.description ? String(p.description).trim() : null;

                const uomObj = p.unit_of_measurement as { unit_shortcut?: string; unit_name?: string } | null;
                const uomName = uomObj?.unit_shortcut || uomObj?.unit_name || "PCS";

                return {
                    product_id: pid,
                    product_name: String(p.product_name || `Product #${pid}`),
                    description: desc,
                    product_code: p.product_code ? String(p.product_code) : null,
                    product_type: prodType,
                    parent_id: parentIdNum,
                    is_parent: isParent,
                    has_versions: recipeReady,
                    material_type: determineMaterialClassification(prodType, recipeReady),
                    uom_name: uomName
                };
            });

            return NextResponse.json({ ok: true, products });
        }

        // 2. ACTION: Get versions for a specific product
        if (action === "versions") {
            const productIdStr = searchParams.get("productId");
            if (!productIdStr) {
                return NextResponse.json(
                    { ok: false, error: "Missing required parameter: productId" },
                    { status: 400 }
                );
            }

            const productId = Number(productIdStr);
            const [prodRes, unitsRes] = await Promise.all([
                fetch(`${DIRECTUS_URL}/items/products/${productId}?fields=product_id,parent_id`, { headers, cache: "no-store" }),
                fetch(`${DIRECTUS_URL}/items/units?limit=-1`, { headers, cache: "no-store" })
            ]);

            let parentIdNum: number | null = null;
            if (prodRes.ok) {
                const pData = (await prodRes.json()).data;
                const parentVal = pData?.parent_id;
                parentIdNum = parentVal && typeof parentVal === "object"
                    ? Number((parentVal as Record<string, unknown>).product_id)
                    : (parentVal ? Number(parentVal) : null);
            }

            // Query versions for productId or its parent or its children
            const versionFilter = parentIdNum
                ? encodeURIComponent(JSON.stringify({ product_id: { _in: [productId, parentIdNum] } }))
                : encodeURIComponent(JSON.stringify({ product_id: { _eq: productId } }));

            let versionsRes = await fetch(
                `${DIRECTUS_URL}/items/product_manufacturing_version?filter=${versionFilter}&fields=*&limit=-1`,
                { headers, cache: "no-store" }
            );

            let versionsData = versionsRes.ok ? await versionsRes.json() : { data: [] };

            // If empty, check if children of this product have versions
            if ((!versionsData.data || versionsData.data.length === 0)) {
                const childFilter = encodeURIComponent(JSON.stringify({ parent_id: { _eq: productId } }));
                const childProdRes = await fetch(`${DIRECTUS_URL}/items/products?filter=${childFilter}&fields=product_id&limit=-1`, { headers, cache: "no-store" });
                if (childProdRes.ok) {
                    const childIds = ((await childProdRes.json()).data || []).map((c: Record<string, unknown>) => Number(c.product_id)).filter(Boolean);
                    if (childIds.length > 0) {
                        const childVerFilter = encodeURIComponent(JSON.stringify({ product_id: { _in: childIds } }));
                        versionsRes = await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version?filter=${childVerFilter}&fields=*&limit=-1`, { headers, cache: "no-store" });
                        if (versionsRes.ok) {
                            versionsData = await versionsRes.json();
                        }
                    }
                }
            }

            const unitsData = unitsRes.ok ? await unitsRes.json() : { data: [] };
            const unitsMap = new Map<number, string>();
            (unitsData.data || []).forEach((u: Record<string, unknown>) => {
                unitsMap.set(Number(u.unit_id), String(u.unit_shortcut || u.unit_name || "unit"));
            });

            const isPrimary = (v: Record<string, unknown>) =>
                v.is_primary === 1 || v.is_primary === true || v.is_primary === "1" || v.is_primary === "true";
            const isActive = (v: Record<string, unknown>) =>
                String(v.status || "").toLowerCase() === "active";

            const rawVersions = (versionsData.data || []) as Record<string, unknown>[];
            // Sort: Primary first, then Active, then newest version_id
            rawVersions.sort((a, b) => {
                const aPrim = isPrimary(a) ? 1 : 0;
                const bPrim = isPrimary(b) ? 1 : 0;
                if (aPrim !== bPrim) return bPrim - aPrim;
                const aAct = isActive(a) ? 1 : 0;
                const bAct = isActive(b) ? 1 : 0;
                if (aAct !== bAct) return bAct - aAct;
                return Number(b.version_id || 0) - Number(a.version_id || 0);
            });

            const versions: VersionOption[] = rawVersions.map((v: Record<string, unknown>): VersionOption => {
                const uomId = Number(v.uom_id || 0);
                return {
                    version_id: Number(v.version_id),
                    product_id: Number(v.product_id),
                    version_name: String(v.version_name || "Standard"),
                    base_quantity: Number(v.base_quantity || 1),
                    uom_id: uomId,
                    uom_name: unitsMap.get(uomId) || "unit",
                    status: String(v.status || "Draft"),
                    is_primary: isPrimary(v),
                    expected_yield_percentage: Number(v.expected_yield_percentage || 100),
                    custom_overhead: Number(v.custom_overhead || 0)
                };
            });

            return NextResponse.json({ ok: true, versions });
        }

        // 3. ACTION: Generate Multi-Level BOM Costing Report
        if (action === "report") {
            const productIdStr = searchParams.get("productId");
            const versionIdStr = searchParams.get("versionId");
            const targetQtyStr = searchParams.get("targetQuantity");

            if (!productIdStr) {
                return NextResponse.json(
                    { ok: false, error: "Missing required parameter: productId" },
                    { status: 400 }
                );
            }

            const productId = Number(productIdStr);

            // Fetch Product info
            const productRes = await fetch(
                `${DIRECTUS_URL}/items/products/${productId}?fields=product_id,product_name,description,product_code,product_type,cost_per_unit,unit_of_measurement,parent_id`,
                { headers, cache: "no-store" }
            );
            if (!productRes.ok) {
                return NextResponse.json(
                    { ok: false, error: `Product #${productId} not found.` },
                    { status: productRes.status }
                );
            }
            const productJson = await productRes.json();
            const productData = productJson.data;

            // Fetch Units and Operations catalogs for name enrichment
            const [unitsRes, opsRes, allVersionsRes] = await Promise.all([
                fetch(`${DIRECTUS_URL}/items/units?limit=-1`, { headers, cache: "no-store" }),
                fetch(`${DIRECTUS_URL}/items/manufacturing_operations?limit=-1`, { headers, cache: "no-store" }),
                fetch(`${DIRECTUS_URL}/items/product_manufacturing_version?fields=version_id,product_id,version_name,base_quantity,uom_id,status,is_primary&limit=-1`, { headers, cache: "no-store" })
            ]);

            const unitsMap = new Map<number, string>();
            if (unitsRes.ok) {
                const uJson = await unitsRes.json();
                (uJson.data || []).forEach((u: Record<string, unknown>) => {
                    unitsMap.set(Number(u.unit_id), String(u.unit_shortcut || u.unit_name || "unit"));
                });
            }

            const opsMap = new Map<number, string>();
            if (opsRes.ok) {
                const oJson = await opsRes.json();
                (oJson.data || []).forEach((o: Record<string, unknown>) => {
                    opsMap.set(Number(o.id), String(o.operation_name || ""));
                });
            }

            // Map all active/primary versions by product_id
            const allVersions: Record<string, unknown>[] = allVersionsRes.ok ? (await allVersionsRes.json()).data || [] : [];
            const primaryVersionByProduct = new Map<number, Record<string, unknown>>();

            const isVersionPrimary = (v: Record<string, unknown>) =>
                v.is_primary === 1 || v.is_primary === true || v.is_primary === "1" || v.is_primary === "true";
            const isVersionActive = (v: Record<string, unknown>) =>
                String(v.status || "").toLowerCase() === "active";

            // Sort all versions so true primary comes first, then active, then latest ID
            const sortedAllVersions = [...allVersions].sort((a, b) => {
                const aPrim = isVersionPrimary(a) ? 1 : 0;
                const bPrim = isVersionPrimary(b) ? 1 : 0;
                if (aPrim !== bPrim) return bPrim - aPrim;
                const aAct = isVersionActive(a) ? 1 : 0;
                const bAct = isVersionActive(b) ? 1 : 0;
                if (aAct !== bAct) return bAct - aAct;
                return Number(b.version_id || 0) - Number(a.version_id || 0);
            });

            sortedAllVersions.forEach(v => {
                const pid = Number(v.product_id);
                if (!primaryVersionByProduct.has(pid)) {
                    primaryVersionByProduct.set(pid, v);
                }
            });

            // Determine Target Version
            let targetVersion: Record<string, unknown> | null = null;
            if (versionIdStr) {
                const vId = Number(versionIdStr);
                targetVersion = allVersions.find(v => Number(v.version_id) === vId) || null;
            }
            if (!targetVersion) {
                targetVersion = primaryVersionByProduct.get(productId) || null;
            }
            if (!targetVersion && productData?.parent_id) {
                const parentVal = productData.parent_id;
                const parentIdVal = typeof parentVal === "object" ? Number(parentVal.product_id) : Number(parentVal);
                if (parentIdVal) {
                    targetVersion = primaryVersionByProduct.get(parentIdVal) || null;
                }
            }

            if (!targetVersion) {
                return NextResponse.json(
                    { ok: false, error: `No active or approved manufacturing version found for ${productData.product_name || `Product #${productId}`}.` },
                    { status: 404 }
                );
            }

            const versionId = Number(targetVersion.version_id);
            const baseQuantity = Number(targetVersion.base_quantity) || 1;
            const targetQuantity = targetQtyStr && Number(targetQtyStr) > 0 ? Number(targetQtyStr) : baseQuantity;
            const batchScalingFactor = targetQuantity / baseQuantity;
            const uomId = Number(targetVersion.uom_id || productData.unit_of_measurement || 0);
            const uomName = unitsMap.get(uomId) || "pcs";

            // Recursive function to explode multi-level BOM
            async function explodeVersion(
                currentProdId: number,
                currentVerId: number,
                currentScaling: number,
                level: number,
                parentId: string | null,
                visited: Set<number>
            ): Promise<BOMCostNode[]> {
                if (level > 5 || visited.has(currentProdId)) {
                    return [];
                }
                const localVisited = new Set(visited);
                localVisited.add(currentProdId);

                // Fetch routes for version
                const routesRes = await fetch(
                    `${DIRECTUS_URL}/items/manufacturing_routes?filter[version_id][_eq]=${currentVerId}&sort=sequence_order&limit=-1`,
                    { headers, cache: "no-store" }
                );
                if (!routesRes.ok) return [];

                const routesJson = await routesRes.json();
                const routes: Record<string, unknown>[] = routesJson.data || [];
                const routeIds = routes.map(r => Number(r.route_id)).filter(id => id > 0);

                if (routeIds.length === 0) return [];

                // Fetch BOM items for these routes
                const bomFilter = encodeURIComponent(JSON.stringify({ route_id: { _in: routeIds } }));
                const bomRes = await fetch(
                    `${DIRECTUS_URL}/items/manufacturing_routes_bom?filter=${bomFilter}&limit=-1`,
                    { headers, cache: "no-store" }
                );
                if (!bomRes.ok) return [];

                const bomJson = await bomRes.json();
                const bomItems: Record<string, unknown>[] = bomJson.data || [];
                if (bomItems.length === 0) return [];

                // Fetch details for all component products in this batch
                const compProdIds = Array.from(new Set(bomItems.map(b => Number(b.product_id)).filter(id => id > 0)));
                const compProdsMap = new Map<number, Record<string, unknown>>();
                if (compProdIds.length > 0) {
                    const compFilter = encodeURIComponent(JSON.stringify({ product_id: { _in: compProdIds } }));
                    const compRes = await fetch(
                        `${DIRECTUS_URL}/items/products?filter=${compFilter}&fields=product_id,product_name,description,product_code,product_type,cost_per_unit&limit=-1`,
                        { headers, cache: "no-store" }
                    );
                    if (compRes.ok) {
                        const cpJson = await compRes.json();
                        (cpJson.data || []).forEach((cp: Record<string, unknown>) => {
                            compProdIds.forEach(id => {
                                if (Number(cp.product_id) === id) compProdsMap.set(id, cp);
                            });
                        });
                    }
                }

                // Map routes by id
                const routeMap = new Map<number, Record<string, unknown>>();
                routes.forEach(r => routeMap.set(Number(r.route_id), r));

                const round4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;
                const rawNodes: BOMCostNode[] = [];

                for (let i = 0; i < bomItems.length; i++) {
                    const item = bomItems[i];
                    const compId = Number(item.product_id);
                    const compProd = compProdsMap.get(compId);
                    const route = routeMap.get(Number(item.route_id));

                    const opId = route ? Number(route.operation_id) : 0;
                    const opName = opsMap.get(opId) || (route ? `Step #${route.sequence_order}` : "Unknown");
                    const routeSeq = route ? Number(route.sequence_order) : i + 1;

                    // Check if component has its own version (is sub-assembly)
                    const subAssemblyVersion = primaryVersionByProduct.get(compId);
                    const isSubAssembly = Boolean(subAssemblyVersion);
                    const compType = compProd ? Number(compProd.product_type) : null;
                    const classification = determineMaterialClassification(compType, isSubAssembly);
                    const invRule = determineInventoryRule(classification);

                    const baseReqQty = Number(item.quantity_required) || 0;
                    const scaledReqQty = round4(baseReqQty * currentScaling);
                    const wastagePercent = Number(item.wastage_factor_percentage) || 0;
                    const usableFactor = 1 - (wastagePercent / 100);
                    const effectiveQty = usableFactor > 0 ? round4(scaledReqQty / usableFactor) : scaledReqQty;
                    const wastageQty = round4(effectiveQty - scaledReqQty);

                    const itemUomId = Number(item.unit_of_measurement || 0);
                    const itemUomName = unitsMap.get(itemUomId) || "pcs";

                    const unitCost = Number(item.cost_per_unit) || Number(compProd?.cost_per_unit) || 0;
                    const netLineCost = round4(scaledReqQty * unitCost);
                    const wastageCost = round4(wastageQty * unitCost);
                    let lineCost = round4(effectiveQty * unitCost);

                    const nodeId = `node-lvl${level}-${item.id || i}-${compId}`;

                    let children: BOMCostNode[] = [];
                    if (isSubAssembly && subAssemblyVersion && level < 5) {
                        const subVerId = Number(subAssemblyVersion.version_id);
                        // Sub-assembly production quantity needed to fulfill effectiveQty
                        const subProductionQty = effectiveQty;
                        children = await explodeVersion(compId, subVerId, subProductionQty, level + 1, nodeId, localVisited);

                        // If children have cost, roll up total child cost to sub-assembly if direct lineCost was 0
                        const childrenCostSum = round4(children.reduce((acc, c) => acc + c.totalLineCost, 0));
                        if (childrenCostSum > 0 && lineCost === 0) {
                            lineCost = childrenCostSum;
                        }
                    }

                    rawNodes.push({
                        id: nodeId,
                        level,
                        parentId,
                        productId: compId,
                        productName: String(compProd?.description || compProd?.product_name || `Component #${compId}`),
                        description: compProd?.description ? String(compProd.description) : null,
                        productCode: String(compProd?.product_code || ""),
                        productType: compType,
                        materialClassification: classification,
                        inventoryRule: invRule,
                        routeSequence: routeSeq,
                        operationName: opName,
                        baseRequiredQty: baseReqQty,
                        scaledRequiredQty: scaledReqQty,
                        wastagePercent,
                        effectiveQty,
                        wastageQty,
                        uomName: itemUomName,
                        unitCost,
                        netLineCost,
                        totalLineCost: lineCost,
                        wastageCost,
                        isSubAssembly,
                        subAssemblyVersionName: subAssemblyVersion ? String(subAssemblyVersion.version_name) : null,
                        children
                    });
                }

                // If sub-assemblies already exist with children, keep them
                const hasExistingSubAssemblies = rawNodes.some(n => n.children && n.children.length > 0);
                if (hasExistingSubAssemblies || level > 1) {
                    return rawNodes;
                }

                // If all items are currently flat L1, organize by manufacturing intermediate dough/mixing stages
                // Items from preparatory operations (1st Mix, Blanching, Premixes) roll up under the primary base ingredient (2nd Mix / Wheat Flour)
                const mixingNodes = rawNodes.filter(n => n.materialClassification === "raw_material");
                const packagingNodes = rawNodes.filter(n => n.materialClassification === "packaging");
                const otherNodes = rawNodes.filter(n => n.materialClassification !== "raw_material" && n.materialClassification !== "packaging");

                if (mixingNodes.length > 1) {
                    // Find the primary base raw material (largest total cost / scaled qty, or operation with 2nd Mix / Flour)
                    let primaryIndex = mixingNodes.findIndex(n =>
                        n.productName.toLowerCase().includes("flour") ||
                        (n.operationName && n.operationName.toLowerCase().includes("2nd mix"))
                    );
                    if (primaryIndex === -1) {
                        primaryIndex = mixingNodes.reduce((maxIdx, n, currIdx, arr) =>
                            n.totalLineCost > arr[maxIdx].totalLineCost ? currIdx : maxIdx, 0
                        );
                    }

                    const parentNode = { ...mixingNodes[primaryIndex] };
                    const childNodes = mixingNodes.filter((_, idx) => idx !== primaryIndex).map(c => ({
                        ...c,
                        level: 2,
                        parentId: parentNode.id
                    }));

                    parentNode.children = childNodes;

                    return [parentNode, ...packagingNodes, ...otherNodes];
                }

                return rawNodes;
            }

            // Explode materials from Level 1 scaled to target batch quantity
            const tree = await explodeVersion(productId, versionId, targetQuantity, 1, null, new Set());

            // Fetch routes, positions, overheads, and work centers for labor and overhead costing
            const [targetRoutesRes, positionsRes, overheadsRes, overheadTypesRes, workCentersRes] = await Promise.all([
                fetch(`${DIRECTUS_URL}/items/manufacturing_routes?filter[version_id][_eq]=${versionId}&sort=sequence_order&limit=-1`, { headers, cache: "no-store" }),
                fetch(`${DIRECTUS_URL}/items/product_version_positions?filter[version_id][_eq]=${versionId}&limit=-1`, { headers, cache: "no-store" }).catch(() => null),
                fetch(`${DIRECTUS_URL}/items/product_version_overheads?filter[version_id][_eq]=${versionId}&limit=-1`, { headers, cache: "no-store" }).catch(() => null),
                fetch(`${DIRECTUS_URL}/items/overhead_types?limit=-1`, { headers, cache: "no-store" }).catch(() => null),
                fetch(`${DIRECTUS_URL}/items/manufacturing_work_centers?limit=-1`, { headers, cache: "no-store" }).catch(() => null)
            ]);

            const targetRoutes: Record<string, unknown>[] = targetRoutesRes.ok ? (await targetRoutesRes.json()).data || [] : [];
            const versionPositions: Record<string, unknown>[] = positionsRes && positionsRes.ok ? (await positionsRes.json()).data || [] : [];
            const versionOverheads: Record<string, unknown>[] = overheadsRes && overheadsRes.ok ? (await overheadsRes.json()).data || [] : [];
            const overheadTypesList: Record<string, unknown>[] = overheadTypesRes && overheadTypesRes.ok ? (await overheadTypesRes.json()).data || [] : [];
            const workCentersList: Record<string, unknown>[] = workCentersRes && workCentersRes.ok ? (await workCentersRes.json()).data || [] : [];

            const round4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;
            const overheadTypesMap = new Map<number, string>();
            overheadTypesList.forEach(t => overheadTypesMap.set(Number(t.id), String(t.overhead_name || "")));

            const workCentersMap = new Map<number, Record<string, unknown>>();
            workCentersList.forEach(w => workCentersMap.set(Number(w.work_center_id || w.id), w));

            // 1. Process Direct Labor Calculation
            const laborNodes: BOMCostNode[] = [];
            let totalLaborCost = 0;

            if (versionPositions.length > 0) {
                // Calculate from explicit position records assigned to this version
                versionPositions.forEach((pos, idx) => {
                    const posName = String(pos.position_name || `Direct Operator #${idx + 1}`);
                    const headcount = Math.max(0, Number(pos.manpower_count) || 1);
                    const hourlyRate = Math.max(0, Number(pos.hourly_rate) || 0);
                    const dailyRate = Math.max(0, Number(pos.daily_rate) || (hourlyRate * 8) || 0);
                    const otHours = Math.max(0, Number(pos.ot_hours) || 0);
                    const hoursRequired = Math.max(0, Number(pos.hours_required) || 8);

                    // Dynamic label: 'Maintenance' or 'Direct Line'
                    const isMaintenance = String(pos.category || "").toLowerCase() === "maintenance";
                    const dynamicLabel = isMaintenance ? "Maintenance" : "Direct Line";

                    // Total allocated man-hours: Headcount × Shift Hours per worker
                    const baseHours = round4(headcount * (hoursRequired > 0 ? hoursRequired : 8));
                    const scaledHours = round4(baseHours * batchScalingFactor);

                    const wageCost = dailyRate > 0
                        ? dailyRate * (headcount + otHours)
                        : (hourlyRate > 0 ? hourlyRate * (baseHours + otHours) : 520);

                    let benefitsCost = 0;
                    if (pos.include_mandates !== false && !isMaintenance) {
                        const configuredSss = Number(pos.sss_amount);
                        const configuredPhic = Number(pos.phic_amount);
                        const configuredHdmf = Number(pos.hdmf_amount);
                        const sss = Number.isFinite(configuredSss) && configuredSss > 0 ? configuredSss : (dailyRate * 0.0954);
                        const phic = Number.isFinite(configuredPhic) && configuredPhic > 0 ? configuredPhic : (200 / 26);
                        const hdmf = Number.isFinite(configuredHdmf) && configuredHdmf > 0 ? configuredHdmf : (100 / 26);
                        benefitsCost = (sss + phic + hdmf) * headcount;
                    }

                    const batchPositionCost = round4(wageCost + benefitsCost);
                    const lineCost = round4(batchPositionCost * batchScalingFactor);
                    const effectiveHourlyRate = baseHours > 0 ? round4(batchPositionCost / baseHours) : (scaledHours > 0 ? round4(lineCost / scaledHours) : 0);

                    totalLaborCost = round4(totalLaborCost + lineCost);

                    laborNodes.push({
                        id: `labor-pos-${pos.id || idx}`,
                        level: 1,
                        parentId: null,
                        productId: 0,
                        productName: `${isMaintenance ? "Maintenance" : "Direct Line"} Labor - ${posName}`,
                        description: `Category: ${dynamicLabel} • Headcount: ${headcount} • Daily Rate: ₱${dailyRate.toFixed(2)} • Mandates: +₱${benefitsCost.toFixed(2)}`,
                        productCode: `Headcount: ${Number.isInteger(headcount) ? headcount : headcount.toFixed(2)}`,
                        productType: null,
                        materialClassification: "labor",
                        inventoryRule: "-",
                        routeSequence: idx + 1,
                        operationName: dynamicLabel,
                        baseRequiredQty: baseHours,
                        scaledRequiredQty: scaledHours,
                        wastagePercent: 0,
                        effectiveQty: scaledHours,
                        wastageQty: 0,
                        uomName: "HRS",
                        unitCost: effectiveHourlyRate,
                        netLineCost: lineCost,
                        totalLineCost: lineCost,
                        wastageCost: 0,
                        isSubAssembly: false,
                        children: []
                    });
                });
            } else if (targetRoutes.length > 0) {
                // Calculate from version routing steps and process cycle times
                targetRoutes.forEach((r, idx) => {
                    const opId = Number(r.operation_id || 0);
                    const opName = opsMap.get(opId) || `Step #${r.sequence_order || idx + 1}`;
                    const setupHours = Number(r.setup_time_hours || 0);
                    const runHours = Number(r.run_time_hours || 0);
                    const manpower = Number(r.default_manpower || 1);
                    const expectedLabor = Number(r.expected_labor_cost || 0);

                    // Compute cycle hours per batch
                    const baseHours = round4((setupHours + runHours) * manpower) || 0.1;
                    const scaledHours = round4((setupHours + (runHours * targetQuantity)) * manpower) || round4(baseHours * batchScalingFactor);
                    const stdHourlyRate = 65.0; // Standard manufacturing operator rate (₱520 daily / 8h)

                    let lineCost = 0;
                    let unitLaborRate = stdHourlyRate;

                    if (expectedLabor > 0) {
                        lineCost = round4(expectedLabor * batchScalingFactor);
                        unitLaborRate = scaledHours > 0 ? round4(lineCost / scaledHours) : expectedLabor;
                    } else {
                        lineCost = round4(scaledHours * stdHourlyRate);
                        unitLaborRate = stdHourlyRate;
                    }

                    totalLaborCost = round4(totalLaborCost + lineCost);

                    laborNodes.push({
                        id: `labor-route-${r.route_id || idx}`,
                        level: 1,
                        parentId: null,
                        productId: 0,
                        productName: `Process Direct Labor - ${opName}`,
                        description: `Manpower: ${manpower} • Setup: ${setupHours}h • Run: ${runHours}h/unit`,
                        productCode: `Headcount: ${manpower}`,
                        productType: null,
                        materialClassification: "labor",
                        inventoryRule: "-",
                        routeSequence: Number(r.sequence_order || idx + 1),
                        operationName: opName,
                        baseRequiredQty: baseHours,
                        scaledRequiredQty: scaledHours,
                        wastagePercent: 0,
                        effectiveQty: scaledHours,
                        wastageQty: 0,
                        uomName: "HRS",
                        unitCost: unitLaborRate,
                        netLineCost: lineCost,
                        totalLineCost: lineCost,
                        wastageCost: 0,
                        isSubAssembly: false,
                        children: []
                    });
                });
            } else {
                // Standard direct labor allowance if no routes or positions exist
                const stdLaborRate = 65.0;
                const stdHours = 8;
                const lineCost = round4(stdLaborRate * stdHours * batchScalingFactor);
                totalLaborCost = lineCost;

                laborNodes.push({
                    id: `labor-std-0`,
                    level: 1,
                    parentId: null,
                    productId: 0,
                    productName: "Process Direct Labor - Line Operations",
                    description: "Direct line labor standard allowance",
                    productCode: "Headcount: 1",
                    productType: null,
                    materialClassification: "labor",
                    inventoryRule: "-",
                    routeSequence: 1,
                    operationName: "Direct Line",
                    baseRequiredQty: stdHours,
                    scaledRequiredQty: stdHours * batchScalingFactor,
                    wastagePercent: 0,
                    effectiveQty: stdHours * batchScalingFactor,
                    wastageQty: 0,
                    uomName: "HRS",
                    unitCost: stdLaborRate,
                    netLineCost: lineCost,
                    totalLineCost: lineCost,
                    wastageCost: 0,
                    isSubAssembly: false,
                    children: []
                });
            }

            // 2. Manufacturing Overhead Calculation
            const overheadNodes: BOMCostNode[] = [];
            let totalOverheadCost = 0;

            // A. Routing Work Center Machine Runtime Overhead (from manufacturing_routes & manufacturing_work_centers)
            if (targetRoutes.length > 0) {
                targetRoutes.forEach((route, idx) => {
                    const wcId = Number(route.work_center_id || 0);
                    const wc = workCentersMap.get(wcId);
                    const wcName = wc ? String(wc.work_center_name || `Work Center #${wcId}`) : `Work Center #${wcId}`;
                    const wcRate = wc ? Number(wc.overhead_cost_per_hour || 0) : 0;
                    const opId = Number(route.operation_id || 0);
                    const opName = opsMap.get(opId) || `Step #${route.sequence_order || idx + 1}`;

                    const setupHours = Number(route.setup_time_hours || 0);
                    const runHours = Number(route.run_time_hours || 0);
                    const totalHours = round4(setupHours + runHours);
                    const stepCost = round4(totalHours * wcRate * batchScalingFactor);

                    if (wcRate > 0 || totalHours > 0) {
                        totalOverheadCost = round4(totalOverheadCost + stepCost);

                        overheadNodes.push({
                            id: `overhead-wc-step-${route.route_id || idx}`,
                            level: 1,
                            parentId: null,
                            productId: 0,
                            productName: `Mfg Machine Overhead - ${wcName}`,
                            description: `Step #${route.sequence_order || idx + 1}: ${opName} • Setup: ${setupHours.toFixed(2)}h, Run: ${runHours.toFixed(2)}h • Rate: ₱${wcRate.toFixed(2)}/hr`,
                            productCode: "Basis: Machine Runtime",
                            productType: null,
                            materialClassification: "overhead",
                            inventoryRule: "-",
                            routeSequence: Number(route.sequence_order || idx + 1),
                            operationName: opName,
                            baseRequiredQty: totalHours,
                            scaledRequiredQty: round4(totalHours * batchScalingFactor),
                            wastagePercent: 0,
                            effectiveQty: round4(totalHours * batchScalingFactor),
                            wastageQty: 0,
                            uomName: "HRS",
                            unitCost: wcRate,
                            netLineCost: stepCost,
                            totalLineCost: stepCost,
                            wastageCost: 0,
                            isSubAssembly: false,
                            children: []
                        });
                    }
                });
            }

            // B. Version Fixed & Allocation Overheads (from product_version_overheads)
            if (versionOverheads.length > 0) {
                versionOverheads.forEach((ov, idx) => {
                    const ovTypeId = Number(ov.overhead_type_id || 0);
                    const ovName = overheadTypesMap.get(ovTypeId) || String(ov.remarks || `Plant Overhead #${idx + 1}`);
                    const unitOverheadCost = Number(ov.cost ?? ov.cost_per_unit ?? 0);
                    const rawBasis = String(ov.allocation_basis || "").toLowerCase();
                    const isBatch = rawBasis === "per_batch" || rawBasis === "batch" || rawBasis.includes("batch");
                    const isMachineHour = rawBasis.includes("machine");
                    const isLaborPct = rawBasis.includes("labor");

                    let basisCode = "Basis: Per Unit";
                    if (isBatch) {
                        basisCode = "Basis: Per Batch";
                    } else if (isMachineHour) {
                        basisCode = "Basis: Per Machine Hour";
                    } else if (isLaborPct) {
                        basisCode = "Basis: % of Labor";
                    }

                    const lineCost = isBatch ? round4(unitOverheadCost) : round4(unitOverheadCost * targetQuantity);

                    totalOverheadCost = round4(totalOverheadCost + lineCost);

                    overheadNodes.push({
                        id: `overhead-item-${ov.id || idx}`,
                        level: 1,
                        parentId: null,
                        productId: 0,
                        productName: `Mfg Overhead - ${ovName}`,
                        description: `${basisCode} • ${ov.remarks || "Fixed Indirect Expense"}`,
                        productCode: basisCode,
                        productType: null,
                        materialClassification: "overhead",
                        inventoryRule: "-",
                        routeSequence: 90 + idx,
                        operationName: ovName || "Plant Overhead",
                        baseRequiredQty: isBatch ? 1 : baseQuantity,
                        scaledRequiredQty: isBatch ? 1 : targetQuantity,
                        wastagePercent: 0,
                        effectiveQty: isBatch ? 1 : targetQuantity,
                        wastageQty: 0,
                        uomName: isBatch ? "LOT" : uomName,
                        unitCost: unitOverheadCost,
                        netLineCost: lineCost,
                        totalLineCost: lineCost,
                        wastageCost: 0,
                        isSubAssembly: false,
                        children: []
                    });
                });
            } else if (overheadNodes.length === 0 && Number(targetVersion.custom_overhead || 0) > 0) {
                const unitOverhead = Number(targetVersion.custom_overhead);
                const lineCost = round4(unitOverhead * batchScalingFactor);
                totalOverheadCost = lineCost;

                overheadNodes.push({
                    id: "overhead-custom-0",
                    level: 1,
                    parentId: null,
                    productId: 0,
                    productName: "Manufacturing & Machine Overhead",
                    description: "Allocated plant equipment and indirect operating expenses",
                    productCode: "Basis: Per Unit",
                    productType: null,
                    materialClassification: "overhead",
                    inventoryRule: "-",
                    routeSequence: 99,
                    operationName: "Plant Overhead",
                    baseRequiredQty: 1,
                    scaledRequiredQty: batchScalingFactor,
                    wastagePercent: 0,
                    effectiveQty: batchScalingFactor,
                    wastageQty: 0,
                    uomName: "LOT",
                    unitCost: unitOverhead,
                    netLineCost: lineCost,
                    totalLineCost: lineCost,
                    wastageCost: 0,
                    isSubAssembly: false,
                    children: []
                });
            } else if (overheadNodes.length === 0) {
                // If 0, still provide standard machine overhead node so Overhead category is visible
                const defaultUnitCost = 0.0000;
                overheadNodes.push({
                    id: "overhead-default-0",
                    level: 1,
                    parentId: null,
                    productId: 0,
                    productName: "Manufacturing & Machine Overhead",
                    description: "Indirect production plant & equipment allocation",
                    productCode: "Basis: Per Unit",
                    productType: null,
                    materialClassification: "overhead",
                    inventoryRule: "-",
                    routeSequence: 99,
                    operationName: "Plant Overhead",
                    baseRequiredQty: 1,
                    scaledRequiredQty: batchScalingFactor,
                    wastagePercent: 0,
                    effectiveQty: batchScalingFactor,
                    wastageQty: 0,
                    uomName: "LOT",
                    unitCost: defaultUnitCost,
                    netLineCost: 0,
                    totalLineCost: 0,
                    wastageCost: 0,
                    isSubAssembly: false,
                    children: []
                });
            }

            // Append labor and overhead nodes directly to tree
            tree.push(...laborNodes);
            tree.push(...overheadNodes);

            // Flatten tree to compute accurate summary metrics
            function flattenTree(nodeList: BOMCostNode[]): BOMCostNode[] {
                const flat: BOMCostNode[] = [];
                nodeList.forEach(n => {
                    flat.push(n);
                    if (n.children && n.children.length > 0) {
                        flat.push(...flattenTree(n.children));
                    }
                });
                return flat;
            }

            const flatNodes = flattenTree(tree);

            // Direct materials are non-sub-assembly raw materials and packaging (including parent nodes with synthetic grouping)
            const materialNodes = flatNodes.filter(n =>
                (n.materialClassification === "raw_material" || n.materialClassification === "packaging") &&
                !n.isSubAssembly
            );

            const rawMaterialsCost = round4(
                materialNodes
                    .filter(n => n.materialClassification === "raw_material")
                    .reduce((sum, n) => sum + n.totalLineCost, 0)
            );

            const packagingCost = round4(
                materialNodes
                    .filter(n => n.materialClassification === "packaging")
                    .reduce((sum, n) => sum + n.totalLineCost, 0)
            );

            const directLaborCost = totalLaborCost;
            const mfgOverheadCost = totalOverheadCost;

            const totalMaterialCost = round4(rawMaterialsCost + packagingCost);
            const totalNetMaterialCost = round4(materialNodes.reduce((sum, n) => sum + n.netLineCost, 0));
            const totalWastageCost = round4(materialNodes.reduce((sum, n) => sum + n.wastageCost, 0));

            const totalBatchCost = round4(totalMaterialCost + directLaborCost + mfgOverheadCost);
            const costPerUnit = targetQuantity > 0 ? round4(totalBatchCost / targetQuantity) : 0;

            const effectiveWastageIncreasePct = totalNetMaterialCost > 0
                ? round4((totalWastageCost / totalNetMaterialCost) * 100)
                : 0;

            const scrapImpactPct = totalBatchCost > 0
                ? round4((totalWastageCost / totalBatchCost) * 100)
                : 0;

            const materialsSharePct = totalBatchCost > 0
                ? round4((totalMaterialCost / totalBatchCost) * 100)
                : 0;

            const laborSharePct = totalBatchCost > 0
                ? round4((directLaborCost / totalBatchCost) * 100)
                : 0;

            const overheadSharePct = totalBatchCost > 0
                ? round4((mfgOverheadCost / totalBatchCost) * 100)
                : 0;

            const subAssembliesCost = round4(
                flatNodes
                    .filter(n => n.isSubAssembly)
                    .reduce((sum, n) => sum + n.totalLineCost, 0)
            );

            const maxDepth = flatNodes.reduce((max, n) => Math.max(max, n.level), 1);

            const summary: BOMCostingSummary = {
                totalNetMaterialCost,
                totalMaterialCost,
                directLaborCost,
                mfgOverheadCost,
                totalBatchCost,
                costPerUnit,
                totalWastageCost,
                effectiveWastageIncreasePct,
                totalComponentsCount: flatNodes.length,
                rawMaterialsCost,
                packagingCost,
                subAssembliesCost,
                maxDepth,
                materialsSharePct,
                laborSharePct,
                overheadSharePct,
                scrapImpactPct
            };

            const targetProduct: TargetProductSummary = {
                product_id: productId,
                product_name: String(productData.description || productData.product_name || `Product #${productId}`),
                description: productData.description ? String(productData.description) : null,
                product_code: productData.product_code ? String(productData.product_code) : null,
                version_id: versionId,
                version_name: String(targetVersion.version_name || "Standard"),
                base_quantity: baseQuantity,
                target_quantity: targetQuantity,
                uom_name: uomName,
                expected_yield_percentage: Number(targetVersion.expected_yield_percentage || 100)
            };

            const reportData: BOMCostingReportData = {
                targetProduct,
                tree,
                summary
            };

            return NextResponse.json({ ok: true, data: reportData });
        }

        return NextResponse.json(
            { ok: false, error: `Invalid action: ${action}` },
            { status: 400 }
        );
    } catch (err: unknown) {
        console.error("[BOM Costing Report API Error]:", err);
        const msg = err instanceof Error ? err.message : "Internal Server Error";
        return NextResponse.json({ ok: false, error: msg }, { status: 500 });
    }
}
