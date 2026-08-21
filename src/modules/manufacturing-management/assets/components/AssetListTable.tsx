"use client";

import React from "react";
import Image from "next/image";
import {
    Search,
    Edit,
    LayoutGrid,
    Image as ImageIcon,
    ChevronsLeft,
    ChevronsRight
} from "lucide-react";
import { AssetRecord, DepartmentRecord } from "@/modules/manufacturing-management/finished-goods/types";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import { formatCurrency } from "@/lib/utils";
import { CatalogItem } from "../AssetsModule";

interface AssetListTableProps {
    loading: boolean;
    filteredAssets: AssetRecord[];
    paginatedAssets: AssetRecord[];
    items: CatalogItem[];
    departments: DepartmentRecord[];
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    conditionFilter: string;
    setConditionFilter: (filter: string) => void;
    statusFilter: string;
    setStatusFilter: (filter: string) => void;
    handleOpenViewModal: (asset: AssetRecord) => void;
    handleOpenEditModal: (asset: AssetRecord) => void;
    setPreviewImage: (image: string | null) => void;
    currentPage: number;
    setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
    pageSize: number;
    setPageSize: (size: number) => void;
    totalPages: number;
    startIndex: number;
}

export function AssetListTable({
    loading,
    filteredAssets,
    paginatedAssets,
    items,
    departments,
    searchQuery,
    setSearchQuery,
    conditionFilter,
    setConditionFilter,
    statusFilter,
    setStatusFilter,
    handleOpenViewModal,
    handleOpenEditModal,
    setPreviewImage,
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    totalPages,
    startIndex
}: AssetListTableProps) {
    return (
        <div className="space-y-4">
            {/* Filter and search block */}
            <div className="flex flex-col md:flex-row items-center gap-3 bg-muted/10 p-3 rounded-lg border border-border/50">
                <div className="relative flex-1 w-full">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground opacity-70" />
                    <input
                        type="text"
                        placeholder="Search by asset name, barcode, RFID code, or condition..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full h-9 pl-10 pr-3 rounded-lg border border-muted bg-background text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                </div>
                <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                    {/* Condition Filter */}
                    <div className="flex items-center gap-1.5 min-w-[140px] flex-1 md:flex-initial">
                        <span className="text-xs text-muted-foreground whitespace-nowrap">Condition:</span>
                        <Select
                            value={conditionFilter}
                            onValueChange={(val) => setConditionFilter(val)}
                        >
                            <SelectTrigger className="w-full h-9 bg-background border border-border text-foreground text-xs">
                                <SelectValue placeholder="All Conditions" />
                            </SelectTrigger>
                            <SelectContent position="popper" sideOffset={4} className="bg-popover border border-border text-foreground">
                                <SelectItem value="ALL">All Conditions</SelectItem>
                                <SelectItem value="Good">Good</SelectItem>
                                <SelectItem value="Bad">Bad</SelectItem>
                                <SelectItem value="Under Maintenance">Under Maintenance</SelectItem>
                                <SelectItem value="Discontinued">Discontinued</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Status Filter */}
                    <div className="flex items-center gap-1.5 min-w-[120px] flex-1 md:flex-initial">
                        <span className="text-xs text-muted-foreground whitespace-nowrap">Status:</span>
                        <Select
                            value={statusFilter}
                            onValueChange={(val) => setStatusFilter(val)}
                        >
                            <SelectTrigger className="w-full h-9 bg-background border border-border text-foreground text-xs">
                                <SelectValue placeholder="All Statuses" />
                            </SelectTrigger>
                            <SelectContent position="popper" sideOffset={4} className="bg-popover border border-border text-foreground">
                                <SelectItem value="ALL">All Statuses</SelectItem>
                                <SelectItem value="ACTIVE">Active</SelectItem>
                                <SelectItem value="INACTIVE">Inactive</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </div>

            {/* Assets Table view */}
            <div className="overflow-x-auto rounded-xl border border-muted/50 bg-card text-card-foreground shadow-sm">
                {loading ? (
                    <div className="flex flex-col items-center justify-center p-20 gap-3 text-muted-foreground">
                        <div className="h-6 w-6 animate-spin border-2 border-primary border-t-transparent rounded-full" />
                        <span className="text-xs font-medium">Loading Assets &amp; Equipment list...</span>
                    </div>
                ) : filteredAssets.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-20 text-center text-muted-foreground">
                        <LayoutGrid className="h-12 w-12 text-muted/30 mb-2" />
                        <span className="text-sm font-semibold">No Assets registered</span>
                        <p className="text-xs max-w-xs mt-1">Register assets to link mixing vats, packing equipment, or other industrial machinery.</p>
                    </div>
                ) : (
                    <table className="w-full border-collapse text-left text-xs">
                        <thead>
                            <tr className="bg-muted/10 border-b border-muted/50 text-muted-foreground font-bold uppercase tracking-wider text-[10px]">
                                <th className="p-4 pl-6 w-[8%]">Image</th>
                                <th className="p-4">Item Name</th>
                                <th className="p-4">Total Cost</th>
                                <th className="p-4">Barcode / RFID Code</th>
                                <th className="p-4">Department</th>
                                <th className="p-4">Condition</th>
                                <th className="p-4">Status</th>
                                <th className="p-4 text-center w-[12%]">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedAssets.map(asset => {
                                let itemName = "Unknown Item";
                                if (asset.item_id && typeof asset.item_id === "object") {
                                    itemName = (asset.item_id as unknown as CatalogItem).item_name || "Unknown Item";
                                } else {
                                    const found = items.find(i => i.id === asset.item_id);
                                    itemName = found ? found.item_name : "Unknown Item";
                                }

                                let deptName = "";
                                if (asset.department && typeof asset.department === "object") {
                                    deptName = (asset.department as unknown as DepartmentRecord).department_name || "";
                                } else {
                                    const found = departments.find(d => d.department_id === asset.department);
                                    deptName = found ? found.department_name : "";
                                }

                                return (
                                    <tr
                                        key={asset.id}
                                        onClick={() => handleOpenViewModal(asset)}
                                        className="border-b border-muted/40 hover:bg-muted/25 dark:hover:bg-muted/15 active:bg-muted/30 transition-colors cursor-pointer"
                                    >
                                        <td className="p-4 pl-6 align-middle">
                                            {asset.item_image ? (
                                                <div 
                                                    className="w-10 h-10 rounded-md border border-border overflow-hidden shrink-0 relative cursor-zoom-in hover:scale-105 transition-transform"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setPreviewImage(asset.item_image || null);
                                                    }}
                                                >
                                                    <Image
                                                        src={asset.item_image}
                                                        alt={itemName}
                                                        fill
                                                        unoptimized
                                                        className="object-cover"
                                                    />
                                                </div>
                                            ) : (
                                                <div className="w-10 h-10 bg-muted/20 border border-dashed rounded-md flex items-center justify-center text-muted-foreground/40">
                                                    <ImageIcon className="h-4 w-4" />
                                                </div>
                                            )}
                                        </td>
                                        <td className="p-4 align-middle font-semibold text-foreground text-sm">
                                            {itemName}
                                        </td>
                                        <td className="p-4 align-middle text-foreground font-bold">
                                            {formatCurrency(asset.total || asset.cost_per_item || 0)}
                                        </td>
                                        <td className="p-4 align-middle text-muted-foreground">
                                            <div className="flex flex-col gap-0.5 text-[11px]">
                                                {asset.barcode && <div><span className="font-semibold text-foreground">Barcode:</span> {asset.barcode}</div>}
                                                {asset.rfid_code && <div><span className="font-semibold text-foreground">RFID:</span> {asset.rfid_code}</div>}
                                                {!asset.barcode && !asset.rfid_code && <span className="italic opacity-50">No codes linked</span>}
                                            </div>
                                        </td>
                                        <td className="p-4 align-middle">
                                            {deptName ? (
                                                <span className="bg-primary/5 text-primary border border-primary/10 px-2 py-0.5 rounded font-medium">
                                                    {deptName}
                                                </span>
                                            ) : (
                                                <span className="text-muted-foreground/50 italic">None</span>
                                            )}
                                        </td>
                                        <td className="p-4 align-middle">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${asset.condition === "Good" ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" :
                                                asset.condition === "Bad" ? "bg-destructive/10 text-destructive border border-destructive/20" :
                                                    asset.condition === "Under Maintenance" ? "bg-amber-500/10 text-amber-500 border border-amber-500/20" :
                                                        "bg-muted text-muted-foreground border"
                                                }`}>
                                                {asset.condition || "Good"}
                                            </span>
                                        </td>
                                        <td className="p-4 align-middle">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase ${Boolean(asset.is_active)
                                                ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                                                : "bg-destructive/10 text-destructive border border-destructive/20"
                                                }`}>
                                                {Boolean(asset.is_active) ? "Active" : "Inactive"}
                                            </span>
                                        </td>
                                        <td className="p-4 align-middle text-center" onClick={e => e.stopPropagation()}>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => handleOpenEditModal(asset)}
                                                className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-md"
                                                title="Edit Details"
                                            >
                                                <Edit className="h-4 w-4" />
                                            </Button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Pagination Controls */}
            {!loading && filteredAssets.length > 0 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 py-2 text-sm text-muted-foreground px-1 mt-2">
                    <div className="flex items-center gap-2">
                        <span>Rows per page</span>
                        <Select
                            value={String(pageSize)}
                            onValueChange={(val) => setPageSize(Number(val))}
                        >
                            <SelectTrigger className="w-[70px] h-8 bg-background border border-border text-foreground">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent position="popper" sideOffset={4} className="bg-popover border border-border text-foreground">
                                {[10, 20, 30, 40, 50].map((size) => (
                                    <SelectItem key={size} value={String(size)}>
                                        {size}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <span className="ml-2 font-medium">
                            Showing {filteredAssets.length > 0 ? startIndex + 1 : 0}-
                            {Math.min(startIndex + pageSize, filteredAssets.length)} of{" "}
                            {filteredAssets.length} items
                        </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(1)}
                            disabled={currentPage === 1}
                            className="h-8 w-8 p-0 text-foreground"
                        >
                            <ChevronsLeft className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                            disabled={currentPage === 1}
                            className="h-8 px-3 text-foreground"
                        >
                            Previous
                        </Button>

                        <div className="flex items-center gap-1 px-2 font-semibold text-xs">
                            <span>Page</span>
                            <span className="text-foreground">{currentPage}</span>
                            <span>of</span>
                            <span>{totalPages || 1}</span>
                        </div>

                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                            disabled={currentPage === totalPages || totalPages === 0}
                            className="h-8 px-3 text-foreground"
                        >
                            Next
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(totalPages)}
                            disabled={currentPage === totalPages || totalPages === 0}
                            className="h-8 w-8 p-0 text-foreground"
                        >
                            <ChevronsRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
