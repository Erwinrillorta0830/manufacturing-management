"use client";

import React, { useState, useMemo } from "react";
import {
    Search,
    Building2,
    Plus,
    Ban
} from "lucide-react";
import { PhysicalCountSheet, Branch, Supplier, ProductType } from "../types";
import { formatCurrency, formatDate } from "../utils";
import SearchableSelect, { SelectOption } from "./SearchableSelect";

interface CountSheetsListProps {
    countSheets: PhysicalCountSheet[];
    branches?: Branch[];
    suppliers?: Supplier[];
    productTypes?: ProductType[];
    onOpenNewModal?: () => void;
    onCreateNew?: () => void;
    onSelectSheetToEdit?: (sheet: PhysicalCountSheet) => void;
    onSelectSheet?: (sheet: PhysicalCountSheet) => void;
    onOpenCommitModal?: (sheet: PhysicalCountSheet) => void;
    onCommitSheet?: (sheet: PhysicalCountSheet) => void;
    onCancelSheet?: (sheetId: string) => void;
}

function parseBufferOrBool(val: unknown): boolean {
    if (val === true || val === 1 || val === "1") return true;
    if (val === false || val === 0 || val === "0" || val === null || val === undefined) return false;
    if (typeof val === "object" && val !== null) {
        const obj = val as { data?: unknown };
        if (Array.isArray(obj.data) && obj.data.length > 0) {
            return Number(obj.data[0]) === 1;
        }
        if (typeof obj.data === "number") {
            return obj.data === 1;
        }
    }
    return false;
}

export default function CountSheetsList({
    countSheets,
    branches = [],
    suppliers = [],
    productTypes = [],
    onOpenNewModal,
    onCreateNew,
    onSelectSheetToEdit,
    onSelectSheet,
    onOpenCommitModal,
    onCommitSheet,
    onCancelSheet
}: CountSheetsListProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const [branchFilter, setBranchFilter] = useState<string | number>("all");
    const [supplierFilter, setSupplierFilter] = useState<string | number>("all");
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [inventoryTypeFilter, setInventoryTypeFilter] = useState<string>("all");
    const [stockTypeFilter, setStockTypeFilter] = useState<string>("all");

    const handleSelect = onSelectSheetToEdit || onSelectSheet;
    const handleCommit = onOpenCommitModal || onCommitSheet;
    const handleCreate = onOpenNewModal || onCreateNew;

    // Branch Options
    const branchOptions: SelectOption[] = useMemo(() => {
        const list: SelectOption[] = [{ value: "all", label: "All Facilities / Branches" }];
        (branches || []).forEach(b => {
            const bId = b.id || b.branch_id || 0;
            const bName = b.branchName || b.branch_name || b.name || `Branch #${bId}`;
            const bCode = b.branchCode || b.branch_code || "";
            list.push({
                value: bId,
                label: bCode ? `${bName} (${bCode})` : bName
            });
        });
        return list;
    }, [branches]);

    // Supplier Options
    const supplierOptions: SelectOption[] = useMemo(() => {
        const list: SelectOption[] = [{ value: "all", label: "All Vendors & Suppliers" }];
        (suppliers || []).forEach(s => {
            const sId = s.id || s.supplier_id;
            const sName = s.supplier_name || s.name || `Supplier #${sId}`;
            if (sId) {
                list.push({ value: String(sId), label: sName });
            }
        });
        return list;
    }, [suppliers]);

    const statusOptions: SelectOption[] = [
        { value: "all", label: "All Statuses" },
        { value: "Draft", label: "Draft" },
        { value: "In Progress", label: "In Progress" },
        { value: "Pending Reconciliation", label: "Pending Reconciliation" },
        { value: "Committed", label: "Committed" },
        { value: "Cancelled", label: "Cancelled" }
    ];

    // Dynamic Inventory Type Options from Product Types
    const inventoryTypeOptions: SelectOption[] = useMemo(() => {
        const list: SelectOption[] = [{ value: "all", label: "All Inventory Types" }];
        if (productTypes && productTypes.length > 0) {
            productTypes.forEach(pt => {
                const val = pt.name || pt.typeName || pt.type_name || `Type #${pt.id || pt.inventoryTypeId}`;
                list.push({
                    value: val,
                    label: val
                });
            });
        } else {
            list.push(
                { value: "Raw Materials", label: "Raw Materials (RM)" },
                { value: "Packaging", label: "Packaging Materials (PKG)" },
                { value: "Finished Goods", label: "Finished Goods (FG)" }
            );
        }
        return list;
    }, [productTypes]);

    const stockTypeOptions: SelectOption[] = [
        { value: "all", label: "All Stock Conditions" },
        { value: "Good Stock", label: "Good Stock" },
        { value: "Bad Stock", label: "Bad Stock" }
    ];

    // Filter count sheets
    const filteredSheets = useMemo(() => {
        return countSheets.filter(sheet => {
            const query = searchQuery.toLowerCase().trim();
            const phNo = (sheet.ph_no || sheet.sheet_no || "").toLowerCase();
            const bName = (sheet.branch_name || "").toLowerCase();
            const remarks = (sheet.remarks || sheet.notes || "").toLowerCase();

            const matchesQuery = !query ||
                phNo.includes(query) ||
                bName.includes(query) ||
                remarks.includes(query);

            if (!matchesQuery) return false;

            if (branchFilter !== "all" && String(sheet.branch_id) !== String(branchFilter)) {
                return false;
            }

            if (supplierFilter !== "all" && String(sheet.supplier_id) !== String(supplierFilter)) {
                return false;
            }

            if (inventoryTypeFilter !== "all") {
                const sType = (sheet.inventory_type || "").toLowerCase();
                const fType = String(inventoryTypeFilter).toLowerCase();
                if (!sType.includes(fType) && !fType.includes(sType)) {
                    return false;
                }
            }

            if (stockTypeFilter !== "all") {
                const sCond = (sheet.stock_type || "").toLowerCase();
                const fCond = String(stockTypeFilter).toLowerCase();
                if (!sCond.includes(fCond) && !fCond.includes(sCond)) {
                    return false;
                }
            }

            if (statusFilter !== "all") {
                const isCommitted = parseBufferOrBool(sheet.isComitted) || parseBufferOrBool(sheet.is_committed);
                const isCancelled = parseBufferOrBool(sheet.isCancelled) || parseBufferOrBool(sheet.is_cancelled);
                const hasOffsets = (sheet.offset_pairings || []).length > 0;

                let currentStatus = "In Progress";
                if (isCommitted) currentStatus = "Committed";
                else if (isCancelled) currentStatus = "Cancelled";
                else if (hasOffsets) currentStatus = "Pending Reconciliation";

                if (statusFilter === "Draft" && (isCommitted || isCancelled)) return false;
                if (statusFilter === "Committed" && !isCommitted) return false;
                if (statusFilter === "Cancelled" && !isCancelled) return false;
                if (statusFilter === "Pending Reconciliation" && (currentStatus !== "Pending Reconciliation")) return false;
                if (statusFilter === "In Progress" && currentStatus !== "In Progress") return false;
            }

            return true;
        });
    }, [countSheets, searchQuery, branchFilter, supplierFilter, statusFilter, inventoryTypeFilter, stockTypeFilter]);

    return (
        <div className="space-y-4">
            {/* Filter Toolbar (Section 3.1 & 3.2) */}
            <div className="bg-card border border-border p-4 rounded-2xl shadow-xs space-y-3">
                {/* Search Bar & Primary Actions */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="relative w-full sm:w-80">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <input
                            type="text"
                            placeholder="Search document #, facility, remarks..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-3 py-1.5 text-xs bg-background border border-border rounded-xl focus:ring-2 focus:ring-primary outline-hidden"
                        />
                    </div>

                    {handleCreate && (
                        <button
                            onClick={handleCreate}
                            className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs rounded-xl shadow-xs transition-all hover:scale-[1.01]"
                        >
                            <Plus className="h-4 w-4" />
                            Initialize Count Sheet
                        </button>
                    )}
                </div>

                {/* Dropdown Filters Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 pt-1">
                    <div>
                        <span className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">Facility</span>
                        <SearchableSelect
                            options={branchOptions}
                            value={branchFilter}
                            onChange={(val) => setBranchFilter(val)}
                            placeholder="All Branches"
                            className="text-xs"
                        />
                    </div>

                    <div>
                        <span className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">Inventory Type</span>
                        <SearchableSelect
                            options={inventoryTypeOptions}
                            value={inventoryTypeFilter}
                            onChange={(val) => setInventoryTypeFilter(String(val))}
                            placeholder="All Types"
                            className="text-xs"
                        />
                    </div>

                    <div>
                        <span className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">Stock Condition</span>
                        <SearchableSelect
                            options={stockTypeOptions}
                            value={stockTypeFilter}
                            onChange={(val) => setStockTypeFilter(String(val))}
                            placeholder="All Conditions"
                            className="text-xs"
                        />
                    </div>

                    <div>
                        <span className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">Supplier Scope</span>
                        <SearchableSelect
                            options={supplierOptions}
                            value={supplierFilter}
                            onChange={(val) => setSupplierFilter(val)}
                            placeholder="All Suppliers"
                            className="text-xs"
                        />
                    </div>

                    <div>
                        <span className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">Audit Status</span>
                        <SearchableSelect
                            options={statusOptions}
                            value={statusFilter}
                            onChange={(val) => setStatusFilter(String(val))}
                            placeholder="All Statuses"
                            className="text-xs"
                        />
                    </div>
                </div>
            </div>

            {/* Count Sheets Table (Section 3.3) */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                        <thead className="bg-muted/50 border-b border-border text-muted-foreground font-semibold">
                            <tr>
                                <th className="p-3.5">Sheet Number</th>
                                <th className="p-3.5">Facility Branch</th>
                                <th className="p-3.5">Inventory Type</th>
                                <th className="p-3.5">Stock Condition</th>
                                <th className="p-3.5">Counting Start</th>
                                <th className="p-3.5">Cut-Off Baseline</th>
                                <th className="p-3.5 text-right">Net Value</th>
                                <th className="p-3.5 text-center">Status</th>
                                <th className="p-3.5 text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60 font-medium">
                            {filteredSheets.length > 0 ? (
                                filteredSheets.map(sheet => {
                                    const isCommitted = parseBufferOrBool(sheet.isComitted) || parseBufferOrBool(sheet.is_committed);
                                    const isCancelled = parseBufferOrBool(sheet.isCancelled) || parseBufferOrBool(sheet.is_cancelled);
                                    const hasOffsets = (sheet.offset_pairings || []).length > 0;

                                    let statusLabel = "In Progress";
                                    let statusColor = "bg-blue-500/10 text-blue-500 border-blue-500/20";
                                    if (isCommitted) {
                                        statusLabel = "Committed";
                                        statusColor = "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
                                    } else if (isCancelled) {
                                        statusLabel = "Cancelled";
                                        statusColor = "bg-rose-500/10 text-rose-500 border-rose-500/20";
                                    } else if (hasOffsets) {
                                        statusLabel = "Pending Reconciliation";
                                        statusColor = "bg-purple-500/10 text-purple-500 border-purple-500/20";
                                    }

                                    return (
                                        <tr
                                            key={sheet.id}
                                            onClick={() => handleSelect && handleSelect(sheet)}
                                            className="hover:bg-muted/40 cursor-pointer transition-colors"
                                        >
                                            {/* Sheet Number */}
                                            <td className="p-3.5 font-mono font-bold text-primary">
                                                #{sheet.ph_no || sheet.sheet_no}
                                            </td>

                                            {/* Branch */}
                                            <td className="p-3.5">
                                                <div className="font-bold text-foreground flex items-center gap-1.5">
                                                    <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                                                    {sheet.branch_name}
                                                </div>
                                            </td>

                                            {/* Inventory Type */}
                                            <td className="p-3.5">
                                                <span className="px-2 py-0.5 rounded-md bg-secondary text-foreground text-[10px] font-semibold border border-border">
                                                    {sheet.inventory_type || "Finished Goods"}
                                                </span>
                                            </td>

                                            {/* Stock Condition */}
                                            <td className="p-3.5">
                                                <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${
                                                    sheet.stock_type === "Bad Stock"
                                                        ? "bg-rose-500/10 text-rose-500 border-rose-500/20"
                                                        : "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                                                }`}>
                                                    {sheet.stock_type || "Good Stock"}
                                                </span>
                                            </td>

                                            {/* Counting Start */}
                                            <td className="p-3.5 font-mono text-muted-foreground text-[11px]">
                                                {formatDate(sheet.starting_date)}
                                            </td>

                                            {/* Cut-off Date */}
                                            <td className="p-3.5 font-mono text-muted-foreground text-[11px]">
                                                {formatDate(sheet.cutOff_date || sheet.cutoff_date)}
                                            </td>

                                            {/* Net Reconciled Cost */}
                                            <td className="p-3.5 text-right font-mono font-bold text-foreground">
                                                {formatCurrency(sheet.total_amount || 0)}
                                            </td>

                                            {/* Status Badge */}
                                            <td className="p-3.5 text-center">
                                                <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${statusColor}`}>
                                                    {statusLabel}
                                                </span>
                                            </td>

                                            {/* Actions */}
                                            <td className="p-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                                                <div className="flex items-center justify-center gap-1.5">
                                                    <button
                                                        onClick={() => handleSelect && handleSelect(sheet)}
                                                        className="px-2.5 py-1 rounded-lg bg-secondary hover:bg-secondary/80 text-foreground font-semibold text-[11px] border border-border transition-all"
                                                    >
                                                        View / Edit
                                                    </button>
                                                    {!isCommitted && !isCancelled && handleCommit && (
                                                        <button
                                                            onClick={() => handleCommit(sheet)}
                                                            className="px-2.5 py-1 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-[11px] shadow-xs transition-all"
                                                        >
                                                            Commit
                                                        </button>
                                                    )}
                                                    {!isCommitted && !isCancelled && onCancelSheet && (
                                                        <button
                                                            onClick={() => onCancelSheet(sheet.id)}
                                                            className="p-1 rounded-lg bg-muted hover:bg-rose-500/10 text-muted-foreground hover:text-rose-500 transition-all"
                                                            title="Cancel Count Sheet"
                                                        >
                                                            <Ban className="h-3.5 w-3.5" />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            ) : (
                                <tr>
                                    <td colSpan={9} className="p-12 text-center text-muted-foreground text-xs">
                                        No physical inventory count sheets found matching the active filters.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
