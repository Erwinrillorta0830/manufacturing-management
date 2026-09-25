import { NextResponse } from "next/server";
import { deleteJobOrder } from "../planning-helper";
import { fetchJobOrder } from "../../production/_material-return";
import { isJobOrderStatus, JOB_ORDER_STATUS } from "@/modules/manufacturing-management/job-order-status";
import { authorizeJobOrderModuleAccess, JOB_ORDER_MODULE_PATHS } from "@/app/api/manufacturing/job-orders/_module-access";

export async function handleDELETE(request: Request) {
    const accessDenied = await authorizeJobOrderModuleAccess(JOB_ORDER_MODULE_PATHS.planning);
    if (accessDenied) return accessDenied;
    try {
        const { searchParams } = new URL(request.url);
        const joId = searchParams.get("joId");

        if (!joId) {
            return NextResponse.json({ error: "Missing joId parameter" }, { status: 400 });
        }

        const current = await fetchJobOrder(joId);
        if (!isJobOrderStatus(current.status, JOB_ORDER_STATUS.DRAFT)) {
            return NextResponse.json({
                error: "Only Draft Job Orders can be deleted. Use the workflow cancel action for an initialized Job Order.",
                code: "JOB_ORDER_DELETE_REQUIRES_DRAFT"
            }, { status: 409 });
        }

        const success = await deleteJobOrder(joId);
        return NextResponse.json({ success });
    } catch (e) {
        console.error("API Error in planning-engineering DELETE:", e);
        return NextResponse.json({ error: (e as { message?: string }).message || "Failed to delete Job Order" }, { status: 500 });
    }
}
