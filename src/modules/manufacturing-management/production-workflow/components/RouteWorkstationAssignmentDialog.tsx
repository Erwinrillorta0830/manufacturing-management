/* eslint-disable */
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Building2, CheckCircle2, GitBranch, Loader2 } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import { JobOrder, RoutingTask } from "../types";
import {
    assignRouteWorkCenters,
    fetchWorkCenters,
    type RouteWorkCenterOption
} from "../services/production-api";
import { toast } from "sonner";

interface RouteWorkstationAssignmentDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    jobOrder: JobOrder | null;
    onSaved?: (routes: Array<{
        joRouteId: number;
        workCenterId: number;
        workCenterName: string | null;
    }>) => void;
}

function routeId(task: RoutingTask): number {
    return Number(task.id || task.jo_route_id || 0);
}

function isPendingRoute(task: RoutingTask): boolean {
    const status = String(task.status || "").trim().toLowerCase();
    return !status || status === "pending";
}

function routeLabel(task: RoutingTask): string {
    return `Step ${task.sequence_order || "-"}`;
}

export function RouteWorkstationAssignmentDialog({
    open,
    onOpenChange,
    jobOrder,
    onSaved
}: RouteWorkstationAssignmentDialogProps) {
    const [workCenters, setWorkCenters] = useState<Awaited<ReturnType<typeof fetchWorkCenters>>["data"]>([]);
    const [routeOptions, setRouteOptions] = useState<RouteWorkCenterOption[]>([]);
    const [assignments, setAssignments] = useState<Record<number, string>>({});
    const [initialAssignments, setInitialAssignments] = useState<Record<number, string>>({});
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const tasks = useMemo(() => {
        const source = jobOrder?.routing_tasks || jobOrder?.routingTasks || [];
        return [...source].sort((left, right) => left.sequence_order - right.sequence_order);
    }, [jobOrder]);

    const jobOrderId = jobOrder?.order_id || jobOrder?.job_order_id || null;

    useEffect(() => {
        if (!open || !jobOrderId) return;

        let disposed = false;
        setLoading(true);
        setSaving(false);
        setError(null);
        setAssignments({});
        setInitialAssignments({});

        void fetchWorkCenters(jobOrderId)
            .then((result) => {
                if (disposed) return;

                setWorkCenters(result.data);
                setRouteOptions(result.routeOptions || []);

                const optionMap = new Map((result.routeOptions || []).map((option) => [option.joRouteId, option]));
                const nextAssignments: Record<number, string> = {};
                tasks.forEach((task) => {
                    const id = routeId(task);
                    const option = optionMap.get(id);
                    const currentId = Number(task.work_center_id || option?.currentWorkCenterId || 0);
                    if (id > 0 && currentId > 0) nextAssignments[id] = String(currentId);
                });
                setAssignments(nextAssignments);
                setInitialAssignments(nextAssignments);
            })
            .catch((loadError: any) => {
                if (disposed) return;
                setWorkCenters([]);
                setRouteOptions([]);
                setError(loadError?.message || "Failed to load route workstations.");
            })
            .finally(() => {
                if (!disposed) setLoading(false);
            });

        return () => {
            disposed = true;
        };
    }, [open, jobOrderId, tasks]);

    const optionMap = useMemo(
        () => new Map(routeOptions.map((option) => [option.joRouteId, option])),
        [routeOptions]
    );

    const changed = useMemo(
        () => Object.keys(assignments).some((key) => assignments[Number(key)] !== initialAssignments[Number(key)]),
        [assignments, initialAssignments]
    );

    const handleSave = async () => {
        if (!jobOrderId) return;

        const pendingTasks = tasks.filter(isPendingRoute);
        const missingTask = pendingTasks.find((task) => !assignments[routeId(task)]);
        if (missingTask) {
            setError(`${routeLabel(missingTask)} requires a workstation before it can be started.`);
            return;
        }

        const payload = pendingTasks.map((task) => ({
            joRouteId: routeId(task),
            workCenterId: Number(assignments[routeId(task)])
        }));
        if (payload.some((assignment) => !assignment.joRouteId || !assignment.workCenterId)) {
            setError("Every pending route must have a valid workstation selected.");
            return;
        }

        setSaving(true);
        setError(null);
        try {
            const result = await assignRouteWorkCenters(jobOrderId, payload);
            const savedRoutes = result?.routes || [];
            onSaved?.(savedRoutes);
            toast.success(`Route workstations saved for ${jobOrder?.job_order_no || jobOrder?.jo_id || "the Job Order"}.`);
            onOpenChange(false);
        } catch (saveError: any) {
            setError(saveError?.message || "Failed to save route workstation assignments.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                data-testid="route-workstation-assignment-dialog"
                className="w-[96vw] max-w-4xl max-h-[92vh] flex flex-col overflow-hidden p-0"
            >
                <DialogHeader className="shrink-0 border-b bg-gradient-to-r from-primary/10 via-primary/5 to-background p-5">
                    <div className="flex items-start gap-3">
                        <div className="rounded-xl border border-primary/20 bg-primary/10 p-2.5 text-primary">
                            <GitBranch className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                            <DialogTitle className="text-lg font-extrabold">
                                Assign Workstations per Route
                            </DialogTitle>
                            <DialogDescription className="mt-1 text-xs">
                                {jobOrder?.job_order_no || jobOrder?.jo_id || "Job Order"} · {jobOrder?.product_name || "Product"}
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <div className="min-h-0 flex-1 overflow-y-auto p-5">
                    <div className="mb-4 flex items-start gap-2 rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 text-xs text-muted-foreground">
                        <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        <span>Each routing step is assigned independently. Workstations shown for a route come from the product version routing.</span>
                    </div>

                    {error && (
                        <div className="mb-4 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs font-semibold text-destructive">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    {loading ? (
                        <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">
                            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading route workstations...
                        </div>
                    ) : tasks.length === 0 ? (
                        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                            No routing steps are available for this Job Order.
                        </div>
                    ) : (
                        <div className="overflow-hidden rounded-xl border">
                            <div className="grid grid-cols-[80px_minmax(0,1fr)_120px_minmax(220px,0.9fr)] gap-3 border-b bg-muted/40 px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                <span>Step</span>
                                <span>Operation</span>
                                <span>Status</span>
                                <span>Workstation</span>
                            </div>
                            <div className="divide-y">
                                {tasks.map((task) => {
                                    const id = routeId(task);
                                    const pending = isPendingRoute(task);
                                    const option = optionMap.get(id);
                                    const allowedIds = option?.workCenterIds?.length
                                        ? option.workCenterIds
                                        : task.work_center_id
                                            ? [Number(task.work_center_id)]
                                            : [];
                                    const routeWorkCenters = workCenters.filter((workCenter) =>
                                        allowedIds.includes(Number(workCenter.work_center_id))
                                    );
                                    const currentValue = assignments[id] || "";
                                    const hasCurrentFallback = currentValue && !routeWorkCenters.some(
                                        (workCenter) => String(workCenter.work_center_id) === currentValue
                                    );

                                    return (
                                        <div
                                            key={id}
                                            data-testid={`route-workstation-row-${id}`}
                                            className="grid grid-cols-[80px_minmax(0,1fr)_120px_minmax(220px,0.9fr)] items-center gap-3 px-4 py-3"
                                        >
                                            <span className="font-mono text-xs font-bold text-primary">
                                                {routeLabel(task)}
                                            </span>
                                            <div className="min-w-0">
                                                <div className="truncate text-sm font-bold">{task.name || `Operation #${task.sequence_order}`}</div>
                                                <div className="text-[10px] text-muted-foreground">Route #{id}</div>
                                            </div>
                                            <Badge variant="outline" className="w-fit text-[10px] font-bold uppercase">
                                                {task.status || "Pending"}
                                            </Badge>
                                            {pending ? (
                                                <Select
                                                    value={currentValue}
                                                    onValueChange={(value) => setAssignments((previous) => ({ ...previous, [id]: value }))}
                                                    disabled={saving || loading || routeWorkCenters.length === 0}
                                                >
                                                    <SelectTrigger className="h-9 w-full text-xs" data-testid={`route-workstation-select-${id}`}>
                                                        <SelectValue placeholder="Select workstation" />
                                                    </SelectTrigger>
                                                    <SelectContent position="popper" className="min-w-[260px]">
                                                        {hasCurrentFallback && (
                                                            <SelectItem value={currentValue}>Work Center #{currentValue}</SelectItem>
                                                        )}
                                                        {routeWorkCenters.map((workCenter) => (
                                                            <SelectItem key={workCenter.work_center_id} value={String(workCenter.work_center_id)}>
                                                                {workCenter.work_center_name} · WC-{workCenter.work_center_id}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            ) : (
                                                <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                                                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                                    {task.work_center_name || (task.work_center_id ? `Work Center #${task.work_center_id}` : "Locked")}
                                                </div>
                                            )}
                                            {pending && routeWorkCenters.length === 0 && (
                                                <span className="col-start-4 text-[10px] font-semibold text-amber-600">
                                                    No workstation is configured for this route.
                                                </span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter className="shrink-0 border-t bg-muted/10 p-4">
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={loading || saving || tasks.length === 0 || !changed}
                        className="bg-emerald-600 text-white hover:bg-emerald-500"
                        data-testid="save-route-workstations"
                    >
                        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                        {saving ? "Saving..." : "Save Route Workstations"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
