/* eslint-disable */
import React from "react";
import {
    Clock,
    Play,
    Square,
    CheckCircle2,
    ShieldAlert,
    User,
    Layers,
    AlertTriangle,
    ArrowRight,
    Sparkles,
    ChevronRight,
    Building2
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RoutingTask, JobOrder, RouteOperatorRecord, User as UserType } from "../types";

interface OperationStepTrackerProps {
    sortedTasks: RoutingTask[];
    selectedTaskId: number | null;
    setSelectedTaskId: (id: number) => void;
    selectedJobOrder: JobOrder;
    routeOperators: RouteOperatorRecord[];
    users: UserType[];
    onOpenShiftLogModal: () => void;
    onOpenQAModal: (taskId: number) => void;
}

export function OperationStepTracker({
    sortedTasks,
    selectedTaskId,
    setSelectedTaskId,
    selectedJobOrder,
    routeOperators,
    users,
    onOpenShiftLogModal,
    onOpenQAModal
}: OperationStepTrackerProps) {
    const getUserName = (uId: number) => {
        const u = users.find((x) => (x.user_id || x.id) === uId);
        if (!u) return `Operator #${uId}`;
        const fname = u.user_fname || u.first_name || "";
        const lname = u.user_lname || u.last_name || "";
        return `${fname} ${lname}`.trim() || `User #${uId}`;
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <div>
                    <h3 className="text-sm font-extrabold tracking-tight text-foreground flex items-center gap-2">
                        <Layers className="h-4 w-4 text-primary" /> Real-time Operation Step Tracker
                    </h3>
                    <p className="text-xs text-muted-foreground">
                        Live sequence tracking across all routing steps in <code className="font-mono text-primary font-bold">manufacturing_job_order_operations</code>
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono text-xs">
                        {sortedTasks.filter((t) => t.status === "Completed").length} / {sortedTasks.length} Steps Completed
                    </Badge>
                </div>
            </div>

            {/* Steps Timeline Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {sortedTasks.map((task, idx) => {
                    const isSelected = selectedTaskId === task.id;
                    const isCompleted = task.status === "Completed";
                    const isOngoing = task.status === "Ongoing" || task.status === "In Progress";
                    const isQAHold = task.status === "QA Hold";

                    const taskOperators = routeOperators.filter((op) => op.task_id === task.id);
                    const activeTimers = taskOperators.filter((op) => op.started_at !== null && op.stopped_at === null);
                    const totalStepHours = taskOperators.reduce((sum, op) => sum + (op.actual_hours || 0), 0);
                    const plannedTotal = (Number(task.planned_setup_hours || 0) + Number(task.planned_run_hours || 0)).toFixed(1);

                    let cardBorder = "border-border/80 hover:border-primary/40 bg-card";
                    if (isSelected) cardBorder = "border-primary ring-2 ring-primary/20 bg-primary/[0.02]";
                    else if (isCompleted) cardBorder = "border-emerald-500/40 bg-emerald-500/[0.02]";
                    else if (isOngoing) cardBorder = "border-amber-500/40 bg-amber-500/[0.02]";
                    else if (isQAHold) cardBorder = "border-rose-500/40 bg-rose-500/[0.02]";

                    return (
                        <div
                            key={task.id}
                            onClick={() => setSelectedTaskId(task.id)}
                            className={`p-4 rounded-2xl border transition-all duration-200 cursor-pointer shadow-sm hover:shadow-md flex flex-col justify-between space-y-3 ${cardBorder}`}
                        >
                            {/* Top row: Step Number & Status Badge */}
                            <div className="flex justify-between items-start">
                                <div className="flex items-center gap-2">
                                    <span className={`h-6 w-6 rounded-full flex items-center justify-center font-mono font-bold text-xs ${
                                        isCompleted
                                            ? "bg-emerald-500 text-white"
                                            : isOngoing
                                            ? "bg-amber-500 text-white animate-pulse"
                                            : isQAHold
                                            ? "bg-rose-500 text-white"
                                            : "bg-muted text-muted-foreground"
                                    }`}>
                                        {isCompleted ? <CheckCircle2 className="h-3.5 w-3.5" /> : task.sequence_order}
                                    </span>
                                    <span className="text-[10px] font-mono uppercase font-bold text-muted-foreground">
                                        Step {task.sequence_order}0
                                    </span>
                                </div>
                                <Badge
                                    variant="outline"
                                    className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 ${
                                        isCompleted
                                            ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                                            : isOngoing
                                            ? "bg-amber-500/10 text-amber-600 border-amber-500/30 animate-pulse"
                                            : isQAHold
                                            ? "bg-rose-500/10 text-rose-600 border-rose-500/30"
                                            : "bg-muted/40 text-muted-foreground border-border"
                                    }`}
                                >
                                    {task.status || "Pending"}
                                </Badge>
                            </div>

                            {/* Step Title & Work Center */}
                            <div>
                                <h4 className="font-extrabold text-sm text-foreground line-clamp-1">
                                    {task.name}
                                </h4>
                                {task.work_center_name && (
                                    <span className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                                        <Building2 className="h-3 w-3 text-primary/70" /> {task.work_center_name}
                                    </span>
                                )}
                            </div>

                            {/* Hours strip */}
                            <div className="grid grid-cols-2 gap-2 p-2 bg-muted/20 border border-border/40 rounded-xl text-xs font-medium">
                                <div>
                                    <span className="text-[9px] text-muted-foreground block">Planned Time</span>
                                    <span className="font-mono font-bold text-foreground">{plannedTotal} hrs</span>
                                </div>
                                <div>
                                    <span className="text-[9px] text-muted-foreground block">Actual Logged</span>
                                    <span className="font-mono font-bold text-foreground">{totalStepHours.toFixed(1)} hrs</span>
                                </div>
                            </div>

                            {/* Active Timers / Assigned Operators */}
                            {activeTimers.length > 0 && (
                                <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-600 bg-emerald-500/10 p-1.5 rounded-lg border border-emerald-500/20">
                                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping shrink-0" />
                                    <span className="truncate">
                                        Active: {activeTimers.map((t) => getUserName(t.user_id)).join(", ")}
                                    </span>
                                </div>
                            )}

                            {/* QA Gate Indicator */}
                            {task.requires_qa === 1 && (
                                <div className="flex items-center justify-between text-[10px] text-amber-600 dark:text-amber-400 bg-amber-500/5 p-1.5 rounded-lg border border-amber-500/20 font-semibold">
                                    <span className="flex items-center gap-1">
                                        <ShieldAlert className="h-3.5 w-3.5 text-amber-500" /> QA Checklist Required
                                    </span>
                                    {!isCompleted && (
                                        <Button
                                            size="xs"
                                            variant="ghost"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onOpenQAModal(task.id);
                                            }}
                                            className="h-5 text-[10px] px-1.5 text-amber-600 hover:text-amber-700"
                                        >
                                            Audit
                                        </Button>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
