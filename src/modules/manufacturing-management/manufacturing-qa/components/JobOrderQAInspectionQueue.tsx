"use client";

import React, { useState, useMemo } from "react";
import { 
    ClipboardCheck, 
    Search, 
    RefreshCw, 
    CheckCircle2, 
    RotateCcw, 
    AlertTriangle, 
    History, 
    Sparkles, 
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
import { JobOrder } from "../types";
import { ResponsiveDataView } from "./ResponsiveDataView";

interface JobOrderQAInspectionQueueProps {
    jobOrders: JobOrder[];
    loadingJobOrders: boolean;
    getBranchName: (branchId?: number | null) => string;
    onOpenQAInspectionModal: (jo: JobOrder) => void;
    onOpenStatusHistoryModal?: (jo: JobOrder) => void;
    onRefresh: () => void;
    onFiltersChange?: (filters: { search: string; status: string; type: "all" | "standard" | "rework"; branch: string }) => void;
}

export function JobOrderQAInspectionQueue({
    jobOrders,
    loadingJobOrders,
    getBranchName,
    onOpenQAInspectionModal,
    onOpenStatusHistoryModal,
    onRefresh,
    onFiltersChange
}: JobOrderQAInspectionQueueProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [branchFilter, setBranchFilter] = useState("all");
    const [typeFilter, setTypeFilter] = useState<"all" | "standard" | "rework">("all");

    // Metrics calculation
    const metrics = useMemo(() => {
        let awaitingQA = 0;
        let completedRuns = 0;
        let reworkOrders = 0;
        let totalRejectedUnits = 0;
        let totalCompletedUnits = 0;

        jobOrders.forEach(jo => {
            const status = (jo.status || "").toUpperCase();
            const isRework = (jo.job_order_no || jo.jo_id || "").includes("-RWK-") || Number(jo.parent_job_order_id) > 0;
            
            if (isRework) reworkOrders++;
            if (status === "COMPLETED" || status === "FINISHED") {
                completedRuns++;
            } else if (status !== "CANCELLED") {
                awaitingQA++;
            }

            totalRejectedUnits += Number(jo.rejected_quantity || 0);
            totalCompletedUnits += Number(jo.completed_quantity || jo.actual_quantity_produced || 0);
        });

        return {
            awaitingQA,
            completedRuns,
            reworkOrders,
            totalRejectedUnits,
            totalCompletedUnits
        };
    }, [jobOrders]);

    // Unique Branches
    const branches = useMemo(() => {
        const map = new Map<number, string>();
        jobOrders.forEach(jo => {
            if (jo.branch_id) {
                map.set(Number(jo.branch_id), getBranchName(jo.branch_id));
            }
        });
        return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
    }, [jobOrders, getBranchName]);

    // Filtered Job Orders
    const filteredJOs = useMemo(() => {
        return jobOrders.filter(jo => {
            const joNo = (jo.job_order_no || jo.jo_id || "").toLowerCase();
            const prodName = (jo.product_name || "").toLowerCase();
            const q = searchQuery.toLowerCase().trim();

            const matchesSearch = !q || joNo.includes(q) || prodName.includes(q);

            const isRework = joNo.includes("-rwk-") || Number(jo.parent_job_order_id) > 0;
            const matchesType = typeFilter === "all" || 
                (typeFilter === "rework" && isRework) || 
                (typeFilter === "standard" && !isRework);

            const status = (jo.status || "").toUpperCase();
            let matchesStatus = true;
            if (statusFilter === "awaiting") {
                matchesStatus = status !== "COMPLETED" && status !== "FINISHED" && status !== "CANCELLED";
            } else if (statusFilter === "completed") {
                matchesStatus = status === "COMPLETED" || status === "FINISHED";
            } else if (statusFilter === "on_hold") {
                matchesStatus = status === "ON HOLD" || status === "QA HOLD";
            }

            const matchesBranch = branchFilter === "all" || String(jo.branch_id) === String(branchFilter);

            return matchesSearch && matchesType && matchesStatus && matchesBranch;
        });
    }, [jobOrders, searchQuery, typeFilter, statusFilter, branchFilter]);

    const filtersActive = searchQuery.length > 0 || statusFilter !== "all" || typeFilter !== "all" || branchFilter !== "all";
    const clearFilters = () => {
        setSearchQuery("");
        setStatusFilter("all");
        setBranchFilter("all");
        setTypeFilter("all");
        onFiltersChange?.({ search: "", status: "all", type: "all", branch: "all" });
    };

    const renderCard = (jo: JobOrder) => {
        const joNo = jo.job_order_no || jo.jo_id || "";
        const isRework = joNo.includes("-RWK-") || Number(jo.parent_job_order_id) > 0;
        const targetQty = Number(jo.target_quantity || jo.quantity || 0);
        const passedQty = Number(jo.completed_quantity || jo.actual_quantity_produced || 0);
        const rejectedQty = Number(jo.rejected_quantity || 0);
        const isCompleted = (jo.status || "").toUpperCase() === "COMPLETED";

        return (
            <Card key={jo.job_order_id || jo.jo_id} className="border p-4 shadow-xs">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-base font-bold text-foreground">{joNo}</span>
                            {isRework && <Badge variant="outline" className="min-h-7 gap-1 text-sm"><RotateCcw className="h-3.5 w-3.5" />Rework</Badge>}
                        </div>
                        <p className="mt-1 truncate text-sm font-semibold text-foreground">{jo.product_name}</p>
                        {jo.product_code && <p className="font-mono text-sm text-muted-foreground">{jo.product_code}</p>}
                    </div>
                    <Badge variant={isCompleted ? "default" : jo.status === "On Hold" ? "destructive" : "outline"} className="min-h-7 text-sm">{jo.status}</Badge>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                    <div><dt className="text-muted-foreground">Target</dt><dd className="font-mono font-semibold">{targetQty.toLocaleString()}</dd></div>
                    <div><dt className="text-muted-foreground">Passed</dt><dd className="font-mono font-semibold text-emerald-600">{passedQty.toLocaleString()}</dd></div>
                    <div><dt className="text-muted-foreground">Rejected</dt><dd className="font-mono font-semibold text-destructive">{rejectedQty.toLocaleString()}</dd></div>
                    <div><dt className="text-muted-foreground">Branch</dt><dd className="truncate font-semibold">{getBranchName(jo.branch_id)}</dd></div>
                </dl>
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                    {onOpenStatusHistoryModal && <Button variant="outline" className="min-h-11 gap-2" onClick={() => onOpenStatusHistoryModal(jo)}><History className="h-4 w-4" />History</Button>}
                    <Button variant={isCompleted ? "outline" : "default"} className="min-h-11 gap-2" onClick={() => onOpenQAInspectionModal(jo)}><ClipboardCheck className="h-4 w-4" />{isCompleted ? "Re-Inspect" : "2-Point QA"}</Button>
                </div>
            </Card>
        );
    };

    return (
        <div className="space-y-5">
            {/* KPI Metric Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="bg-card border shadow-xs hover:border-primary/30 transition-all">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Awaiting QA Entry</p>
                            <h3 className="text-2xl font-black text-foreground mt-0.5">{metrics.awaitingQA}</h3>
                            <span className="text-[10px] text-sky-600 dark:text-sky-400 font-semibold flex items-center gap-1 mt-0.5">
                                Ready for 2-Point QA
                            </span>
                        </div>
                        <div className="h-11 w-11 rounded-xl bg-sky-500/10 text-sky-500 flex items-center justify-center">
                            <ClipboardCheck className="h-5 w-5" />
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-card border shadow-xs hover:border-emerald-500/30 transition-all">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">100% Passed / Completed</p>
                            <h3 className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-0.5">{metrics.completedRuns}</h3>
                            <span className="text-[10px] text-muted-foreground font-semibold mt-0.5 block">
                                {metrics.totalCompletedUnits.toLocaleString()} units released
                            </span>
                        </div>
                        <div className="h-11 w-11 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                            <CheckCircle2 className="h-5 w-5" />
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-card border shadow-xs hover:border-amber-500/30 transition-all">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Active Rework Orders</p>
                            <h3 className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-0.5">{metrics.reworkOrders}</h3>
                            <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1 mt-0.5">
                                JO-RWK Spawns
                            </span>
                        </div>
                        <div className="h-11 w-11 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
                            <RotateCcw className="h-5 w-5" />
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-card border shadow-xs hover:border-rose-500/30 transition-all">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Defect / Scrap Units</p>
                            <h3 className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-0.5">{metrics.totalRejectedUnits.toLocaleString()}</h3>
                            <span className="text-[10px] text-muted-foreground font-semibold mt-0.5 block">
                                Logged in QA records
                            </span>
                        </div>
                        <div className="h-11 w-11 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center">
                            <AlertTriangle className="h-5 w-5" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Main Inspection Queue Table Card */}
            <Card className="border shadow-xs">
                <CardHeader className="p-5 border-b flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <CardTitle className="text-lg font-bold text-foreground flex items-center gap-2">
                            <Sparkles className="h-5 w-5 text-primary" />
                            Job Order QA & Rework Inspection Workcenter
                        </CardTitle>
                        <CardDescription className="text-xs text-muted-foreground mt-0.5">
                            Inspect production runs, audit passed vs rejected quantities, record defect classifications, and trigger automated rework orders.
                        </CardDescription>
                    </div>

                    {/* Filter & Search Bar */}
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="relative w-full sm:w-64">
                            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                            <Input
                                placeholder="Search JO # or product..."
                                value={searchQuery}
                                onChange={e => { const search = e.target.value; setSearchQuery(search); onFiltersChange?.({ search, status: statusFilter, type: typeFilter, branch: branchFilter }); }}
                                className="pl-8 h-11 text-sm"
                            />
                        </div>

                        {/* Status Filter */}
                        <Select value={statusFilter} onValueChange={(value) => { setStatusFilter(value); onFiltersChange?.({ search: searchQuery, status: value, type: typeFilter, branch: branchFilter }); }}>
                            <SelectTrigger className="h-11 text-sm w-36">
                                <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all" className="text-xs">All Statuses</SelectItem>
                                <SelectItem value="awaiting" className="text-xs">Awaiting QA</SelectItem>
                                <SelectItem value="completed" className="text-xs">Completed</SelectItem>
                                <SelectItem value="on_hold" className="text-xs">On Hold</SelectItem>
                            </SelectContent>
                        </Select>

                        {/* Type Filter */}
                        <Select value={typeFilter} onValueChange={(val: string) => { const type = val as "all" | "standard" | "rework"; setTypeFilter(type); onFiltersChange?.({ search: searchQuery, status: statusFilter, type, branch: branchFilter }); }}>
                            <SelectTrigger className="h-11 text-sm w-36">
                                <SelectValue placeholder="Run Type" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all" className="text-xs">All Run Types</SelectItem>
                                <SelectItem value="standard" className="text-xs">Standard JOs</SelectItem>
                                <SelectItem value="rework" className="text-xs">Rework Orders (RWK)</SelectItem>
                            </SelectContent>
                        </Select>

                        {/* Branch Filter */}
                        {branches.length > 1 && (
                            <Select value={branchFilter} onValueChange={(value) => { setBranchFilter(value); onFiltersChange?.({ search: searchQuery, status: statusFilter, type: typeFilter, branch: value }); }}>
                                <SelectTrigger className="h-11 text-sm w-36">
                                    <SelectValue placeholder="Branch" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all" className="text-xs">All Branches</SelectItem>
                                    {branches.map(b => (
                                        <SelectItem key={b.id} value={String(b.id)} className="text-xs">
                                            {b.name}
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
                    {loadingJobOrders ? (
                        <div className="flex flex-col items-center justify-center p-14 text-muted-foreground">
                            <RefreshCw className="h-7 w-7 animate-spin text-muted-foreground/60 mb-2" />
                            <span className="text-xs font-semibold">Loading QA Job Order Queue...</span>
                        </div>
                    ) : filteredJOs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center p-14 text-center">
                            <ShieldCheck className="h-10 w-10 text-emerald-500 mb-2" />
                            <h4 className="text-sm font-bold text-foreground">No Matching Job Orders</h4>
                            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                                No job orders match your active search filters or all production batches have already received QA clearance.
                            </p>
                        </div>
                    ) : (
                        <ResponsiveDataView
                            table={(
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/30">
                                        <TableHead className="text-xs font-bold">Job Order No</TableHead>
                                        <TableHead className="text-xs font-bold">Product</TableHead>
                                        <TableHead className="text-xs font-bold text-right">Target Qty</TableHead>
                                        <TableHead className="text-xs font-bold text-right">Passed Qty</TableHead>
                                        <TableHead className="text-xs font-bold text-right">Rejected Qty</TableHead>
                                        <TableHead className="text-xs font-bold">Branch</TableHead>
                                        <TableHead className="text-xs font-bold">Status</TableHead>
                                        <TableHead className="text-xs font-bold text-right">Action</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredJOs.map(jo => {
                                        const joNo = jo.job_order_no || jo.jo_id || "";
                                        const isRework = joNo.includes("-RWK-") || Number(jo.parent_job_order_id) > 0;
                                        const targetQty = Number(jo.target_quantity || jo.quantity || 0);
                                        const passedQty = Number(jo.completed_quantity || jo.actual_quantity_produced || 0);
                                        const rejectedQty = Number(jo.rejected_quantity || 0);
                                        const isCompleted = (jo.status || "").toUpperCase() === "COMPLETED";

                                        return (
                                            <TableRow key={jo.job_order_id || jo.jo_id} className="hover:bg-muted/30 transition-colors">
                                                {/* Job Order Number & Rework Indicator */}
                                                <TableCell className="font-medium">
                                                    <div className="flex flex-col gap-1">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="font-mono font-bold text-xs text-foreground">
                                                                {joNo}
                                                            </span>
                                                            {isRework && (
                                                                <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[10px] px-1 py-0 font-bold gap-0.5">
                                                                    <RotateCcw className="h-2.5 w-2.5" />
                                                                    Rework
                                                                </Badge>
                                                            )}
                                                        </div>
                                                        {Number(jo.parent_job_order_id) > 0 && (
                                                            <span className="text-[10px] text-muted-foreground font-mono">
                                                                Parent JO: #{jo.parent_job_order_id}
                                                            </span>
                                                        )}
                                                    </div>
                                                </TableCell>

                                                {/* Product Name */}
                                                <TableCell>
                                                    <div className="flex flex-col">
                                                        <span className="text-xs font-bold text-foreground truncate max-w-[200px]" title={jo.product_name}>
                                                            {jo.product_name}
                                                        </span>
                                                        {jo.product_code && (
                                                            <span className="text-[10px] text-muted-foreground font-mono">
                                                                {jo.product_code}
                                                            </span>
                                                        )}
                                                    </div>
                                                </TableCell>

                                                {/* Target Qty */}
                                                <TableCell className="text-right font-mono text-xs font-bold">
                                                    {targetQty.toLocaleString()}
                                                </TableCell>

                                                {/* Passed Qty */}
                                                <TableCell className="text-right font-mono text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                                                    {passedQty > 0 ? passedQty.toLocaleString() : "-"}
                                                </TableCell>

                                                {/* Rejected Qty */}
                                                <TableCell className="text-right font-mono text-xs font-semibold">
                                                    {rejectedQty > 0 ? (
                                                        <Badge variant="destructive" className="font-mono text-[10px] px-1.5 py-0">
                                                            {rejectedQty.toLocaleString()}
                                                        </Badge>
                                                    ) : (
                                                        <span className="text-muted-foreground">-</span>
                                                    )}
                                                </TableCell>

                                                {/* Branch */}
                                                <TableCell>
                                                    <Badge variant="outline" className="text-[10px] font-medium">
                                                        {getBranchName(jo.branch_id)}
                                                    </Badge>
                                                </TableCell>

                                                {/* Status Badge */}
                                                <TableCell>
                                                    <Badge
                                                        variant={
                                                            isCompleted ? "default" :
                                                            jo.status === "Released" ? "secondary" :
                                                            jo.status === "In Progress" || jo.status === "Ongoing" ? "outline" :
                                                            jo.status === "On Hold" ? "destructive" : "outline"
                                                        }
                                                        className={`text-[10px] font-bold ${
                                                            isCompleted ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""
                                                        }`}
                                                    >
                                                        {jo.status}
                                                    </Badge>
                                                </TableCell>

                                                {/* Actions */}
                                                <TableCell className="text-right">
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        {onOpenStatusHistoryModal && (
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => onOpenStatusHistoryModal(jo)}
                                                                className="min-h-11 min-w-11 p-0 text-muted-foreground hover:text-foreground"
                                                                title="View Status Transition History"
                                                                aria-label={`View status transition history for ${joNo}`}
                                                            >
                                                                <History className="h-3.5 w-3.5" />
                                                            </Button>
                                                        )}

                                                        <Button
                                                            variant={isCompleted ? "outline" : "default"}
                                                            size="sm"
                                                            onClick={() => onOpenQAInspectionModal(jo)}
                                                            className={`min-h-11 text-sm font-bold gap-1 shadow-xs transition-all ${
                                                                !isCompleted ? "bg-primary hover:bg-primary/90 text-primary-foreground" : ""
                                                            }`}
                                                        >
                                                            <ClipboardCheck className="h-3.5 w-3.5" />
                                                            {isCompleted ? "Re-Inspect" : "2-Point QA"}
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                            )}
                            cards={(
                                <div className="space-y-3 p-3">
                                    {filteredJOs.map(renderCard)}
                                </div>
                            )}
                        />
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
