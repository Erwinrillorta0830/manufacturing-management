import { NextResponse } from "next/server";
import { authorizeLaborEfficiencyProductivityReport } from "./auth";
import { buildLaborEfficiencyReportPayload, ReportQueryError } from "./_report-builder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    const access = await authorizeLaborEfficiencyProductivityReport();
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

    try {
        return NextResponse.json({ data: await buildLaborEfficiencyReportPayload(request) });
    } catch (error) {
        if (error instanceof ReportQueryError) return NextResponse.json({ error: error.message }, { status: 400 });
        console.error("[Labor Efficiency & Productivity Report] Failed to load report data:", error);
        return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load labor efficiency report." }, { status: 503 });
    }
}
