"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

import type { PCRStatusFilter } from "../types";
import { pcrStatusTabTriggerClass } from "../utils/pcrStatusStyles";

type Props = {
    value: string;
    onValueChange: (status: PCRStatusFilter) => void;
    className?: string;
};

type StatusTabValue = PCRStatusFilter;

const STATUS_TABS: Array<{ value: StatusTabValue; label: string }> = [
    { value: "ALL", label: "All" },
    { value: "PENDING", label: "Pending" },
    { value: "APPROVED", label: "Approved" },
    { value: "SCHEDULED", label: "Scheduled" },
    { value: "APPLYING", label: "Applying" },
    { value: "FAILED", label: "Failed" },
    { value: "REJECTED", label: "Rejected" },
];

export function PcrStatusTabs({ value, onValueChange, className }: Props) {
    return (
        <Tabs
            value={value}
            onValueChange={(next) => onValueChange(next as PCRStatusFilter)}
            className={cn("w-full sm:w-auto", className)}
        >
            <TabsList>
                {STATUS_TABS.map((tab) => (
                    <TabsTrigger
                        key={tab.value}
                        value={tab.value}
                        className={
                            tab.value === "ALL"
                                ? "data-[state=active]:bg-foreground data-[state=active]:text-background data-[state=active]:shadow-sm"
                                : pcrStatusTabTriggerClass(tab.value as Exclude<StatusTabValue, "ALL" | "CANCELLED">)
                        }
                    >
                        {tab.label}
                    </TabsTrigger>
                ))}
            </TabsList>
        </Tabs>
    );
}
