/* eslint-disable */
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { DIRECTUS_URL, headers, getISOStringInConfiguredTimezone } from "@/app/api/manufacturing/directus-api";

interface UserRecord {
    user_id: number;
    user_fname?: string;
    user_lname?: string;
}

// Helper to decode user ID from session cookie
async function getUserIdFromSession(): Promise<number> {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get("vos_access_token")?.value;
        if (token) {
            const parts = token.split(".");
            if (parts.length >= 2) {
                let base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
                while (base64.length % 4) base64 += "=";
                const jsonPayload = Buffer.from(base64, "base64").toString("utf8");
                const tokenPayload = JSON.parse(jsonPayload);
                const id = tokenPayload?.id || tokenPayload?.user_id || tokenPayload?.sub;
                if (id && !isNaN(Number(id))) return Number(id);
            }
        }
    } catch (err) {
        console.error("Error decoding session in station scan:", err);
    }
    return 24;
}

// GET: Fetch work centers, status history, and active stations
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const joId = searchParams.get("joId");
        const action = searchParams.get("action");

        // 1. Fetch status history for a specific Job Order
        if (action === "history" || joId) {
            let historyUrl = `${DIRECTUS_URL}/items/manufacturing_job_order_status_history?limit=100&sort=-changed_at`;
            if (joId) {
                historyUrl += `&filter[job_order_id][_eq]=${joId}`;
            }

            const [historyRes, usersRes, wcRes] = await Promise.all([
                fetch(historyUrl, { headers, cache: "no-store" }).catch(() => null),
                fetch(`${DIRECTUS_URL}/items/user?limit=-1&fields=user_id,user_fname,user_lname`, { headers, cache: "no-store" }).catch(() => null),
                fetch(`${DIRECTUS_URL}/items/manufacturing_work_centers?limit=-1&fields=work_center_id,work_center_name`, { headers, cache: "no-store" }).catch(() => null)
            ]);

            const historyList = historyRes && historyRes.ok ? (await historyRes.json()).data || [] : [];
            const users = usersRes && usersRes.ok ? (await usersRes.json()).data || [] : [];
            const workCenters = wcRes && wcRes.ok ? (await wcRes.json()).data || [] : [];

            const userMap = new Map<number, string>();
            users.forEach((u: any) => {
                const name = [u.user_fname, u.user_lname].filter(Boolean).join(" ") || `User #${u.user_id}`;
                userMap.set(Number(u.user_id), name);
            });

            const wcMap = new Map<number, string>();
            workCenters.forEach((wc: any) => {
                wcMap.set(Number(wc.work_center_id), wc.work_center_name);
            });

            const enrichedHistory = historyList.map((h: any) => ({
                ...h,
                changed_by_name: userMap.get(Number(h.changed_by)) || (h.changed_by ? `User #${h.changed_by}` : "System"),
                work_center_name: wcMap.get(Number(h.work_center_id)) || (h.work_center_id ? `Station #${h.work_center_id}` : "Unassigned")
            }));

            return NextResponse.json({ success: true, data: enrichedHistory });
        }

        // 2. Fetch all active work centers with barcodes
        const [wcRes, assetsRes] = await Promise.all([
            fetch(`${DIRECTUS_URL}/items/manufacturing_work_centers?limit=-1&sort=work_center_name&fields=*,asset_id.id,asset_id.item_image,asset_id.serial,asset_id.rfid_code,asset_id.barcode,asset_id.condition,asset_id.item_id.item_name,department_id.department_id,department_id.department_name`, { headers, cache: "no-store" }),
            fetch(`${DIRECTUS_URL}/items/assets?limit=-1&fields=id,barcode,rfid_code,serial,item_name`, { headers, cache: "no-store" }).catch(() => null)
        ]);

        if (!wcRes.ok) {
            throw new Error(`Failed to fetch work centers: ${wcRes.status}`);
        }

        const wcData = (await wcRes.json()).data || [];
        const mappedWorkCenters = wcData.map((wc: any) => {
            const asset = wc.asset_id && typeof wc.asset_id === "object" ? wc.asset_id : null;
            const barcode = asset?.barcode || asset?.rfid_code || asset?.serial || `WC-${String(wc.work_center_id).padStart(3, "0")}`;

            return {
                ...wc,
                barcode,
                rfid_code: asset?.rfid_code || null,
                serial: asset?.serial || null,
                is_active: wc.is_active === undefined || wc.is_active === null ? true : Boolean(Number(wc.is_active))
            };
        });

        return NextResponse.json({ success: true, data: mappedWorkCenters });
    } catch (e: any) {
        console.error("Error in station-scan GET API:", e);
        return NextResponse.json({ error: e.message || "Failed to handle station query" }, { status: 500 });
    }
}

// POST: Process Station Start Scan (Work Center Barcode + Job Order Batch Barcode)
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { workCenterBarcode, jobOrderBarcode, workCenterId, jobOrderId } = body;

        const currentUserId = await getUserIdFromSession();
        const manilaTimestamp = await getISOStringInConfiguredTimezone();

        // 1. Fetch All Work Centers to resolve work center
        const wcRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_work_centers?limit=-1&fields=*,asset_id.id,asset_id.barcode,asset_id.rfid_code,asset_id.serial,asset_id.item_name,department_id.department_name`, { headers, cache: "no-store" });
        if (!wcRes.ok) {
            throw new Error("Failed to load work centers from system");
        }
        const allWorkCenters = (await wcRes.json()).data || [];

        let matchedWorkCenter: any = null;

        if (workCenterId) {
            matchedWorkCenter = allWorkCenters.find((w: any) => Number(w.work_center_id) === Number(workCenterId));
        }

        if (!matchedWorkCenter && workCenterBarcode) {
            const rawCode = String(workCenterBarcode).trim().toUpperCase();
            matchedWorkCenter = allWorkCenters.find((w: any) => {
                const asset = w.asset_id && typeof w.asset_id === "object" ? w.asset_id : null;
                const assetBarcode = asset?.barcode ? String(asset.barcode).trim().toUpperCase() : "";
                const assetRfid = asset?.rfid_code ? String(asset.rfid_code).trim().toUpperCase() : "";
                const assetSerial = asset?.serial ? String(asset.serial).trim().toUpperCase() : "";
                const wcCode = `WC-${String(w.work_center_id).padStart(3, "0")}`.toUpperCase();
                const wcCodeShort = `WC-${w.work_center_id}`.toUpperCase();
                const wcName = String(w.work_center_name || "").trim().toUpperCase();
                const wcIdStr = String(w.work_center_id);

                return (
                    assetBarcode === rawCode ||
                    assetRfid === rawCode ||
                    assetSerial === rawCode ||
                    wcCode === rawCode ||
                    wcCodeShort === rawCode ||
                    wcName === rawCode ||
                    wcIdStr === rawCode
                );
            });
        }

        // 2. Fetch Job Orders to resolve Job Order
        const joFilterQuery = jobOrderId 
            ? `filter[job_order_id][_eq]=${jobOrderId}`
            : "";
        const joUrl = `${DIRECTUS_URL}/items/manufacturing_job_orders?limit=-1&sort=-job_order_id${joFilterQuery ? "&" + joFilterQuery : ""}`;
        const allJoRes = await fetch(joUrl, { headers, cache: "no-store" });
        if (!allJoRes.ok) {
            throw new Error("Failed to load job orders");
        }
        const allJos = (await allJoRes.json()).data || [];

        let matchedJobOrder: any = null;

        if (jobOrderId) {
            matchedJobOrder = allJos.find((j: any) => Number(j.job_order_id) === Number(jobOrderId));
        }

        if (!matchedJobOrder && jobOrderBarcode) {
            const rawJoCode = String(jobOrderBarcode).trim().toUpperCase();
            matchedJobOrder = allJos.find((j: any) => {
                const joNo = String(j.job_order_no || "").trim().toUpperCase();
                const joIdStr = String(j.job_order_id || "");
                const joBatchPattern = `JO-${joNo}`.toUpperCase();
                return joNo === rawJoCode || joIdStr === rawJoCode || joBatchPattern === rawJoCode || rawJoCode.includes(joNo);
            });
        }

        // If neither was matched, return specific error
        if (!matchedWorkCenter && workCenterBarcode) {
            return NextResponse.json({
                success: false,
                error: `Work Center not found for scanned barcode "${workCenterBarcode}". Please verify work center station code.`
            }, { status: 404 });
        }

        if (!matchedJobOrder && jobOrderBarcode) {
            return NextResponse.json({
                success: false,
                error: `Job Order not found for scanned barcode "${jobOrderBarcode}". Please verify batch code.`
            }, { status: 404 });
        }

        // If only looking up without both
        if (!matchedJobOrder) {
            return NextResponse.json({
                success: true,
                message: "Work Center station identified. Please scan Job Order Batch Barcode to start station.",
                workCenter: matchedWorkCenter
            });
        }

        if (!matchedWorkCenter) {
            return NextResponse.json({
                success: true,
                message: `Job Order ${matchedJobOrder.job_order_no} identified. Please scan Work Center station barcode.`,
                jobOrder: matchedJobOrder
            });
        }

        // 3. BOTH WORK CENTER & JOB ORDER MATCHED -> PROCESS STATION START TRANSITION
        const oldStatus = matchedJobOrder.status || "Draft";
        let statusTransitioned = false;
        const targetStatus = "In Progress";

        // Transition status if not already In Progress or Completed
        if (oldStatus !== "In Progress" && oldStatus !== "Ongoing" && oldStatus !== "Completed" && oldStatus !== "Finished") {
            const joPatchPayload: Record<string, any> = {
                status: targetStatus,
                primary_work_center_id: matchedWorkCenter.work_center_id,
                modified_by: currentUserId,
                modified_at: manilaTimestamp
            };

            const patchRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders/${matchedJobOrder.job_order_id}`, {
                method: "PATCH",
                headers,
                body: JSON.stringify(joPatchPayload)
            });

            if (!patchRes.ok) {
                console.error("Failed to patch Job Order status on station start:", await patchRes.text());
            } else {
                statusTransitioned = true;
                matchedJobOrder.status = targetStatus;
            }
        }

        // 4. Record entry in `manufacturing_job_order_status_history`
        let statusHistoryRecord: any = null;
        try {
            const historyPayload = {
                job_order_id: Number(matchedJobOrder.job_order_id),
                work_center_id: Number(matchedWorkCenter.work_center_id),
                previous_status: oldStatus,
                status: targetStatus,
                changed_by: currentUserId,
                changed_at: manilaTimestamp,
                remarks: `Station Start Scanner: Checked in at Work Center "${matchedWorkCenter.work_center_name}" (ID: ${matchedWorkCenter.work_center_id})`
            };

            const historyRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_status_history`, {
                method: "POST",
                headers,
                body: JSON.stringify(historyPayload)
            });

            if (historyRes.ok) {
                statusHistoryRecord = (await historyRes.json()).data;
            } else {
                console.warn("Directus insert into manufacturing_job_order_status_history returned:", historyRes.status);
            }
        } catch (histErr) {
            console.error("Error creating status history record:", histErr);
        }

        // 5. Match and start the Operation / Routing Step for this Work Center
        let activeOperation: any = null;
        try {
            // Fetch routing tasks for this Job Order
            const routesRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_routes?filter[job_order_id][_eq]=${matchedJobOrder.job_order_id}&sort=sequence_order&limit=-1`, { headers, cache: "no-store" });
            if (routesRes.ok) {
                const routes = (await routesRes.json()).data || [];
                
                // Find operation matched with this work center, or the first pending operation
                activeOperation = routes.find((r: any) => Number(r.work_center_id) === Number(matchedWorkCenter.work_center_id));
                if (!activeOperation) {
                    activeOperation = routes.find((r: any) => r.status === "Pending" || r.status === "Ongoing") || routes[0];
                }

                if (activeOperation && (activeOperation.status === "Pending" || !activeOperation.status)) {
                    await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_routes/${activeOperation.jo_route_id || activeOperation.id}`, {
                        method: "PATCH",
                        headers,
                        body: JSON.stringify({
                            status: "Ongoing",
                            work_center_id: matchedWorkCenter.work_center_id
                        })
                    }).catch(() => {});
                    activeOperation.status = "Ongoing";
                }
            }
        } catch (opErr) {
            console.error("Error updating operation step on station scan:", opErr);
        }

        return NextResponse.json({
            success: true,
            message: `Station Start Verified! Job Order ${matchedJobOrder.job_order_no} is now IN PROGRESS at workstation "${matchedWorkCenter.work_center_name}".`,
            workCenter: matchedWorkCenter,
            jobOrder: matchedJobOrder,
            activeOperation,
            statusTransitioned,
            statusHistoryRecord
        });
    } catch (e: any) {
        console.error("Error in station-scan POST API:", e);
        return NextResponse.json({ error: e.message || "Failed to process station scan" }, { status: 500 });
    }
}
