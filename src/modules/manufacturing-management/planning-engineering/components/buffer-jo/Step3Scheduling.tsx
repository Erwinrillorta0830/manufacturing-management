/* eslint-disable */
import React from "react";
import { OperatorSelect } from "../OperatorSelect";

export interface Step3SchedulingProps {
    routings: any[];
    targetQuantity: number;
    assignments: Record<number, number[]>;
    operators: any[];
    handleToggleOperator: (seq: number, opId: number) => void;
}

export function Step3Scheduling({
    routings,
    targetQuantity,
    assignments,
    operators,
    handleToggleOperator
}: Step3SchedulingProps) {
    const totalAssignments = Object.values(assignments).flat().length;

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-foreground uppercase tracking-wider text-[10px]">
                    Workstation Dispatching & Operator Assignment
                </h4>
                <div className="text-[10px] text-muted-foreground font-semibold bg-muted border border-border px-2 py-0.5 rounded-md">
                    {totalAssignments} Total Assignments
                </div>
            </div>

            {routings.length === 0 ? (
                <p className="text-xs text-muted-foreground py-3 text-center">No routing sequence steps defined.</p>
            ) : (
                <div className="space-y-4 max-h-[340px] overflow-y-auto pr-1">
                    {routings.map((route, index) => {
                        const seq = Number(route.sequence_order);
                        const assigned = assignments[seq] || [];
                        const stepRunTime = targetQuantity * Number(route.run_time_hours || 0);

                        return (
                            <div key={`${route.routing_id || "route"}_${index}`} className="border border-border bg-card/20 rounded-xl p-4 space-y-3.5 hover:border-border/60 transition-all duration-300">
                                <div className="flex justify-between items-start border-b border-border/60 pb-2">
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[9px] font-black bg-muted text-muted-foreground border border-border px-2 py-0.5 rounded-md">
                                                Step {seq}0
                                            </span>
                                            <h5 className="text-xs font-bold text-foreground">{route.operation_name || "Production Operation"}</h5>
                                        </div>
                                        <p className="text-[10px] text-muted-foreground">
                                            Work Center: <span className="font-semibold text-foreground">{route.work_center_name || "Factory Work Center"}</span>
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-[10px] bg-primary/10 border border-primary/20 text-primary px-2.5 py-0.5 rounded-full font-bold">
                                            {stepRunTime.toFixed(1)} hrs needed
                                        </span>
                                        <div className="text-[9px] text-muted-foreground mt-1">
                                            {assigned.length} Operator{assigned.length !== 1 ? "s" : ""} Assigned
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <div className="flex items-center justify-between text-[9px] font-bold text-muted-foreground uppercase tracking-wider">
                                        <span>Assign Operators for this Workstation</span>
                                    </div>
                                    <OperatorSelect
                                        operators={operators}
                                        assignedIds={assigned}
                                        onToggleOperator={(opId) => handleToggleOperator(seq, opId)}
                                        placeholder="Select operators..."
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
