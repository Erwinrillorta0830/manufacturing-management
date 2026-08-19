/* eslint-disable */
import React from "react";
import { Loader2, Package, Layers, Clock, CheckCircle, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SearchableVersionSelect } from "../SearchableVersionSelect";
import { formatHoursToHMS } from "../../utils/containerization-helper";

export interface Step2BOMReviewProps {
    loadingDetails: boolean;
    detailsError: string | null;
    retryDetails: () => void;
    parentUomLabel: string;
    boxEstimatedHours: number;
    shiftOption: string;
    subAssemblyEstimatedHours: number;
    subAssemblyUomLabel: string;
    totalEstimatedHours: number;
    containerMetrics: any;
    cogsBreakdown: any;
    components: any[];
    targetQuantity: number;
    bomBaseQty: number;
    inventories: Record<number, any>;
    subAssemblyBoms: Record<number, any[]>;
    subAssemblyVersions: Record<number, any[]>;
    selectedSubAssemblyVersions: Record<number, number>;
    handleSubAssemblyVersionChange: (subProdId: number, versionId: number) => Promise<void>;
    loadingSubVersion: Record<number, boolean>;
    subAssemblyRoutings: Record<number, any>;
    joNumber: string;
    printSelection: Record<string, boolean>;
    setPrintSelection: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
    hasShortfalls: boolean;
    handlePrintProcurementRequest: () => void;
}

export function Step2BOMReview({
    loadingDetails,
    detailsError,
    retryDetails,
    parentUomLabel,
    boxEstimatedHours,
    shiftOption,
    subAssemblyEstimatedHours,
    subAssemblyUomLabel,
    totalEstimatedHours,
    containerMetrics,
    cogsBreakdown,
    components,
    targetQuantity,
    bomBaseQty,
    inventories,
    subAssemblyBoms,
    subAssemblyVersions,
    selectedSubAssemblyVersions,
    handleSubAssemblyVersionChange,
    loadingSubVersion,
    subAssemblyRoutings,
    printSelection,
    setPrintSelection,
    hasShortfalls,
    handlePrintProcurementRequest
}: Step2BOMReviewProps) {
    if (loadingDetails) {
        return (
            <div className="flex flex-col items-center justify-center py-10 space-y-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-xs text-muted-foreground font-medium">Analyzing BOM and routes...</p>
            </div>
        );
    }

    if (detailsError) {
        return (
            <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
                <ShieldAlert className="h-8 w-8 text-destructive" />
                <div>
                    <p className="text-sm font-semibold text-foreground">Unable to load BOM details</p>
                    <p className="mt-1 max-w-md text-xs text-muted-foreground">{detailsError}</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={retryDetails}>
                    Retry
                </Button>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Time Summary Categorized Breakdown */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Box Assembly Card */}
                <div className="bg-card border border-border rounded-xl p-3 flex flex-col justify-between">
                    <div className="flex items-center gap-2 mb-1">
                        <Package className="h-4 w-4 text-primary" />
                        <span className="text-xs font-bold text-foreground">📦 {parentUomLabel} Assembly</span>
                    </div>
                    <div>
                        <div className="text-base font-black text-foreground">
                            {boxEstimatedHours.toFixed(1)} hrs
                        </div>
                        <div className="text-[10px] text-muted-foreground font-medium">
                            {Number(shiftOption) > 0 ? `~${(boxEstimatedHours / Number(shiftOption)).toFixed(1)} Days` : `${boxEstimatedHours.toFixed(1)} hrs`}
                        </div>
                    </div>
                </div>

                {/* Sub-Assembly Piece Card */}
                <div className={`bg-card border rounded-xl p-3 flex flex-col justify-between ${subAssemblyEstimatedHours > 0 ? "border-sky-500/30 bg-sky-500/5" : "border-border"}`}>
                    <div className="flex items-center gap-2 mb-1">
                        <Layers className="h-4 w-4 text-sky-500" />
                        <span className="text-xs font-bold text-foreground">🧩 Sub-Assembly ({subAssemblyUomLabel})</span>
                    </div>
                    <div>
                        <div className="text-base font-black text-foreground">
                            {subAssemblyEstimatedHours.toFixed(1)} hrs
                        </div>
                        <div className="text-[10px] text-muted-foreground font-medium">
                            {subAssemblyEstimatedHours > 0 && Number(shiftOption) > 0
                                ? `~${(subAssemblyEstimatedHours / Number(shiftOption)).toFixed(1)} Days`
                                : "No piece shortfalls"}
                        </div>
                    </div>
                </div>

                {/* Total Duration Card */}
                <div className="bg-primary/10 border border-primary/30 rounded-xl p-3 flex flex-col justify-between">
                    <div className="flex items-center gap-2 mb-1">
                        <Clock className="h-4 w-4 text-primary" />
                        <span className="text-xs font-bold text-foreground">⏱️ Total Lead Time</span>
                    </div>
                    <div>
                        <div className="text-base font-black text-primary font-mono tracking-tight">
                            {formatHoursToHMS(totalEstimatedHours)}
                        </div>
                        <div className="text-[10px] text-primary/80 font-bold">
                            {Number(shiftOption) > 0 ? `~${(totalEstimatedHours / Number(shiftOption)).toFixed(1)} Days (${totalEstimatedHours.toFixed(1)} hrs)` : `${totalEstimatedHours.toFixed(1)} hrs Total`}
                        </div>
                    </div>
                </div>
            </div>

            {/* Batch Yield & Pallet Containerization Banner */}
            {containerMetrics && (
                <div className="bg-muted/40 border border-border rounded-xl p-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Package className="h-4 w-4 text-emerald-500" />
                            <span className="text-xs font-bold text-foreground uppercase tracking-wider text-[11px]">
                                📦 Plant Production & Pallet Containerization
                            </span>
                        </div>
                        <Badge variant="outline" className="text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                            {containerMetrics.expectedYieldPercentage}% Yield Factor
                        </Badge>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px]">
                        <div className="bg-background border border-border/60 rounded-lg p-2">
                            <span className="text-[10px] font-medium text-muted-foreground block">🌾 Batch Mix & Sacks</span>
                            <span className="font-extrabold text-foreground text-xs">{containerMetrics.mixCount} Mixes</span>
                            <span className="text-[10px] text-muted-foreground block">({containerMetrics.sackCount} Sacks / {(containerMetrics.flourGramsTotal / 1000).toLocaleString()} kg Flour)</span>
                        </div>
                        <div className="bg-background border border-border/60 rounded-lg p-2">
                            <span className="text-[10px] font-medium text-muted-foreground block">🏭 Expected Net Pcs</span>
                            <span className="font-extrabold text-foreground text-xs">{Math.round(containerMetrics.netPieces).toLocaleString()} Pcs</span>
                            <span className="text-[10px] text-muted-foreground block">({(containerMetrics.scrapRate * 100).toFixed(1)}% Waste Scrap)</span>
                        </div>
                        <div className="bg-background border border-border/60 rounded-lg p-2">
                            <span className="text-[10px] font-medium text-muted-foreground block">📦 Cases / Bundles</span>
                            <span className="font-extrabold text-foreground text-xs">{containerMetrics.totalCasesBundlesFull} Full</span>
                            <span className="text-[10px] text-muted-foreground block">(+{containerMetrics.remainingPcs} pcs remaining)</span>
                        </div>
                        <div className="bg-background border border-border/60 rounded-lg p-2">
                            <span className="text-[10px] font-medium text-muted-foreground block">🚛 Pallet Allocation</span>
                            <span className="font-extrabold text-emerald-600 dark:text-emerald-400 text-xs">{containerMetrics.totalPalletsFull} Pallets</span>
                            <span className="text-[10px] text-muted-foreground block">(+{containerMetrics.remainingCasesBundles} cases/bundles)</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Live Unit COGS & Cost Breakdown Banner */}
            {cogsBreakdown && (
                <div className="bg-sky-500/5 border border-sky-500/20 dark:bg-sky-950/20 dark:border-sky-500/30 rounded-xl p-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[10px] font-extrabold bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30">
                                💰 Unit COGS & Labor Breakdown
                            </Badge>
                            <span className="text-[11px] font-semibold text-muted-foreground">
                                Base COGS: <strong className="text-foreground">₱{cogsBreakdown.baseUnitCOGS.toFixed(2)}</strong> / unit
                            </span>
                        </div>
                        <div className="text-right">
                            <span className="text-xs font-black text-sky-600 dark:text-sky-400">
                                ₱{cogsBreakdown.adjustedUnitCOGS.toFixed(2)} / unit
                            </span>
                            <span className="text-[9px] text-muted-foreground block font-medium">
                                (Adjusted for {cogsBreakdown.expectedYieldPercentage}% Yield)
                            </span>
                        </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 pt-1 text-[11px]">
                        <div className="bg-background border border-border/60 rounded-lg p-2">
                            <span className="text-[10px] font-medium text-muted-foreground block">🥦 Direct Materials</span>
                            <span className="font-extrabold text-foreground text-xs">₱{cogsBreakdown.materialCostPerUnit.toFixed(2)}</span>
                            <span className="text-[9px] text-muted-foreground block">Raw Materials & Packaging</span>
                        </div>
                        <div className="bg-background border border-border/60 rounded-lg p-2">
                            <span className="text-[10px] font-medium text-muted-foreground block">👥 Direct Labor</span>
                            <span className="font-extrabold text-foreground text-xs">₱{cogsBreakdown.directLaborCostPerUnit.toFixed(2)}</span>
                            <span className="text-[9px] text-muted-foreground block">
                                {cogsBreakdown.isCustomLaborOverride ? "Fixed Version Override" : "Work Center Hourly Rate"}
                            </span>
                        </div>
                        <div className="bg-background border border-border/60 rounded-lg p-2">
                            <span className="text-[10px] font-medium text-muted-foreground block">🏭 Factory Overhead</span>
                            <span className="font-extrabold text-foreground text-xs">₱{cogsBreakdown.factoryOverheadCostPerUnit.toFixed(2)}</span>
                            <span className="text-[9px] text-muted-foreground block">Power, Steam & Depreciation</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Material Checklist */}
            <div className="space-y-2">
                <div className="flex justify-between items-center mb-1">
                    <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider text-[10px]">
                        Component Sufficiency Checklist
                    </h4>
                    {hasShortfalls && (
                        <Button
                            type="button"
                            onClick={handlePrintProcurementRequest}
                            variant="outline"
                            size="xs"
                            className="h-6 gap-1 bg-amber-500/10 dark:bg-amber-950/20 hover:bg-amber-500/20 dark:hover:bg-amber-900/30 text-amber-600 dark:text-amber-400 border-amber-500/20 dark:border-amber-500/30 font-bold text-[10px]"
                        >
                            Print Procurement Request
                        </Button>
                    )}
                </div>
                {components.length === 0 ? (
                    <p className="text-xs text-muted-foreground/80 py-3 text-center">No raw material requirements specified.</p>
                ) : (
                    <div className="border border-border rounded-xl overflow-hidden">
                        <table className="w-full text-[11px] text-left border-collapse">
                            <thead>
                                <tr className="bg-muted text-muted-foreground border-b border-border font-bold uppercase tracking-wider text-[9px]">
                                    <th className="p-2.5 w-8 text-center">PR</th>
                                    <th className="p-2.5">Raw Material / Component</th>
                                    <th className="p-2.5 text-center">Needed</th>
                                    <th className="p-2.5 text-center">On Hand</th>
                                    <th className="p-2.5 text-center">Shortfall</th>
                                    <th className="p-2.5 text-right">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {components.map((comp, index) => {
                                    const compProductId = comp.component_product_id?.product_id;
                                    const needed = (Number(comp.quantity_required) * (1 + (Number(comp.wastage_factor_percentage || 0) / 100))) * (targetQuantity / bomBaseQty);
                                    const available = compProductId ? (inventories[Number(compProductId)]?.on_hand || 0) : 0;
                                    const shortfall = Math.max(0, needed - available);
                                    const isSufficient = shortfall === 0;
                                    const uom = comp.unit_of_measurement || "pcs";
                                    const children = subAssemblyBoms[Number(compProductId)] || [];
                                    const isSubAssembly = children.length > 0 || comp.component_product_id?.product_type === 388 || comp.component_product_id?.is_finished_good;

                                    return (
                                        <React.Fragment key={`${compProductId || "null"}_${index}`}>
                                            <tr className="border-b border-border bg-card hover:bg-muted/40">
                                                <td className="p-2.5 text-center">
                                                    {shortfall > 0 && (
                                                        <input
                                                            type="checkbox"
                                                            checked={!!printSelection[`parent-${compProductId}`]}
                                                            onChange={(e) => setPrintSelection(prev => ({
                                                                ...prev,
                                                                [`parent-${compProductId}`]: e.target.checked
                                                            }))}
                                                            className="h-3.5 w-3.5 rounded border-input bg-card text-primary focus:ring-primary cursor-pointer"
                                                        />
                                                    )}
                                                </td>
                                                <td className="p-2.5">
                                                    <div className="text-[8px] text-muted-foreground font-bold uppercase tracking-wider mb-0.5 flex items-center gap-1.5">
                                                        {comp.component_product_id?.category_name || "Uncategorized"}
                                                        {isSubAssembly && (
                                                            <span className="text-[7px] bg-sky-500/10 dark:bg-sky-950 text-sky-600 dark:text-sky-400 border border-sky-500/20 px-1 rounded-sm uppercase font-black">
                                                                Sub-Assembly
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="font-bold text-foreground">{comp.component_product_id?.product_name || `Product #${compProductId}`}</div>
                                                    <div className="text-[9px] text-muted-foreground/80">{comp.component_product_id?.product_code || ""}</div>
                                                    
                                                    {/* Sub-Assembly Version Selector & Routing Details */}
                                                    {isSubAssembly && (
                                                        <div className="mt-2 space-y-2 p-2.5 bg-sky-500/5 dark:bg-sky-950/20 rounded-lg border border-sky-500/20">
                                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                                <div className="flex-1 min-w-[240px] max-w-md">
                                                                    <SearchableVersionSelect
                                                                        versions={subAssemblyVersions[Number(compProductId)] || []}
                                                                        selectedVersionId={selectedSubAssemblyVersions[Number(compProductId)]}
                                                                        onVersionChange={(vId) => handleSubAssemblyVersionChange(Number(compProductId), vId)}
                                                                        loading={!!loadingSubVersion[Number(compProductId)]}
                                                                        productName={comp.component_product_id?.product_name || "Sub-Assembly"}
                                                                    />
                                                                </div>
                                                                
                                                                {/* Sub-Assembly Route Duration Preview */}
                                                                {subAssemblyRoutings[Number(compProductId)] && (
                                                                    <div className="text-[10px] bg-card/90 px-2.5 py-1 rounded-md border border-sky-500/30 flex flex-wrap items-center gap-2 font-mono shadow-sm shrink-0">
                                                                        <Clock className="h-3.5 w-3.5 text-sky-500 shrink-0" />
                                                                        <span>
                                                                            Setup: <strong className="text-foreground">{subAssemblyRoutings[Number(compProductId)].setup_time_hours}h</strong>
                                                                        </span>
                                                                        <span>|</span>
                                                                        <span>
                                                                            Run Rate: <strong className="text-foreground">{subAssemblyRoutings[Number(compProductId)].run_time_hours_per_unit.toFixed(3)}h/unit</strong>
                                                                        </span>
                                                                        {shortfall > 0 && (
                                                                            <span className="text-sky-600 dark:text-sky-400 font-bold ml-1">
                                                                                (= {(subAssemblyRoutings[Number(compProductId)].setup_time_hours + (subAssemblyRoutings[Number(compProductId)].run_time_hours_per_unit * shortfall / (subAssemblyRoutings[Number(compProductId)].base_quantity || 1))).toFixed(1)} hrs est.)
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>

                                                            {/* Auto-spawn Child JO indicator */}
                                                            {shortfall > 0 && (
                                                                <div className="text-[9.5px] text-sky-700 dark:text-sky-300 font-medium flex items-center gap-1.5 pt-1 border-t border-sky-500/10">
                                                                    <span className="w-2 h-2 rounded-full bg-sky-500 animate-pulse shrink-0" />
                                                                    <span>Auto-Spawns Child Job Order for shortfall of <strong className="font-bold">{shortfall.toLocaleString(undefined, {maximumFractionDigits:2})} {uom}</strong></span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}

                                                    {inventories[Number(compProductId)]?.recommended_lots?.length > 0 && (
                                                        <div className="mt-1 space-y-0.5">
                                                            <div className="text-[7.5px] text-primary/80 font-bold uppercase tracking-wider">Recommended Lots:</div>
                                                            <div className="flex flex-wrap gap-1">
                                                                {inventories[Number(compProductId)].recommended_lots.slice(0, 3).map((lot: any, lIdx: number) => (
                                                                    <span key={lIdx} className="text-[8px] bg-primary/10 text-primary border border-primary/20 px-1 py-0.5 rounded font-mono font-medium">
                                                                        {lot.lot_no} ({Number(lot.available).toFixed(0)})
                                                                    </span>
                                                                ))}
                                                                {inventories[Number(compProductId)].recommended_lots.length > 3 && (
                                                                    <span className="text-[8px] text-muted-foreground self-center">
                                                                        +{inventories[Number(compProductId)].recommended_lots.length - 3} more
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="p-2.5 text-center font-semibold text-foreground">
                                                    {needed.toLocaleString(undefined, {maximumFractionDigits:2})} <span className="text-[9px] text-muted-foreground font-normal">{uom}</span>
                                                </td>
                                                <td className="p-2.5 text-center text-muted-foreground">
                                                    {available.toLocaleString(undefined, {maximumFractionDigits:2})} <span className="text-[9px] text-muted-foreground font-normal">{uom}</span>
                                                </td>
                                                <td className={`p-2.5 text-center font-bold ${shortfall > 0 ? (isSubAssembly ? "text-sky-600 dark:text-sky-400" : "text-red-600 dark:text-red-400") : "text-muted-foreground/60"}`}>
                                                    {shortfall > 0 ? (
                                                        <>
                                                            {shortfall.toLocaleString(undefined, {maximumFractionDigits:2})} <span className={`text-[9px] font-normal ${isSubAssembly ? "text-sky-600/60 dark:text-sky-400/60" : "text-red-600/60 dark:text-red-400/60"}`}>{uom}</span>
                                                        </>
                                                    ) : "-"}
                                                </td>
                                                <td className="p-2.5 text-right">
                                                    {isSubAssembly && shortfall > 0 ? (
                                                        <span className="inline-flex items-center gap-1 text-[8px] font-bold text-sky-600 dark:text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded-full border border-sky-500/20 uppercase tracking-wide">
                                                            Spawns Child JO
                                                        </span>
                                                    ) : isSufficient ? (
                                                        <span className="inline-flex items-center gap-1 text-[9px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                                                            <CheckCircle className="h-2.5 w-2.5" /> Available
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 text-[9px] font-bold text-red-600 dark:text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/20">
                                                            <ShieldAlert className="h-2.5 w-2.5" /> Purchase Req
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>

                                            {/* Indented child raw materials for Sub-Assemblies */}
                                            {isSubAssembly && children.length > 0 && children.map((cc: any, subIndex: number) => {
                                                const ccId = cc.component_product_id?.product_id;
                                                const subBaseQty = Number(cc.base_quantity || 1);
                                                const ccNeeded = (Number(cc.quantity_required) * (1 + (Number(cc.wastage_factor_percentage || 0) / 100))) * (shortfall / subBaseQty);
                                                const ccAvailable = ccId ? (inventories[Number(ccId)]?.on_hand || 0) : 0;
                                                const ccShortfall = Math.max(0, ccNeeded - ccAvailable);
                                                const ccUom = cc.unit_of_measurement || "pcs";
                                                const ccSufficient = ccShortfall === 0;

                                                return (
                                                    <tr key={`child_${compProductId}_${ccId}_${subIndex}`} className="border-b border-border/50 bg-background/40 hover:bg-muted/20 text-[10px]">
                                                        <td className="p-2.5 text-center">
                                                            {ccShortfall > 0 && (
                                                                <input
                                                                    type="checkbox"
                                                                    checked={!!printSelection[`child-${compProductId}-${ccId}`]}
                                                                    onChange={(e) => setPrintSelection(prev => ({
                                                                        ...prev,
                                                                        [`child-${compProductId}-${ccId}`]: e.target.checked
                                                                    }))}
                                                                    className="h-3 w-3 rounded border-input bg-card text-primary focus:ring-primary cursor-pointer"
                                                                />
                                                            )}
                                                        </td>
                                                        <td className="p-2.5 pl-6 text-muted-foreground">
                                                            ↳ {cc.component_product_id?.product_name || `Product #${ccId}`}
                                                            {inventories[Number(ccId)]?.recommended_lots?.length > 0 && (
                                                                <div className="mt-1 pl-3 flex flex-wrap gap-1">
                                                                    {inventories[Number(ccId)].recommended_lots.slice(0, 2).map((lot: any, lIdx: number) => (
                                                                        <span key={lIdx} className="text-[7.5px] bg-primary/10 text-primary/90 border border-primary/15 px-1 py-0 rounded font-mono">
                                                                            {lot.lot_no} ({Number(lot.available).toFixed(0)})
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td className="p-2.5 text-center text-muted-foreground">
                                                            {ccNeeded.toLocaleString(undefined, {maximumFractionDigits:2})} <span className="text-[8px] text-muted-foreground/60">{ccUom}</span>
                                                        </td>
                                                        <td className="p-2.5 text-center text-muted-foreground">
                                                            {ccAvailable.toLocaleString(undefined, {maximumFractionDigits:2})} <span className="text-[8px] text-muted-foreground/60">{ccUom}</span>
                                                        </td>
                                                        <td className={`p-2.5 text-center font-bold ${ccShortfall > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground/60"}`}>
                                                            {ccShortfall > 0 ? ccShortfall.toLocaleString(undefined, {maximumFractionDigits:2}) : "-"}
                                                        </td>
                                                        <td className="p-2.5 text-right pr-4">
                                                            {ccSufficient ? (
                                                                <Badge variant="outline" className="h-5 text-[8px] text-emerald-600 dark:text-emerald-400 bg-emerald-500/5 border-emerald-500/20 py-0 px-1.5 font-bold">Stock OK</Badge>
                                                            ) : (
                                                                <Badge variant="outline" className="h-5 text-[8px] text-amber-600 dark:text-amber-400 bg-amber-500/5 border-amber-500/20 py-0 px-1.5 font-bold">MRP Shortfall</Badge>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
