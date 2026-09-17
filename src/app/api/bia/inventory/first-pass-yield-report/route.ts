import { NextRequest, NextResponse } from "next/server";
import { getFPYReportData, getJobOrderFPYBreakdown } from "@/modules/business-intelligence-and-analytics/inventory/first-pass-yield-report/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const drilldownJoId = searchParams.get("jobOrderId");

        if (drilldownJoId) {
            const joId = Number(drilldownJoId);
            if (isNaN(joId) || joId <= 0) {
                return NextResponse.json(
                    { error: "Invalid Job Order ID provided" },
                    { status: 400 }
                );
            }

            const breakdown = await getJobOrderFPYBreakdown(joId);
            if (!breakdown) {
                return NextResponse.json(
                    { error: "Job Order not found or has no inspection records" },
                    { status: 404 }
                );
            }

            return NextResponse.json({ data: breakdown });
        }

        const reportData = await getFPYReportData();
        return NextResponse.json(reportData);
    } catch (error: any) {
        console.error("[API] First-Pass Yield Report Error:", error);
        return NextResponse.json(
            { error: error?.message || "Internal server error generating First-Pass Yield report" },
            { status: 500 }
        );
    }
}
