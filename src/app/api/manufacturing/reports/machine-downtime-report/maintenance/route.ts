import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeMachineDowntimeReport } from "../_auth";
import {
    closeMachineMaintenance,
    MachineDowntimeReportError,
    startMachineMaintenance
} from "../_service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const mutationSchema = z.discriminatedUnion("action", [
    z.object({
        action: z.literal("start"),
        assetId: z.number().int().positive(),
        jobOrderId: z.number().int().positive(),
        routeId: z.number().int().positive()
    }),
    z.object({
        action: z.literal("close"),
        assetId: z.number().int().positive(),
        restoredCondition: z.enum(["Good", "Bad", "Discontinued"]),
        resolutionNotes: z.string().max(2000).optional()
    })
]);

export async function POST(request: Request) {
    const authorization = await authorizeMachineDowntimeReport();
    if (authorization.response) return authorization.response;

    const parsed = mutationSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json(
            { success: false, error: "The maintenance action payload is invalid.", details: parsed.error.flatten() },
            { status: 400 }
        );
    }

    try {
        const data = parsed.data.action === "start"
            ? await startMachineMaintenance(parsed.data, authorization.userId)
            : await closeMachineMaintenance(parsed.data, authorization.userId);
        return NextResponse.json({ success: true, data });
    } catch (error) {
        const status = error instanceof MachineDowntimeReportError ? error.status : 500;
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : "Unable to save the maintenance action.",
            ...(error instanceof MachineDowntimeReportError ? { code: error.code } : {})
        }, { status });
    }
}
