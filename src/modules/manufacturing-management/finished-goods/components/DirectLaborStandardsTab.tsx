/* eslint-disable */
"use client";

import React from "react";
import { Plus, Trash2, Users, Briefcase, Calculator, ShieldCheck, Clock, CheckCircle2 } from "lucide-react";
import { VersionLaborPosition } from "../types";
import { CreatableSelect } from "./CreatableSelect";
import { Button } from "@/components/ui/button";
import { calculatePositionBatchCost } from "../costing";

interface DirectLaborStandardsTabProps {
    editedVersionDetails: any;
    setEditedVersionDetails: React.Dispatch<React.SetStateAction<any>>;
    setHasUnsavedChanges: (val: boolean) => void;
    /** When true, all fields are read-only. */
    isVersionLocked?: boolean;
}

export const DirectLaborStandardsTab: React.FC<DirectLaborStandardsTabProps> = ({
    editedVersionDetails,
    setEditedVersionDetails,
    setHasUnsavedChanges,
    isVersionLocked = false
}) => {
    const [productionPositions, setProductionPositions] = React.useState<any[]>([]);

    React.useEffect(() => {
        fetch("/api/manufacturing/finished-goods/positions")
            .then((res) => (res.ok ? res.json() : []))
            .then((data) => {
                if (Array.isArray(data)) setProductionPositions(data);
            })
            .catch((err) => console.error("Error loading production positions:", err));
    }, []);

    // Clean position options showing concise position titles
    const positionOptions = React.useMemo(() => {
        return productionPositions.map(p => ({
            value: p.position_name,
            label: p.position_name
        }));
    }, [productionPositions]);

    const versionLaborPositions: VersionLaborPosition[] = React.useMemo(() => {
        return editedVersionDetails?.labor_positions || [];
    }, [editedVersionDetails]);

    const baseQuantity = React.useMemo(() => {
        return Math.max(1, Number(editedVersionDetails?.base_quantity) || 1);
    }, [editedVersionDetails?.base_quantity]);

    // Derived Summary Metrics matching Sheet MPB454G
    const totalLaborBatchCost = React.useMemo(() => {
        return versionLaborPositions.reduce((sum, pos) => sum + calculatePositionBatchCost(pos), 0);
    }, [versionLaborPositions]);

    const directProductionBatchCost = React.useMemo(() => {
        return versionLaborPositions
            .filter(pos => pos.category !== "maintenance")
            .reduce((sum, pos) => sum + calculatePositionBatchCost(pos), 0);
    }, [versionLaborPositions]);

    const maintenanceBatchCost = React.useMemo(() => {
        return versionLaborPositions
            .filter(pos => pos.category === "maintenance")
            .reduce((sum, pos) => sum + calculatePositionBatchCost(pos), 0);
    }, [versionLaborPositions]);

    const totalStatutoryMandatesCost = React.useMemo(() => {
        return versionLaborPositions.reduce((sum, pos) => {
            if (pos.include_mandates === false || pos.category === "maintenance") return sum;
            const count = Math.max(0, Number(pos.manpower_count) || 0);
            const dailyRate = Math.max(0, Number(pos.daily_rate) || (Number(pos.hourly_rate) * 8) || 0);
            const sss = Number(pos.sss_amount) || (dailyRate * 0.0954);
            const phic = Number(pos.phic_amount) || (200 / 26);
            const hdmf = Number(pos.hdmf_amount) || (100 / 26);
            return sum + ((sss + phic + hdmf) * count);
        }, 0);
    }, [versionLaborPositions]);

    const laborCostPerUnit = React.useMemo(() => {
        return totalLaborBatchCost / baseQuantity;
    }, [totalLaborBatchCost, baseQuantity]);

    const handleAddVersionLaborPosition = () => {
        const defaultPos = productionPositions[0];
        const daily = defaultPos ? Number(defaultPos.daily_rate || 505) : 505;
        const hourly = defaultPos ? Number(defaultPos.hourly_rate || (daily / 8) || 63.13) : 63.13;
        const newPos: VersionLaborPosition = {
            id: `vpos-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            position_name: defaultPos?.position_name || "OPERATOR",
            category: "direct_labor",
            manpower_count: 1,
            hourly_rate: hourly,
            daily_rate: daily,
            hours_required: 8,
            ot_hours: 0,
            include_mandates: true
        };
        const currentList = editedVersionDetails?.labor_positions || [];
        setEditedVersionDetails((prev: any) => ({
            ...prev,
            labor_positions: [...currentList, newPos]
        }));
        setHasUnsavedChanges(true);
    };

    const handleUpdateVersionLaborPosition = (index: number, field: keyof VersionLaborPosition, value: any) => {
        const currentList = [...(editedVersionDetails?.labor_positions || [])];
        if (!currentList[index]) return;

        let updatedItem = { ...currentList[index], [field]: value };

        if (field === "position_name") {
            const match = productionPositions.find(p => p.position_name.toLowerCase() === String(value).toLowerCase());
            if (match) {
                const daily = Number(match.daily_rate || 505);
                const hourly = Number(match.hourly_rate || (daily / 8) || 63.13);
                updatedItem.position_id = match.id || null;
                updatedItem.daily_rate = daily;
                updatedItem.hourly_rate = hourly;
            }
        } else if (field === "hourly_rate") {
            const hRate = parseFloat(value);
            if (!isNaN(hRate)) {
                updatedItem.daily_rate = Math.round(hRate * 8 * 100) / 100;
            }
        } else if (field === "daily_rate") {
            const dRate = parseFloat(value);
            if (!isNaN(dRate)) {
                updatedItem.hourly_rate = Math.round((dRate / 8) * 100) / 100;
            }
        }

        currentList[index] = updatedItem;
        setEditedVersionDetails((prev: any) => ({
            ...prev,
            labor_positions: currentList
        }));
        setHasUnsavedChanges(true);
    };

    const handleDeleteVersionLaborPosition = (index: number) => {
        const currentList = [...(editedVersionDetails?.labor_positions || [])];
        const updatedList = currentList.filter((_, idx) => idx !== index);
        setEditedVersionDetails((prev: any) => ({
            ...prev,
            labor_positions: updatedList
        }));
        setHasUnsavedChanges(true);
    };

    return (
        <div className="bg-card border border-border/70 rounded-xl p-5 shadow-xs space-y-5 backdrop-blur-md bg-card/95">
            {/* Header Title Section */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-border/50 pb-4">
                <div className="space-y-0.5">
                    <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                        <Briefcase className="h-4 w-4 text-primary" /> Direct Labor Standards &amp; Benefits (MPB454G Model)
                    </h3>
                    <p className="text-xs text-muted-foreground">
                        Configure version-level headcount, daily wages, overtime, and statutory benefit allowances (SSS 9.54%, PHIC, Pag-IBIG) for batch output ({baseQuantity.toLocaleString()} units).
                    </p>
                </div>
                {!isVersionLocked && (
                    <Button
                        id="add-version-labor-pos-btn"
                        aria-label="Add Direct Labor Standard Position"
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleAddVersionLaborPosition}
                        className="h-8 text-xs border-primary/30 text-primary hover:bg-primary/10 shadow-2xs font-semibold cursor-pointer shrink-0"
                    >
                        <Plus className="h-3.5 w-3.5 mr-1" /> Add Position
                    </Button>
                )}
            </div>

            {/* KPI Cards Banner */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 p-3.5 rounded-xl bg-muted/20 border border-border/50 text-xs">
                <div className="space-y-1">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Total Batch Labor Cost</span>
                    <span className="text-sm font-extrabold font-mono text-primary">₱{totalLaborBatchCost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div className="space-y-1 border-l pl-3 border-border/40">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Direct Line Labor</span>
                    <span className="text-sm font-extrabold font-mono text-foreground">₱{directProductionBatchCost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div className="space-y-1 border-l pl-3 border-border/40">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Maintenance &amp; Support</span>
                    <span className="text-sm font-extrabold font-mono text-amber-600 dark:text-amber-400">₱{maintenanceBatchCost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div className="space-y-1 border-l pl-3 border-border/40">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Statutory Mandates</span>
                    <span className="text-sm font-extrabold font-mono text-blue-600 dark:text-blue-400">₱{totalStatutoryMandatesCost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div className="space-y-1 border-l pl-3 border-border/40">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Labor Cost / Unit</span>
                    <span className="text-sm font-extrabold font-mono text-emerald-600 dark:text-emerald-400">₱{laborCostPerUnit.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}</span>
                </div>
            </div>

            {/* Labor Positions Table */}
            {versionLaborPositions.length === 0 ? (
                <div className="text-center py-10 border border-dashed rounded-xl border-border/70 bg-muted/5 text-muted-foreground space-y-2">
                    <Users className="h-9 w-9 text-muted-foreground/40 mx-auto mb-1" />
                    <p className="text-xs font-semibold text-foreground">
                        {isVersionLocked
                            ? "No labor positions configured for this version."
                            : "No labor positions configured for this version yet."}
                    </p>
                    <p className="text-[11px] text-muted-foreground max-w-sm mx-auto">
                        {isVersionLocked
                            ? "This version is locked in read-only mode. Labor allocations and staff positions cannot be modified."
                            : "Add staff positions to allocate production labor, overtime, and statutory government benefit allowances."}
                    </p>
                    {!isVersionLocked && (
                        <Button
                            id="add-first-version-labor-pos-btn"
                            aria-label="Add First Direct Labor Standard"
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={handleAddVersionLaborPosition}
                            className="mt-2 h-7 text-xs text-primary hover:bg-primary/10 font-semibold cursor-pointer"
                        >
                            + Add First Labor Position
                        </Button>
                    )}
                </div>
            ) : (
                <div className="overflow-x-auto rounded-xl border border-border/80 bg-card shadow-2xs">
                    <table className="w-full text-left text-xs border-collapse">
                        <thead>
                            <tr className="bg-muted/40 border-b border-border/80 text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                                <th className="py-2.5 px-3 w-48">Position Role</th>
                                <th className="py-2.5 px-2 text-center w-28">Category</th>
                                <th className="py-2.5 px-2 text-center w-16">Headcount</th>
                                <th className="py-2.5 px-3 text-right w-28">Daily Wage (₱)</th>
                                <th className="py-2.5 px-2 text-center w-16">OT (Hrs)</th>
                                <th className="py-2.5 px-3 text-center w-36">Gov Benefits</th>
                                <th className="py-2.5 px-3 text-right w-32">Position Cost</th>
                                {!isVersionLocked && <th className="py-2.5 px-2 text-center w-12">Action</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                            {versionLaborPositions.map((pos, pIdx) => {
                                const headcount = Math.max(0, Number(pos.manpower_count) || 0);
                                const dailyWage = Math.max(0, Number(pos.daily_rate) || (Number(pos.hourly_rate) * 8) || 0);

                                const sss = pos.include_mandates !== false ? (Number(pos.sss_amount) || (dailyWage * 0.0954)) : 0;
                                const phic = pos.include_mandates !== false ? (Number(pos.phic_amount) || (200 / 26)) : 0;
                                const hdmf = pos.include_mandates !== false ? (Number(pos.hdmf_amount) || (100 / 26)) : 0;
                                const mandateTotalPerWorker = sss + phic + hdmf;

                                const batchPositionCost = calculatePositionBatchCost(pos);

                                return (
                                    <tr key={pos.id || pIdx} className="hover:bg-muted/15 transition-colors">
                                        {/* Position Title Select */}
                                        <td className="py-2 px-3">
                                            <div className="w-44">
                                                <CreatableSelect
                                                    options={positionOptions}
                                                    value={pos.position_name}
                                                    disabled={isVersionLocked}
                                                    onValueChange={(val) => handleUpdateVersionLaborPosition(pIdx, "position_name", val)}
                                                    onCreateOption={(newVal) => handleUpdateVersionLaborPosition(pIdx, "position_name", newVal)}
                                                    placeholder="Position title..."
                                                    className="h-7 text-xs border-input/70 bg-background font-medium"
                                                />
                                            </div>
                                        </td>

                                        {/* Category Select */}
                                        <td className="py-2 px-2 text-center">
                                            <select
                                                aria-label={`Category for position ${pIdx + 1}`}
                                                value={pos.category || "direct_labor"}
                                                disabled={isVersionLocked}
                                                onChange={(e) => handleUpdateVersionLaborPosition(pIdx, "category", e.target.value)}
                                                className={`h-7 rounded border px-1.5 py-0.5 text-[11px] font-semibold outline-none transition-colors disabled:opacity-50 ${
                                                    pos.category === "maintenance"
                                                        ? "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400"
                                                        : "bg-primary/10 border-primary/20 text-primary"
                                                }`}
                                            >
                                                <option value="direct_labor">Direct Line</option>
                                                <option value="maintenance">Maintenance</option>
                                            </select>
                                        </td>

                                        {/* Headcount Input */}
                                        <td className="py-2 px-2 text-center">
                                            <input
                                                id={`version-labor-manpower-${pIdx}`}
                                                aria-label={`Headcount for position ${pIdx + 1}`}
                                                type="number"
                                                min="1"
                                                disabled={isVersionLocked}
                                                value={pos.manpower_count === "" || pos.manpower_count === null || pos.manpower_count === undefined ? "" : pos.manpower_count}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    if (val === "") {
                                                        handleUpdateVersionLaborPosition(pIdx, "manpower_count", "");
                                                    } else {
                                                        const num = parseInt(val, 10);
                                                        handleUpdateVersionLaborPosition(pIdx, "manpower_count", isNaN(num) ? "" : num);
                                                    }
                                                }}
                                                onBlur={(e) => {
                                                    const num = parseInt(e.target.value, 10);
                                                    if (isNaN(num) || num < 1) {
                                                        handleUpdateVersionLaborPosition(pIdx, "manpower_count", 1);
                                                    }
                                                }}
                                                className="w-12 h-7 text-center rounded border border-input bg-background text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 disabled:bg-muted/30"
                                            />
                                        </td>

                                        {/* Daily Wage Input */}
                                        <td className="py-2 px-3 text-right">
                                            <div className="relative flex items-center justify-end">
                                                <span className="absolute left-1 text-muted-foreground text-[11px] font-mono">₱</span>
                                                <input
                                                    id={`version-labor-rate-${pIdx}`}
                                                    aria-label={`Daily wage for position ${pIdx + 1}`}
                                                    type="number"
                                                    step="0.01"
                                                    min="0"
                                                    disabled={isVersionLocked}
                                                    value={pos.daily_rate === "" || pos.daily_rate === null || pos.daily_rate === undefined ? "" : pos.daily_rate}
                                                    onChange={(e) => handleUpdateVersionLaborPosition(pIdx, "daily_rate", e.target.value)}
                                                    className="w-20 h-7 pl-3 text-right font-mono rounded border border-input bg-background px-1 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 disabled:bg-muted/30"
                                                />
                                            </div>
                                        </td>

                                        {/* OT Hours Input */}
                                        <td className="py-2 px-2 text-center">
                                            <input
                                                id={`version-labor-ot-${pIdx}`}
                                                aria-label={`Overtime hours for position ${pIdx + 1}`}
                                                type="number"
                                                step="0.5"
                                                min="0"
                                                disabled={isVersionLocked}
                                                value={pos.ot_hours === "" || pos.ot_hours === null || pos.ot_hours === undefined ? "" : pos.ot_hours}
                                                onChange={(e) => handleUpdateVersionLaborPosition(pIdx, "ot_hours", e.target.value)}
                                                className="w-12 h-7 text-center font-mono rounded border border-input bg-background px-1 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 disabled:bg-muted/30"
                                            />
                                        </td>

                                        {/* Statutory Benefits Checkbox & Badge */}
                                        <td className="py-2 px-3 text-center">
                                            <div className="flex items-center justify-center gap-1.5">
                                                <input
                                                    id={`version-labor-mandates-check-${pIdx}`}
                                                    aria-label={`Include government mandates for position ${pIdx + 1}`}
                                                    type="checkbox"
                                                    disabled={isVersionLocked}
                                                    checked={pos.include_mandates !== false}
                                                    onChange={(e) => handleUpdateVersionLaborPosition(pIdx, "include_mandates", e.target.checked)}
                                                    className="rounded border-input text-primary focus:ring-primary h-3.5 w-3.5 cursor-pointer disabled:opacity-50"
                                                />
                                                {pos.include_mandates !== false ? (
                                                    <span 
                                                        className="inline-flex items-center bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold"
                                                        title={`SSS: ₱${sss.toFixed(2)} | PHIC: ₱${phic.toFixed(2)} | HDMF: ₱${hdmf.toFixed(2)}`}
                                                    >
                                                        +₱{mandateTotalPerWorker.toFixed(2)}
                                                    </span>
                                                ) : (
                                                    <span className="text-[10px] text-muted-foreground italic">None</span>
                                                )}
                                            </div>
                                        </td>

                                        {/* Position Cost Display */}
                                        <td className="py-2 px-3 text-right font-mono font-bold text-foreground">
                                            ₱{batchPositionCost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>

                                        {/* Action Button */}
                                        {!isVersionLocked && (
                                            <td className="py-2 px-2 text-center">
                                                <Button
                                                    id={`delete-version-labor-pos-btn-${pIdx}`}
                                                    aria-label={`Delete position ${pos.position_name}`}
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleDeleteVersionLaborPosition(pIdx)}
                                                    className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer rounded-md transition-colors"
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            </td>
                                        )}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};
