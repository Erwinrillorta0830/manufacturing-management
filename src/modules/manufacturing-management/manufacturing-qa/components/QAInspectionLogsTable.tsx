"use client";

import React, { useState, useMemo } from "react";
import { 
    FileText, 
    Search, 
    RefreshCw, 
    CheckCircle2, 
    RotateCcw, 
    ShieldCheck
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import { QAJOInspectionLog, QARejectionReason } from "../types";
import { ResponsiveDataView } from "./ResponsiveDataView";

interface QAInspectionLogsTableProps {
    logs: QAJOInspectionLog[];
    rejectionReasons: QARejectionReason[];
    loadingLogs: boolean;
    onRefresh: () => void;
    onFiltersChange?: (filters: { search: string; status: string; reason: string }) => void;
}

export function QAInspectionLogsTable({
    logs,
    rejectionReasons,
    loadingLogs,
    onRefresh,
    onFiltersChange
}: QAInspectionLogsTableProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [reasonFilter, setReasonFilter] = useState("all");

    const filteredLogs = useMemo(() => {
        return logs.filter(log => {
            const joNo = (log.job_order_no || `JO-${log.job_order_id}`).toLowerCase();
            const prodName = (log.product_name || "").toLowerCase();
            const rwkNo = (log.rework_job_order_no || "").toLowerCase();
            const remarks = (log.remarks || "").toLowerCase();
            const reasonName = (log.rejection_reason_name || "").toLowerCase();
            const q = searchQuery.toLowerCase().trim();

            const matchesSearch = !q || 
                joNo.includes(q) || 
                prodName.includes(q) || 
                rwkNo.includes(q) || 
                remarks.includes(q) || 
                reasonName.includes(q);

            const matchesStatus = statusFilter === "all" || 
                (statusFilter === "passed" && Number(log.rejected_quantity) === 0) ||
                (statusFilter === "rework" && Number(log.rejected_quantity) > 0);

            const matchesReason = reasonFilter === "all" || String(log.rejection_reason_id) === String(reasonFilter);

            return matchesSearch && matchesStatus && matchesReason;
        });
    }, [logs, searchQuery, statusFilter, reasonFilter]);

    const filtersActive = searchQuery.length > 0 || statusFilter !== "all" || reasonFilter !== "all";
    const clearFilters = () => {
        setSearchQuery("");
        setStatusFilter("all");
        setReasonFilter("all");
        onFiltersChange?.({ search: "", status: "all", reason: "all" });
    };

    const renderLogCard = (log: QAJOInspectionLog) => {
        const isPassed = Number(log.rejected_quantity) === 0;
        return (
            <Card key={log.id} className="border p-4 shadow-xs">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <p className="font-mono text-sm font-bold text-foreground">{log.job_order_no || `JO-${log.job_order_id}`}</p>
                        <p className="mt-1 text-sm text-muted-foreground">Log #{log.id} · {log.inspected_at ? new Date(log.inspected_at).toLocaleDateString() : "N/A"}</p>
                    </div>
                    <Badge variant={isPassed ? "default" : "destructive"} className={isPassed ? "min-h-7 bg-emerald-600 text-sm" : "min-h-7 text-sm"}>
                        {log.status || (isPassed ? "PASSED" : "REWORK_TRIGGERED")}
                    </Badge>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                    <div><dt className="text-muted-foreground">Product</dt><dd className="truncate font-semibold">{log.product_name || "Finished Good"}</dd></div>
                    <div><dt className="text-muted-foreground">Inspected</dt><dd className="font-mono font-semibold">{Number(log.inspected_quantity).toLocaleString()}</dd></div>
                    <div><dt className="text-muted-foreground">Passed</dt><dd className="font-mono font-semibold text-emerald-600">{Number(log.passed_quantity).toLocaleString()}</dd></div>
                    <div><dt className="text-muted-foreground">Rejected</dt><dd className="font-mono font-semibold text-destructive">{Number(log.rejected_quantity).toLocaleString()}</dd></div>
                </dl>
                <div className="mt-3 space-y-1 text-sm">
                    <p><span className="font-semibold text-muted-foreground">Defect:</span> {log.rejection_reason_name || log.rejection_reason_code || "None (Passed)"}</p>
                    <p><span className="font-semibold text-muted-foreground">Rework:</span> {log.rework_job_order_no || (log.rework_job_order_id ? `JO-RWK #${log.rework_job_order_id}` : "N/A")}</p>
                    {log.remarks && <p className="break-words"><span className="font-semibold text-muted-foreground">Remarks:</span> {log.remarks}</p>}
                </div>
            </Card>
        );
    };

    return (
        <Card className="border shadow-xs">
            <CardHeader className="p-5 border-b flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <CardTitle className="text-lg font-bold text-foreground flex items-center gap-2">
                        <FileText className="h-5 w-5 text-primary" />
                        QA Job Order Inspection Audit Logs
                    </CardTitle>
                    <CardDescription className="text-xs text-muted-foreground mt-0.5">
                        Permanent immutable inspection history recorded in <code className="text-foreground font-mono">qa_jo_inspection_logs</code> with defect classifications and rework links.
                    </CardDescription>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative w-full sm:w-64">
                        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                            placeholder="Search JO #, defect, or notes..."
                            value={searchQuery}
                            onChange={e => { const search = e.target.value; setSearchQuery(search); onFiltersChange?.({ search, status: statusFilter, reason: reasonFilter }); }}
                            className="pl-8 h-11 text-sm"
                        />
                    </div>

                    <Select value={statusFilter} onValueChange={(value) => { setStatusFilter(value); onFiltersChange?.({ search: searchQuery, status: value, reason: reasonFilter }); }}>
                        <SelectTrigger className="h-11 text-sm w-36">
                            <SelectValue placeholder="Result" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all" className="text-xs">All Results</SelectItem>
                            <SelectItem value="passed" className="text-xs">100% Passed</SelectItem>
                            <SelectItem value="rework" className="text-xs">Rework Triggered</SelectItem>
                        </SelectContent>
                    </Select>

                    {rejectionReasons.length > 0 && (
                        <Select value={reasonFilter} onValueChange={(value) => { setReasonFilter(value); onFiltersChange?.({ search: searchQuery, status: statusFilter, reason: value }); }}>
                            <SelectTrigger className="h-11 text-sm w-40">
                                <SelectValue placeholder="Defect Reason" />
                            </SelectTrigger>
                            <SelectContent className="max-h-56">
                                <SelectItem value="all" className="text-xs">All Reasons</SelectItem>
                                {rejectionReasons.map(r => (
                                    <SelectItem key={r.id} value={String(r.id)} className="text-xs">
                                        {r.reason_code} - {r.reason_name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}

                    {filtersActive && <Button variant="outline" size="sm" onClick={clearFilters} className="min-h-11 gap-1 text-sm">
                        Clear
                    </Button>}
                    <Button variant="outline" size="sm" onClick={onRefresh} className="min-h-11 gap-1 text-sm">
                        <RefreshCw className="h-3.5 w-3.5" />
                        Refresh
                    </Button>
                </div>
            </CardHeader>

            <CardContent className="p-0">
                {loadingLogs ? (
                    <div className="flex flex-col items-center justify-center p-14 text-muted-foreground">
                        <RefreshCw className="h-7 w-7 animate-spin text-muted-foreground/60 mb-2" />
                        <span className="text-xs font-semibold">Loading inspection logs...</span>
                    </div>
                ) : filteredLogs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-14 text-center">
                        <ShieldCheck className="h-10 w-10 text-muted-foreground/40 mb-2" />
                        <h4 className="text-sm font-bold text-foreground">No Inspection Logs Found</h4>
                        <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                            No inspection records match the current filter criteria. Perform a 2-Point QA inspection to generate logs.
                        </p>
                    </div>
                ) : (
                    <ResponsiveDataView
                        table={(
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/30">
                                    <TableHead className="text-xs font-bold">Log # / Date</TableHead>
                                    <TableHead className="text-xs font-bold">Job Order No</TableHead>
                                    <TableHead className="text-xs font-bold">Product</TableHead>
                                    <TableHead className="text-xs font-bold text-right">Inspected</TableHead>
                                    <TableHead className="text-xs font-bold text-right">Passed</TableHead>
                                    <TableHead className="text-xs font-bold text-right">Rejected</TableHead>
                                    <TableHead className="text-xs font-bold">Defect Reason</TableHead>
                                    <TableHead className="text-xs font-bold">Rework JO Linked</TableHead>
                                    <TableHead className="text-xs font-bold">Status</TableHead>
                                    <TableHead className="text-xs font-bold">Remarks</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredLogs.map(log => {
                                    const is100Pass = Number(log.rejected_quantity) === 0;
                                    const hasRejection = Number(log.rejected_quantity) > 0;

                                    return (
                                        <TableRow key={log.id} className="hover:bg-muted/30 transition-colors">
                                            {/* ID & Date */}
                                            <TableCell className="font-mono text-xs">
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-foreground">#{log.id}</span>
                                                    <span className="text-[10px] text-muted-foreground">
                                                        {log.inspected_at ? new Date(log.inspected_at).toLocaleDateString() : "N/A"}
                                                    </span>
                                                </div>
                                            </TableCell>

                                            {/* JO No */}
                                            <TableCell className="font-mono font-bold text-xs text-foreground">
                                                {log.job_order_no || `JO-${log.job_order_id}`}
                                            </TableCell>

                                            {/* Product */}
                                            <TableCell className="text-xs font-medium max-w-[160px] truncate" title={log.product_name || "Finished Good"}>
                                                {log.product_name || "Finished Good"}
                                            </TableCell>

                                            {/* Inspected Qty */}
                                            <TableCell className="text-right font-mono text-xs font-semibold">
                                                {Number(log.inspected_quantity).toLocaleString()}
                                            </TableCell>

                                            {/* Passed Qty */}
                                            <TableCell className="text-right font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">
                                                {Number(log.passed_quantity).toLocaleString()}
                                            </TableCell>

                                            {/* Rejected Qty */}
                                            <TableCell className="text-right font-mono text-xs font-bold">
                                                {hasRejection ? (
                                                    <span className="text-destructive">
                                                        {Number(log.rejected_quantity).toLocaleString()}
                                                    </span>
                                                ) : (
                                                    <span className="text-muted-foreground">0</span>
                                                )}
                                            </TableCell>

                                            {/* Rejection Reason */}
                                            <TableCell className="text-xs">
                                                {hasRejection && (log.rejection_reason_name || log.rejection_reason_code) ? (
                                                    <div className="flex items-center gap-1.5">
                                                        <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 text-[10px] px-1 py-0 font-mono">
                                                            {log.rejection_reason_code || "DEFECT"}
                                                        </Badge>
                                                            <span className="text-foreground font-medium text-sm truncate max-w-[140px]" title={log.rejection_reason_name || ""}>
                                                            {log.rejection_reason_name}
                                                        </span>
                                                    </div>
                                                ) : is100Pass ? (
                                                    <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                                                        <CheckCircle2 className="h-3 w-3" /> None (Passed)
                                                    </span>
                                                ) : (
                                                    <span className="text-muted-foreground">-</span>
                                                )}
                                            </TableCell>

                                            {/* Rework JO Linked */}
                                            <TableCell className="font-mono text-xs">
                                                {log.rework_job_order_no || log.rework_job_order_id ? (
                                                    <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[10px] gap-1 font-bold">
                                                        <RotateCcw className="h-2.5 w-2.5" />
                                                        {log.rework_job_order_no || `JO-RWK #${log.rework_job_order_id}`}
                                                    </Badge>
                                                ) : (
                                                    <span className="text-muted-foreground text-[11px]">N/A</span>
                                                )}
                                            </TableCell>

                                            {/* Status Badge */}
                                            <TableCell>
                                                <Badge
                                                    variant={is100Pass ? "default" : "destructive"}
                                                    className={`text-[10px] font-bold uppercase ${
                                                        is100Pass ? "bg-emerald-600 text-white" : ""
                                                    }`}
                                                >
                                                    {log.status || (is100Pass ? "PASSED" : "REWORK_TRIGGERED")}
                                                </Badge>
                                            </TableCell>

                                            {/* Remarks */}
                                            <TableCell className="text-xs text-muted-foreground max-w-[180px] truncate" title={log.remarks || ""}>
                                                {log.remarks || "-"}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                        )}
                        cards={(
                            <div className="space-y-3 p-3">
                                {filteredLogs.map(renderLogCard)}
                            </div>
                        )}
                        minTableWidth="extraWide"
                    />
                )}
            </CardContent>
        </Card>
    );
}
