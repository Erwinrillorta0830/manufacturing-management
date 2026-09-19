"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
    Layers,
    Info,
    TrendingUp,
    Package,
    ArrowRight,
    ArrowUpRight,
    ArrowDownRight,
    Minus,
    RefreshCw,
    ChevronsUpDown,
    Check,
    Calculator,
    Sparkles,
    ChevronLeft,
    ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Popover,
    PopoverContent,
    PopoverTrigger
} from "@/components/ui/popover";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { WorkCenterOption, WorkCenterImpactSummary } from "../types";

interface CostingImpactViewProps {
    workCenters: WorkCenterOption[];
    selectedWorkCenterId: string;
    onSelectWorkCenterId: (id: string) => void;
}

export default function CostingImpactView({
    workCenters,
    selectedWorkCenterId,
    onSelectWorkCenterId
}: CostingImpactViewProps) {
    const [isWcOpen, setIsWcOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [simulatedRateInput, setSimulatedRateInput] = useState<string>("");
    const [impactData, setImpactData] = useState<WorkCenterImpactSummary | null>(null);
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [pageSize, setPageSize] = useState<number>(10);

    // Filter to work centers that exist
    const currentWc = workCenters.find(w => String(w.work_center_id) === selectedWorkCenterId) || workCenters[0];

    // Initialize or update simulated rate input when selected work center changes
    useEffect(() => {
        if (currentWc) {
            setSimulatedRateInput(currentWc.overhead_cost_per_hour.toFixed(2));
            setCurrentPage(1);
        }
    }, [currentWc]);

    const fetchImpactSimulation = useCallback(async (wcId: number, simRate: number) => {
        try {
            setIsLoading(true);
            const res = await fetch(
                `/api/bia/financial-management/machine-depreciation-overhead-allocation?view=impact&work_center_id=${wcId}&simulated_rate=${simRate.toFixed(4)}`
            );
            const data = await res.json();
            if (!res.ok || !data.ok) {
                throw new Error(data.error || "Failed to load costing impact data");
            }
            setImpactData(data.summary);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Error loading impact simulation";
            toast.error(msg);
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Initial fetch when work center is selected
    useEffect(() => {
        if (currentWc) {
            const rate = parseFloat(simulatedRateInput) || currentWc.overhead_cost_per_hour;
            fetchImpactSimulation(currentWc.work_center_id, rate);
        }
    }, [currentWc?.work_center_id, fetchImpactSimulation]);

    const handleApplySimulation = () => {
        if (!currentWc) return;
        const parsedRate = parseFloat(simulatedRateInput);
        if (isNaN(parsedRate) || parsedRate < 0 || parsedRate > 999999.9999) {
            toast.error("Please enter a valid non-negative simulated rate between 0.0000 and 999,999.9999.");
            return;
        }
        setCurrentPage(1);
        fetchImpactSimulation(currentWc.work_center_id, parsedRate);
    };

    const handleUseCalculatedRate = () => {
        if (!impactData) return;
        const calcRateStr = impactData.calculated_burden_rate.toFixed(2);
        setSimulatedRateInput(calcRateStr);
        if (currentWc) {
            setCurrentPage(1);
            fetchImpactSimulation(currentWc.work_center_id, impactData.calculated_burden_rate);
        }
    };

    if (workCenters.length === 0) {
        return (
            <div className="rounded-xl border bg-card p-12 text-center space-y-3">
                <Layers className="h-10 w-10 text-muted-foreground mx-auto" />
                <h3 className="text-base font-semibold">No Work Centers Found</h3>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                    Please configure Manufacturing Work Centers in Master Data to evaluate routing absorption impact.
                </p>
            </div>
        );
    }

    const currentRate = impactData?.current_rate ?? currentWc?.overhead_cost_per_hour ?? 0;
    const calculatedBurdenRate = impactData?.calculated_burden_rate ?? currentRate;
    const simRate = impactData?.simulated_rate ?? (parseFloat(simulatedRateInput) || currentRate);
    const hourlyVariance = simRate - currentRate;

    const routes = impactData?.routes || [];
    const totalRoutePages = Math.max(1, Math.ceil(routes.length / pageSize));
    const validCurrentPage = Math.min(currentPage, totalRoutePages);
    const startRouteIndex = (validCurrentPage - 1) * pageSize;
    const paginatedRoutes = routes.slice(startRouteIndex, startRouteIndex + pageSize);

    return (
        <div className="space-y-4">
            {/* 1. Prominent Simulation Notice Banner */}
            <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-4 flex items-start gap-3">
                <div className="p-1.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5">
                    <Info className="h-4 w-4" />
                </div>
                <div className="space-y-1 text-xs">
                    <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground">
                            Costing Impact & Absorption Preview — Scenario Simulation
                        </span>
                    </div>
                    <p className="text-muted-foreground leading-relaxed">
                        This view simulates how changes to the machine hourly overhead burden propagate through existing product routing steps and Cost of Goods Manufactured (COGM).{" "}
                     
                    </p>
                </div>
            </div>

            {/* 2. Simulation Controls Card */}
            <div className="rounded-xl border bg-card/60 backdrop-blur-sm p-4 shadow-sm">
                <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-5 gap-4 items-end">
                    {/* Work Center Combobox */}
                    <div className="space-y-1.5 sm:col-span-2">
                        <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                            <Layers className="h-3.5 w-3.5" />
                            Target Work Center (Manufacturing Station)
                        </Label>
                        <Popover open={isWcOpen} onOpenChange={setIsWcOpen}>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    role="combobox"
                                    aria-expanded={isWcOpen}
                                    className="w-full justify-between h-9 text-xs px-3 font-normal"
                                >
                                    <span className="truncate font-medium">
                                        {currentWc ? currentWc.work_center_name : "Select Work Center"}
                                    </span>
                                    <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[320px] p-0" align="start">
                                <Command>
                                    <CommandInput placeholder="Search work center..." className="h-8 text-xs" />
                                    <CommandList>
                                        <CommandEmpty className="py-2 text-center text-xs text-muted-foreground">
                                            No work centers found.
                                        </CommandEmpty>
                                        <CommandGroup>
                                            {workCenters.map((wc) => (
                                                <CommandItem
                                                    key={wc.work_center_id}
                                                    value={wc.work_center_name}
                                                    onSelect={() => {
                                                        onSelectWorkCenterId(String(wc.work_center_id));
                                                        setIsWcOpen(false);
                                                    }}
                                                    className="text-xs"
                                                >
                                                    <Check
                                                        className={cn(
                                                            "mr-2 h-3.5 w-3.5",
                                                            String(wc.work_center_id) === String(currentWc?.work_center_id) ? "opacity-100" : "opacity-0"
                                                        )}
                                                    />
                                                    <div className="flex flex-col truncate">
                                                        <span className="truncate font-medium">{wc.work_center_name}</span>
                                                        <span className="text-[10px] text-muted-foreground">
                                                            Current Rate: ₱{wc.overhead_cost_per_hour.toFixed(2)}/hr
                                                        </span>
                                                    </div>
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                    </CommandList>
                                </Command>
                            </PopoverContent>
                        </Popover>
                    </div>

                    {/* Simulated Rate Input */}
                    <div className="space-y-1.5 sm:col-span-2">
                        <div className="flex items-center justify-between">
                            <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                                <Calculator className="h-3.5 w-3.5" />
                                What-If Simulated Rate (₱/hr)
                            </Label>
                        </div>
                        <div className="relative">
                            <span className="absolute left-2.5 top-2 text-xs text-muted-foreground">₱</span>
                            <Input
                                type="number"
                                step="0.01"
                                min="0"
                                max="999999.9999"
                                value={simulatedRateInput}
                                onFocus={(e) => e.target.select()}
                                onClick={(e) => (e.target as HTMLInputElement).select()}
                                onChange={(e) => setSimulatedRateInput(e.target.value)}
                                className="pl-6 h-9 text-xs font-mono font-medium"
                            />
                        </div>
                    </div>

                    {/* Run Simulation Button */}
                    <div>
                        <Button
                            size="sm"
                            onClick={handleApplySimulation}
                            disabled={isLoading}
                            className="h-9 w-full text-xs gap-1.5"
                        >
                            <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
                            <span>Simulate</span>
                        </Button>
                    </div>
                </div>
            </div>

            {/* 3. Summary Metric Cards: Distinct Current, BIA Candidate, and What-If Target */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="rounded-xl border bg-card p-3.5 shadow-sm">
                    <span className="text-[11px] font-medium text-muted-foreground block">1. Current Rate</span>
                    <span className="text-lg font-bold font-mono text-foreground mt-0.5 block">
                        ₱{currentRate.toFixed(2)}
                        <span className="text-[10px] font-normal text-muted-foreground ml-1">/ hr</span>
                    </span>
                    <span className="text-[10px] text-muted-foreground">Active in Manufacturing</span>
                </div>

                <div className="rounded-xl border bg-card p-3.5 shadow-sm border-blue-500/20 bg-blue-500/5">
                    <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400 block">2. BIA Calculated Burden</span>
                    <span className="text-lg font-bold font-mono text-blue-700 dark:text-blue-300 mt-0.5 block">
                        ₱{calculatedBurdenRate.toFixed(2)}
                        <span className="text-[10px] font-normal text-muted-foreground ml-1">/ hr</span>
                    </span>
                    <span className="text-[10px] text-muted-foreground">Candidate rate from model</span>
                </div>

                <div className="rounded-xl border bg-card p-3.5 shadow-sm">
                    <span className="text-[11px] font-medium text-muted-foreground block">3. What-If Scenario</span>
                    <span className="text-lg font-bold font-mono text-primary mt-0.5 block">
                        ₱{simRate.toFixed(2)}
                        <span className="text-[10px] font-normal text-muted-foreground ml-1">/ hr</span>
                    </span>
                    <span className="text-[10px] text-muted-foreground">Active simulation target</span>
                </div>

                <div className="rounded-xl border bg-card p-3.5 shadow-sm">
                    <span className="text-[11px] font-medium text-muted-foreground block">Hourly Variance (Δ)</span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-lg font-bold font-mono">
                            {hourlyVariance > 0 ? `+₱${hourlyVariance.toFixed(2)}` : `₱${hourlyVariance.toFixed(2)}`}
                        </span>
                        {Math.abs(hourlyVariance) < 0.001 ? (
                            <Badge variant="outline" className="text-[9px] border-muted-foreground/30 text-muted-foreground">Balanced</Badge>
                        ) : hourlyVariance > 0 ? (
                            <Badge variant="outline" className="text-[9px] bg-amber-500/10 text-amber-600 border-amber-500/30">Increase</Badge>
                        ) : (
                            <Badge variant="outline" className="text-[9px] bg-emerald-500/10 text-emerald-600 border-emerald-500/30">Decrease</Badge>
                        )}
                    </div>
                    <span className="text-[10px] text-muted-foreground">Scenario vs Current</span>
                </div>

                <div className="rounded-xl border bg-card p-3.5 shadow-sm">
                    <span className="text-[11px] font-medium text-muted-foreground block">Affected Production</span>
                    <span className="text-lg font-bold text-foreground mt-0.5 block">
                        {impactData?.total_affected_products ?? 0} Products
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                        {impactData?.total_affected_routes ?? 0} Active Routing Steps
                    </span>
                </div>
            </div>

            {/* 4. Routing Steps Costing Impact Table */}
            <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
                <div className="p-3.5 border-b bg-muted/40 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Package className="h-4 w-4 text-primary" />
                        <span className="font-semibold text-xs text-foreground">
                            BOM Routing Step Overhead & COGM Impact Breakdown
                        </span>
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                        {impactData?.routes.length || 0} Routing Steps Assigned to {currentWc?.work_center_name}
                    </span>
                </div>

                {isLoading ? (
                    <div className="p-12 text-center space-y-2">
                        <RefreshCw className="h-6 w-6 animate-spin mx-auto text-primary" />
                        <p className="text-xs text-muted-foreground">Calculating routing step overhead absorption...</p>
                    </div>
                ) : !impactData || impactData.routes.length === 0 ? (
                    <div className="p-12 text-center space-y-2">
                        <Package className="h-8 w-8 text-muted-foreground mx-auto" />
                        <h4 className="text-sm font-semibold">No Routing Steps Linked</h4>
                        <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                            No active finished product versions or routing steps currently utilize {currentWc?.work_center_name}.
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left">
                            <thead className="bg-muted/50 text-muted-foreground border-b uppercase text-[10px] tracking-wider font-semibold">
                                <tr>
                                    <th className="py-3 px-4">Product & Manufacturing Version</th>
                                    <th className="py-3 px-4">Operation / Step</th>
                                    <th className="py-3 px-4 text-right" title="Setup Time + Run Time in hours">Cycle Time</th>
                                    <th className="py-3 px-4 text-right" title="Configured step batch size">Batch Size</th>
                                    <th className="py-3 px-4 text-right font-medium" title="Current overhead cost per batch (Current Rate × Cycle Time)">Current Overhead</th>
                                    <th className="py-3 px-4 text-right font-semibold text-primary" title="Simulated overhead cost per batch (Simulated Rate × Cycle Time)">Simulated Overhead</th>
                                    <th className="py-3 px-4 text-right font-bold" title="Incremental cost impact per finished unit">COGM Δ / Unit</th>
                                    <th className="py-3 px-4 text-right font-bold" title="Incremental cost impact per batch">COGM Δ / Batch</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {paginatedRoutes.map((route, idx) => {
                                    const isPositive = route.cogm_variance_per_unit > 0.0001;
                                    const isNegative = route.cogm_variance_per_unit < -0.0001;

                                    return (
                                        <motion.tr
                                            key={route.route_id}
                                            initial={{ opacity: 0, y: -6 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ duration: 0.15, delay: Math.min(idx * 0.02, 0.4) }}
                                            className="hover:bg-muted/40 transition-colors"
                                        >
                                            {/* Product & Version */}
                                            <td className="py-3 px-4">
                                                <div className="font-semibold text-foreground">
                                                    {route.product_name}
                                                </div>
                                                <div className="text-[10px] text-muted-foreground mt-0.5">
                                                    {route.version_name}
                                                </div>
                                            </td>

                                            {/* Operation */}
                                            <td className="py-3 px-4">
                                                <div className="font-medium text-foreground">
                                                    {route.operation_name}
                                                </div>
                                                <div className="text-[10px] text-muted-foreground">
                                                    Step #{route.sequence_order}
                                                </div>
                                            </td>

                                            {/* Cycle Time */}
                                            <td className="py-3 px-4 text-right text-muted-foreground font-mono">
                                                {route.cycle_time_hours.toFixed(2)} h
                                                <span className="block text-[9px] text-muted-foreground/80">
                                                    ({route.setup_time_hours.toFixed(1)}s + {route.run_time_hours.toFixed(1)}r)
                                                </span>
                                            </td>

                                            {/* Batch Size */}
                                            <td className="py-3 px-4 text-right font-mono">
                                                {route.step_batch_size.toLocaleString()}
                                            </td>

                                            {/* Current Overhead */}
                                            <td className="py-3 px-4 text-right font-mono text-muted-foreground">
                                                ₱{route.current_overhead_cost_per_batch.toFixed(2)}
                                                <span className="block text-[9px]">
                                                    ₱{route.current_overhead_cost_per_unit.toFixed(4)}/ea
                                                </span>
                                            </td>

                                            {/* Simulated Overhead */}
                                            <td className="py-3 px-4 text-right font-mono font-semibold text-primary">
                                                ₱{route.simulated_overhead_cost_per_batch.toFixed(2)}
                                                <span className="block text-[9px]">
                                                    ₱{route.simulated_overhead_cost_per_unit.toFixed(4)}/ea
                                                </span>
                                            </td>

                                            {/* COGM Delta Per Unit */}
                                            <td className="py-3 px-4 text-right font-mono font-bold">
                                                {isPositive ? (
                                                    <span className="text-amber-600 dark:text-amber-400 flex items-center justify-end gap-0.5">
                                                        <ArrowUpRight className="h-3 w-3" />
                                                        +₱{route.cogm_variance_per_unit.toFixed(4)}
                                                    </span>
                                                ) : isNegative ? (
                                                    <span className="text-emerald-600 dark:text-emerald-400 flex items-center justify-end gap-0.5">
                                                        <ArrowDownRight className="h-3 w-3" />
                                                        -₱{Math.abs(route.cogm_variance_per_unit).toFixed(4)}
                                                    </span>
                                                ) : (
                                                    <span className="text-muted-foreground flex items-center justify-end gap-0.5">
                                                        <Minus className="h-3 w-3" />
                                                        ₱0.0000
                                                    </span>
                                                )}
                                            </td>

                                            {/* COGM Delta Per Batch */}
                                            <td className="py-3 px-4 text-right font-mono font-bold">
                                                {isPositive ? (
                                                    <span className="text-amber-600 dark:text-amber-400">
                                                        +₱{route.cogm_variance_per_batch.toFixed(2)}
                                                    </span>
                                                ) : isNegative ? (
                                                    <span className="text-emerald-600 dark:text-emerald-400">
                                                        -₱{Math.abs(route.cogm_variance_per_batch).toFixed(2)}
                                                    </span>
                                                ) : (
                                                    <span className="text-muted-foreground">₱0.00</span>
                                                )}
                                            </td>
                                        </motion.tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Pagination Controls (No max height constraint) */}
                {!isLoading && routes.length > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground px-4 py-3 border-t bg-card">
                        <div className="flex items-center gap-1.5">
                            <span>Showing</span>
                            <span className="font-semibold font-mono text-foreground">
                                {routes.length === 0 ? 0 : startRouteIndex + 1}–{Math.min(startRouteIndex + pageSize, routes.length)}
                            </span>
                            <span>of</span>
                            <span className="font-semibold font-mono text-foreground">{routes.length}</span>
                            <span>routing steps</span>
                        </div>

                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1.5">
                                <span>Rows per page:</span>
                                <Select
                                    value={String(pageSize)}
                                    onValueChange={(val) => {
                                        setPageSize(Number(val));
                                        setCurrentPage(1);
                                    }}
                                >
                                    <SelectTrigger className="h-7 w-16 text-xs bg-background">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="10">10</SelectItem>
                                        <SelectItem value="15">15</SelectItem>
                                        <SelectItem value="25">25</SelectItem>
                                        <SelectItem value="50">50</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="flex items-center gap-1">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                    disabled={validCurrentPage <= 1}
                                    className="h-7 w-7 p-0"
                                >
                                    <ChevronLeft className="h-3.5 w-3.5" />
                                </Button>
                                <span className="px-2 font-mono text-xs">
                                    {validCurrentPage} / {totalRoutePages}
                                </span>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPage((p) => Math.min(totalRoutePages, p + 1))}
                                    disabled={validCurrentPage >= totalRoutePages}
                                    className="h-7 w-7 p-0"
                                >
                                    <ChevronRight className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
