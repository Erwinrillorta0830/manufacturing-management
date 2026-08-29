import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import { Lot } from "@/modules/manufacturing-management/lot-management/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const filterBranchId = searchParams.get("branch_id") ? Number(searchParams.get("branch_id")) : null;

    // Check and auto-register "Lot Management" in system_module table if missing
    try {
        const checkUrl = `${DIRECTUS_URL}/items/system_module?filter[module_name][_eq]=Lot%20Management&limit=1`;
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
                        module_name: "Lot Management",
                        url: "/manufacturing-management/lot-management",
                        order: nextOrder,
                        is_active: true
                    })
                });
            }
        }
    } catch (err) {
        console.error("[Auto-Registration] Failed to check/register Lot Management module:", err);
    }

    // Main fetch
    try {
        const fields = "*";
        const timestamp = Date.now();
        const [usersRes, unitsRes, branchesRes] = await Promise.all([
            fetch(
                `${DIRECTUS_URL}/items/user?limit=-1&fields=user_id,user_fname,user_lname&_t=${timestamp}`,
                { headers, cache: "no-store" }
            ).catch(() => null),
            fetch(
                `${DIRECTUS_URL}/items/units?limit=-1&fields=unit_id,unit_name,unit_shortcut,sku_code&_t=${timestamp}`,
                { headers, cache: "no-store" }
            ).catch(() => null),
            fetch(
                `${DIRECTUS_URL}/items/branches?limit=-1&fields=id,branch_name,branch_code,isActive,isBadStock,bad_stock_branch_id&_t=${timestamp}`,
                { headers, cache: "no-store" }
            ).catch(() => null)
        ]);

        const branchFilter = filterBranchId ? `&filter[branch_id][_eq]=${filterBranchId}` : "";
        const res = await fetch(
            `${DIRECTUS_URL}/items/mm_lots?limit=-1&sort=-updated_at,-created_at,-lot_id&fields=${fields}${branchFilter}&_t=${timestamp}`,
            { headers, cache: "no-store" }
        );

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

        let branchesList: { id: number; branch_name?: string; branch_code?: string; isBadStock?: number | boolean | string | null; bad_stock_branch_id?: number | null }[] = [];
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

            const rawBranch = row.branch_id;
            const branchIdNum = typeof rawBranch === "object" && rawBranch !== null
                ? Number((rawBranch as { id?: number; branch_id?: number }).id || (rawBranch as { id?: number; branch_id?: number }).branch_id || 0)
                : Number(rawBranch || 0);

            const matchedBranch = branchesList.find((b) => Number(b.id) === Number(branchIdNum));
            const isBadStockBranch = matchedBranch
                ? Number(matchedBranch.isBadStock) === 1 || matchedBranch.isBadStock === true || matchedBranch.isBadStock === "1"
                : false;
            const branchName = matchedBranch?.branch_name || (typeof row.branch_id === "object" && row.branch_id ? (row.branch_id as { branch_name?: string }).branch_name : "") || "";
            const branchCode = matchedBranch?.branch_code || (typeof row.branch_id === "object" && row.branch_id ? (row.branch_id as { branch_code?: string }).branch_code : "") || "";

            return {
                lotId: Number(row.lot_id),
                lotName: String(row.lot_name || ""),
                branchId: branchIdNum,
                branchName,
                branchCode,
                isBadStock: isBadStockBranch || Boolean(row.is_bad_stock),
                branchIsBadStock: isBadStockBranch,
                uomId,
                uomName,
                uomShortcut,
                maxBatchCapacity: Number(row.max_batch_capacity || 0),
                description: row.description ? String(row.description) : undefined,
                status: (row.status as "ACTIVE" | "CLOSED" | "INACTIVE") || "ACTIVE",
                createdAt: String(row.created_at || ""),
                updatedAt: String(row.updated_at || ""),
                createdBy,
                updatedBy
            };
        });

        const filteredLots = filterBranchId
            ? mappedLots.filter(l => Number(l.branchId) === Number(filterBranchId))
            : mappedLots;

        return NextResponse.json(filteredLots);
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

        // Resolve logged in user ID from token or fallback to active user in Directus
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

        // Fetch a valid user_id if token parsing didn't find one
        if (!userId) {
            try {
                const uRes = await fetch(`${DIRECTUS_URL}/items/user?limit=1&fields=user_id`, { headers, cache: "no-store" });
                if (uRes.ok) {
                    const uData = await uRes.json();
                    if (uData.data && uData.data.length > 0) {
                        userId = Number(uData.data[0].user_id);
                    }
                }
            } catch (err) {
                console.error("Error resolving fallback user_id:", err);
            }
        }

        // Check for duplicate lot name in mm_lots
        const duplicateCheckRes = await fetch(
            `${DIRECTUS_URL}/items/mm_lots?limit=-1&fields=lot_name`,
            { headers, cache: "no-store" }
        ).catch(() => null);

        if (duplicateCheckRes && duplicateCheckRes.ok) {
            const duplicateJson = await duplicateCheckRes.json();
            const existingLots = duplicateJson.data || [];
            const isDuplicate = existingLots.some(
                (l: { lot_name?: string }) =>
                    l.lot_name?.trim().toLowerCase() === lot_name.trim().toLowerCase()
            );
            if (isDuplicate) {
                return NextResponse.json(
                    { error: `A lot with the name "${lot_name.trim()}" already exists` },
                    { status: 409 }
                );
            }
        }

        const postBody: Record<string, unknown> = {
            lot_name: lot_name.trim(),
            branch_id: body.branch_id ? Number(body.branch_id) : 1,
            unit_id: rawUnitId !== undefined && rawUnitId !== null && rawUnitId !== "" ? Number(rawUnitId) : 1,
            max_batch_capacity: Number(max_batch_capacity),
            status: body.status || "ACTIVE",
            created_by: userId ? Number(userId) : 1
        };

        if (body.description) postBody.description = String(body.description).trim();

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
        return NextResponse.json({ success: true, data: resJson.data });
    } catch (e) {
        console.error("API Error creating lot:", e);
        return NextResponse.json(
            { error: (e as { message?: string }).message || "Failed to create lot" },
            { status: 500 }
        );
    }
}
