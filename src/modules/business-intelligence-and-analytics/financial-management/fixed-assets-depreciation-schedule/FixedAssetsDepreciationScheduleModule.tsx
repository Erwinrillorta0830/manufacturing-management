"use client";

import React, { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
    AlertCircle,
    Layers,
    LayoutDashboard,
    TableProperties,
    BarChart2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import DepreciationSummaryCards from "./components/DepreciationSummaryCards";
import DepreciationFilters from "./components/DepreciationFilters";
import DepreciationScheduleTable from "./components/DepreciationScheduleTable";
import AssetAmortizationModal from "./components/AssetAmortizationModal";
import DepreciationExport from "./components/DepreciationExport";
import DepreciationAnalyticsTab from "./components/DepreciationAnalyticsTab";
import { fetchDepreciationSchedule } from "./services/depreciationService";
import {
    AssetDepreciationRecord,
    DepreciationScheduleSummary,
    DepartmentOption,
    DepreciationFiltersState,
} from "./types";
import { formatDateString } from "./utils/depreciationCalculations";

type ActiveTab = "summary" | "schedule" | "analytics";

const TABS: { id: ActiveTab; label: string; icon: React.ElementType }[] = [
    { id: "summary", label: "Summary", icon: LayoutDashboard },
    { id: "schedule", label: "Schedule", icon: TableProperties },
    { id: "analytics", label: "Analytics", icon: BarChart2 },
];

export default function FixedAssetsDepreciationScheduleModule() {
    const todayStr = new Date().toISOString().split("T")[0];

    const [activeTab, setActiveTab] = useState<ActiveTab>("summary");

    const [filters, setFilters] = useState<DepreciationFiltersState>({
        asOfDate: todayStr,
        periodStartDate: `${new Date().getFullYear()}-01-01`,
        periodPreset: "fy_ytd",
        searchQuery: "",
        assetType: "ALL",
        depreciationMethod: "ALL",
        departmentId: "ALL",
        statusFilter: "ALL",
    });

    const [assets, setAssets] = useState<AssetDepreciationRecord[]>([]);
    const [summary, setSummary] = useState<DepreciationScheduleSummary | null>(null);
    const [departments, setDepartments] = useState<DepartmentOption[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

    const [selectedAssetForSchedule, setSelectedAssetForSchedule] =
        useState<AssetDepreciationRecord | null>(null);
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
                    const msg =
                        response.error || "Failed to load fixed asset depreciation schedule";
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
                const msg =
                    err instanceof Error ? err.message : "Error connecting to server";
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
            [key]: value,
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
            statusFilter: "ALL",
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
                                Capitalized asset acquisition cost, salvage values, periodic expense,
                                and net book value (NBV) for balance sheet and audit reporting.
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

            {/* ── Tab Navigation ── */}
            <div className="relative flex gap-1 rounded-xl border border-border bg-muted/40 p-1">
                {TABS.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={[
                                "relative flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                isActive
                                    ? "text-foreground"
                                    : "text-muted-foreground hover:text-foreground",
                            ].join(" ")}
                        >
                            {/* Animated background pill */}
                            {isActive && (
                                <motion.span
                                    layoutId="tab-pill"
                                    className="absolute inset-0 rounded-lg bg-background shadow-sm"
                                    transition={{ type: "spring", stiffness: 380, damping: 35 }}
                                />
                            )}
                            <Icon className="relative h-3.5 w-3.5 shrink-0" />
                            <span className="relative">{tab.label}</span>
                        </button>
                    );
                })}
            </div>

            {/* ── Shared Filters (visible on all tabs) ── */}
            <DepreciationFilters
                filters={filters}
                departments={departments}
                onFilterChange={handleFilterChange}
                onResetFilters={handleResetFilters}
                onRefresh={() => loadSchedule(true)}
                isRefreshing={isRefreshing}
            />

            {/* ── Tab Content with AnimatePresence ── */}
            <AnimatePresence mode="wait">
                {activeTab === "summary" && (
                    <motion.div
                        key="summary"
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.22, ease: "easeOut" }}
                        className="space-y-4"
                    >
                        {/* KPI Cards */}
                        <DepreciationSummaryCards
                            summary={summary}
                            isLoading={isLoading}
                        />

                        {/* Grouped Asset Table */}
                        <DepreciationScheduleTable
                            assets={assets}
                            isLoading={isLoading}
                            onSelectAssetForSchedule={handleOpenScheduleModal}
                            summary={summary}
                        />
                    </motion.div>
                )}

                {activeTab === "schedule" && (
                    <motion.div
                        key="schedule"
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.22, ease: "easeOut" }}
                    >
                        <DepreciationScheduleTable
                            assets={assets}
                            isLoading={isLoading}
                            onSelectAssetForSchedule={handleOpenScheduleModal}
                            summary={summary}
                        />
                    </motion.div>
                )}

                {activeTab === "analytics" && (
                    <motion.div
                        key="analytics"
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.22, ease: "easeOut" }}
                    >
                        <DepreciationAnalyticsTab assets={assets} summary={summary} />
                    </motion.div>
                )}
            </AnimatePresence>

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
