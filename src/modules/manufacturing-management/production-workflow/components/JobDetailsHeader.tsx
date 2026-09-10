import { AlertTriangle, CornerDownRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { JobOrder } from "../types";
import { displayJobOrderStatus, isJobOrderStatus, JOB_ORDER_STATUS, normalizeJobOrderStatus } from "../../job-order-status";

interface JobDetailsHeaderProps {
    selectedJobOrder: JobOrder;
    parentJoNo?: string | null;
}

const getStatusBadgeVariant = (status: string) => {
    switch (normalizeJobOrderStatus(status)) {
        case "Draft":
            return "secondary";
        case "Proceed":
            return "outline";
        case "Ongoing":
            return "default";
        case "On Hold":
            return "destructive";
        case "Finished":
            return "default";
        default:
            return "outline";
    }
};

export function JobDetailsHeader({ selectedJobOrder, parentJoNo }: JobDetailsHeaderProps) {
    const normalizedStatus = normalizeJobOrderStatus(selectedJobOrder.status);
    const statusLabel = normalizedStatus === JOB_ORDER_STATUS.PROCEED
        ? JOB_ORDER_STATUS.RELEASED
        : normalizedStatus === JOB_ORDER_STATUS.ONGOING
        ? JOB_ORDER_STATUS.IN_PROGRESS
        : displayJobOrderStatus(selectedJobOrder.status);

    return (
        <Card>
            <CardContent className="pt-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <span className="text-lg font-bold font-mono">{selectedJobOrder.jo_id}</span>
                            <Badge
                                variant={getStatusBadgeVariant(selectedJobOrder.status)}
                                className={
                                    isJobOrderStatus(normalizedStatus, JOB_ORDER_STATUS.ONGOING, JOB_ORDER_STATUS.IN_PROGRESS)
                                        ? "bg-emerald-500 text-white"
                                        : isJobOrderStatus(normalizedStatus, JOB_ORDER_STATUS.FINISHED, JOB_ORDER_STATUS.COMPLETED, JOB_ORDER_STATUS.CLOSED)
                                        ? "bg-blue-500 text-white"
                                        : ""
                                }
                            >
                                {statusLabel}
                            </Badge>
                        </div>
                        <h2 className="text-xl font-bold text-card-foreground leading-tight">
                            {selectedJobOrder.product_name}
                        </h2>
                        <div className="flex flex-wrap items-center gap-2">
                            {selectedJobOrder.version_name && (
                                <Badge variant="outline" className="text-xs font-mono font-semibold text-primary">
                                    Recipe: {selectedJobOrder.version_name}
                                </Badge>
                            )}
                            {parentJoNo && (
                                <Badge variant="outline" className="text-xs font-mono font-semibold text-emerald-600 border-emerald-500/40 flex items-center gap-1">
                                    <CornerDownRight className="h-3 w-3 text-emerald-500" /> Sub-Assembly of {parentJoNo}
                                </Badge>
                            )}
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-4 text-sm font-semibold">
                        <div className="bg-muted px-3 py-1.5 rounded-lg">
                            <span className="text-muted-foreground block text-xs">Target Qty</span>
                            <span>{selectedJobOrder.quantity} units</span>
                        </div>
                        <div className="bg-muted px-3 py-1.5 rounded-lg">
                            <span className="text-muted-foreground block text-xs">Due Date</span>
                            <span>{new Date(selectedJobOrder.due_date).toLocaleDateString()}</span>
                        </div>
                        {(() => {
                            const totalHours = selectedJobOrder.routing_tasks 
                                ? selectedJobOrder.routing_tasks.reduce((sum, t) => sum + Number(t.planned_setup_hours || 0) + Number(t.planned_run_hours || 0), 0)
                                : 0;
                            const shiftHours = Number(selectedJobOrder.shiftOption || 8);
                            const estDays = totalHours / shiftHours;
                            return (
                                <div className="bg-muted px-3 py-1.5 rounded-lg">
                                    <span className="text-muted-foreground block text-xs">Est. Duration</span>
                                    <span className="text-primary font-bold">{estDays.toFixed(1)} days <span className="text-[10px] text-muted-foreground/60 font-normal">({shiftHours}h)</span></span>
                                </div>
                            );
                        })()}
                    </div>
                </div>

                {/* Critical On Hold Alert Banner */}
                {isJobOrderStatus(normalizedStatus, JOB_ORDER_STATUS.ON_HOLD, JOB_ORDER_STATUS.QA_HOLD) && (
                    <div className="mt-4 p-4 border border-destructive/30 bg-destructive/10 rounded-lg flex gap-3 text-destructive">
                        <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                        <div className="space-y-1 text-sm">
                            <p className="font-semibold">Job Order is on QA Lock / Hold</p>
                            <p className="text-muted-foreground">Critical parameter failure occurred at a routing step. Sequential progression is locked until a QA supervisor reviews and releases the disposition override.</p>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
