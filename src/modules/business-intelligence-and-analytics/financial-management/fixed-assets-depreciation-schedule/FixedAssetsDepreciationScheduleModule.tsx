"use client";

import React, { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
    Calendar,
    Building2,
    RefreshCw,
    AlertCircle,
    FileSpreadsheet,
    ShieldCheck,
    Layers
} from "lucide-react";
import { Button } from "@/components/ui/button";
import DepreciationSummaryCards from "./components/DepreciationSummaryCards";
import DepreciationFilters from "./components/DepreciationFilters";
import DepreciationScheduleTable from "./components/DepreciationScheduleTable";
import AssetAmortizationModal from "./components/AssetAmortizationModal";
import DepreciationExport from "./components/DepreciationExport";
import { fetchDepreciationSchedule } from "./services/depreciationService";
import {
    AssetDepreciationRecord,
    DepreciationScheduleSummary,
    DepartmentOption,
    DepreciationFiltersState,
    AssetReportingStatus
} from "./types";
import { formatDateString } from "./utils/depreciationCalculations";

export default function FixedAssetsDepreciationScheduleModule() {
    const todayStr = new Date().toISOString().split("T")[0];

    const [filters, setFilters] = useState<DepreciationFiltersState>({
        asOfDate: todayStr,
        periodStartDate: `${new Date().getFullYear()}-01-01`,
        periodPreset: "fy_ytd",
        searchQuery: "",
        assetType: "ALL",
        depreciationMethod: "ALL",
        departmentId: "ALL",
        statusFilter: "ALL"
    });

    const [assets, setAssets] = useState<AssetDepreciationRecord[]>([]);
    const [summary, setSummary] = useState<DepreciationScheduleSummary | null>(null);
    const [departments, setDepartments] = useState<DepartmentOption[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

    const [selectedAssetForSchedule, setSelectedAssetForSchedule] = useState<AssetDepreciationRecord | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Data loader
    const loadSchedule = useCallback(
        async (isManualRefresh = false) => {
            try {
                if (isManualRefresh) {
                    setIsRefreshing(true);
                } else {
                    setIsLoading(true);
                }
                setError(null);

                const response = await fetchDepreciationSchedule(filters);

                if (!response.ok) {
                    const msg = response.error || "Failed to load fixed asset depreciation schedule";
                    setError(msg);
                    toast.error(msg);
                    return;
                }

                setAssets(response.data || []);
                setSummary(response.summary || null);
                if (response.departments && response.departments.length > 0) {
                    setDepartments(response.departments);
                }
                setLastUpdated(new Date());

                if (isManualRefresh) {
                    toast.success("Depreciation schedule recalculated successfully.");
                }
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : "Error connecting to server";
                setError(msg);
                toast.error(msg);
            } finally {
                setIsLoading(false);
                setIsRefreshing(false);
            }
        },
        [filters]
    );

    // Initial load and filter re-query
    useEffect(() => {
        loadSchedule();
    }, [loadSchedule]);

    const handleFilterChange = <K extends keyof DepreciationFiltersState>(
        key: K,
        value: DepreciationFiltersState[K]
    ) => {
        setFilters((prev) => ({
            ...prev,
            [key]: value
        }));
    };

    const handleResetFilters = () => {
        setFilters({
            asOfDate: todayStr,
            periodStartDate: `${new Date().getFullYear()}-01-01`,
            periodPreset: "fy_ytd",
            searchQuery: "",
            assetType: "ALL",
            depreciationMethod: "ALL",
            departmentId: "ALL",
            statusFilter: "ALL"
        });
        toast.info("Filters reset to default.");
    };

    const handleOpenScheduleModal = (asset: AssetDepreciationRecord) => {
        setSelectedAssetForSchedule(asset);
        setIsModalOpen(true);
    };

    const handleCloseScheduleModal = () => {
        setIsModalOpen(false);
        setSelectedAssetForSchedule(null);
    };

    return (
        <div className="space-y-4 pb-8">
            {/* Header Bar */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
                <div>
                    <div className="flex items-center gap-2">
                        <div className="rounded-lg bg-primary/10 p-2 text-primary">
                            <Layers className="h-5 w-5" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold tracking-tight text-foreground">
                                Fixed Asset Depreciation Schedule
                            </h1>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                Capitalized asset acquisition cost, salvage values, periodic expense, and net book value (NBV) for balance sheet and audit reporting.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2.5">
                    {lastUpdated && (
                        <span className="hidden sm:inline-block text-[11px] font-mono text-muted-foreground">
                            As of: {formatDateString(filters.asOfDate)}
                        </span>
                    )}
                    <DepreciationExport
                        assets={assets}
                        summary={summary}
                        asOfDate={filters.asOfDate}
                        periodPreset={filters.periodPreset}
                    />
                </div>
            </div>

            {/* Error Banner */}
            {error && (
                <div className="flex items-center justify-between rounded-xl border border-destructive/50 bg-destructive/10 p-3.5 text-xs text-destructive">
                    <div className="flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        <span>{error}</span>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => loadSchedule(true)}
                        className="h-7 text-xs border-destructive/30 hover:bg-destructive/20"
                    >
                        Retry
                    </Button>
                </div>
            )}

            {/* Top KPI Metrics Cards */}
            <DepreciationSummaryCards
                summary={summary}
                isLoading={isLoading}
            />

            {/* Filter Toolbar (As-of Date, Comboboxes, Search, Recalculate) */}
            <DepreciationFilters
                filters={filters}
                departments={departments}
                onFilterChange={handleFilterChange}
                onResetFilters={handleResetFilters}
                onRefresh={() => loadSchedule(true)}
                isRefreshing={isRefreshing}
            />

            {/* Main Interactive Table */}
            <DepreciationScheduleTable
                assets={assets}
                isLoading={isLoading}
                onSelectAssetForSchedule={handleOpenScheduleModal}
            />

            {/* Drill-down Amortization Modal */}
            <AssetAmortizationModal
                asset={selectedAssetForSchedule}
                asOfDate={filters.asOfDate}
                isOpen={isModalOpen}
                onClose={handleCloseScheduleModal}
            />
        </div>
    );
}
