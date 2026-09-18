import { NextRequest, NextResponse } from "next/server";
import { ContributionMarginService } from "@/modules/business-intelligence-and-analytics/sales/contribution-margin-report/services/contribution-margin.service";
import { ContributionMarginFilterSchema } from "@/modules/business-intelligence-and-analytics/sales/contribution-margin-report/types/contribution-margin.schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const drilldownProductId = searchParams.get("drilldownProductId");

        // If drilldown details requested for a single product
        if (drilldownProductId) {
            const pId = Number(drilldownProductId);
            if (isNaN(pId) || pId <= 0) {
                return NextResponse.json({ error: "Invalid product ID for drilldown" }, { status: 400 });
            }

            const breakdown = await ContributionMarginService.fetchProductCostBreakdown(pId);
            if (!breakdown) {
                return NextResponse.json({ error: "Product cost breakdown not found" }, { status: 404 });
            }

            return NextResponse.json({ data: breakdown });
        }

        // Parse and validate query filters
        const rawFilters = {
            searchQuery: searchParams.get("searchQuery") || "",
            startDate: searchParams.get("startDate") || "",
            endDate: searchParams.get("endDate") || "",
            categoryId: searchParams.get("categoryId") || "ALL",
            brandId: searchParams.get("brandId") || "ALL",
            marginStatus: searchParams.get("marginStatus") || "ALL"
        };

        const validatedFilters = ContributionMarginFilterSchema.parse(rawFilters);
        const report = await ContributionMarginService.generateReport(validatedFilters);

        return NextResponse.json(report);
    } catch (error) {
        console.error("[ContributionMargin API Error]:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed to generate Contribution Margin Report" },
            { status: 500 }
        );
    }
}
