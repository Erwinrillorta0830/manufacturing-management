/* eslint-disable */
"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, RefreshCw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { JobOrder } from "../types";

interface RawMaterialProgressLot {
    mmLotId: number | null;
    lotName: string | null;
    storageLocation?: string | null;
    batchNo: string | null;
    status: string | null;
    allocated: number;
    consumed: number;
    remaining: number;
}

interface RawMaterialProgressLine {
    materialId: number;
    productName: string;
    unitShortcut: string;
    reserved: number;
    consumed: number;
    remaining: number;
    lots?: RawMaterialProgressLot[];
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

interface RawMaterialProgressRow {
    line: RawMaterialProgressLine;
    lot: RawMaterialProgressLot | null;
}

function formatQuantity(value: number): string {
    return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 6 });
}

const LOT_STATUS_STYLES: Record<string, string> = {
    WIP: "border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300",
    CONSUMED: "border-zinc-500/20 bg-zinc-500/10 text-zinc-700 dark:text-zinc-300",
    HARD: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    PARTIAL: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    SOFT: "border-border bg-muted text-muted-foreground"
};

function ProgressSkeleton() {
    return (
        <div className="space-y-6" role="status" aria-label="Loading Job Order progress">
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
    const rawMaterialRows = rawMaterialLines.flatMap((line): RawMaterialProgressRow[] => {
        const lots = line.lots || [];
        return lots.length > 0
            ? lots.map((lot) => ({ line, lot }))
            : [{ line, lot: null }];
    });

    return (
        <Card className="rounded-xl border border-border bg-card shadow-sm">
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
                    <div className="space-y-6">
                        {/* Finished Goods */}
                        <div className="w-full space-y-2">
                            <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Finished Goods</h4>
                            <div className="w-full overflow-x-auto rounded-lg border bg-background">
                                <Table className="min-w-[560px]">
                                    <TableHeader className="bg-muted/40">
                                        <TableRow>
                                            <TableHead className="h-8 whitespace-nowrap px-3 text-[10px] font-bold uppercase">Sales Order No.</TableHead>
                                            <TableHead className="h-8 whitespace-nowrap px-3 text-right text-[10px] font-bold uppercase">Target Quantity</TableHead>
                                            <TableHead className="h-8 whitespace-nowrap px-3 text-right text-[10px] font-bold uppercase">Produced</TableHead>
                                            <TableHead className="h-8 whitespace-nowrap px-3 text-right text-[10px] font-bold uppercase">Remaining</TableHead>
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
                                                <TableCell className="whitespace-nowrap px-3 py-2 text-right font-mono text-xs font-bold tabular-nums">{formatQuantity(line.targetQuantity)}</TableCell>
                                                <TableCell className="whitespace-nowrap px-3 py-2 text-right font-mono text-xs text-amber-700 tabular-nums dark:text-amber-400">{formatQuantity(line.produced)}</TableCell>
                                                <TableCell className="whitespace-nowrap px-3 py-2 text-right font-mono text-xs font-black text-emerald-700 tabular-nums dark:text-emerald-400">{formatQuantity(line.remaining)}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>

                        {/* Raw Materials */}
                        <div className="w-full space-y-2">
                            <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Raw Materials</h4>
                            <div className="w-full overflow-x-auto rounded-lg border bg-background">
                                <Table className="min-w-[960px]">
                                    <TableHeader className="bg-muted/40">
                                        <TableRow>
                                            <TableHead className="h-8 min-w-[180px] whitespace-nowrap px-3 text-[10px] font-bold uppercase">Material</TableHead>
                                            <TableHead className="h-8 min-w-[150px] whitespace-nowrap px-3 text-[10px] font-bold uppercase">Lot / Batch No.</TableHead>
                                            <TableHead className="h-8 min-w-[170px] whitespace-nowrap px-3 text-[10px] font-bold uppercase">Storage Location</TableHead>
                                            <TableHead className="h-8 min-w-[140px] whitespace-nowrap px-3 text-[10px] font-bold uppercase">Reservation Status</TableHead>
                                            <TableHead className="h-8 min-w-[80px] whitespace-nowrap px-3 text-[10px] font-bold uppercase">UOM</TableHead>
                                            <TableHead className="h-8 min-w-[110px] whitespace-nowrap px-3 text-right text-[10px] font-bold uppercase">Reserved</TableHead>
                                            <TableHead className="h-8 min-w-[110px] whitespace-nowrap px-3 text-right text-[10px] font-bold uppercase">Consumed</TableHead>
                                            <TableHead className="h-8 min-w-[110px] whitespace-nowrap px-3 text-right text-[10px] font-bold uppercase">Remaining</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {rawMaterialRows.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={8} className="px-3 py-4 text-center text-xs text-muted-foreground">
                                                    No raw materials are allocated to this Job Order.
                                                </TableCell>
                                            </TableRow>
                                        ) : rawMaterialRows.map(({ line, lot }, rowIndex) => {
                                            const reserved = lot ? lot.allocated : line.reserved;
                                            const consumed = lot ? lot.consumed : line.consumed;
                                            const remaining = lot ? lot.remaining : line.remaining;
                                            const lotOrBatch = lot?.batchNo || (lot?.mmLotId ? `Lot #${lot.mmLotId}` : "-");
                                            const rowKey = `${line.materialId}-${lot?.mmLotId ?? "none"}-${lot?.batchNo ?? ""}-${rowIndex}`;

                                            return (
                                                <TableRow key={rowKey}>
                                                    <TableCell className="px-3 py-2 text-xs font-semibold">{line.productName}</TableCell>
                                                    <TableCell className="whitespace-nowrap px-3 py-2 font-mono text-xs text-muted-foreground">{lotOrBatch}</TableCell>
                                                    <TableCell className="whitespace-nowrap px-3 py-2 text-xs font-semibold text-foreground">{lot?.storageLocation || lot?.lotName || "-"}</TableCell>
                                                    <TableCell className="px-3 py-2">
                                                        {lot?.status ? (
                                                            <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${LOT_STATUS_STYLES[lot.status] || LOT_STATUS_STYLES.SOFT}`}>
                                                                {lot.status}
                                                            </span>
                                                        ) : (
                                                            <span className="text-xs text-muted-foreground">-</span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">{line.unitShortcut}</TableCell>
                                                    <TableCell className="whitespace-nowrap px-3 py-2 text-right font-mono text-xs font-bold tabular-nums">{formatQuantity(reserved)}</TableCell>
                                                    <TableCell className="whitespace-nowrap px-3 py-2 text-right font-mono text-xs text-amber-700 tabular-nums dark:text-amber-400">{formatQuantity(consumed)}</TableCell>
                                                    <TableCell className="whitespace-nowrap px-3 py-2 text-right font-mono text-xs font-black text-emerald-700 tabular-nums dark:text-emerald-400">{formatQuantity(remaining)}</TableCell>
                                                </TableRow>
                                            );
                                        })}
                                        {rawMaterialTotal && (
                                            <TableRow className="bg-muted/30">
                                                <TableCell colSpan={5} className="px-3 py-2 text-xs font-black">Total ({rawMaterialTotal.unitShortcut})</TableCell>
                                                <TableCell className="px-3 py-2 text-right font-mono text-xs font-black tabular-nums">{formatQuantity(rawMaterialTotal.reserved)}</TableCell>
                                                <TableCell className="px-3 py-2 text-right font-mono text-xs font-black tabular-nums">{formatQuantity(rawMaterialTotal.consumed)}</TableCell>
                                                <TableCell className="px-3 py-2 text-right font-mono text-xs font-black tabular-nums">{formatQuantity(rawMaterialTotal.remaining)}</TableCell>
                                            </TableRow>
                                        )}
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
