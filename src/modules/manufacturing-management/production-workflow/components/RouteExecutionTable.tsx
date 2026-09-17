"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
    AlertTriangle,
    Building2,
    CheckCircle2,
    Layers,
    Loader2,
    Package,
    Play,
    Square,
    Trash2,
    User
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "../../planning-engineering/components/SearchableSelect";
import { JobOrder, RouteOperatorRecord, RoutingTask, User as UserType } from "../types";
import { WorkstationBreakdownDialog } from "./WorkstationBreakdownDialog";

interface RouteExecutionTableProps {
    sortedTasks: RoutingTask[];
    selectedTaskId: number | null;
    setSelectedTaskId: (id: number) => void;
    selectedJobOrder: JobOrder;
    routeOperators: RouteOperatorRecord[];
    users: UserType[];
    loadingOperators: boolean;
    handleAddOperator: (startTimer: boolean, taskId: number, assigneeId: string) => void;
    handleRemoveOperator: (taskId: number, opUserId: number) => void;
    handleStartTimer: (taskId: number, opUserId: number) => void;
    handleStopTimer: (taskId: number, opUserId: number) => void;
    handleSaveManualHours: (taskId: number, opUserId: number, hours: string) => void;
    onRequestCompleteStep: (taskId: number) => void;
    onBreakdownSaved?: () => void;
    readOnly?: boolean;
}

interface RouteExecutionRowProps {
    task: RoutingTask;
    isSelected: boolean;
    selectedJobOrder: JobOrder;
    routeOperators: RouteOperatorRecord[];
    users: UserType[];
    loadingOperators: boolean;
    handleAddOperator: RouteExecutionTableProps["handleAddOperator"];
    handleRemoveOperator: RouteExecutionTableProps["handleRemoveOperator"];
    handleStartTimer: RouteExecutionTableProps["handleStartTimer"];
    handleStopTimer: RouteExecutionTableProps["handleStopTimer"];
    handleSaveManualHours: RouteExecutionTableProps["handleSaveManualHours"];
    onOpenBreakdown: (taskId: number) => void;
    onRequestCompleteStep: (taskId: number) => void;
    setSelectedTaskId: (id: number) => void;
    readOnly: boolean;
}

interface OperatorGroup {
    userId: number;
    position: string;
    totalHours: number;
    activeSession: RouteOperatorRecord | null;
    latestSession: RouteOperatorRecord;
}

function positiveId(value: unknown): number | null {
    const id = Number(value);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function getUserLabel(users: UserType[], userId: number): string {
    const user = users.find((candidate) => positiveId(candidate.user_id ?? candidate.id) === userId);
    if (!user) return `Operator #${userId}`;
    const firstName = user.user_fname || user.first_name || "";
    const lastName = user.user_lname || user.last_name || "";
    return `${firstName} ${lastName}`.trim() || `User #${userId}`;
}

function formatDateTime(value: string | null | undefined): string {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function getRemainingSeconds(startedAt: string, durationHours: number): number {
    const normalizedStartedAt = startedAt.trim().includes("T")
        ? startedAt.trim()
        : startedAt.trim().replace(" ", "T");
    const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalizedStartedAt);
    const startedAtMs = Date.parse(hasTimezone ? normalizedStartedAt : `${normalizedStartedAt}Z`);
    const elapsedSeconds = Number.isFinite(startedAtMs)
        ? Math.max(0, (Date.now() - startedAtMs) / 1000)
        : 0;
    return Math.max(0, Math.ceil(durationHours * 60 * 60 - elapsedSeconds));
}

function formatTimerSeconds(totalSeconds: number): string {
    const safeSeconds = Math.max(0, totalSeconds);
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const seconds = safeSeconds % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function RunningTimer({ startedAt, durationHours }: { startedAt: string; durationHours: number }) {
    const [remainingSeconds, setRemainingSeconds] = useState(() => getRemainingSeconds(startedAt, durationHours));

    useEffect(() => {
        const update = () => setRemainingSeconds(getRemainingSeconds(startedAt, durationHours));
        update();
        const timer = setInterval(update, 1000);
        return () => clearInterval(timer);
    }, [startedAt, durationHours]);

    const isExpired = remainingSeconds === 0;
    return (
        <span
            className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-[10px] font-bold ${isExpired
                ? "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                : "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"}`}
            title={isExpired ? "Shift time complete" : "Remaining shift time"}
        >
            <span className={`h-1.5 w-1.5 rounded-full ${isExpired ? "bg-amber-500" : "animate-ping bg-emerald-500"}`} />
            {formatTimerSeconds(remainingSeconds)}
        </span>
    );
}

function RouteExecutionRow({
    task,
    isSelected,
    selectedJobOrder,
    routeOperators,
    users,
    loadingOperators,
    handleAddOperator,
    handleRemoveOperator,
    handleStartTimer,
    handleStopTimer,
    handleSaveManualHours,
    onOpenBreakdown,
    onRequestCompleteStep,
    setSelectedTaskId,
    readOnly
}: RouteExecutionRowProps) {
    const [assigneeId, setAssigneeId] = useState("");
    const [manualUserId, setManualUserId] = useState<number | null>(null);
    const [manualHours, setManualHours] = useState("");
    const [materialsOpen, setMaterialsOpen] = useState(false);

    const taskOperators = useMemo(
        () => routeOperators.filter((operator) => Number(operator.task_id) === Number(task.id)),
        [routeOperators, task.id]
    );
    const groupedOperators = useMemo<OperatorGroup[]>(() => {
        const groups = new Map<number, OperatorGroup>();
        taskOperators.forEach((operator) => {
            const userId = positiveId(operator.user_id);
            if (!userId) return;
            const current = groups.get(userId) || {
                userId,
                position: operator.user_position || "Operator",
                totalHours: 0,
                activeSession: null,
                latestSession: operator
            };
            current.totalHours += Number(operator.actual_hours || 0);
            if (operator.started_at && !operator.stopped_at) current.activeSession = operator;
            if (Number(operator.id || 0) >= Number(current.latestSession.id || 0)) current.latestSession = operator;
            groups.set(userId, current);
        });
        return [...groups.values()];
    }, [taskOperators]);

    const operatorOptions = useMemo(() => {
        const assigned = new Set(groupedOperators.map((operator) => operator.userId));
        const seen = new Set<number>();
        return users.reduce<{ value: string; label: string }[]>((options, user) => {
            const userId = positiveId(user.user_id ?? user.id);
            if (!userId || assigned.has(userId) || seen.has(userId)) return options;
            seen.add(userId);
            options.push({
                value: String(userId),
                label: `${getUserLabel(users, userId)} (${user.user_position || user.position || "Operator"})`
            });
            return options;
        }, []);
    }, [groupedOperators, users]);

    const isCompleted = task.status === "Completed";
    const isOngoing = task.status === "Ongoing" || task.status === "In Progress";
    const isQAHold = task.status === "QA Hold";
    const hasMaterials = (task.bom_items || []).length > 0;
    const shiftDurationHours = Math.max(0.1, Number(selectedJobOrder.shiftOption ?? selectedJobOrder.shift_option ?? 8) || 8);
    const rowClass = isSelected
        ? "bg-primary/[0.06]"
        : isCompleted
            ? "bg-emerald-500/[0.02]"
            : isQAHold
                ? "bg-rose-500/[0.03]"
                : isOngoing
                    ? "bg-amber-500/[0.03]"
                    : "bg-card";

    const stepAction = !isCompleted && !readOnly ? (
        <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={() => onRequestCompleteStep(task.id)}
            className="h-7 border-primary/30 px-2 text-[10px] font-bold text-primary"
        >
            <CheckCircle2 className="mr-1 h-3 w-3" /> Complete Step
        </Button>
    ) : (
        <span className="text-[10px] font-semibold text-muted-foreground">{isCompleted ? "Step completed" : "Read-only"}</span>
    );

    return (
        <>
            <tr className={`${rowClass} cursor-pointer transition-colors hover:bg-muted/20`} onClick={() => setSelectedTaskId(task.id)}>
                <td className="px-3 py-3 align-top">
                    <div className="flex items-start gap-2">
                        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${isCompleted
                            ? "border-emerald-500 bg-emerald-500 text-white"
                            : isQAHold
                                ? "border-rose-500 bg-rose-500 text-white"
                                : isOngoing
                                    ? "border-amber-500 bg-amber-500 text-white"
                                    : "border-border bg-muted text-muted-foreground"}`}>
                            {isCompleted ? <CheckCircle2 className="h-4 w-4" /> : task.sequence_order}
                        </span>
                        <div className="min-w-0">
                            <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Route {task.sequence_order}</div>
                            <div className="mt-1 font-extrabold text-sm text-foreground">{task.name}</div>
                            <Badge variant="outline" className="mt-2 text-[9px] font-bold">{task.status || "Pending"}</Badge>
                        </div>
                    </div>
                </td>
                <td className="px-3 py-3 align-top">
                    <div className={`flex items-center gap-1.5 text-xs font-semibold ${task.work_center_id ? "text-foreground" : "text-amber-600 dark:text-amber-400"}`}>
                        <Building2 className="h-3.5 w-3.5 shrink-0" />
                        <span>{task.work_center_name || (task.work_center_id ? `Work Center #${task.work_center_id}` : "Unassigned")}</span>
                    </div>
                    <div className="mt-2 text-[10px] text-muted-foreground">
                        Planned: <span className="font-mono font-bold text-foreground">{(Number(task.planned_setup_hours || 0) + Number(task.planned_run_hours || 0)).toFixed(1)} hrs</span>
                    </div>
                </td>
                <td className="px-3 py-3 align-top" onClick={(event) => event.stopPropagation()}>
                    {!readOnly && (
                        <div className="flex min-w-[210px] gap-1.5">
                            <SearchableSelect
                                options={operatorOptions}
                                value={assigneeId}
                                onValueChange={setAssigneeId}
                                placeholder="Assign personnel..."
                                disabled={loadingOperators}
                                className="h-8 min-w-0 flex-1 text-[10px]"
                            />
                            <div className="flex shrink-0 gap-1">
                                <Button
                                    type="button"
                                    size="xs"
                                    variant="outline"
                                    disabled={!assigneeId}
                                    onClick={() => {
                                        handleAddOperator(false, task.id, assigneeId);
                                        setAssigneeId("");
                                    }}
                                    className="h-8 px-2 text-[10px] font-bold"
                                    title="Log personnel without starting a timer"
                                >
                                    Log
                                </Button>
                                <Button
                                    type="button"
                                    size="xs"
                                    disabled={!assigneeId}
                                    onClick={() => {
                                        handleAddOperator(true, task.id, assigneeId);
                                        setAssigneeId("");
                                    }}
                                    className="h-8 bg-primary px-2 text-[10px] font-bold text-primary-foreground"
                                    title="Assign personnel and start timer"
                                >
                                    <Play className="h-3 w-3" />
                                </Button>
                            </div>
                        </div>
                    )}
                    <div className="mt-2 space-y-1">
                        {groupedOperators.length === 0 ? (
                            <span className="text-[10px] italic text-muted-foreground">No personnel assigned</span>
                        ) : groupedOperators.map((operator) => (
                            <div key={operator.userId} className="flex items-center gap-1.5 text-[10px] font-semibold text-foreground">
                                <User className="h-3 w-3 text-primary" />
                                <span className="truncate" title={getUserLabel(users, operator.userId)}>{getUserLabel(users, operator.userId)}</span>
                                {operator.activeSession && <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-emerald-500" title="Timer running" />}
                            </div>
                        ))}
                    </div>
                </td>
                <td className="px-3 py-3 align-top" onClick={(event) => event.stopPropagation()}>
                    <div className="flex min-w-[170px] flex-wrap items-center gap-1.5">
                        <Button
                            type="button"
                            size="xs"
                            variant="outline"
                            disabled={!hasMaterials}
                            onClick={() => setMaterialsOpen((open) => !open)}
                            className="h-7 px-2 text-[10px] font-bold"
                            title={hasMaterials ? "View raw materials for this route" : "No route-specific raw materials"}
                        >
                            <Package className="mr-1 h-3 w-3" /> Materials ({(task.bom_items || []).length})
                        </Button>
                        {!isCompleted && (
                            <Button
                                type="button"
                                size="xs"
                                variant="outline"
                                disabled={readOnly}
                                onClick={() => onOpenBreakdown(task.id)}
                                className="h-7 border-destructive/30 px-2 text-[10px] font-bold text-destructive hover:text-destructive"
                            >
                                <AlertTriangle className="mr-1 h-3 w-3" /> Breakdown
                            </Button>
                        )}
                        {stepAction}
                    </div>
                    <div className="mt-2 text-[10px] text-muted-foreground">
                        {isCompleted ? "Completion recorded" : readOnly ? "Route actions unavailable" : "Complete this route explicitly when finished"}
                    </div>
                </td>
                <td className="px-3 py-3 align-top" onClick={(event) => event.stopPropagation()}>
                    {loadingOperators ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : groupedOperators.length === 0 ? (
                        <span className="text-[10px] italic text-muted-foreground">Assign personnel first</span>
                    ) : (
                        <div className="min-w-[280px] space-y-2">
                            {groupedOperators.map((operator) => {
                                const isRunning = Boolean(operator.activeSession);
                                const isEditing = manualUserId === operator.userId;
                                return (
                                    <div key={operator.userId} className="rounded-lg border border-border/60 bg-background/60 p-2">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="truncate text-[10px] font-bold text-foreground">{getUserLabel(users, operator.userId)}</span>
                                            {isRunning ? (
                                                <RunningTimer startedAt={operator.activeSession!.started_at!} durationHours={shiftDurationHours} />
                                            ) : (
                                                <span className="rounded bg-muted/50 px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground">Stopped</span>
                                            )}
                                        </div>
                                        <div className="mt-1 grid grid-cols-3 gap-1 text-[9px] text-muted-foreground">
                                            <span>In: <strong className="block truncate text-foreground">{formatDateTime(operator.latestSession.started_at)}</strong></span>
                                            <span>Out: <strong className="block truncate text-foreground">{formatDateTime(operator.latestSession.stopped_at)}</strong></span>
                                            <span>Consumed: <strong className="block font-mono text-foreground">{operator.totalHours.toFixed(2)}h</strong></span>
                                        </div>
                                        <div className="mt-1.5 flex flex-wrap items-center gap-1">
                                            {isEditing ? (
                                                <>
                                                    <Input
                                                        type="number"
                                                        min="0"
                                                        step="0.1"
                                                        value={manualHours}
                                                        onChange={(event) => setManualHours(event.target.value)}
                                                        className="h-6 w-16 px-1 text-[10px] font-mono"
                                                    />
                                                    <Button type="button" size="xs" className="h-6 px-2 text-[9px]" onClick={() => {
                                                        handleSaveManualHours(task.id, operator.userId, manualHours);
                                                        setManualUserId(null);
                                                        setManualHours("");
                                                    }}>Save</Button>
                                                    <Button type="button" size="xs" variant="outline" className="h-6 px-2 text-[9px]" onClick={() => {
                                                        setManualUserId(null);
                                                        setManualHours("");
                                                    }}>Cancel</Button>
                                                </>
                                            ) : (
                                                <>
                                                    {isRunning ? (
                                                        <Button type="button" size="xs" variant="outline" className="h-6 border-amber-500/30 px-2 text-[9px] font-bold text-amber-700 dark:text-amber-400" onClick={() => handleStopTimer(task.id, operator.userId)}>
                                                            <Square className="mr-1 h-2.5 w-2.5 fill-current" /> Stop
                                                        </Button>
                                                    ) : (
                                                        <Button type="button" size="xs" variant="outline" disabled={readOnly} className="h-6 border-emerald-500/30 px-2 text-[9px] font-bold text-emerald-700 dark:text-emerald-400" onClick={() => handleStartTimer(task.id, operator.userId)}>
                                                            <Play className="mr-1 h-2.5 w-2.5 fill-current" /> Start
                                                        </Button>
                                                    )}
                                                    <Button type="button" size="xs" variant="ghost" disabled={readOnly} className="h-6 px-1.5 text-[9px]" onClick={() => {
                                                        setManualUserId(operator.userId);
                                                        setManualHours(operator.totalHours.toString());
                                                    }}>Manual</Button>
                                                    <Button type="button" size="xs" variant="ghost" disabled={readOnly} className="h-6 px-1.5 text-[9px] text-destructive hover:text-destructive" onClick={() => handleRemoveOperator(task.id, operator.userId)} title="Remove personnel from route">
                                                        <Trash2 className="h-3 w-3" />
                                                    </Button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </td>
            </tr>
            {materialsOpen && hasMaterials && (
                <tr className={rowClass}>
                    <td colSpan={5} className="border-t border-border/40 px-4 py-3">
                        <div className="rounded-lg border border-primary/20 bg-primary/[0.03] p-3">
                            <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-primary">
                                <Layers className="h-3.5 w-3.5" /> Raw Materials for Route {task.sequence_order}
                            </div>
                            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                                {(task.bom_items || []).map((item, index) => (
                                    <div key={`${item.product_id}_${index}`} className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-background px-3 py-2 text-xs">
                                        <span className="truncate font-semibold text-foreground" title={item.product_name}>{item.product_name}</span>
                                        <span className="shrink-0 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                            {Number(item.total_needed || 0).toLocaleString(undefined, { maximumFractionDigits: 4 })} {item.unit_shortcut || "units"}
                                        </span>
                                    </div>
                                ))}
                            </div>
                            <p className="mt-2 text-[9px] text-muted-foreground">Viewing route materials does not change inventory. Consumption is recorded once in the job-order-wide End-of-Shift / Step Progress submission.</p>
                        </div>
                    </td>
                </tr>
            )}
        </>
    );
}

export function RouteExecutionTable({
    sortedTasks,
    selectedTaskId,
    setSelectedTaskId,
    selectedJobOrder,
    routeOperators,
    users,
    loadingOperators,
    handleAddOperator,
    handleRemoveOperator,
    handleStartTimer,
    handleStopTimer,
    handleSaveManualHours,
    onRequestCompleteStep,
    onBreakdownSaved,
    readOnly = false
}: RouteExecutionTableProps) {
    const [breakdownTaskId, setBreakdownTaskId] = useState<number | null>(null);
    const completedCount = sortedTasks.filter((task) => task.status === "Completed").length;
    const breakdownTask = sortedTasks.find((task) => task.id === breakdownTaskId) || null;

    return (
        <section className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h3 className="flex items-center gap-2 text-sm font-extrabold tracking-tight text-foreground">
                        <Layers className="h-4 w-4 text-primary" /> Route Execution Terminal
                    </h3>
                    <p className="text-xs text-muted-foreground">Manage every routing operation, its workstation, personnel, materials, and timer from one view.</p>
                </div>
                <Badge variant="outline" className="w-fit font-mono text-xs">
                    {completedCount} / {sortedTasks.length} Routes Completed
                </Badge>
            </div>

            {sortedTasks.length === 0 ? (
                <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                    <AlertTriangle className="mx-auto mb-2 h-5 w-5" />
                    No routing operations are configured for this Job Order.
                </div>
            ) : (
                <div className="overflow-x-auto rounded-xl border border-border/70 bg-card shadow-sm">
                    <table className="w-full min-w-[1180px] border-collapse text-left">
                        <thead className="bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground">
                            <tr>
                                <th className="px-3 py-3 font-bold">Route</th>
                                <th className="px-3 py-3 font-bold">Workstation</th>
                                <th className="px-3 py-3 font-bold">Assign Personnel</th>
                                <th className="px-3 py-3 font-bold">Actions</th>
                                <th className="px-3 py-3 font-bold">Timer · Time In · Time Out · Consumed Hours</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                            {sortedTasks.map((task) => (
                                <RouteExecutionRow
                                    key={task.id}
                                    task={task}
                                    isSelected={selectedTaskId === task.id}
                                    selectedJobOrder={selectedJobOrder}
                                    routeOperators={routeOperators}
                                    users={users}
                                    loadingOperators={loadingOperators}
                                    handleAddOperator={handleAddOperator}
                                    handleRemoveOperator={handleRemoveOperator}
                                    handleStartTimer={handleStartTimer}
                                    handleStopTimer={handleStopTimer}
                                    handleSaveManualHours={handleSaveManualHours}
                                    onOpenBreakdown={setBreakdownTaskId}
                                    onRequestCompleteStep={onRequestCompleteStep}
                                    setSelectedTaskId={setSelectedTaskId}
                                    readOnly={readOnly}
                                />
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            <WorkstationBreakdownDialog
                open={breakdownTask !== null}
                onOpenChange={(open) => {
                    if (!open) setBreakdownTaskId(null);
                }}
                selectedJobOrder={selectedJobOrder}
                task={breakdownTask}
                onSuccess={() => {
                    setBreakdownTaskId(null);
                    onBreakdownSaved?.();
                }}
            />
        </section>
    );
}
