import React from "react";
import { ChevronDown, ChevronUp, Loader2, Tag } from "lucide-react";
import { RawMaterialItem, WeightUnitOption, BranchGroupedBatches } from "../types/raw-materials.types";
import { BatchLocationsTree } from "./BatchLocationsTree";

interface RawMaterialsTableProps {
    sortedFiltered: RawMaterialItem[];
    rawMaterials: RawMaterialItem[];
    loadingItems: boolean;
    expandedProductId: number | null;
    onToggleExpand: (id: number) => void;
    onStartEdit: (item: RawMaterialItem) => void;
    isItemPkg: (item: RawMaterialItem) => boolean;
    weightUnits: WeightUnitOption[];
    loadingBatches: boolean;
    groupedByBranch: BranchGroupedBatches[];
    page: number;
    setPage: (p: number) => void;
    pageSize: number;
}

export function RawMaterialsTable({
    sortedFiltered,
    rawMaterials,
    loadingItems,
    expandedProductId,
    onToggleExpand,
    onStartEdit,
    isItemPkg,
    weightUnits,
    loadingBatches,
    groupedByBranch,
    page,
    setPage,
    pageSize
}: RawMaterialsTableProps) {
    const totalPages = Math.max(1, Math.ceil(sortedFiltered.length / pageSize));
    const paginatedItems = sortedFiltered.slice((page - 1) * pageSize, page * pageSize);

    return (
        <div className="border rounded-xl bg-card overflow-x-auto shadow-sm">
            <table className="w-full text-left border-collapse text-xs min-w-[850px]">
                <thead>
                    <tr className="bg-muted/50 border-b">
                        <th className="p-3 w-10"></th>
                        {/* 1. Category */}
                        <th className="p-3 font-bold text-muted-foreground">Category</th>
                        {/* 2. Material Name */}
                        <th className="p-3 font-bold text-muted-foreground">Material Name</th>
                        {/* 3. Product Code */}
                        <th className="p-3 font-bold text-muted-foreground">Product Code</th>
                        {/* 4. UOM */}
                        <th className="p-3 font-bold text-muted-foreground text-center">UOM</th>
                        {/* 5. Gross Weight */}
                        <th className="p-3 font-bold text-muted-foreground text-right">Gross Weight</th>
                        {/* 6. Standard Landed Unit Cost */}
                        <th className="p-3 font-black text-foreground text-right">Standard Landed Unit Cost (PHP)</th>
                        {/* 7. Actions */}
                        <th className="p-3 font-bold text-muted-foreground text-right w-24">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y">
                    {loadingItems ? (
                        <tr>
                            <td colSpan={8} className="p-12 text-center text-muted-foreground">
                                <div className="flex items-center justify-center gap-2">
                                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                                    <span>Loading items...</span>
                                </div>
                            </td>
                        </tr>
                    ) : sortedFiltered.length === 0 ? (
                        <tr>
                            <td colSpan={8} className="p-12 text-center text-muted-foreground">
                                No materials found.
                            </td>
                        </tr>
                    ) : (
                        paginatedItems.map(m => {
                            const isExpanded = expandedProductId === m.product_id;
                            const isPkg = isItemPkg(m);
                            const isChild = !!m.parent_id;

                            // Compute category name string
                            const categoryName = typeof m.product_category === "object" && m.product_category
                                ? (m.product_category as { category_name?: string }).category_name || "Unassigned"
                                : (m.category_name || "Unassigned");

                            // Compute tree connector and parent count details
                            let connector = "";
                            if (isChild) {
                                const parentChildren = sortedFiltered.filter(c => Number(c.parent_id) === Number(m.parent_id));
                                const childIndex = parentChildren.findIndex(c => c.product_id === m.product_id);
                                const isLast = childIndex === parentChildren.length - 1;
                                connector = isLast ? "└──" : "├──";
                            }

                            const childrenCount = !isChild
                                ? rawMaterials.filter(c => Number(c.parent_id) === m.product_id).length
                                : 0;

                            return (
                                <React.Fragment key={m.product_id}>
                                    <tr
                                        onClick={() => onToggleExpand(m.product_id)}
                                        className={`${isChild
                                                ? "bg-muted/20 hover:bg-muted/40 border-l-4 border-l-primary/30"
                                                : "bg-card hover:bg-muted/10 border-l-2 border-l-transparent hover:border-l-primary"
                                            } cursor-pointer transition-all border-b`}
                                    >
                                        <td className="p-3 text-center">
                                            {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                                        </td>

                                        {/* 1. Category */}
                                        <td className="p-3">
                                            <span className="inline-flex items-center gap-1 bg-muted/60 text-foreground font-extrabold text-[10px] px-2 py-0.5 rounded-full border border-border">
                                                <Tag className="h-2.5 w-2.5 text-amber-500" />
                                                {categoryName}
                                            </span>
                                        </td>

                                        {/* 2. Material Name */}
                                        <td className="p-3">
                                            <div className="flex items-center gap-2">
                                                {isChild && (
                                                    <span className="text-primary/60 font-mono text-xs select-none font-bold mr-1">{connector}</span>
                                                )}
                                                <div>
                                                    <span className={`font-semibold block ${isChild ? "text-[11px] text-foreground/80" : "text-xs text-foreground"}`}>
                                                        {m.product_name}
                                                    </span>
                                                    <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                                                        <span className={`text-[8px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded ${isPkg ? "text-purple-600 bg-purple-500/10" : "text-amber-600 bg-amber-500/10"}`}>
                                                            {isPkg ? "Packaging Item" : "Raw Material"}
                                                        </span>
                                                        {isChild && (
                                                            <span className="text-[8px] font-bold uppercase tracking-wider text-blue-600 bg-blue-500/10 px-1.5 py-0.5 rounded">
                                                                UOM factor: 1:{m.unit_of_measurement_count}
                                                            </span>
                                                        )}
                                                        {childrenCount > 0 && (
                                                            <span className="text-[8px] font-bold uppercase tracking-wider text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                                                                {childrenCount} variant{childrenCount > 1 ? "s" : ""}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>

                                        {/* 3. Product Code */}
                                        <td className="p-3 font-mono text-[11px] text-muted-foreground font-semibold">
                                            {m.product_code || `ID-${m.product_id}`}
                                        </td>

                                        {/* 4. UOM */}
                                        <td className="p-3 text-center">
                                            <span className="bg-muted px-2 py-0.5 rounded text-[10px] font-bold text-foreground">
                                                {m.unit_of_measurement?.unit_shortcut || "PCS"}
                                            </span>
                                        </td>

                                        {/* 5. Gross Weight */}
                                        <td className="p-3 text-right font-mono font-medium">
                                            {m.weight && Number(m.weight) > 0 ? (
                                                <span className="text-foreground font-bold">
                                                    {Number(m.weight).toFixed(2)}{" "}
                                                    {typeof m.weight_unit_id === "object" && m.weight_unit_id
                                                        ? ((m.weight_unit_id as { code?: string; unit_shortcut?: string })?.code || (m.weight_unit_id as { code?: string; unit_shortcut?: string })?.unit_shortcut || "kg")
                                                        : (weightUnits.find(u => u.id === Number(m.weight_unit_id))?.code || "kg")}
                                                </span>
                                            ) : (
                                                <span className="text-red-500 font-bold text-[10px] bg-red-500/10 px-1.5 py-0.5 rounded">
                                                    Missing Weight
                                                </span>
                                            )}
                                        </td>

                                        {/* 6. Standard Landed Unit Cost */}
                                        <td className="p-3 text-right font-mono text-xs font-black text-foreground bg-emerald-500/5">
                                            ₱{m.cost_per_unit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>

                                        {/* 7. Actions */}
                                        <td className="p-3 text-right" onClick={e => e.stopPropagation()}>
                                            <button
                                                type="button"
                                                onClick={() => onStartEdit(m)}
                                                className="px-2.5 py-1 text-[10px] font-bold text-primary bg-primary/5 hover:bg-primary/10 border border-primary/20 hover:border-primary/45 rounded-lg transition-all cursor-pointer"
                                            >
                                                Edit
                                            </button>
                                        </td>
                                    </tr>

                                    {/* Expandable FIFO Stock Breakdown */}
                                    {isExpanded && (
                                        <tr>
                                            <td colSpan={8} className="bg-muted/5 p-4 border-b">
                                                <BatchLocationsTree
                                                    material={m}
                                                    loadingBatches={loadingBatches}
                                                    groupedByBranch={groupedByBranch}
                                                />
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            );
                        })
                    )}
                </tbody>
            </table>

            {/* Pagination Controls */}
            {sortedFiltered.length > pageSize && (
                <div className="flex items-center justify-between p-3 border-t bg-muted/20 text-xs font-semibold text-muted-foreground">
                    <div>
                        Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, sortedFiltered.length)} of {sortedFiltered.length} items
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            disabled={page <= 1}
                            onClick={() => setPage(page - 1)}
                            className="px-3 py-1 rounded border bg-background text-foreground disabled:opacity-50 cursor-pointer"
                        >
                            Previous
                        </button>
                        <span>Page {page} of {totalPages}</span>
                        <button
                            disabled={page >= totalPages}
                            onClick={() => setPage(page + 1)}
                            className="px-3 py-1 rounded border bg-background text-foreground disabled:opacity-50 cursor-pointer"
                        >
                            Next
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
