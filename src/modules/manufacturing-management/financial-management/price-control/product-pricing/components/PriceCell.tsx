// src/modules/supply-chain-management/product-pricing-management/product-pricing/components/PriceCell.tsx
"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatPHP } from "../utils/format";
import type { PendingCellRequest } from "../types";

type Props = {
    value: number | string | null;
    pendingRequest?: PendingCellRequest | null;
    dirty: boolean;
    error: string | null;
    onChange: (raw: string) => void;
};

const PENDING_EDIT_MESSAGE = "A price change request is pending approval for this cell.";
const SCHEDULED_EDIT_MESSAGE = "An approved price change is scheduled for this cell.";

function formatScheduledDate(value: string | null | undefined) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString("en-PH", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });
}

function PriceCell(props: Props) {
    const { value, pendingRequest, dirty, error, onChange } = props;
    const hasRequest = pendingRequest !== null && pendingRequest !== undefined;
    const isScheduled =
        String(pendingRequest?.status ?? "").toUpperCase() === "APPROVED" &&
        String(pendingRequest?.applicationStatus ?? "").toUpperCase() === "SCHEDULED";
    const requestValue = pendingRequest?.proposedValue ?? null;
    const scheduledAt = formatScheduledDate(pendingRequest?.effectiveAt);
    const requestTitle = isScheduled
        ? `Scheduled to change to ${formatPHP(requestValue)}${scheduledAt ? ` at ${scheduledAt}` : ""}`
        : `Request: ${formatPHP(requestValue)} - pending approval`;

    const numericValue = React.useMemo(() => {
        if (value === null || value === "") return null;
        if (typeof value === "number") return value;
        const parsed = parseFloat(value);
        return isNaN(parsed) ? null : parsed;
    }, [value]);

    return (
        <div className="flex min-w-0 flex-col justify-center gap-0.5">
            <Input
                inputMode="decimal"
                value={value === null ? "" : String(value)}
                onChange={(e) => {
                    if (hasRequest) return;
                    onChange(e.target.value);
                }}
                placeholder="—"
                disabled={hasRequest}
                title={hasRequest ? (isScheduled ? SCHEDULED_EDIT_MESSAGE : PENDING_EDIT_MESSAGE) : undefined}
                aria-describedby={hasRequest ? "price-cell-request-hint" : undefined}
                className={cn(
                    "h-7 px-2 text-xs",
                    hasRequest ? "cursor-not-allowed opacity-60" : "",
                    dirty ? "ring-1 ring-primary/50" : "",
                    error ? "ring-1 ring-destructive" : "",
                )}
            />
            <div className="flex min-w-0 flex-col gap-0.5 px-0.5">
                <div className="truncate text-[10px] font-medium leading-none text-muted-foreground">
                    {error ? <span className="text-destructive">{error}</span> : formatPHP(numericValue)}
                </div>
                {hasRequest ? (
                    <div
                        id="price-cell-request-hint"
                        title={requestTitle}
                        className={cn(
                            "max-w-full rounded-sm border px-1 py-0.5 text-[10px] font-semibold",
                            isScheduled
                                ? "whitespace-normal break-words leading-tight border-sky-200/60 bg-sky-50 text-sky-700 dark:border-sky-800/60 dark:bg-sky-950/30 dark:text-sky-400"
                                : "truncate leading-snug border-amber-200/50 bg-amber-50 text-amber-600 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-500",
                        )}
                    >
                        {isScheduled ? (
                            <>
                                <span>Scheduled to change to {formatPHP(requestValue)}</span>
                                {scheduledAt ? <span className="block">at {scheduledAt}</span> : null}
                            </>
                        ) : (
                            `Pending ${formatPHP(requestValue)}`
                        )}
                    </div>
                ) : null}
            </div>
        </div>
    );
}

export default React.memo(PriceCell);
