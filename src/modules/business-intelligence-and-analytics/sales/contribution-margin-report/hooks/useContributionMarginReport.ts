"use client";

import { useState, useEffect, useCallback } from "react";
import {
    ContributionMarginRow,
    CategoryLineSummary,
    BrandLineSummary,
    ContributionMarginSummaryKPIs,
    ContributionMarginFilters,
    ContributionMarginReportResponse
} from "../types/contribution-margin.types";

const initialFilters: ContributionMarginFilters = {
    searchQuery: "",
    startDate: "",
    endDate: "",
    categoryId: "ALL",
    brandId: "ALL",
    marginStatus: "ALL"
};

export function useContributionMarginReport() {
    const [reportData, setReportData] = useState<ContributionMarginReportResponse | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [filters, setFilters] = useState<ContributionMarginFilters>(initialFilters);
    const [activeTab, setActiveTab] = useState<"sku" | "category" | "brand">("sku");

    const fetchReport = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams();
            if (filters.searchQuery) params.set("searchQuery", filters.searchQuery);
            if (filters.startDate) params.set("startDate", filters.startDate);
            if (filters.endDate) params.set("endDate", filters.endDate);
            if (filters.categoryId && filters.categoryId !== "ALL") params.set("categoryId", filters.categoryId);
            if (filters.brandId && filters.brandId !== "ALL") params.set("brandId", filters.brandId);
            if (filters.marginStatus && filters.marginStatus !== "ALL") params.set("marginStatus", filters.marginStatus);

            const res = await fetch(`/api/bia/sales/contribution-margin-report?${params.toString()}`, {
                method: "GET",
                headers: { "Content-Type": "application/json" },
                cache: "no-store"
            });

            if (!res.ok) {
                const errJson = await res.json().catch(() => ({}));
                throw new Error(errJson.error || `Failed to fetch report (${res.status})`);
            }

            const json: ContributionMarginReportResponse = await res.json();
            setReportData(json);
        } catch (err) {
            console.error("[useContributionMarginReport] fetch error:", err);
            setError(err instanceof Error ? err.message : "Failed to load Contribution Margin Report");
        } finally {
            setIsLoading(false);
        }
    }, [filters]);

    useEffect(() => {
        fetchReport();
    }, [fetchReport]);

    // CSV Export
    const exportToCsv = useCallback(() => {
        if (!reportData) return;

        let csvContent = "data:text/csv;charset=utf-8,";
        if (activeTab === "sku") {
            const headers = [
                "SKU Code",
                "Product Name",
                "Category",
                "Brand",
                "Invoiced Qty",
                "Net Sales Revenue (PHP)",
                "Avg Selling Price (PHP)",
                "Unit Manufacturing Cost (TMC) (PHP)",
                "Total Manufacturing Cost (TMC) (PHP)",
                "Unit Contribution Margin (PHP)",
                "Contribution Margin $ (PHP)",
                "Contribution Margin %",
                "Margin Status"
            ];
            const rows = reportData.rows.map(r => [
                `"${r.product_code}"`,
                `"${r.product_name.replace(/"/g, '""')}"`,
                `"${r.category_name}"`,
                `"${r.brand_name}"`,
                r.invoiced_quantity,
                r.net_sales_revenue,
                r.average_selling_price,
                r.unit_manufacturing_cost,
                r.total_manufacturing_cost,
                r.unit_contribution_margin,
                r.contribution_margin_amount,
                `${r.contribution_margin_ratio}%`,
                r.margin_status
            ]);
            csvContent += [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
        } else if (activeTab === "category") {
            const headers = [
                "Category Name",
                "SKU Count",
                "Units Sold",
                "Net Sales Revenue (PHP)",
                "Total Manufacturing Cost (TMC) (PHP)",
                "Contribution Margin $ (PHP)",
                "Contribution Margin %",
                "Margin Status"
            ];
            const rows = reportData.categorySummaries.map(c => [
                `"${c.category_name}"`,
                c.skus_count,
                c.total_quantity_sold,
                c.net_sales_revenue,
                c.total_manufacturing_cost,
                c.contribution_margin_amount,
                `${c.contribution_margin_ratio}%`,
                c.margin_status
            ]);
            csvContent += [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
        } else {
            const headers = [
                "Brand Name",
                "SKU Count",
                "Units Sold",
                "Net Sales Revenue (PHP)",
                "Total Manufacturing Cost (TMC) (PHP)",
                "Contribution Margin $ (PHP)",
                "Contribution Margin %",
                "Margin Status"
            ];
            const rows = reportData.brandSummaries.map(b => [
                `"${b.brand_name}"`,
                b.skus_count,
                b.total_quantity_sold,
                b.net_sales_revenue,
                b.total_manufacturing_cost,
                b.contribution_margin_amount,
                `${b.contribution_margin_ratio}%`,
                b.margin_status
            ]);
            csvContent += [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
        }

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `contribution_margin_report_${activeTab}_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }, [reportData, activeTab]);

    return {
        rows: reportData?.rows || [],
        categorySummaries: reportData?.categorySummaries || [],
        brandSummaries: reportData?.brandSummaries || [],
        summary: reportData?.summary || null,
        availableCategories: reportData?.availableCategories || [],
        availableBrands: reportData?.availableBrands || [],
        isLoading,
        error,
        filters,
        setFilters,
        activeTab,
        setActiveTab,
        refresh: fetchReport,
        exportToCsv
    };
}
