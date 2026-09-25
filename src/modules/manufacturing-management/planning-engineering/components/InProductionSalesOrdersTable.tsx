import React, { useMemo, useState } from "react";
import { Activity, Plus, RefreshCw, Search } from "lucide-react";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";
import { SalesOrderDemandGroup, SalesOrderDetail } from "../types";
import { displayJobOrderStatus } from "../../job-order-status";
import { canCreateReplacementJobOrder, remainingQuantity } from "../utils/demand-groups";

interface InProductionSalesOrdersTableProps {
    loadingOrders: boolean;
    error?: string | null;
    salesOrderGroups: SalesOrderDemandGroup[];
    onRetry: () => void;
    onCreateJobOrder: (detailId: number) => void;
}

function lineSearchText(line: SalesOrderDetail): string {
    return [
        line.order_no,
        line.customer_name,
        line.product_id?.product_name,
        line.product_id?.product_code,
        line.parent_order_status,
        ...(line.linkedJobOrders || []).flatMap((jobOrder) => [jobOrder.jobOrderNo, jobOrder.status])
    ].filter(Boolean).join(" ").toLowerCase();
}

function LineStack({ lines, render }: { lines: SalesOrderDetail[]; render: (line: SalesOrderDetail) => React.ReactNode }) {
    return <div className="space-y-2">{lines.map((line) => <div key={line.detail_id}>{render(line)}</div>)}</div>;
}

function ProductionTableSkeleton() {
    return (
        <div className="space-y-3 p-6" aria-label="Loading Sales Orders in production">
            {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="grid grid-cols-6 gap-4 animate-pulse">
                    {Array.from({ length: 6 }).map((__, cellIndex) => (
                        <div key={cellIndex} className="h-10 rounded-md bg-muted" />
                    ))}
                </div>
            ))}
        </div>
    );
}

export function InProductionSalesOrdersTable({
    loadingOrders,
    error,
    salesOrderGroups,
    onRetry,
    onCreateJobOrder
}: InProductionSalesOrdersTableProps) {
    const [searchQuery, setSearchQuery] = useState("");

    const filteredGroups = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return salesOrderGroups;

        return salesOrderGroups.filter((group) =>
            [group.order.order_no, group.order.customer_name, group.order.customer_code, group.order.order_status]
                .filter(Boolean)
                .join(" ")
                .toLowerCase()
                .includes(query)
            || group.lines.some((line) => lineSearchText(line).includes(query))
        );
    }, [salesOrderGroups, searchQuery]);

    return (
        <Card className="shadow-sm">
            <CardHeader className="flex flex-col gap-4 border-b bg-muted/10 pb-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <CardTitle className="flex items-center gap-2 text-base font-bold">
                        <Activity className="h-5 w-5 text-sky-600" />
                        Sales Orders in Production
                    </CardTitle>
                    <CardDescription className="text-xs">
                        Monitor Sales Orders in production and create replacement Job Orders for eligible terminated runs.
                    </CardDescription>
                </div>
                <div className="relative w-full md:w-72">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search SO, customer, product, JO..."
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        className="h-9 pl-9 text-xs"
                    />
                </div>
            </CardHeader>
            <CardContent className="p-0">
                {loadingOrders ? (
                    <ProductionTableSkeleton />
                ) : error ? (
                    <div role="alert" className="flex flex-col items-center gap-3 px-6 py-12 text-center">
                        <p className="text-sm font-bold text-destructive">Unable to load Sales Orders in production</p>
                        <p className="max-w-xl text-xs text-muted-foreground">{error}</p>
                        <Button type="button" variant="outline" size="sm" onClick={onRetry} className="gap-2 font-bold">
                            <RefreshCw className="h-3.5 w-3.5" />
                            Retry
                        </Button>
                    </div>
                ) : filteredGroups.length === 0 ? (
                    <div role="status" className="px-6 py-16 text-center text-xs font-semibold text-muted-foreground">
                        {searchQuery ? "No In Production Sales Orders match your search." : "No Sales Orders are currently In Production."}
                    </div>
                ) : (
                    <div className="max-h-[50vh] overflow-x-auto overflow-y-auto">
                        <Table>
                            <TableHeader className="sticky top-0 z-10 bg-muted/5">
                                <TableRow>
                                    <TableHead className="min-w-[170px] font-bold text-xs">Sales Order</TableHead>
                                    <TableHead className="min-w-[240px] font-bold text-xs">Products / BOM Versions</TableHead>
                                    <TableHead className="min-w-[180px] font-bold text-xs">Connected JO</TableHead>
                                    <TableHead className="min-w-[130px] font-bold text-xs">Status</TableHead>
                                    <TableHead className="min-w-[110px] text-right font-bold text-xs">Ordered</TableHead>
                                    <TableHead className="min-w-[110px] text-right font-bold text-xs">Planned</TableHead>
                                    <TableHead className="min-w-[115px] text-right font-bold text-xs">Remaining</TableHead>
                                    <TableHead className="min-w-[155px] font-bold text-xs">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody className="divide-y divide-border">
                                {filteredGroups.map((group) => (
                                    <TableRow key={group.order.order_id} className="align-top hover:bg-muted/5">
                                        <TableCell className="min-w-[170px] py-3 text-xs">
                                            <div className="font-bold text-foreground">{group.order.order_no}</div>
                                            <div className="max-w-[180px] truncate text-[10px] text-muted-foreground">
                                                {group.order.customer_name || group.order.customer_code}
                                            </div>
                                            <div className="mt-1 text-[10px] text-muted-foreground">
                                                {group.lines.length} product line{group.lines.length === 1 ? "" : "s"}
                                            </div>
                                        </TableCell>
                                        <TableCell className="min-w-[240px] py-3 text-xs">
                                            <LineStack lines={group.lines} render={(line) => (
                                                <div>
                                                    <div className="flex flex-wrap items-center gap-1.5 font-semibold text-foreground">
                                                        <span>{line.product_id?.product_name || "Unknown product"}</span>
                                                        <span className="rounded border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                                                            {line.product_id?.uom || "Pieces"}
                                                        </span>
                                                    </div>
                                                    <div className="text-[10px] font-medium text-primary">Ver: {line.bom_version_name || "No Version"}</div>
                                                </div>
                                            )} />
                                        </TableCell>
                                        <TableCell className="min-w-[180px] py-3 text-xs">
                                            <LineStack lines={group.lines} render={(line) => line.linkedJobOrders && line.linkedJobOrders.length > 0 ? (
                                                <div className="space-y-1">
                                                    {line.linkedJobOrders.map((jobOrder) => (
                                                        <div key={jobOrder.jobOrderId}>
                                                            <div className="flex flex-wrap items-center gap-1.5">
                                                                <span className="font-mono font-semibold text-foreground">{jobOrder.jobOrderNo}</span>
                                                                {jobOrder.isTerminated && (
                                                                    <Badge variant="outline" className="border-orange-500/30 bg-orange-500/10 px-1.5 py-0 text-[9px] text-orange-700 dark:text-orange-300">
                                                                        Terminated
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                            <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                                                                <span>{displayJobOrderStatus(jobOrder.status)}</span>
                                                                <span>· {jobOrder.allocatedQuantity.toLocaleString()} allocated</span>
                                                                <span>· {jobOrder.producedQuantity.toLocaleString()} produced</span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : <span className="text-muted-foreground">—</span>} />
                                        </TableCell>
                                        <TableCell className="min-w-[130px] py-3 text-xs">
                                            <Badge variant="outline" className="border-sky-500/30 bg-sky-500/10 font-bold text-sky-700 dark:text-sky-300">
                                                {group.order.order_status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="min-w-[110px] py-3 text-right text-xs font-bold">
                                            <LineStack lines={group.lines} render={(line) => (
                                                <span>{Number(line.ordered_quantity || 0).toLocaleString()} <span className="text-[10px] font-normal lowercase text-muted-foreground">{line.product_id?.uom || "pcs"}</span></span>
                                            )} />
                                        </TableCell>
                                        <TableCell className="min-w-[110px] py-3 text-right text-xs font-semibold text-amber-700">
                                            <LineStack lines={group.lines} render={(line) => <span>{Number(line.planned_quantity || 0).toLocaleString()}</span>} />
                                        </TableCell>
                                        <TableCell className="min-w-[115px] py-3 text-right text-xs font-bold text-emerald-700">
                                            <LineStack lines={group.lines} render={(line) => (
                                                <span>{remainingQuantity(line).toLocaleString()} <span className="text-[10px] font-normal lowercase text-muted-foreground">{line.product_id?.uom || "pcs"}</span></span>
                                            )} />
                                        </TableCell>
                                        <TableCell className="min-w-[155px] py-3 text-xs">
                                            <LineStack lines={group.lines} render={(line) => canCreateReplacementJobOrder(line) ? (
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-8 gap-1.5 whitespace-nowrap"
                                                    onClick={() => onCreateJobOrder(line.detail_id)}
                                                    aria-label={`Create replacement Job Order for ${group.order.order_no}, ${line.product_id?.product_name || "product"}`}
                                                >
                                                    <Plus className="h-3.5 w-3.5" />
                                                    Create JO
                                                </Button>
                                            ) : <span className="text-muted-foreground">—</span>} />
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
