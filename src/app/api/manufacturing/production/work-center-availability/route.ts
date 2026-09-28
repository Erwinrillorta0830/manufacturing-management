export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { authorizeJobOrderModuleAccess, JOB_ORDER_MODULE_PATHS } from "@/app/api/manufacturing/job-orders/_module-access";
import { fetchWorkCenterJobOrderAvailability } from "../_work-center-availability";

function positiveInteger(value: string | null): number | null {
    if (!value) return null;
    const id = Number(value);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function GET(request: Request) {
    const accessDenied = await authorizeJobOrderModuleAccess(JOB_ORDER_MODULE_PATHS.production);
    if (accessDenied) return accessDenied;

    const params = new URL(request.url).searchParams;
    const workCenterValue = params.get("workCenterId");
    const branchValue = params.get("branchId");
    const workCenterId = positiveInteger(workCenterValue);
    const branchId = positiveInteger(branchValue);
    if ((workCenterValue && !workCenterId) || (branchValue && !branchId)) {
        return NextResponse.json({ success: false, error: "Work center and branch IDs must be positive integers." }, { status: 400 });
    }

    try {
        const data = await fetchWorkCenterJobOrderAvailability({ workCenterId, branchId });
        return NextResponse.json({ success: true, data });
    } catch (error) {
        console.error("Error loading work-center availability:", error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : "Work-center availability lookup failed."
        }, { status: 500 });
    }
}
