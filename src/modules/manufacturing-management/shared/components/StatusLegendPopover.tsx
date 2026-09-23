"use client";

import { HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { JOB_ORDER_STATUS } from "../../job-order-status";
import { JOB_ORDER_STATUS_DESCRIPTIONS, STAGING_STATES, stagingStateInfo } from "../job-order-journey";

export function StatusLegendPopover({
    includeStaging = false,
    className
}: {
    includeStaging?: boolean;
    className?: string;
}) {
    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className={className || "h-8 gap-1.5 text-xs text-muted-foreground"}>
                    <HelpCircle className="h-3.5 w-3.5" />
                    What do these mean?
                </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 max-h-[70vh] overflow-y-auto p-4">
                <div className="space-y-3">
                    <div>
                        <p className="text-xs font-bold text-foreground">Job Order statuses</p>
                        <ul className="mt-1.5 space-y-1.5">
                            {Object.values(JOB_ORDER_STATUS).map((status) => (
                                <li key={status} className="text-[11px] leading-snug">
                                    <span className="font-semibold text-foreground">{status}</span>
                                    <span className="text-muted-foreground">
                                        {" — "}
                                        {JOB_ORDER_STATUS_DESCRIPTIONS[status] || "Status recorded for this Job Order."}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {includeStaging && (
                        <div className="border-t pt-3">
                            <p className="text-xs font-bold text-foreground">Staging states</p>
                            <ul className="mt-1.5 space-y-1.5">
                                {Object.values(STAGING_STATES).map((state) => (
                                    <li key={state.key} className="text-[11px] leading-snug">
                                        <span className="font-semibold text-foreground">{state.label}</span>
                                        <span className="text-muted-foreground">
                                            {" — "}
                                            {state.description}
                                        </span>
                                        <span className="ml-1 text-[10px] font-mono text-muted-foreground/80">({stagingStateInfo(state.key)?.canonical})</span>
                                    </li>
                                ))}
                            </ul>
                            <p className="mt-2 text-[10px] text-muted-foreground">
                                Main Store is the central warehouse. The floor bin (for example,
                                <span className="font-mono"> FLOOR-STAGING-112</span>) is the work-center staging area.
                            </p>
                        </div>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}
