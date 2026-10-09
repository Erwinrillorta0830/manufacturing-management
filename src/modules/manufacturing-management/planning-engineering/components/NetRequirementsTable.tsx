import React, { useEffect } from "react";
import { Loader2, Layers, Info, AlertTriangle, RefreshCw } from "lucide-react";
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
    const selectedBranch = branches.find(b => b.id === selectedBranchId);
    const requestedPage = pagination.page;
    const pageSize = pagination.pageSize;
    const onPageChange = pagination.onPageChange;
    const totalPages = Math.max(1, Math.ceil(netRequirements.length / pageSize));
    const page = Math.min(requestedPage, totalPages);
    const visibleRequirements = netRequirements.slice((page - 1) * pageSize, page * pageSize);

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
                    <div className="flex flex-col items-center justify-center py-20 gap-3">
                        <Loader2 className="h-8 w-8 text-primary animate-spin" />
                        <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest animate-pulse">
                            {subAssemblyLookupStatus === "loading" ? "Loading sub-assembly BOMs..." : "Calculating requirements..."}
                        </span>
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
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader className="bg-muted/5">
                                <TableRow>
                                    <TableHead className="font-bold text-xs">Product Details</TableHead>
                                    <TableHead className="font-bold text-xs text-right">Gross Demand</TableHead>
                                    <TableHead className="font-bold text-xs text-right">On Hand</TableHead>
                                    <TableHead className="font-bold text-xs text-right">Safety Stock</TableHead>
                                    <TableHead className="font-bold text-xs text-right">Net Shortfall</TableHead>
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
                        totalItems={netRequirements.length}
                        itemLabel="products"
                    />
                    </>
                )}
            </CardContent>
        </Card>
    );
}
