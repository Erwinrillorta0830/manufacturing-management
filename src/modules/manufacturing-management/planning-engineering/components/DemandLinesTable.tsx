import React, { useState, useMemo } from "react";
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
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";
import { SalesOrderDetail } from "../types";
import {
    isProductionSchedulingStatus,
    SALES_ORDER_TRANSITIONS
} from "@/app/api/manufacturing/sales-order/_status";

const DEMAND_STATUS_OPTIONS = [
    { value: "ALL", label: "All" },
    ...Object.keys(SALES_ORDER_TRANSITIONS)
        .filter((status) => status !== "Cancelled")
        .map((status) => ({ value: status, label: status }))
];

interface DemandLinesTableProps {
    loadingOrders: boolean;
    salesOrderLines: SalesOrderDetail[];
    selectedDetailIds: number[];
    handleSelectLine: (detailId: number, checked: boolean) => void;
}

export function DemandLinesTable({
    loadingOrders,
    salesOrderLines,
    selectedDetailIds,
    handleSelectLine
}: DemandLinesTableProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState("ALL");

    // Filter lines based on status and search query (by product name, SO number, or customer name)
    const filteredLines = useMemo(() => {
        const statusFilteredLines = statusFilter === "ALL"
            ? salesOrderLines
            : salesOrderLines.filter((line) => line.parent_order_status === statusFilter);
        if (!searchQuery.trim()) return statusFilteredLines;
        const q = searchQuery.toLowerCase();
        return statusFilteredLines.filter(line =>
            (line.product_id?.product_name || "").toLowerCase().includes(q) ||
            (line.order_no || "").toLowerCase().includes(q) ||
            (line.customer_name || "").toLowerCase().includes(q) ||
            (line.product_id?.product_code || "").toLowerCase().includes(q)
        );
    }, [salesOrderLines, searchQuery, statusFilter]);

    const isSchedulableLine = (line: SalesOrderDetail) =>
        isProductionSchedulingStatus(line.parent_order_status) && line.is_scheduled !== true;
    const selectableFilteredLines = filteredLines.filter(isSchedulableLine);

    return (
        <Card className="shadow-sm">
            <CardHeader className="pb-3 border-b bg-muted/10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <CardTitle className="text-base font-bold flex items-center gap-2">
                        <Plus className="h-5 w-5 text-primary" />
                        Unfulfilled Demand Lines
                    </CardTitle>
                    <CardDescription className="text-xs">
                        Filter Sales Order demand by status. Only For Production and In Production lines can be scheduled; other statuses are view-only.
                    </CardDescription>
                </div>
                <div className="flex w-full md:w-auto flex-col sm:flex-row gap-2 shrink-0">
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="w-full sm:w-[170px] h-9 text-xs" aria-label="Filter by Sales Order status">
                            <SelectValue placeholder="Filter status" />
                        </SelectTrigger>
                        <SelectContent>
                            {DEMAND_STATUS_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <div className="relative w-full md:w-60">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search product or SO #..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 h-9 text-xs"
                        />
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-0">
                {loadingOrders ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-2">
                        <Loader2 className="h-6 w-6 text-primary animate-spin" />
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest animate-pulse">
                            Loading lines...
                        </span>
                    </div>
                ) : filteredLines.length === 0 ? (
                    <div className="p-12 text-center text-xs text-muted-foreground font-semibold">
                        No matching unfulfilled demand found.
                    </div>
                ) : (
                    <div className="overflow-x-auto max-h-[50vh] overflow-y-auto">
                        <Table>
                            <TableHeader className="bg-muted/5 sticky top-0 z-10">
                                <TableRow>
                                    <TableHead className="w-[40px] text-center">
                                        <Checkbox
                                            checked={
                                                selectableFilteredLines.length > 0 &&
                                                selectableFilteredLines.every(l => selectedDetailIds.includes(l.detail_id))
                                            }
                                            disabled={selectableFilteredLines.length === 0}
                                            onCheckedChange={(checked) => {
                                                if (checked) {
                                                    // Select only the filtered lines
                                                    selectableFilteredLines.forEach(l => {
                                                        if (!selectedDetailIds.includes(l.detail_id)) {
                                                            handleSelectLine(l.detail_id, true);
                                                        }
                                                    });
                                                } else {
                                                    // Deselect only the filtered lines
                                                    selectableFilteredLines.forEach(l => {
                                                        if (selectedDetailIds.includes(l.detail_id)) {
                                                            handleSelectLine(l.detail_id, false);
                                                        }
                                                    });
                                                }
                                            }}
                                        />
                                    </TableHead>
                                    <TableHead className="font-bold text-xs">SO No.</TableHead>
                                    <TableHead className="font-bold text-xs">Product / Version</TableHead>
                                    <TableHead className="font-bold text-xs">Production Status</TableHead>
                                    <TableHead className="font-bold text-xs">Connected JO</TableHead>
                                    <TableHead className="font-bold text-xs text-right">Ordered</TableHead>
                                    <TableHead className="font-bold text-xs text-right">Planned</TableHead>
                                    <TableHead className="font-bold text-xs text-right">Remaining</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody className="divide-y divide-border">
                                {filteredLines.map((line) => (
                                    <TableRow key={line.detail_id} className="hover:bg-muted/5">
                                        <TableCell className="py-2 text-center">
                                            <Checkbox
                                                checked={selectedDetailIds.includes(line.detail_id)}
                                                disabled={!isSchedulableLine(line)}
                                                onCheckedChange={(checked) =>
                                                    handleSelectLine(line.detail_id, !!checked)
                                                }
                                            />
                                        </TableCell>
                                        <TableCell className="py-2 text-xs">
                                            <div className="font-bold text-foreground">
                                                {line.order_no}
                                            </div>
                                            <div className="text-[10px] text-muted-foreground truncate max-w-[100px]">
                                                {line.customer_name}
                                            </div>
                                        </TableCell>
                                        <TableCell className="py-2 text-xs">
                                            <div className="font-semibold text-foreground flex items-center gap-1.5 flex-wrap">
                                                <span>{line.product_id?.product_name}</span>
                                                <span className="text-[10px] font-semibold text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded">
                                                    {line.product_id?.uom || "Pieces"} {line.product_id?.uom_count && line.product_id.uom_count > 1 ? `(${line.product_id.uom_count} pcs)` : ""}
                                                </span>
                                            </div>
                                            <div className="text-[10px] font-medium text-primary">
                                                Ver: {line.bom_version_name || "No Version"}
                                            </div>
                                        </TableCell>
                                        <TableCell className="py-2 text-xs">
                                            <span className={isSchedulableLine(line) ? "font-semibold text-amber-700" : "font-semibold text-blue-700"}>
                                                {line.is_partially_scheduled
                                                    ? "Partially scheduled"
                                                    : line.is_scheduled
                                                        ? "Fully scheduled"
                                                        : line.parent_order_status || "Unknown"}
                                            </span>
                                        </TableCell>
                                        <TableCell className="py-2 text-xs">
                                            {line.parent_order_status === "For Production" ? (
                                                <span className="text-muted-foreground">—</span>
                                            ) : line.linkedJobOrders && line.linkedJobOrders.length > 0 ? (
                                                <div className="space-y-1">
                                                    {line.linkedJobOrders.map((jobOrder) => (
                                                        <div key={jobOrder.jobOrderId}>
                                                            <div className="font-mono font-semibold text-foreground">
                                                                {jobOrder.jobOrderNo}
                                                            </div>
                                                            <div className="text-[10px] text-muted-foreground">
                                                                {jobOrder.status}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <span className="text-muted-foreground">No linked JO</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="py-2 text-right font-bold text-xs">
                                            {Number(line.ordered_quantity || 0).toLocaleString()}
                                            <span className="text-[10px] text-muted-foreground font-normal ml-1 lowercase">
                                                {line.product_id?.uom || "pcs"}
                                            </span>
                                        </TableCell>
                                        <TableCell className="py-2 text-right font-semibold text-xs text-amber-700">
                                            {Number(line.planned_quantity || 0).toLocaleString()}
                                        </TableCell>
                                        <TableCell className="py-2 text-right font-bold text-xs text-emerald-700">
                                            {(line.remaining_quantity ?? Math.max(0, Number(line.ordered_quantity || 0) - Math.max(Number(line.allocated_quantity || 0), Number(line.served_quantity || 0)) - Number(line.planned_quantity || 0))).toLocaleString()}
                                            <span className="text-[10px] text-muted-foreground font-normal ml-1 lowercase">
                                                {line.product_id?.uom || "pcs"}
                                            </span>
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
