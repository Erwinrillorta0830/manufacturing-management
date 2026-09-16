/* eslint-disable */
"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Activity, RefreshCw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { JobOrder } from "../types";

interface RawMaterialProgressLine {
    materialId: number;
    productName: string;
    unitShortcut: string;
    reserved: number;
    consumed: number;
    remaining: number;
}

interface RawMaterialProgressTotal {
    unitShortcut: string;
    reserved: number;
    consumed: number;
    remaining: number;
}

interface FinishedGoodsProgressLine {
    orderNo: string;
    targetQuantity: number;
    produced: number;
    remaining: number;
}

interface JobOrderProgressResponse {
    jobOrder?: { jobOrderNo?: string };
    rawMaterials?: { lines?: RawMaterialProgressLine[]; total?: RawMaterialProgressTotal | null };
    finishedGoods?: FinishedGoodsProgressLine[];
}

function formatQuantity(value: number): string {
    return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function ProgressSkeleton() {
    return (
        <div className="grid gap-4 xl:grid-cols-2" role="status" aria-label="Loading Job Order progress">
            {Array.from({ length: 2 }).map((_, sectionIndex) => (
                <div key={sectionIndex} className="space-y-2">
                    <div className="h-3 w-28 animate-pulse rounded bg-muted" />
                    <div className="space-y-2 rounded-lg border p-3">
                        {Array.from({ length: 3 }).map((__, rowIndex) => (
                            <div key={rowIndex} className="h-6 animate-pulse rounded bg-muted" />
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}

export function JobOrderProgressSummary({ jobOrder }: { jobOrder: JobOrder }) {
    const jobOrderId = jobOrder.order_id || jobOrder.job_order_id || 0;
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<JobOrderProgressResponse | null>(null);

    // Refetch whenever the Job Order changes or production activity updates its
    // output counters (the terminal refetches jobs after shift runs/starts).
    const activityKey = `${jobOrder.productionOutputQuantity ?? 0}:${jobOrder.producedQty ?? 0}:${jobOrder.completed_quantity ?? 0}:${(jobOrder as any).yield_logs?.length ?? 0}`;

    const load = useCallback(async () => {
        if (!jobOrderId) return;
        setLoading(true);
        try {
            const response = await fetch(
                `/api/manufacturing/planning-engineering?action=job-order-progress&joId=${encodeURIComponent(String(jobOrderId))}&_t=${Date.now()}`,
                { cache: "no-store" }
            );
            const json = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(json?.error || `Failed to load Job Order progress (${response.status})`);
            }
            setData(json as JobOrderProgressResponse);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load Job Order progress");
            setData(null);
        } finally {
            setLoading(false);
        }
    }, [jobOrderId, activityKey]);

    useEffect(() => {
        void load();
    }, [load]);

    if (!jobOrderId) return null;

    const rawMaterialLines = data?.rawMaterials?.lines || [];
    const rawMaterialTotal = data?.rawMaterials?.total || null;
    const finishedGoods = data?.finishedGoods || [];
    const jobOrderLabel = data?.jobOrder?.jobOrderNo || jobOrder.job_order_no || jobOrder.jo_id;

    return (
        <Card className="border border-border bg-card shadow-sm rounded-xl">
            <CardHeader className="flex flex-col gap-2 border-b bg-muted/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <CardTitle className="flex items-center gap-2 text-sm font-bold">
                        <Activity className="h-4 w-4 text-primary" />
                        JO - {jobOrderLabel}
                    </CardTitle>
                    <CardDescription className="text-[11px]">
                        Live raw-material WIP balance and finished-goods output against its linked Sales Orders.
                    </CardDescription>
                </div>
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void load()}
                    disabled={loading}
                    className="h-8 shrink-0 text-xs font-bold"
                >
                    <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                    Refresh
                </Button>
            </CardHeader>
            <CardContent className="space-y-4 p-4">
                {loading && !data ? (
                    <ProgressSkeleton />
                ) : error ? (
                    <div role="alert" className="flex flex-col items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-center">
                        <p className="text-xs font-bold text-destructive">Unable to load Job Order progress</p>
                        <p className="max-w-xl text-[11px] text-muted-foreground">{error}</p>
                        <Button type="button" size="sm" variant="outline" onClick={() => void load()} className="h-8 text-xs font-bold">
                            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Retry
                        </Button>
                    </div>
                ) : (
                    <div className="grid gap-4 xl:grid-cols-2">
                        {/* Raw Materials */}
                        <div className="space-y-2">
                            <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Raw Materials</h4>
                            <div className="overflow-x-auto rounded-lg border bg-background">
                                <Table>
                                    <TableHeader className="bg-muted/40">
                                        <TableRow>
                                            <TableHead className="h-8 px-3 text-[10px] font-bold uppercase">Material</TableHead>
                                            <TableHead className="h-8 px-3 text-[10px] font-bold uppercase">UOM</TableHead>
                                            <TableHead className="h-8 px-3 text-right text-[10px] font-bold uppercase">Reserved</TableHead>
                                            <TableHead className="h-8 px-3 text-right text-[10px] font-bold uppercase">Consumed</TableHead>
                                            <TableHead className="h-8 px-3 text-right text-[10px] font-bold uppercase">Remaining</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {rawMaterialLines.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={5} className="px-3 py-4 text-center text-xs text-muted-foreground">
                                                    No raw materials are allocated to this Job Order.
                                                </TableCell>
                                            </TableRow>
                                        ) : rawMaterialLines.map((line) => (
                                            <TableRow key={line.materialId}>
                                                <TableCell className="px-3 py-2 text-xs font-semibold">{line.productName}</TableCell>
                                                <TableCell className="px-3 py-2 text-xs text-muted-foreground">{line.unitShortcut}</TableCell>
                                                <TableCell className="px-3 py-2 text-right font-mono text-xs font-bold tabular-nums">{formatQuantity(line.reserved)}</TableCell>
                                                <TableCell className="px-3 py-2 text-right font-mono text-xs text-amber-700 tabular-nums dark:text-amber-400">{formatQuantity(line.consumed)}</TableCell>
                                                <TableCell className="px-3 py-2 text-right font-mono text-xs font-black text-emerald-700 tabular-nums dark:text-emerald-400">{formatQuantity(line.remaining)}</TableCell>
                                            </TableRow>
                                        ))}
                                        {rawMaterialTotal && (
                                            <TableRow className="bg-muted/30">
                                                <TableCell colSpan={2} className="px-3 py-2 text-xs font-black">Total ({rawMaterialTotal.unitShortcut})</TableCell>
                                                <TableCell className="px-3 py-2 text-right font-mono text-xs font-black tabular-nums">{formatQuantity(rawMaterialTotal.reserved)}</TableCell>
                                                <TableCell className="px-3 py-2 text-right font-mono text-xs font-black tabular-nums">{formatQuantity(rawMaterialTotal.consumed)}</TableCell>
                                                <TableCell className="px-3 py-2 text-right font-mono text-xs font-black tabular-nums">{formatQuantity(rawMaterialTotal.remaining)}</TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>

                        {/* Finished Goods */}
                        <div className="space-y-2">
                            <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Finished Goods</h4>
                            <div className="overflow-x-auto rounded-lg border bg-background">
                                <Table>
                                    <TableHeader className="bg-muted/40">
                                        <TableRow>
                                            <TableHead className="h-8 px-3 text-[10px] font-bold uppercase">Sales Order No.</TableHead>
                                            <TableHead className="h-8 px-3 text-right text-[10px] font-bold uppercase">Target Quantity</TableHead>
                                            <TableHead className="h-8 px-3 text-right text-[10px] font-bold uppercase">Produced</TableHead>
                                            <TableHead className="h-8 px-3 text-right text-[10px] font-bold uppercase">Remaining</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {finishedGoods.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={4} className="px-3 py-4 text-center text-xs text-muted-foreground">
                                                    No finished-goods target is linked to this Job Order.
                                                </TableCell>
                                            </TableRow>
                                        ) : finishedGoods.map((line, index) => (
                                            <TableRow key={`${line.orderNo}-${index}`}>
                                                <TableCell className="px-3 py-2 text-xs font-semibold">{line.orderNo}</TableCell>
                                                <TableCell className="px-3 py-2 text-right font-mono text-xs font-bold tabular-nums">{formatQuantity(line.targetQuantity)}</TableCell>
                                                <TableCell className="px-3 py-2 text-right font-mono text-xs text-amber-700 tabular-nums dark:text-amber-400">{formatQuantity(line.produced)}</TableCell>
                                                <TableCell className="px-3 py-2 text-right font-mono text-xs font-black text-emerald-700 tabular-nums dark:text-emerald-400">{formatQuantity(line.remaining)}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
