import React, { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";
import { SalesOrderDemandGroup, SalesOrderDetail, SalesOrderReleaseGroup } from "../types";
import { displayJobOrderStatus } from "../../job-order-status";
import { isSchedulableSalesOrderLine, remainingQuantity } from "../utils/demand-groups";
import { PlanningPaginationControls, type PlanningPaginationState } from "./PlanningPaginationControls";
import { PlanningTableSearchBar } from "./PlanningTableSearchBar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface DemandLinesTableProps {
    loadingOrders: boolean;
    salesOrderGroups: SalesOrderDemandGroup[];
    selectedLines: SalesOrderDetail[];
    releaseGroups: SalesOrderReleaseGroup[];
    selectedDetailIds: number[];
    handleSelectLine: (detailId: number, checked: boolean) => void;
    handleSelectLines: (detailIds: number[], checked: boolean) => void;
    pagination: PlanningPaginationState;
}

function DemandHtmlTable({ className, ...props }: React.ComponentProps<"table">) {
    return <table data-slot="table" className={cn("w-full caption-bottom text-sm", className)} {...props} />;
}

function lineSearchText(line: SalesOrderDetail): string {
    return [
        line.order_no,
        line.customer_name,
        line.product_id?.product_name,
        line.product_id?.product_code,
        line.bom_version_name,
        line.parent_order_status,
        ...(line.linkedJobOrders || []).flatMap((jobOrder) => [jobOrder.jobOrderNo, jobOrder.status])
    ].filter(Boolean).join(" ").toLowerCase();
}

export function DemandLinesTable({
    loadingOrders,
    salesOrderGroups,
    selectedLines,
    releaseGroups,
    selectedDetailIds,
    handleSelectLine,
    handleSelectLines,
    pagination
}: DemandLinesTableProps) {
    const [searchQuery, setSearchQuery] = useState("");

    const allLines = useMemo(() => {
        return salesOrderGroups.flatMap((group) => group.lines);
    }, [salesOrderGroups]);

    const searchTextByDetailId = useMemo(() => {
        return new Map(allLines.map((line) => [line.detail_id, lineSearchText(line)]));
    }, [allLines]);

    const filteredLines = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return allLines;
        return allLines.filter((line) => searchTextByDetailId.get(line.detail_id)?.includes(q));
    }, [allLines, searchQuery, searchTextByDetailId]);

    const selectableFilteredLines = useMemo(() => {
        return filteredLines.filter(isSchedulableSalesOrderLine);
    }, [filteredLines]);

    const selectedIds = useMemo(() => new Set(selectedDetailIds), [selectedDetailIds]);
    const requestedPage = pagination.page;
    const pageSize = pagination.pageSize;
    const onPageChange = pagination.onPageChange;
    const totalPages = Math.max(1, Math.ceil(filteredLines.length / pageSize));
    const page = Math.min(requestedPage, totalPages);
    const pageStart = (page - 1) * pageSize;
    const visibleLines = filteredLines.slice(pageStart, pageStart + pageSize);

    useEffect(() => {
        if (requestedPage !== page) onPageChange(page);
    }, [requestedPage, onPageChange, page]);

    return (
        <Card className="shadow-sm">
            <CardHeader className="pb-3">
                <div>
                    <CardTitle className="text-xl font-bold tracking-tight flex items-center gap-2">
                        <Plus className="h-5 w-5 text-primary" />
                        Schedulable Sales Order Demand
                    </CardTitle>
                    <CardDescription className="text-sm text-muted-foreground">
                        Select residual For Production or In Production demand with no active Job Order. Prior output reduces the remaining quantity only after final QA approval and receipt.
                    </CardDescription>
                </div>
            </CardHeader>
            <div className="px-6 pb-4">
                <PlanningTableSearchBar
                    searchQuery={searchQuery}
                    onSearchQueryChange={(query) => {
                        setSearchQuery(query);
                        onPageChange(1);
                    }}
                    placeholder="Search SO, customer, product..."
                    filteredCount={filteredLines.length}
                    totalCount={allLines.length}
                    itemLabel="Sales Order lines"
                />
            </div>
            <div className="2xl:hidden sticky top-0 z-20 border-y bg-card/95 px-4 py-2 shadow-sm backdrop-blur-sm">
                <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="font-bold text-foreground">
                        {selectedLines.length.toLocaleString()} selected {selectedLines.length === 1 ? "line" : "lines"}
                    </span>
                    <span className="shrink-0 font-semibold text-primary">
                        {releaseGroups.length.toLocaleString()} Job Order{releaseGroups.length === 1 ? "" : "s"}
                    </span>
                </div>
                {releaseGroups.length > 0 && (
                    <div role="list" aria-label="Resulting Job Order groups" className="mt-2 flex gap-2 overflow-x-auto pb-1">
                        {releaseGroups.map((group, index) => (
                            <span key={group.key} role="listitem" title={`${group.productName} · ${group.bomVersionName}`} className="shrink-0 max-w-[75vw] truncate rounded-md border bg-background px-2 py-1 text-[10px] font-medium text-muted-foreground">
                                JO {index + 1}: {group.productName} · {group.bomVersionName} · {group.lines.length} {group.lines.length === 1 ? "line" : "lines"}
                            </span>
                        ))}
                    </div>
                )}
            </div>
            <CardContent className="p-0">
                {loadingOrders ? (
                    <>
                        <div role="status" aria-busy="true" aria-label="Loading Sales Order demand" className="hidden 2xl:block">
                            <DemandHtmlTable className="w-full table-fixed">
                                <colgroup>
                                    {["4%", "12%", "18%", "12%", "14%", "9%", "8%", "11%", "12%"].map((width, index) => (
                                        <col key={index} style={{ width }} />
                                    ))}
                                </colgroup>
                                <TableHeader className="bg-muted/5">
                                    <TableRow>
                                        {Array.from({ length: 9 }, (_, index) => (
                                            <TableHead key={index}>
                                                <Skeleton className={`h-4 ${index === 0 ? "w-5" : index < 5 ? "w-24" : "w-16 ml-auto"}`} />
                                            </TableHead>
                                        ))}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {Array.from({ length: 5 }, (_, row) => (
                                        <TableRow key={row}>
                                            {Array.from({ length: 9 }, (_, column) => (
                                                <TableCell key={column} className="py-4">
                                                    <Skeleton className={`h-4 ${column === 0 ? "w-5 mx-auto" : column >= 5 ? "w-14 ml-auto" : "w-3/4"}`} />
                                                </TableCell>
                                            ))}
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </DemandHtmlTable>
                        </div>
                        <div role="status" aria-busy="true" aria-label="Loading Sales Order demand" className="2xl:hidden space-y-3 p-3">
                            {Array.from({ length: 5 }, (_, index) => (
                                <div key={index} className="space-y-3 rounded-lg border p-4">
                                    <div className="flex items-center gap-3">
                                        <Skeleton className="h-4 w-4" />
                                        <Skeleton className="h-5 w-40" />
                                    </div>
                                    <Skeleton className="h-4 w-3/4" />
                                    <div className="grid grid-cols-2 gap-3">
                                        {Array.from({ length: 4 }, (_, metric) => <Skeleton key={metric} className="h-10" />)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                ) : filteredLines.length === 0 ? (
                    <div className="p-12 text-center text-xs text-muted-foreground font-semibold">No matching Sales Order demand found.</div>
                ) : (
                    <>
                        <div className="hidden 2xl:block">
                        <DemandHtmlTable className="w-full table-fixed">
                            <colgroup>
                                {["4%", "12%", "18%", "12%", "14%", "9%", "8%", "11%", "12%"].map((width, index) => (
                                    <col key={index} style={{ width }} />
                                ))}
                            </colgroup>
                            <TableHeader className="bg-muted/95">
                                <TableRow>
                                    <TableHead className="whitespace-normal break-words text-center">
                                        <Checkbox
                                            checked={selectableFilteredLines.length > 0 && selectableFilteredLines.every((line) => selectedIds.has(line.detail_id))}
                                            disabled={selectableFilteredLines.length === 0}
                                            onCheckedChange={(checked) => handleSelectLines(selectableFilteredLines.map((line) => line.detail_id), !!checked)}
                                        />
                                    </TableHead>
                                    <TableHead className="whitespace-normal break-words font-bold text-xs">Sales Order</TableHead>
                                    <TableHead className="whitespace-normal break-words font-bold text-xs">Product / BOM Version</TableHead>
                                    <TableHead className="whitespace-normal break-words font-bold text-xs">Production Status</TableHead>
                                    <TableHead className="whitespace-normal break-words font-bold text-xs">Connected JO</TableHead>
                                    <TableHead className="whitespace-normal break-words text-right font-bold text-xs">Ordered</TableHead>
                                    <TableHead className="whitespace-normal break-words text-right font-bold text-xs">Planned</TableHead>
                                    <TableHead className="whitespace-normal break-words text-right font-bold text-xs">Prior QA Credit</TableHead>
                                    <TableHead className="whitespace-normal break-words text-right font-bold text-xs">Remaining</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody className="divide-y divide-border">
                                {visibleLines.map((line) => {
                                    const isSchedulable = isSchedulableSalesOrderLine(line);
                                    const isChecked = selectedIds.has(line.detail_id);
                                    return (
                                        <TableRow key={line.detail_id} className="hover:bg-muted/5 align-middle">
                                            <TableCell className="px-2 py-3 text-center align-top whitespace-normal">
                                                <Checkbox
                                                    checked={isChecked}
                                                    disabled={!isSchedulable}
                                                    onCheckedChange={(checked) => handleSelectLine(line.detail_id, !!checked)}
                                                    aria-label={`Select detail #${line.detail_id} for ${line.order_no}`}
                                                />
                                            </TableCell>
                                            <TableCell className="px-2 py-3 align-top text-xs whitespace-normal break-words">
                                                <div className="break-all font-bold text-foreground">{line.order_no}</div>
                                                <div className="text-[10px] text-muted-foreground break-words" title={line.customer_name}>{line.customer_name}</div>
                                            </TableCell>
                                            <TableCell className="px-2 py-3 align-top text-xs whitespace-normal break-words">
                                                <div className="font-semibold text-foreground break-words" title={line.product_id?.product_name || "Unknown product"}>
                                                    {line.product_id?.product_name || "Unknown product"}
                                                    <span className="ml-1 text-[10px] font-semibold text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded">
                                                        {line.product_id?.uom || "Pieces"}{line.product_id?.uom_count && line.product_id.uom_count > 1 ? ` (${line.product_id.uom_count} pcs)` : ""}
                                                    </span>
                                                </div>
                                                <div className="text-[10px] font-medium text-primary break-words">Ver: {line.bom_version_name || "No Version"}</div>
                                            </TableCell>
                                            <TableCell className="px-2 py-3 align-top text-xs whitespace-normal break-words">
                                                <span className={isSchedulable ? "font-semibold text-amber-700 dark:text-amber-400" : "font-semibold text-blue-700 dark:text-blue-400"}>
                                                    {line.is_partially_scheduled ? "Partially scheduled" : line.is_scheduled ? "Fully scheduled" : line.parent_order_status || "For Production"}
                                                </span>
                                            </TableCell>
                                            <TableCell className="px-2 py-3 align-top text-xs whitespace-normal break-words">
                                                {line.linkedJobOrders && line.linkedJobOrders.length > 0 ? (
                                                    <div className="space-y-1">
                                                        {line.linkedJobOrders.map((jobOrder) => (
                                                            <div key={jobOrder.jobOrderId}>
                                                                <div className="font-mono font-semibold text-foreground break-all" title={jobOrder.jobOrderNo}>{jobOrder.jobOrderNo}</div>
                                                                <div className="text-[10px] text-muted-foreground break-words">{displayJobOrderStatus(jobOrder.status)}</div>
                                                            </div>
                                                        ))}
                                                    </div>
                                            ) : <span className="text-muted-foreground">—</span>}
                                            </TableCell>
                                            <TableCell className="px-2 py-3 text-right align-top font-bold text-xs whitespace-normal break-words">
                                                <span>{Number(line.ordered_quantity || 0).toLocaleString()} <span className="text-[10px] text-muted-foreground font-normal lowercase">{line.product_id?.uom || "pcs"}</span></span>
                                            </TableCell>
                                            <TableCell className="px-2 py-3 text-right align-top font-semibold text-xs text-amber-700 whitespace-normal break-words">
                                                <span>{Number(line.planned_quantity || 0).toLocaleString()}</span>
                                            </TableCell>
                                            <TableCell className="px-2 py-3 text-right align-top font-semibold text-xs text-sky-700 whitespace-normal break-words">
                                                <span>{Number(line.replacement_credit_quantity || 0).toLocaleString()}</span>
                                            </TableCell>
                                            <TableCell className="px-2 py-3 text-right align-top font-bold text-xs text-emerald-700 whitespace-normal break-words">
                                                <span>{remainingQuantity(line).toLocaleString()} <span className="text-[10px] text-muted-foreground font-normal lowercase">{line.product_id?.uom || "pcs"}</span></span>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </DemandHtmlTable>
                        </div>
                        <div className="2xl:hidden space-y-3 p-3">
                            <div className="flex items-center gap-2 rounded-md border bg-muted/20 px-3 py-2 text-xs">
                                <Checkbox
                                    checked={selectableFilteredLines.length > 0 && selectableFilteredLines.every((line) => selectedIds.has(line.detail_id))}
                                    disabled={selectableFilteredLines.length === 0}
                                    onCheckedChange={(checked) => handleSelectLines(selectableFilteredLines.map((line) => line.detail_id), !!checked)}
                                    aria-label="Select all eligible Sales Order demand lines"
                                />
                                <span className="font-medium">Select all eligible lines</span>
                            </div>
                            {visibleLines.map((line) => {
                                const isSchedulable = isSchedulableSalesOrderLine(line);
                                const isChecked = selectedIds.has(line.detail_id);
                                return (
                                    <article key={line.detail_id} className="rounded-lg border bg-card p-3 shadow-sm">
                                        <div className="flex items-start gap-2">
                                            <Checkbox
                                                checked={isChecked}
                                                disabled={!isSchedulable}
                                                onCheckedChange={(checked) => handleSelectLine(line.detail_id, !!checked)}
                                                aria-label={`Select detail #${line.detail_id} for ${line.order_no}`}
                                                className="mt-0.5"
                                            />
                                            <div className="min-w-0 flex-1">
                                                <div className="break-all text-sm font-bold text-foreground">{line.order_no}</div>
                                                <div className="break-words text-xs text-muted-foreground">{line.customer_name || "Customer not specified"}</div>
                                            </div>
                                            <span className={cn(
                                                "shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold",
                                                isSchedulable
                                                    ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                                                    : "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400"
                                            )}>
                                                {line.is_partially_scheduled ? "Partially scheduled" : line.is_scheduled ? "Fully scheduled" : line.parent_order_status || "For Production"}
                                            </span>
                                        </div>
                                        <div className="mt-3 border-t pt-3">
                                            <div className="text-sm font-semibold text-foreground break-words">{line.product_id?.product_name || "Unknown product"}</div>
                                            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                                                <span className="rounded border border-primary/20 bg-primary/10 px-1.5 py-0.5 font-semibold text-primary">
                                                    {line.product_id?.uom || "Pieces"}{line.product_id?.uom_count && line.product_id.uom_count > 1 ? ` (${line.product_id.uom_count} pcs)` : ""}
                                                </span>
                                                <span className="text-muted-foreground">BOM version: {line.bom_version_name || "No Version"}</span>
                                            </div>
                                        </div>
                                        <div className="mt-3 border-t pt-3">
                                            <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Connected Job Orders</div>
                                            {line.linkedJobOrders && line.linkedJobOrders.length > 0 ? (
                                                <div className="mt-1 space-y-1">
                                                    {line.linkedJobOrders.map((jobOrder) => (
                                                        <div key={jobOrder.jobOrderId} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-xs">
                                                            <span className="break-all font-mono font-semibold text-foreground">{jobOrder.jobOrderNo}</span>
                                                            <span className="text-muted-foreground">{displayJobOrderStatus(jobOrder.status)}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : <div className="mt-1 text-xs text-muted-foreground">—</div>}
                                        </div>
                                        <div className="mt-3 grid grid-cols-2 gap-2 border-t pt-3 sm:grid-cols-4">
                                            <div className="rounded-md bg-muted/30 p-2">
                                                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Ordered</div>
                                                <div className="mt-1 text-xs font-bold text-foreground">{Number(line.ordered_quantity || 0).toLocaleString()} {line.product_id?.uom || "pcs"}</div>
                                            </div>
                                            <div className="rounded-md bg-muted/30 p-2">
                                                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Planned</div>
                                                <div className="mt-1 text-xs font-bold text-amber-700">{Number(line.planned_quantity || 0).toLocaleString()}</div>
                                            </div>
                                            <div className="rounded-md bg-muted/30 p-2">
                                                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Prior QA Credit</div>
                                                <div className="mt-1 text-xs font-bold text-sky-700">{Number(line.replacement_credit_quantity || 0).toLocaleString()}</div>
                                            </div>
                                            <div className="rounded-md bg-muted/30 p-2">
                                                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Remaining</div>
                                                <div className="mt-1 text-xs font-bold text-emerald-700">{remainingQuantity(line).toLocaleString()} {line.product_id?.uom || "pcs"}</div>
                                            </div>
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                        <PlanningPaginationControls
                            {...pagination}
                            page={page}
                            totalItems={filteredLines.length}
                            itemLabel="lines"
                        />
                    </>
                )}
            </CardContent>
        </Card>
    );
}
