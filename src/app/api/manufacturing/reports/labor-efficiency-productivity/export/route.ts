import { NextResponse } from "next/server";
import { authorizeLaborEfficiencyProductivityReport } from "../auth";
import { buildLaborEfficiencyReportPayload, ReportQueryError } from "../_report-builder";
import { getLaborEfficiencyFilterOptions } from "../_filter-options";
import {
    describeLaborEfficiencyFilters,
    generateLaborEfficiencyExcel,
    generateLaborEfficiencyPdf,
    laborEfficiencyExportFilename
} from "@/modules/manufacturing-management/labor-efficiency-productivity-report/utils/export-report";
import type { LaborEfficiencyFilters } from "@/modules/manufacturing-management/labor-efficiency-productivity-report/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    const access = await authorizeLaborEfficiencyProductivityReport();
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

    const format = new URL(request.url).searchParams.get("format");
    if (format !== "xlsx" && format !== "pdf") {
        return NextResponse.json({ error: "Export format must be xlsx or pdf." }, { status: 400 });
    }

    try {
        const payload = await buildLaborEfficiencyReportPayload(request, { includeAllRows: true });
        if (payload.rows.length === 0) return new Response(null, { status: 204, headers: { "X-Report-Row-Count": "0" } });
        const params = new URL(request.url).searchParams;
        const filters: LaborEfficiencyFilters = {
            branchId: params.get("branchId") || "all",
            productId: params.get("productId") || "all",
            status: params.get("status") || "all",
            dateFrom: params.get("dateFrom") || "",
            dateTo: params.get("dateTo") || "",
            jobOrder: (params.get("jobOrder") || "").trim()
        };
        const options = await getLaborEfficiencyFilterOptions();
        const description = describeLaborEfficiencyFilters(
            filters,
            options.branches,
            options.products
        );
        const file = format === "xlsx"
            ? generateLaborEfficiencyExcel(payload, description)
            : generateLaborEfficiencyPdf(payload, description);
        const contentType = format === "xlsx"
            ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            : "application/pdf";
        const body = new ArrayBuffer(file.byteLength);
        new Uint8Array(body).set(file);
        return new Response(body, {
            headers: {
                "Content-Type": contentType,
                "Content-Disposition": `attachment; filename="${laborEfficiencyExportFilename(format)}"`,
                "Content-Length": String(file.byteLength),
                "X-Report-Row-Count": String(payload.rows.length)
            }
        });
    } catch (error) {
        if (error instanceof ReportQueryError) return NextResponse.json({ error: error.message }, { status: 400 });
        console.error("[Labor Efficiency & Productivity Report] Failed to export report:", error);
        return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to export labor efficiency report." }, { status: 503 });
    }
}
