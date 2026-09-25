export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { authorizeJobOrderModuleAccess, JOB_ORDER_MODULE_PATHS } from "@/app/api/manufacturing/job-orders/_module-access";
import { recordWipTopUp, WipTopUpError } from "../_wip-top-up-service";

export async function POST(request: Request) {
    const accessDenied = await authorizeJobOrderModuleAccess(JOB_ORDER_MODULE_PATHS.production);
    if (accessDenied) return accessDenied;
    try {
        return await recordWipTopUp(request);
    } catch (error) {
        if (error instanceof WipTopUpError) {
            return NextResponse.json({
                success: false,
                error: error.message,
                code: error.code,
                ...(error.details ? { details: error.details } : {})
            }, { status: error.status });
        }
        console.error("WIP top-up request failed:", error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : "Failed to add reserved materials.",
            code: "WIP_TOP_UP_FAILED"
        }, { status: 500 });
    }
}
