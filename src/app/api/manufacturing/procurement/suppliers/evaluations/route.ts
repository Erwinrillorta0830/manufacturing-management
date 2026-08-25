import { NextResponse } from "next/server";
import { z } from "zod";
import {
    PURCHASE_ORDER_MODULE_PATHS,
    PurchaseOrderAuthorizationError,
    requirePurchaseOrderModuleAccess
} from "../../../purchase-orders/_auth";
import { procurementDirectusFetch } from "../../_directus";
import { calculateSupplierEvaluationScore } from "@/modules/manufacturing-management/procurement/supplier-evaluation";
import type { SupplierEvaluation } from "@/modules/manufacturing-management/procurement/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const positiveId = z.coerce.number().int().positive();
const evaluationInputSchema = z.object({
    supplier_id: positiveId,
    delivery_rating: z.coerce.number().int().min(1).max(5),
    quality_rating: z.coerce.number().int().min(1).max(5),
    price_rating: z.coerce.number().int().min(1).max(5),
    compliance_rating: z.coerce.number().int().min(1).max(5),
    feedback_notes: z.string().trim().max(2000)
});

const evaluationFields = [
    "id",
    "supplier_id",
    "delivery_rating",
    "quality_rating",
    "price_rating",
    "compliance_rating",
    "overall_score",
    "grade",
    "feedback_notes",
    "evaluated_at"
].join(",");

function numericValue(value: unknown): number {
    if (value && typeof value === "object" && "id" in value) {
        return Number((value as { id?: unknown }).id);
    }
    return Number(value);
}

function mapEvaluationRecord(record: unknown): SupplierEvaluation {
    const row = record as Record<string, unknown>;
    return {
        id: numericValue(row.id),
        supplier_id: numericValue(row.supplier_id),
        delivery_rating: Number(row.delivery_rating),
        quality_rating: Number(row.quality_rating),
        price_rating: Number(row.price_rating),
        compliance_rating: Number(row.compliance_rating),
        overall_score: Number(row.overall_score),
        grade: row.grade as SupplierEvaluation["grade"],
        feedback_notes: typeof row.feedback_notes === "string" ? row.feedback_notes : "",
        evaluated_at: typeof row.evaluated_at === "string" ? row.evaluated_at : ""
    };
}

async function directusData(response: Response, fallbackMessage: string): Promise<unknown> {
    const body = await response.json().catch(() => null) as { data?: unknown; errors?: Array<{ message?: unknown }> } | null;
    if (!response.ok) {
        const directusMessage = body?.errors?.[0]?.message;
        throw new Error(typeof directusMessage === "string" ? directusMessage : fallbackMessage);
    }
    return body?.data;
}

function errorResponse(error: unknown) {
    const message = error instanceof Error ? error.message : "Supplier evaluation request failed.";
    const status = error instanceof PurchaseOrderAuthorizationError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
}

export async function GET(request: Request) {
    try {
        await requirePurchaseOrderModuleAccess({ modulePath: PURCHASE_ORDER_MODULE_PATHS.suppliers });
        const supplierIdResult = positiveId.safeParse(new URL(request.url).searchParams.get("supplierId"));
        if (!supplierIdResult.success) {
            return NextResponse.json({ error: "supplierId must be a positive integer" }, { status: 400 });
        }

        const params = new URLSearchParams({
            "filter[supplier_id][_eq]": String(supplierIdResult.data),
            fields: evaluationFields,
            sort: "-evaluated_at,-id",
            limit: "1"
        });
        const response = await procurementDirectusFetch(`/items/supplier_evaluations?${params.toString()}`);
        const data = await directusData(response, "Failed to load supplier evaluations");
        const rows = Array.isArray(data) ? data : [];
        return NextResponse.json({ evaluation: rows[0] ? mapEvaluationRecord(rows[0]) : null });
    } catch (error) {
        return errorResponse(error);
    }
}

export async function POST(request: Request) {
    try {
        await requirePurchaseOrderModuleAccess({ modulePath: PURCHASE_ORDER_MODULE_PATHS.suppliers });
        const parsed = evaluationInputSchema.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json({ error: "Valid supplier evaluation ratings and notes are required.", details: parsed.error.flatten() }, { status: 400 });
        }

        const score = calculateSupplierEvaluationScore(parsed.data);
        const response = await procurementDirectusFetch("/items/supplier_evaluations", {
            method: "POST",
            body: JSON.stringify({
                ...parsed.data,
                ...score,
                evaluated_at: new Date().toISOString()
            })
        });
        const data = await directusData(response, "Failed to save supplier evaluation");
        return NextResponse.json({ evaluation: mapEvaluationRecord(data) }, { status: 201 });
    } catch (error) {
        return errorResponse(error);
    }
}
