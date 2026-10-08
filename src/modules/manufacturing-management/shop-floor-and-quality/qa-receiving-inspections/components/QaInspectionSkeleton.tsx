"use client";

import React from "react";

export default function QaInspectionSkeleton() {
    return (
        <div className="space-y-4 animate-pulse p-4" data-testid="qa-inspection-skeleton">
            {/* Top Sub-Header Skeleton */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3 pb-3 border-b">
                <div className="space-y-2">
                    <div className="h-4 w-64 bg-muted rounded" />
                    <div className="flex items-center gap-2">
                        <div className="h-3 w-40 bg-muted rounded" />
                        <div className="h-4 w-28 bg-muted rounded-full" />
                        <div className="h-4 w-20 bg-muted rounded-full" />
                    </div>
                </div>
                <div className="h-10 w-full sm:w-[220px] bg-muted rounded-xl" />
            </div>

            {/* Metadata Grid Skeleton (Receipt No, Date, Branch, Doc Type) */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4 py-2 border-b">
                {[1, 2, 3, 4].map(idx => (
                    <div key={idx} className="space-y-1.5">
                        <div className="h-2.5 w-24 bg-muted rounded" />
                        <div className="h-10 w-full bg-muted rounded-xl" />
                        <div className="h-2 w-32 bg-muted rounded" />
                    </div>
                ))}
            </div>

            {/* PO Receiving Progress Skeleton */}
            <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-3">
                <div className="flex justify-between items-center">
                    <div className="h-4 w-36 bg-muted rounded-md" />
                    <div className="h-4 w-24 bg-muted rounded-md" />
                </div>
                <div className="h-2 w-full bg-muted rounded-full" />
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                    {[1, 2, 3, 4].map(idx => (
                        <div key={idx} className="h-14 rounded-lg bg-muted/60 border border-border/40 p-2 space-y-1.5">
                            <div className="h-2.5 w-16 bg-muted rounded" />
                            <div className="h-4 w-20 bg-muted rounded" />
                        </div>
                    ))}
                </div>
            </div>

            {/* Line Cards Skeleton */}
            {[1, 2].map(idx => (
                <div key={idx} className="rounded-xl border border-border bg-card p-4 space-y-4">
                    {/* Header line info */}
                    <div className="flex gap-4 border-b pb-3 items-center">
                        <div className="h-16 w-16 rounded-xl bg-muted shrink-0" />
                        <div className="flex-1 space-y-2">
                            <div className="h-4 w-48 bg-muted rounded" />
                            <div className="h-3 w-28 bg-muted rounded" />
                            <div className="h-3 w-36 bg-muted rounded" />
                        </div>
                        <div className="h-6 w-24 bg-muted rounded-lg" />
                    </div>

                    {/* Metrics grid */}
                    <div className="grid grid-cols-2 gap-2 border-y py-3 sm:grid-cols-4">
                        {[1, 2, 3, 4].map(mIdx => (
                            <div key={mIdx} className="space-y-1">
                                <div className="h-2.5 w-16 bg-muted rounded" />
                                <div className="h-4 w-12 bg-muted rounded" />
                            </div>
                        ))}
                    </div>

                    {/* Quantity Inputs Skeleton */}
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                        {[1, 2, 3].map(qIdx => (
                            <div key={qIdx} className="space-y-1.5">
                                <div className="h-2.5 w-32 bg-muted rounded" />
                                <div className="h-10 w-full bg-muted rounded-lg" />
                            </div>
                        ))}
                    </div>

                    {/* Checklist / Allocations placeholder */}
                    <div className="rounded-lg border border-border/40 bg-muted/10 p-3 space-y-2">
                        <div className="h-3 w-32 bg-muted rounded" />
                        <div className="h-10 w-full bg-muted rounded-md" />
                    </div>
                </div>
            ))}
        </div>
    );
}
