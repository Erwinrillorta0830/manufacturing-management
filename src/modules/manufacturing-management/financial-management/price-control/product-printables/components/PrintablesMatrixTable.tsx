// src/modules/financial-management/printables-management/product-printables/components/PrintablesMatrixTable.tsx
"use client";

import React from "react";
import type { MatrixRow, PriceType, Unit } from "../types";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { AlertCircle, RefreshCw } from "lucide-react";
import {
    getVisibleMatrixPriceTypes,
    getVisibleMatrixUnits,
    matrixPriceTypeColor,
    priceTypeTierKey,
} from "../utils/matrixDisplay";
import { formatPriceNumber } from "../../shared/pricePrecision";

type Props = {
    rows: MatrixRow[];
    loading: boolean;
    error?: string | null;
    onRetry?: () => void;
    priceTypes: PriceType[];
    units: Unit[];
    usedUnitIds: Set<number>;
    usedPriceTypeKeys?: Set<string>;
    selectedPriceTypeIds?: string[];
};

export default function PrintablesMatrixTable({ 
    rows, 
    loading, 
    error,
    onRetry,
    priceTypes, 
    units, 
    usedUnitIds,
    usedPriceTypeKeys,
    selectedPriceTypeIds = []
}: Props) {
    if (loading) {
        return (
            <div className="overflow-hidden rounded-xl border border-border/50">
                <div className="min-w-[900px]">
                    <div className="grid grid-cols-[100px_100px_180px_repeat(6,minmax(70px,1fr))] gap-px border-b border-border/50 bg-muted/50">
                        {Array.from({ length: 9 }).map((_, index) => (
                            <div key={`header-${index}`} className="bg-muted/30 p-3">
                                <Skeleton className="h-4 w-full animate-pulse" />
                            </div>
                        ))}
                    </div>
                    {Array.from({ length: 8 }).map((_, rowIndex) => (
                        <div
                            key={`row-${rowIndex}`}
                            className="grid grid-cols-[100px_100px_180px_repeat(6,minmax(70px,1fr))] gap-px border-b border-border/50 bg-border/20 last:border-b-0"
                        >
                            {Array.from({ length: 9 }).map((_, columnIndex) => (
                                <div key={`cell-${columnIndex}`} className="bg-background p-3">
                                    <Skeleton
                                        className={cn(
                                            "h-4 animate-pulse",
                                            columnIndex === 2 ? "w-4/5" : columnIndex < 3 ? "w-3/5" : "ml-auto w-2/3",
                                        )}
                                    />
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center">
                <AlertCircle className="h-6 w-6 text-destructive" />
                <div>
                    <p className="text-sm font-medium">Unable to load products</p>
                    <p className="mt-1 text-sm text-muted-foreground">{error}</p>
                </div>
                {onRetry ? (
                    <Button type="button" variant="outline" size="sm" onClick={onRetry}>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Retry
                    </Button>
                ) : null}
            </div>
        );
    }

    if (rows.length === 0) return <div className="p-8 text-center text-muted-foreground">No products found.</div>;

    const visibleUnits = getVisibleMatrixUnits(units, usedUnitIds);
    const activePriceTypes = getVisibleMatrixPriceTypes(priceTypes, selectedPriceTypeIds, usedPriceTypeKeys);
    const totalMatrixCols = activePriceTypes.length * (visibleUnits.length || 1);

    return (
        <div className="rounded-xl border border-border/50 overflow-hidden overflow-x-auto shadow-md">
            <Table className="border-collapse border-hidden">
                <TableHeader className="bg-muted/30">
                    {/* Level 1: Global Header */}
                    <TableRow className="border-b border-border/50">
                        <TableHead colSpan={3} className="border-r border-border/50 sticky left-0 top-0 z-40 bg-muted/30 h-8 backdrop-blur-md"></TableHead>
                        <TableHead 
                            colSpan={totalMatrixCols || 1} 
                            className="text-center font-bold text-xs uppercase tracking-[0.2em] text-muted-foreground py-1 border-r border-border/50 sticky top-0 z-30 bg-muted/30 backdrop-blur-md"
                        >
                            Price Type
                        </TableHead>
                    </TableRow>
                    
                    {/* Level 2: Price Tiers (Selected) */}
                    <TableRow className="border-b border-border/50">
                        <TableHead className="font-bold sticky left-0 top-8 z-40 bg-muted/30 backdrop-blur-md border-r border-border/50 min-w-[100px] text-xs uppercase text-foreground h-10 whitespace-nowrap">Brand</TableHead>
                        <TableHead className="font-bold sticky left-[100px] top-8 z-40 bg-muted/30 backdrop-blur-md border-r border-border/50 min-w-[100px] text-xs uppercase text-foreground h-10 whitespace-nowrap">Category</TableHead>
                        <TableHead className="font-bold sticky left-[200px] top-8 z-40 bg-muted/30 backdrop-blur-md border-r border-border/50 min-w-[180px] text-xs uppercase text-foreground h-10 whitespace-nowrap">Product Name</TableHead>
                        {activePriceTypes.map((pt) => {
                            const absoluteIndex = priceTypes.indexOf(pt);
                            return (
                                <TableHead 
                                    key={pt.price_type_id} 
                                    colSpan={visibleUnits.length || 1} 
                                    className={cn(
                                        "text-center font-black text-sm border-r border-border/50 py-1.5 sticky top-8 z-30 backdrop-blur-md",
                                        matrixPriceTypeColor(absoluteIndex).className
                                    )}
                                >
                                    {pt.price_type_name}
                                </TableHead>
                            );
                        })}
                    </TableRow>

                    {/* Level 3: Units (BOX, PCS, etc.) */}
                    <TableRow className="border-b border-border/50">
                        <TableHead className="sticky left-0 top-[72px] z-40 bg-muted/30 backdrop-blur-md border-r border-border/50 h-8"></TableHead>
                        <TableHead className="sticky left-[100px] top-[72px] z-40 bg-muted/30 backdrop-blur-md border-r border-border/50 h-8"></TableHead>
                        <TableHead className="sticky left-[200px] top-[72px] z-40 bg-muted/30 backdrop-blur-md border-r border-border/50 h-8"></TableHead>
                        {activePriceTypes.map((pt) => (
                            <React.Fragment key={pt.price_type_id}>
                                {visibleUnits.length > 0 ? visibleUnits.map((u) => (
                                    <TableHead 
                                        key={u.unit_id} 
                                        className="text-center font-bold text-[10px] uppercase text-muted-foreground py-1 border-r border-border/30 min-w-[70px] sticky top-[72px] z-30 bg-muted/30 backdrop-blur-md"
                                    >
                                        {u.unit_shortcut}
                                    </TableHead>
                                )) : (
                                    <TableHead className="min-w-[70px] border-r border-border/30">—</TableHead>
                                )}
                            </React.Fragment>
                        ))}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {rows.map((row) => (
                        <React.Fragment key={row.group_id}>
                            <TableRow className="hover:bg-muted/50 transition-colors border-b-2 border-border/80">
                                <TableCell className="sticky left-0 bg-background z-10 border-r border-border/50 py-2.5 text-xs font-medium text-foreground/80 whitespace-nowrap">
                                    {row.brand_name}
                                </TableCell>
                                <TableCell className="sticky left-[100px] bg-background z-10 border-r border-border/50 py-2.5 text-xs font-medium text-foreground/80 whitespace-nowrap">
                                    {row.category_name}
                                </TableCell>
                                <TableCell className="font-semibold sticky left-[200px] bg-background z-10 border-r border-border/50 py-2.5 text-sm text-foreground whitespace-nowrap">
                                    {row.display.product_name}
                                </TableCell>
                                {activePriceTypes.map((pt) => {
                                    const ptSuffix = priceTypeTierKey(pt);
                                    
                                    return (
                                        <React.Fragment key={pt.price_type_id}>
                                            {visibleUnits.length > 0 ? visibleUnits.map((u) => {
                                                const variant = row.variantsByUnitId[Number(u.unit_id)];
                                                const price = (variant?.tiers as Record<string, number | null>)?.[ptSuffix];

                                                return (
                                                    <TableCell 
                                                        key={u.unit_id} 
                                                        className={cn(
                                                            "text-right border-r border-border/50 px-3 py-2.5 font-mono text-xs",
                                                            price == null ? "bg-muted/20" : ""
                                                        )}
                                                    >
                                                        {price != null ? (
                                                            <span className="font-bold text-foreground">
                                                                {formatPriceNumber(price, "\u2014")}
                                                            </span>
                                                        ) : (
                                                            <span className="text-muted-foreground/30">—</span>
                                                        )}
                                                    </TableCell>
                                                );
                                            }) : (
                                                <TableCell className="border-r border-border/50 bg-muted/20">—</TableCell>
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                            </TableRow>

                        </React.Fragment>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}
