/* eslint-disable */
import { Search, Loader2, AlertCircle, CornerDownRight } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { JobOrder, PRODUCTION_WORKFLOW_STATUS_FILTERS } from "../types";
import { isJobOrderStatus, JOB_ORDER_STATUS } from "../../job-order-status";
import { resolveJobOrderJourney } from "../../shared/job-order-journey";
import { JobOrderJourneyBar } from "../../shared/components/JobOrderJourneyBar";
import { JobOrderStatusBadge } from "../../shared/components/JobOrderStatusBadge";

interface ReleasedJobQueueProps {
    filteredJobOrders: JobOrder[];
    jobOrders: JobOrder[];
    selectedJobOrderId: string;
    setSelectedJobOrderId: (id: string) => void;
    searchQuery: string;
    setSearchQuery: (q: string) => void;
    statusFilter: string;
    setStatusFilter: (f: string) => void;
    loadingJobs: boolean;
    branches: any[];
    selectedBranchFilter: string;
    setSelectedBranchFilter: (b: string) => void;
    onClearFilters?: () => void;
}

export function ReleasedJobQueue({
    filteredJobOrders,
    jobOrders,
    selectedJobOrderId,
    setSelectedJobOrderId,
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    loadingJobs,
    branches,
    selectedBranchFilter,
    setSelectedBranchFilter,
    onClearFilters
}: ReleasedJobQueueProps) {
    // Find all Job Orders that have a parent present in the current filtered list
    const childJobOrderIds = new Set<string>();
    filteredJobOrders.forEach((jo) => {
        if (jo.parentJobOrderId) {
            const hasParentInList = filteredJobOrders.some((p) => Number(p.order_id) === Number(jo.parentJobOrderId));
            if (hasParentInList) {
                childJobOrderIds.add(jo.jo_id);
            }
        }
    });

    // Filter top-level Job Orders (not inside the child set)
    const topLevelJobOrders = filteredJobOrders.filter((jo) => !childJobOrderIds.has(jo.jo_id));

    const renderJobCard = (jo: JobOrder, isChild: boolean) => {
        const isSelected = jo.jo_id === selectedJobOrderId;
        const parentJo = isChild ? jobOrders.find((j) => Number(j.order_id) === Number(jo.parentJobOrderId)) : null;
        const parentJoNo = parentJo?.jo_id || (jo.parentJobOrderId ? `JO #${jo.parentJobOrderId}` : null);

        const producedQty = jo.producedQty ?? jo.completed_quantity ?? 0;
        const journey = resolveJobOrderJourney({
            status: jo.status,
            allMaterialsStaged: isJobOrderStatus(jo.status, JOB_ORDER_STATUS.RESERVED),
            jobOrderNo: jo.jo_id
        });

        return (
            <div
                onClick={() => setSelectedJobOrderId(jo.jo_id)}
                className={`p-3 rounded-lg border cursor-pointer transition-all hover:bg-muted/60 relative ${
                    isSelected
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "bg-card border-border"
                } ${
                    isChild ? "border-l-2 border-l-primary/45 pl-3" : ""
                }`}
            >
                {isChild && parentJoNo && (
                    <div className="flex items-center gap-1 text-[10px] text-primary/80 font-bold mb-1.5 pl-0.5">
                        <CornerDownRight className="h-3 w-3 shrink-0 text-primary" />
                        <span>Sub-Assembly of {parentJoNo}</span>
                    </div>
                )}
                <div className="flex justify-between items-start mb-1.5">
                    <span className="font-mono text-sm font-semibold tracking-tight">
                        {jo.jo_id}
                    </span>
                    <JobOrderStatusBadge status={jo.status} />
                </div>
                <h4 className="font-medium text-sm line-clamp-1 mb-1">{jo.product_name}</h4>
                <JobOrderJourneyBar journey={journey} compact className="mb-2" />
                {jo.version_name && (
                    <div className="text-[10px] font-mono text-primary font-bold mb-2">
                        Recipe: {jo.version_name}
                    </div>
                )}
                
                <div className="flex justify-between items-center text-xs text-muted-foreground font-medium">
                    <span>Target/Prod: <strong className="text-foreground">{jo.quantity.toLocaleString()}</strong> / <strong className="text-emerald-400 font-mono">{producedQty.toLocaleString()}</strong></span>
                    <span>Due: <strong className="text-foreground">{new Date(jo.due_date).toLocaleDateString()}</strong></span>
                </div>

                {/* Est. Production Days */}
                {(() => {
                    const totalHours = jo.routing_tasks 
                        ? jo.routing_tasks.reduce((sum, t) => sum + Number(t.planned_setup_hours || 0) + Number(t.planned_run_hours || 0), 0)
                        : 0;
                    const shiftHours = Number(jo.shiftOption || 8);
                    const estDays = totalHours / shiftHours;
                    return (
                        <div className="flex justify-between items-center text-[10px] text-muted-foreground/85 font-semibold mt-1.5 border-t border-border/25 pt-1.5">
                            <span>Est. Run Time: <strong className="text-foreground">{estDays.toFixed(1)} days</strong> <span className="text-[9px] text-muted-foreground/50 font-normal">({shiftHours}h/shift)</span></span>
                            <span>Planned: <strong className="text-foreground">{totalHours.toFixed(1)} hrs</strong></span>
                        </div>
                    );
                })()}
            </div>
        );
    };

    return (
        <Card className="h-full">
            <CardHeader className="pb-3">
                <CardTitle className="flex justify-between items-center text-lg">
                    <span>Released Job Orders</span>
                    <Badge variant="outline" className="ml-2 font-mono">
                        {filteredJobOrders.length}
                    </Badge>
                </CardTitle>
                <CardDescription>Queue of released orders active on the shop floor</CardDescription>
            </CardHeader>
            
            <CardContent className="space-y-4">
                {/* Search bar */}
                <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search Job No or Product..."
                        className="pl-8 h-9 text-xs"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                {/* Branch selection filter */}
                <div className="space-y-1.5">
                    <select
                        id="branchFilter"
                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0"
                        value={selectedBranchFilter}
                        onChange={(e) => setSelectedBranchFilter(e.target.value)}
                    >
                        <option value="All">All Branches</option>
                        {branches.map((b, index) => {
                            const bId = b.id || b.branch_id || index;
                            return (
                                <option key={`${bId}_${index}`} value={bId}>
                                    {b.branch_name}
                                </option>
                            );
                        })}
                    </select>
                </div>

                {/* Status filters */}
                <div className="flex flex-wrap gap-1.5 pb-1">
                    {PRODUCTION_WORKFLOW_STATUS_FILTERS.map((filter) => (
                        <Button
                            key={filter.value}
                            variant={statusFilter === filter.value ? "default" : "outline"}
                            size="xs"
                            className="h-7 text-xs px-2.5"
                            onClick={() => setStatusFilter(filter.value)}
                        >
                            {filter.label}
                        </Button>
                    ))}
                </div>

                {/* Job list scrolling wrapper */}
                {loadingJobs ? (
                    <div className="flex justify-center items-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                ) : filteredJobOrders.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground text-sm border-2 border-dashed rounded-lg">
                        <AlertCircle className="mx-auto h-8 w-8 mb-2 text-muted-foreground/60" />
                        <p>No matching Job Orders found.</p>
                        <p className="text-xs mt-1">Try a different status chip or branch, or clear the filters.</p>
                        {onClearFilters && (
                            <Button variant="outline" size="sm" onClick={onClearFilters} className="mt-3 h-8 text-xs">
                                Clear filters
                            </Button>
                        )}
                    </div>
                ) : (
                    <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                        {topLevelJobOrders.map((parentJo) => {
                            const children = filteredJobOrders.filter(
                                (jo) => Number(jo.parentJobOrderId) === Number(parentJo.order_id)
                            );

                            return (
                                <div key={parentJo.jo_id} className="space-y-2">
                                    {/* Parent Card */}
                                    {renderJobCard(parentJo, false)}

                                    {/* Children Cards (nested & indented) */}
                                    {children.map((childJo) => (
                                        <div key={childJo.jo_id} className="pl-4 ml-2 border-l border-primary/20 space-y-2">
                                            {renderJobCard(childJo, true)}
                                        </div>
                                    ))}
                                </div>
                            );
                        })}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
