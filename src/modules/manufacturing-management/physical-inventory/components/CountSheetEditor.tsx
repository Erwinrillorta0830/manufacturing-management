"use client";

import React, { useState, useMemo, useCallback } from "react";
import {
    Search,
    ArrowLeft,
    Save,
    CheckCircle2,
    Sparkles,
    Printer,
    Download,
    Scale,
    PackagePlus,
    Trash2,
    Barcode,
    Clock,
    Building2,
    Ban
} from "lucide-react";
import { toast } from "sonner";
import {
    PhysicalCountSheet,
    PhysicalInventoryLineItem,
    StorageLotDetails,
    RecipeVersionDetails,
    ProductDetails,
    OffsetPairing
} from "../types";
import { calculateCountSheetSummary, formatCurrency, formatDate } from "../utils";
import { downloadPhysicalCountSheetPDF } from "../utils/exportPhysicalCountSheetPDF";
import { downloadOffsettingReportPDF } from "../utils/exportOffsettingReportPDF";
import SearchableSelect, { SelectOption } from "./SearchableSelect";
import AddNoCountProductModal from "./AddNoCountProductModal";
import OffsettingModal from "./OffsettingModal";
import PrintableCountSheet from "./PrintableCountSheet";
import PrintableOffsettingReport from "./PrintableOffsettingReport";

interface CountSheetEditorProps {
    countSheet?: PhysicalCountSheet;
    sheet?: PhysicalCountSheet;
    availableLots?: StorageLotDetails[];
    availableVersions?: RecipeVersionDetails[];
    availableProducts?: ProductDetails[];
    onSaveDraft?: (updatedSheet: PhysicalCountSheet) => void;
    onSaveSheet?: (updatedSheet: PhysicalCountSheet) => void;
    onProceedToCommit: (sheet: PhysicalCountSheet) => void;
    onCancelSheet?: (sheetId: string) => void;
    onBackToList: () => void;
}

export default function CountSheetEditor({
    countSheet,
    sheet,
    availableLots = [],
    availableVersions = [],
    availableProducts = [],
    onSaveDraft,
    onSaveSheet,
    onProceedToCommit,
    onCancelSheet,
    onBackToList
}: CountSheetEditorProps) {
    const activeSheet = countSheet || sheet;

    const [lineItems, setLineItems] = useState<PhysicalInventoryLineItem[]>(activeSheet?.line_items || []);
    const [offsetPairings, setOffsetPairings] = useState<OffsetPairing[]>(activeSheet?.offset_pairings || []);
    const [searchQuery, setSearchQuery] = useState("");
    const [varianceFilter, setVarianceFilter] = useState<"all" | "deficit" | "surplus" | "matched" | "uncounted">("all");
    const [isSaving, setIsSaving] = useState(false);

    // Modal states
    const [isNoCountModalOpen, setIsNoCountModalOpen] = useState(false);
    const [isOffsetModalOpen, setIsOffsetModalOpen] = useState(false);
    const [isPrintSheetOpen, setIsPrintSheetOpen] = useState(false);
    const [isPrintOffsetOpen, setIsPrintOffsetOpen] = useState(false);

    // Sync on activeSheet change
    const [prevActiveSheet, setPrevActiveSheet] = useState<PhysicalCountSheet | null>(null);
    if (activeSheet !== prevActiveSheet) {
        setPrevActiveSheet(activeSheet || null);
        setLineItems(activeSheet?.line_items || []);
        setOffsetPairings(activeSheet?.offset_pairings || []);
    }

    const isReadOnly = activeSheet ? (activeSheet.isComitted || activeSheet.isCancelled) : false;
    const isFinishedGoods = Boolean(
        activeSheet?.inventory_type === "Finished Goods" ||
        activeSheet?.stock_type?.includes("Finished")
    );

    // Map offset quantity per line item
    const offsetQtyMap = useMemo(() => {
        const map = new Map<string, number>();
        for (const pair of offsetPairings) {
            const sAcc = map.get(pair.shortage_item_id) || 0;
            map.set(pair.shortage_item_id, sAcc + pair.offset_qty);

            const surpAcc = map.get(pair.surplus_item_id) || 0;
            map.set(pair.surplus_item_id, surpAcc + pair.offset_qty);
        }
        return map;
    }, [offsetPairings]);

    // Recalculate summary metrics
    const summary = useMemo(() => {
        return calculateCountSheetSummary(lineItems, offsetPairings);
    }, [lineItems, offsetPairings]);

    // Storage Location name resolver
    const getLotName = useCallback((lotIdRaw: string | number | StorageLotDetails | null | undefined): string => {
        if (lotIdRaw && typeof lotIdRaw === "object") {
            return lotIdRaw.lot_name || lotIdRaw.name || "Main Storage";
        }
        const idNum = Number(lotIdRaw || 0);
        if (!idNum) return "Main Storage";
        const found = availableLots.find(l => Number(l.lot_id || l.id) === idNum);
        return found ? (found.lot_name || found.name || `Bin #${idNum}`) : "Main Storage";
    }, [availableLots]);

    // Location lot select options
    const locationLotOptions: SelectOption[] = useMemo(() => {
        const list: SelectOption[] = [{ value: "0", label: "Main Storage" }];
        (availableLots || []).forEach(l => {
            const lId = l.lot_id || l.id;
            const lName = l.lot_name || l.name || `Bin #${lId}`;
            if (lId) {
                list.push({ value: String(lId), label: lName });
            }
        });
        return list;
    }, [availableLots]);

    // Handle physical count change
    const handleCountChange = (itemId: string, value: string) => {
        if (isReadOnly) return;
        setLineItems(prev => prev.map(item => {
            if (item.id === itemId) {
                const num = value === "" ? null : parseFloat(value);
                const physVal = isNaN(num as number) ? null : num;
                const sysVal = item.system_count || 0;
                const factor = item.uom_factor || 1;
                const diff = physVal !== null ? physVal - sysVal : 0;
                const baseDiff = diff * factor;
                const price = item.unit_price || 0;
                const offsetAllocated = offsetQtyMap.get(item.id) || 0;

                return {
                    ...item,
                    physical_count: physVal,
                    variance: diff,
                    variance_base: baseDiff,
                    difference_cost: baseDiff * price,
                    amount: (physVal !== null ? physVal : sysVal) * factor * price,
                    net_adjusted_variance: baseDiff - offsetAllocated
                };
            }
            return item;
        }));
    };

    // Handle location change
    const handleLocationChange = (itemId: string, newLotId: string | number) => {
        if (isReadOnly) return;
        setLineItems(prev => prev.map(item => {
            if (item.id === itemId) {
                return {
                    ...item,
                    lot_id: Number(newLotId) || null
                };
            }
            return item;
        }));
    };

    // Quick Action: Fill uncounted with system baseline counts
    const handleFillSystemCounts = () => {
        if (isReadOnly) return;
        setLineItems(prev => prev.map(item => {
            const physVal = item.physical_count === null ? item.system_count : item.physical_count;
            const sysVal = item.system_count || 0;
            const factor = item.uom_factor || 1;
            const diff = physVal !== null ? physVal - sysVal : 0;
            const baseDiff = diff * factor;
            const price = item.unit_price || 0;
            const offsetAllocated = offsetQtyMap.get(item.id) || 0;

            return {
                ...item,
                physical_count: physVal,
                variance: diff,
                variance_base: baseDiff,
                difference_cost: baseDiff * price,
                amount: (physVal !== null ? physVal : sysVal) * factor * price,
                net_adjusted_variance: baseDiff - offsetAllocated
            };
        }));
        toast.info("Populated uncounted items with system baseline.");
    };

    // Add No-Count Product from Modal
    const handleAddNoCountProduct = (newItem: PhysicalInventoryLineItem) => {
        setLineItems(prev => [newItem, ...prev]);
        toast.success(`No-Count product "${newItem.product_name}" added to audit sheet.`);
    };

    // Apply Offsetting from Modal
    const handleApplyOffsetting = (newPairings: OffsetPairing[]) => {
        setOffsetPairings(newPairings);
        const map = new Map<string, number>();
        for (const pair of newPairings) {
            const sAcc = map.get(pair.shortage_item_id) || 0;
            map.set(pair.shortage_item_id, sAcc + pair.offset_qty);

            const surpAcc = map.get(pair.surplus_item_id) || 0;
            map.set(pair.surplus_item_id, surpAcc + pair.offset_qty);
        }

        setLineItems(prev => prev.map(item => {
            const alloc = map.get(item.id) || 0;
            const baseVar = item.variance_base !== undefined ? item.variance_base : (item.variance || 0);
            return {
                ...item,
                offset_qty: alloc,
                net_adjusted_variance: baseVar - alloc
            };
        }));
    };

    // Delete Line item (only split or no-count items)
    const handleDeleteLineItem = (itemId: string) => {
        if (isReadOnly) return;
        setLineItems(prev => prev.filter(item => item.id !== itemId));
        toast.info("Line item removed.");
    };

    // Save Draft
    const handleSave = () => {
        if (!activeSheet) return;
        setIsSaving(true);
        const updatedSheet: PhysicalCountSheet = {
            ...activeSheet,
            line_items: lineItems,
            offset_pairings: offsetPairings
        };
        const saveFn = onSaveDraft || onSaveSheet;
        if (saveFn) {
            saveFn(updatedSheet);
        }
        setIsSaving(false);
    };

    // Direct PDF Downloads
    const handleDownloadCountSheetPDF = () => {
        if (!activeSheet) return;
        downloadPhysicalCountSheetPDF({ ...activeSheet, line_items: lineItems });
        toast.success("Count sheet PDF generated and downloaded.");
    };

    const handleDownloadOffsettingPDF = () => {
        if (!activeSheet) return;
        downloadOffsettingReportPDF({ ...activeSheet, line_items: lineItems }, offsetPairings);
        toast.success("Offsetting breakdown report PDF generated and downloaded.");
    };

    // Filter line items
    const filteredItems = useMemo(() => {
        return lineItems.filter(item => {
            const q = searchQuery.toLowerCase().trim();

            const pName = (typeof item.product_id === "object" ? item.product_id?.product_name : (item.product_name || item.sku_name || "")) || "";
            const pCode = (typeof item.product_id === "object" ? item.product_id?.product_code : (item.product_code || item.sku_code || "")) || "";
            const barcode = item.barcode || (typeof item.product_id === "object" ? item.product_id?.barcode : "") || "";
            const lName = (typeof item.lot_id === "object" ? (item.lot_id?.lot_name || item.lot_id?.name) : "") || "";

            const matchesSearch = !q ||
                pName.toLowerCase().includes(q) ||
                pCode.toLowerCase().includes(q) ||
                barcode.toLowerCase().includes(q) ||
                lName.toLowerCase().includes(q);

            if (!matchesSearch) return false;

            const sys = item.system_count || 0;
            const phys = item.physical_count;
            const diff = item.variance !== undefined ? item.variance : (phys !== null ? phys - sys : 0);

            if (varianceFilter === "uncounted") return phys === null;
            if (varianceFilter === "deficit") return phys !== null && diff < -0.0001;
            if (varianceFilter === "surplus") return phys !== null && diff > 0.0001;
            if (varianceFilter === "matched") return phys !== null && Math.abs(diff) <= 0.0001;

            return true;
        });
    }, [lineItems, searchQuery, varianceFilter]);

    if (!activeSheet) return null;

    const sheetStatus = activeSheet.isComitted
        ? "Committed"
        : activeSheet.isCancelled
        ? "Cancelled"
        : offsetPairings.length > 0
        ? "Pending Reconciliation"
        : "In Progress";

    return (
        <div className="space-y-5 animate-in fade-in duration-200">
            {/* Top Bar Navigation & Header Details (Section 4.1) */}
            <div className="bg-card border border-border p-4 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs">
                <div className="flex items-center gap-3">
                    <button
                        onClick={onBackToList}
                        className="p-2 rounded-xl bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-all"
                        title="Back to Sheets List"
                    >
                        <ArrowLeft className="h-4 w-4" />
                    </button>
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-black text-primary">#{activeSheet.ph_no || activeSheet.sheet_no}</span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                sheetStatus === "Committed"
                                    ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                                    : sheetStatus === "Cancelled"
                                    ? "bg-rose-500/10 text-rose-500 border border-rose-500/20"
                                    : sheetStatus === "Pending Reconciliation"
                                    ? "bg-purple-500/10 text-purple-500 border border-purple-500/20"
                                    : "bg-blue-500/10 text-blue-500 border border-blue-500/20"
                            }`}>
                                {sheetStatus}
                            </span>
                            <span className="px-2 py-0.5 rounded-md bg-secondary text-foreground text-[10px] font-bold border border-border">
                                {activeSheet.inventory_type || "Finished Goods"} • {activeSheet.stock_type || "Good Stock"}
                            </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-foreground flex items-center gap-1">
                                <Building2 className="h-3 w-3 inline" />
                                {activeSheet.branch_name}
                            </span>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3 inline text-primary" />
                                Start: {formatDate(activeSheet.starting_date)}
                            </span>
                            <span>•</span>
                            <span>Cut-Off: {formatDate(activeSheet.cutOff_date || activeSheet.cutoff_date)}</span>
                        </p>
                    </div>
                </div>

                {/* Header Action Controls (Section 4.3) */}
                <div className="flex items-center gap-2 flex-wrap justify-end">
                    {/* Direct PDF Download / Print Sheet */}
                    <button
                        onClick={handleDownloadCountSheetPDF}
                        className="px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5 border border-primary/20"
                        title="Download Count Sheet as PDF"
                    >
                        <Download className="h-3.5 w-3.5" />
                        PDF Sheet
                    </button>

                    <button
                        onClick={() => setIsPrintSheetOpen(true)}
                        className="px-3 py-1.5 bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5"
                    >
                        <Printer className="h-3.5 w-3.5" />
                        Print Sheet
                    </button>

                    {offsetPairings.length > 0 && (
                        <>
                            <button
                                onClick={handleDownloadOffsettingPDF}
                                className="px-3 py-1.5 bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5 border border-purple-500/20"
                                title="Download Offsetting Breakdown Report as PDF"
                            >
                                <Download className="h-3.5 w-3.5" />
                                PDF Offset Report
                            </button>
                            <button
                                onClick={() => setIsPrintOffsetOpen(true)}
                                className="px-3 py-1.5 bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5 border border-purple-500/20"
                            >
                                <Printer className="h-3.5 w-3.5" />
                                Print Offset
                            </button>
                        </>
                    )}

                    {!isReadOnly && (
                        <>
                            {/* Add No-Count Products */}
                            <button
                                onClick={() => setIsNoCountModalOpen(true)}
                                className="px-3 py-1.5 bg-secondary hover:bg-secondary/80 text-foreground text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5 border border-border"
                            >
                                <PackagePlus className="h-3.5 w-3.5 text-primary" />
                                Add No-Count SKU
                            </button>

                            {/* Offsetting Utility Button */}
                            <button
                                onClick={() => setIsOffsetModalOpen(true)}
                                className="px-3 py-1.5 bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 border border-purple-500/20"
                            >
                                <Scale className="h-3.5 w-3.5" />
                                Offsetting ({offsetPairings.length})
                            </button>

                            {/* Fill System Snapshot */}
                            <button
                                onClick={handleFillSystemCounts}
                                className="px-3 py-1.5 bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5"
                                title="Fill uncounted items with system baseline"
                            >
                                <Sparkles className="h-3.5 w-3.5 text-primary" />
                                Fill Baseline
                            </button>

                            {/* Save Draft */}
                            <button
                                onClick={handleSave}
                                disabled={isSaving}
                                className="px-3.5 py-1.5 bg-secondary hover:bg-secondary/80 text-foreground font-semibold text-xs rounded-xl transition-all flex items-center gap-1.5 border border-border"
                            >
                                <Save className="h-3.5 w-3.5" />
                                Save Draft
                            </button>

                            {/* Commit to Ledger */}
                            <button
                                onClick={() => onProceedToCommit({ ...activeSheet, line_items: lineItems, offset_pairings: offsetPairings })}
                                className="px-4 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 hover:scale-[1.01]"
                            >
                                <CheckCircle2 className="h-4 w-4" />
                                Commit
                            </button>

                            {/* Cancel Count Sheet */}
                            {onCancelSheet && (
                                <button
                                    onClick={() => onCancelSheet(activeSheet.id)}
                                    className="p-1.5 bg-muted hover:bg-rose-500/10 text-muted-foreground hover:text-rose-500 rounded-xl transition-all"
                                    title="Cancel Count Sheet"
                                >
                                    <Ban className="h-4 w-4" />
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Summary Metrics Cards (Section 4.1) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3 bg-muted/30 border border-border p-3.5 rounded-2xl">
                <div>
                    <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">System Base Count</span>
                    <span className="text-sm font-black text-foreground mt-0.5 block font-mono">
                        {summary.totalSystemQty.toLocaleString()} Units
                    </span>
                    <span className="text-[10px] text-muted-foreground">Audited: {summary.countedItemsCount}/{summary.totalItemsCount} SKUs</span>
                </div>

                <div>
                    <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Physical Base Count</span>
                    <span className="text-sm font-black text-primary mt-0.5 block font-mono">
                        {summary.totalPhysicalQty.toLocaleString()} Units
                    </span>
                    <span className="text-[10px] text-muted-foreground">{summary.uncountedItemsCount} uncounted</span>
                </div>

                <div>
                    <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Base Variance</span>
                    <span className={`text-sm font-black mt-0.5 block font-mono ${summary.netVarianceQty >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                        {summary.netVarianceQty >= 0 ? `+${summary.netVarianceQty.toLocaleString()}` : summary.netVarianceQty.toLocaleString()} Units
                    </span>
                    <span className="text-[10px] text-muted-foreground">+{summary.surplusItemsCount} / -{summary.deficitItemsCount} SKUs</span>
                </div>

                <div>
                    <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Difference Cost</span>
                    <span className={`text-sm font-black mt-0.5 block font-mono ${summary.netVarianceCost >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                        {formatCurrency(summary.netVarianceCost)}
                    </span>
                    <span className="text-[10px] text-muted-foreground">Gross Variance Value</span>
                </div>

                <div className="col-span-2 sm:col-span-4 lg:col-span-1 border-t lg:border-t-0 lg:border-l border-border/80 pt-2 lg:pt-0 lg:pl-3">
                    <span className="text-[10px] text-purple-600 dark:text-purple-400 uppercase font-bold tracking-wider block">Reconciled Offsets</span>
                    <span className="text-sm font-black text-purple-600 dark:text-purple-400 mt-0.5 block font-mono">
                        {summary.totalOffsetQty.toLocaleString()} Units
                    </span>
                    <span className="text-[10px] text-muted-foreground">{offsetPairings.length} active pair(s)</span>
                </div>
            </div>

            {/* Filter & Search Toolbar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-card border border-border p-3 rounded-2xl shadow-xs">
                <div className="relative w-full sm:w-80">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Search SKU description, code, barcode, bin..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-3 py-1.5 text-xs bg-background border border-border rounded-xl focus:ring-2 focus:ring-primary outline-hidden"
                    />
                </div>

                <div className="flex items-center gap-1 overflow-x-auto w-full sm:w-auto">
                    {(["all", "uncounted", "deficit", "surplus", "matched"] as const).map(f => (
                        <button
                            key={f}
                            onClick={() => setVarianceFilter(f)}
                            className={`px-3 py-1.2 rounded-lg text-xs font-semibold capitalize whitespace-nowrap transition-all ${
                                varianceFilter === f
                                    ? "bg-primary text-primary-foreground shadow-xs"
                                    : "bg-muted/50 text-muted-foreground hover:text-foreground"
                            }`}
                        >
                            {f}
                        </button>
                    ))}
                </div>
            </div>

            {/* Line Items Table (Section 4.2 - Batch Column Removed, Versioning FG only) */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                        <thead className="bg-muted/50 border-b border-border text-muted-foreground font-semibold">
                            <tr>
                                <th className="p-3">Product Name, Code & Barcode</th>
                                <th className="p-3">Storage Location</th>
                                {isFinishedGoods && <th className="p-3">Recipe Version</th>}
                                <th className="p-3 text-center">UOM</th>
                                <th className="p-3 text-right">System Count</th>
                                <th className="p-3 text-center">Physical Count</th>
                                <th className="p-3 text-right">Variance</th>
                                <th className="p-3 text-right">Unit Price</th>
                                <th className="p-3 text-right">Count Valuation</th>
                                <th className="p-3 text-right">Difference Cost</th>
                                <th className="p-3 text-center">Offset Status</th>
                                {!isReadOnly && <th className="p-3 text-center">Action</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60 font-medium">
                            {filteredItems.length > 0 ? (
                                filteredItems.map(item => {
                                    const productName = typeof item.product_id === "object"
                                        ? (item.product_id?.product_name || item.product_name || item.sku_name || "Product")
                                        : (item.product_name || item.sku_name || "Product");

                                    const productCode = typeof item.product_id === "object"
                                        ? (item.product_id?.product_code || item.product_code || item.sku_code || "")
                                        : (item.product_code || item.sku_code || "");

                                    const barcode = item.barcode || (typeof item.product_id === "object" ? item.product_id?.barcode : "");

                                    const curLotId = typeof item.lot_id === "object"
                                        ? String(item.lot_id?.lot_id || item.lot_id?.id || "0")
                                        : String(item.lot_id || "0");

                                    const versionName = typeof item.version_id === "object"
                                        ? (item.version_id?.version_name || item.version_id?.version_code || "Standard v1.0")
                                        : (item.version_id ? `Recipe v${item.version_id}` : "Standard v1.0");

                                    const sysCount = item.system_count || 0;
                                    const physCount = item.physical_count;
                                    const unitPrice = item.unit_price || 0;
                                    const diff = item.variance !== undefined ? item.variance : (physCount !== null ? physCount - sysCount : 0);
                                    const factor = item.uom_factor || 1;
                                    const baseDiff = diff * factor;
                                    const diffCost = baseDiff * unitPrice;
                                    const totalValuation = (physCount !== null ? physCount : sysCount) * factor * unitPrice;

                                    const allocatedOffset = offsetQtyMap.get(item.id) || 0;

                                    return (
                                        <tr key={item.id} className={`hover:bg-muted/30 transition-colors ${item.is_no_count_product ? "bg-amber-500/5" : ""}`}>
                                            {/* SKU, Code, and Barcode */}
                                            <td className="p-3 max-w-[220px]">
                                                <div className="font-bold text-foreground truncate" title={productName}>
                                                    {productName}
                                                </div>
                                                <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                                                    {productCode && <span className="font-mono text-primary font-semibold">{productCode}</span>}
                                                    {barcode && (
                                                        <span className="font-mono flex items-center gap-0.5 text-muted-foreground">
                                                            <Barcode className="h-3 w-3 inline" />
                                                            {barcode}
                                                        </span>
                                                    )}
                                                    {item.is_no_count_product && (
                                                        <span className="px-1 py-0.2 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400 font-bold text-[9px]">
                                                            NO-COUNT
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Location Storage */}
                                            <td className="p-3 min-w-[150px]">
                                                {isReadOnly ? (
                                                    <span className="font-medium text-foreground">{getLotName(item.lot_id)}</span>
                                                ) : (
                                                    <SearchableSelect
                                                        options={locationLotOptions}
                                                        value={curLotId}
                                                        onChange={(val) => handleLocationChange(item.id, val)}
                                                        placeholder="Select location..."
                                                        className="w-full text-[11px]"
                                                    />
                                                )}
                                            </td>

                                            {/* Versioning (Only if Finished Goods) */}
                                            {isFinishedGoods && (
                                                <td className="p-3">
                                                    <span className="px-2 py-0.5 rounded-md bg-secondary text-foreground text-[10px] font-mono font-bold border border-border">
                                                        {versionName}
                                                    </span>
                                                </td>
                                            )}

                                            {/* UOM */}
                                            <td className="p-3 text-center font-mono uppercase text-muted-foreground">
                                                {item.uom || item.unit_of_measure || "PCS"}
                                            </td>

                                            {/* System Count */}
                                            <td className="p-3 text-right font-mono font-bold text-muted-foreground">
                                                {sysCount.toLocaleString()}
                                            </td>

                                            {/* Physical Count Input */}
                                            <td className="p-3 text-center">
                                                {isReadOnly ? (
                                                    <span className="font-mono font-bold text-foreground">
                                                        {physCount !== null ? physCount.toLocaleString() : "—"}
                                                    </span>
                                                ) : (
                                                    <input
                                                        type="number"
                                                        step="0.0001"
                                                        value={physCount !== null ? physCount : ""}
                                                        onChange={(e) => handleCountChange(item.id, e.target.value)}
                                                        placeholder="Enter count"
                                                        className="w-24 px-2 py-1 text-center font-mono font-bold bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary outline-hidden"
                                                    />
                                                )}
                                            </td>

                                            {/* Variance */}
                                            <td className="p-3 text-right font-mono font-bold">
                                                {physCount === null ? (
                                                    <span className="text-muted-foreground">—</span>
                                                ) : diff > 0.0001 ? (
                                                    <span className="text-emerald-500">+{diff.toLocaleString()}</span>
                                                ) : diff < -0.0001 ? (
                                                    <span className="text-rose-500">{diff.toLocaleString()}</span>
                                                ) : (
                                                    <span className="text-muted-foreground">0</span>
                                                )}
                                            </td>

                                            {/* Unit Price */}
                                            <td className="p-3 text-right font-mono text-muted-foreground">
                                                {formatCurrency(unitPrice)}
                                            </td>

                                            {/* Count Valuation Amount */}
                                            <td className="p-3 text-right font-mono font-bold text-foreground">
                                                {formatCurrency(totalValuation)}
                                            </td>

                                            {/* Difference Cost */}
                                            <td className={`p-3 text-right font-mono font-bold ${diffCost > 0.0001 ? "text-emerald-500" : diffCost < -0.0001 ? "text-rose-500" : "text-muted-foreground"}`}>
                                                {physCount === null ? "—" : formatCurrency(diffCost)}
                                            </td>

                                            {/* Offsetting Status Tag */}
                                            <td className="p-3 text-center">
                                                {allocatedOffset > 0 ? (
                                                    <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                                                        Offset {allocatedOffset.toLocaleString()}
                                                    </span>
                                                ) : (
                                                    <span className="text-muted-foreground text-[10px]">—</span>
                                                )}
                                            </td>

                                            {/* Actions */}
                                            {!isReadOnly && (
                                                <td className="p-3 text-center">
                                                    {item.is_no_count_product && (
                                                        <button
                                                            onClick={() => handleDeleteLineItem(item.id)}
                                                            className="p-1 rounded-lg text-rose-500 hover:bg-rose-500/10 transition-colors"
                                                            title="Remove No-Count SKU"
                                                        >
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        </button>
                                                    )}
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })
                            ) : (
                                <tr>
                                    <td colSpan={isFinishedGoods ? 12 : 11} className="p-12 text-center text-muted-foreground text-xs">
                                        No line items matching filter or search query.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Sub-Modals */}
            {isNoCountModalOpen && (
                <AddNoCountProductModal
                    isOpen={isNoCountModalOpen}
                    onClose={() => setIsNoCountModalOpen(false)}
                    onAddProduct={handleAddNoCountProduct}
                    availableProducts={availableProducts}
                    availableLots={availableLots}
                    availableVersions={availableVersions}
                    isFinishedGoods={isFinishedGoods}
                />
            )}

            {isOffsetModalOpen && (
                <OffsettingModal
                    isOpen={isOffsetModalOpen}
                    onClose={() => setIsOffsetModalOpen(false)}
                    lineItems={lineItems}
                    initialPairings={offsetPairings}
                    onApplyOffsetting={handleApplyOffsetting}
                    isReadOnly={isReadOnly}
                />
            )}

            {isPrintSheetOpen && (
                <PrintableCountSheet
                    sheet={{ ...activeSheet, line_items: lineItems }}
                    onClose={() => setIsPrintSheetOpen(false)}
                />
            )}

            {isPrintOffsetOpen && (
                <PrintableOffsettingReport
                    sheet={{ ...activeSheet, line_items: lineItems }}
                    pairings={offsetPairings}
                    onClose={() => setIsPrintOffsetOpen(false)}
                />
            )}
        </div>
    );
}
