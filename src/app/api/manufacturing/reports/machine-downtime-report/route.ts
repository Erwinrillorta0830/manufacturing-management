import { NextResponse } from "next/server";
import { authorizeMachineDowntimeReport } from "./_auth";
import { loadMachineDowntimeReport, MachineDowntimeReportError } from "./_service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    const authorization = await authorizeMachineDowntimeReport();
    if (authorization.response) return authorization.response;

    try {
        return NextResponse.json({ success: true, data: await loadMachineDowntimeReport() });
    } catch (error) {
        const status = error instanceof MachineDowntimeReportError ? error.status : 500;
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : "Unable to load the Machine Downtime Report.",
            ...(error instanceof MachineDowntimeReportError ? { code: error.code } : {})
        }, { status });
    }
}
