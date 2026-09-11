import { NextResponse } from "next/server";
import { z } from "zod";
import { prepareAllocationPreview, MaterialStagingAllocationError } from "../_allocation";

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

const previewSchema = z.object({
    job_order_id: z.number().int().positive(),
    job_order_no: z.string().optional(),
    work_center_id: z.number().int().positive(),
    mode: z.enum(["auto", "manual"]),
    material_ids: z.array(z.number().int().positive()).optional(),
    lines: z.array(allocationLineSchema).optional(),
    source_bin: z.string().optional(),
    override_negative: z.boolean().optional().default(false),
    override_remarks: z.string().optional()
});

function errorResponse(error: unknown) {
    if (error instanceof MaterialStagingAllocationError) {
        return NextResponse.json({ success: false, error: error.message, failure_code: error.code, ...(error.details || {}) }, { status: error.status });
    }
    console.error("[Material Staging Allocation Preview API] Failed:", error);
    return NextResponse.json({ success: false, error: "Unable to generate the material allocation preview." }, { status: 500 });
}

export async function POST(request: Request) {
    try {
        const parsed = previewSchema.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json({ success: false, error: "Invalid material allocation preview parameters.", details: parsed.error.flatten().fieldErrors }, { status: 400 });
        }
        const prepared = await prepareAllocationPreview(parsed.data);
        return NextResponse.json(prepared.preview);
    } catch (error) {
        return errorResponse(error);
    }
}
