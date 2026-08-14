"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
    X,
    Building2,
    Calendar,
    Layers,
    DollarSign,
    FileText,
    Sparkles,
    Loader2,
    ShieldAlert,
    Clock,
    Tag,
    Truck
} from "lucide-react";
import { toast } from "sonner";
import { PRICE_TYPES } from "../mock-data";
import SearchableSelect, { SelectOption } from "./SearchableSelect";
import { fetchSuppliers, fetchProductTypes } from "../services/physical-inventory-api";
import { Branch, Supplier, ProductType, StockConditionType } from "../types";

interface NewCountSheetModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (payload: {
        branch_id: number;
        starting_date: string;
        cutoff_date: string;
        inventory_type: string;
        product_type_id?: number;
        stock_type: string;
        supplier_id?: number;
        price_type?: string;
        remarks?: string;
    }) => Promise<void>;
    branches?: Branch[];
    suppliers?: Supplier[];
    productTypes?: ProductType[];
    isSubmitting?: boolean;
}

const STOCK_CONDITION_OPTIONS: SelectOption[] = [
    { value: "Good Stock", label: "Good Stock (Standard Inventory)" },
    { value: "Bad Stock", label: "Bad Stock (Damaged / Expired / Quarantined)" }
];

function getLocalIsoString(d: Date = new Date()): string {
    const pad = (n: number) => String(n).padStart(2, "0");
    const year = d.getFullYear();
    const month = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const hours = pad(d.getHours());
    const minutes = pad(d.getMinutes());
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export default function NewCountSheetModal({
    isOpen,
    onClose,
    onSubmit,
    branches = [],
    suppliers: initialSuppliers = [],
    productTypes: initialProductTypes = [],
    isSubmitting = false
}: NewCountSheetModalProps) {
    const [fetchedSuppliers, setFetchedSuppliers] = useState<Supplier[]>(initialSuppliers);
    const [fetchedProductTypes, setFetchedProductTypes] = useState<ProductType[]>(initialProductTypes);

    const [branchId, setBranchId] = useState<string | number>(() => {
        if (branches.length > 0) {
            return branches[0].id || branches[0].branch_id || "1";
        }
        return "1";
    });

    const [startingDate, setStartingDate] = useState(() => getLocalIsoString(new Date()));
    const [cutoffDate, setCutoffDate] = useState(() => getLocalIsoString(new Date()));
    const [inventoryType, setInventoryType] = useState<string>("Finished Goods");
    const [stockType, setStockType] = useState<StockConditionType>("Good Stock");
    const [supplierId, setSupplierId] = useState<string | number>("");
    const [priceType, setPriceType] = useState<string | number>(PRICE_TYPES[0]);
    const [notes, setNotes] = useState("");

    // Maximum allowed timestamp is now (Real-time rule)
    const maxAllowedTimestamp = useMemo(() => getLocalIsoString(new Date()), []);

    // Fetch suppliers & product types if not provided
    useEffect(() => {
        if (isOpen) {
            if (fetchedSuppliers.length === 0) {
                fetchSuppliers().then(sup => setFetchedSuppliers(sup));
            }
            if (fetchedProductTypes.length === 0) {
                fetchProductTypes().then(pts => setFetchedProductTypes(pts));
            }
        }
    }, [isOpen, fetchedSuppliers.length, fetchedProductTypes.length]);

    // Build branch options for SearchableSelect
    const branchOptions: SelectOption[] = useMemo(() => {
        if (!branches || branches.length === 0) {
            return [{ value: "1", label: "Main Factory Branch" }];
        }
        return branches.map((b) => {
            const bId = b.id || b.branch_id || 0;
            const bName = b.branchName || b.branch_name || b.name || b.title || "Facility Branch";
            const bCode = b.branchCode || b.branch_code || "";
            return {
                value: bId,
                label: bCode ? `${bName} (${bCode})` : bName
            };
        });
    }, [branches]);

    // Build dynamic inventory type options from Product Types
    const inventoryTypeOptions: SelectOption[] = useMemo(() => {
        const list = fetchedProductTypes.length > 0 ? fetchedProductTypes : initialProductTypes;
        if (list && list.length > 0) {
            return list.map(pt => {
                const val = pt.name || pt.typeName || pt.type_name || `Type #${pt.id || pt.inventoryTypeId}`;
                return {
                    value: val,
                    label: val
                };
            });
        }
        return [
            { value: "Raw Materials", label: "Raw Materials (RM)" },
            { value: "Packaging", label: "Packaging Materials (PKG)" },
            { value: "Finished Goods", label: "Finished Goods (FG)" }
        ];
    }, [fetchedProductTypes, initialProductTypes]);

    // Build supplier options
    const supplierOptions: SelectOption[] = useMemo(() => {
        const list: SelectOption[] = [{ value: "", label: "All Vendors & Suppliers (Unfiltered)" }];
        (fetchedSuppliers || []).forEach(s => {
            const sId = s.id || s.supplier_id;
            const sName = s.supplier_name || s.name || `Supplier #${sId}`;
            if (sId) {
                list.push({ value: String(sId), label: sName });
            }
        });
        return list;
    }, [fetchedSuppliers]);

    const priceOptions: SelectOption[] = useMemo(() => {
        return PRICE_TYPES.map(p => ({ value: p, label: p }));
    }, []);

    if (!isOpen) return null;

    const effectiveBranchId = branchId || (branches.length > 0 ? (branches[0].id || branches[0].branch_id || 1) : 1);
    const effectiveInventoryType = inventoryTypeOptions.some(o => o.value === inventoryType)
        ? inventoryType
        : (inventoryTypeOptions[0]?.value ? String(inventoryTypeOptions[0].value) : "Finished Goods");

    const allProductTypesList = fetchedProductTypes.length > 0 ? fetchedProductTypes : initialProductTypes;
    const selectedPT = allProductTypesList.find(pt => {
        const val = pt.name || pt.typeName || pt.type_name || `Type #${pt.id || pt.inventoryTypeId}`;
        return val === effectiveInventoryType;
    });
    const resolvedProductTypeId = selectedPT?.id || selectedPT?.inventoryTypeId;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Validate Cut-off Date: Strictly Cut-Off <= NOW()
        const cutoffTime = new Date(cutoffDate).getTime();
        const currentTime = new Date().getTime() + 60000; // allow 1 min grace

        if (cutoffTime > currentTime) {
            toast.error("Strict Real-Time Rule Violation: Cut-Off Date and Time cannot exceed the current time (Cut-Off <= NOW()).");
            return;
        }

        const startingTime = new Date(startingDate).getTime();
        if (startingTime > cutoffTime) {
            toast.error("Start Date and Time cannot be after the Cut-Off Date and Time.");
            return;
        }

        await onSubmit({
            branch_id: Number(effectiveBranchId) || 1,
            starting_date: new Date(startingDate).toISOString(),
            cutoff_date: new Date(cutoffDate).toISOString(),
            inventory_type: effectiveInventoryType,
            product_type_id: resolvedProductTypeId ? Number(resolvedProductTypeId) : undefined,
            stock_type: stockType,
            supplier_id: supplierId ? Number(supplierId) : undefined,
            price_type: String(priceType),
            remarks: notes
        });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-card border border-border w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
                {/* Modal Header */}
                <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-muted/40">
                    <div className="flex items-center gap-3">
                        <div className="bg-primary/10 p-2.5 rounded-xl text-primary border border-primary/20">
                            <Sparkles className="h-5 w-5" />
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-foreground">Initialize Physical Count Sheet</h3>
                            <p className="text-xs text-muted-foreground">Snapshot live database stock ledger balances for physical audit (PI 2.0)</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={isSubmitting}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Form Body */}
                <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
                    {/* Facility Branch */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                            <Building2 className="h-3.5 w-3.5 text-primary" />
                            Target Branch / Factory Facility <span className="text-rose-500">*</span>
                        </label>
                        <SearchableSelect
                            options={branchOptions}
                            value={effectiveBranchId}
                            onChange={(val) => setBranchId(val)}
                            placeholder="Search & select facility branch..."
                            searchPlaceholder="Type branch name to search..."
                            disabled={isSubmitting}
                            icon={<Building2 className="h-4 w-4" />}
                            required
                        />
                    </div>

                    {/* Inventory Classification & Stock Condition */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                                <Layers className="h-3.5 w-3.5 text-primary" />
                                Inventory Type (Product Type) <span className="text-rose-500">*</span>
                            </label>
                            <SearchableSelect
                                options={inventoryTypeOptions}
                                value={effectiveInventoryType}
                                onChange={(val) => setInventoryType(String(val))}
                                placeholder="Select inventory type..."
                                searchPlaceholder="Search inventory type..."
                                disabled={isSubmitting}
                                icon={<Layers className="h-4 w-4" />}
                                required
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                                <Tag className="h-3.5 w-3.5 text-primary" />
                                Stock Condition Type <span className="text-rose-500">*</span>
                            </label>
                            <SearchableSelect
                                options={STOCK_CONDITION_OPTIONS}
                                value={stockType}
                                onChange={(val) => setStockType(val as StockConditionType)}
                                placeholder="Select stock condition..."
                                searchPlaceholder="Search condition..."
                                disabled={isSubmitting}
                                icon={<Tag className="h-4 w-4" />}
                                required
                            />
                        </div>
                    </div>

                    {/* Datetime Range (Start Date vs Real-Time Cut-off) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3.5 bg-muted/20 border border-border rounded-xl">
                        {/* Start Date & Time */}
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                                <Clock className="h-3.5 w-3.5 text-primary" />
                                Counting Start Date & Time <span className="text-rose-500">*</span>
                            </label>
                            <input
                                type="datetime-local"
                                value={startingDate}
                                onChange={(e) => setStartingDate(e.target.value)}
                                disabled={isSubmitting}
                                className="w-full px-3 py-2 text-xs bg-background border border-border rounded-xl focus:outline-hidden focus:ring-2 focus:ring-primary/20 transition-all font-mono"
                                required
                            />
                            <span className="text-[10px] text-muted-foreground block">
                                Official start timestamp when physical counting commenced.
                            </span>
                        </div>

                        {/* Cut-off Date & Time */}
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                                <Calendar className="h-3.5 w-3.5 text-primary" />
                                Cut-Off Date & Time <span className="text-rose-500">*</span>
                            </label>
                            <input
                                type="datetime-local"
                                value={cutoffDate}
                                max={maxAllowedTimestamp}
                                onChange={(e) => setCutoffDate(e.target.value)}
                                disabled={isSubmitting}
                                className="w-full px-3 py-2 text-xs bg-background border border-border rounded-xl focus:outline-hidden focus:ring-2 focus:ring-primary/20 transition-all font-mono"
                                required
                            />
                            <span className="text-[10px] text-amber-500/90 font-medium flex items-center gap-1 block">
                                <ShieldAlert className="h-3 w-3 inline shrink-0" />
                                Strict Rule: Must be present or past (Cut-Off &le; NOW).
                            </span>
                        </div>
                    </div>

                    {/* Scoping Filters: Supplier & Valuation Price Type */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                                <Truck className="h-3.5 w-3.5 text-primary" />
                                Vendor / Supplier Scope
                            </label>
                            <SearchableSelect
                                options={supplierOptions}
                                value={supplierId}
                                onChange={(val) => setSupplierId(val)}
                                placeholder="All Suppliers (Unfiltered)"
                                searchPlaceholder="Type supplier name..."
                                disabled={isSubmitting}
                                icon={<Truck className="h-4 w-4" />}
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                                <DollarSign className="h-3.5 w-3.5 text-primary" />
                                Valuation Price Type
                            </label>
                            <SearchableSelect
                                options={priceOptions}
                                value={priceType}
                                onChange={(val) => setPriceType(val)}
                                placeholder="Select price type..."
                                searchPlaceholder="Search price type..."
                                disabled={isSubmitting}
                                icon={<DollarSign className="h-4 w-4" />}
                            />
                        </div>
                    </div>

                    {/* Remarks / Notes */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                            <FileText className="h-3.5 w-3.5 text-primary" />
                            Audit Remarks & Shift Notes
                        </label>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            disabled={isSubmitting}
                            placeholder="e.g. Mid-year aggregate floor audit - Shift B"
                            rows={2}
                            className="w-full px-3 py-2 text-xs bg-background border border-border rounded-xl focus:outline-hidden focus:ring-2 focus:ring-primary/20 transition-all resize-none"
                        />
                    </div>

                    {/* Footer Buttons */}
                    <div className="pt-4 border-t border-border flex items-center justify-end gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isSubmitting}
                            className="px-4 py-2 bg-muted hover:bg-muted/80 text-muted-foreground font-semibold text-xs rounded-xl transition-all"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="flex items-center gap-2 px-5 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs rounded-xl shadow-sm transition-all hover:scale-[1.01] disabled:opacity-50"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Snapshotting Database...
                                </>
                            ) : (
                                <>
                                    <Sparkles className="h-4 w-4" />
                                    Initialize & Snapshot Stock
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
