import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { DIRECTUS_URL, headers, getISOStringInConfiguredTimezone } from "@/app/api/manufacturing/directus-api";
import { decodeJwtPayload } from "@/lib/auth-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface DirectusUser {
    user_id: number;
    user_fname?: string | null;
    user_mname?: string | null;
    user_lname?: string | null;
}

interface DirectusDepartment {
    department_id: number;
    department_name: string;
}

interface DirectusItemType {
    id: number;
    type_name: string;
}

interface DirectusItemClassification {
    id: number;
    classification_name: string;
}

async function getUserIdFromToken(): Promise<number | null> {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get("vos_access_token")?.value || cookieStore.get("springboot_token")?.value;
        if (!token) return null;
        const payload = decodeJwtPayload(token);
        const id = payload?.id || payload?.user_id || payload?.userId || payload?.sub;
        return id && !isNaN(Number(id)) ? Number(id) : null;
    } catch {
        return null;
    }
}

async function getManilaTimeString(): Promise<string> {
    try {
        const isoStr = await getISOStringInConfiguredTimezone();
        return isoStr.slice(0, 23);
    } catch {
        return new Date().toISOString().slice(0, 23);
    }
}

function extractImageUuid(imageVal: string | null | undefined): string | null {
    if (!imageVal || typeof imageVal !== "string") return null;
    const trimmed = imageVal.trim();
    if (!trimmed) return null;

    const uuidMatch = trimmed.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
    if (uuidMatch) return uuidMatch[0];

    if (trimmed.includes("/assets/")) {
        const parts = trimmed.split("/assets/");
        const last = parts[parts.length - 1].split("?")[0].split("/")[0];
        if (last) return last;
    }

    return trimmed;
}

function formatSqlDateTime(val: string | Date | null | undefined): string | null {
    if (!val) return null;
    if (typeof val === "string") {
        const trimmed = val.trim();
        if (/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}$/.test(trimmed)) {
            return trimmed;
        }
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(trimmed)) {
            return trimmed.replace("T", " ").split(".")[0].substring(0, 19);
        }
        if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
            return `${trimmed} 00:00:00`;
        }
        const d = new Date(trimmed.includes(" ") ? trimmed.replace(" ", "T") : trimmed);
        if (!isNaN(d.getTime())) {
            const pad = (n: number) => String(n).padStart(2, "0");
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
        }
        return trimmed;
    }
    if (val instanceof Date && !isNaN(val.getTime())) {
        const pad = (n: number) => String(n).padStart(2, "0");
        return `${val.getFullYear()}-${pad(val.getMonth() + 1)}-${pad(val.getDate())} ${pad(val.getHours())}:${pad(val.getMinutes())}`;
    }
    return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchSpringBootAssetDepreciation(searchParams?: URLSearchParams): Promise<any[]> {
    const springBase = process.env.SPRING_API_BASE_URL?.replace(/\/$/, "");
    if (!springBase) return [];
    try {
        const cookieStore = await cookies();
        const springToken = cookieStore.get("springboot_token")?.value || cookieStore.get("vos_access_token")?.value;

        const query = new URLSearchParams();
        if (searchParams) {
            const allowedParams = [
                "type",
                "assetType",
                "assetOrigin",
                "asset_origin",
                "department",
                "employee",
                "depreciationMethod",
                "productionUnit",
                "jobOrder",
                "product",
                "acquisitionDateFrom",
                "acquisitionDateTo",
                "depreciationStartDateFrom",
                "depreciationStartDateTo",
                "acquisitionCostMin",
                "acquisitionCostMax",
                "residualValueMin",
                "residualValueMax"
            ];
            for (const param of allowedParams) {
                const val = searchParams.get(param);
                if (val !== null && val !== undefined && val.trim() !== "") {
                    query.set(param, val.trim());
                }
            }
            if (!query.has("depreciationMethod") && searchParams.get("depreciation_method")) {
                query.set("depreciationMethod", searchParams.get("depreciation_method")!.trim());
            }
            if (!query.has("assetType") && searchParams.get("asset_type")) {
                query.set("assetType", searchParams.get("asset_type")!.trim());
            }
            if (!query.has("assetOrigin") && searchParams.get("asset_origin")) {
                query.set("assetOrigin", searchParams.get("asset_origin")!.trim());
            }
        }

        const queryString = query.toString() ? `?${query.toString()}` : "";
        const res = await fetch(`${springBase}/api/asset-depreciation${queryString}`, {
            headers: {
                ...(springToken ? { Authorization: `Bearer ${springToken}` } : {}),
                "Content-Type": "application/json"
            },
            cache: "no-store"
        });
        if (res.ok) {
            const data = await res.json();
            return Array.isArray(data) ? data : [];
        }
    } catch (err) {
        console.error("Error fetching /api/asset-depreciation from Spring Boot:", err);
    }
    return [];
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");

    try {
        // 1. Departments dropdown
        if (type === "departments") {
            const res = await fetch(`${DIRECTUS_URL}/items/department?limit=-1&sort=department_name`, {
                headers,
                cache: "no-store"
            });
            if (!res.ok) throw new Error(`Directus error: ${res.status}`);
            const json = await res.json();
            return NextResponse.json(json.data || []);
        }

        // 2. Users / Employees dropdown
        if (type === "users") {
            const res = await fetch(
                `${DIRECTUS_URL}/items/user?limit=-1&fields=user_id,user_fname,user_mname,user_lname&sort=user_fname`,
                { headers, cache: "no-store" }
            );
            if (!res.ok) throw new Error(`Directus error: ${res.status}`);
            const json = await res.json();
            return NextResponse.json(json.data || []);
        }

        // 3. Item Types dropdown (deduplicated)
        if (type === "item_types") {
            const res = await fetch(`${DIRECTUS_URL}/items/item_type?limit=-1&sort=type_name`, {
                headers,
                cache: "no-store"
            });
            if (!res.ok) throw new Error(`Directus error: ${res.status}`);
            const json = await res.json();
            const rawTypes: DirectusItemType[] = json.data || [];
            const seen = new Set<string>();
            const uniqueTypes = rawTypes.filter((t) => {
                const name = (t.type_name || "").trim().toLowerCase();
                if (!name || seen.has(name)) return false;
                seen.add(name);
                return true;
            });
            return NextResponse.json(uniqueTypes);
        }

        // 4. Item Classifications dropdown (deduplicated)
        if (type === "item_classifications") {
            const res = await fetch(`${DIRECTUS_URL}/items/item_classification?limit=-1&sort=classification_name`, {
                headers,
                cache: "no-store"
            });
            if (!res.ok) throw new Error(`Directus error: ${res.status}`);
            const json = await res.json();
            const rawClasses: DirectusItemClassification[] = json.data || [];
            const seen = new Set<string>();
            const uniqueClasses = rawClasses.filter((c) => {
                const name = (c.classification_name || "").trim().toLowerCase();
                if (!name || seen.has(name)) return false;
                seen.add(name);
                return true;
            });
            return NextResponse.json(uniqueClasses);
        }

        // 5. Catalog Items dropdown
        if (type === "items") {
            const res = await fetch(
                `${DIRECTUS_URL}/items/items?limit=-1&sort=item_name&fields=id,item_name,item_type.id,item_type.type_name,item_classification.id,item_classification.classification_name`,
                { headers, cache: "no-store" }
            );
            if (!res.ok) throw new Error(`Directus error: ${res.status}`);
            const json = await res.json();
            return NextResponse.json(json.data || []);
        }

        // 6. Units of Measure dropdown
        if (type === "units") {
            const res = await fetch(
                `${DIRECTUS_URL}/items/units?limit=-1&sort=unit_name&fields=unit_id,unit_name,unit_shortcut`,
                { headers, cache: "no-store" }
            );
            if (!res.ok) throw new Error(`Directus error: ${res.status}`);
            const json = await res.json();
            return NextResponse.json(json.data || []);
        }

        // 7. Depreciation Summary & Spring Boot Depreciation API
        if (type === "depreciation_summary" || type === "asset_depreciation") {
            const springData = await fetchSpringBootAssetDepreciation(searchParams);
            if (springData.length > 0) {
                return NextResponse.json(springData);
            }
            const res = await fetch(`${DIRECTUS_URL}/items/vw_asset_depreciation_summary?limit=-1`, {
                headers,
                cache: "no-store"
            }).catch(() => null);
            if (res && res.ok) {
                const json = await res.json();
                return NextResponse.json(json.data || []);
            }
            return NextResponse.json([]);
        }

        // 8. Depreciation Details View
        if (type === "depreciation_details") {
            const assetId = searchParams.get("asset_id");
            const springData = await fetchSpringBootAssetDepreciation(searchParams);
            if (springData.length > 0) {
                if (assetId) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const filtered = springData.filter((item: any) => Number(item.assetId || item.asset_id) === Number(assetId));
                    return NextResponse.json(filtered);
                }
                return NextResponse.json(springData);
            }
            const filter = assetId ? `?filter[asset_id][_eq]=${assetId}&sort=-production_date` : "?sort=-production_date";
            const res = await fetch(`${DIRECTUS_URL}/items/vw_asset_depreciation${filter}&limit=-1`, {
                headers,
                cache: "no-store"
            }).catch(() => null);
            if (res && res.ok) {
                const json = await res.json();
                return NextResponse.json(json.data || []);
            }
            return NextResponse.json([]);
        }

        // 9. Main Assets List
        const [assetsRes, usersRes, deptRes, itemsRes, springDepreciationList] = await Promise.all([
            fetch(
                `${DIRECTUS_URL}/items/assets_and_equipment?limit=-1&sort=-id&fields=*,item_id.id,item_id.item_name,item_id.item_type.id,item_id.item_type.type_name,item_id.item_classification.id,item_id.item_classification.classification_name,department.department_id,department.department_name`,
                { headers, cache: "no-store" }
            ).catch(() => null),
            fetch(`${DIRECTUS_URL}/items/user?limit=-1&fields=user_id,user_fname,user_lname`, {
                headers,
                cache: "no-store"
            }).catch(() => null),
            fetch(`${DIRECTUS_URL}/items/department?limit=-1&fields=department_id,department_name`, {
                headers,
                cache: "no-store"
            }).catch(() => null),
            fetch(`${DIRECTUS_URL}/items/items?limit=-1&fields=id,item_name,item_type.id,item_type.type_name,item_classification.id,item_classification.classification_name`, {
                headers,
                cache: "no-store"
            }).catch(() => null),
            fetchSpringBootAssetDepreciation(searchParams).catch(() => [])
        ]);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let rawAssets: any[] = [];
        if (assetsRes && assetsRes.ok) {
            const assetsJson = await assetsRes.json();
            rawAssets = assetsJson.data || [];
        } else {
            // Resilient fallback to simple fields=* query if relational query fails
            const fallbackRes = await fetch(`${DIRECTUS_URL}/items/assets_and_equipment?limit=-1&sort=-id`, {
                headers,
                cache: "no-store"
            }).catch(() => null);
            if (fallbackRes && fallbackRes.ok) {
                const fbJson = await fallbackRes.json();
                rawAssets = fbJson.data || [];
            } else if (springDepreciationList && springDepreciationList.length > 0) {
                rawAssets = springDepreciationList;
            } else {
                throw new Error(`Directus failed to fetch assets: ${assetsRes ? assetsRes.status : 'network error'}`);
            }
        }

        let usersList: DirectusUser[] = [];
        if (usersRes && usersRes.ok) {
            try {
                const uJson = await usersRes.json();
                usersList = uJson.data || [];
            } catch {
                usersList = [];
            }
        }

        let deptList: DirectusDepartment[] = [];
        if (deptRes && deptRes.ok) {
            try {
                const dJson = await deptRes.json();
                deptList = dJson.data || [];
            } catch {
                deptList = [];
            }
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let itemsList: any[] = [];
        if (itemsRes && itemsRes.ok) {
            try {
                const iJson = await itemsRes.json();
                itemsList = iJson.data || [];
            } catch {
                itemsList = [];
            }
        }

        const resolveUserName = (
            val: unknown,
            fallbackText = "N/A"
        ): { id: number | null; name: string } => {
            if (!val) return { id: null, name: fallbackText };
            if (typeof val === "object" && val !== null) {
                const obj = val as Record<string, unknown>;
                const id = Number(obj.user_id || obj.id) || null;
                const fname = String(obj.user_fname || obj.first_name || "").trim();
                const lname = String(obj.user_lname || obj.last_name || "").trim();
                const full = [fname, lname].filter(Boolean).join(" ").trim();
                if (full) return { id, name: full };
                if (obj.email) return { id, name: String(obj.email) };
                if (id) {
                    const found = usersList.find((u) => Number(u.user_id) === id);
                    if (found) {
                        const uFull = [found.user_fname, found.user_lname].filter(Boolean).join(" ").trim();
                        if (uFull) return { id, name: uFull };
                    }
                    return { id, name: `User #${id}` };
                }
            }
            const numId = Number(val);
            if (!isNaN(numId) && numId > 0) {
                const found = usersList.find((u) => Number(u.user_id) === numId);
                if (found) {
                    const uFull = [found.user_fname, found.user_lname].filter(Boolean).join(" ").trim();
                    if (uFull) return { id: numId, name: uFull };
                }
                return { id: numId, name: `User #${numId}` };
            }
            const strVal = String(val).trim();
            if (strVal && strVal !== "null" && strVal !== "undefined") {
                const found = usersList.find((u) => String(u.user_id) === strVal);
                if (found) {
                    const uFull = [found.user_fname, found.user_lname].filter(Boolean).join(" ").trim();
                    if (uFull) return { id: Number(found.user_id) || null, name: uFull };
                }
                return { id: null, name: strVal.length > 20 ? "System User" : strVal };
            }
            return { id: null, name: fallbackText };
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const formattedAssets = rawAssets.map((asset: any) => {
            const rawItem = asset.item_id;
            let itemName = "N/A";
            let itemTypeName = "N/A";
            let classificationName = "N/A";
            let itemId = 0;

            if (rawItem && typeof rawItem === "object") {
                itemId = Number(rawItem.id) || 0;
                itemName = rawItem.item_name || "N/A";
                if (rawItem.item_type && typeof rawItem.item_type === "object") {
                    itemTypeName = rawItem.item_type.type_name || "N/A";
                }
                if (rawItem.item_classification && typeof rawItem.item_classification === "object") {
                    classificationName = rawItem.item_classification.classification_name || "N/A";
                }
            } else if (typeof rawItem === "number") {
                itemId = rawItem;
            }

            // Department resolution
            let deptName = "Unassigned";
            let deptId: number | null = null;
            if (asset.department && typeof asset.department === "object") {
                deptId = Number(asset.department.department_id) || null;
                deptName = asset.department.department_name || "Unassigned";
            } else if (typeof asset.department === "number") {
                deptId = asset.department;
                const foundDept = deptList.find((d) => Number(d.department_id) === Number(asset.department));
                if (foundDept) deptName = foundDept.department_name;
            }

            // Employee / Assigned To resolution
            let employeeName = "Unassigned";
            let employeeId: number | null = null;
            if (asset.employee && typeof asset.employee === "object") {
                employeeId = Number(asset.employee.user_id) || null;
                employeeName = [asset.employee.user_fname, asset.employee.user_lname].filter(Boolean).join(" ") || "Unassigned";
            } else if (typeof asset.employee === "number") {
                employeeId = asset.employee;
                const foundUser = usersList.find((u) => Number(u.user_id) === Number(asset.employee));
                if (foundUser) {
                    employeeName = [foundUser.user_fname, foundUser.user_lname].filter(Boolean).join(" ") || "Unassigned";
                }
            }

            // Audit resolution
            const creatorInfo = resolveUserName(asset.created_by || asset.encoder || asset.user_created, "N/A");
            const updaterInfo = resolveUserName(asset.updated_by || asset.user_updated, creatorInfo.name);

            const unitCost = Number(asset.cost_per_item) || 0;
            const quantity = Number(asset.quantity) || 1;
            const total = Number(asset.total) || unitCost * quantity;

            // Production Unit resolution
            let prodUnitId: number | null = null;
            let prodUnitName: string | null = null;
            let prodUnitShortcut: string | null = null;
            if (asset.production_unit_id && typeof asset.production_unit_id === "object") {
                prodUnitId = Number(asset.production_unit_id.unit_id || asset.production_unit_id.id) || null;
                prodUnitName = asset.production_unit_id.unit_name || null;
                prodUnitShortcut = asset.production_unit_id.unit_shortcut || null;
            } else if (typeof asset.production_unit_id === "number") {
                prodUnitId = asset.production_unit_id;
            }

            const assetIdNum = Number(asset.id);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const matchedDepreciation = springDepreciationList.filter((d: any) => Number(d.assetId || d.asset_id) === assetIdNum);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const totalActualUnits = matchedDepreciation.reduce((sum: number, d: any) => sum + (Number(d.productionUnits) || 0), 0);
            const latestRemainingCap = matchedDepreciation.length > 0 && matchedDepreciation[0].remainingProductionCapacity != null
                ? Number(matchedDepreciation[0].remainingProductionCapacity)
                : null;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const totalProdDep = matchedDepreciation.reduce((sum: number, d: any) => sum + (Number(d.productionDepreciation) || 0), 0);

            return {
                id: assetIdNum,
                barcode: asset.barcode ? String(asset.barcode) : null,
                rfid_code: asset.rfid_code ? String(asset.rfid_code) : null,
                serial: asset.serial ? String(asset.serial) : null,
                is_active_warning: asset.is_active_warning ? 1 : 0,
                condition: asset.condition || "Good",
                quantity,
                cost_per_item: unitCost,
                total,
                date_acquired: asset.date_acquired ? String(asset.date_acquired) : "",
                life_span: Number(asset.life_span) || 1,

                // Depreciation & Capacity Fields
                asset_type: asset.asset_type || "Administrative",
                depreciation_method: asset.depreciation_method || "Straight Line",
                asset_origin: asset.asset_origin || ((asset.opening_book_value != null && Number(asset.opening_book_value) < (asset.acquisition_cost != null ? Number(asset.acquisition_cost) : total)) || Number(asset.opening_accumulated_depreciation || 0) > 0 ? "Existing" : "New"),
                acquisition_cost: asset.acquisition_cost != null ? Number(asset.acquisition_cost) : total,
                residual_value: asset.residual_value != null ? Number(asset.residual_value) : 0,
                useful_life_months: asset.useful_life_months != null ? Number(asset.useful_life_months) : (Number(asset.life_span || 1) * 12),
                maximum_unit_produced_capacity: asset.maximum_unit_produced_capacity != null ? Number(asset.maximum_unit_produced_capacity) : null,
                production_unit_id: prodUnitId,
                production_unit: prodUnitName,
                production_unit_shortcut: prodUnitShortcut,
                depreciation_start_date: asset.depreciation_start_date ? String(asset.depreciation_start_date) : (asset.date_acquired ? String(asset.date_acquired) : null),
                actual_units_produced: totalActualUnits > 0 ? totalActualUnits : (asset.actual_units_produced != null ? Number(asset.actual_units_produced) : 0),
                remaining_production_capacity: latestRemainingCap,
                production_depreciation: totalProdDep > 0 ? totalProdDep : null,

                // Opening / Migration Fields
                opening_book_value: asset.opening_book_value != null ? Number(asset.opening_book_value) : null,
                opening_accumulated_depreciation: asset.opening_accumulated_depreciation != null ? Number(asset.opening_accumulated_depreciation) : 0,
                opening_production_units: asset.opening_production_units != null ? Number(asset.opening_production_units) : 0,
                opening_production_date: asset.opening_production_date ? String(asset.opening_production_date) : null,

                // Joined metadata
                item_name: itemName,
                item_image: extractImageUuid(asset.item_image),
                item_type_name: itemTypeName,
                classification_name: classificationName,
                department_name: deptName,
                assigned_to_name: employeeName,

                // Audit fields
                created_by: creatorInfo.id,
                created_by_name: creatorInfo.name,
                updated_by: updaterInfo.id,
                updated_by_name: updaterInfo.name,
                created_at: asset.created_at || asset.date_created || null,
                date_created: asset.date_created || asset.created_at || null,
                updated_at: asset.updated_at || asset.date_updated || null,
                date_updated: asset.date_updated || asset.updated_at || null,

                // Foreign Keys
                item_id: itemId,
                department: deptId,
                employee: employeeId,
                encoder: asset.encoder ? Number(asset.encoder) : creatorInfo.id
            };
        });

        return NextResponse.json(formattedAssets);
    } catch (e) {
        console.error("API Error in Manufacturing Asset Management GET:", e);
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Failed to fetch asset management data" },
            { status: 500 }
        );
    }
}

async function resolveOrCreateItemType(
    typeNameOrId: string | number,
    userId: number | null,
    now: string
): Promise<number | null> {
    if (typeof typeNameOrId === "number" || (!isNaN(Number(typeNameOrId)) && String(typeNameOrId).trim() !== "")) {
        return Number(typeNameOrId);
    }
    const trimmed = String(typeNameOrId).trim();
    if (!trimmed) return null;

    // Search existing
    const searchRes = await fetch(
        `${DIRECTUS_URL}/items/item_type?limit=-1`,
        { headers, cache: "no-store" }
    );
    if (searchRes.ok) {
        const json = await searchRes.json();
        const existing = (json.data || []).find(
            (t: { type_name?: string }) => t.type_name?.trim().toLowerCase() === trimmed.toLowerCase()
        );
        if (existing) {
            return Number(existing.id);
        }
    }

    // Create new
    const createRes = await fetch(`${DIRECTUS_URL}/items/item_type`, {
        method: "POST",
        headers,
        body: JSON.stringify({
            type_name: trimmed,
            created_by: userId,
            date_created: now,
            created_at: now,
            updated_by: userId,
            date_updated: now,
            updated_at: now
        })
    });
    if (createRes.ok) {
        const json = await createRes.json();
        return Number(json.data?.id) || null;
    }
    return null;
}

async function resolveOrCreateItemClassification(
    classNameOrId: string | number,
    userId: number | null,
    now: string
): Promise<number | null> {
    if (typeof classNameOrId === "number" || (!isNaN(Number(classNameOrId)) && String(classNameOrId).trim() !== "")) {
        return Number(classNameOrId);
    }
    const trimmed = String(classNameOrId).trim();
    if (!trimmed) return null;

    // Search existing
    const searchRes = await fetch(
        `${DIRECTUS_URL}/items/item_classification?limit=-1`,
        { headers, cache: "no-store" }
    );
    if (searchRes.ok) {
        const json = await searchRes.json();
        const existing = (json.data || []).find(
            (c: { classification_name?: string }) => c.classification_name?.trim().toLowerCase() === trimmed.toLowerCase()
        );
        if (existing) {
            return Number(existing.id);
        }
    }

    // Create new
    const createRes = await fetch(`${DIRECTUS_URL}/items/item_classification`, {
        method: "POST",
        headers,
        body: JSON.stringify({
            classification_name: trimmed,
            created_by: userId,
            date_created: now,
            created_at: now,
            updated_by: userId,
            date_updated: now,
            updated_at: now
        })
    });
    if (createRes.ok) {
        const json = await createRes.json();
        return Number(json.data?.id) || null;
    }
    return null;
}

async function resolveOrCreateItem(
    itemName: string,
    typeId: number | null,
    classId: number | null,
    userId: number | null,
    now: string
): Promise<number> {
    const trimmedName = itemName.trim();

    // Search existing item
    const searchRes = await fetch(
        `${DIRECTUS_URL}/items/items?limit=-1&fields=id,item_name,item_type,item_classification`,
        { headers, cache: "no-store" }
    );

    if (searchRes.ok) {
        const json = await searchRes.json();
        const existing = (json.data || []).find(
            (i: { item_name?: string }) => i.item_name?.trim().toLowerCase() === trimmedName.toLowerCase()
        );
        if (existing) {
            const updatePayload: Record<string, unknown> = {
                updated_by: userId,
                date_updated: now,
                updated_at: now
            };
            if (typeId && !existing.item_type) updatePayload.item_type = typeId;
            if (classId && !existing.item_classification) updatePayload.item_classification = classId;

            await fetch(`${DIRECTUS_URL}/items/items/${existing.id}`, {
                method: "PATCH",
                headers,
                body: JSON.stringify(updatePayload)
            });
            return Number(existing.id);
        }
    }

    // Create new Catalog Item
    const createRes = await fetch(`${DIRECTUS_URL}/items/items`, {
        method: "POST",
        headers,
        body: JSON.stringify({
            item_name: trimmedName,
            item_type: typeId,
            item_classification: classId,
            created_by: userId,
            date_created: now,
            created_at: now,
            updated_by: userId,
            date_updated: now,
            updated_at: now
        })
    });

    if (!createRes.ok) {
        const errText = await createRes.text();
        throw new Error(`Failed to create item in Directus: ${createRes.status} - ${errText}`);
    }

    const json = await createRes.json();
    return Number(json.data.id);
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const userId = await getUserIdFromToken();
        const now = await getManilaTimeString();

        const {
            item_name,
            item_type,
            item_classification,
            asset_type,
            depreciation_method,
            barcode,
            rfid_code,
            serial,
            condition,
            quantity,
            cost_per_item,
            acquisition_cost,
            residual_value,
            life_span,
            useful_life_months,
            maximum_unit_produced_capacity,
            production_unit_id,
            date_acquired,
            depreciation_start_date,
            department,
            employee,
            is_active_warning,
            item_image,
            encoder,
            asset_origin,
            opening_book_value,
            opening_accumulated_depreciation,
            opening_production_units,
            opening_production_date
        } = body;

        if (!item_name || !String(item_name).trim()) {
            return NextResponse.json({ error: "Item name is required" }, { status: 400 });
        }

        // 1. Resolve / create item type and classification
        const [resolvedTypeId, resolvedClassId] = await Promise.all([
            item_type ? resolveOrCreateItemType(item_type, userId, now) : null,
            item_classification ? resolveOrCreateItemClassification(item_classification, userId, now) : null
        ]);

        // 2. Resolve / create catalog item
        const itemId = await resolveOrCreateItem(item_name, resolvedTypeId, resolvedClassId, userId, now);

        // 3. Prepare asset payload
        const unitCost = Number(cost_per_item) || 0;
        const qty = Number(quantity) || 1;
        const totalCost = unitCost * qty;
        const cleanDate = formatSqlDateTime(date_acquired) || now;
        const resolvedOrigin = asset_origin || (opening_book_value != null && Number(opening_book_value) < (acquisition_cost != null ? Number(acquisition_cost) : totalCost) || Number(opening_accumulated_depreciation || 0) > 0 ? "Existing" : "New");
        const cleanDepStart = (resolvedOrigin === "Existing" && depreciation_start_date)
            ? (formatSqlDateTime(depreciation_start_date)?.split(" ")[0] || cleanDate.split(" ")[0])
            : cleanDate.split(" ")[0];
        const cleanOpeningDate = opening_production_date ? formatSqlDateTime(opening_production_date) : null;

        const assetPayload = {
            item_id: itemId,
            item_image: extractImageUuid(item_image),
            barcode: barcode?.trim() || null,
            rfid_code: rfid_code?.trim() || null,
            serial: serial?.trim() || null,
            is_active_warning: is_active_warning ? 1 : 0,
            is_active: true,
            condition: condition || "Good",
            quantity: qty,
            cost_per_item: unitCost,
            total: totalCost,
            life_span: Number(life_span) || 1,
            date_acquired: cleanDate,

            // Depreciation & Capacity Fields
            asset_type: asset_type || "Administrative",
            depreciation_method: depreciation_method || "Straight Line",
            asset_origin: resolvedOrigin,
            acquisition_cost: acquisition_cost != null ? Number(acquisition_cost) : totalCost,
            residual_value: residual_value != null ? Number(residual_value) : 0,
            useful_life_months: useful_life_months != null ? Number(useful_life_months) : (Number(life_span || 1) * 12),
            maximum_unit_produced_capacity: maximum_unit_produced_capacity != null ? Number(maximum_unit_produced_capacity) : null,
            production_unit_id: production_unit_id ? Number(production_unit_id) : null,
            depreciation_start_date: cleanDepStart,

            // Opening / Migration Fields
            opening_book_value: opening_book_value != null ? Number(opening_book_value) : (acquisition_cost != null ? Number(acquisition_cost) : totalCost),
            opening_accumulated_depreciation: opening_accumulated_depreciation != null ? Number(opening_accumulated_depreciation) : 0,
            opening_production_units: opening_production_units != null ? Number(opening_production_units) : 0,
            opening_production_date: cleanOpeningDate,

            department: department ? Number(department) : null,
            employee: employee ? Number(employee) : null,
            encoder: userId || (encoder ? Number(encoder) : null),
            created_by: userId || null,
            date_created: now,
            created_at: now,
            updated_by: userId || null,
            date_updated: now,
            updated_at: now
        };

        const res = await fetch(`${DIRECTUS_URL}/items/assets_and_equipment`, {
            method: "POST",
            headers,
            body: JSON.stringify(assetPayload)
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Directus failed to create asset: ${res.status} - ${errText}`);
        }

        const json = await res.json();
        return NextResponse.json({
            success: true,
            data: {
                ...json.data,
                item_id: itemId
            }
        });
    } catch (e) {
        console.error("API Error in Manufacturing Asset Management POST:", e);
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Failed to create asset" },
            { status: 500 }
        );
    }
}

export async function PATCH(request: Request) {
    try {
        const body = await request.json();
        const userId = await getUserIdFromToken();
        const now = await getManilaTimeString();

        const {
            id,
            item_id,
            item_name,
            item_type_name,
            classification_name,
            asset_type,
            depreciation_method,
            condition,
            cost_per_item,
            acquisition_cost,
            residual_value,
            quantity,
            life_span,
            useful_life_months,
            maximum_unit_produced_capacity,
            production_unit_id,
            date_acquired,
            depreciation_start_date,
            department,
            employee,
            item_image,
            barcode,
            rfid_code,
            serial,
            is_active_warning,
            asset_origin,
            opening_book_value,
            opening_accumulated_depreciation,
            opening_production_units,
            opening_production_date
        } = body;

        if (!id) {
            return NextResponse.json({ error: "Missing asset id" }, { status: 400 });
        }

        // 1. If item_id exists, update item info if names provided
        if (item_id) {
            const [resolvedTypeId, resolvedClassId] = await Promise.all([
                item_type_name ? resolveOrCreateItemType(item_type_name, userId, now) : null,
                classification_name ? resolveOrCreateItemClassification(classification_name, userId, now) : null
            ]);

            const itemUpdate: Record<string, unknown> = {
                updated_by: userId,
                updated_at: now
            };
            if (item_name) itemUpdate.item_name = String(item_name).trim();
            if (resolvedTypeId) itemUpdate.item_type = resolvedTypeId;
            if (resolvedClassId) itemUpdate.item_classification = resolvedClassId;

            await fetch(`${DIRECTUS_URL}/items/items/${item_id}`, {
                method: "PATCH",
                headers,
                body: JSON.stringify(itemUpdate)
            }).catch((err) => console.error("Error updating catalog item in asset PATCH:", err));
        }

        // 2. Update assets_and_equipment
        const unitCost = Number(cost_per_item) || 0;
        const qty = Number(quantity) || 1;
        const totalCost = unitCost * qty;
        const cleanDate = formatSqlDateTime(date_acquired) || undefined;
        const isLegacyUpdate = asset_origin === "Existing" || (opening_book_value !== undefined && opening_book_value != null && Number(opening_book_value) < totalCost) || (opening_accumulated_depreciation !== undefined && Number(opening_accumulated_depreciation) > 0);
        const cleanDepStart = (isLegacyUpdate && depreciation_start_date)
            ? (formatSqlDateTime(depreciation_start_date)?.split(" ")[0])
            : (cleanDate ? cleanDate.split(" ")[0] : undefined);
        const cleanOpeningDate = opening_production_date !== undefined ? (opening_production_date ? formatSqlDateTime(opening_production_date) : null) : undefined;

        const assetUpdate: Record<string, unknown> = {
            condition: condition || "Good",
            cost_per_item: unitCost,
            quantity: qty,
            total: totalCost,
            life_span: Number(life_span) || 1,
            department: department ? Number(department) : null,
            employee: employee ? Number(employee) : null,
            barcode: barcode?.trim() || null,
            rfid_code: rfid_code?.trim() || null,
            serial: serial?.trim() || null,
            is_active_warning: is_active_warning ? 1 : 0,

            // Depreciation & Capacity Fields
            updated_by: userId,
            date_updated: now,
            updated_at: now
        };

        if (asset_type !== undefined) assetUpdate.asset_type = asset_type;
        if (depreciation_method !== undefined) assetUpdate.depreciation_method = depreciation_method;
        if (asset_origin !== undefined) assetUpdate.asset_origin = asset_origin;
        if (acquisition_cost !== undefined) assetUpdate.acquisition_cost = Number(acquisition_cost);
        if (residual_value !== undefined) assetUpdate.residual_value = Number(residual_value);
        if (useful_life_months !== undefined) assetUpdate.useful_life_months = useful_life_months != null ? Number(useful_life_months) : null;
        if (maximum_unit_produced_capacity !== undefined) assetUpdate.maximum_unit_produced_capacity = maximum_unit_produced_capacity != null ? Number(maximum_unit_produced_capacity) : null;
        if (production_unit_id !== undefined) assetUpdate.production_unit_id = production_unit_id ? Number(production_unit_id) : null;
        if (cleanDepStart !== undefined) assetUpdate.depreciation_start_date = cleanDepStart;

        // Opening / Migration Fields
        if (opening_book_value !== undefined) assetUpdate.opening_book_value = opening_book_value != null ? Number(opening_book_value) : null;
        if (opening_accumulated_depreciation !== undefined) assetUpdate.opening_accumulated_depreciation = opening_accumulated_depreciation != null ? Number(opening_accumulated_depreciation) : 0;
        if (opening_production_units !== undefined) assetUpdate.opening_production_units = opening_production_units != null ? Number(opening_production_units) : 0;
        if (cleanOpeningDate !== undefined) assetUpdate.opening_production_date = cleanOpeningDate;

        if (cleanDate) assetUpdate.date_acquired = cleanDate;
        if (item_image !== undefined) assetUpdate.item_image = extractImageUuid(item_image);

        const res = await fetch(`${DIRECTUS_URL}/items/assets_and_equipment/${id}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify(assetUpdate)
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Directus failed to update asset: ${res.status} - ${errText}`);
        }

        const json = await res.json();
        return NextResponse.json({ success: true, data: json.data });
    } catch (e) {
        console.error("API Error in Manufacturing Asset Management PATCH:", e);
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Failed to update asset" },
            { status: 500 }
        );
    }
}
