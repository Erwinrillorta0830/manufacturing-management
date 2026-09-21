"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import {
    Cpu,
    Calendar,
    ArrowRight,
    Calculator,
    AlertCircle,
    ChevronLeft,
    ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import { ProductionAssetMaster } from "../types";

function formatAcquisitionDate(dateStr?: string | null): string {
    if (!dateStr) return "—";
    const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
        const [, year, month, day] = match;
        return `${month} - ${day} - ${year}`;
    }
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${mm} - ${dd} - ${yyyy}`;
}

interface DepreciationScheduleViewProps {
    assets: ProductionAssetMaster[];
    onSelectAsset: (asset: ProductionAssetMaster) => void;
    isLoading: boolean;
}

export default function DepreciationScheduleView({
    assets,
    onSelectAsset,
    isLoading
}: DepreciationScheduleViewProps) {
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    const totalPages = Math.max(1, Math.ceil(assets.length / pageSize));
    const validCurrentPage = Math.min(currentPage, totalPages);
    const startIndex = (validCurrentPage - 1) * pageSize;
    const paginatedAssets = assets.slice(startIndex, startIndex + pageSize);
    if (isLoading) {
        return (
            <div className="rounded-xl border bg-card p-8 text-center space-y-3">
                <div className="h-6 w-48 bg-muted animate-pulse rounded mx-auto" />
                <div className="h-4 w-64 bg-muted/60 animate-pulse rounded mx-auto" />
            </div>
        );
    }

    if (assets.length === 0) {
        return (
            <div className="rounded-xl border bg-card p-12 text-center space-y-3">
                <AlertCircle className="h-10 w-10 text-muted-foreground mx-auto" />
                <h3 className="text-base font-semibold">No Production Assets Found</h3>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                    No active assets of type Production matched your filter criteria or exist in the registry.
                </p>
            </div>
        );
    }

    return (
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                    <thead className="bg-muted/50 text-muted-foreground border-b uppercase text-[10px] tracking-wider font-semibold">
                        <tr>
                            <th className="py-3 px-4">Machine / Asset</th>
                            <th className="py-3 px-4">Linked Work Center</th>
                            <th className="py-3 px-4">Acquisition Date</th>
                            <th className="py-3 px-4 text-right">Acquisition Cost</th>
                            <th className="py-3 px-4 text-right">Salvage Value</th>
                            <th className="py-3 px-4 text-right">Depreciable Base</th>
                            <th className="py-3 px-4 text-center">Depr. Method</th>
                            <th className="py-3 px-4 text-right">Life / Capacity</th>
                            <th className="py-3 px-4 text-right">Depreciation Rate</th>
                            <th className="py-3 px-4 text-center">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {paginatedAssets.map((asset, idx) => {
                            let annualDep = 0;
                            let monthlyDep = 0;
                            const isSL = asset.depreciation_method === "Straight Line";

                            if (isSL && asset.life_span && asset.life_span > 0) {
                                annualDep = asset.depreciable_amount / asset.life_span;
                                monthlyDep = annualDep / 12;
                            }

                            return (
                                <motion.tr
                                    key={asset.asset_id}
                                    initial={{ opacity: 0, y: -6 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.15, delay: Math.min(idx * 0.02, 0.4) }}
                                    className="hover:bg-muted/40 transition-colors"
                                >
                                    {/* Asset Details */}
                                    <td className="py-3 px-4">
                                        <div className="flex items-center gap-2.5">
                                            <div className="p-1.5 rounded-md bg-muted/60 text-muted-foreground shrink-0">
                                                <Cpu className="h-4 w-4" />
                                            </div>
                                            <div>
                                                <div className="font-semibold text-foreground" title={asset.item_name}>
                                                    {asset.item_name}
                                                </div>
                                                {asset.department_name && (
                                                    <div className="text-[10px] text-muted-foreground mt-0.5">
                                                        ({asset.department_name})
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </td>

                                    {/* Linked Work Center */}
                                    <td className="py-3 px-4">
                                        {asset.work_center_name ? (
                                            <Badge variant="outline" className="text-[10px] font-normal border-primary/20 bg-primary/5 text-primary">
                                                {asset.work_center_name}
                                            </Badge>
                                        ) : (
                                            <span className="text-[11px] text-muted-foreground italic">
                                                Unassigned
                                            </span>
                                        )}
                                    </td>

                                    {/* Acquisition Date */}
                                    <td className="py-3 px-4 text-muted-foreground font-mono whitespace-nowrap">
                                        <div className="flex items-center gap-1.5 whitespace-nowrap">
                                            <Calendar className="h-3 w-3 text-muted-foreground/70 shrink-0" />
                                            <span>{formatAcquisitionDate(asset.date_acquired)}</span>
                                        </div>
                                    </td>

                                    {/* Acquisition Cost */}
                                    <td className="py-3 px-4 text-right font-mono text-foreground font-medium">
                                        ₱{asset.acquisition_cost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>

                                    {/* Salvage Value */}
                                    <td className="py-3 px-4 text-right font-mono text-muted-foreground">
                                        ₱{asset.residual_value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>

                                    {/* Depreciable Base */}
                                    <td className="py-3 px-4 text-right font-mono text-foreground font-semibold">
                                        ₱{asset.depreciable_amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>

                                    {/* Method */}
                                    <td className="py-3 px-4 text-center">
                                        <Badge variant="secondary" className="text-[10px] font-normal">
                                            {asset.depreciation_method === "Straight Line" ? "Straight Line (SL)" : "Units of Prod. (UOP)"}
                                        </Badge>
                                    </td>

                                    {/* Life / Capacity */}
                                    <td className="py-3 px-4 text-right text-muted-foreground font-mono">
                                        {isSL ? (
                                            <span>{asset.life_span || 10} yrs</span>
                                        ) : (
                                            <span>
                                                {asset.maximum_unit_produced_capacity?.toLocaleString() || "—"}{" "}
                                                <span className="text-[10px] font-sans">{asset.production_unit_shortcut || "units"}</span>
                                            </span>
                                        )}
                                    </td>

                                    {/* Depreciation Rate */}
                                    <td className="py-3 px-4 text-right">
                                        {isSL ? (
                                            <div>
                                                <div className="font-semibold text-emerald-600 dark:text-emerald-400 font-mono">
                                                    ₱{annualDep.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    <span className="text-[10px] font-normal text-muted-foreground ml-1">/ yr</span>
                                                </div>
                                                <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                                                    ₱{monthlyDep.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    <span className="text-[9px] font-normal text-muted-foreground/80 ml-1">/ mo</span>
                                                </div>
                                            </div>
                                        ) : (
                                            <div>
                                                <div className="font-semibold text-emerald-600 dark:text-emerald-400 font-mono">
                                                    {asset.depreciation_per_unit != null
                                                        ? `₱${asset.depreciation_per_unit.toFixed(4)} / ${asset.production_unit_shortcut || "PCS"}`
                                                        : "—"}
                                                </div>
                                                <div className="text-[10px] text-muted-foreground mt-0.5">
                                                    Usage-based per unit
                                                </div>
                                            </div>
                                        )}
                                    </td>

                                    {/* Action */}
                                    <td className="py-3 px-4 text-center">
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => onSelectAsset(asset)}
                                            className="h-7 text-[11px] gap-1 px-2.5 hover:border-primary hover:text-primary"
                                        >
                                            <Calculator className="h-3 w-3" />
                                            <span>Review & Model</span>
                                            <ArrowRight className="h-3 w-3 opacity-60 ml-0.5" />
                                        </Button>
                                    </td>
                                </motion.tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Pagination Controls (No max height constraint) */}
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground px-4 py-3 border-t bg-card">
                <div className="flex items-center gap-1.5">
                    <span>Showing</span>
                    <span className="font-semibold font-mono text-foreground">
                        {assets.length === 0 ? 0 : startIndex + 1}–{Math.min(startIndex + pageSize, assets.length)}
                    </span>
                    <span>of</span>
                    <span className="font-semibold font-mono text-foreground">{assets.length}</span>
                    <span>assets</span>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                        <span>Rows per page:</span>
                        <Select
                            value={String(pageSize)}
                            onValueChange={(val) => {
                                setPageSize(Number(val));
                                setCurrentPage(1);
                            }}
                        >
                            <SelectTrigger className="h-7 w-16 text-xs bg-background">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="10">10</SelectItem>
                                <SelectItem value="15">15</SelectItem>
                                <SelectItem value="25">25</SelectItem>
                                <SelectItem value="50">50</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex items-center gap-1">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                            disabled={validCurrentPage <= 1}
                            className="h-7 w-7 p-0"
                        >
                            <ChevronLeft className="h-3.5 w-3.5" />
                        </Button>
                        <span className="px-2 font-mono text-xs">
                            {validCurrentPage} / {totalPages}
                        </span>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                            disabled={validCurrentPage >= totalPages}
                            className="h-7 w-7 p-0"
                        >
                            <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
