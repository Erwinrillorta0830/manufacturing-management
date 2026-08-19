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

        // 6. Main Assets List
        const [assetsRes, usersRes, deptRes] = await Promise.all([
            fetch(
                `${DIRECTUS_URL}/items/assets_and_equipment?limit=-1&sort=-id&fields=*,item_id.id,item_id.item_name,item_id.item_type.id,item_id.item_type.type_name,item_id.item_classification.id,item_id.item_classification.classification_name,department.department_id,department.department_name,employee.user_id,employee.user_fname,employee.user_lname,created_by.user_id,created_by.user_fname,created_by.user_lname,updated_by.user_id,updated_by.user_fname,updated_by.user_lname,encoder.user_id,encoder.user_fname,encoder.user_lname,user_created.user_id,user_created.user_fname,user_created.user_lname,user_created.first_name,user_created.last_name,user_updated.user_id,user_updated.user_fname,user_updated.user_lname,user_updated.first_name,user_updated.last_name`,
                { headers, cache: "no-store" }
            ),
            fetch(`${DIRECTUS_URL}/items/user?limit=-1&fields=user_id,user_fname,user_lname`, {
                headers,
                cache: "no-store"
            }).catch(() => null),
            fetch(`${DIRECTUS_URL}/items/department?limit=-1&fields=department_id,department_name`, {
                headers,
                cache: "no-store"
            }).catch(() => null)
        ]);

        if (!assetsRes.ok) throw new Error(`Directus failed to fetch assets: ${assetsRes.status}`);
        const assetsJson = await assetsRes.json();
        const rawAssets = assetsJson.data || [];

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

            return {
                id: Number(asset.id),
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
            barcode,
            rfid_code,
            serial,
            condition,
            quantity,
            cost_per_item,
            life_span,
            date_acquired,
            department,
            employee,
            is_active_warning,
            item_image,
            encoder
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
        const cleanDate = date_acquired ? new Date(date_acquired).toISOString() : now;

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
            condition,
            cost_per_item,
            quantity,
            life_span,
            date_acquired,
            department,
            employee,
            item_image,
            barcode,
            rfid_code,
            serial,
            is_active_warning
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
        const cleanDate = date_acquired ? new Date(date_acquired).toISOString() : undefined;

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
            updated_by: userId,
            date_updated: now,
            updated_at: now
        };

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
