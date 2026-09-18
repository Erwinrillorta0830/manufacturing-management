import {
    ContributionMarginRow,
    CategoryLineSummary,
    BrandLineSummary,
    ContributionMarginSummaryKPIs,
    MarginStatus
} from "../types/contribution-margin.types";

/**
 * Pure calculation helpers for Contribution Margin analysis
 */
export function resolveMarginStatus(marginPercent: number): MarginStatus {
    if (marginPercent < 0) return "negative";
    if (marginPercent < 15) return "low";
    if (marginPercent < 30) return "moderate";
    if (marginPercent < 50) return "healthy";
    return "high";
}

export function round(value: number, decimals: number = 2): number {
    const factor = Math.pow(10, decimals);
    return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * Compute aggregate summary KPIs across all SKU rows
 */
export function computeSummaryKPIs(
    rows: ContributionMarginRow[],
    categorySummaries: CategoryLineSummary[],
    brandSummaries: BrandLineSummary[]
): ContributionMarginSummaryKPIs {
    const total_skus = rows.length;
    const total_units_sold = round(rows.reduce((sum, r) => sum + r.invoiced_quantity, 0));
    const total_net_sales = round(rows.reduce((sum, r) => sum + r.net_sales_revenue, 0));
    const total_manufacturing_cost = round(rows.reduce((sum, r) => sum + r.total_manufacturing_cost, 0));
    const total_contribution_margin = round(total_net_sales - total_manufacturing_cost);
    const overall_contribution_margin_ratio = total_net_sales > 0
        ? round((total_contribution_margin / total_net_sales) * 100, 1)
        : 0;

    const profitable_skus_count = rows.filter(r => r.contribution_margin_amount >= 0).length;
    const loss_skus_count = rows.filter(r => r.contribution_margin_amount < 0).length;

    // Identify top performing category and brand by Contribution Margin $
    const sortedCats = [...categorySummaries].sort((a, b) => b.contribution_margin_amount - a.contribution_margin_amount);
    const top_performing_category = sortedCats.length > 0 && sortedCats[0].contribution_margin_amount > 0
        ? `${sortedCats[0].category_name} (${sortedCats[0].contribution_margin_ratio}%)`
        : "N/A";

    const sortedBrands = [...brandSummaries].sort((a, b) => b.contribution_margin_amount - a.contribution_margin_amount);
    const top_performing_brand = sortedBrands.length > 0 && sortedBrands[0].contribution_margin_amount > 0
        ? `${sortedBrands[0].brand_name} (${sortedBrands[0].contribution_margin_ratio}%)`
        : "N/A";

    return {
        total_skus,
        total_units_sold,
        total_net_sales,
        total_manufacturing_cost,
        total_contribution_margin,
        overall_contribution_margin_ratio,
        profitable_skus_count,
        loss_skus_count,
        top_performing_category,
        top_performing_brand
    };
}

/**
 * Aggregate rows by Product Category Line
 */
export function aggregateByCategoryLine(rows: ContributionMarginRow[]): CategoryLineSummary[] {
    const map = new Map<string, {
        category_id: number | null;
        category_name: string;
        skus_count: number;
        total_quantity_sold: number;
        net_sales_revenue: number;
        total_manufacturing_cost: number;
    }>();

    for (const r of rows) {
        const key = r.category_name || "Uncategorized";
        const current = map.get(key) || {
            category_id: r.category_id,
            category_name: key,
            skus_count: 0,
            total_quantity_sold: 0,
            net_sales_revenue: 0,
            total_manufacturing_cost: 0
        };

        current.skus_count += 1;
        current.total_quantity_sold += r.invoiced_quantity;
        current.net_sales_revenue += r.net_sales_revenue;
        current.total_manufacturing_cost += r.total_manufacturing_cost;

        map.set(key, current);
    }

    return Array.from(map.values()).map(c => {
        const total_manufacturing_cost = round(c.total_manufacturing_cost);
        const contribution_margin_amount = round(c.net_sales_revenue - total_manufacturing_cost);
        const contribution_margin_ratio = c.net_sales_revenue > 0
            ? round((contribution_margin_amount / c.net_sales_revenue) * 100, 1)
            : 0;

        return {
            category_id: c.category_id,
            category_name: c.category_name,
            skus_count: c.skus_count,
            total_quantity_sold: round(c.total_quantity_sold),
            net_sales_revenue: round(c.net_sales_revenue),
            total_manufacturing_cost,
            contribution_margin_amount,
            contribution_margin_ratio,
            margin_status: resolveMarginStatus(contribution_margin_ratio)
        };
    }).sort((a, b) => b.net_sales_revenue - a.net_sales_revenue);
}

/**
 * Aggregate rows by Product Brand Line
 */
export function aggregateByBrandLine(rows: ContributionMarginRow[]): BrandLineSummary[] {
    const map = new Map<string, {
        brand_id: number | null;
        brand_name: string;
        skus_count: number;
        total_quantity_sold: number;
        net_sales_revenue: number;
        total_manufacturing_cost: number;
    }>();

    for (const r of rows) {
        const key = r.brand_name || "Unbranded";
        const current = map.get(key) || {
            brand_id: r.brand_id,
            brand_name: key,
            skus_count: 0,
            total_quantity_sold: 0,
            net_sales_revenue: 0,
            total_manufacturing_cost: 0
        };

        current.skus_count += 1;
        current.total_quantity_sold += r.invoiced_quantity;
        current.net_sales_revenue += r.net_sales_revenue;
        current.total_manufacturing_cost += r.total_manufacturing_cost;

        map.set(key, current);
    }

    return Array.from(map.values()).map(b => {
        const total_manufacturing_cost = round(b.total_manufacturing_cost);
        const contribution_margin_amount = round(b.net_sales_revenue - total_manufacturing_cost);
        const contribution_margin_ratio = b.net_sales_revenue > 0
            ? round((contribution_margin_amount / b.net_sales_revenue) * 100, 1)
            : 0;

        return {
            brand_id: b.brand_id,
            brand_name: b.brand_name,
            skus_count: b.skus_count,
            total_quantity_sold: round(b.total_quantity_sold),
            net_sales_revenue: round(b.net_sales_revenue),
            total_manufacturing_cost,
            contribution_margin_amount,
            contribution_margin_ratio,
            margin_status: resolveMarginStatus(contribution_margin_ratio)
        };
    }).sort((a, b) => b.net_sales_revenue - a.net_sales_revenue);
}
