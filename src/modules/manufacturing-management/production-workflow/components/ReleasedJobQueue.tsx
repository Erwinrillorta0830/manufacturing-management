/* eslint-disable */
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { AlertCircle, Building2, ChevronDown, CornerDownRight, ExternalLink, Play, RefreshCw, Search, SlidersHorizontal } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TerminalQueueJobOrder } from "../types";
import { isJobOrderStatus, JOB_ORDER_STATUS } from "../../job-order-status";
import { resolveJobOrderJourney } from "../../shared/job-order-journey";
import { JobOrderJourneyBar } from "../../shared/components/JobOrderJourneyBar";
import { JobOrderStatusBadge } from "../../shared/components/JobOrderStatusBadge";
import { SearchableSelect } from "../../planning-engineering/components/SearchableSelect";
import { calculatePipelinedLineDurationHours } from "../../planning-engineering/utils/production-timing";
import { formatPhtDate } from "../../shared/pht-date";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { getQueueDueDateCue, getQueueReadinessCue } from "../utils/queue-row-cues";

interface ReleasedJobQueueProps {
    filteredJobOrders: TerminalQueueJobOrder[];
    selectedJobOrderId: string;
    setSelectedJobOrderId: (id: string) => void;
    searchQuery: string;
    setSearchQuery: (q: string) => void;
    loadingJobs: boolean;
    refreshingJobs: boolean;
    branches: any[];
    selectedBranchFilter: string;
    setSelectedBranchFilter: (b: string) => void;
    productFilter: string;
    setProductFilter: (productId: string) => void;
    productOptions: { value: string; label: string }[];
    customerFilter: string;
    setCustomerFilter: (customerCode: string) => void;
    customerOptions: { value: string; label: string }[];
    statusFilter: string;
    setStatusFilter: (status: string) => void;
    statusOptions: { value: string; label: string }[];
    hasActiveFilters: boolean;
    onClearFilters?: () => void;
}

function StepProgressBar({ completedSteps, totalSteps }: { completedSteps: number; totalSteps: number }) {
    const segmentCount = Math.max(totalSteps, 1);
    const progressLabel = `${completedSteps} of ${totalSteps} routing steps completed`;

    return (
        <div className="mt-2 flex items-center gap-2" aria-label={progressLabel}>
            <div
                className="flex min-w-0 flex-1 items-center gap-1"
                role="progressbar"
                aria-label={progressLabel}
                aria-valuemin={0}
                aria-valuemax={Math.max(totalSteps, 1)}
                aria-valuenow={completedSteps}
                aria-valuetext={progressLabel}
            >
                {Array.from({ length: segmentCount }, (_, index) => (
                    <span
                        key={index}
                        aria-hidden="true"
                        className={`h-1.5 min-w-0 flex-1 rounded-full transition-colors ${
                            totalSteps > 0 && index < completedSteps ? "bg-primary" : "bg-muted"
                        }`}
                    />
                ))}
            </div>
            <span className="shrink-0 whitespace-nowrap text-xs font-semibold text-muted-foreground">
                {completedSteps}/{totalSteps} Steps
            </span>
        </div>
    );
}

interface ReleasedJobQueueRowProps {
    jo: TerminalQueueJobOrder;
    isSelected: boolean;
    setSelectedJobOrderId: (id: string) => void;
}

function getQueueJobOrderSummary(jo: TerminalQueueJobOrder) {
    const producedQty = jo.producedQty ?? jo.completed_quantity ?? jo.productionOutputQuantity ?? 0;
    const routeTasks = jo.routing_tasks?.length
        ? jo.routing_tasks
        : jo.routingTasks || [];
    const workstationEntries: Array<{ key: string; stepNumber: number | null; name: string }> = [...routeTasks]
        .sort((left, right) => left.sequence_order - right.sequence_order)
        .map((task, index) => ({
            key: `${task.id || task.jo_route_id || index}-${task.sequence_order}`,
            stepNumber: task.sequence_order || index + 1,
            name: task.work_center?.work_center_name
                || task.work_center_name
                || (task.work_center_id ? `Work Center #${task.work_center_id}` : "Unassigned")
        }));
    if (workstationEntries.length === 0) {
        workstationEntries.push({
            key: `${jo.jo_id}-primary-workstation`,
            stepNumber: null,
            name: jo.primary_work_center_name
                || (jo.primary_work_center_id ? `WC #${jo.primary_work_center_id}` : "Unassigned")
        });
    }

    const routingTasks = jo.routing_tasks || jo.routingTasks || [];
    return {
        producedQty,
        workstationEntries,
        totalSteps: routingTasks.length,
        completedSteps: routingTasks.filter(
            (task) => String(task.status || "").trim().toLowerCase() === "completed"
        ).length,
        totalHours: calculatePipelinedLineDurationHours(routingTasks),
        journey: resolveJobOrderJourney({
            status: jo.status,
            allMaterialsStaged: isJobOrderStatus(jo.status, JOB_ORDER_STATUS.PICKED) ? undefined : false
        })
    };
}

function QueueDueDateValue({ dueDate, status }: { dueDate: string | null; status: string }) {
    if (!dueDate) return <span className="text-muted-foreground">—</span>;

    const isNoLongerActive = isJobOrderStatus(status, JOB_ORDER_STATUS.CLOSED, JOB_ORDER_STATUS.CANCELLED);
    const cue = isNoLongerActive ? null : getQueueDueDateCue(dueDate);
    const cueClassName = cue?.urgency === "overdue"
        ? "border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
        : cue?.urgency === "today"
            ? "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-300"
            : "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300";

    return (
        <div className="flex min-w-0 flex-col items-start gap-1">
            <span>{formatPhtDate(dueDate)}</span>
            {cue && (
                <Badge variant="outline" className={`gap-1 whitespace-nowrap text-[10px] font-semibold ${cueClassName}`}>
                    <AlertCircle className="h-3 w-3" aria-hidden="true" />
                    {cue.label}
                </Badge>
            )}
        </div>
    );
}

function QueueReadinessText({ jo, journey }: { jo: TerminalQueueJobOrder; journey: ReturnType<typeof resolveJobOrderJourney> }) {
    const cue = getQueueReadinessCue(jo.status, journey);
    if (!cue) return null;

    const cueClassName = cue.kind === "blocked"
        ? "text-red-700 dark:text-red-400"
        : cue.kind === "ready"
            ? "text-emerald-700 dark:text-emerald-400"
            : "text-muted-foreground";

    return (
        <p className={`mt-2 flex items-start gap-1.5 text-xs font-semibold ${cueClassName}`}>
            {cue.kind === "blocked" && <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
            <span>{cue.label}</span>
        </p>
    );
}

function QueueJobOrderAction({
    jo,
    setSelectedJobOrderId,
    fullWidth = false
}: {
    jo: TerminalQueueJobOrder;
    setSelectedJobOrderId: (id: string) => void;
    fullWidth?: boolean;
}) {
    const isForPicking = isJobOrderStatus(jo.status, JOB_ORDER_STATUS.FOR_PICKING);
    const isPicked = isJobOrderStatus(jo.status, JOB_ORDER_STATUS.PICKED);
    const isInProduction = isJobOrderStatus(jo.status, JOB_ORDER_STATUS.IN_PRODUCTION);
    const isOnHold = isJobOrderStatus(jo.status, JOB_ORDER_STATUS.ON_HOLD, JOB_ORDER_STATUS.QA_HOLD);

    return (
        <Button
            type="button"
            size="sm"
            onClick={() => setSelectedJobOrderId(jo.jo_id)}
            className={`${isPicked
                ? "h-9 bg-primary px-3 text-xs font-bold text-primary-foreground hover:bg-primary/90"
                : "h-9 px-3 text-xs font-bold"} ${fullWidth ? "w-full" : ""}`}
        >
            {isPicked ? <Play className="mr-1.5 h-3.5 w-3.5" /> : <ExternalLink className="mr-1.5 h-3.5 w-3.5" />}
            {isForPicking ? "Review Materials" : isPicked ? "Start Production" : isInProduction ? "Open Terminal" : isOnHold ? "Review Hold" : "Open Terminal"}
        </Button>
    );
}

const ReleasedJobQueueRow = React.memo(function ReleasedJobQueueRow({
    jo,
    isSelected,
    setSelectedJobOrderId,
}: ReleasedJobQueueRowProps) {
    const rowSummary = useMemo(() => getQueueJobOrderSummary(jo), [jo]);

    return (
        <tr
            className={isSelected ? "bg-primary/[0.06]" : "bg-card hover:bg-muted/20"}
        >
            <td className="px-3 py-3 align-top">
                <div className="flex items-start gap-2">
                    {jo.parent_job_order_no && <CornerDownRight className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
                    <div className="min-w-0">
                        <div className="font-sans text-sm font-bold tracking-tight">{jo.jo_id}</div>
                        {jo.parent_job_order_no && (
                            <div className="mt-1 text-xs font-semibold text-primary/80">
                                Sub-assembly of {jo.parent_job_order_no}
                            </div>
                        )}
                        <div className="mt-2">
                            <JobOrderStatusBadge status={jo.status} className="font-sans text-xs" />
                        </div>
                    </div>
                </div>
            </td>
            <td className="max-w-[300px] px-3 py-3 align-top">
                <div className="font-semibold text-sm text-foreground truncate" title={jo.product_name}>
                    {jo.product_name}
                </div>
                {jo.version_name && (
                    <div className="mt-1 font-sans text-xs font-bold text-primary">Recipe: {jo.version_name}</div>
                )}
                <StepProgressBar completedSteps={rowSummary.completedSteps} totalSteps={rowSummary.totalSteps} />
                <JobOrderJourneyBar journey={rowSummary.journey} compact className="mt-2" />
                <QueueReadinessText jo={jo} journey={rowSummary.journey} />
            </td>
            <td className="whitespace-nowrap px-3 py-3 text-right align-top">
                <div className="font-sans text-sm font-bold text-foreground">
                    {Number(jo.quantity || 0).toLocaleString()}
                    <span className="mx-1 font-normal text-muted-foreground">/</span>
                    <span className="text-emerald-600 dark:text-emerald-400">{Number(rowSummary.producedQty || 0).toLocaleString()}</span>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                    {rowSummary.totalHours.toFixed(1)} line hrs
                </div>
            </td>
            <td className="px-3 py-3 align-top">
                <div className="flex items-start gap-1.5 text-sm font-semibold">
                    <Building2 className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${rowSummary.workstationEntries.every((entry) => entry.name === "Unassigned") ? "text-amber-600 dark:text-amber-400" : "text-primary"}`} />
                    <div className="min-w-0 space-y-1">
                        {rowSummary.workstationEntries.map((entry) => (
                            <div key={entry.key} title={entry.stepNumber ? `Step ${entry.stepNumber}: ${entry.name}` : entry.name}>
                                {entry.stepNumber && (
                                    <span className="mr-1 text-[10px] font-medium text-muted-foreground">
                                        Step {entry.stepNumber}:
                                    </span>
                                )}
                                <span>{entry.name}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </td>
            <td className="px-3 py-3 align-top text-sm font-semibold text-foreground">
                <QueueDueDateValue dueDate={jo.due_date} status={jo.status} />
            </td>
            <td className="px-3 py-3 text-right align-top">
                <QueueJobOrderAction jo={jo} setSelectedJobOrderId={setSelectedJobOrderId} />
            </td>
        </tr>
    );
});

const ReleasedJobQueueCard = React.memo(function ReleasedJobQueueCard({
    jo,
    isSelected,
    setSelectedJobOrderId
}: ReleasedJobQueueRowProps) {
    const rowSummary = useMemo(() => getQueueJobOrderSummary(jo), [jo]);
    const allWorkstationsUnassigned = rowSummary.workstationEntries.every((entry) => entry.name === "Unassigned");

    return (
        <article className={`min-w-0 rounded-lg border p-3 ${isSelected ? "border-primary bg-primary/[0.06]" : "border-border/60 bg-card"}`}>
            <div className="flex min-w-0 items-start justify-between gap-2">
                <div className="flex min-w-0 items-start gap-2">
                    {jo.parent_job_order_no && <CornerDownRight className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
                    <div className="min-w-0">
                        <h3 className="break-words text-sm font-bold tracking-tight">{jo.jo_id}</h3>
                        {jo.parent_job_order_no && (
                            <p className="mt-1 break-words text-xs font-semibold text-primary/80">
                                Sub-assembly of {jo.parent_job_order_no}
                            </p>
                        )}
                    </div>
                </div>
                <JobOrderStatusBadge status={jo.status} className="shrink-0 font-sans text-xs" />
            </div>

            <div className="mt-3 min-w-0 border-t border-border/60 pt-3">
                <p className="break-words text-sm font-semibold text-foreground">{jo.product_name}</p>
                {jo.version_name && (
                    <p className="mt-1 break-words text-xs font-bold text-primary">Recipe: {jo.version_name}</p>
                )}
                <StepProgressBar completedSteps={rowSummary.completedSteps} totalSteps={rowSummary.totalSteps} />
                <JobOrderJourneyBar journey={rowSummary.journey} compact className="mt-2" />
                <QueueReadinessText jo={jo} journey={rowSummary.journey} />
            </div>

            <dl className="mt-3 grid min-w-0 grid-cols-2 gap-x-3 gap-y-3 border-t border-border/60 pt-3 text-xs">
                <div className="min-w-0">
                    <dt className="text-muted-foreground">Target / Produced</dt>
                    <dd className="mt-1 break-words font-bold text-foreground">
                        {Number(jo.quantity || 0).toLocaleString()}
                        <span className="mx-1 font-normal text-muted-foreground">/</span>
                        <span className="text-emerald-600 dark:text-emerald-400">
                            {Number(rowSummary.producedQty || 0).toLocaleString()}
                        </span>
                    </dd>
                </div>
                <div className="min-w-0">
                    <dt className="text-muted-foreground">Line duration</dt>
                    <dd className="mt-1 font-semibold text-foreground">{rowSummary.totalHours.toFixed(1)} hrs</dd>
                </div>
                <div className="col-span-2 min-w-0">
                    <dt className="text-muted-foreground">Workstations</dt>
                    <dd className="mt-1 flex min-w-0 items-start gap-1.5 font-semibold text-foreground">
                        <Building2 className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${allWorkstationsUnassigned ? "text-amber-600 dark:text-amber-400" : "text-primary"}`} />
                        <span className="min-w-0 break-words">
                            {rowSummary.workstationEntries.map((entry, index) => (
                                <React.Fragment key={entry.key}>
                                    {index > 0 && <span className="text-muted-foreground"> · </span>}
                                    {entry.stepNumber && (
                                        <span className="text-[10px] font-medium text-muted-foreground">Step {entry.stepNumber}: </span>
                                    )}
                                    <span>{entry.name}</span>
                                </React.Fragment>
                            ))}
                        </span>
                    </dd>
                </div>
                <div className="col-span-2 min-w-0">
                    <dt className="text-muted-foreground">Due</dt>
                    <dd className="mt-1 break-words text-sm font-semibold text-foreground">
                        <QueueDueDateValue dueDate={jo.due_date} status={jo.status} />
                    </dd>
                </div>
            </dl>

            <div className="mt-3 border-t border-border/60 pt-3">
                <QueueJobOrderAction jo={jo} setSelectedJobOrderId={setSelectedJobOrderId} fullWidth />
            </div>
        </article>
    );
});

export const ReleasedJobQueue = React.memo(function ReleasedJobQueue({
    filteredJobOrders,
    selectedJobOrderId,
    setSelectedJobOrderId,
    searchQuery,
    setSearchQuery,
    loadingJobs,
    refreshingJobs,
    branches,
    selectedBranchFilter,
    setSelectedBranchFilter,
    productFilter,
    setProductFilter,
    productOptions,
    customerFilter,
    setCustomerFilter,
    customerOptions,
    statusFilter,
    setStatusFilter,
    statusOptions,
    hasActiveFilters,
    onClearFilters
}: ReleasedJobQueueProps) {
    const [pageIndex, setPageIndex] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false);

    useEffect(() => {
        setPageIndex(1);
    }, [searchQuery, selectedBranchFilter, productFilter, customerFilter, statusFilter, filteredJobOrders]);

    const pageCount = Math.ceil(filteredJobOrders.length / pageSize);
    const visiblePageIndex = Math.min(pageIndex, Math.max(pageCount, 1));
    const pageJobOrders = filteredJobOrders.slice(
        (visiblePageIndex - 1) * pageSize,
        visiblePageIndex * pageSize
    );
    const activeFilterCount = [
        searchQuery.trim().length > 0,
        productFilter !== "All",
        customerFilter !== "All",
        statusFilter !== "All",
        selectedBranchFilter !== "All"
    ].filter(Boolean).length;

    const renderProductFilter = (compact = false) => (
        <div className={compact ? "w-full min-w-0" : "w-[190px] min-w-0 shrink-0"}>
            <SearchableSelect
                options={[{ value: "All", label: "All Products" }, ...productOptions]}
                value={productFilter}
                onValueChange={setProductFilter}
                placeholder="All Products"
                className="h-9 text-sm"
            />
        </div>
    );

    const renderCustomerFilter = (compact = false) => (
        <div className={compact ? "w-full min-w-0" : "w-[200px] min-w-0 shrink-0"}>
            <SearchableSelect
                options={[{ value: "All", label: "All Customers" }, ...customerOptions]}
                value={customerFilter}
                onValueChange={setCustomerFilter}
                placeholder="All Customers"
                className="h-9 text-sm"
            />
        </div>
    );

    const renderBranchFilter = (compact = false) => (
        <select
            id={compact ? "branchFilterCompact" : "branchFilter"}
            aria-label="Branch filter"
            className={`flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 ${compact ? "w-full" : "w-[170px] shrink-0"}`}
            value={selectedBranchFilter}
            onChange={(event) => setSelectedBranchFilter(event.target.value)}
        >
            <option value="All">All Branches</option>
            {branches.map((branch, index) => {
                const branchId = branch.id || branch.branch_id || index;
                return (
                    <option key={`${branchId}_${index}`} value={branchId}>
                        {branch.branch_name}
                    </option>
                );
            })}
        </select>
    );

    const renderResetFilters = (compact = false) => onClearFilters && (
        <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClearFilters}
            className={`h-9 shrink-0 text-sm text-muted-foreground hover:text-foreground ${compact ? "w-full justify-center" : ""}`}
            disabled={!hasActiveFilters}
        >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Reset Filters
        </Button>
    );

    const renderQueueRow = (jo: TerminalQueueJobOrder) => (
        <ReleasedJobQueueRow
            key={jo.jo_id}
            jo={jo}
            isSelected={jo.jo_id === selectedJobOrderId}
            setSelectedJobOrderId={setSelectedJobOrderId}
        />
    );

    return (
        <Card className="h-full overflow-hidden font-sans">
            <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between gap-2 text-lg">
                    <span>Production Job Order Queue</span>
                    <span className="flex shrink-0 items-center gap-2">
                        {refreshingJobs && (
                            <span role="status" aria-live="polite" className="inline-flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
                                <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                                Updating queue…
                            </span>
                        )}
                        <Badge variant="outline" className="font-mono">
                            {filteredJobOrders.length}
                        </Badge>
                    </span>
                </CardTitle>
                <CardDescription className="text-sm">
                    Review staged materials and start production when ready, continue active runs, or review held Job Orders.
                </CardDescription>
            </CardHeader>

            <CardContent className="@container/jo-queue space-y-4">
                <div className="flex flex-col gap-2 @min-[66.25rem]/jo-queue:flex-row @min-[66.25rem]/jo-queue:items-center">
                    <div className="relative min-w-0 flex-1">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search Job No or Product..."
                            className="h-9 pl-8 text-sm"
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                        />
                    </div>

                    <div className="w-full min-w-0 @min-[66.25rem]/jo-queue:w-[200px] @min-[66.25rem]/jo-queue:shrink-0">
                        <SearchableSelect
                            options={[{ value: "All", label: "All Statuses" }, ...statusOptions]}
                            value={statusFilter}
                            onValueChange={setStatusFilter}
                            placeholder="All Statuses"
                            className="h-9 text-sm"
                        />
                    </div>

                    <div className="hidden min-w-0 flex-col gap-2 @min-[66.25rem]/jo-queue:flex @min-[66.25rem]/jo-queue:flex-row">
                        {renderProductFilter()}
                        {renderCustomerFilter()}
                        {renderBranchFilter()}
                        {renderResetFilters()}
                    </div>

                    <div className="@min-[66.25rem]/jo-queue:hidden">
                        <Collapsible open={advancedFiltersOpen} onOpenChange={setAdvancedFiltersOpen}>
                            <div>
                                <CollapsibleTrigger asChild>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="h-9 w-full justify-between text-sm"
                                        aria-label={`More filters, ${activeFilterCount} active ${activeFilterCount === 1 ? "filter" : "filters"}`}
                                    >
                                        <span className="inline-flex items-center gap-2">
                                            <SlidersHorizontal className="h-4 w-4" /> More filters
                                        </span>
                                        <span className="inline-flex items-center gap-2">
                                            <Badge variant="secondary" aria-hidden="true">{activeFilterCount}</Badge>
                                            <ChevronDown className={`h-4 w-4 transition-transform ${advancedFiltersOpen ? "rotate-180" : ""}`} />
                                        </span>
                                    </Button>
                                </CollapsibleTrigger>
                                <CollapsibleContent className="space-y-2 pt-2">
                                    {renderProductFilter(true)}
                                    {renderCustomerFilter(true)}
                                    {renderBranchFilter(true)}
                                    {renderResetFilters(true)}
                                </CollapsibleContent>
                            </div>
                        </Collapsible>
                    </div>
                </div>

                {loadingJobs ? (
                    <div role="status" aria-label="Loading shop-floor Job Orders" className="overflow-hidden rounded-xl border border-border/60">
                        <span className="sr-only">Loading shop-floor Job Orders…</span>
                        <div className="hidden overflow-x-auto @min-[66.25rem]/jo-queue:block" aria-hidden="true">
                            <table className="w-full min-w-[1060px] border-collapse text-left">
                                <thead className="bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground">
                                    <tr>
                                        <th className="px-3 py-3 font-bold">Job Order</th>
                                        <th className="px-3 py-3 font-bold">Product / Journey</th>
                                        <th className="px-3 py-3 text-right font-bold">Target / Produced</th>
                                        <th className="px-3 py-3 font-bold">Workstations</th>
                                        <th className="px-3 py-3 font-bold">Due</th>
                                        <th className="px-3 py-3 text-right font-bold">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/50">
                                    {Array.from({ length: 5 }, (_, index) => (
                                        <tr key={index}>
                                            <td className="px-3 py-4">
                                                <Skeleton className="h-4 w-32" />
                                                <Skeleton className="mt-2 h-3 w-20" />
                                            </td>
                                            <td className="px-3 py-4">
                                                <Skeleton className="h-4 w-40" />
                                                <Skeleton className="mt-2 h-3 w-28" />
                                            </td>
                                            <td className="px-3 py-4">
                                                <div className="flex flex-col items-end gap-2">
                                                    <Skeleton className="h-4 w-16" />
                                                    <Skeleton className="h-3 w-12" />
                                                </div>
                                            </td>
                                            <td className="px-3 py-4">
                                                <Skeleton className="h-5 w-24" />
                                                <Skeleton className="mt-2 h-5 w-20" />
                                            </td>
                                            <td className="px-3 py-4">
                                                <Skeleton className="h-4 w-24" />
                                            </td>
                                            <td className="px-3 py-4">
                                                <div className="flex justify-end">
                                                    <Skeleton className="h-8 w-24" />
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="space-y-3 p-3 @min-[66.25rem]/jo-queue:hidden" aria-hidden="true">
                            {Array.from({ length: 5 }, (_, index) => (
                                <div key={index} className="space-y-3 rounded-lg border border-border/60 p-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0 flex-1">
                                            <Skeleton className="h-4 w-36 max-w-full" />
                                            <Skeleton className="mt-2 h-3 w-24 max-w-full" />
                                        </div>
                                        <Skeleton className="h-5 w-20 shrink-0" />
                                    </div>
                                    <Skeleton className="h-4 w-40 max-w-full" />
                                    <Skeleton className="h-2 w-full" />
                                    <div className="grid grid-cols-2 gap-3 border-t border-border/60 pt-3">
                                        <Skeleton className="h-8 w-full" />
                                        <Skeleton className="h-8 w-full" />
                                        <Skeleton className="col-span-2 h-8 w-full" />
                                    </div>
                                    <Skeleton className="h-9 w-full" />
                                </div>
                            ))}
                        </div>
                    </div>
                ) : filteredJobOrders.length === 0 ? (
                    <div className="border-2 border-dashed rounded-lg py-12 text-center text-sm text-muted-foreground">
                        <AlertCircle className="mx-auto mb-2 h-8 w-8 text-muted-foreground/60" />
                        <p>No matching shop-floor Job Orders found.</p>
                        <p className="mt-1 text-xs">Try different filters or reset them.</p>
                    </div>
                ) : (
                    <div className="overflow-hidden rounded-xl border border-border/60">
                        <div className="hidden overflow-x-auto @min-[66.25rem]/jo-queue:block">
                            <table className="w-full min-w-[1060px] border-collapse text-left">
                                <thead className="bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground">
                                    <tr>
                                        <th className="px-3 py-3 font-bold">Job Order</th>
                                        <th className="px-3 py-3 font-bold">Product / Journey</th>
                                        <th className="whitespace-nowrap px-3 py-3 text-right font-bold">Target / Produced</th>
                                        <th className="px-3 py-3 font-bold">Workstations</th>
                                        <th className="px-3 py-3 font-bold">Due</th>
                                        <th className="px-3 py-3 text-right font-bold">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/50">
                                    {pageJobOrders.map((jo) => renderQueueRow(jo))}
                                </tbody>
                            </table>
                        </div>
                        <div className="space-y-3 p-3 @min-[66.25rem]/jo-queue:hidden">
                            {pageJobOrders.map((jo) => (
                                <ReleasedJobQueueCard
                                    key={jo.jo_id}
                                    jo={jo}
                                    isSelected={jo.jo_id === selectedJobOrderId}
                                    setSelectedJobOrderId={setSelectedJobOrderId}
                                />
                            ))}
                        </div>
                        <div className="border-t border-border/60 p-3">
                            <DataTablePagination
                                pageIndex={visiblePageIndex}
                                pageSize={pageSize}
                                rowCount={filteredJobOrders.length}
                                onPageChange={setPageIndex}
                                onPageSizeChange={(size) => {
                                    setPageSize(size);
                                    setPageIndex(1);
                                }}
                            />
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
});
