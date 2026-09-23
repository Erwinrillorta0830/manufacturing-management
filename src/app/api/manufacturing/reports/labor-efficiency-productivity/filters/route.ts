import { NextResponse } from "next/server";
import { authorizeLaborEfficiencyProductivityReport } from "../auth";
import { getLaborEfficiencyFilterOptions } from "../_filter-options";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    const access = await authorizeLaborEfficiencyProductivityReport();
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
    try {
        const data = await getLaborEfficiencyFilterOptions();
        return NextResponse.json({ data });
    } catch (error) {
        console.error("[Labor Efficiency & Productivity Report] Failed to load filter options:", error);
        return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load report filter options." }, { status: 503 });
    }
}
