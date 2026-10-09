/* eslint-disable */
import { memo, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { AlertCircle, Building2, CornerDownRight, ExternalLink, Play, RefreshCw, Search } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { TerminalQueueJobOrder } from "../types";
import { isJobOrderStatus, JOB_ORDER_STATUS } from "../../job-order-status";
import { resolveJobOrderJourney } from "../../shared/job-order-journey";
import { JobOrderJourneyBar } from "../../shared/components/JobOrderJourneyBar";
import { JobOrderStatusBadge } from "../../shared/components/JobOrderStatusBadge";
import { SearchableSelect } from "../../planning-engineering/components/SearchableSelect";
import { calculatePipelinedLineDurationHours } from "../../planning-engineering/utils/production-timing";
import { formatPhtDate } from "../../shared/pht-date";

interface ReleasedJobQueueProps {
    filteredJobOrders: TerminalQueueJobOrder[];
    jobOrders: TerminalQueueJobOrder[];
    selectedJobOrderId: string;
    setSelectedJobOrderId: (id: string) => void;
    searchQuery: string;
    setSearchQuery: (q: string) => void;
    loadingJobs: boolean;
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

type WorkstationEntry = { key: string; stepNumber: number | null; name: string };

interface ReleasedJobQueueRowSummary {
    producedQty: number;
    workstationEntries: WorkstationEntry[];
    journey: ReturnType<typeof resolveJobOrderJourney>;
    totalSteps: number;
    completedSteps: number;
    totalHours: number;
    isForPicking: boolean;
    isPicked: boolean;
    isInProduction: boolean;
    isOnHold: boolean;
    canOpenTerminal: boolean;
}

function createReleasedJobQueueRowSummary(jo: TerminalQueueJobOrder): ReleasedJobQueueRowSummary {
    const isForPicking = isJobOrderStatus(jo.status, JOB_ORDER_STATUS.FOR_PICKING);
    const isPicked = isJobOrderStatus(jo.status, JOB_ORDER_STATUS.PICKED);
    const isInProduction = isJobOrderStatus(jo.status, JOB_ORDER_STATUS.IN_PRODUCTION);
    const isOnHold = isJobOrderStatus(jo.status, JOB_ORDER_STATUS.ON_HOLD, JOB_ORDER_STATUS.QA_HOLD);
    const routeTasks = jo.routing_tasks?.length ? jo.routing_tasks : jo.routingTasks || [];
    const workstationEntries: WorkstationEntry[] = [...routeTasks]
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
    const totalSteps = routingTasks.length;
    const completedSteps = routingTasks.filter(
        (task) => String(task.status || "").trim().toLowerCase() === "completed"
    ).length;

    return {
        producedQty: jo.producedQty ?? jo.completed_quantity ?? jo.productionOutputQuantity ?? 0,
        workstationEntries,
        journey: resolveJobOrderJourney({
            status: jo.status,
            allMaterialsStaged: isPicked ? undefined : false
        }),
        totalSteps,
        completedSteps,
        totalHours: calculatePipelinedLineDurationHours(routingTasks),
        isForPicking,
        isPicked,
        isInProduction,
        isOnHold,
        canOpenTerminal: isForPicking || isPicked || isInProduction || isOnHold
    };
}

const ReleasedJobQueueRow = memo(function ReleasedJobQueueRow({
    jobOrder: jo,
    parent,
    isSelected,
    setSelectedJobOrderId,
    virtualIndex,
    measureElement
}: {
    jobOrder: TerminalQueueJobOrder;
    parent?: TerminalQueueJobOrder;
    isSelected: boolean;
    setSelectedJobOrderId: (id: string) => void;
    virtualIndex?: number;
    measureElement?: (element: HTMLTableRowElement | null) => void;
}) {
    const summary = useMemo(() => createReleasedJobQueueRowSummary(jo), [jo]);

    return (
        <tr
            ref={measureElement}
            data-index={virtualIndex}
            className={isSelected ? "bg-primary/[0.06]" : "bg-card hover:bg-muted/20"}
        >
            <td className="px-3 py-3 align-top">
                <div className="flex items-start gap-2">
                    {parent && <CornerDownRight className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
                    <div className="min-w-0">
                        <div className="font-sans text-sm font-bold tracking-tight">{jo.jo_id}</div>
                        {parent && (
                            <div className="mt-1 text-xs font-semibold text-primary/80">
                                Sub-assembly of {parent.jo_id}
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
                <StepProgressBar completedSteps={summary.completedSteps} totalSteps={summary.totalSteps} />
                <JobOrderJourneyBar journey={summary.journey} compact className="mt-2" />
            </td>
            <td className="whitespace-nowrap px-3 py-3 text-right align-top">
                <div className="font-sans text-sm font-bold text-foreground">
                    {Number(jo.quantity || 0).toLocaleString()}
                    <span className="mx-1 font-normal text-muted-foreground">/</span>
                    <span className="text-emerald-600 dark:text-emerald-400">{Number(summary.producedQty || 0).toLocaleString()}</span>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                    {summary.totalHours.toFixed(1)} line hrs
                </div>
            </td>
            <td className="px-3 py-3 align-top">
                <div className="flex items-start gap-1.5 text-sm font-semibold">
                    <Building2 className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${summary.workstationEntries.every((entry) => entry.name === "Unassigned") ? "text-amber-600 dark:text-amber-400" : "text-primary"}`} />
                    <div className="min-w-0 space-y-1">
                        {summary.workstationEntries.map((entry) => (
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
            <td className="px-3 py-3 align-top text-sm font-semibold text-muted-foreground">
                {jo.due_date ? formatPhtDate(jo.due_date) : "—"}
            </td>
            <td className="px-3 py-3 text-right align-top">
                <Button
                    type="button"
                    size="sm"
                    onClick={() => setSelectedJobOrderId(jo.jo_id)}
                    disabled={!summary.canOpenTerminal}
                    className={summary.isPicked
                        ? "h-9 bg-primary px-3 text-xs font-bold text-primary-foreground hover:bg-primary/90"
                        : "h-9 px-3 text-xs font-bold"}
                >
                    {summary.isPicked ? <Play className="mr-1.5 h-3.5 w-3.5" /> : <ExternalLink className="mr-1.5 h-3.5 w-3.5" />}
                    {summary.isForPicking ? "Review Materials" : summary.isPicked ? "Start Production" : summary.isInProduction ? "Open Terminal" : summary.isOnHold ? "Review Hold" : "Unavailable"}
                </Button>
            </td>
        </tr>
    );
});

const VIRTUALIZE_THRESHOLD = 100;
const ESTIMATED_QUEUE_ROW_HEIGHT = 160;
const QUEUE_ROW_OVERSCAN = 8;

export const ReleasedJobQueue = memo(function ReleasedJobQueue({
    filteredJobOrders,
    jobOrders,
    selectedJobOrderId,
    setSelectedJobOrderId,
    searchQuery,
    setSearchQuery,
    loadingJobs,
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
    const parentByChildId = useMemo(() => {
        const parentByOrderId = new Map<number, TerminalQueueJobOrder>();
        jobOrders.forEach((jobOrder) => parentByOrderId.set(Number(jobOrder.order_id), jobOrder));

        const parents = new Map<string, TerminalQueueJobOrder>();
        filteredJobOrders.forEach((jobOrder) => {
            if (!jobOrder.parentJobOrderId) return;
            const parent = parentByOrderId.get(Number(jobOrder.parentJobOrderId));
            if (parent) parents.set(jobOrder.jo_id, parent);
        });
        return parents;
    }, [filteredJobOrders, jobOrders]);
    const shouldVirtualize = filteredJobOrders.length > VIRTUALIZE_THRESHOLD;
    const [scrollMargin, setScrollMargin] = useState(0);
    const rowListRef = useRef<HTMLTableSectionElement>(null);
    const virtualizer = useWindowVirtualizer<HTMLTableRowElement>({
        count: shouldVirtualize ? filteredJobOrders.length : 0,
        estimateSize: () => ESTIMATED_QUEUE_ROW_HEIGHT,
        overscan: QUEUE_ROW_OVERSCAN,
        getItemKey: (index) => filteredJobOrders[index]?.jo_id ?? index,
        scrollMargin,
        enabled: shouldVirtualize
    });
    const filterKey = JSON.stringify([
        searchQuery,
        selectedBranchFilter,
        productFilter,
        customerFilter,
        statusFilter
    ]);
    const previousFilterKeyRef = useRef(filterKey);

    useLayoutEffect(() => {
        if (previousFilterKeyRef.current === filterKey) return;
        previousFilterKeyRef.current = filterKey;
        if (shouldVirtualize) virtualizer.scrollToIndex(0, { align: "start" });
    }, [filterKey, shouldVirtualize, virtualizer]);

    useLayoutEffect(() => {
        const updateScrollMargin = () => {
            const rowList = rowListRef.current;
            if (!rowList) return;
            const nextMargin = window.scrollY + rowList.getBoundingClientRect().top;
            setScrollMargin((current) => current === nextMargin ? current : nextMargin);
        };

        updateScrollMargin();
        window.addEventListener("resize", updateScrollMargin);
        return () => window.removeEventListener("resize", updateScrollMargin);
    }, [filteredJobOrders.length, loadingJobs]);

    const virtualItems = shouldVirtualize ? virtualizer.getVirtualItems() : [];
    const firstVirtualItem = virtualItems[0];
    const lastVirtualItem = virtualItems[virtualItems.length - 1];
    const topPadding = firstVirtualItem ? Math.max(0, firstVirtualItem.start - scrollMargin) : 0;
    const bottomPadding = lastVirtualItem
        ? Math.max(0, virtualizer.getTotalSize() - (lastVirtualItem.end - scrollMargin))
        : 0;

    return (
        <Card className="h-full overflow-hidden font-sans">
            <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between gap-2 text-lg">
                    <span>Production Job Order Queue</span>
                    <Badge variant="outline" className="font-mono">
                        {filteredJobOrders.length}
                    </Badge>
                </CardTitle>
                <CardDescription className="text-sm">
                    Review staged materials and start production when ready, continue active runs, or review held Job Orders.
                </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
                <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
                    <div className="relative min-w-0 flex-1">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search Job No or Product..."
                            className="h-9 pl-8 text-sm"
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                        />
                    </div>

                    <div className="w-full min-w-0 lg:w-[190px]">
                        <SearchableSelect
                            options={[{ value: "All", label: "All Products" }, ...productOptions]}
                            value={productFilter}
                            onValueChange={setProductFilter}
                            placeholder="All Products"
                            className="h-9 text-sm"
                        />
                    </div>

                    <div className="w-full min-w-0 lg:w-[200px]">
                        <SearchableSelect
                            options={[{ value: "All", label: "All Customers" }, ...customerOptions]}
                            value={customerFilter}
                            onValueChange={setCustomerFilter}
                            placeholder="All Customers"
                            className="h-9 text-sm"
                        />
                    </div>

                    <div className="w-full min-w-0 lg:w-[200px]">
                        <SearchableSelect
                            options={[{ value: "All", label: "All Statuses" }, ...statusOptions]}
                            value={statusFilter}
                            onValueChange={setStatusFilter}
                            placeholder="All Statuses"
                            className="h-9 text-sm"
                        />
                    </div>

                    <select
                        id="branchFilter"
                        aria-label="Branch filter"
                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm lg:w-[170px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0"
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

                    {onClearFilters && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={onClearFilters}
                            className="h-9 shrink-0 text-sm text-muted-foreground hover:text-foreground"
                            disabled={!hasActiveFilters}
                        >
                            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Reset Filters
                        </Button>
                    )}
                </div>

                {loadingJobs ? (
                    <div className="flex items-center justify-center py-12">
                        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                ) : filteredJobOrders.length === 0 ? (
                    <div className="border-2 border-dashed rounded-lg py-12 text-center text-sm text-muted-foreground">
                        <AlertCircle className="mx-auto mb-2 h-8 w-8 text-muted-foreground/60" />
                        <p>No matching shop-floor Job Orders found.</p>
                        <p className="mt-1 text-xs">Try different filters or reset them.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto rounded-xl border border-border/60">
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
                            <tbody ref={rowListRef} className="divide-y divide-border/50">
                                {shouldVirtualize && topPadding > 0 && (
                                    <tr key="top-spacer" aria-hidden="true">
                                        <td colSpan={6} className="h-0 border-0 p-0" style={{ height: topPadding }} />
                                    </tr>
                                )}
                                {shouldVirtualize
                                    ? virtualItems.map((virtualItem) => {
                                        const jo = filteredJobOrders[virtualItem.index];
                                        if (!jo) return null;
                                        return (
                                            <ReleasedJobQueueRow
                                                key={virtualItem.key}
                                                jobOrder={jo}
                                                parent={parentByChildId.get(jo.jo_id)}
                                                isSelected={jo.jo_id === selectedJobOrderId}
                                                setSelectedJobOrderId={setSelectedJobOrderId}
                                                virtualIndex={virtualItem.index}
                                                measureElement={virtualizer.measureElement}
                                            />
                                        );
                                    })
                                    : filteredJobOrders.map((jo) => (
                                        <ReleasedJobQueueRow
                                            key={jo.jo_id}
                                            jobOrder={jo}
                                            parent={parentByChildId.get(jo.jo_id)}
                                            isSelected={jo.jo_id === selectedJobOrderId}
                                            setSelectedJobOrderId={setSelectedJobOrderId}
                                        />
                                    ))}
                                {shouldVirtualize && bottomPadding > 0 && (
                                    <tr key="bottom-spacer" aria-hidden="true">
                                        <td colSpan={6} className="h-0 border-0 p-0" style={{ height: bottomPadding }} />
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </CardContent>
        </Card>
    );
});
