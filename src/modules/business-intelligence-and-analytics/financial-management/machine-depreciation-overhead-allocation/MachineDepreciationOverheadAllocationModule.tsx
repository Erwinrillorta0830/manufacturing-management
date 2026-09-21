"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
    FileSpreadsheet,
    RefreshCw,
    Sliders,
    Coins,
    Download,
    Eye
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import SummaryCards from "./components/SummaryCards";
import HeaderFilters from "./components/HeaderFilters";
import DepreciationScheduleView from "./components/DepreciationScheduleView";
import CapacityBurdenView from "./components/CapacityBurdenView";
import CostingImpactView from "./components/CostingImpactView";
import CalculationReviewDrawer from "./components/CalculationReviewDrawer";
import {
    ProductionAssetMaster,
    WorkCenterOption,
    MachineDepreciationSummaryMetrics,
    ReportFilters
} from "./types";

export default function MachineDepreciationOverheadAllocationModule() {
    // Data states
    const [assets, setAssets] = useState<ProductionAssetMaster[]>([]);
    const [workCenters, setWorkCenters] = useState<WorkCenterOption[]>([]);
    const [summary, setSummary] = useState<MachineDepreciationSummaryMetrics | null>(null);

    // Filter states
    const [filters, setFilters] = useState<ReportFilters>({
        period: new Date().toISOString().slice(0, 7), // "YYYY-MM"
        asset_type: "ALL",
        work_center_id: "ALL",
        asset_id: "ALL",
        search: ""
    });

    // View tab state
    const [activeTab, setActiveTab] = useState<"schedule" | "capacity" | "impact">("schedule");

    // Drawer state
    const [selectedAsset, setSelectedAsset] = useState<ProductionAssetMaster | null>(null);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);

    // Selected Work Center for Costing Impact simulation tab
    const [selectedWcForImpact, setSelectedWcForImpact] = useState<string>("");

    // Loading states
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);

    // Fetch live data from API
    const fetchData = useCallback(async (isRefresh = false) => {
        try {
            if (isRefresh) setIsRefreshing(true);
            else setIsLoading(true);

            const res = await fetch("/api/bia/financial-management/machine-depreciation-overhead-allocation");
            const data = await res.json();

            if (!res.ok || !data.ok) {
                const msg = data.error || "Failed to load machine depreciation data.";
                toast.error(msg);
                return;
            }

            const loadedAssets: ProductionAssetMaster[] = data.assets || [];
            const loadedWorkCenters: WorkCenterOption[] = data.workCenters || [];

            setAssets(loadedAssets);
            setWorkCenters(loadedWorkCenters);
            setSummary(data.summary || null);

            // Default selected work center for impact simulation tab
            if (loadedWorkCenters.length > 0 && !selectedWcForImpact) {
                setSelectedWcForImpact(String(loadedWorkCenters[0].work_center_id));
            }

            if (isRefresh) {
                toast.success("Machine depreciation overhead records refreshed.");
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Error connecting to server";
            toast.error(msg);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [selectedWcForImpact]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Handle filter reset
    const handleResetFilters = () => {
        setFilters({
            period: new Date().toISOString().slice(0, 7),
            asset_type: "ALL",
            work_center_id: "ALL",
            asset_id: "ALL",
            search: ""
        });
        toast.info("Report filters reset to default.");
    };

    // Filter assets for Views 1 & 2
    const filteredAssets = useMemo(() => {
        return assets.filter(asset => {
            // Station linkage filter
            if (filters.asset_type === "ASSIGNED" && !asset.work_center_id) {
                return false;
            }
            if (filters.asset_type === "UNASSIGNED" && asset.work_center_id) {
                return false;
            }

            // Asset Combobox filter
            if (filters.asset_id !== "ALL" && String(asset.asset_id) !== filters.asset_id) {
                return false;
            }

            // Work Center Combobox filter
            if (filters.work_center_id !== "ALL" && String(asset.work_center_id) !== filters.work_center_id) {
                return false;
            }

            // Keyword Search
            if (filters.search.trim()) {
                const q = filters.search.toLowerCase();
                const matchesName = asset.item_name.toLowerCase().includes(q);
                const matchesSerial = (asset.serial || "").toLowerCase().includes(q);
                const matchesWc = (asset.work_center_name || "").toLowerCase().includes(q);

                if (!matchesName && !matchesSerial && !matchesWc) {
                    return false;
                }
            }

            return true;
        });
    }, [assets, filters]);

    // Drawer handlers
    const handleOpenDrawer = (asset: ProductionAssetMaster) => {
        setSelectedAsset(asset);
        setIsDrawerOpen(true);
    };

    const handleCloseDrawer = () => {
        setIsDrawerOpen(false);
        setSelectedAsset(null);
    };

    // Triggered when rate is successfully applied to a work center
    const handleSuccessRateApplied = (workCenterId: number, newRate: number) => {
        setWorkCenters(prev =>
            prev.map(wc =>
                wc.work_center_id === workCenterId
                    ? { ...wc, overhead_cost_per_hour: newRate }
                    : wc
            )
        );
        setAssets(prev =>
            prev.map(a =>
                a.work_center_id === workCenterId
                    ? { ...a, current_work_center_rate: newRate }
                    : a
            )
        );

        // Silent refresh of summary metrics
        fetchData(false);
    };

    // Export current report view to CSV
    const handleExportCsv = () => {
        if (activeTab === "schedule") {
            const headers = ["Item Name", "Serial", "Work Center", "Acquisition Cost", "Salvage Value", "Depreciable Amount", "Method", "Life Span", "Annual Depr", "Monthly Depr"];
            const rows = filteredAssets.map(a => {
                const annual = a.depreciation_method === "Straight Line" && a.life_span ? a.depreciable_amount / a.life_span : 0;
                return [
                    `"${a.item_name.replace(/"/g, '""')}"`,
                    a.serial || "",
                    `"${a.work_center_name || "Unassigned"}"`,
                    a.acquisition_cost,
                    a.residual_value,
                    a.depreciable_amount,
                    a.depreciation_method,
                    a.life_span || "",
                    annual.toFixed(2),
                    (annual / 12).toFixed(2)
                ].join(",");
            });
            downloadCsv([headers.join(","), ...rows].join("\n"), "machine_depreciation_schedule.csv");
        } else if (activeTab === "capacity") {
            const headers = ["Item Name", "Serial", "Work Center", "Scheduled Hours", "Utilization %", "Productive Hours", "Depr Burden / Hr", "Current Rate", "Variance"];
            const rows = filteredAssets.map(a => {
                const annual = a.depreciation_method === "Straight Line" && a.life_span ? a.depreciable_amount / a.life_span : 0;
                const deprHr = annual / 3000;
                const currentRate = a.current_work_center_rate || 0;
                return [
                    `"${a.item_name.replace(/"/g, '""')}"`,
                    a.serial || "",
                    `"${a.work_center_name || "Unassigned"}"`,
                    4000,
                    75,
                    3000,
                    deprHr.toFixed(2),
                    currentRate.toFixed(2),
                    (deprHr - currentRate).toFixed(2)
                ].join(",");
            });
            downloadCsv([headers.join(","), ...rows].join("\n"), "capacity_burden_analysis.csv");
        } else {
            toast.info("Costing impact preview is a real-time scenario simulation.");
        }
    };

    const downloadCsv = (content: string, filename: string) => {
        const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success(`Exported ${filename}`);
    };

    return (
        <div className="space-y-6 pb-12">
            {/* Top Title Banner */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4">
                <div>
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wider text-primary bg-primary/10 px-2.5 py-0.5 rounded-full">
                            BIA • Financial Management
                        </span>
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground mt-1.5 flex items-center gap-2">
                        <Coins className="h-6 w-6 text-primary" />
                        Machine Depreciation Overhead Allocation
                    </h1>
                    <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
                        Converts equipment depreciation and operating capacity assumptions into hourly overhead burden rates for machine-cost absorption into Cost of Goods Manufactured (COGM).
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleExportCsv}
                        className="h-8 text-xs gap-1.5"
                    >
                        <Download className="h-3.5 w-3.5" />
                        Export CSV
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fetchData(true)}
                        disabled={isRefreshing}
                        className="h-8 text-xs gap-1.5"
                    >
                        <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin text-primary" : ""}`} />
                        Refresh
                    </Button>
                </div>
            </div>

            {/* Top Metric Cards */}
            <SummaryCards summary={summary} isLoading={isLoading} />

            {/* Filter Bar */}
            <HeaderFilters
                assets={assets}
                workCenters={workCenters}
                filters={filters}
                onChangeFilters={setFilters}
                onResetFilters={handleResetFilters}
            />

            {/* Three Report Views Tabs */}
            <Tabs
                value={activeTab}
                onValueChange={(val) => setActiveTab(val as "schedule" | "capacity" | "impact")}
                className="space-y-4"
            >
                <div className="flex items-center justify-between border-b pb-2">
                    <TabsList className="bg-muted/60 p-1">
                        <TabsTrigger value="schedule" className="text-xs gap-1.5 px-3.5">
                            <FileSpreadsheet className="h-3.5 w-3.5" />
                            1. Depreciation Schedule
                        </TabsTrigger>
                        <TabsTrigger value="capacity" className="text-xs gap-1.5 px-3.5">
                            <Sliders className="h-3.5 w-3.5" />
                            2. Capacity & Burden Analysis
                        </TabsTrigger>
                        <TabsTrigger value="impact" className="text-xs gap-1.5 px-3.5">
                            <Eye className="h-3.5 w-3.5" />
                            3. Costing Impact Preview
                        </TabsTrigger>
                    </TabsList>

                    <span className="text-[11px] text-muted-foreground hidden sm:inline">
                        {activeTab === "schedule"
                            ? `Showing ${filteredAssets.length} production assets`
                            : activeTab === "capacity"
                                ? `Showing ${filteredAssets.length} machine capacity models`
                                : `Scenario Simulation on Work Centers`}
                    </span>
                </div>

                <TabsContent value="schedule" className="mt-0 focus-visible:outline-none">
                    <DepreciationScheduleView
                        assets={filteredAssets}
                        onSelectAsset={handleOpenDrawer}
                        isLoading={isLoading}
                    />
                </TabsContent>

                <TabsContent value="capacity" className="mt-0 focus-visible:outline-none">
                    <CapacityBurdenView
                        assets={filteredAssets}
                        onSelectAsset={handleOpenDrawer}
                        isLoading={isLoading}
                    />
                </TabsContent>

                <TabsContent value="impact" className="mt-0 focus-visible:outline-none">
                    <CostingImpactView
                        workCenters={workCenters}
                        selectedWorkCenterId={selectedWcForImpact}
                        onSelectWorkCenterId={setSelectedWcForImpact}
                    />
                </TabsContent>
            </Tabs>

            {/* Calculation, Review & Apply Drawer */}
            <CalculationReviewDrawer
                isOpen={isDrawerOpen}
                onClose={handleCloseDrawer}
                asset={selectedAsset}
                workCenters={workCenters}
                onSuccessRateApplied={handleSuccessRateApplied}
            />
        </div>
    );
}
