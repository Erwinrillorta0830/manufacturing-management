import {
    JobOrderProfitabilityRow,
    ProfitabilitySummaryKPIs,
    JobOrderCostBreakdown
} from "../types";

export class JobOrderProfitabilityService {
    /**
     * Fetch all relevant records and aggregate costs and profitability per Job Order
     */
    static async fetchProfitabilityReport(): Promise<{
        rows: JobOrderProfitabilityRow[];
        summary: ProfitabilitySummaryKPIs;
    }> {
        try {
            const res = await fetch("/api/bia/costing/job-and-work-order-profitability-report", {
                method: "GET",
                headers: { "Content-Type": "application/json" },
                cache: "no-store"
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({ error: res.statusText }));
                throw new Error(errorData.error || `Failed to fetch Job Order Profitability Report (${res.status})`);
            }

            return await res.json();
        } catch (error) {
            console.error("[JobOrderProfitabilityService] fetch error:", error);
            throw error;
        }
    }

    /**
     * Compute aggregate metrics across rows
     */
    static computeSummary(rows: JobOrderProfitabilityRow[]): ProfitabilitySummaryKPIs {
        const total_jobs = rows.length;
        const total_revenue = Math.round(rows.reduce((sum, r) => sum + r.total_revenue, 0) * 100) / 100;
        const total_cogs = Math.round(rows.reduce((sum, r) => sum + r.total_cogs, 0) * 100) / 100;
        const total_materials_cost = Math.round(rows.reduce((sum, r) => sum + r.direct_materials_cost, 0) * 100) / 100;
        const total_labor_cost = Math.round(rows.reduce((sum, r) => sum + r.direct_labor_cost, 0) * 100) / 100;
        const total_overhead_cost = Math.round(rows.reduce((sum, r) => sum + r.overhead_cost, 0) * 100) / 100;
        const total_gross_profit = Math.round((total_revenue - total_cogs) * 100) / 100;
        const average_gross_margin_percent = total_revenue > 0
            ? Math.round((total_gross_profit / total_revenue) * 1000) / 10
            : 0;
        const profitable_jobs_count = rows.filter(r => r.gross_profit >= 0).length;
        const loss_jobs_count = rows.filter(r => r.gross_profit < 0).length;

        return {
            total_jobs,
            total_revenue,
            total_cogs,
            total_materials_cost,
            total_labor_cost,
            total_overhead_cost,
            total_gross_profit,
            average_gross_margin_percent,
            profitable_jobs_count,
            loss_jobs_count
        };
    }

    /**
     * Fetch drilldown cost breakdown details for a single Job Order
     */
    static async fetchJobOrderCostBreakdown(jobOrderId: number): Promise<JobOrderCostBreakdown | null> {
        try {
            const res = await fetch(`/api/bia/costing/job-and-work-order-profitability-report?jobOrderId=${jobOrderId}`, {
                method: "GET",
                headers: { "Content-Type": "application/json" },
                cache: "no-store"
            });

            if (!res.ok) {
                return null;
            }

            const json = await res.json();
            return json.data || null;
        } catch (err) {
            console.error("[JobOrderProfitabilityService] fetchJobOrderCostBreakdown error:", err);
            return null;
        }
    }
}
