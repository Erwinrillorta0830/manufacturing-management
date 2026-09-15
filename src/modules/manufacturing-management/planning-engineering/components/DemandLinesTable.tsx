import React, { useMemo, useState } from "react";
import { Loader2, Plus, Search } from "lucide-react";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { isSchedulableSalesOrderLine, remainingQuantity } from "../utils/demand-groups";

interface DemandLinesTableProps {
    loadingOrders: boolean;
    salesOrderGroups: SalesOrderDemandGroup[];
    selectedDetailIds: number[];
    handleSelectLine: (detailId: number, checked: boolean) => void;
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

function LineStack({ lines, render }: { lines: SalesOrderDetail[]; render: (line: SalesOrderDetail) => React.ReactNode }) {
    return <div className="space-y-2">{lines.map((line) => <div key={line.detail_id}>{render(line)}</div>)}</div>;
}

export function DemandLinesTable({
    loadingOrders,
    salesOrderGroups,
    selectedDetailIds,
    handleSelectLine
}: DemandLinesTableProps) {
    const [searchQuery, setSearchQuery] = useState("");

    const filteredGroups = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return salesOrderGroups;
        return salesOrderGroups.filter((group) =>
            [group.order.order_no, group.order.customer_name, group.order.customer_code]
                .filter(Boolean)
                .join(" ")
                .toLowerCase()
                .includes(q)
            || group.lines.some((line) => lineSearchText(line).includes(q))
        );
    }, [salesOrderGroups, searchQuery]);

    const selectableFilteredLines = filteredGroups.flatMap((group) => group.selectableLines);

    const toggleLines = (lines: SalesOrderDetail[], checked: boolean) => {
        lines.forEach((line) => {
            const selected = selectedDetailIds.includes(line.detail_id);
            if (selected !== checked) handleSelectLine(line.detail_id, checked);
        });
    };

    const toggleGroup = (group: SalesOrderDemandGroup, checked: boolean) => {
        toggleLines(group.selectableLines, checked);
    };

    return (
        <Card className="shadow-sm">
            <CardHeader className="pb-3 border-b bg-muted/10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <CardTitle className="text-base font-bold flex items-center gap-2">
                        <Plus className="h-5 w-5 text-primary" />
                        For Production Demand
                    </CardTitle>
                    <CardDescription className="text-xs">
                        Sales Orders with status For Production. Product lines stay visible inside the row; only eligible remaining quantities can be selected.
                    </CardDescription>
                </div>
                <div className="flex w-full md:w-auto gap-2 shrink-0">
                    <div className="relative w-full md:w-60">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search SO, customer, product..."
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                            className="pl-9 h-9 text-xs"
                        />
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-0">
                {loadingOrders ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-2">
                        <Loader2 className="h-6 w-6 text-primary animate-spin" />
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest animate-pulse">Loading demand...</span>
                    </div>
                ) : filteredGroups.length === 0 ? (
                    <div className="p-12 text-center text-xs text-muted-foreground font-semibold">No matching Sales Order demand found.</div>
                ) : (
                    <div className="overflow-x-auto max-h-[50vh] overflow-y-auto">
                        <Table>
                            <TableHeader className="bg-muted/5 sticky top-0 z-10">
                                <TableRow>
                                    <TableHead className="w-[40px] text-center">
                                        <Checkbox
                                            checked={selectableFilteredLines.length > 0 && selectableFilteredLines.every((line) => selectedDetailIds.includes(line.detail_id))}
                                            disabled={selectableFilteredLines.length === 0}
                                            onCheckedChange={(checked) => toggleLines(selectableFilteredLines, !!checked)}
                                        />
                                    </TableHead>
                                    <TableHead className="font-bold text-xs">Sales Order</TableHead>
                                    <TableHead className="font-bold text-xs">Products / BOM Versions</TableHead>
                                    <TableHead className="font-bold text-xs">Production Status</TableHead>
                                    <TableHead className="font-bold text-xs">Connected JO</TableHead>
                                    <TableHead className="font-bold text-xs text-right">Ordered</TableHead>
                                    <TableHead className="font-bold text-xs text-right">Planned</TableHead>
                                    <TableHead className="font-bold text-xs text-right">Remaining</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody className="divide-y divide-border">
                                {filteredGroups.map((group) => {
                                    const allSelected = group.selectableLines.length > 0 && group.selectableLines.every((line) => selectedDetailIds.includes(line.detail_id));
                                    return (
                                        <TableRow key={group.order.order_id} className="hover:bg-muted/5 align-top">
                                            <TableCell className="py-3 text-center">
                                                <Checkbox
                                                    checked={allSelected}
                                                    disabled={group.selectableLines.length === 0}
                                                    onCheckedChange={(checked) => toggleGroup(group, !!checked)}
                                                    aria-label={`Select eligible lines for ${group.order.order_no}`}
                                                />
                                            </TableCell>
                                            <TableCell className="py-3 text-xs min-w-[150px]">
                                                <div className="font-bold text-foreground">{group.order.order_no}</div>
                                                <div className="text-[10px] text-muted-foreground truncate max-w-[160px]">{group.order.customer_name || group.order.customer_code}</div>
                                                <div className="text-[10px] text-muted-foreground mt-1">{group.lines.length} product line{group.lines.length === 1 ? "" : "s"}</div>
                                            </TableCell>
                                            <TableCell className="py-3 text-xs min-w-[220px]">
                                                <LineStack lines={group.lines} render={(line) => (
                                                    <div>
                                                        <div className="font-semibold text-foreground flex items-center gap-1.5 flex-wrap">
                                                            <span>{line.product_id?.product_name || "Unknown product"}</span>
                                                            <span className="text-[10px] font-semibold text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded">
                                                                {line.product_id?.uom || "Pieces"}{line.product_id?.uom_count && line.product_id.uom_count > 1 ? ` (${line.product_id.uom_count} pcs)` : ""}
                                                            </span>
                                                        </div>
                                                        <div className="text-[10px] font-medium text-primary">Ver: {line.bom_version_name || "No Version"}</div>
                                                    </div>
                                                )} />
                                            </TableCell>
                                            <TableCell className="py-3 text-xs min-w-[130px]">
                                                <LineStack lines={group.lines} render={(line) => (
                                                    <span className={isSchedulableSalesOrderLine(line) ? "font-semibold text-amber-700" : "font-semibold text-blue-700"}>
                                                        {line.is_partially_scheduled ? "Partially scheduled" : line.is_scheduled ? "Fully scheduled" : line.parent_order_status || "Unknown"}
                                                    </span>
                                                )} />
                                            </TableCell>
                                            <TableCell className="py-3 text-xs min-w-[150px]">
                                                <LineStack lines={group.lines} render={(line) => line.linkedJobOrders && line.linkedJobOrders.length > 0 ? (
                                                    <div className="space-y-1">
                                                        {line.linkedJobOrders.map((jobOrder) => (
                                                            <div key={jobOrder.jobOrderId}>
                                                                <div className="font-mono font-semibold text-foreground">{jobOrder.jobOrderNo}</div>
                                                                <div className="text-[10px] text-muted-foreground">{displayJobOrderStatus(jobOrder.status)}</div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : <span className="text-muted-foreground">—</span>} />
                                            </TableCell>
                                            <TableCell className="py-3 text-right font-bold text-xs min-w-[100px]">
                                                <LineStack lines={group.lines} render={(line) => <span>{Number(line.ordered_quantity || 0).toLocaleString()} <span className="text-[10px] text-muted-foreground font-normal lowercase">{line.product_id?.uom || "pcs"}</span></span>} />
                                            </TableCell>
                                            <TableCell className="py-3 text-right font-semibold text-xs text-amber-700 min-w-[90px]">
                                                <LineStack lines={group.lines} render={(line) => <span>{Number(line.planned_quantity || 0).toLocaleString()}</span>} />
                                            </TableCell>
                                            <TableCell className="py-3 text-right font-bold text-xs text-emerald-700 min-w-[105px]">
                                                <LineStack lines={group.lines} render={(line) => <span>{remainingQuantity(line).toLocaleString()} <span className="text-[10px] text-muted-foreground font-normal lowercase">{line.product_id?.uom || "pcs"}</span></span>} />
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
