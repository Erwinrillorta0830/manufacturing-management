"use client";

import React from "react";

export function SidebarVersionListSkeleton() {
    return (
        <div className="p-2 space-y-2 animate-pulse">
            {[1, 2, 3, 4].map((n) => (
                <div key={n} className="p-3 rounded-xl border border-border/50 bg-muted/20 space-y-2.5">
                    <div className="flex items-center justify-between">
                        <div className="h-3.5 bg-muted/80 rounded w-24" />
                        <div className="h-3.5 bg-muted/60 rounded-full w-14" />
                    </div>
                    <div className="flex items-center justify-between">
                        <div className="h-3 bg-muted/40 rounded w-16" />
                        <div className="h-3 bg-muted/40 rounded w-20" />
                    </div>
                </div>
            ))}
        </div>
    );
}

export function DetailsTabSkeleton() {
    return (
        <div className="space-y-6 animate-pulse">
            {/* Top info strip skeleton */}
            <div className="h-14 rounded-xl bg-muted/20 border border-border/40 p-3 flex items-center gap-4">
                <div className="h-8 w-8 rounded-lg bg-muted/40 shrink-0" />
                <div className="space-y-1.5 flex-1">
                    <div className="h-3.5 bg-muted/50 rounded w-1/4" />
                    <div className="h-2.5 bg-muted/30 rounded w-1/3" />
                </div>
            </div>

            {/* Form grid sections */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Section 1: Identity */}
                <div className="rounded-xl border border-border/40 bg-card/60 p-5 space-y-4">
                    <div className="h-4 bg-muted/60 rounded w-32" />
                    <div className="space-y-3">
                        <div className="h-3 bg-muted/40 rounded w-20" />
                        <div className="h-9 bg-muted/30 rounded-lg w-full" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <div className="h-3 bg-muted/40 rounded w-16" />
                            <div className="h-9 bg-muted/30 rounded-lg w-full" />
                        </div>
                        <div className="space-y-2">
                            <div className="h-3 bg-muted/40 rounded w-16" />
                            <div className="h-9 bg-muted/30 rounded-lg w-full" />
                        </div>
                    </div>
                </div>

                {/* Section 2: Hierarchy */}
                <div className="rounded-xl border border-border/40 bg-card/60 p-5 space-y-4">
                    <div className="h-4 bg-muted/60 rounded w-36" />
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <div className="h-3 bg-muted/40 rounded w-20" />
                            <div className="h-9 bg-muted/30 rounded-lg w-full" />
                        </div>
                        <div className="space-y-2">
                            <div className="h-3 bg-muted/40 rounded w-20" />
                            <div className="h-9 bg-muted/30 rounded-lg w-full" />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <div className="h-3 bg-muted/40 rounded w-24" />
                        <div className="h-9 bg-muted/30 rounded-lg w-full" />
                    </div>
                </div>
            </div>

            {/* Section 3: Costing & Pricing */}
            <div className="rounded-xl border border-border/40 bg-card/60 p-5 space-y-4">
                <div className="h-4 bg-muted/60 rounded w-40" />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="h-16 bg-muted/25 rounded-lg" />
                    <div className="h-16 bg-muted/25 rounded-lg" />
                    <div className="h-16 bg-muted/25 rounded-lg" />
                </div>
            </div>
        </div>
    );
}

export function VersionRecipeSkeleton() {
    return (
        <div className="space-y-6 animate-pulse">
            {/* Lock/Draft banner placeholder */}
            <div className="h-12 rounded-xl bg-muted/20 border border-border/40" />

            {/* Inner Sub-tab navigation */}
            <div className="flex gap-2 border-b border-border/40 pb-2">
                <div className="h-8 w-28 bg-muted/50 rounded-t-lg" />
                <div className="h-8 w-32 bg-muted/30 rounded-t-lg" />
                <div className="h-8 w-32 bg-muted/30 rounded-t-lg" />
            </div>

            {/* Routing Step Card Skeleton */}
            <div className="rounded-xl border border-border/40 bg-card/60 p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-border/40 pb-3">
                    <div className="flex items-center gap-2">
                        <div className="h-6 w-6 bg-primary/20 rounded-full" />
                        <div className="h-4 bg-muted/60 rounded w-36" />
                    </div>
                    <div className="h-7 w-20 bg-muted/30 rounded-lg" />
                </div>

                {/* Operations & Workcenter row */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div className="h-9 bg-muted/30 rounded-lg" />
                    <div className="h-9 bg-muted/30 rounded-lg" />
                    <div className="h-9 bg-muted/30 rounded-lg" />
                    <div className="h-9 bg-muted/30 rounded-lg" />
                </div>

                {/* BOM items table skeleton */}
                <div className="rounded-lg border border-border/40 overflow-hidden">
                    <div className="h-9 bg-muted/40 border-b border-border/40" />
                    {[1, 2, 3].map((row) => (
                        <div key={row} className="h-11 bg-muted/15 border-b border-border/20 flex items-center px-4 gap-4">
                            <div className="h-3.5 bg-muted/50 rounded w-1/4" />
                            <div className="h-3.5 bg-muted/40 rounded w-1/6" />
                            <div className="h-3.5 bg-muted/40 rounded w-1/6" />
                            <div className="h-3.5 bg-muted/30 rounded w-1/6" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

export function CostingTabSkeleton() {
    return (
        <div className="space-y-6 animate-pulse">
            {/* Top KPI metric cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((k) => (
                    <div key={k} className="p-4 rounded-xl border border-border/40 bg-card/60 space-y-2">
                        <div className="h-3 bg-muted/50 rounded w-20" />
                        <div className="h-6 bg-muted/80 rounded w-28" />
                        <div className="h-2.5 bg-muted/30 rounded w-16" />
                    </div>
                ))}
            </div>

            {/* Breakdown chart & table */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 rounded-xl border border-border/40 bg-card/60 p-5 space-y-4">
                    <div className="h-4 bg-muted/60 rounded w-40" />
                    <div className="space-y-3">
                        {[1, 2, 3, 4, 5].map((r) => (
                            <div key={r} className="h-8 bg-muted/20 rounded-lg flex items-center px-3 justify-between">
                                <div className="h-3 bg-muted/50 rounded w-32" />
                                <div className="h-3 bg-muted/60 rounded w-16" />
                            </div>
                        ))}
                    </div>
                </div>
                <div className="rounded-xl border border-border/40 bg-card/60 p-5 space-y-4 flex flex-col justify-center items-center">
                    <div className="h-36 w-36 rounded-full border-4 border-muted/30 border-t-primary/40 animate-spin" />
                    <div className="h-3 bg-muted/40 rounded w-28 mt-2" />
                </div>
            </div>
        </div>
    );
}

export function QualityTabSkeleton() {
    return (
        <div className="space-y-6 animate-pulse">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="rounded-xl border border-border/40 bg-card/60 p-5 space-y-4">
                    <div className="h-4 bg-muted/60 rounded w-36" />
                    <div className="space-y-3">
                        {[1, 2, 3].map((n) => (
                            <div key={n} className="h-12 bg-muted/25 rounded-lg" />
                        ))}
                    </div>
                </div>
                <div className="rounded-xl border border-border/40 bg-card/60 p-5 space-y-4">
                    <div className="h-4 bg-muted/60 rounded w-36" />
                    <div className="space-y-3">
                        {[1, 2, 3].map((n) => (
                            <div key={n} className="h-12 bg-muted/25 rounded-lg" />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
