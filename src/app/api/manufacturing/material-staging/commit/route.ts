import { NextResponse } from "next/server";
import { z } from "zod";
import { commitAllocation, MaterialStagingAllocationError } from "../_allocation";
import { getMaterialStagingActorId } from "../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allocationLineSchema = z.object({
    allocation_line_id: z.string().min(1),
    jo_material_id: z.number().int().positive(),
    product_id: z.number().int().positive(),
    mm_lot_id: z.number().int().positive(),
    inventory_lot_id: z.number().int().positive(),
    lot_name: z.string().optional().default(""),
    batch_no: z.string().min(1),
    quantity: z.number().positive(),
    available_quantity: z.number().nonnegative().optional(),
    override_negative: z.boolean().optional().default(false)
});

const commitSchema = z.object({
    job_order_id: z.number().int().positive(),
    job_order_no: z.string().optional(),
    work_center_id: z.number().int().positive(),
    mode: z.enum(["auto", "manual"]),
    material_ids: z.array(z.number().int().positive()).optional(),
    lines: z.array(allocationLineSchema).optional(),
    source_bin: z.string().optional(),
    override_negative: z.boolean().optional().default(false),
    override_remarks: z.string().optional(),
    operation_id: z.string().min(1),
    preview_token: z.string().min(1),
    remarks: z.string().optional()
});

function errorResponse(error: unknown) {
    if (error instanceof MaterialStagingAllocationError) {
        return NextResponse.json({ success: false, error: error.message, failure_code: error.code, ...(error.details || {}) }, { status: error.status });
    }
    console.error("[Material Staging Commit API] Failed:", error);
    return NextResponse.json({ success: false, error: "Unable to commit material staging." }, { status: 500 });
}

export async function POST(request: Request) {
    try {
        const actorId = await getMaterialStagingActorId(request);
        if (!actorId) return NextResponse.json({ success: false, error: "An authenticated user is required to stage material.", failure_code: "AUTHENTICATION_REQUIRED" }, { status: 401 });
        const parsed = commitSchema.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json({ success: false, error: "Invalid material staging commit parameters.", details: parsed.error.flatten().fieldErrors }, { status: 400 });
        }
        const result = await commitAllocation(parsed.data, actorId);
        return NextResponse.json(result);
    } catch (error) {
        return errorResponse(error);
    }
}
