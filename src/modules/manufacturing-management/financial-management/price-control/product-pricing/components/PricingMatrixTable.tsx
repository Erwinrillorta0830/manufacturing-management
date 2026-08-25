"use client";

import React, { useCallback, useEffect, useRef } from "react";
import type { 
    MatrixRow, 
    PendingCellRequest, 
    PriceType, 
    PricingFilters, 
    ProductTierKey, 
    Unit 
} from "../types";
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { AlertCircle, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, RefreshCw } from "lucide-react";
import { isListTierKey, resolveVisibleTierKeys, tierLabelForTierKey } from "../utils/pivot";
import PriceCell from "./PriceCell";
import { getVisibleMatrixPriceTypes, getVisibleMatrixUnits, matrixPriceTypeColor, priceTypeTierKey } from "../../product-printables/utils/matrixDisplay";

function toNum(v: unknown, fallback: number) {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : fallback;
}

function toNullableNumber(v: unknown): number | null {
    if (v === null || v === undefined) return null;
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    if (typeof v === "string") {
        const s = v.trim();
        if (!s) return null;
        const n = Number(s);
        return Number.isFinite(n) ? n : null;
    }
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

function toErrorString(err: unknown): string | null {
    if (err === null || err === undefined) return null;
    if (typeof err === "string") return err.trim() ? err : null;
    if (err instanceof Error) return err.message || "Error";
    try {
        const s = String(err);
        return s && s !== "[object Object]" ? s : "Invalid value";
    } catch {
        return "Invalid value";
    }
}

type MatrixMeta = {
    page?: number | string | null;
    pageSize?: number | string | null;
    total?: number | string | null;
    totalVariants?: number | string | null;
    totalPages?: number | string | null;
};

export type PricingMatrixLike = {
    TIERS: ProductTierKey[];
    usedUnits?: Unit[];
    rows?: MatrixRow[];
    meta?: MatrixMeta;
    dirtyVersion?: number;

    loading?: boolean;
    error?: string | null;

    page?: number;
    pageSize?: number;

    setPage: (page: number) => void;
    setPageSize: (pageSize: number) => void;

    getCellValue: (productId: number, tier: ProductTierKey, base: number | null) => number | string | null;
    getPendingRequest: (productId: number, tier: ProductTierKey) => PendingCellRequest | null;
    isDirty: (productId: number, tier: ProductTierKey) => boolean;
    getError: (productId: number, tier: ProductTierKey) => string | null | undefined;
    setCell: (productId: number, tier: ProductTierKey, raw: unknown) => void;

    getVersionCellValue: (versionId: number, priceTypeId: number, base: number | null) => number | string | null;
    getVersionPendingRequest: (versionId: number, priceTypeId: number) => PendingCellRequest | null;
    isVersionDirty: (versionId: number, priceTypeId: number) => boolean;
    getVersionError: (versionId: number, priceTypeId: number) => string | null | undefined;
    setVersionCell: (versionId: number, priceTypeId: number, versionName: string, base: number | null, raw: unknown) => void;

    priceTypes: PriceType[];
    filters: PricingFilters;
    refresh: () => void;
};

type Props = {
    matrix: PricingMatrixLike;
    dirtyVersion?: number;
    showVersions?: boolean;
    usedUnitIds: Set<number>;
};

type SetCellHandler = (productId: number, tier: ProductTierKey) => (raw: string) => void;
type SetVersionCellHandler = (versionId: number, priceTypeId: number, versionName: string, base: number | null) => (raw: string) => void;

export default function PricingMatrixTable({ 
    matrix, 
    dirtyVersion = 0, 
    showVersions = false,
    usedUnitIds
}: Props) {
    const loading = Boolean(matrix.loading);
    const error = matrix.error;
    const rows = Array.isArray(matrix.rows) ? matrix.rows : [];
    
    const usedUnits = Array.isArray(matrix.usedUnits) ? matrix.usedUnits : [];
    const visibleUnits = getVisibleMatrixUnits(usedUnits, usedUnitIds);

    const activeTierKeys = React.useMemo(
        (): ProductTierKey[] =>
            resolveVisibleTierKeys({
                priceView: matrix.filters.price_view,
                priceTypeIds: matrix.filters.price_type_ids,
                priceTypes: matrix.priceTypes,
                showListPrice: matrix.filters.show_list_price,
                allTierKeys: matrix.TIERS,
            }),
        [
            matrix.TIERS,
            matrix.filters.price_view,
            matrix.filters.price_type_ids,
            matrix.filters.show_list_price,
            matrix.priceTypes,
        ],
    );

    const activePriceTypes = matrix.priceTypes.filter(pt => activeTierKeys.includes(String(pt.price_type_id)));
    
    // Add LIST cost if enabled
    const showListCost = activeTierKeys.includes("LIST");

    const totalMatrixCols = (activePriceTypes.length + (showListCost ? 1 : 0)) * (visibleUnits.length || 1);

    const meta: MatrixMeta = matrix.meta ?? {};
    const page = toNum(meta.page ?? matrix.page ?? 1, 1);
    const pageSize = toNum(meta.pageSize ?? matrix.pageSize ?? 50, 50);
    const totalGroups = toNum(meta.total ?? 0, 0);
    const totalPages = toNum(meta.totalPages ?? 0, 0) || (totalGroups > 0 ? Math.ceil(totalGroups / pageSize) : 1);

    const startIndex = totalGroups === 0 ? 0 : (page - 1) * pageSize;
    const endIndex = totalGroups === 0 ? 0 : Math.min(totalGroups, startIndex + rows.length);

    const canPrev = !loading && page > 1 && totalGroups > 0;
    const canNext = !loading && page < totalPages && totalGroups > 0;

    const setCellHandlersRef = useRef(new Map<string, (raw: string) => void>());
    const setVersionCellHandlersRef = useRef(new Map<string, (raw: string) => void>());

    useEffect(() => {
        setCellHandlersRef.current.clear();
        setVersionCellHandlersRef.current.clear();
    }, [matrix.setCell, matrix.setVersionCell, page, pageSize]);

    const getSetCellHandler = useCallback<SetCellHandler>(
        (productId, tier) => {
            const key = `${productId}:${tier}`;
            let handler = setCellHandlersRef.current.get(key);
            if (!handler) {
                handler = (raw: string) => matrix.setCell(productId, tier, raw);
                setCellHandlersRef.current.set(key, handler);
            }
            return handler;
        },
        [matrix],
    );

    const getSetVersionCellHandler = useCallback<SetVersionCellHandler>(
        (versionId, priceTypeId, versionName, base) => {
            const key = `${versionId}:${priceTypeId}`;
            let handler = setVersionCellHandlersRef.current.get(key);
            if (!handler) {
                handler = (raw: string) => matrix.setVersionCell(versionId, priceTypeId, versionName, base, raw);
                setVersionCellHandlersRef.current.set(key, handler);
            }
            return handler;
        },
        [matrix],
    );

    if (loading && rows.length === 0) {
        return (
            <div className="overflow-hidden rounded-xl border border-border/50">
                <div className="min-w-[900px]">
                    <div className="grid grid-cols-[300px_repeat(6,minmax(70px,1fr))] gap-px border-b border-border/50 bg-muted/50">
                        {Array.from({ length: 7 }).map((_, index) => (
                            <div key={`header-${index}`} className="bg-muted/30 p-3">
                                <Skeleton className="h-4 w-full animate-pulse" />
                            </div>
                        ))}
                    </div>
                    {Array.from({ length: 8 }).map((_, rowIndex) => (
                        <div
                            key={`row-${rowIndex}`}
                            className="grid grid-cols-[300px_repeat(6,minmax(70px,1fr))] gap-px border-b border-border/50 bg-border/20 last:border-b-0"
                        >
                            {Array.from({ length: 7 }).map((_, columnIndex) => (
                                <div key={`cell-${columnIndex}`} className="bg-background p-3">
                                    <Skeleton
                                        className={cn(
                                            "h-4 animate-pulse",
                                            columnIndex === 0 ? "w-4/5" : "ml-auto w-2/3",
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
                <Button type="button" variant="outline" size="sm" onClick={matrix.refresh}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Retry
                </Button>
            </div>
        );
    }

    if (rows.length === 0) return <div className="p-8 text-center text-muted-foreground">No products found.</div>;

    return (
        <div className="flex flex-col gap-4" data-dirty-version={dirtyVersion}>
            <div className="rounded-xl border border-border/50 overflow-hidden overflow-x-auto shadow-md">
                <Table className="border-collapse border-hidden">
                    <TableHeader className="bg-muted/30">
                        {/* Level 1: Global Header */}
                        <TableRow className="border-b border-border/50">
                            <TableHead className="border-r border-border/50 sticky left-0 top-0 z-40 bg-muted/30 h-8 backdrop-blur-md"></TableHead>
                            <TableHead 
                                colSpan={totalMatrixCols || 1} 
                                className="text-center font-bold text-xs uppercase tracking-[0.2em] text-muted-foreground py-1 border-r border-border/50 sticky top-0 z-30 bg-muted/30 backdrop-blur-md"
                            >
                                Price Type
                            </TableHead>
                        </TableRow>
                        
                        {/* Level 2: Price Tiers (Selected) */}
                        <TableRow className="border-b border-border/50">
                            <TableHead className="font-bold sticky left-0 top-8 z-40 bg-muted/30 backdrop-blur-md border-r border-border/50 min-w-[250px] text-xs uppercase text-foreground h-10 whitespace-nowrap">
                                Product Name
                            </TableHead>
                            
                            {showListCost && (
                                <TableHead 
                                    colSpan={visibleUnits.length || 1} 
                                    className="text-center font-black text-sm border-r border-border/50 py-1.5 sticky top-8 z-30 backdrop-blur-md bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-200"
                                >
                                    List Cost
                                </TableHead>
                            )}
                            
                            {activePriceTypes.map((pt) => {
                                const absoluteIndex = matrix.priceTypes.indexOf(pt);
                                return (
                                    <TableHead 
                                        key={`pt-hdr-${pt.price_type_id}`} 
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
                            
                            {showListCost && (
                                <React.Fragment key="list-cost-units">
                                    {visibleUnits.length > 0 ? visibleUnits.map((u) => (
                                        <TableHead 
                                            key={`list-u-${u.unit_id}`} 
                                            className="text-center font-bold text-[10px] uppercase text-muted-foreground py-1 border-r border-border/30 min-w-[120px] sticky top-[72px] z-30 bg-muted/30 backdrop-blur-md"
                                        >
                                            {u.unit_shortcut}
                                        </TableHead>
                                    )) : (
                                        <TableHead className="min-w-[120px] border-r border-border/30">—</TableHead>
                                    )}
                                </React.Fragment>
                            )}

                            {activePriceTypes.map((pt) => (
                                <React.Fragment key={`pt-u-${pt.price_type_id}`}>
                                    {visibleUnits.length > 0 ? visibleUnits.map((u) => (
                                        <TableHead 
                                            key={`u-${pt.price_type_id}-${u.unit_id}`} 
                                            className="text-center font-bold text-[10px] uppercase text-muted-foreground py-1 border-r border-border/30 min-w-[120px] sticky top-[72px] z-30 bg-muted/30 backdrop-blur-md"
                                        >
                                            {u.unit_shortcut}
                                        </TableHead>
                                    )) : (
                                        <TableHead className="min-w-[120px] border-r border-border/30">—</TableHead>
                                    )}
                                </React.Fragment>
                            ))}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rows.map((row) => (
                            <React.Fragment key={row.group_id}>
                                <TableRow className="hover:bg-muted/50 transition-colors border-b-2 border-border/80">
                                    <TableCell className="sticky left-0 bg-background z-10 border-r border-border/50 py-2.5">
                                        <div className="font-semibold text-sm text-foreground whitespace-nowrap">
                                            {row.display?.product_name}
                                        </div>
                                        <div className="flex items-center gap-1 mt-1">
                                            {row.display?.product_code && (
                                                <span className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                                                    {row.display.product_code}
                                                </span>
                                            )}
                                            {row.display?.barcode && (
                                                <span className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                                                    {row.display.barcode}
                                                </span>
                                            )}
                                        </div>
                                    </TableCell>
                                    
                                    {showListCost && (
                                        <React.Fragment key="list-cost-cells">
                                            {visibleUnits.length > 0 ? visibleUnits.map((u) => {
                                                const variant = row.variantsByUnitId?.[Number(u.unit_id)];
                                                if (!variant) return <TableCell key={`cell-list-empty-${u.unit_id}`} className="border-r border-border/50 bg-muted/20" />;

                                                const variantProductId = Number(variant.product.product_id);
                                                if (!Number.isFinite(variantProductId) || variantProductId <= 0) {
                                                    return <TableCell key={`cell-list-invalid-${u.unit_id}`} className="border-r border-border/50 bg-muted/20" />;
                                                }

                                                const base = toNullableNumber(variant.tiers?.["LIST"]);
                                                
                                                return (
                                                    <TableCell key={`cell-list-${u.unit_id}`} className="border-r border-border/50 px-2 py-2">
                                                        <PriceCell
                                                            value={matrix.getCellValue(variantProductId, "LIST", base)}
                                                            pendingRequest={matrix.getPendingRequest(variantProductId, "LIST")}
                                                            dirty={matrix.isDirty(variantProductId, "LIST")}
                                                            error={toErrorString(matrix.getError(variantProductId, "LIST"))}
                                                            onChange={getSetCellHandler(variantProductId, "LIST")}
                                                        />
                                                    </TableCell>
                                                );
                                            }) : (
                                                <TableCell className="border-r border-border/50 bg-muted/20" />
                                            )}
                                        </React.Fragment>
                                    )}

                                    {activePriceTypes.map((pt) => {
                                        const ptSuffix = priceTypeTierKey(pt);
                                        
                                        return (
                                            <React.Fragment key={`cells-${pt.price_type_id}`}>
                                                {visibleUnits.length > 0 ? visibleUnits.map((u) => {
                                                    const variant = row.variantsByUnitId?.[Number(u.unit_id)];
                                                    if (!variant) return <TableCell key={`cell-${pt.price_type_id}-empty-${u.unit_id}`} className="border-r border-border/50 bg-muted/20" />;

                                                    const variantProductId = Number(variant.product.product_id);
                                                    if (!Number.isFinite(variantProductId) || variantProductId <= 0) {
                                                        return <TableCell key={`cell-${pt.price_type_id}-invalid-${u.unit_id}`} className="border-r border-border/50 bg-muted/20" />;
                                                    }

                                                    const base = toNullableNumber(variant.tiers?.[ptSuffix]);

                                                    return (
                                                        <TableCell key={`cell-${pt.price_type_id}-${u.unit_id}`} className="border-r border-border/50 px-2 py-2">
                                                            <PriceCell
                                                                value={matrix.getCellValue(variantProductId, ptSuffix, base)}
                                                                pendingRequest={matrix.getPendingRequest(variantProductId, ptSuffix)}
                                                                dirty={matrix.isDirty(variantProductId, ptSuffix)}
                                                                error={toErrorString(matrix.getError(variantProductId, ptSuffix))}
                                                                onChange={getSetCellHandler(variantProductId, ptSuffix)}
                                                            />
                                                        </TableCell>
                                                    );
                                                }) : (
                                                    <TableCell className="border-r border-border/50 bg-muted/20" />
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                                </TableRow>
                                
                                {/* Render Versions (Nested Rows) */}
                                {showVersions && (row.display?.versions || []).map((v) => {
                                    const version = v;
                                    return (
                                        <TableRow key={`v-${version.version_id}`} className="hover:bg-muted/40 transition-colors border-b border-border/80 bg-muted/30">
                                            <TableCell className="sticky left-0 bg-background/95 backdrop-blur-sm z-10 border-r border-border/50 py-2.5 text-xs text-foreground/90 whitespace-nowrap">
                                                <div className="flex items-center pl-3 relative">
                                                    <div className="absolute left-1.5 top-0 bottom-1/2 w-3 border-l-2 border-b-2 border-border/70 rounded-bl-sm" />
                                                    <span className="ml-3 font-medium">{version.version_name} {version.is_primary ? "(Primary)" : ""}</span>
                                                </div>
                                            </TableCell>

                                            {showListCost && (
                                                <React.Fragment key="list-cost-v-cells">
                                                    {visibleUnits.length > 0 ? visibleUnits.map((u) => {
                                                        const isMatchingUnit = Number(u.unit_id) === Number(version.uom_id);
                                                        return (
                                                            <TableCell key={`v-cell-list-${u.unit_id}`} className="border-r border-border/50 px-2 py-2">
                                                                {isMatchingUnit ? (
                                                                    <span className="text-muted-foreground text-xs text-center block w-full">—</span>
                                                                ) : null}
                                                            </TableCell>
                                                        );
                                                    }) : (
                                                        <TableCell className="border-r border-border/50 bg-muted/20" />
                                                    )}
                                                </React.Fragment>
                                            )}

                                            {activePriceTypes.map((pt) => {
                                                const ptSuffix = priceTypeTierKey(pt);
                                                return (
                                                    <React.Fragment key={`v-cells-${pt.price_type_id}`}>
                                                        {visibleUnits.length > 0 ? visibleUnits.map((u) => {
                                                            const isMatchingUnit = Number(u.unit_id) === Number(version.uom_id);
                                                            
                                                            if (!isMatchingUnit) {
                                                                return <TableCell key={`v-cell-${pt.price_type_id}-${u.unit_id}`} className="border-r border-border/50 px-2 py-2" />;
                                                            }

                                                            const base = toNullableNumber(version.prices?.[pt.price_type_id]?.price_per_unit);

                                                            return (
                                                                <TableCell key={`v-cell-${pt.price_type_id}-${u.unit_id}`} className="border-r border-border/50 px-2 py-2">
                                                                    <PriceCell
                                                                        value={matrix.getVersionCellValue(version.version_id, pt.price_type_id, base)}
                                                                        pendingRequest={matrix.getVersionPendingRequest(version.version_id, pt.price_type_id)}
                                                                        dirty={matrix.isVersionDirty(version.version_id, pt.price_type_id)}
                                                                        error={toErrorString(matrix.getVersionError(version.version_id, pt.price_type_id))}
                                                                        onChange={getSetVersionCellHandler(version.version_id, pt.price_type_id, version.version_name, base)}
                                                                    />
                                                                </TableCell>
                                                            );
                                                        }) : (
                                                            <TableCell className="border-r border-border/50 bg-muted/20" />
                                                        )}
                                                    </React.Fragment>
                                                );
                                            })}
                                        </TableRow>
                                    );
                                })}
                            </React.Fragment>
                        ))}
                    </TableBody>
                </Table>
            </div>

            <div className="flex items-center justify-between px-2 text-xs">
                <div className="text-muted-foreground">
                    {totalGroups > 0 ? (
                        <>
                            Showing {startIndex + 1} to {endIndex} of {totalGroups} product
                            {totalGroups === 1 ? "" : "s"}
                        </>
                    ) : (
                        "No items"
                    )}
                </div>
                <div className="flex items-center space-x-6">
                    <div className="flex items-center space-x-2">
                        <p className="font-medium text-foreground">Rows per page</p>
                        <Select
                            value={String(pageSize)}
                            onValueChange={(val) => matrix.setPageSize(Number(val))}
                        >
                            <SelectTrigger className="h-8 w-[70px] bg-background">
                                <SelectValue placeholder={String(pageSize)} />
                            </SelectTrigger>
                            <SelectContent side="top">
                                {[10, 20, 50, 100, 200].map((size) => (
                                    <SelectItem key={size} value={String(size)}>
                                        {size}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex w-[100px] items-center justify-center font-medium text-foreground">
                        Page {page} of {totalPages}
                    </div>
                    <div className="flex items-center space-x-2">
                        <Button
                            variant="outline"
                            className="hidden h-8 w-8 p-0 lg:flex"
                            onClick={() => matrix.setPage(1)}
                            disabled={!canPrev}
                        >
                            <span className="sr-only">Go to first page</span>
                            <ChevronsLeft className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="outline"
                            className="h-8 w-8 p-0"
                            onClick={() => matrix.setPage(page - 1)}
                            disabled={!canPrev}
                        >
                            <span className="sr-only">Go to previous page</span>
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="outline"
                            className="h-8 w-8 p-0"
                            onClick={() => matrix.setPage(page + 1)}
                            disabled={!canNext}
                        >
                            <span className="sr-only">Go to next page</span>
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="outline"
                            className="hidden h-8 w-8 p-0 lg:flex"
                            onClick={() => matrix.setPage(totalPages)}
                            disabled={!canNext}
                        >
                            <span className="sr-only">Go to last page</span>
                            <ChevronsRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
