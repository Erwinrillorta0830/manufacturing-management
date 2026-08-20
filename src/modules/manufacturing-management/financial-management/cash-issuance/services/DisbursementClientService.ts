"use client";

import { useState, useCallback, useEffect } from "react";
// 🚀 FIXED: Import your existing provider
import { disbursementProvider } from "../providers/fetchProvider";
import { DisbursementDashboardData, DashboardFilters } from "../types";

export function useCashIssuanceDashboard() {
    const [data, setData] = useState<DisbursementDashboardData | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const [filters, setFilters] = useState<DashboardFilters>({
        status: "ALL",
        startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0],
    });

    const fetchDashboard = useCallback(async (currentFilters: DashboardFilters) => {
        setIsLoading(true);
        try {
            // 🚀 FIXED: Calling your centralized provider
            const result = await disbursementProvider.getDashboardData(currentFilters);
            if (result) {
                setData(result);
            }
        } catch (err) {
            console.error("Failed to fetch dashboard data", err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchDashboard(filters);
    }, [fetchDashboard, filters]);

    const handleApplyFilters = () => {
        fetchDashboard(filters);
    };

    return {
        data,
        filters,
        setFilters,
        isLoading,
        handleApplyFilters
    };
}