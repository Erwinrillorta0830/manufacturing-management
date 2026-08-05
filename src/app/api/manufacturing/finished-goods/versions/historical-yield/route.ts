import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const productIdParam = searchParams.get("productId");
        if (!productIdParam) {
            return NextResponse.json({ error: "Missing required parameter: productId" }, { status: 400 });
        }
        const productId = Number(productIdParam);

        // Fetch completed job orders for this product
        const filter = encodeURIComponent(JSON.stringify({
            _and: [
                { product_id: { _eq: productId } },
                {
                    _or: [
                        { status: { _eq: "Finished" } },
                        { status: { _eq: "Completed font" } },
                        { status: { _eq: "Done" } }
                    ]
                }
            ]
        }));

        const resJO = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders?filter=${filter}&limit=-1`, { headers, cache: "no-store" }).catch(() => null);
        const jobOrders = (resJO && resJO.ok) ? (await resJO.json()).data || [] : [];

        let totalTarget = 0;
        let totalActual = 0;
        let validJobsCount = 0;

        jobOrders.forEach((jo: Record<string, unknown>) => {
            const target = Number(jo.target_quantity || jo.quantity || 0);
            const actual = Number(jo.actual_output_quantity || jo.actual_quantity || jo.completed_quantity || 0);
            if (target > 0 && actual >= 0) {
                totalTarget += target;
                totalActual += actual;
                validJobsCount++;
            }
        });

        // Also check yield ledger if available
        const ledgerRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_yield_ledger?limit=-1`, { headers, cache: "no-store" }).catch(() => null);
        const ledgerData = (ledgerRes && ledgerRes.ok) ? (await ledgerRes.json()).data || [] : [];
        const prodLedger = ledgerData.filter((l: Record<string, unknown>) => {
            const joObj = l.job_order_id as Record<string, unknown> | undefined;
            return Number(l.product_id || joObj?.product_id) === productId;
        });

        if (prodLedger.length > 0 && validJobsCount === 0) {
            prodLedger.forEach((l: Record<string, unknown>) => {
                const target = Number(l.target_qty || l.planned_quantity || 100);
                const actual = Number(l.actual_qty || l.yield_quantity || 0);
                if (target > 0 && actual >= 0) {
                    totalTarget += target;
                    totalActual += actual;
                    validJobsCount++;
                }
            });
        }

        const averageYield = totalTarget > 0 ? (totalActual / totalTarget) * 100 : 98.5;
        const roundedAverageYield = Math.min(100, Math.max(1, Math.round(averageYield * 10) / 10));

        return NextResponse.json({
            productId,
            totalJobsAnalyzed: validJobsCount,
            totalTargetQuantity: totalTarget,
            totalActualQuantity: totalActual,
            averageActualYield: roundedAverageYield,
            recommendedScrapRate: Math.max(0, Math.round((100 - roundedAverageYield) * 10) / 10)
        });
    } catch (e) {
        console.error("API Error calculating historical yield:", e);
        return NextResponse.json({ error: "Failed to calculate historical yield" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { versionId, expectedYieldPercentage } = body || {};

        if (!versionId || !expectedYieldPercentage) {
            return NextResponse.json({ error: "Missing versionId or expectedYieldPercentage" }, { status: 400 });
        }

        const yieldVal = Math.min(100, Math.max(1, Number(expectedYieldPercentage)));

        const res = await fetch(`${DIRECTUS_URL}/items/product_manufacturing_version/${versionId}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify({
                expected_yield_percentage: yieldVal
            })
        });

        if (!res.ok) {
            throw new Error(`Directus version yield update failed: ${res.status}`);
        }

        return NextResponse.json({
            success: true,
            versionId: Number(versionId),
            expectedYieldPercentage: yieldVal
        });
    } catch (e) {
        console.error("API Error updating version yield:", e);
        return NextResponse.json({ error: (e as Error).message || "Failed to update version yield" }, { status: 500 });
    }
}
