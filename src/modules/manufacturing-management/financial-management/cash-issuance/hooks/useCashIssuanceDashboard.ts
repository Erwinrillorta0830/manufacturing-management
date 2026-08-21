"use client";

import { useState, useCallback, useEffect, useRef } from "react";
// 🚀 FIXED: Pointing directly to your existing provider!
import { disbursementProvider } from "../providers/fetchProvider";
import { DisbursementDashboardData, DashboardFilters } from "../types";

export function useCashIssuanceDashboard() {
    const [data, setData] = useState<DisbursementDashboardData | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    // Default filters: Current month up to today
    const [filters, setFilters] = useState<DashboardFilters>(() => ({
        status: "ALL",
        startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0],
    }));
    const initialFiltersRef = useRef(filters);

    const fetchDashboard = useCallback(async (currentFilters: DashboardFilters) => {
        setIsLoading(true);
        try {
            // 🚀 FIXED: Calling the getDashboardData method we added to your provider
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

    // Load the initial report once. Filter edits remain local until Generate is clicked.
    useEffect(() => {
        fetchDashboard(initialFiltersRef.current);
    }, [fetchDashboard]);

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
