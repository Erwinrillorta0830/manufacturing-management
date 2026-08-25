import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import { Batch, BatchStatus, BatchQaStatus } from "@/modules/manufacturing-management/lot-management/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const filterLotId = searchParams.get("lotId");
        const timestamp = Date.now();

        let mmUrl = `${DIRECTUS_URL}/items/mm_inventory_lots?limit=-1&sort=-updated_at,-created_at,-inventory_lot_id&_t=${timestamp}`;
        if (filterLotId) {
            mmUrl += `&filter[lot_id][_eq]=${filterLotId}`;
        }

        const [batchesRes, lotsRes, usersRes, unitsRes, productsRes] = await Promise.all([
            fetch(mmUrl, { headers, cache: "no-store" }),
            fetch(`${DIRECTUS_URL}/items/mm_lots?limit=-1&_t=${timestamp}`, { headers, cache: "no-store" }).catch(() => null),
            fetch(`${DIRECTUS_URL}/items/user?limit=-1&fields=user_id,user_fname,user_lname&_t=${timestamp}`, { headers, cache: "no-store" }).catch(() => null),
            fetch(`${DIRECTUS_URL}/items/units?limit=-1&fields=unit_id,unit_name,unit_shortcut&_t=${timestamp}`, { headers, cache: "no-store" }).catch(() => null),
            fetch(`${DIRECTUS_URL}/items/products?limit=-1&_t=${timestamp}`, { headers, cache: "no-store" }).catch(() => null)
        ]);

        let rawBatches: Record<string, unknown>[] = [];
        if (batchesRes && batchesRes.ok) {
            const json = await batchesRes.json();
            rawBatches = json.data || [];
        }

        let lotsList: { lot_id: number; lot_name: string; unit_id?: number }[] = [];
        if (lotsRes && lotsRes.ok) {
            try {
                const lotsJson = await lotsRes.json();
                lotsList = lotsJson.data || [];
            } catch (err) {
                console.error("Error parsing lots in GET batches:", err);
            }
        }

        let usersList: { user_id: number; user_fname?: string; user_lname?: string }[] = [];
        if (usersRes && usersRes.ok) {
            try {
                const usersJson = await usersRes.json();
                usersList = usersJson.data || [];
            } catch (err) {
                console.error("Error parsing users in GET batches:", err);
            }
        }

        let unitsList: { unit_id: number; unit_name?: string; unit_shortcut?: string }[] = [];
        if (unitsRes && unitsRes.ok) {
            try {
                const unitsJson = await unitsRes.json();
                unitsList = unitsJson.data || [];
            } catch (err) {
                console.error("Error parsing units in GET batches:", err);
            }
        }

        let productsList: { product_id: number; product_name?: string; sku_code?: string; product_code?: string }[] = [];
        if (productsRes && productsRes.ok) {
            try {
                const prodJson = await productsRes.json();
                const rawProds = prodJson.data || [];
                productsList = rawProds.map((p: Record<string, unknown>) => ({
                    product_id: Number(p.product_id ?? p.id ?? 0),
                    product_name: String(p.product_name || p.name || p.title || ""),
                    sku_code: String(p.sku_code || p.product_code || p.code || p.sku || "")
                }));
            } catch (err) {
                console.error("Error parsing products in GET batches:", err);
            }
        }

        const mappedBatches: Batch[] = rawBatches.map((row) => {
            const batchId = Number(row.inventory_lot_id ?? 0);
            const batchNumber = String(row.batch_no || "");

            let lotId = 0;
            let lotName = "Unassigned Storage Lot";
            if (row.lot_id) {
                if (typeof row.lot_id === "object" && row.lot_id !== null) {
                    const lotObj = row.lot_id as { lot_id?: number; lot_name?: string };
                    lotId = Number(lotObj.lot_id || 0);
                    lotName = lotObj.lot_name || `Lot #${lotId}`;
                } else {
                    lotId = Number(row.lot_id);
                    const matched = lotsList.find((l) => Number(l.lot_id) === lotId);
                    if (matched) lotName = matched.lot_name;
                }
            }

            let productId = 0;
            let productName = "";
            let itemCode = String(row.item_code || "");
            if (row.product_id) {
                if (typeof row.product_id === "object" && row.product_id !== null) {
                    const pObj = row.product_id as Record<string, unknown>;
                    productId = Number(pObj.product_id ?? pObj.id ?? 0);
                    productName = String(pObj.product_name || pObj.name || pObj.title || "");
                    itemCode = itemCode || String(pObj.sku_code || pObj.product_code || pObj.code || pObj.sku || "");
                } else {
                    productId = Number(row.product_id);
                    const matchedP = productsList.find((p) => Number(p.product_id) === productId);
                    if (matchedP) {
                        productName = matchedP.product_name || "";
                        itemCode = itemCode || matchedP.sku_code || matchedP.product_code || "";
                    }
                }
            }

            if (!productName && productId > 0) {
                productName = `Product #${productId}`;
            }
            if (!itemCode && productId > 0) {
                itemCode = `PROD-${productId}`;
            }

            let uomId: number | null = null;
            let uomName = "";
            let uomShortcut = "";
            const rawUnit = row.uom_id ?? row.unit_id;
            if (rawUnit && typeof rawUnit === "object") {
                const uObj = rawUnit as { unit_id?: number; unit_name?: string; unit_shortcut?: string };
                uomId = uObj.unit_id ?? null;
                uomName = uObj.unit_name || "";
                uomShortcut = uObj.unit_shortcut || uObj.unit_name || "";
            } else if (rawUnit !== null && rawUnit !== undefined) {
                uomId = Number(rawUnit);
            }

            if (uomId !== null) {
                const matchedUnit = unitsList.find((u) => Number(u.unit_id) === Number(uomId));
                if (matchedUnit) {
                    uomName = matchedUnit.unit_name || uomName;
                    uomShortcut = matchedUnit.unit_shortcut || matchedUnit.unit_name || uomShortcut;
                }
            }

            let createdBy = "System";
            if (row.created_by) {
                const uObj = row.created_by as { user_id?: number } | number;
                const uid = typeof uObj === "object" && uObj !== null ? uObj.user_id : Number(uObj);
                const matched = usersList.find((u) => Number(u.user_id) === Number(uid));
                if (matched) {
                    createdBy = [matched.user_fname, matched.user_lname].filter(Boolean).join(" ") || `User #${uid}`;
                } else if (uid) {
                    createdBy = `User #${uid}`;
                }
            }

            let updatedBy = "System";
            if (row.updated_by) {
                const uObj = row.updated_by as { user_id?: number } | number;
                const uid = typeof uObj === "object" && uObj !== null ? uObj.user_id : Number(uObj);
                const matched = usersList.find((u) => Number(u.user_id) === Number(uid));
                if (matched) {
                    updatedBy = [matched.user_fname, matched.user_lname].filter(Boolean).join(" ") || `User #${uid}`;
                } else if (uid) {
                    updatedBy = `User #${uid}`;
                }
            }

            const rawQa = String(row.qa_status || "GOOD").toUpperCase();
            let qaStatus: BatchQaStatus = "GOOD";
            if (["GOOD", "DAMAGED", "QUARANTINED", "EXPIRED"].includes(rawQa)) {
                qaStatus = rawQa as BatchQaStatus;
            }

            const rawStatus = String(row.status || "ACTIVE").toUpperCase();
            let status: BatchStatus = "ACTIVE";
            if (["ACTIVE", "CLOSED", "INACTIVE"].includes(rawStatus)) {
                status = rawStatus as BatchStatus;
            }

            const quantity = Number(row.quantity ?? 1);
            const unitCost = Number(row.unit_cost ?? 0);
            const manufacturingDate = String(row.manufacturing_date || "");
            const expirationDate = String(row.expiry_date || "");

            return {
                batchId,
                batchNumber,
                lotId,
                lotName,
                branchId: Number(row.branch_id || 1),
                productId,
                productName,
                itemCode,
                quantity,
                unitCost,
                uomId,
                uomName,
                uomShortcut,
                manufacturingDate,
                expirationDate,
                qaStatus,
                status,
                sourceType: row.source_type ? String(row.source_type) : undefined,
                sourceReference: row.source_reference ? String(row.source_reference) : undefined,
                remarks: String(row.remarks || ""),
                createdAt: String(row.created_at || ""),
                updatedAt: String(row.updated_at || ""),
                createdBy,
                updatedBy
            };
        });

        return NextResponse.json(mappedBatches);
    } catch (e) {
        console.error("API Error fetching batches:", e);
        return NextResponse.json(
            { error: (e as { message?: string }).message || "Failed to fetch batches" },
            { status: 500 }
        );
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const {
            batch_no,
            batch_number,
            lot_id,
            branch_id,
            product_id,
            manufacturing_date,
            expiry_date,
            expiration_date,
            unit_cost,
            qa_status,
            status,
            source_type,
            source_reference,
            remarks
        } = body;

        const finalBatchNo = (batch_no || batch_number || "").trim();
        if (!finalBatchNo) {
            return NextResponse.json(
                { error: "batch_no is required" },
                { status: 400 }
            );
        }

        if (!lot_id || isNaN(Number(lot_id))) {
            return NextResponse.json(
                { error: "A valid Storage Lot selection (lot_id) is required" },
                { status: 400 }
            );
        }

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
            console.error("Error parsing user token in POST batch route:", err);
        }

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
                console.error("Error resolving fallback user_id in batch route:", err);
            }
        }

        const postBody: Record<string, unknown> = {
            lot_id: Number(lot_id),
            branch_id: Number(branch_id || 1),
            product_id: Number(product_id || 1),
            batch_no: finalBatchNo,
            manufacturing_date: manufacturing_date || null,
            expiry_date: expiry_date || expiration_date || null,
            unit_cost: unit_cost ? Number(unit_cost) : 0.0,
            qa_status: qa_status ? String(qa_status).toUpperCase() : "GOOD",
            status: status ? String(status).toUpperCase() : "ACTIVE",
            source_type: source_type ? String(source_type).trim() : null,
            source_reference: source_reference ? String(source_reference).trim() : null,
            remarks: remarks ? String(remarks).trim() : null,
            created_by: userId ? Number(userId) : 1
        };

        const res = await fetch(`${DIRECTUS_URL}/items/mm_inventory_lots`, {
            method: "POST",
            headers,
            body: JSON.stringify(postBody)
        });

        if (!res.ok) {
            const errTxt = await res.text();
            let errMsg = `Directus mm_inventory_lots create failed: ${res.status}`;
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
        console.error("API Error registering inventory lot batch:", e);
        return NextResponse.json(
            { error: (e as { message?: string }).message || "Failed to register batch" },
            { status: 500 }
        );
    }
}
