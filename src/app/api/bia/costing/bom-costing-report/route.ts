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
                const nodes: BOMCostNode[] = [];

                for (let i = 0; i < bomItems.length; i++) {
                    const item = bomItems[i];
                    const compId = Number(item.product_id);
                    const compProd = compProdsMap.get(compId);
                    const route = routeMap.get(Number(item.route_id));

                    const opId = route ? Number(route.operation_id) : 0;
                    const opName = opsMap.get(opId) || (route ? `Step #${route.sequence_order}` : "Standard Assembly");
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
                    const wastageQty = round4(scaledReqQty * (wastagePercent / 100));
                    const effectiveQty = round4(scaledReqQty + wastageQty);

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
                        const subBaseQty = Number(subAssemblyVersion.base_quantity) || 1;
                        const subScalingFactor = effectiveQty / subBaseQty;
                        children = await explodeVersion(compId, subVerId, subScalingFactor, level + 1, nodeId, localVisited);

                        // If children have cost, roll up total child cost to sub-assembly if direct lineCost was 0
                        const childrenCostSum = round4(children.reduce((acc, c) => acc + c.totalLineCost, 0));
                        if (childrenCostSum > 0 && lineCost === 0) {
                            lineCost = childrenCostSum;
                        }
                    }

                    nodes.push({
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

                return nodes;
            }

            // Explode from Level 1
            const tree = await explodeVersion(productId, versionId, batchScalingFactor, 1, null, new Set());

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
            const round4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;

            // Compute leaf items vs sub-assemblies (reconciled exactly from displayed rows)
            const leafNodes = flatNodes.filter(n => !n.children || n.children.length === 0);
            const rawMaterialsCost = round4(
                leafNodes
                    .filter(n => n.materialClassification === "raw_material")
                    .reduce((sum, n) => sum + n.totalLineCost, 0)
            );

            const packagingCost = round4(
                leafNodes
                    .filter(n => n.materialClassification === "packaging")
                    .reduce((sum, n) => sum + n.totalLineCost, 0)
            );

            const totalMaterialCost = round4(rawMaterialsCost + packagingCost);
            const totalNetMaterialCost = round4(leafNodes.reduce((sum, n) => sum + n.netLineCost, 0));
            const totalWastageCost = round4(leafNodes.reduce((sum, n) => sum + n.wastageCost, 0));
            const costPerUnit = targetQuantity > 0 ? round4(totalMaterialCost / targetQuantity) : 0;
            const effectiveWastageIncreasePct = totalNetMaterialCost > 0
                ? round4((totalWastageCost / totalNetMaterialCost) * 100)
                : 0;

            const subAssembliesCost = round4(
                flatNodes
                    .filter(n => n.isSubAssembly)
                    .reduce((sum, n) => sum + n.totalLineCost, 0)
            );

            const maxDepth = flatNodes.reduce((max, n) => Math.max(max, n.level), 0);

            const summary: BOMCostingSummary = {
                totalNetMaterialCost,
                totalMaterialCost,
                costPerUnit,
                totalWastageCost,
                effectiveWastageIncreasePct,
                totalComponentsCount: flatNodes.length,
                rawMaterialsCost,
                packagingCost,
                subAssembliesCost,
                maxDepth
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
