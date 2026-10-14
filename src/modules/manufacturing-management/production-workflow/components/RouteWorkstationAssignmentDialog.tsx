/* eslint-disable */
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Building2, Check, CheckCircle2, ChevronsUpDown, GitBranch, Loader2 } from "lucide-react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { JobOrder, RoutingTask, type WorkCenter, type WorkCenterJobOrderAvailability } from "../types";
import {
    assignRouteWorkCenters,
    fetchWorkCenterAvailability,
    fetchWorkCenters,
    type RouteWorkCenterOption
} from "../services/production-api";
import { toast } from "sonner";
import { WorkstationAssetSummary } from "./WorkstationAssetSummary";

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

type WorkCenterSearchOption = WorkCenter & { recommended: boolean };

interface WorkCenterSearchableSelectProps {
    value: string;
    fallbackLabel?: string;
    ariaLabel: string;
    testId: string;
    disabled: boolean;
    groups: Array<{ departmentName: string; workCenters: WorkCenterSearchOption[] }>;
    workCenters: WorkCenter[];
    availabilityByWorkCenter: Map<number, WorkCenterJobOrderAvailability>;
    onValueChange: (value: string) => void;
}

function WorkCenterSearchableSelect({
    value,
    fallbackLabel,
    ariaLabel,
    testId,
    disabled,
    groups,
    workCenters,
    availabilityByWorkCenter,
    onValueChange
}: WorkCenterSearchableSelectProps) {
    const [open, setOpen] = useState(false);
    const selectedWorkCenter = workCenters.find((workCenter) => String(workCenter.work_center_id) === value);
    const selectedLabel = selectedWorkCenter
        ? `${selectedWorkCenter.work_center_name} · WC-${selectedWorkCenter.work_center_id}`
        : value
            ? `${fallbackLabel || `Work Center #${value}`} · Current assignment unavailable`
            : "Select workstation";

    return (
        <Popover modal={false} open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    aria-label={ariaLabel}
                    data-testid={testId}
                    className="h-9 w-full min-w-0 justify-between text-xs font-normal"
                    disabled={disabled}
                >
                    <span className="min-w-0 truncate text-left">{selectedLabel}</span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent
                align="start"
                className="z-[100] w-[--radix-popover-trigger-width] min-w-[300px] p-0"
                data-radix-scroll-lock-ignore="true"
                onWheelCapture={(event) => event.stopPropagation()}
                onTouchMoveCapture={(event) => event.stopPropagation()}
            >
                <Command>
                    <CommandInput placeholder="Search workstations by name, ID, department, or asset..." />
                    <CommandList
                        className="max-h-64 overscroll-contain touch-pan-y"
                        data-radix-scroll-lock-ignore="true"
                        onWheelCapture={(event) => event.stopPropagation()}
                        onTouchMoveCapture={(event) => event.stopPropagation()}
                    >
                        <CommandEmpty>No matching workstations found.</CommandEmpty>
                        {groups.map((group) => (
                            <CommandGroup key={group.departmentName} heading={group.departmentName}>
                                {group.workCenters.map((workCenter) => {
                                    const workCenterId = Number(workCenter.work_center_id);
                                    const id = String(workCenterId);
                                    const availability = availabilityByWorkCenter.get(workCenterId);
                                    const assetInactive = workCenter.asset?.is_active === false
                                        || Number(workCenter.asset?.is_active) === 0;
                                    const searchValue = [
                                        workCenter.work_center_name,
                                        `WC-${workCenterId}`,
                                        group.departmentName,
                                        workCenter.asset?.item_name,
                                        workCenter.asset?.item_id?.item_name,
                                        workCenter.asset?.barcode,
                                        workCenter.asset?.rfid_code,
                                        workCenter.asset?.serial,
                                        workCenter.asset?.condition,
                                        availability ? `${availability.availableJobOrders.length} ready ${availability.inProgressJobOrders.length} in progress` : ""
                                    ].filter(Boolean).join(" ");

                                    return (
                                        <CommandItem
                                            key={workCenterId}
                                            value={searchValue}
                                            onSelect={() => {
                                                onValueChange(id);
                                                setOpen(false);
                                            }}
                                            className="items-start py-2"
                                        >
                                            <Check className={`mt-0.5 h-4 w-4 shrink-0 ${value === id ? "opacity-100" : "opacity-0"}`} />
                                            <span className="min-w-0 flex-1 space-y-1">
                                                <span className="flex flex-wrap items-center gap-1">
                                                    <span className="font-medium">{workCenter.work_center_name} · WC-{workCenterId}</span>
                                                    {value === id && <Badge variant="outline" className="text-[9px]">Current</Badge>}
                                                    {workCenter.recommended && <Badge variant="outline" className="text-[9px]">Recommended</Badge>}
                                                    {assetInactive && <Badge variant="outline" className="text-[9px]">Asset inactive</Badge>}
                                                    {workCenter.asset?.condition && <Badge variant="outline" className="text-[9px]">{workCenter.asset.condition}</Badge>}
                                                </span>
                                                {(workCenter.asset?.item_name || workCenter.asset?.item_id?.item_name || availability) && (
                                                    <span className="block text-[10px] text-muted-foreground">
                                                        {[workCenter.asset?.item_name || workCenter.asset?.item_id?.item_name,
                                                            availability && `${availability.availableJobOrders.length} JOs ready · ${availability.inProgressJobOrders.length} in progress`]
                                                            .filter(Boolean)
                                                            .join(" · ")}
                                                    </span>
                                                )}
                                            </span>
                                        </CommandItem>
                                    );
                                })}
                            </CommandGroup>
                        ))}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}

export function RouteWorkstationAssignmentDialog({
    open,
    onOpenChange,
    jobOrder,
    onSaved
}: RouteWorkstationAssignmentDialogProps) {
    const [workCenters, setWorkCenters] = useState<Awaited<ReturnType<typeof fetchWorkCenters>>["data"]>([]);
    const [workCenterAvailability, setWorkCenterAvailability] = useState<WorkCenterJobOrderAvailability[]>([]);
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
        setWorkCenterAvailability([]);

        void Promise.all([
            fetchWorkCenters(jobOrderId),
            fetchWorkCenterAvailability().catch(() => [] as WorkCenterJobOrderAvailability[])
        ])
            .then(([result, availability]) => {
                if (disposed) return;

                setWorkCenters(result.data);
                setRouteOptions(result.routeOptions || []);
                setWorkCenterAvailability(availability);

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
                setWorkCenterAvailability([]);
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

    const availabilityByWorkCenter = useMemo(
        () => new Map(workCenterAvailability.map((entry) => [entry.workCenterId, entry])),
        [workCenterAvailability]
    );

    const workCenterGroups = useMemo(() => {
        const groups = new Map<string, typeof workCenters>();
        workCenters.forEach((workCenter) => {
            const departmentName = workCenter.department?.department_name || "Other workstations";
            const group = groups.get(departmentName) || [];
            group.push(workCenter);
            groups.set(departmentName, group);
        });
        return [...groups.entries()]
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([departmentName, entries]) => ({
                departmentName,
                workCenters: [...entries].sort((left, right) => left.work_center_name.localeCompare(right.work_center_name))
            }));
    }, [workCenters]);

    const changed = useMemo(
        () => Object.keys(assignments).some((key) => assignments[Number(key)] !== initialAssignments[Number(key)]),
        [assignments, initialAssignments]
    );

    const handleSave = async () => {
        if (!jobOrderId) return;

        const pendingTasks = tasks.filter(isPendingRoute);
        const missingTask = pendingTasks.find((task) => {
            const assignedId = Number(assignments[routeId(task)] || 0);
            return !assignedId || !workCenters.some((workCenter) => Number(workCenter.work_center_id) === assignedId);
        });
        if (missingTask) {
            setError(`${routeLabel(missingTask)} requires an active workstation before it can be started.`);
            return;
        }

        const payload = pendingTasks
            .filter((task) => assignments[routeId(task)] !== initialAssignments[routeId(task)])
            .map((task) => ({
                joRouteId: routeId(task),
                workCenterId: Number(assignments[routeId(task)])
            }));
        if (payload.length === 0) return;
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
                className="w-[96vw] max-w-6xl sm:max-w-6xl max-h-[92vh] flex flex-col overflow-hidden p-0"
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
                        <span>Each pending routing step can use any active facility workstation. The product version workstation is marked as recommended.</span>
                    </div>

                    {error && (
                        <div className="mb-4 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs font-semibold text-destructive">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    {loading ? (
                        <div role="status" aria-label="Loading route workstations" aria-busy="true" className="overflow-hidden rounded-xl border">
                            <span className="sr-only">Loading route workstations...</span>
                            <div aria-hidden="true" className="grid grid-cols-[80px_minmax(0,1fr)_120px_minmax(220px,0.9fr)] gap-3 border-b bg-muted/40 px-4 py-3">
                                {Array.from({ length: 4 }).map((_, index) => (
                                    <Skeleton key={`workstation-heading-${index}`} className="h-3 w-full" />
                                ))}
                            </div>
                            <div aria-hidden="true" className="divide-y">
                                {Array.from({ length: 4 }).map((_, rowIndex) => (
                                    <div key={`workstation-row-${rowIndex}`} className="grid grid-cols-[80px_minmax(0,1fr)_120px_minmax(220px,0.9fr)] items-center gap-3 px-4 py-3">
                                        <Skeleton className="h-4 w-12" />
                                        <div className="space-y-2">
                                            <Skeleton className="h-4 w-3/4" />
                                            <Skeleton className="h-3 w-1/2" />
                                        </div>
                                        <Skeleton className="h-5 w-20 rounded-full" />
                                        <Skeleton className="h-9 w-full" />
                                    </div>
                                ))}
                            </div>
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
                                    const recommendedIds = option?.source === "VERSION_ROUTING" ? option.workCenterIds : [];
                                    const currentValue = assignments[id] || "";
                                    const selectedWorkCenter = workCenters.find(
                                        (workCenter) => String(workCenter.work_center_id) === currentValue
                                    ) || null;
                                    const existingWorkCenter = workCenters.find(
                                        (workCenter) => Number(workCenter.work_center_id) === Number(task.work_center_id)
                                    ) || null;

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
                                                <>
                                                <div className="min-w-0 space-y-1.5">
                                                    <WorkCenterSearchableSelect
                                                        value={currentValue}
                                                        fallbackLabel={task.work_center_name || `Work Center #${currentValue}`}
                                                        ariaLabel={`Workstation for ${routeLabel(task)}`}
                                                        testId={`route-workstation-select-${id}`}
                                                        disabled={saving || loading || workCenters.length === 0}
                                                        groups={workCenterGroups.map((group) => ({
                                                            ...group,
                                                            workCenters: group.workCenters.map((workCenter) => ({
                                                                ...workCenter,
                                                                recommended: recommendedIds.includes(Number(workCenter.work_center_id))
                                                            }))
                                                        }))}
                                                        workCenters={workCenters}
                                                        availabilityByWorkCenter={availabilityByWorkCenter}
                                                        onValueChange={(value) => setAssignments((previous) => ({ ...previous, [id]: value }))}
                                                    />
                                                {selectedWorkCenter && <WorkstationAssetSummary workCenter={selectedWorkCenter} compact />}
                                                {selectedWorkCenter?.asset?.is_active === false && (
                                                    <Badge variant="outline" className="w-fit text-[9px]">Linked asset inactive</Badge>
                                                )}
                                                {!selectedWorkCenter && currentValue && (
                                                    <p className="text-[10px] font-semibold text-amber-600">Current assignment is not in the active workstation list. Choose an active workstation to replace it.</p>
                                                )}
                                                </div>
                                                </>
                                            ) : (
                                                <div className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                                                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                                    <WorkstationAssetSummary
                                                        workCenter={existingWorkCenter}
                                                        fallbackName={task.work_center_name || (task.work_center_id ? `Work Center #${task.work_center_id}` : "Locked")}
                                                        compact
                                                    />
                                                </div>
                                            )}
                                            {pending && workCenters.length === 0 && (
                                                <span className="col-start-4 text-[10px] font-semibold text-amber-600">
                                                    No active workstations are available.
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
