/* eslint-disable */
import { AlertCircle, Building2, CornerDownRight, ExternalLink, Play, RefreshCw, Search } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { JobOrder } from "../types";
import { isJobOrderStatus, JOB_ORDER_STATUS } from "../../job-order-status";
import { resolveJobOrderJourney } from "../../shared/job-order-journey";
import { JobOrderJourneyBar } from "../../shared/components/JobOrderJourneyBar";
import { JobOrderStatusBadge } from "../../shared/components/JobOrderStatusBadge";
import { SearchableSelect } from "../../planning-engineering/components/SearchableSelect";

interface ReleasedJobQueueProps {
    filteredJobOrders: JobOrder[];
    jobOrders: JobOrder[];
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
    onAssignWorkstation?: (jo: JobOrder) => void;
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

export function ReleasedJobQueue({
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
    onClearFilters,
    onAssignWorkstation
}: ReleasedJobQueueProps) {
    const parentByChildId = new Map(
        filteredJobOrders
            .filter((jo) => jo.parentJobOrderId)
            .map((jo) => [jo.jo_id, jobOrders.find((parent) => Number(parent.order_id) === Number(jo.parentJobOrderId))])
    );

    const openTerminal = (jo: JobOrder) => setSelectedJobOrderId(jo.jo_id);

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
                    Start production for Picked orders or open the terminal for Job Orders already In Production.
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

                    <select
                        aria-label="Status filter"
                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm lg:w-[160px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0"
                        value={statusFilter}
                        onChange={(event) => setStatusFilter(event.target.value)}
                    >
                        <option value="All">All Statuses</option>
                        {statusOptions.map((status) => (
                            <option key={status.value} value={status.value}>
                                {status.label}
                            </option>
                        ))}
                    </select>

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
                        <p>No staged or In Production Job Orders found.</p>
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
                                    <th className="px-3 py-3 font-bold">Workstation</th>
                                    <th className="px-3 py-3 font-bold">Due</th>
                                    <th className="px-3 py-3 text-right font-bold">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/50">
                                {filteredJobOrders.map((jo) => {
                                    const isSelected = jo.jo_id === selectedJobOrderId;
                                    const isPicked = isJobOrderStatus(jo.status, JOB_ORDER_STATUS.PICKED);
                                    const isInProduction = isJobOrderStatus(jo.status, JOB_ORDER_STATUS.IN_PRODUCTION);
                                    const needsWorkstation = isPicked && !jo.primary_work_center_id;
                                    const parent = parentByChildId.get(jo.jo_id);
                                    const producedQty = jo.productionOutputQuantity ?? jo.producedQty ?? jo.completed_quantity ?? 0;
                                    const workstationLabel = jo.primary_work_center_name
                                        || (jo.primary_work_center_id ? `WC #${jo.primary_work_center_id}` : "Unassigned");
                                    const journey = resolveJobOrderJourney({
                                        status: jo.status,
                                        allMaterialsStaged: isJobOrderStatus(jo.status, JOB_ORDER_STATUS.RESERVED),
                                        jobOrderNo: jo.jo_id
                                    });
                                    const routingTasks = jo.routing_tasks || jo.routingTasks || [];
                                    const totalSteps = routingTasks.length;
                                    const completedSteps = routingTasks.filter(
                                        (task) => String(task.status || "").trim().toLowerCase() === "completed"
                                    ).length;
                                    const totalHours = routingTasks.reduce(
                                        (sum, task) => sum + Number(task.planned_setup_hours || 0) + Number(task.planned_run_hours || 0),
                                        0
                                    );

                                    return (
                                        <tr
                                            key={jo.jo_id}
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
                                                <StepProgressBar completedSteps={completedSteps} totalSteps={totalSteps} />
                                                <JobOrderJourneyBar journey={journey} compact className="mt-2" />
                                            </td>
                                            <td className="whitespace-nowrap px-3 py-3 text-right align-top">
                                                <div className="font-sans text-sm font-bold text-foreground">
                                                    {Number(jo.quantity || 0).toLocaleString()}
                                                    <span className="mx-1 font-normal text-muted-foreground">/</span>
                                                    <span className="text-emerald-600 dark:text-emerald-400">{Number(producedQty || 0).toLocaleString()}</span>
                                                </div>
                                                <div className="mt-2 text-xs text-muted-foreground">
                                                    {totalHours.toFixed(1)} planned hrs
                                                </div>
                                            </td>
                                            <td className="px-3 py-3 align-top">
                                                <div className={`flex items-center gap-1.5 text-sm font-semibold ${jo.primary_work_center_id ? "text-foreground" : "text-amber-600 dark:text-amber-400"}`}>
                                                    <Building2 className="h-3.5 w-3.5 shrink-0" />
                                                    <span>{workstationLabel}</span>
                                                </div>
                                                {needsWorkstation && (
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => onAssignWorkstation?.(jo)}
                                                        className="mt-2 h-7 border-emerald-500/30 px-2 text-xs font-bold text-emerald-700 hover:text-emerald-800 dark:text-emerald-400"
                                                    >
                                                        <Building2 className="mr-1 h-3 w-3" /> Assign
                                                    </Button>
                                                )}
                                            </td>
                                            <td className="px-3 py-3 align-top text-sm font-semibold text-muted-foreground">
                                                {jo.due_date ? new Date(jo.due_date).toLocaleDateString() : "—"}
                                            </td>
                                            <td className="px-3 py-3 text-right align-top">
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    onClick={() => openTerminal(jo)}
                                                    disabled={!isPicked && !isInProduction}
                                                    className={isPicked
                                                        ? "h-9 bg-primary px-3 text-xs font-bold text-primary-foreground hover:bg-primary/90"
                                                        : "h-9 px-3 text-xs font-bold"}
                                                >
                                                    {isPicked ? <Play className="mr-1.5 h-3.5 w-3.5" /> : <ExternalLink className="mr-1.5 h-3.5 w-3.5" />}
                                                    {isPicked ? "Start Production" : isInProduction ? "Open Terminal" : "Unavailable"}
                                                </Button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
