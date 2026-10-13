import React, { useEffect, useMemo, useState } from "react";
import { Layers, Info, AlertTriangle, RefreshCw, Filter, ArrowDownUp } from "lucide-react";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";
import { Branch, NetRequirementItem } from "../types";
import { PlanningPaginationControls, type PlanningPaginationState } from "./PlanningPaginationControls";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type SubAssemblyLookupStatus = "loading" | "ready" | "error";

interface NetRequirementsTableProps {
    loadingRequirements: boolean;
    subAssemblyLookupStatus: SubAssemblyLookupStatus;
    subAssemblyLookupError: string | null;
    onRetrySubAssemblyLookup: () => void;
    netRequirements: NetRequirementItem[];
    selectedBranchId: number | null;
    branches: Branch[];
    pagination: PlanningPaginationState;
}

export function NetRequirementsTable({
    loadingRequirements,
    subAssemblyLookupStatus,
    subAssemblyLookupError,
    onRetrySubAssemblyLookup,
    netRequirements,
    selectedBranchId,
    branches,
    pagination
}: NetRequirementsTableProps) {
    const [showShortfallsOnly, setShowShortfallsOnly] = useState(false);
    const [shortfallsFirst, setShortfallsFirst] = useState(false);
    const selectedBranch = branches.find(b => b.id === selectedBranchId);
    const requestedPage = pagination.page;
    const pageSize = pagination.pageSize;
    const onPageChange = pagination.onPageChange;
    const shortfallCount = useMemo(
        () => netRequirements.filter(item => item.net_shortfall > 0).length,
        [netRequirements]
    );
    const displayedRequirements = useMemo(() => {
        const filtered = showShortfallsOnly
            ? netRequirements.filter(item => item.net_shortfall > 0)
            : netRequirements;

        if (!shortfallsFirst) return filtered;

        return filtered
            .map((item, index) => ({ item, index }))
            .sort((left, right) => {
                const shortfallOrder = Number(right.item.net_shortfall > 0) - Number(left.item.net_shortfall > 0);
                return shortfallOrder || left.index - right.index;
            })
            .map(({ item }) => item);
    }, [netRequirements, showShortfallsOnly, shortfallsFirst]);
    const totalPages = Math.max(1, Math.ceil(displayedRequirements.length / pageSize));
    const page = Math.min(requestedPage, totalPages);
    const visibleRequirements = displayedRequirements.slice((page - 1) * pageSize, page * pageSize);

    useEffect(() => {
        if (requestedPage !== page) onPageChange(page);
    }, [requestedPage, onPageChange, page]);

    return (
        <Card className="shadow-sm">
            <CardHeader className="pb-3 border-b bg-muted/10">
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="text-xl font-bold tracking-tight flex items-center gap-2">
                            <Layers className="h-5 w-5 text-primary" />
                            Net Requirements Calculator
                        </CardTitle>
                        <CardDescription className="text-sm text-muted-foreground">
                            Active inventory checks and safety stock rollups in selected branch.
                        </CardDescription>
                    </div>
                    <Badge variant="secondary" className="font-mono text-[10px]">
                        {selectedBranchId && selectedBranch
                            ? selectedBranch.branch_name
                            : "No Branch Selected"}
                    </Badge>
                </div>
            </CardHeader>
            <CardContent className="p-0">
                {loadingRequirements || subAssemblyLookupStatus === "loading" ? (
                    <div role="status" aria-busy="true" aria-label={subAssemblyLookupStatus === "loading" ? "Loading sub-assembly BOMs" : "Calculating net requirements"} className="overflow-x-auto">
                        <Table>
                            <TableHeader className="bg-muted/5">
                                <TableRow>
                                    <TableHead><Skeleton className="h-4 w-32" /></TableHead>
                                    {Array.from({ length: 4 }, (_, index) => (
                                        <TableHead key={index} className="text-right"><Skeleton className="ml-auto h-4 w-20" /></TableHead>
                                    ))}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {Array.from({ length: 5 }, (_, index) => (
                                    <TableRow key={index}>
                                        <TableCell className="py-3"><Skeleton className="mb-2 h-4 w-3/4" /><Skeleton className="h-3 w-1/3" /></TableCell>
                                        {Array.from({ length: 4 }, (_, column) => (
                                            <TableCell key={column} className="text-right"><Skeleton className="ml-auto h-4 w-20" /></TableCell>
                                        ))}
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                ) : subAssemblyLookupStatus === "error" ? (
                    <div role="alert" className="flex flex-col items-center justify-center gap-3 px-4 py-16 text-center text-muted-foreground">
                        <AlertTriangle className="h-8 w-8 text-amber-500" />
                        <span className="text-sm font-semibold text-foreground">Net requirements are unavailable.</span>
                        <span className="max-w-lg text-xs">
                            {subAssemblyLookupError || "Sub-assembly BOM data could not be loaded, so the calculation has been withheld."}
                        </span>
                        <Button type="button" variant="outline" size="sm" onClick={onRetrySubAssemblyLookup} className="gap-2">
                            <RefreshCw className="h-3.5 w-3.5" />
                            Retry BOM lookup
                        </Button>
                    </div>
                ) : selectedBranchId === null ? (
                    <div className="flex flex-col items-center justify-center py-16 px-4 text-center text-muted-foreground">
                        <Info className="h-8 w-8 text-muted-foreground/60 mb-2" />
                        <span className="text-sm font-semibold">Select a target branch first.</span>
                        <span className="text-xs max-w-sm mt-1">
                            Branch-scoped on-hand and safety-stock calculations will load after an explicit branch selection.
                        </span>
                    </div>
                ) : netRequirements.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 px-4 text-center text-muted-foreground">
                        <Info className="h-8 w-8 text-muted-foreground/60 mb-2" />
                        <span className="text-sm font-semibold">No unfulfilled demand loaded.</span>
                        <span className="text-xs max-w-sm mt-1">
                            Add or approve Sales Orders to harvest production requirements.
                        </span>
                    </div>
                ) : (
                    <>
                    <div className="flex flex-col gap-2 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs text-muted-foreground" aria-live="polite">
                            {shortfallCount.toLocaleString()} of {netRequirements.length.toLocaleString()} {netRequirements.length === 1 ? "product has" : "products have"} a net shortfall
                        </p>
                        <Button
                            type="button"
                            variant={showShortfallsOnly ? "default" : "outline"}
                            size="sm"
                            aria-pressed={showShortfallsOnly}
                            aria-label={`Show only materials with a net shortfall. ${shortfallCount} ${shortfallCount === 1 ? "item" : "items"}.`}
                            onClick={() => {
                                setShowShortfallsOnly(value => !value);
                                onPageChange(1);
                            }}
                            className="gap-2 self-start sm:self-auto"
                        >
                            <Filter className="h-3.5 w-3.5" />
                            Shortfalls only
                            <Badge variant={showShortfallsOnly ? "secondary" : "outline"} className="px-1.5 py-0 text-[10px]">
                                {shortfallCount.toLocaleString()}
                            </Badge>
                        </Button>
                    </div>
                    {showShortfallsOnly && displayedRequirements.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center text-muted-foreground">
                            <Info className="h-8 w-8 text-green-600" />
                            <span className="text-sm font-semibold text-foreground">No materials have a net shortfall.</span>
                            <span className="max-w-sm text-xs">All listed materials currently meet their net requirements.</span>
                            <Button type="button" variant="outline" size="sm" onClick={() => setShowShortfallsOnly(false)}>
                                Show all materials
                            </Button>
                        </div>
                    ) : (
                    <>
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader className="bg-muted/5">
                                <TableRow>
                                    <TableHead className="font-bold text-xs">Product Details</TableHead>
                                    <TableHead className="font-bold text-xs text-right">Gross Demand</TableHead>
                                    <TableHead className="font-bold text-xs text-right">On Hand</TableHead>
                                    <TableHead className="font-bold text-xs text-right">Safety Stock</TableHead>
                                    <TableHead className="text-right font-bold text-xs" aria-sort={shortfallsFirst ? "descending" : "none"}>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            aria-label={shortfallsFirst ? "Reset Net Shortfall grouping" : "Group materials with shortfalls first"}
                                            aria-pressed={shortfallsFirst}
                                            title="Group materials with shortfalls before sufficient materials; quantities are not compared across units."
                                            onClick={() => setShortfallsFirst(value => !value)}
                                            className="h-8 gap-1 px-2 text-xs font-bold"
                                        >
                                            Net Shortfall
                                            <ArrowDownUp className="h-3.5 w-3.5" />
                                        </Button>
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody className="divide-y divide-border">
                                {visibleRequirements.map((item) => {
                                    const hasShortfall = item.net_shortfall > 0;
                                    return (
                                        <TableRow
                                            key={item.product_id}
                                            className={
                                                item.is_sub_assembly 
                                                    ? "bg-muted/40 hover:bg-muted/60 border-l-2 border-l-sky-500" 
                                                    : (hasShortfall ? "bg-red-50/5 hover:bg-red-50/10" : "")
                                            }
                                        >
                                            <TableCell className="py-3">
                                                <div className="font-bold text-sm text-foreground flex items-center gap-2 flex-wrap">
                                                    {item.is_sub_assembly && (
                                                        <span className="text-[8px] bg-sky-500/10 dark:bg-sky-950 text-sky-600 dark:text-sky-400 border border-sky-500/20 px-1.5 py-0.5 rounded uppercase font-black tracking-wider shrink-0">
                                                            Sub-Assembly
                                                        </span>
                                                    )}
                                                    <span className={item.is_sub_assembly ? "text-foreground" : ""}>{item.product_name}</span>
                                                    <span className="text-[10px] font-semibold text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded shrink-0">
                                                        {item.uom_name || item.unit_of_measurement || "Pieces"}
                                                    </span>
                                                </div>
                                                <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                                                    {item.product_code}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right font-semibold text-sm">
                                                {item.gross_demand.toLocaleString()} <span className="text-[10px] font-normal text-muted-foreground">{item.uom_name || item.uom_shortcut || "pcs"}</span>
                                            </TableCell>
                                            <TableCell className="text-right text-sm">
                                                {item.on_hand.toLocaleString()}
                                            </TableCell>
                                            <TableCell className="text-right text-sm text-muted-foreground">
                                                {item.safety_stock.toLocaleString()}
                                            </TableCell>
                                            <TableCell className="text-right py-3">
                                                {hasShortfall ? (
                                                    item.is_sub_assembly ? (
                                                        <Badge variant="outline" className="font-bold font-mono px-2 py-0.5 text-xs text-sky-400 border-sky-500/30 bg-sky-500/5">
                                                            {item.net_shortfall.toLocaleString()} Short
                                                        </Badge>
                                                    ) : (
                                                        <Badge variant="destructive" className="font-bold font-mono px-2 py-0.5 text-xs">
                                                            {item.net_shortfall.toLocaleString()} Short
                                                        </Badge>
                                                    )
                                                ) : (
                                                    <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50/10 font-mono px-2 py-0.5 text-xs">
                                                        Sufficient
                                                    </Badge>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                    <PlanningPaginationControls
                        {...pagination}
                        page={page}
                        totalItems={displayedRequirements.length}
                        itemLabel="products"
                    />
                    </>
                    )}
                    </>
                )}
            </CardContent>
        </Card>
    );
}
