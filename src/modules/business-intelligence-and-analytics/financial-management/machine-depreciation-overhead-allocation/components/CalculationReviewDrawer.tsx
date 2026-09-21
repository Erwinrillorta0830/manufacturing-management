"use client";

import  { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    X,
    Cpu,
    Zap,
    Wrench,
    Calculator,
 
    AlertCircle,
    Info,
    ArrowUpRight,
    ArrowDownRight,
 
    Layers,
 
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
 
import { Checkbox } from "@/components/ui/checkbox";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog";
import {
    ProductionAssetMaster,
    WorkCenterOption,
    CalculationBasis
} from "../types";

interface CalculationReviewDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    asset: ProductionAssetMaster | null;
    workCenters: WorkCenterOption[];
    onSuccessRateApplied: (workCenterId: number, newRate: number) => void;
}

export default function CalculationReviewDrawer({
    isOpen,
    onClose,
    asset,
    workCenters,
    onSuccessRateApplied
}: CalculationReviewDrawerProps) {
    const [calculationBasis, setCalculationBasis] = useState<CalculationBasis>("STRAIGHT_LINE");

    // Financial Asset Baseline
    const [acquisitionCost, setAcquisitionCost] = useState<number>(0);
    const [residualValue, setResidualValue] = useState<number>(0);
    const [usefulLife, setUsefulLife] = useState<number>(10);

    // UOP Fields & Dimensional Validation
    const [uopLifetimeUnits, setUopLifetimeUnits] = useState<number>(1000000);
    const [uopUnitOfMeasure, setUopUnitOfMeasure] = useState<string>("PCS");
    const [throughputInput, setThroughputInput] = useState<string>("100");
    const [standardUnitsPerHour, setStandardUnitsPerHour] = useState<number>(100);
    const [isUopConfirmed, setIsUopConfirmed] = useState<boolean>(false);

    // Operating Capacity inputs (strings for typing flexibility)
    const [shiftsInput, setShiftsInput] = useState<string>("2");
    const [hoursInput, setHoursInput] = useState<string>("8");
    const [daysInput, setDaysInput] = useState<string>("250");
    const [utilizationInput, setUtilizationInput] = useState<string>("75");

    // BIA Modeling Assumptions
    const [powerInput, setPowerInput] = useState<string>("0.00");
    const [maintInput, setMaintInput] = useState<string>("0.00");
    const [otherInput, setOtherInput] = useState<string>("0.00");

    // Notes
    const [notes, setNotes] = useState<string>("");

    // Confirmation Modal state
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [isApplying, setIsApplying] = useState(false);

    // Load initial asset parameters whenever selected asset changes
    useEffect(() => {
        if (!asset) return;

        const isSL = asset.depreciation_method === "Straight Line";
        setCalculationBasis(isSL ? "STRAIGHT_LINE" : "UNITS_OF_PRODUCTION");

        setAcquisitionCost(asset.acquisition_cost || 0);
        setResidualValue(asset.residual_value || 0);
        setUsefulLife(asset.life_span && asset.life_span > 0 ? asset.life_span : 10);

        const uom = asset.production_unit_shortcut || asset.production_unit || "PCS";
        const initialCapacity = asset.work_center_capacity_per_hour || 100;
        setUopLifetimeUnits(asset.maximum_unit_produced_capacity || 1000000);
        setUopUnitOfMeasure(uom);
        setStandardUnitsPerHour(initialCapacity);
        setThroughputInput(String(initialCapacity));
        setIsUopConfirmed(false);

        // Reset modeling defaults
        setShiftsInput("2");
        setHoursInput("8");
        setDaysInput("250");
        setUtilizationInput("75");
        setPowerInput("0.00");
        setMaintInput("0.00");
        setOtherInput("0.00");
        setNotes("");
    }, [asset]);

    if (!asset) return null;

    // Matched work center from Manufacturing Master Data
    const matchedWc = workCenters.find(w => w.work_center_id === asset.work_center_id);

    // Compute Scheduled & Productive Hours
    const shifts = parseFloat(shiftsInput) || 0;
    const hoursPerShift = parseFloat(hoursInput) || 0;
    const daysPerYear = parseFloat(daysInput) || 0;
    const utilization = parseFloat(utilizationInput) || 0;

    const scheduledHours = shifts * hoursPerShift * daysPerYear;
    const productiveHours = scheduledHours * (utilization / 100);

    // Compute Depreciation Burden / Hour
    const depreciableAmount = Math.max(0, acquisitionCost - residualValue);
    let deprBurdenPerHour = 0;
    let uopValidationError: string | null = null;

    if (calculationBasis === "STRAIGHT_LINE") {
        const annualDepr = usefulLife > 0 ? depreciableAmount / usefulLife : 0;
        deprBurdenPerHour = productiveHours > 0 ? annualDepr / productiveHours : 0;
    } else {
        // UOP Validation
        const deprPerUnit = uopLifetimeUnits > 0 ? depreciableAmount / uopLifetimeUnits : 0;
        if (!isUopConfirmed) {
            uopValidationError = `Cannot calculate UOP hourly burden: depreciation unit (${uopUnitOfMeasure}) must be confirmed compatible with work-center throughput capacity (${standardUnitsPerHour} units/hour).`;
            deprBurdenPerHour = 0;
        } else {
            deprBurdenPerHour = deprPerUnit * standardUnitsPerHour;
        }
    }

    // Modeling Assumptions
    const powerBurden = parseFloat(powerInput) || 0;
    const maintBurden = parseFloat(maintInput) || 0;
    const otherBurden = parseFloat(otherInput) || 0;

    const totalBurdenPerHour = deprBurdenPerHour + powerBurden + maintBurden + otherBurden;
    const currentRate = matchedWc?.overhead_cost_per_hour ?? 0;
    const rateVariance = totalBurdenPerHour - currentRate;

    const handleApplyRate = async () => {
        if (!matchedWc) {
            toast.error("Cannot apply rate: Machine is not linked to any Work Station in Manufacturing.");
            return;
        }

        if (calculationBasis === "UNITS_OF_PRODUCTION" && !isUopConfirmed) {
            toast.error(uopValidationError || "Please verify UOP unit compatibility.");
            return;
        }

        try {
            setIsApplying(true);
            const res = await fetch("/api/bia/financial-management/machine-depreciation-overhead-allocation", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    work_center_id: matchedWc.work_center_id,
                    asset_id: asset.asset_id,
                    new_overhead_cost_per_hour: totalBurdenPerHour,
                    expected_current_rate: matchedWc.overhead_cost_per_hour,
                    notes: notes || "Applied via BIA Machine Depreciation & Overhead Allocation"
                })
            });

            const data = await res.json();
            if (!res.ok || !data.ok) {
                if (res.status === 409) {
                    toast.error(data.error || "Concurrency conflict: Rate was modified by another session. Please refresh.");
                } else {
                    toast.error(data.error || "Failed to apply rate to work center.");
                }
                return;
            }

            toast.success(data.message || `Rate ₱${totalBurdenPerHour.toFixed(2)}/hr successfully applied!`);
            onSuccessRateApplied(matchedWc.work_center_id, totalBurdenPerHour);
            setIsConfirmOpen(false);
            onClose();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Network error applying rate";
            toast.error(msg);
        } finally {
            setIsApplying(false);
        }
    };

    return (
        <>
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        onClick={onClose}
                        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex justify-end"
                    >
                        <motion.div
                            initial={{ x: "100%", opacity: 0.5 }}
                            animate={{ x: 0, opacity: 1 }}
                            exit={{ x: "100%", opacity: 0 }}
                            transition={{ type: "spring", damping: 28, stiffness: 260 }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full max-w-2xl bg-card border-l h-full flex flex-col shadow-2xl overflow-hidden"
                        >
                        {/* Header */}
                        <div className="p-4 border-b bg-muted/30 flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                                    <Cpu className="h-5 w-5" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h2 className="text-sm font-bold text-foreground truncate max-w-xs">
                                            {asset.item_name}
                                        </h2>
                                        <Badge variant="outline" className="text-[10px] bg-muted text-muted-foreground">
                                            {asset.depreciation_method}
                                        </Badge>
                                    </div>
                                    <p className="text-[11px] text-muted-foreground">
                                        {asset.serial ? `S/N: ${asset.serial}` : "Production Asset Review"}
                                    </p>
                                </div>
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={onClose}
                                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>

                        {/* Body - Scrollable */}
                        <div className="flex-1 overflow-y-auto p-5 space-y-6 text-xs">
                            {/* Section 1: Financial & Asset Baseline */}
                            <div className="space-y-3">
                                <h3 className="font-semibold text-foreground flex items-center gap-1.5 uppercase text-[11px] tracking-wider text-muted-foreground">
                                    <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                                    1. Fixed Asset Financial Baseline
                                </h3>

                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl border bg-muted/20">
                                    <div className="space-y-1">
                                        <span className="text-[10px] text-muted-foreground">Acquisition Cost</span>
                                        <p className="font-semibold font-mono">
                                            ₱{acquisitionCost.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                                        </p>
                                    </div>
                                    <div className="space-y-1">
                                        <span className="text-[10px] text-muted-foreground">Residual Value</span>
                                        <p className="font-semibold font-mono">
                                            ₱{residualValue.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                                        </p>
                                    </div>
                                    <div className="space-y-1">
                                        <span className="text-[10px] text-muted-foreground">Depreciable Base</span>
                                        <p className="font-semibold font-mono text-emerald-600 dark:text-emerald-400">
                                            ₱{depreciableAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                                        </p>
                                    </div>
                                    <div className="space-y-1">
                                        <span className="text-[10px] text-muted-foreground">
                                            {calculationBasis === "STRAIGHT_LINE" ? "Useful Life" : "Lifetime Capacity"}
                                        </span>
                                        <p className="font-semibold font-mono">
                                            {calculationBasis === "STRAIGHT_LINE"
                                                ? `${usefulLife} Years`
                                                : `${uopLifetimeUnits.toLocaleString()} ${uopUnitOfMeasure}`}
                                        </p>
                                    </div>
                                    <div className="col-span-2 sm:col-span-4 space-y-1 pt-1 border-t">
                                        <span className="text-[10px] text-muted-foreground">
                                            Assigned Work Center (Manufacturing Work Station)
                                        </span>
                                        {matchedWc ? (
                                            <div className="flex items-center justify-between p-2 rounded-lg border bg-card/60">
                                                <div>
                                                    <span className="font-semibold text-foreground text-xs">{matchedWc.work_center_name}</span>
                                                </div>
                                                <Badge variant="outline" className="text-[10px] text-primary border-primary/20">
                                                    Current Rate: ₱{matchedWc.overhead_cost_per_hour.toFixed(2)}/hr
                                                </Badge>
                                            </div>
                                        ) : (
                                            <div className="p-2.5 rounded-lg border border-dashed border-amber-500/30 bg-amber-500/5 text-amber-600 dark:text-amber-400 text-[11px] flex items-center justify-between">
                                                <span>Not assigned to any Work Station in Manufacturing Master Data</span>
                                                <Badge variant="outline" className="text-[9px] border-amber-500/30 text-amber-500">
                                                    Unassigned
                                                </Badge>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Section 2: Units of Production Dimensional Compatibility */}
                            {calculationBasis === "UNITS_OF_PRODUCTION" && (
                                <div className="space-y-3">
                                    <h3 className="font-semibold text-foreground flex items-center gap-1.5 uppercase text-[11px] tracking-wider text-muted-foreground">
                                        <span className="h-1.5 w-1.5 rounded-full bg-purple-500" />
                                        2. UOP Dimensional Compatibility & Capacity
                                    </h3>

                                    <div className="p-3.5 rounded-xl border bg-purple-500/5 border-purple-500/20 space-y-3">
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="space-y-1">
                                                <div className="flex items-center justify-between">
                                                    <Label className="text-[11px] text-muted-foreground">
                                                        Depreciation Unit of Measure
                                                    </Label>
                                                    <span className="text-[9px] text-muted-foreground font-mono">Master Data</span>
                                                </div>
                                                <Input
                                                    value={uopUnitOfMeasure}
                                                    readOnly
                                                    disabled
                                                    className="h-8 text-xs font-mono font-medium bg-muted/40 text-foreground cursor-not-allowed opacity-90"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <div className="flex items-center justify-between">
                                                    <Label className="text-[11px] text-muted-foreground">
                                                        Work Station Rated Throughput / Hour
                                                    </Label>
                                                    <span className="text-[9px] text-muted-foreground font-mono">{uopUnitOfMeasure}/hr</span>
                                                </div>
                                                <Input
                                                    type="number"
                                                    value={throughputInput}
                                                    onFocus={(e) => e.target.select()}
                                                    onClick={(e) => (e.target as HTMLInputElement).select()}
                                                    onChange={(e) => {
                                                        setThroughputInput(e.target.value);
                                                        const val = parseFloat(e.target.value);
                                                        if (!isNaN(val) && val > 0) {
                                                            setStandardUnitsPerHour(val);
                                                        }
                                                        setIsUopConfirmed(false);
                                                    }}
                                                    onBlur={() => {
                                                        const val = parseFloat(throughputInput);
                                                        if (isNaN(val) || val <= 0) {
                                                            const fallback = asset.work_center_capacity_per_hour || 100;
                                                            setThroughputInput(String(fallback));
                                                            setStandardUnitsPerHour(fallback);
                                                        }
                                                    }}
                                                    className="h-8 text-xs font-mono font-medium"
                                                />
                                            </div>
                                        </div>

                                        <div className="flex items-start gap-2 pt-1">
                                            <Checkbox
                                                id="uop-confirm"
                                                checked={isUopConfirmed}
                                                onCheckedChange={(checked) => setIsUopConfirmed(Boolean(checked))}
                                                className="mt-0.5"
                                            />
                                            <label
                                                htmlFor="uop-confirm"
                                                className="text-[11px] font-normal text-foreground cursor-pointer leading-relaxed block select-none"
                                            >
                                                I confirm that the asset depreciation unit (<span className="font-semibold text-foreground">{uopUnitOfMeasure}</span>) matches the work station throughput capacity ({standardUnitsPerHour} {uopUnitOfMeasure}/hr).
                                            </label>
                                        </div>

                                        {!isUopConfirmed && (
                                            <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-[11px] flex items-center gap-2">
                                                <AlertCircle className="h-4 w-4 shrink-0" />
                                                <span>Dimensional check required: calculation is halted until unit alignment is confirmed.</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Section 3: Operational Capacity & Productive Hours (Straight Line) */}
                            {calculationBasis === "STRAIGHT_LINE" && (
                                <div className="space-y-3">
                                    <h3 className="font-semibold text-foreground flex items-center gap-1.5 uppercase text-[11px] tracking-wider text-muted-foreground">
                                        <span className="h-1.5 w-1.5 rounded-full bg-cyan-500" />
                                        2. Operating Capacity & Productive Hours
                                    </h3>

                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl border bg-card/60">
                                        <div className="space-y-1">
                                            <Label className="text-[10px] text-muted-foreground">Shifts / Day</Label>
                                            <Input
                                                type="number"
                                                value={shiftsInput}
                                                onFocus={(e) => e.target.select()}
                                                onClick={(e) => (e.target as HTMLInputElement).select()}
                                                onChange={(e) => setShiftsInput(e.target.value)}
                                                onBlur={() => {
                                                    if (!shiftsInput || parseFloat(shiftsInput) <= 0) setShiftsInput("1");
                                                }}
                                                className="h-8 text-xs font-mono font-medium"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-[10px] text-muted-foreground">Hours / Shift</Label>
                                            <Input
                                                type="number"
                                                value={hoursInput}
                                                onFocus={(e) => e.target.select()}
                                                onClick={(e) => (e.target as HTMLInputElement).select()}
                                                onChange={(e) => setHoursInput(e.target.value)}
                                                onBlur={() => {
                                                    if (!hoursInput || parseFloat(hoursInput) <= 0) setHoursInput("8");
                                                }}
                                                className="h-8 text-xs font-mono font-medium"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-[10px] text-muted-foreground">Working Days / Yr</Label>
                                            <Input
                                                type="number"
                                                value={daysInput}
                                                onFocus={(e) => e.target.select()}
                                                onClick={(e) => (e.target as HTMLInputElement).select()}
                                                onChange={(e) => setDaysInput(e.target.value)}
                                                onBlur={() => {
                                                    if (!daysInput || parseFloat(daysInput) <= 0) setDaysInput("250");
                                                }}
                                                className="h-8 text-xs font-mono font-medium"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-[10px] text-muted-foreground">Utilization %</Label>
                                            <Input
                                                type="number"
                                                value={utilizationInput}
                                                onFocus={(e) => e.target.select()}
                                                onClick={(e) => (e.target as HTMLInputElement).select()}
                                                onChange={(e) => setUtilizationInput(e.target.value)}
                                                onBlur={() => {
                                                    if (!utilizationInput || parseFloat(utilizationInput) <= 0) setUtilizationInput("75");
                                                }}
                                                className="h-8 text-xs font-mono font-medium"
                                            />
                                        </div>

                                        <div className="col-span-2 sm:col-span-4 grid grid-cols-2 gap-3 pt-2 border-t mt-1">
                                            <div className="p-2 rounded-lg bg-muted/40 flex items-center justify-between">
                                                <span className="text-[11px] text-muted-foreground">Annual Scheduled Hours:</span>
                                                <span className="font-bold font-mono text-foreground">{scheduledHours.toLocaleString()} h</span>
                                            </div>
                                            <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 flex items-center justify-between">
                                                <span className="text-[11px]">Productive Operating Hours:</span>
                                                <span className="font-bold font-mono">{productiveHours.toLocaleString()} h</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Section 4: Overhead Modeling Assumptions */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <h3 className="font-semibold text-foreground flex items-center gap-1.5 uppercase text-[11px] tracking-wider text-muted-foreground">
                                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                                        3. Overhead Modeling Assumptions
                                    </h3>
                                    <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-600 dark:text-amber-400">
                                        Scenario Assumptions
                                    </Badge>
                                </div>
                                <p className="text-[11px] text-muted-foreground leading-tight">
                                    Operational cost estimates modeled to compute comprehensive machine burden. These are modeling assumptions rather than ledger entries.
                                </p>

                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-xl border bg-card/60">
                                    <div className="space-y-1.5">
                                        <Label className="text-[11px] text-muted-foreground flex items-center gap-1">
                                            <Zap className="h-3 w-3 text-amber-500" />
                                            Power Cost Assumption / Hr
                                        </Label>
                                        <div className="relative">
                                            <span className="absolute left-2.5 top-2 text-xs text-muted-foreground">₱</span>
                                            <Input
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                value={powerInput}
                                                onFocus={(e) => e.target.select()}
                                                onClick={(e) => (e.target as HTMLInputElement).select()}
                                                onChange={(e) => setPowerInput(e.target.value)}
                                                onBlur={() => {
                                                    if (!powerInput || isNaN(parseFloat(powerInput))) setPowerInput("0.00");
                                                }}
                                                className="pl-6 h-8 text-xs font-mono font-medium"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className="text-[11px] text-muted-foreground flex items-center gap-1">
                                            <Wrench className="h-3 w-3 text-blue-500" />
                                            Maint. Cost Assumption / Hr
                                        </Label>
                                        <div className="relative">
                                            <span className="absolute left-2.5 top-2 text-xs text-muted-foreground">₱</span>
                                            <Input
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                value={maintInput}
                                                onFocus={(e) => e.target.select()}
                                                onClick={(e) => (e.target as HTMLInputElement).select()}
                                                onChange={(e) => setMaintInput(e.target.value)}
                                                onBlur={() => {
                                                    if (!maintInput || isNaN(parseFloat(maintInput))) setMaintInput("0.00");
                                                }}
                                                className="pl-6 h-8 text-xs font-mono font-medium"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className="text-[11px] text-muted-foreground flex items-center gap-1">
                                            <Calculator className="h-3 w-3 text-purple-500" />
                                            Other Overhead Assumption / Hr
                                        </Label>
                                        <div className="relative">
                                            <span className="absolute left-2.5 top-2 text-xs text-muted-foreground">₱</span>
                                            <Input
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                value={otherInput}
                                                onFocus={(e) => e.target.select()}
                                                onClick={(e) => (e.target as HTMLInputElement).select()}
                                                onChange={(e) => setOtherInput(e.target.value)}
                                                onBlur={() => {
                                                    if (!otherInput || isNaN(parseFloat(otherInput))) setOtherInput("0.00");
                                                }}
                                                className="pl-6 h-8 text-xs font-mono font-medium"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Section 5: Rate Calculation & Variance Comparison */}
                            <div className="space-y-3">
                                <h3 className="font-semibold text-foreground flex items-center gap-1.5 uppercase text-[11px] tracking-wider text-muted-foreground">
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                    4. Rate Comparison & Manufacturing Costing Impact
                                </h3>

                                <div className="rounded-xl border bg-muted/20 p-4 space-y-3">
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                                        <div className="p-2 rounded-lg bg-card border">
                                            <span className="text-[10px] text-muted-foreground block">Depr. Burden</span>
                                            <span className="text-xs font-bold font-mono text-emerald-600 dark:text-emerald-400">
                                                ₱{deprBurdenPerHour.toFixed(2)}/hr
                                            </span>
                                        </div>
                                        <div className="p-2 rounded-lg bg-card border">
                                            <span className="text-[10px] text-muted-foreground block">Assumptions Total</span>
                                            <span className="text-xs font-bold font-mono">
                                                ₱{(powerBurden + maintBurden + otherBurden).toFixed(2)}/hr
                                            </span>
                                        </div>
                                        <div className="p-2 rounded-lg bg-card border">
                                            <span className="text-[10px] text-muted-foreground block">Calculated Burden</span>
                                            <span className="text-xs font-bold font-mono text-primary">
                                                ₱{totalBurdenPerHour.toFixed(2)}/hr
                                            </span>
                                        </div>
                                        <div className="p-2 rounded-lg bg-card border">
                                            <span className="text-[10px] text-muted-foreground block">Current Rate</span>
                                            <span className="text-xs font-bold font-mono text-muted-foreground">
                                                ₱{currentRate.toFixed(2)}/hr
                                            </span>
                                        </div>
                                    </div>

                                    {/* Variance Callout */}
                                    <div className="p-3 rounded-lg border bg-card flex items-center justify-between">
                                        <div>
                                            <span className="text-xs font-semibold text-foreground block">
                                                Hourly Rate Variance (Δ)
                                            </span>
                                            <span className="text-[11px] text-muted-foreground">
                                                Difference between proposed machine burden and active workstation rate
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            {Math.abs(rateVariance) < 0.001 ? (
                                                <Badge variant="outline" className="text-xs text-muted-foreground">Balanced</Badge>
                                            ) : rateVariance > 0 ? (
                                                <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-600 border-amber-500/30">
                                                    <ArrowUpRight className="h-3.5 w-3.5 mr-1" />
                                                    +₱{rateVariance.toFixed(2)}/hr
                                                </Badge>
                                            ) : (
                                                <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                                                    <ArrowDownRight className="h-3.5 w-3.5 mr-1" />
                                                    -₱{Math.abs(rateVariance).toFixed(2)}/hr
                                                </Badge>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Drawer Footer Actions */}
                        <div className="p-4 border-t bg-muted/30 flex items-center justify-between">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={onClose}
                                className="h-9 text-xs"
                            >
                                Close
                            </Button>

                            <Button
                                size="sm"
                                onClick={() => setIsConfirmOpen(true)}
                                disabled={!matchedWc || (calculationBasis === "UNITS_OF_PRODUCTION" && !isUopConfirmed) || totalBurdenPerHour <= 0}
                                className="h-9 text-xs gap-1.5 px-4 bg-primary text-primary-foreground hover:bg-primary/90"
                            >
                                <Layers className="h-3.5 w-3.5" />
                                <span>Apply Rate to Work Center</span>
                            </Button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>

            {/* Confirmation Modal */}
            <Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-base">
                            <Layers className="h-5 w-5 text-primary" />
                            Apply Machine Burden Rate to Work Station?
                        </DialogTitle>
                        <DialogDescription className="text-xs">
                            Please review the rate change before applying it to Manufacturing Costing.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3 py-2 text-xs">
                        <div className="rounded-lg border p-3 bg-muted/20 space-y-2">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Machine:</span>
                                <span className="font-semibold text-foreground">{asset.item_name}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Target Work Station:</span>
                                <span className="font-semibold text-foreground">{matchedWc?.work_center_name}</span>
                            </div>
                            <div className="border-t pt-2 flex justify-between">
                                <span className="text-muted-foreground">Current Operational Rate:</span>
                                <span className="font-mono font-medium">₱{currentRate.toFixed(4)}/hr</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Calculated Machine Burden:</span>
                                <span className="font-mono font-bold text-primary">₱{totalBurdenPerHour.toFixed(4)}/hr</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Rate Variance:</span>
                                <span className={rateVariance >= 0 ? "font-mono font-bold text-amber-600" : "font-mono font-bold text-emerald-600"}>
                                    {rateVariance >= 0 ? `+₱${rateVariance.toFixed(4)}/hr` : `-₱${Math.abs(rateVariance).toFixed(4)}/hr`}
                                </span>
                            </div>
                        </div>

                        {/* Critical Invariant Callout */}
                        <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-700 dark:text-blue-300 text-[11px] space-y-1">
                            <div className="flex items-center gap-1.5 font-semibold">
                                <Info className="h-3.5 w-3.5 shrink-0" />
                                <span>Historical Costing Protection</span>
                            </div>
                            <p className="leading-relaxed">
                                Existing Job Order step rate snapshots are unaffected when this rate is applied. Future Job Orders and BOM calculations will consume the newly applied rate.
                            </p>
                        </div>
                    </div>

                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setIsConfirmOpen(false)}
                            disabled={isApplying}
                            className="h-8 text-xs"
                        >
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            onClick={handleApplyRate}
                            disabled={isApplying}
                            className="h-8 text-xs gap-1.5"
                        >
                            {isApplying ? "Updating..." : "Confirm & Apply Rate"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
