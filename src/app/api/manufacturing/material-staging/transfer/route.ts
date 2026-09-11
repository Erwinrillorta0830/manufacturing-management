import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Retained only as an explicit migration boundary. The old endpoint created
 * two inventory movements for one staging action and must not accept new
 * payloads.
 */
export async function POST() {
    return NextResponse.json(
        {
            success: false,
            error: "The material staging transfer endpoint has been retired. Generate an allocation preview and commit it through the canonical staging workflow.",
            failure_code: "MATERIAL_STAGING_ENDPOINT_RETIRED"
        },
        { status: 410 }
    );
}
