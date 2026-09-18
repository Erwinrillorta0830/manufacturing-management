import { NextRequest, NextResponse } from "next/server";
import { getScrapAndRejectionReportData, getScrapJobOrderDetail } from "@/modules/business-intelligence-and-analytics/inventory/scrap-and-rejection-analysis-report/services/scrap-rejection.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const drilldownJoId = searchParams.get("jobOrderId");

        // If drilldown detail requested
        if (drilldownJoId) {
            const joId = Number(drilldownJoId);
            const detail = await getScrapJobOrderDetail(joId);
            if (!detail) {
                return NextResponse.json({ error: "Job order scrap details not found" }, { status: 404 });
            }
            return NextResponse.json({ data: detail });
        }

        // Full report data
        const data = await getScrapAndRejectionReportData();
        return NextResponse.json(data);
    } catch (error: unknown) {
        console.error("[ScrapAndRejectionReport API Error]:", error);
        return NextResponse.json(
            { error: (error as Error).message || "Failed to fetch Scrap and Rejection Analysis Report data." },
            { status: 500 }
        );
    }
}
