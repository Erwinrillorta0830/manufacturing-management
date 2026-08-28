import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import { Lot } from "@/modules/manufacturing-management/lot-registry/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    // Check and auto-register "Lot Registry" in system_module table if missing
    try {
        const checkUrl = `${DIRECTUS_URL}/items/system_module?filter[module_name][_eq]=Lot%20Registry&limit=1`;
        const checkRes = await fetch(checkUrl, { headers, cache: "no-store" });
        if (checkRes.ok) {
            const checkData = await checkRes.json();
            if (!checkData.data || checkData.data.length === 0) {
                const maxOrderRes = await fetch(`${DIRECTUS_URL}/items/system_module?sort=-order&limit=1&fields=order`, { headers, cache: "no-store" });
                let nextOrder = 1;
                if (maxOrderRes.ok) {
                    const maxOrderData = await maxOrderRes.json();
                    if (maxOrderData.data && maxOrderData.data.length > 0 && maxOrderData.data[0].order) {
                        nextOrder = maxOrderData.data[0].order + 1;
                    }
                }

                await fetch(`${DIRECTUS_URL}/items/system_module`, {
                    method: "POST",
                    headers,
                    body: JSON.stringify({
                        module_name: "Lot Registry",
                        url: "/mm/inventory-warehousing/lot-registry",
                        order: nextOrder,
                        is_active: true
                    })
                });
            }
        }
    } catch (err) {
        console.error("[Auto-Registration] Failed to check/register Lot Registry module:", err);
    }

    // Main fetch
    try {
        const fields = "*";
        const timestamp = Date.now();
        const [res, usersRes, unitsRes, branchesRes] = await Promise.all([
            fetch(
                `${DIRECTUS_URL}/items/mm_lots?limit=-1&sort=-updated_at,-created_at,-lot_id&fields=${fields}&_t=${timestamp}`,
                { headers, cache: "no-store" }
            ),
            fetch(
                `${DIRECTUS_URL}/items/user?limit=-1&fields=user_id,user_fname,user_lname&_t=${timestamp}`,
                { headers, cache: "no-store" }
            ).catch(() => null),
            fetch(
                `${DIRECTUS_URL}/items/units?limit=-1&fields=unit_id,unit_name,unit_shortcut,sku_code&_t=${timestamp}`,
                { headers, cache: "no-store" }
            ).catch(() => null),
            fetch(
                `${DIRECTUS_URL}/items/branches?limit=-1&fields=id,branch_name,branch_code&_t=${timestamp}`,
                { headers, cache: "no-store" }
            ).catch(() => null)
        ]);

        if (!res.ok) {
            throw new Error(`Directus failed to fetch mm_lots: ${res.status}`);
        }

        const json = await res.json();
        const rawLots: Record<string, unknown>[] = json.data || [];

        let usersList: { user_id: number; user_fname?: string; user_lname?: string }[] = [];
        if (usersRes && usersRes.ok) {
            try {
                const usersJson = await usersRes.json();
                usersList = usersJson.data || [];
            } catch (err) {
                console.error("Error parsing users in GET lots:", err);
            }
        }

        let unitsList: { unit_id: number; unit_name?: string; unit_shortcut?: string }[] = [];
        if (unitsRes && unitsRes.ok) {
            try {
                const unitsJson = await unitsRes.json();
                unitsList = unitsJson.data || [];
            } catch (err) {
                console.error("Error parsing units in GET lots:", err);
            }
        }

        let branchesList: { id: number; branch_name?: string; branch_code?: string }[] = [];
        if (branchesRes && branchesRes.ok) {
            try {
                const bJson = await branchesRes.json();
                branchesList = bJson.data || [];
            } catch (err) {
                console.error("Error parsing branches in GET lots:", err);
            }
        }

        const mappedLots: Lot[] = rawLots.map((row) => {
            let uomId: number | null = null;
            let uomName = "";
            let uomShortcut = "";

            const rawUnit = row.unit_id !== undefined && row.unit_id !== null ? row.unit_id : row.uom_id;
            if (rawUnit && typeof rawUnit === "object") {
                const obj = rawUnit as { unit_id?: number; id?: number; unit_name?: string; unit_shortcut?: string };
                uomId = obj.unit_id ?? obj.id ?? null;
                uomName = obj.unit_name || "";
                uomShortcut = obj.unit_shortcut || obj.unit_name || "";
            } else if (rawUnit !== null && rawUnit !== undefined && rawUnit !== "") {
                const num = Number(rawUnit);
                if (!isNaN(num)) uomId = num;
            }

            if (uomId !== null) {
                const matchedUnit = unitsList.find((u) => Number((u as { unit_id?: number; id?: number }).unit_id ?? (u as { unit_id?: number; id?: number }).id) === Number(uomId));
                if (matchedUnit) {
                    uomName = matchedUnit.unit_name || uomName;
                    uomShortcut = matchedUnit.unit_shortcut || matchedUnit.unit_name || uomShortcut;
                }
            }

            let branchId: number | null = null;
            let branchName = "";
            let branchCode = "";
            if (row.branch_id !== undefined && row.branch_id !== null) {
                if (typeof row.branch_id === "object") {
                    const bObj = row.branch_id as { id?: number; branch_name?: string; branch_code?: string };
                    branchId = bObj.id ?? null;
                    branchName = bObj.branch_name || "";
                    branchCode = bObj.branch_code || "";
                } else {
                    const bNum = Number(row.branch_id);
                    if (!isNaN(bNum)) branchId = bNum;
                }
            }

            if (branchId !== null) {
                const matchedBranch = branchesList.find((b) => Number(b.id) === Number(branchId));
                if (matchedBranch) {
                    branchName = matchedBranch.branch_name || branchName;
                    branchCode = matchedBranch.branch_code || branchCode;
                }
            }

            let createdBy = "System";
            if (row.created_by) {
                const userObj = row.created_by as { user_id?: number } | number;
                const userIdNum = typeof userObj === "object" && userObj !== null
                    ? userObj.user_id
                    : Number(userObj);
                const matchedUser = usersList.find((u) => Number(u.user_id) === Number(userIdNum));
                if (matchedUser) {
                    createdBy = [matchedUser.user_fname, matchedUser.user_lname].filter(Boolean).join(" ") || `User #${userIdNum}`;
                } else {
                    createdBy = `User #${userIdNum}`;
                }
            }

            let updatedBy = "System";
            if (row.updated_by) {
                const userObj = row.updated_by as { user_id?: number } | number;
                const userIdNum = typeof userObj === "object" && userObj !== null
                    ? userObj.user_id
                    : Number(userObj);
                const matchedUser = usersList.find((u) => Number(u.user_id) === Number(userIdNum));
                if (matchedUser) {
                    updatedBy = [matchedUser.user_fname, matchedUser.user_lname].filter(Boolean).join(" ") || `User #${userIdNum}`;
                } else {
                    updatedBy = `User #${userIdNum}`;
                }
            }

            return {
                lotId: Number(row.lot_id),
                lotName: String(row.lot_name || ""),
                branchId,
                branchName,
                branchCode,
                uomId,
                uomName,
                uomShortcut,
                maxBatchCapacity: Number(row.max_batch_capacity || 0),
                createdAt: String(row.created_at || ""),
                updatedAt: String(row.updated_at || ""),
                createdBy,
                updatedBy
            };
        });

        return NextResponse.json(mappedLots);
    } catch (e) {
        console.error("API Error fetching lots:", e);
        return NextResponse.json(
            { error: (e as { message?: string }).message || "Failed to fetch lots" },
            { status: 500 }
        );
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { lot_name, max_batch_capacity } = body;
        const rawUnitId = body.unit_id !== undefined ? body.unit_id : body.uom_id;
        const rawBranchId = body.branch_id;

        if (!lot_name || typeof lot_name !== "string" || !lot_name.trim()) {
            return NextResponse.json(
                { error: "lot_name is required and must be a non-empty string" },
                { status: 400 }
            );
        }

        if (typeof max_batch_capacity !== "number" || max_batch_capacity <= 0) {
            return NextResponse.json(
                { error: "max_batch_capacity must be a positive number greater than 0" },
                { status: 400 }
            );
        }

        // Get logged in user ID from secure access token cookie
        let userId: number | null = null;
        try {
            const cookieStore = await cookies();
            const token = cookieStore.get("vos_access_token")?.value;
            if (token) {
                const parts = token.split(".");
                if (parts.length >= 2) {
                    const base64Url = parts[1];
                    let base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
                    while (base64.length % 4) base64 += "=";
                    const jsonPayload = Buffer.from(base64, "base64").toString("utf8");
                    const payload = JSON.parse(jsonPayload);
                    userId = payload?.id || payload?.user_id || payload?.sub || null;
                }
            }
        } catch (err) {
            console.error("Error parsing user token in POST lot route:", err);
        }

        // Check for duplicate lot name in mm_lots
        const duplicateCheckRes = await fetch(
            `${DIRECTUS_URL}/items/mm_lots?limit=-1&fields=lot_name,branch_id`,
            { headers, cache: "no-store" }
        );
        if (duplicateCheckRes.ok) {
            const duplicateJson = await duplicateCheckRes.json();
            const existingLots = duplicateJson.data || [];
            const isDuplicate = existingLots.some(
                (l: { lot_name?: string; branch_id?: number | { id: number } }) => {
                    const existingBranchId = typeof l.branch_id === "object" && l.branch_id !== null
                        ? l.branch_id.id
                        : l.branch_id;
                    const targetBranchId = rawBranchId ? Number(rawBranchId) : null;
                    const isSameBranch = !targetBranchId || !existingBranchId || Number(existingBranchId) === Number(targetBranchId);
                    return isSameBranch && l.lot_name?.trim().toLowerCase() === lot_name.trim().toLowerCase();
                }
            );
            if (isDuplicate) {
                return NextResponse.json(
                    { error: `A lot with the name "${lot_name.trim()}" already exists in this branch` },
                    { status: 409 }
                );
            }
        }

        const utcIsoString = new Date().toISOString();

        const postBody: Record<string, unknown> = {
            lot_name: lot_name.trim(),
            branch_id: rawBranchId ? Number(rawBranchId) : 1,
            unit_id: rawUnitId !== undefined && rawUnitId !== null && rawUnitId !== "" ? Number(rawUnitId) : 1,
            max_batch_capacity: Number(max_batch_capacity),
            status: body.status || "ACTIVE",
            created_by: userId ? Number(userId) : 24,
            updated_by: userId ? Number(userId) : 24,
            created_at: utcIsoString,
            updated_at: utcIsoString
        };

        const res = await fetch(`${DIRECTUS_URL}/items/mm_lots`, {
            method: "POST",
            headers,
            body: JSON.stringify(postBody)
        });

        if (!res.ok) {
            const errTxt = await res.text();
            let errMsg = `Directus mm_lots create failed: ${res.status}`;
            try {
                const errJson = JSON.parse(errTxt);
                if (errJson.errors && errJson.errors.length > 0) {
                    errMsg = errJson.errors[0].message || errMsg;
                }
            } catch {}
            return NextResponse.json({ error: errMsg }, { status: res.status });
        }

        const resJson = await res.json();
        const saved = resJson.data;

        return NextResponse.json({ success: true, data: saved });
    } catch (e) {
        console.error("API Error creating lot:", e);
        return NextResponse.json(
            { error: (e as { message?: string }).message || "Failed to create lot" },
            { status: 500 }
        );
    }
}
