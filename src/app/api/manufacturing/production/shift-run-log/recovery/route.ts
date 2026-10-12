import { NextResponse } from "next/server";
import { authorizeJobOrderModuleAccess, JOB_ORDER_MODULE_PATHS } from "@/app/api/manufacturing/job-orders/_module-access";
import {
    listRecoverableShiftRunSessions,
    resumePendingShiftRunSession
} from "../../_shift-run-session-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function positiveId(value: unknown): number | null {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function GET(request: Request) {
    const accessDenied = await authorizeJobOrderModuleAccess(JOB_ORDER_MODULE_PATHS.production);
    if (accessDenied) return accessDenied;

    const { searchParams } = new URL(request.url);
    const jobOrderId = positiveId(searchParams.get("jobOrderId"));
    if (!jobOrderId) {
        return NextResponse.json({ error: "A valid Job Order ID is required." }, { status: 400 });
    }

    try {
        const sessions = await listRecoverableShiftRunSessions(jobOrderId);
        return NextResponse.json({ sessions });
    } catch (error) {
        console.error(`Unable to load pending production sessions for Job Order ${jobOrderId}:`, error);
        return NextResponse.json({ error: "Unable to load pending shift sessions." }, { status: 502 });
    }
}

export async function POST(request: Request) {
    const accessDenied = await authorizeJobOrderModuleAccess(JOB_ORDER_MODULE_PATHS.production);
    if (accessDenied) return accessDenied;

    let body: Record<string, unknown>;
    try {
        const parsed = await request.json();
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            return NextResponse.json({ error: "A recovery request body is required." }, { status: 400 });
        }
        body = parsed as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "The recovery request body is invalid." }, { status: 400 });
    }

    const jobOrderId = positiveId(body.jobOrderId);
    const sessionKey = typeof body.sessionKey === "string" ? body.sessionKey.trim() : "";
    if (!jobOrderId || !sessionKey) {
        return NextResponse.json({ error: "A valid Job Order ID and session key are required." }, { status: 400 });
    }

    return resumePendingShiftRunSession(jobOrderId, sessionKey);
}
