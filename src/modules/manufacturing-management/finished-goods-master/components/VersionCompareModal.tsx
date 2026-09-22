/* eslint-disable */
"use client";

import React, { useState, useEffect } from "react";
import { 
    GitCompare, 
    X, 
    Loader2, 
    ArrowRight, 
    ArrowLeftRight,
    TrendingUp, 
    TrendingDown, 
    Package, 
    Briefcase, 
    Calculator, 
    GitFork, 
    DollarSign, 
    CheckCircle2, 
    AlertTriangle,
    Layers,
    Shield
} from "lucide-react";
import { ProductVersion } from "../types";

interface VersionCompareModalProps {
    isOpen: boolean;
    onClose: () => void;
    productId: string | number;
    productTitle: string;
    versions: ProductVersion[];
    currentVersionId?: number | null;
}

const formatCurrency = (val: number | string | null | undefined): string => {
    const num = Number(val || 0);
    return num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const VersionCompareModal: React.FC<VersionCompareModalProps> = ({
    isOpen,
    onClose,
    productId,
    productTitle,
    versions,
    currentVersionId
}) => {
    const [baseVersionId, setBaseVersionId] = useState<number | "">(
        currentVersionId || (versions[0]?.version_id || "")
    );
    const [targetVersionId, setTargetVersionId] = useState<number | "">("");

    const [activeSubTab, setActiveSubTab] = useState<"summary" | "bom_routes" | "labor" | "overheads">("summary");
    const [loading, setLoading] = useState(false);
    const [compareData, setCompareData] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    const handleSwapVersions = () => {
        if (!baseVersionId || !targetVersionId) return;
        const prevBase = baseVersionId;
        const prevTarget = targetVersionId;
        setBaseVersionId(prevTarget);
        setTargetVersionId(prevBase);
    };

    useEffect(() => {
        if (!isOpen) return;
        setBaseVersionId(currentVersionId || (versions[0]?.version_id || ""));
        setTargetVersionId("");
        setCompareData(null);
        setError(null);
    }, [isOpen, currentVersionId, versions]);

    useEffect(() => {
        if (!isOpen) return;

        if (!targetVersionId || !baseVersionId) {
            setLoading(false);
            setCompareData(null);
            setError(null);
            return;
        }

        if (String(baseVersionId) === String(targetVersionId)) {
            setLoading(false);
            setCompareData(null);
            setError("Base version and Target version cannot be identical. Please select different versions to compare.");
            return;
        }

        async function fetchComparison() {
            setLoading(true);
            setError(null);
            try {
                let url = `/api/manufacturing/finished-goods/versions/approvals/compare?targetVersionId=${targetVersionId}&baseVersionId=${baseVersionId}`;

                const res = await fetch(url);
                if (!res.ok) {
                    const errData = await res.json().catch(() => ({}));
                    throw new Error(errData.error || "Failed to compare versions");
                }
                const data = await res.json();
                setCompareData(data);
            } catch (err: any) {
                console.error("Error fetching version comparison:", err);
                setError(err.message || "Failed to load version comparison");
            } finally {
                setLoading(false);
            }
        }

        fetchComparison();
    }, [isOpen, targetVersionId, baseVersionId]);

    if (!isOpen) return null;

    const costImpact = compareData?.costImpact || {};
    const targetVer = compareData?.targetVersion;
    const baseVer = compareData?.baseVersion;
    const componentDiffs = compareData?.componentDiffs?.all || [];
    const routingDiffs = compareData?.routingDiffs?.all || [];
    const laborDiffs = compareData?.laborDiffs || [];
    const overheadDiffs = compareData?.overheadDiffs || [];

    const totalCostDiff = costImpact.totalCostDiff || 0;
    const isCostIncrease = totalCostDiff > 0;
    const isCostDecrease = totalCostDiff < 0;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md animate-in fade-in duration-200 p-4">
            <div className="bg-card border border-border/80 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b shrink-0 bg-muted/20">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-primary/10 border border-primary/20 text-primary">
                            <GitCompare className="h-5 w-5" />
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                                Version Comparison Matrix
                                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-muted text-muted-foreground border">
                                    {productTitle}
                                </span>
                            </h3>
                            <p className="text-xs text-muted-foreground">
                                Side-by-side analysis of BOM materials, routing steps, direct labor standards, and overhead items.
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-muted-foreground hover:text-foreground p-1.5 hover:bg-muted rounded-lg transition-colors cursor-pointer"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Version Selector Bar */}
                <div className="px-6 py-3 border-b bg-muted/10 flex flex-wrap items-center justify-between gap-4 shrink-0">
                    <div className="flex items-center gap-3 flex-1 min-w-[280px]">
                        <div className="flex flex-col gap-1 flex-1">
                            <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">
                                Base Version (Reference)
                            </label>
                            <select
                                value={baseVersionId}
                                onChange={(e) => setBaseVersionId(e.target.value ? Number(e.target.value) : "")}
                                className="rounded-lg border px-3 py-1.5 bg-background text-xs font-semibold text-foreground outline-none focus:ring-1 focus:ring-primary"
                            >
                                <option value="">Select Base Version...</option>
                                {versions.map((v) => {
                                    const isSelectedInTarget = Boolean(targetVersionId && v.version_id === targetVersionId);
                                    return (
                                        <option 
                                            key={`base-${v.version_id}`} 
                                            value={v.version_id}
                                            disabled={isSelectedInTarget}
                                        >
                                            {v.version_name} {v.is_active ? "[ACTIVE]" : ""} ({v.status || "Draft"}){isSelectedInTarget ? " (Selected in Target)" : ""}
                                        </option>
                                    );
                                })}
                            </select>
                        </div>

                        {/* Interactive Swap Button */}
                        <div className="pt-4 flex items-center justify-center shrink-0">
                            <button
                                type="button"
                                onClick={handleSwapVersions}
                                disabled={!baseVersionId || !targetVersionId}
                                className="p-2 rounded-lg border bg-background hover:bg-primary/10 hover:text-primary hover:border-primary/40 text-muted-foreground transition-all cursor-pointer shadow-2xs disabled:opacity-40 disabled:cursor-not-allowed"
                                title="Swap Base and Target Versions"
                            >
                                <ArrowLeftRight className="h-4 w-4" />
                            </button>
                        </div>

                        <div className="flex flex-col gap-1 flex-1">
                            <label className="text-[10px] font-bold uppercase text-primary tracking-wider">
                                Target Version (Comparing)
                            </label>
                            <select
                                value={targetVersionId}
                                onChange={(e) => setTargetVersionId(e.target.value ? Number(e.target.value) : "")}
                                className="rounded-lg border border-primary/50 px-3 py-1.5 bg-background text-xs font-bold text-foreground outline-none focus:ring-1 focus:ring-primary"
                            >
                                <option value="">Select Target Version...</option>
                                {versions.map((v) => {
                                    const isSelectedInBase = Boolean(baseVersionId && v.version_id === baseVersionId);
                                    return (
                                        <option 
                                            key={`target-${v.version_id}`} 
                                            value={v.version_id}
                                            disabled={isSelectedInBase}
                                        >
                                            {v.version_name} {v.is_active ? "[ACTIVE]" : ""} ({v.status || "Draft"}){isSelectedInBase ? " (Selected in Base)" : ""}
                                        </option>
                                    );
                                })}
                            </select>
                        </div>
                    </div>

                    {costImpact && !loading && targetVersionId && (
                        <div className="flex items-center gap-3 shrink-0 pl-4 border-l border-border/60">
                            <div className="text-right">
                                <span className="text-[10px] uppercase font-bold text-muted-foreground block">Cost Delta</span>
                                <span className={`text-sm font-extrabold font-mono flex items-center justify-end gap-1 ${
                                    isCostIncrease ? "text-red-500" : isCostDecrease ? "text-emerald-500" : "text-foreground"
                                }`}>
                                    {isCostIncrease && <TrendingUp className="h-3.5 w-3.5" />}
                                    {isCostDecrease && <TrendingDown className="h-3.5 w-3.5" />}
                                    {totalCostDiff >= 0 ? "+" : ""}₱{formatCurrency(totalCostDiff)} ({costImpact.percentageChange >= 0 ? "+" : ""}{costImpact.percentageChange}%)
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Sub-Tab Navigation Bar */}
                <div className="flex border-b px-6 bg-card shrink-0 gap-2">
                    {[
                        { id: "summary", label: "Financial Cost Summary", icon: DollarSign },
                        { id: "bom_routes", label: "Routes & BOM Recipe", icon: GitFork },
                        { id: "labor", label: "Direct Labor Standards", icon: Briefcase },
                        { id: "overheads", label: "Overhead Management", icon: Calculator }
                    ].map((tab) => {
                        const Icon = tab.icon;
                        const isActive = activeSubTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => setActiveSubTab(tab.id as any)}
                                className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all -mb-[1px] cursor-pointer ${
                                    isActive
                                        ? "border-primary text-primary bg-primary/5"
                                        : "border-transparent text-muted-foreground hover:text-foreground"
                                }`}
                            >
                                <Icon className="h-3.5 w-3.5" />
                                {tab.label}
                            </button>
                        );
                    })}
                </div>

                {/* Modal Content */}
                <div className="flex-1 overflow-y-auto p-6 min-h-0 relative">
                    {!targetVersionId ? (
                        <div className="flex flex-col items-center justify-center p-16 text-center max-w-md mx-auto my-auto h-full">
                            <div className="p-4 rounded-2xl bg-primary/10 border border-primary/20 text-primary mb-4">
                                <GitCompare className="h-10 w-10" />
                            </div>
                            <h4 className="text-base font-bold text-foreground mb-1">Select a Target Version</h4>
                            <p className="text-xs text-muted-foreground">
                                Choose a target version from the dropdown above to compare BOM components, routings, labor standards, and overheads side-by-side against the selected base version.
                            </p>
                        </div>
                    ) : loading ? (
                        <div className="flex flex-col items-center justify-center p-20 text-muted-foreground h-full">
                            <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
                            <span className="text-xs font-semibold">Comparing version parameters...</span>
                        </div>
                    ) : error ? (
                        <div className="flex flex-col items-center justify-center p-12 text-center text-destructive">
                            <AlertTriangle className="h-10 w-10 mb-2" />
                            <p className="text-sm font-bold">{error}</p>
                            <p className="text-xs text-muted-foreground mt-1">Please select valid versions to compare.</p>
                        </div>
                    ) : compareData ? (
                        <div className="space-y-6">
                            {/* Summary Tab */}
                            {activeSubTab === "summary" && (
                                <div className="space-y-6">
                                    {/* Comparison KPI Grid */}
                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                        <div className="bg-card border rounded-xl p-4 space-y-1.5 shadow-2xs">
                                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Material Cost</span>
                                            <div className="flex items-baseline justify-between">
                                                <span className="text-xs text-muted-foreground font-mono">₱{formatCurrency(costImpact.baseMaterialCost)}</span>
                                                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                                                <span className="text-sm font-bold font-mono text-foreground">₱{formatCurrency(costImpact.targetMaterialCost)}</span>
                                            </div>
                                            <div className={`text-[11px] font-semibold font-mono text-right ${costImpact.materialCostDiff > 0 ? "text-red-500" : costImpact.materialCostDiff < 0 ? "text-emerald-500" : "text-muted-foreground"}`}>
                                                {costImpact.materialCostDiff >= 0 ? "+" : ""}₱{formatCurrency(costImpact.materialCostDiff)}
                                            </div>
                                        </div>

                                        <div className="bg-card border rounded-xl p-4 space-y-1.5 shadow-2xs">
                                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Direct Labor Cost</span>
                                            <div className="flex items-baseline justify-between">
                                                <span className="text-xs text-muted-foreground font-mono">₱{formatCurrency(costImpact.baseLaborCost)}</span>
                                                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                                                <span className="text-sm font-bold font-mono text-foreground">₱{formatCurrency(costImpact.targetLaborCost)}</span>
                                            </div>
                                            <div className={`text-[11px] font-semibold font-mono text-right ${costImpact.laborCostDiff > 0 ? "text-red-500" : costImpact.laborCostDiff < 0 ? "text-emerald-500" : "text-muted-foreground"}`}>
                                                {costImpact.laborCostDiff >= 0 ? "+" : ""}₱{formatCurrency(costImpact.laborCostDiff)}
                                            </div>
                                        </div>

                                        <div className="bg-card border rounded-xl p-4 space-y-1.5 shadow-2xs">
                                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Custom &amp; Managed Overhead</span>
                                            <div className="flex items-baseline justify-between">
                                                <span className="text-xs text-muted-foreground font-mono">₱{formatCurrency((costImpact.baseCustomOverhead || 0) + (costImpact.baseOverheadItemsSum || 0))}</span>
                                                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                                                <span className="text-sm font-bold font-mono text-foreground">₱{formatCurrency((costImpact.targetCustomOverhead || 0) + (costImpact.targetOverheadItemsSum || 0))}</span>
                                            </div>
                                            <div className={`text-[11px] font-semibold font-mono text-right ${((costImpact.customOverheadDiff || 0) + (costImpact.overheadItemsSumDiff || 0)) > 0 ? "text-red-500" : ((costImpact.customOverheadDiff || 0) + (costImpact.overheadItemsSumDiff || 0)) < 0 ? "text-emerald-500" : "text-muted-foreground"}`}>
                                                {((costImpact.customOverheadDiff || 0) + (costImpact.overheadItemsSumDiff || 0)) >= 0 ? "+" : ""}₱{formatCurrency((costImpact.customOverheadDiff || 0) + (costImpact.overheadItemsSumDiff || 0))}
                                            </div>
                                        </div>

                                        <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 space-y-1.5 shadow-2xs">
                                            <span className="text-[10px] font-bold text-primary uppercase tracking-wider block">Total Unit Standard Cost</span>
                                            <div className="flex items-baseline justify-between">
                                                <span className="text-xs text-muted-foreground font-mono">₱{formatCurrency(costImpact.baseTotalCost)}</span>
                                                <ArrowRight className="h-3 w-3 text-primary" />
                                                <span className="text-base font-extrabold font-mono text-primary">₱{formatCurrency(costImpact.targetTotalCost)}</span>
                                            </div>
                                            <div className={`text-[11px] font-extrabold font-mono text-right ${isCostIncrease ? "text-red-500" : isCostDecrease ? "text-emerald-500" : "text-foreground"}`}>
                                                {totalCostDiff >= 0 ? "+" : ""}₱{formatCurrency(totalCostDiff)} ({costImpact.percentageChange}%)
                                            </div>
                                        </div>
                                    </div>

                                    {/* Version Header Cards Comparison */}
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="border rounded-xl p-4 bg-muted/20 space-y-2 text-xs">
                                            <div className="flex items-center justify-between border-b pb-2">
                                                <span className="font-bold text-muted-foreground">BASE: {baseVer?.version_name || "Base Version"}</span>
                                                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-muted border">
                                                    {baseVer?.status || "Draft"}
                                                </span>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2 text-[11px]">
                                                <div>Base Qty: <strong className="text-foreground">{baseVer?.base_quantity || 1}</strong></div>
                                                <div>Expected Yield: <strong className="text-foreground">{baseVer?.expected_yield_percentage || 100}%</strong></div>
                                                <div>Custom Overhead: <strong className="text-foreground">₱{formatCurrency(baseVer?.custom_overhead)}</strong></div>
                                                <div>Labor Roles: <strong className="text-foreground">{(baseVer?.labor_positions || []).length} positions</strong></div>
                                            </div>
                                        </div>

                                        <div className="border border-primary/40 rounded-xl p-4 bg-primary/5 space-y-2 text-xs">
                                            <div className="flex items-center justify-between border-b border-primary/20 pb-2">
                                                <span className="font-bold text-primary">TARGET: {targetVer?.version_name || "Target Version"}</span>
                                                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-primary/20 text-primary border border-primary/30">
                                                    {targetVer?.status || "Draft"}
                                                </span>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2 text-[11px]">
                                                <div>Base Qty: <strong className="text-foreground">{targetVer?.base_quantity || 1}</strong></div>
                                                <div>Expected Yield: <strong className="text-foreground">{targetVer?.expected_yield_percentage || 100}%</strong></div>
                                                <div>Custom Overhead: <strong className="text-foreground">₱{formatCurrency(targetVer?.custom_overhead)}</strong></div>
                                                <div>Labor Roles: <strong className="text-foreground">{(targetVer?.labor_positions || []).length} positions</strong></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* BOM & Routes Tab */}
                            {activeSubTab === "bom_routes" && (
                                <div className="space-y-6">
                                    {/* BOM Components Diffs */}
                                    <div className="space-y-3">
                                        <h4 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                                            <Package className="h-4 w-4" /> BOM Ingredients &amp; Raw Materials Comparison
                                        </h4>
                                        <div className="overflow-x-auto rounded-xl border bg-card">
                                            <table className="w-full text-left text-xs">
                                                <thead>
                                                    <tr className="bg-muted/40 border-b text-[10px] uppercase font-bold text-muted-foreground">
                                                        <th className="py-2.5 px-3">Status</th>
                                                        <th className="py-2.5 px-3">Material Name</th>
                                                        <th className="py-2.5 px-3 text-right">Base Qty</th>
                                                        <th className="py-2.5 px-3 text-right">Target Qty</th>
                                                        <th className="py-2.5 px-3 text-right">Qty Delta</th>
                                                        <th className="py-2.5 px-3 text-right">Wastage %</th>
                                                        <th className="py-2.5 px-3 text-right">Unit Price (₱)</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y text-xs">
                                                    {componentDiffs.length === 0 ? (
                                                        <tr>
                                                            <td colSpan={7} className="py-6 text-center text-muted-foreground text-xs">No BOM component changes detected.</td>
                                                        </tr>
                                                    ) : (
                                                        componentDiffs.map((c: any, idx: number) => {
                                                            const isAdded = c.status === "added";
                                                            const isRemoved = c.status === "removed";
                                                            const isMod = c.status === "modified";
                                                            return (
                                                                <tr key={idx} className={isAdded ? "bg-emerald-500/5" : isRemoved ? "bg-red-500/5" : isMod ? "bg-amber-500/5" : ""}>
                                                                    <td className="py-2 px-3">
                                                                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                                                                            isAdded ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20" :
                                                                            isRemoved ? "bg-red-500/10 text-red-600 border border-red-500/20" :
                                                                            isMod ? "bg-amber-500/10 text-amber-600 border border-amber-500/20" : "bg-muted text-muted-foreground"
                                                                        }`}>
                                                                            {c.status}
                                                                        </span>
                                                                    </td>
                                                                    <td className="py-2 px-3 font-semibold">{c.productName} ({c.uom})</td>
                                                                    <td className="py-2 px-3 text-right font-mono text-muted-foreground">{c.baseQuantity}</td>
                                                                    <td className="py-2 px-3 text-right font-mono font-bold">{c.targetQuantity}</td>
                                                                    <td className={`py-2 px-3 text-right font-mono font-semibold ${c.quantityDiff > 0 ? "text-red-500" : c.quantityDiff < 0 ? "text-emerald-500" : "text-muted-foreground"}`}>
                                                                        {c.quantityDiff > 0 ? "+" : ""}{c.quantityDiff}
                                                                    </td>
                                                                    <td className="py-2 px-3 text-right font-mono">{c.targetWastageFactor}%</td>
                                                                    <td className="py-2 px-3 text-right font-mono">₱{formatCurrency(c.costPerUnit)}</td>
                                                                </tr>
                                                            );
                                                        })
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    {/* Workstation Routings Diffs */}
                                    <div className="space-y-3">
                                        <h4 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                                            <GitFork className="h-4 w-4" /> Workstation Operations &amp; Routings Comparison
                                        </h4>
                                        <div className="overflow-x-auto rounded-xl border bg-card">
                                            <table className="w-full text-left text-xs">
                                                <thead>
                                                    <tr className="bg-muted/40 border-b text-[10px] uppercase font-bold text-muted-foreground">
                                                        <th className="py-2.5 px-3">Seq</th>
                                                        <th className="py-2.5 px-3">Status</th>
                                                        <th className="py-2.5 px-3">Work Center / Station</th>
                                                        <th className="py-2.5 px-3">Operation</th>
                                                        <th className="py-2.5 px-3 text-right">Setup Time (Hrs)</th>
                                                        <th className="py-2.5 px-3 text-right">Run Time (Hrs)</th>
                                                        <th className="py-2.5 px-3 text-right">Run Time Delta</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y text-xs">
                                                    {routingDiffs.length === 0 ? (
                                                        <tr>
                                                            <td colSpan={7} className="py-6 text-center text-muted-foreground text-xs">No routing step changes detected.</td>
                                                        </tr>
                                                    ) : (
                                                        routingDiffs.map((r: any, idx: number) => {
                                                            const isAdded = r.status === "added";
                                                            const isRemoved = r.status === "removed";
                                                            const isMod = r.status === "modified";
                                                            return (
                                                                <tr key={idx} className={isAdded ? "bg-emerald-500/5" : isRemoved ? "bg-red-500/5" : isMod ? "bg-amber-500/5" : ""}>
                                                                    <td className="py-2 px-3 font-bold font-mono">#{r.sequence}</td>
                                                                    <td className="py-2 px-3">
                                                                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                                                                            isAdded ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20" :
                                                                            isRemoved ? "bg-red-500/10 text-red-600 border border-red-500/20" :
                                                                            isMod ? "bg-amber-500/10 text-amber-600 border border-amber-500/20" : "bg-muted text-muted-foreground"
                                                                        }`}>
                                                                            {r.status}
                                                                        </span>
                                                                    </td>
                                                                    <td className="py-2 px-3 font-semibold">{r.workCenter}</td>
                                                                    <td className="py-2 px-3">{r.operation}</td>
                                                                    <td className="py-2 px-3 text-right font-mono">{r.targetStep?.setupTime ?? r.baseStep?.setupTime ?? 0}</td>
                                                                    <td className="py-2 px-3 text-right font-mono font-bold">{r.targetStep?.runTime ?? r.baseStep?.runTime ?? 0}</td>
                                                                    <td className={`py-2 px-3 text-right font-mono font-semibold ${r.runTimeDiff > 0 ? "text-red-500" : r.runTimeDiff < 0 ? "text-emerald-500" : "text-muted-foreground"}`}>
                                                                        {r.runTimeDiff > 0 ? "+" : ""}{r.runTimeDiff} hrs
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Direct Labor Tab */}
                            {activeSubTab === "labor" && (
                                <div className="space-y-4">
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                                        <Briefcase className="h-4 w-4" /> Direct Labor Standards Comparison (MPB454G Model)
                                    </h4>
                                    <div className="overflow-x-auto rounded-xl border bg-card">
                                        <table className="w-full text-left text-xs border-collapse">
                                            <thead>
                                                <tr className="bg-muted/40 border-b text-[10px] uppercase font-bold text-muted-foreground">
                                                    <th className="py-2.5 px-3">Role Position</th>
                                                    <th className="py-2.5 px-3">Status</th>
                                                    <th className="py-2.5 px-3 text-center">Headcount (Base ➔ Target)</th>
                                                    <th className="py-2.5 px-3 text-right">Daily Wage (Base ➔ Target)</th>
                                                    <th className="py-2.5 px-3 text-center">Hours Required</th>
                                                    <th className="py-2.5 px-3 text-center">Statutory Mandates</th>
                                                    <th className="py-2.5 px-3 text-right">Target Cost (₱)</th>
                                                    <th className="py-2.5 px-3 text-right">Cost Delta</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y text-xs">
                                                {laborDiffs.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={8} className="py-6 text-center text-muted-foreground text-xs">No direct labor positions configured or compared.</td>
                                                    </tr>
                                                ) : (
                                                    laborDiffs.map((l: any, idx: number) => {
                                                        const isAdded = l.status === "added";
                                                        const isRemoved = l.status === "removed";
                                                        const isMod = l.status === "modified";
                                                        return (
                                                            <tr key={idx} className={isAdded ? "bg-emerald-500/5" : isRemoved ? "bg-red-500/5" : isMod ? "bg-amber-500/5" : ""}>
                                                                <td className="py-2.5 px-3 font-semibold">{l.positionName}</td>
                                                                <td className="py-2.5 px-3">
                                                                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                                                                        isAdded ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20" :
                                                                        isRemoved ? "bg-red-500/10 text-red-600 border border-red-500/20" :
                                                                        isMod ? "bg-amber-500/10 text-amber-600 border border-amber-500/20" : "bg-muted text-muted-foreground"
                                                                    }`}>
                                                                        {l.status}
                                                                    </span>
                                                                </td>
                                                                <td className="py-2.5 px-3 text-center font-mono">
                                                                    {l.baseCount} <span className="text-muted-foreground">➔</span> <strong>{l.targetCount}</strong>
                                                                </td>
                                                                <td className="py-2.5 px-3 text-right font-mono">
                                                                    ₱{formatCurrency(l.baseDaily)} ➔ <strong>₱{formatCurrency(l.targetDaily)}</strong>
                                                                </td>
                                                                <td className="py-2.5 px-3 text-center font-mono">{l.targetHours} hrs</td>
                                                                <td className="py-2.5 px-3 text-center">
                                                                    {l.targetMandates ? (
                                                                        <span className="bg-emerald-500/10 text-emerald-600 text-[10px] font-bold px-2 py-0.5 rounded border border-emerald-500/20">Included</span>
                                                                    ) : (
                                                                        <span className="bg-muted text-muted-foreground text-[10px] px-2 py-0.5 rounded">Excluded</span>
                                                                    )}
                                                                </td>
                                                                <td className="py-2.5 px-3 text-right font-mono font-bold">₱{formatCurrency(l.targetCost)}</td>
                                                                <td className={`py-2.5 px-3 text-right font-mono font-semibold ${l.costDiff > 0 ? "text-red-500" : l.costDiff < 0 ? "text-emerald-500" : "text-muted-foreground"}`}>
                                                                    {l.costDiff > 0 ? "+" : ""}₱{formatCurrency(l.costDiff)}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* Overhead Tab */}
                            {activeSubTab === "overheads" && (
                                <div className="space-y-4">
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                                        <Calculator className="h-4 w-4" /> Overhead Management Items Comparison
                                    </h4>
                                    <div className="overflow-x-auto rounded-xl border bg-card">
                                        <table className="w-full text-left text-xs border-collapse">
                                            <thead>
                                                <tr className="bg-muted/40 border-b text-[10px] uppercase font-bold text-muted-foreground">
                                                    <th className="py-2.5 px-3">Overhead Item</th>
                                                    <th className="py-2.5 px-3">Remarks</th>
                                                    <th className="py-2.5 px-3">Status</th>
                                                    <th className="py-2.5 px-3 text-right">Base Cost (₱)</th>
                                                    <th className="py-2.5 px-3 text-right">Target Cost (₱)</th>
                                                    <th className="py-2.5 px-3 text-right">Cost Delta</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y text-xs">
                                                {overheadDiffs.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={6} className="py-6 text-center text-muted-foreground text-xs">No overhead management items configured or compared.</td>
                                                    </tr>
                                                ) : (
                                                    overheadDiffs.map((o: any, idx: number) => {
                                                        const isAdded = o.status === "added";
                                                        const isRemoved = o.status === "removed";
                                                        const isMod = o.status === "modified";
                                                        return (
                                                            <tr key={idx} className={isAdded ? "bg-emerald-500/5" : isRemoved ? "bg-red-500/5" : isMod ? "bg-amber-500/5" : ""}>
                                                                <td className="py-2.5 px-3 font-semibold">{o.overheadName}</td>
                                                                <td className="py-2.5 px-3 text-muted-foreground">{o.remarks || "—"}</td>
                                                                <td className="py-2.5 px-3">
                                                                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                                                                        isAdded ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20" :
                                                                        isRemoved ? "bg-red-500/10 text-red-600 border border-red-500/20" :
                                                                        isMod ? "bg-amber-500/10 text-amber-600 border border-amber-500/20" : "bg-muted text-muted-foreground"
                                                                    }`}>
                                                                        {o.status}
                                                                    </span>
                                                                </td>
                                                                <td className="py-2.5 px-3 text-right font-mono text-muted-foreground">₱{formatCurrency(o.baseCost)}</td>
                                                                <td className="py-2.5 px-3 text-right font-mono font-bold">₱{formatCurrency(o.targetCost)}</td>
                                                                <td className={`py-2.5 px-3 text-right font-mono font-semibold ${o.costDiff > 0 ? "text-red-500" : o.costDiff < 0 ? "text-emerald-500" : "text-muted-foreground"}`}>
                                                                    {o.costDiff > 0 ? "+" : ""}₱{formatCurrency(o.costDiff)}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : null}
                </div>

                {/* Footer */}
                <div className="px-6 py-3 border-t bg-muted/20 flex justify-end shrink-0">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 bg-primary text-primary-foreground font-semibold rounded-lg text-xs hover:bg-primary/95 transition-all shadow-sm cursor-pointer"
                    >
                        Close Matrix
                    </button>
                </div>
            </div>
        </div>
    );
};
