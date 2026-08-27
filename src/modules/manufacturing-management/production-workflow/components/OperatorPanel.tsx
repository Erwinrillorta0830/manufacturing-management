/* eslint-disable */
import React, { useState, useEffect } from "react";
import {
    User,
    Clock,
    DollarSign,
    AlertTriangle,
    Play,
    Square,
    Trash,
    Loader2
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { RoutingTask, JobOrder, User as UserType, RouteOperatorRecord } from "../types";
import { SearchableSelect } from "../../planning-engineering/components/SearchableSelect";
import { toast } from "sonner";

interface OperatorPanelProps {
    selectedTask: RoutingTask;
    activeStep: RoutingTask | null;
    selectedJobOrder: JobOrder;
    sortedTasks: RoutingTask[];
    users: UserType[];
    routeOperators: RouteOperatorRecord[];
    loadingOperators: boolean;
    handleAddOperator: (startTimer: boolean, taskId: number, assigneeId: string) => void;
    handleRemoveOperator: (taskId: number, opUserId: number) => void;
    handleStartTimer: (taskId: number, opUserId: number) => void;
    handleStopTimer: (taskId: number, opUserId: number) => void;
    handleSaveManualHours: (taskId: number, opUserId: number, hours: string) => void;
    handleCompleteStepClick: (taskId: number) => void;
}

interface BreakdownMaterial {
    jo_material_id?: number | string | null;
    id?: number | string | null;
    product_name?: string;
    product_id?: number | string | null;
    actual_consumed_quantity?: number | string | null;
    allocated_quantity?: number | string | null;
    quantity_allocated?: number | string | null;
    unit_shortcut?: string | null;
}

function getPositiveNumericId(value: unknown): number | null {
    const id = Number(value);
    return Number.isFinite(id) && id > 0 ? id : null;
}

function getMaterialId(material: BreakdownMaterial): number | null {
    return getPositiveNumericId(material.jo_material_id ?? material.id);
}

// Live ticking timer component for clocked-in operators
function RunningTimer({ startedAt }: { startedAt: string }) {
    const [elapsed, setElapsed] = useState("");

    useEffect(() => {
        const updateTimer = () => {
            const diffMs = new Date().getTime() - new Date(startedAt).getTime();
            if (diffMs <= 0) {
                setElapsed("00:00:00");
                return;
            }
            const hours = Math.floor(diffMs / 3600000);
            const mins = Math.floor((diffMs % 3600000) / 60000);
            const secs = Math.floor((diffMs % 60000) / 1000);
            setElapsed(
                `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
            );
        };
        updateTimer();
        const interval = setInterval(updateTimer, 1000);
        return () => clearInterval(interval);
    }, [startedAt]);

    return (
        <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 text-[10px] inline-flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
            {elapsed}
        </span>
    );
}

export default function OperatorPanel({
    selectedTask,
    activeStep,
    selectedJobOrder,
    sortedTasks,
    users,
    routeOperators,
    loadingOperators,
    handleAddOperator,
    handleRemoveOperator,
    handleStartTimer,
    handleStopTimer,
    handleSaveManualHours,
    handleCompleteStepClick
}: OperatorPanelProps) {
    const [isBreakdownOpen, setIsBreakdownOpen] = useState(false);
    const [localAssigneeId, setLocalAssigneeId] = useState("");
    const [localManualHours, setLocalManualHours] = useState("");
    const [localActiveManualUserId, setLocalActiveManualUserId] = useState<number | null>(null);

    const [haltedStepId, setHaltedStepId] = useState<string>("");
    const [yieldQty, setYieldQty] = useState<string>("0");
    const [haltReason, setHaltReason] = useState<string>("");
    const [materials, setMaterials] = useState<BreakdownMaterial[]>([]);
    const [consumedQtys, setConsumedQtys] = useState<Record<number, string>>({});
    const [loadingMaterials, setLoadingMaterials] = useState(false);
    const [submittingHalt, setSubmittingHalt] = useState(false);
    const trimmedHaltReason = haltReason.trim();
    const hasValidHaltReason = trimmedHaltReason.length > 0;

    const groupedOperators = React.useMemo(() => {
        const groups: Record<number, {
            user_id: number;
            user_position: string;
            hourly_rate: number;
            total_logged_hours: number;
            is_running: boolean;
            active_session: any | null;
            latest_session: any;
            all_sessions: any[];
        }> = {};

        routeOperators.forEach((op: any) => {
            const userId = getPositiveNumericId(op.user_id);
            if (userId === null) return;
            const isRunning = op.started_at !== null && op.stopped_at === null;
            const hours = Number(op.actual_hours || 0);

            if (!groups[userId]) {
                groups[userId] = {
                    user_id: userId,
                    user_position: op.user_position || "",
                    hourly_rate: Number(op.hourly_rate || 150),
                    total_logged_hours: 0,
                    is_running: false,
                    active_session: null,
                    latest_session: op,
                    all_sessions: []
                };
            }

            const g = groups[userId];
            g.all_sessions.push(op);
            g.total_logged_hours += hours;

            if (isRunning) {
                g.is_running = true;
                g.active_session = op;
            }

            if (op.id > g.latest_session.id) {
                g.latest_session = op;
            }
        });

        return Object.values(groups);
    }, [routeOperators]);

    const taskSummary = React.useMemo(() => {
        const totalHours = groupedOperators.reduce((sum, g) => sum + g.total_logged_hours, 0);
        return {
            total_hours: totalHours
        };
    }, [groupedOperators]);

    // Sync halted step selection with the active step
    useEffect(() => {
        if (selectedTask) {
            setHaltedStepId(selectedTask.name);
        }
    }, [selectedTask]);

    // Fetch raw materials when breakdown modal opens
    useEffect(() => {
        if (isBreakdownOpen && selectedJobOrder.order_id) {
            setLoadingMaterials(true);
            fetch(`/api/manufacturing/planning-engineering?action=job-materials&joId=${selectedJobOrder.order_id}`)
                .then((res) => res.json())
                .then((data) => {
                    const responseMaterials = Array.isArray(data) ? data as BreakdownMaterial[] : [];
                    const seenMaterialIds = new Set<number>();
                    const identifiedMaterials = responseMaterials.filter((material) => {
                        const materialId = getMaterialId(material);
                        if (materialId === null || seenMaterialIds.has(materialId)) return false;
                        seenMaterialIds.add(materialId);
                        return true;
                    });

                    if (identifiedMaterials.length !== responseMaterials.length) {
                        toast.error("Some allocated materials could not be displayed because their identifiers were missing or duplicated.");
                    }

                    setMaterials(identifiedMaterials);
                    const initialConsumed: Record<number, string> = {};
                    identifiedMaterials.forEach((material) => {
                        const materialId = getMaterialId(material);
                        if (materialId === null) return;
                        initialConsumed[materialId] = String(
                            material.actual_consumed_quantity ??
                            material.allocated_quantity ??
                            material.quantity_allocated ??
                            0
                        );
                    });
                    setConsumedQtys(initialConsumed);
                })
                .catch((err) => console.error("Error loading BOM materials for halt:", err))
                .finally(() => setLoadingMaterials(false));
        }
    }, [isBreakdownOpen, selectedJobOrder]);

    const handleHaltSubmit = async () => {
        if (!hasValidHaltReason) {
            toast.error("Halt reason is required.");
            return;
        }

        const jobOrderId = getPositiveNumericId(selectedJobOrder.order_id);
        if (jobOrderId === null) {
            toast.error("A valid Job Order is required to log a breakdown.");
            return;
        }

        setSubmittingHalt(true);
        try {
            const body = {
                action: "breakdown",
                jobOrderId,
                haltedStepId: haltedStepId,
                yieldQty: Number(yieldQty),
                haltReason: trimmedHaltReason,
                materials: materials.flatMap((material) => {
                    const materialId = getMaterialId(material);
                    if (materialId === null) return [];
                    return [{
                        materialId,
                        consumedQty: Number(consumedQtys[materialId] ?? 0)
                    }];
                })
            };
            const res = await fetch(`/api/manufacturing/planning-engineering`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            });
            if (res.ok) {
                setIsBreakdownOpen(false);
                window.location.reload();
            } else {
                const errorData = await res.json().catch(() => null);
                toast.error(errorData?.error || "Failed to log breakdown. Please try again.");
            }
        } catch (e) {
            console.error("Error logging breakdown:", e);
            toast.error("An error occurred while logging the breakdown. Please try again.");
        } finally {
            setSubmittingHalt(false);
        }
    };

    const getUserLabel = (uId: number) => {
        const u = users.find((usr) => getPositiveNumericId(usr.user_id ?? usr.id) === uId);
        if (!u) return `Operator #${uId}`;
        const fname = u.user_fname || u.first_name || "";
        const lname = u.user_lname || u.last_name || "";
        return `${fname} ${lname}`.trim() || `User #${uId}`;
    };

    const operatorOptions = React.useMemo(() => {
        const assignedUserIds = new Set(
            routeOperators
                .map((operator) => getPositiveNumericId(operator.user_id))
                .filter((userId): userId is number => userId !== null)
        );
        const seenUserIds = new Set<number>();

        return users.reduce<{ value: string; label: string }[]>((options, user) => {
            const userId = getPositiveNumericId(user.user_id ?? user.id);
            if (userId === null || assignedUserIds.has(userId) || seenUserIds.has(userId)) {
                return options;
            }

            seenUserIds.add(userId);
            options.push({
                value: String(userId),
                label: `${getUserLabel(userId)} (${user.user_position || user.position || "Operator"})`
            });
            return options;
        }, []);
    }, [routeOperators, users]);

    const isJobOnHold = selectedJobOrder.status === "On Hold";

    return (
        <Card className="border border-border bg-card shadow-sm rounded-xl overflow-hidden">
            {/* Header */}
            <CardHeader className="p-3 sm:p-4 border-b border-border/40 bg-muted/5">
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3">
                    <div>
                        <span className="text-[10px] font-bold text-primary uppercase tracking-widest block font-mono">
                            Workstation Step {selectedTask.sequence_order}0
                        </span>
                        <CardTitle className="text-base sm:text-lg font-extrabold text-foreground mt-0.5">
                            {selectedTask.name}
                        </CardTitle>
                    </div>

                    {/* Inline Stats strip */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-medium text-muted-foreground bg-background/50 border border-border/60 px-3 py-1.5 rounded-full shadow-sm">
                        <div>
                            Planned: <strong className="text-foreground font-mono">{(Number(selectedTask.planned_setup_hours || 0) + Number(selectedTask.planned_run_hours || 0)).toFixed(1)}h</strong>
                        </div>
                        <div className="border-r border-border h-3 hidden sm:block" />
                        <div>
                            Actual: <strong className="text-foreground font-mono">{taskSummary.total_hours.toFixed(1)}h</strong>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        {selectedTask.requires_qa === 1 && (
                            <Badge variant="outline" className="text-[9px] py-0 px-1 text-amber-600 border-amber-500/20 bg-amber-500/5 font-semibold">
                                QA Checklist Required
                            </Badge>
                        )}
                        {groupedOperators.some((o) => o.is_running) && (
                            <Badge className="bg-emerald-500 text-white font-mono text-[9px] py-0 px-1 animate-pulse">
                                Ongoing Run
                            </Badge>
                        )}
                    </div>
                </div>
            </CardHeader>

            <CardContent className="p-3 sm:p-4 space-y-4">
                {/* 1. Required Raw Materials Section */}
                {selectedTask.bom_items && selectedTask.bom_items.length > 0 && (
                    <div className="p-3 bg-muted/10 border border-border/50 rounded-xl space-y-2">
                        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block font-mono">
                            Required Raw Materials
                        </span>
                        <div className="flex flex-wrap gap-2 text-xs">
                            {selectedTask.bom_items.map((item: any, idx: number) => (
                                <div key={`${item.product_id}_${idx}`} className="flex items-center gap-1.5 px-2.5 py-1 bg-background border border-border rounded-lg shadow-sm">
                                    <span className="font-semibold text-foreground text-[11px] truncate max-w-[150px]" title={item.product_name}>
                                        {item.product_name}
                                    </span>
                                    <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/5 px-1.5 py-0.5 rounded border border-emerald-500/10 text-[10px]">
                                        {item.total_needed.toLocaleString(undefined, { maximumFractionDigits: 1 })} {item.unit_shortcut}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* 2. Operators Assignment & Management Section */}
                <div className="space-y-3">
                    <div className="flex justify-between items-center">
                        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block font-mono">
                            Operators Team Log
                        </span>
                    </div>

                    {/* Compact flex-row operator check-in toolbar */}
                    {!isJobOnHold && (
                        <div className="flex flex-wrap gap-2 items-center bg-muted/30 p-2 border border-border/50 rounded-xl">
                            <div className="flex-1 min-w-[200px]">
                                <SearchableSelect
                                    options={operatorOptions}
                                    value={localAssigneeId}
                                    onValueChange={(val) => setLocalAssigneeId(val)}
                                    placeholder="Select floor personnel..."
                                    className="h-8 text-xs bg-background"
                                />
                            </div>
                            <div className="flex gap-1.5 shrink-0">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                        handleAddOperator(false, selectedTask.id, localAssigneeId);
                                        setLocalAssigneeId("");
                                    }}
                                    className="h-8 font-bold text-xs px-2.5"
                                    disabled={!localAssigneeId}
                                >
                                    Log Hours
                                </Button>
                                <Button
                                    size="sm"
                                    onClick={() => {
                                        handleAddOperator(true, selectedTask.id, localAssigneeId);
                                        setLocalAssigneeId("");
                                    }}
                                    className="h-8 font-bold text-xs px-2.5 bg-primary text-white"
                                    disabled={!localAssigneeId}
                                >
                                    Clock In (Timer)
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* Compact operator check-in list cards */}
                    {groupedOperators.length === 0 ? (
                        <div className="p-3 bg-muted/10 rounded-lg text-muted-foreground text-center italic border border-dashed text-xs">
                            No operators currently clocked in or logged to this step.
                        </div>
                    ) : (
                        <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                            {groupedOperators.map((gop) => {
                                const isTimerActive = gop.is_running && gop.active_session;
                                const isEditingHours = localActiveManualUserId === gop.user_id;

                                return (
                                    <div key={`operator-${gop.user_id}`} className="flex flex-col sm:flex-row sm:items-center justify-between p-2 sm:p-2.5 bg-background border border-border/60 rounded-xl hover:bg-muted/10 transition-colors gap-2">
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <div className="p-1.5 bg-primary/5 rounded-lg text-primary shrink-0">
                                                <User className="h-4 w-4" />
                                            </div>
                                            <div className="min-w-0">
                                                <span className="font-bold text-foreground block text-xs truncate">
                                                    {getUserLabel(gop.user_id)}
                                                </span>
                                                <span className="text-[10px] text-muted-foreground block truncate">
                                                    {gop.user_position || "Operator"}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between sm:justify-end gap-4 flex-1">
                                            <div className="flex items-center gap-2 shrink-0">
                                                {isTimerActive ? (
                                                    <RunningTimer startedAt={gop.active_session.started_at} />
                                                ) : (
                                                    <span className="text-[9px] text-muted-foreground font-semibold px-1.5 py-0.5 rounded bg-muted/40 border border-border/30">
                                                        Clocked Out
                                                    </span>
                                                )}
                                                
                                                {isEditingHours ? (
                                                    <div className="flex items-center gap-1.5">
                                                        <Input
                                                            type="number"
                                                            value={localManualHours}
                                                            onChange={(e) => setLocalManualHours(e.target.value)}
                                                            className="h-6 w-14 text-right px-1 font-mono text-[11px] focus-visible:ring-primary"
                                                            step="0.1"
                                                        />
                                                        <span className="text-[9px] text-muted-foreground">hrs</span>
                                                    </div>
                                                ) : (
                                                    <span className="font-mono font-bold text-foreground text-xs">
                                                        {gop.total_logged_hours.toFixed(1)} hrs
                                                    </span>
                                                )}
                                            </div>

                                            <div className="flex items-center gap-1">
                                                {isEditingHours ? (
                                                    <>
                                                        <Button
                                                            variant="default"
                                                            size="xs"
                                                            className="h-6.5 text-[10px] font-semibold px-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                                                            onClick={() => {
                                                                handleSaveManualHours(selectedTask.id, gop.user_id, localManualHours);
                                                                setLocalActiveManualUserId(null);
                                                                setLocalManualHours("");
                                                            }}
                                                        >
                                                            Save
                                                        </Button>
                                                        <Button
                                                            variant="outline"
                                                            size="xs"
                                                            className="h-6.5 text-[10px] font-semibold px-2"
                                                            onClick={() => {
                                                                setLocalActiveManualUserId(null);
                                                                setLocalManualHours("");
                                                            }}
                                                        >
                                                            Cancel
                                                        </Button>
                                                    </>
                                                ) : (
                                                    <>
                                                        {isTimerActive ? (
                                                            <Button
                                                                variant="outline"
                                                                size="xs"
                                                                className="h-6.5 text-amber-700 border-amber-300 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-900/50 dark:hover:bg-amber-950/40 px-2 text-[10px] font-medium"
                                                                onClick={() => handleStopTimer(selectedTask.id, gop.user_id)}
                                                            >
                                                                <Square className="mr-1 h-3 w-3 fill-current" /> Stop
                                                            </Button>
                                                        ) : (
                                                            <Button
                                                                variant="outline"
                                                                size="xs"
                                                                className="h-6.5 text-emerald-700 border-emerald-300 hover:bg-emerald-50 dark:text-emerald-400 dark:border-emerald-900/50 dark:hover:bg-emerald-950/40 px-2 text-[10px] font-medium"
                                                                onClick={() => handleStartTimer(selectedTask.id, gop.user_id)}
                                                            >
                                                                <Play className="mr-1 h-3 w-3 fill-current" /> Run
                                                            </Button>
                                                        )}
                                                        <Button
                                                            variant="ghost"
                                                            size="xs"
                                                            className="h-6.5 text-muted-foreground hover:text-foreground px-1.5"
                                                            onClick={() => {
                                                                setLocalActiveManualUserId(gop.user_id);
                                                                setLocalManualHours(gop.total_logged_hours.toString());
                                                            }}
                                                            title="Edit hours manually"
                                                        >
                                                            Manual
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="xs"
                                                            className="h-6.5 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 px-1.5"
                                                            onClick={() => handleRemoveOperator(selectedTask.id, gop.user_id)}
                                                            title="Remove operator assignment"
                                                        >
                                                            <Trash className="h-3.5 w-3.5" />
                                                        </Button>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </CardContent>

            {/* Compact CardFooter with Halt button only */}
            <CardFooter className="py-2.5 px-4 border-t border-border/40 bg-muted/5 flex justify-end">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsBreakdownOpen(true)}
                    className="font-bold border-red-500/25 bg-red-950/5 text-red-500 hover:bg-red-900/10 h-8 text-xs px-3"
                >
                    <AlertTriangle className="mr-1.5 h-3.5 w-3.5" /> Report Workstation Halt / Breakdown
                </Button>
            </CardFooter>

            {/* WORKSTATION BREAKDOWN MODAL */}
            <Dialog open={isBreakdownOpen} onOpenChange={setIsBreakdownOpen}>
                <DialogContent className="sm:max-w-[480px] bg-slate-950 border border-slate-800 text-slate-100">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-red-500 font-bold text-base">
                            <AlertTriangle className="h-5 w-5" /> Report Workstation Halt / Breakdown
                        </DialogTitle>
                        <DialogDescription className="text-slate-400 text-xs">
                            Log a production halt event, record the actual yield produced so far, and adjust the remaining raw material usage.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-2 text-xs">
                        {/* Halted Step Selection */}
                        <div className="space-y-1.5">
                            <Label htmlFor="haltedStep" className="text-slate-300 font-bold">Halted Step / Workstation</Label>
                            <select
                                id="haltedStep"
                                value={haltedStepId}
                                onChange={(e) => setHaltedStepId(e.target.value)}
                                className="flex h-9 w-full rounded-md border border-slate-850 bg-slate-900 text-slate-100 px-3 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                            >
                                {sortedTasks.map((t) => (
                                    <option key={t.id} value={t.name}>
                                        {t.name} (Step {t.sequence_order}0)
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Yielded Quantity */}
                        <div className="space-y-1.5">
                            <Label htmlFor="yieldQty" className="text-slate-300 font-bold">Actual Yield Produced So Far (in base units)</Label>
                            <Input
                                id="yieldQty"
                                type="number"
                                value={yieldQty}
                                onChange={(e) => setYieldQty(e.target.value)}
                                className="h-9 bg-slate-900 border-slate-800 text-slate-100 text-xs focus-visible:ring-primary"
                                placeholder="e.g. 1500"
                            />
                        </div>

                        {/* Halt Reason / Incident Notes */}
                        <div className="space-y-1.5">
                            <Label htmlFor="haltReason" className="text-slate-300 font-bold">Halt Reason / Notes</Label>
                            <textarea
                                id="haltReason"
                                value={haltReason}
                                onChange={(e) => setHaltReason(e.target.value)}
                                required
                                aria-required="true"
                                aria-invalid={!hasValidHaltReason}
                                className={`flex min-h-[70px] w-full rounded-md border bg-slate-900 text-slate-100 px-3 py-2 text-xs placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary focus-visible:ring-offset-0 ${hasValidHaltReason ? "border-slate-800" : "border-red-500/60"}`}
                                placeholder="Detail the incident (e.g. Baking Oven heating unit failed, waiting on maintenance)"
                            />
                        </div>

                        {/* Raw Material Inventory Consumption Adjustment */}
                        <div className="space-y-2">
                            <Label className="text-slate-300 font-bold block">Actual Raw Material Consumed (Up to Halt)</Label>
                            {loadingMaterials ? (
                                <div className="flex justify-center py-4">
                                    <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
                                </div>
                            ) : materials.length === 0 ? (
                                <p className="text-slate-500 text-center py-2 text-[10px]">No materials allocated to this Job Order.</p>
                            ) : (
                                <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                                    {materials.map((m) => {
                                        const materialId = getMaterialId(m);
                                        if (materialId === null) return null;

                                        return (
                                        <div key={`material-${materialId}`} className="flex items-center justify-between p-2 bg-slate-900 border border-slate-800 rounded-md">
                                            <span className="font-bold text-slate-300 truncate max-w-[200px]" title={m.product_name}>
                                                {m.product_name}
                                            </span>
                                            <div className="flex items-center gap-1.5 shrink-0">
                                                <Input
                                                    type="number"
                                                    value={consumedQtys[materialId] || "0"}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        setConsumedQtys((prev) => ({ ...prev, [materialId]: val }));
                                                    }}
                                                    className="h-7 w-20 bg-slate-950 border-slate-850 text-right text-xs"
                                                />
                                                <span className="text-slate-400 font-medium font-mono w-6">{m.unit_shortcut}</span>
                                            </div>
                                        </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    <DialogFooter className="border-t border-slate-800 pt-3 gap-2 flex items-center justify-end">
                        <Button
                            variant="outline"
                            onClick={() => setIsBreakdownOpen(false)}
                            className="border-slate-800 hover:bg-slate-900 text-slate-300 h-8 text-xs font-semibold"
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleHaltSubmit}
                            disabled={submittingHalt || !hasValidHaltReason}
                            className="bg-red-600 hover:bg-red-700 text-white font-bold h-8 text-xs px-4"
                        >
                            {submittingHalt ? (
                                <>
                                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Logging Halt...
                                </>
                            ) : (
                                "Submit Halt & Log Breakdown"
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    );
}
