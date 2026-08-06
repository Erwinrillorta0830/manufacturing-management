"use client";

import React from "react";
import { Layers, Search, AlertTriangle, CheckCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { ProductForecastingSummary } from "../types";

interface MarginAnalysisTabProps {
    searchTerm: string;
    setSearchTerm: (term: string) => void;
    filteredSummary: ProductForecastingSummary[];
    expandedProdId: string | null;
    handleExpandRow: (productId: string) => void;
    selectedProductId: string;
    setSelectedProductId: (id: string) => void;
    handleSelectVariant: (familyId: string, variantId: string) => void;
}

export function MarginAnalysisTab({
    searchTerm,
    setSearchTerm,
    filteredSummary,
    expandedProdId,
    handleExpandRow,
    selectedProductId,
    setSelectedProductId,
    handleSelectVariant
}: MarginAnalysisTabProps) {
    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h3 className="text-sm font-bold tracking-tight flex items-center gap-1.5">
                    <Layers className="h-4.5 w-4.5 text-primary" />
                    SKU Inventory &amp; Predicted Material Deficit (30 Days Forecast)
                </h3>
                <div className="relative w-full sm:w-60">
                    <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Filter product SKU..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full rounded border pl-8 pr-2.5 py-1 text-xs outline-hidden focus:ring-1 focus:ring-primary bg-background"
                    />
                </div>
            </div>

            <div className="border rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                    <thead>
                        <tr className="bg-muted/40 border-b font-semibold text-muted-foreground">
                            <th className="p-3">SKU / Product</th>
                            <th className="p-3 text-center">Current Inventory</th>
                            <th className="p-3 text-center">Predicted 30d Sales</th>
                            <th className="p-3 text-center">Net Deficit</th>
                            <th className="p-3 text-center">Supply Status</th>
                            <th className="p-3 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredSummary.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="p-8 text-center text-muted-foreground">
                                    No products match the SKU filter.
                                </td>
                            </tr>
                        ) : (
                            filteredSummary.map(prod => {
                                const isExpanded = expandedProdId === prod.id;
                                const hasDeficit = prod.netDeficit > 0;
                                return (
                                    <React.Fragment key={prod.id}>
                                        <tr
                                            className={`border-b hover:bg-muted/5 transition-colors cursor-pointer ${isExpanded ? "bg-muted/20" : ""}`}
                                            onClick={() => handleExpandRow(prod.id)}
                                        >
                                            <td className="p-3 font-semibold">
                                                <div>
                                                    <span className="block">{prod.title}</span>
                                                    <span className="block text-[10px] text-muted-foreground font-normal">{prod.sku} (Display: {prod.displayUom})</span>
                                                </div>
                                            </td>
                                            <td className="p-3 text-center font-medium">
                                                {prod.currentInventoryDisplay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {prod.displayUom}
                                            </td>
                                            <td className="p-3 text-center font-bold text-primary">
                                                {prod.forecastedDemand30d.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {prod.displayUom}
                                            </td>
                                            <td className="p-3 text-center font-extrabold text-foreground">
                                                {prod.netDeficit > 0 ? (
                                                    <span className="text-amber-600">
                                                        -{prod.netDeficit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {prod.displayUom}
                                                    </span>
                                                ) : (
                                                    <span className="text-emerald-600">Sufficient</span>
                                                )}
                                            </td>
                                            <td className="p-3 text-center">
                                                {prod.hasMaterialShortage ? (
                                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                                        <AlertTriangle className="h-3 w-3" />
                                                        Material Shortage
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                                        <CheckCircle className="h-3 w-3" />
                                                        Ready to Schedule
                                                    </span>
                                                )}
                                            </td>
                                            <td className="p-3 text-right" onClick={e => e.stopPropagation()}>
                                                <div className="flex items-center justify-end gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => setSelectedProductId(prod.id)}
                                                        className={`px-2.5 py-1 rounded border text-[10px] font-bold cursor-pointer transition-all ${
                                                            selectedProductId === prod.id
                                                                ? "bg-primary text-primary-foreground border-primary"
                                                                : "hover:bg-muted border-muted"
                                                        }`}
                                                    >
                                                        Plot Chart
                                                    </button>
                                                    {hasDeficit && (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                toast.success(`Dispatched Forecast JO for ${prod.title}: ${prod.netDeficit} ${prod.displayUom}`);
                                                            }}
                                                            className="px-2.5 py-1 rounded bg-primary/10 hover:bg-primary/15 text-primary text-[10px] font-bold cursor-pointer transition-all border border-primary/20"
                                                        >
                                                            Schedule JO
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>

                                        {/* Expandable row: BOM Requirements Explosion & Breakdown */}
                                        <AnimatePresence initial={false}>
                                            {isExpanded && (
                                                <tr>
                                                    <td colSpan={6} className="bg-muted/10 p-4 border-b">
                                                        <motion.div
                                                            initial={{ height: 0, opacity: 0 }}
                                                            animate={{ height: "auto", opacity: 1 }}
                                                            exit={{ height: 0, opacity: 0 }}
                                                            transition={{ duration: 0.2 }}
                                                            className="overflow-hidden"
                                                        >
                                                            <div className="space-y-4 pl-3">
                                                                {/* Family Variants Breakdown */}
                                                                <div className="space-y-2 border-b pb-3">
                                                                    <div className="flex items-center justify-between">
                                                                        <h5 className="text-[10px] font-extrabold text-foreground uppercase tracking-wider">
                                                                            Product Family Variants Breakdown
                                                                        </h5>
                                                                        <span className="text-[9.5px] font-bold text-primary animate-pulse">
                                                                            Select a variant below to load its recipe / BOM
                                                                        </span>
                                                                    </div>
                                                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                                                        {/* Parent variant */}
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleSelectVariant(prod.id, prod.parentProductObj.id)}
                                                                            className={`w-full text-left border rounded-lg p-2.5 bg-background flex flex-col gap-0.5 transition-all hover:bg-muted/10 cursor-pointer ${
                                                                                prod.selectedVariantId === prod.parentProductObj.id
                                                                                    ? "border-primary ring-1 ring-primary/20 bg-primary/[0.02]"
                                                                                    : "border-muted"
                                                                            }`}
                                                                        >
                                                                            <div className="flex items-center justify-between w-full">
                                                                                <span className="font-bold text-[11px] truncate text-foreground">{prod.parentProductObj.title}</span>
                                                                                {prod.selectedVariantId === prod.parentProductObj.id && (
                                                                                    <span className="inline-flex items-center text-[9px] font-extrabold text-primary bg-primary/10 px-1.5 py-0.2 rounded-full">
                                                                                        Active BOM
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                            <span className="text-[9px] text-muted-foreground">Unit: {prod.parentProductObj.baseUom} (Base Product)</span>
                                                                            <span className="text-[10px] font-bold text-primary mt-1">Stock: {prod.parentProductObj.currentInventory.toLocaleString()} {prod.parentProductObj.baseUom}</span>
                                                                        </button>
                                                                        {/* Children variants */}
                                                                        {prod.children.map((child, cIdx) => (
                                                                            <button
                                                                                key={cIdx}
                                                                                type="button"
                                                                                onClick={() => handleSelectVariant(prod.id, child.id)}
                                                                                className={`w-full text-left border rounded-lg p-2.5 bg-background flex flex-col gap-0.5 transition-all hover:bg-muted/10 cursor-pointer ${
                                                                                    prod.selectedVariantId === child.id
                                                                                        ? "border-primary ring-1 ring-primary/20 bg-primary/[0.02]"
                                                                                        : "border-muted"
                                                                                }`}
                                                                            >
                                                                                <div className="flex items-center justify-between w-full">
                                                                                    <span className="font-bold text-[11px] truncate text-foreground">{child.title}</span>
                                                                                    {prod.selectedVariantId === child.id && (
                                                                                        <span className="inline-flex items-center text-[9px] font-extrabold text-primary bg-primary/10 px-1.5 py-0.2 rounded-full">
                                                                                            Active BOM
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                                <span className="text-[9px] text-muted-foreground">Unit: {child.baseUom} (Pack Size: {child.unitOfMeasurementCount})</span>
                                                                                <span className="text-[10px] font-bold text-violet-600 mt-1">Stock: {child.currentInventory.toLocaleString()} {child.baseUom}</span>
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                </div>

                                                                <div className="flex items-center justify-between">
                                                                    <h4 className="text-xs font-extrabold text-foreground uppercase tracking-wider">
                                                                        BOM Ingredients Requirement Explosion for {prod.selectedVariantTitle} (Deficit: {prod.netDeficitInVariant.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {prod.selectedVariantUom})
                                                                    </h4>
                                                                    <span className="text-[10px] text-muted-foreground font-semibold">
                                                                        Active Recipe: {prod.versionName || "V1"}
                                                                    </span>
                                                                </div>

                                                                {prod.bom.length === 0 ? (
                                                                    <p className="text-[10px] text-muted-foreground py-2 flex items-center gap-1">
                                                                        <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                                                                        No active BOM loaded. Ensure this product is configured with a recipe in Planning.
                                                                    </p>
                                                                ) : (
                                                                    <div className="border rounded-lg overflow-hidden bg-background">
                                                                        <table className="w-full text-left text-[11px] border-collapse">
                                                                            <thead>
                                                                                <tr className="bg-muted/50 border-b font-semibold text-muted-foreground">
                                                                                    <th className="p-2.5">Material Ingredient</th>
                                                                                    <th className="p-2.5 text-center">Required Qty</th>
                                                                                    <th className="p-2.5 text-center">Current Stock</th>
                                                                                    <th className="p-2.5 text-center">Safety Stock Limit</th>
                                                                                    <th className="p-2.5 text-right">Status</th>
                                                                                </tr>
                                                                            </thead>
                                                                            <tbody>
                                                                                {prod.ingredientsRequirements.map((ing, idx) => (
                                                                                    <tr key={idx} className="border-b last:border-0 hover:bg-muted/10">
                                                                                        <td className="p-2.5 font-semibold text-foreground">{ing.name}</td>
                                                                                        <td className="p-2.5 text-center font-medium">{ing.required.toFixed(1)} {ing.uom}</td>
                                                                                        <td className="p-2.5 text-center">{ing.stock.toLocaleString()} {ing.uom}</td>
                                                                                        <td className="p-2.5 text-center text-muted-foreground">{ing.safetyStock.toFixed(1)} {ing.uom}</td>
                                                                                        <td className="p-2.5 text-right">
                                                                                            {ing.isShortage ? (
                                                                                                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-100">
                                                                                                    <AlertTriangle className="h-3 w-3" />
                                                                                                    Order Deficit ({(ing.required - ing.stock).toFixed(0)} {ing.uom})
                                                                                                </span>
                                                                                            ) : (
                                                                                                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                                                                                                    <CheckCircle className="h-3 w-3" />
                                                                                                    Sufficient
                                                                                                </span>
                                                                                            )}
                                                                                        </td>
                                                                                    </tr>
                                                                                ))}
                                                                            </tbody>
                                                                        </table>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </motion.div>
                                                    </td>
                                                </tr>
                                            )}
                                        </AnimatePresence>
                                    </React.Fragment>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
