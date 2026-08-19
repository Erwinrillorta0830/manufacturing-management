import React from "react";
import { ChevronDown, ChevronUp, Loader2, Tag, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { FamilyGroup } from "../hooks/useRawMaterialsData";
import { RawMaterialItem, WeightUnitOption, BranchGroupedBatches, SelectOption } from "../types/raw-materials.types";
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
    categoriesList?: SelectOption[];
    loadingBatches: boolean;
    groupedByBranch: BranchGroupedBatches[];
    familyGroups?: FamilyGroup[];
    page: number;
    setPage: (p: number) => void;
    pageSize: number;
    setPageSize?: (ps: number) => void;
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
    categoriesList,
    loadingBatches,
    groupedByBranch,
    familyGroups,
    page,
    setPage,
    pageSize,
    setPageSize
}: RawMaterialsTableProps) {
    const totalFamilies = familyGroups ? familyGroups.length : sortedFiltered.length;
    const totalPages = Math.max(1, Math.ceil(totalFamilies / pageSize));

    const paginatedItems = React.useMemo(() => {
        if (familyGroups && familyGroups.length > 0) {
            const pagedGroups = familyGroups.slice((page - 1) * pageSize, page * pageSize);
            const flat: RawMaterialItem[] = [];
            pagedGroups.forEach(fg => {
                flat.push(fg.parent);
                if (fg.children && fg.children.length > 0) {
                    flat.push(...fg.children);
                }
            });
            return flat;
        }
        return sortedFiltered.slice((page - 1) * pageSize, page * pageSize);
    }, [familyGroups, sortedFiltered, page, pageSize]);

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
                            let categoryName = "Unassigned";
                            if (typeof m.product_category === "object" && m.product_category) {
                                categoryName = (m.product_category as { category_name?: string }).category_name || "Unassigned";
                            } else if (m.category_name) {
                                categoryName = m.category_name;
                            } else if (m.product_category && categoriesList) {
                                const catOpt = categoriesList.find(c => String(c.value) === String(m.product_category));
                                if (catOpt) categoryName = catOpt.label;
                            }

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
                                                                Family Child (1:{m.unit_of_measurement_count})
                                                            </span>
                                                        )}
                                                        {childrenCount > 0 && (
                                                            <span className="text-[8px] font-black uppercase tracking-wider text-primary bg-primary/15 px-2 py-0.5 rounded-full border border-primary/20">
                                                                Product Family ({childrenCount + 1} SKUs)
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
                                                    {m.net_weight != null && m.outer_carton_weight != null && m.pallet_weight != null && (
                                                        <span className="block text-[9px] font-medium text-muted-foreground">
                                                            N {Number(m.net_weight).toFixed(2)} + C {Number(m.outer_carton_weight).toFixed(2)} + P {Number(m.pallet_weight).toFixed(2)}
                                                        </span>
                                                    )}
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
                                                {childrenCount > 0 ? "Edit Family" : "Edit"}
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

            {/* Enterprise Family-Aware Pagination Toolbar */}
            {sortedFiltered.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-4 p-3 border-t bg-muted/20 text-xs font-semibold text-muted-foreground">
                    {/* Left: Summary Info */}
                    <div className="flex items-center gap-2">
                        <span className="text-foreground font-medium">
                            Showing families <span className="font-bold text-foreground">{(page - 1) * pageSize + 1}</span>–<span className="font-bold text-foreground">{Math.min(page * pageSize, totalFamilies)}</span> of <span className="font-bold text-foreground">{totalFamilies}</span>
                        </span>
                        <span className="bg-muted px-2 py-0.5 rounded text-[10px] text-muted-foreground font-mono">
                            ({sortedFiltered.length} Total SKUs)
                        </span>
                    </div>

                    {/* Center: Page Size Selector */}
                    {setPageSize && (
                        <div className="flex items-center gap-2">
                            <span>Families per page:</span>
                            <select
                                value={pageSize}
                                onChange={e => {
                                    setPageSize(Number(e.target.value));
                                    setPage(1);
                                }}
                                className="bg-background border border-input text-foreground text-xs rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                            >
                                <option value={10}>10</option>
                                <option value={25}>25</option>
                                <option value={50}>50</option>
                                <option value={100}>100</option>
                            </select>
                        </div>
                    )}

                    {/* Right: Full Navigation Controls */}
                    <div className="flex items-center gap-1.5">
                        <button
                            type="button"
                            title="First Page"
                            disabled={page <= 1}
                            onClick={() => setPage(1)}
                            className="p-1.5 rounded-md border bg-background text-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-all"
                        >
                            <ChevronsLeft className="h-4 w-4" />
                        </button>

                        <button
                            type="button"
                            title="Previous Page"
                            disabled={page <= 1}
                            onClick={() => setPage(page - 1)}
                            className="p-1.5 rounded-md border bg-background text-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-all"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </button>

                        {/* Page Number Pills */}
                        <div className="flex items-center gap-1 px-1">
                            {Array.from({ length: totalPages }, (_, i) => i + 1)
                                .filter(pNum => pNum === 1 || pNum === totalPages || Math.abs(pNum - page) <= 1)
                                .map((pNum, idx, arr) => {
                                    const prev = arr[idx - 1];
                                    const showEllipsis = prev && pNum - prev > 1;
                                    return (
                                        <React.Fragment key={pNum}>
                                            {showEllipsis && <span className="px-1 text-muted-foreground select-none">…</span>}
                                            <button
                                                type="button"
                                                onClick={() => setPage(pNum)}
                                                className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                                                    pNum === page
                                                        ? "bg-primary text-primary-foreground shadow-sm"
                                                        : "bg-background text-foreground hover:bg-accent border border-input"
                                                }`}
                                            >
                                                {pNum}
                                            </button>
                                        </React.Fragment>
                                    );
                                })}
                        </div>

                        <button
                            type="button"
                            title="Next Page"
                            disabled={page >= totalPages}
                            onClick={() => setPage(page + 1)}
                            className="p-1.5 rounded-md border bg-background text-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-all"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </button>

                        <button
                            type="button"
                            title="Last Page"
                            disabled={page >= totalPages}
                            onClick={() => setPage(totalPages)}
                            className="p-1.5 rounded-md border bg-background text-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-all"
                        >
                            <ChevronsRight className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
