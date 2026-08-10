import { NextResponse } from "next/server";
import { z } from "zod";
import {
    PURCHASE_ORDER_MODULE_PATHS,
    PurchaseOrderAuthorizationError,
    requirePurchaseOrderModuleAccess
} from "../../purchase-orders/_auth";
import {
    fetchProductQaSpecifications,
    PurchaseQaConfigurationError
} from "../_purchase-specifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
    productId: z.coerce.number().int().positive()
});

export async function GET(request: Request) {
    try {
        await requirePurchaseOrderModuleAccess({
            modulePaths: [PURCHASE_ORDER_MODULE_PATHS.receiving, PURCHASE_ORDER_MODULE_PATHS.rawMaterials]
        });
        const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams.entries()));
        if (!parsed.success) {
            return NextResponse.json({ error: "A valid productId is required." }, { status: 400 });
        }
        return NextResponse.json({ data: await fetchProductQaSpecifications(parsed.data.productId) });
    } catch (error) {
        const status = error instanceof PurchaseOrderAuthorizationError || error instanceof PurchaseQaConfigurationError
            ? error.status
            : 500;
        return NextResponse.json({ error: (error as Error).message || "Failed to load product QA specifications." }, { status });
    }
}
