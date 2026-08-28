"use client";

import React, { useState } from "react";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
    Boxes,
    Warehouse,
    ArrowRight,
    CheckCircle2,
    AlertTriangle,
    Printer,
    Sparkles,
    ChevronDown,
    ChevronRight,
    Lock,
    Unlock
} from "lucide-react";
import { StagingJobOrder, MaterialStagingItem, AllocatedLot } from "../types";

interface StagingPickListProps {
    jobOrder: StagingJobOrder | null;
    onOpenTransferModal: (jobOrder: StagingJobOrder, material: MaterialStagingItem, lot?: AllocatedLot) => void;
    onStageAllAvailable: (jobOrder: StagingJobOrder) => Promise<void>;
    isProcessing?: boolean;
}

export function StagingPickList({
    jobOrder,
    onOpenTransferModal,
    onStageAllAvailable,
    isProcessing = false
}: StagingPickListProps) {
    const [expandedMaterials, setExpandedMaterials] = useState<Record<number, boolean>>({});

    if (!jobOrder) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[380px] p-8 text-center bg-card rounded-2xl border border-dashed border-border/80">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground mb-4 shadow-sm">
                    <Boxes className="h-7 w-7" />
                </div>
                <h3 className="text-base font-bold text-foreground">No Job Order Selected</h3>
                <p className="text-xs text-muted-foreground max-w-sm mt-1">
                    Select an active Planned or Reserved Job Order from the left queue to review allocated materials and execute floor bin transfers.
                </p>
            </div>
        );
    }

    const toggleExpandMaterial = (matId: number) => {
        setExpandedMaterials((prev) => ({
            ...prev,
            [matId]: !prev[matId]
        }));
    };

    const handlePrintPickList = () => {
        window.print();
    };

    const isAllStaged = jobOrder.all_staged;
    const isPartiallyStaged = jobOrder.reservation_status === "PARTIAL";

    return (
        <div className="flex flex-col space-y-5 bg-card rounded-2xl border border-border p-5 sm:p-6 shadow-sm">
            {/* Header & Meta Summary */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 pb-5 border-b border-border">
                <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-md bg-primary/10 text-primary border border-primary/20">
                            {jobOrder.job_order_no}
                        </span>
                        <Badge
                            variant="outline"
                            className={
                                jobOrder.status === "RESERVED"
                                    ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30 font-semibold"
                                    : jobOrder.status === "PLANNED" || jobOrder.status === "Planned"
                                        ? "bg-blue-500/10 text-blue-500 border-blue-500/30 font-semibold"
                                        : "bg-muted text-muted-foreground"
                            }
                        >
                            {jobOrder.status?.toUpperCase()}
                        </Badge>
                        {jobOrder.reservation_status === "HARD" ? (
                            <Badge className="bg-emerald-600 text-white font-medium text-[11px]">
                                <Lock className="h-3 w-3 mr-1" />
                                HARD RESERVED (READY)
                            </Badge>
                        ) : isPartiallyStaged ? (
                            <Badge variant="secondary" className="bg-amber-500/10 text-amber-500 border border-amber-500/20 text-[11px]">
                                PARTIAL RESERVATION
                            </Badge>
                        ) : (
                            <Badge variant="secondary" className="bg-amber-500/10 text-amber-500 border border-amber-500/20 text-[11px]">
                                <Unlock className="h-3 w-3 mr-1" />
                                SOFT RESERVATION
                            </Badge>
                        )}
                        {jobOrder.has_shortage && (
                            <Badge variant="destructive" className="animate-pulse text-[11px]">
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                STOCK SHORTAGE HOLD
                            </Badge>
                        )}
                    </div>
                    <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground flex items-center gap-2">
                        {jobOrder.product_name}
                        {jobOrder.version_name && (
                            <span className="text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                                {jobOrder.version_name}
                            </span>
                        )}
                    </h2>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap pt-0.5">
                        <span>Target: <strong className="text-foreground">{jobOrder.target_quantity.toLocaleString()} units</strong></span>
                        <span>&bull;</span>
                        <span>Work Center: <strong className="text-foreground">{jobOrder.primary_work_center_name}</strong></span>
                        <span>&bull;</span>
                        <span>Target Bin: <code className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">{jobOrder.suggested_staging_bin || "No active destination"}</code></span>
                        <span>&bull;</span>
                        <span>Shift: <strong className="text-foreground">{jobOrder.shift_option || "Shift 1"}</strong></span>
                    </div>
                </div>

                {/* Actions Toolbar */}
                <div className="flex items-center gap-2 w-full lg:w-auto shrink-0">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handlePrintPickList}
                        className="text-xs h-9"
                    >
                        <Printer className="h-4 w-4 mr-1.5" />
                        Print Staging Slip
                    </Button>

                    <Button
                        size="sm"
                        onClick={() => onStageAllAvailable(jobOrder)}
                        disabled={isProcessing || isAllStaged}
                        className="text-xs h-9 font-semibold shadow-sm"
                    >
                        {isProcessing ? (
                            "Staging..."
                        ) : isAllStaged ? (
                            <>
                                <CheckCircle2 className="h-4 w-4 mr-1.5 text-emerald-300" />
                                All Materials Staged
                            </>
                        ) : (
                            <>
                                <Sparkles className="h-4 w-4 mr-1.5" />
                                Stage All Available
                            </>
                        )}
                    </Button>
                </div>
            </div>

            {/* Staging Readiness Progress Bar */}
            <div className="bg-muted/30 rounded-xl p-4 border border-border/80 space-y-2">
                <div className="flex justify-between items-center text-xs">
                    <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground">Floor Readiness Progress:</span>
                        <span className="font-mono font-bold text-primary">{jobOrder.staging_percentage}% Complete</span>
                    </div>
                    <span className="text-muted-foreground">
                        <strong className="text-foreground">{jobOrder.staged_materials_count}</strong> of{" "}
                        <strong className="text-foreground">{jobOrder.total_materials_count}</strong> Materials Staged to Floor Bin
                    </span>
                </div>
                <Progress value={jobOrder.staging_percentage} className="h-2.5 bg-muted" />
            </div>

            {/* Allocated Materials Pick List Table */}
            <div className="rounded-xl border border-border overflow-hidden bg-background">
                <div className="p-3.5 bg-muted/40 border-b border-border flex items-center justify-between">
                    <div className="flex items-center gap-2 font-semibold text-xs text-foreground uppercase tracking-wider">
                        <Boxes className="h-4 w-4 text-primary" />
                        Allocated Bill of Materials & Lot Breakdown
                    </div>
                    <span className="text-xs text-muted-foreground">
                        {jobOrder.materials.length} component line(s)
                    </span>
                </div>

                {jobOrder.materials.length === 0 ? (
                    <div className="p-8 text-center text-xs text-muted-foreground">
                        No material requirements found for this Job Order version.
                    </div>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted/20 text-xs">
                                <TableHead className="w-8"></TableHead>
                                <TableHead className="font-semibold">Component / SKU</TableHead>
                                <TableHead className="text-right font-semibold">Required Qty</TableHead>
                                <TableHead className="text-right font-semibold">Staged Qty</TableHead>
                                <TableHead className="text-right font-semibold">Main Store On-Hand</TableHead>
                                <TableHead className="font-semibold">Staging Bin</TableHead>
                                <TableHead className="font-semibold">Reservation</TableHead>
                                <TableHead className="text-right font-semibold">Staging Action</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {jobOrder.materials.map((mat) => {
                                const isExpanded = !!expandedMaterials[mat.jo_material_id];
                                const hasShortage = mat.has_shortage;
                                const isHard = mat.reservation_status === "HARD";
                                const isPartial = mat.reservation_status === "PARTIAL";

                                return (
                                    <React.Fragment key={mat.jo_material_id}>
                                        <TableRow className={`text-xs hover:bg-muted/40 transition-colors ${hasShortage ? "bg-red-500/[0.03]" : ""}`}>
                                            <TableCell className="p-2 text-center">
                                                <button
                                                    type="button"
                                                    onClick={() => toggleExpandMaterial(mat.jo_material_id)}
                                                    className="p-1 rounded hover:bg-muted text-muted-foreground"
                                                >
                                                    {isExpanded ? (
                                                        <ChevronDown className="h-4 w-4" />
                                                    ) : (
                                                        <ChevronRight className="h-4 w-4" />
                                                    )}
                                                </button>
                                            </TableCell>
                                            <TableCell className="font-medium">
                                                <div className="space-y-0.5">
                                                    <div className="font-semibold text-foreground flex items-center gap-2">
                                                        {mat.product_name}
                                                        {hasShortage && (
                                                            <span className="text-[10px] text-red-500 bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded font-mono font-medium">
                                                                Shortage: -{mat.shortage_quantity} {mat.uom}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="text-[11px] text-muted-foreground font-mono">
                                                        {mat.product_code} &bull; {mat.allocations.length} lot(s)
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right font-mono font-semibold text-foreground">
                                                {mat.required_quantity.toLocaleString()} {mat.uom}
                                            </TableCell>
                                            <TableCell className="text-right font-mono font-semibold">
                                                <span className={mat.is_staged ? "text-emerald-500" : "text-amber-500"}>
                                                    {mat.staged_quantity.toLocaleString()} {mat.uom}
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-right font-mono font-medium">
                                                <span className={mat.on_hand_quantity < mat.required_quantity ? "text-red-500 font-bold" : "text-muted-foreground"}>
                                                    {mat.on_hand_quantity.toLocaleString()} {mat.uom}
                                                </span>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-1.5 font-mono text-[11px]">
                                                    <Warehouse className="h-3.5 w-3.5 text-muted-foreground" />
                                                    <span className={mat.is_staged ? "text-emerald-500 font-semibold" : "text-foreground"}>
                                                        {mat.staging_bin}
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                {isHard ? (
                                                    <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-[10px] font-semibold">
                                                        <Lock className="h-2.5 w-2.5 mr-1" />
                                                        HARD
                                                    </Badge>
                                                ) : isPartial ? (
                                                    <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 text-[10px] font-semibold">
                                                        PARTIAL
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 text-[10px] font-semibold">
                                                        <Unlock className="h-2.5 w-2.5 mr-1" />
                                                        SOFT
                                                    </Badge>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button
                                                    variant={mat.is_staged ? "outline" : "default"}
                                                    size="sm"
                                                    onClick={() => onOpenTransferModal(jobOrder, mat)}
                                                    disabled={isProcessing}
                                                    className="text-xs h-7 px-2.5 shadow-none"
                                                >
                                                    {mat.is_staged ? (
                                                        <>Re-stage</>
                                                    ) : (
                                                        <>
                                                            <ArrowRight className="h-3.5 w-3.5 mr-1" />
                                                            Stage to Bin
                                                        </>
                                                    )}
                                                </Button>
                                            </TableCell>
                                        </TableRow>

                                        {/* Expandable Lot Allocations Row */}
                                        {isExpanded && (
                                            <TableRow className="bg-muted/15 border-b border-border">
                                                <TableCell colSpan={8} className="p-3 pl-12">
                                                    <div className="rounded-lg border border-border/80 bg-background/80 p-3 space-y-2">
                                                        <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
                                                            <span>Allocated Lot Breakdown for {mat.product_name}</span>
                                                            <span>{mat.allocations.length} Assigned Lot(s)</span>
                                                        </div>

                                                        <div className="space-y-1.5">
                                                            {mat.allocations.map((lot, lIdx) => (
                                                                <div
                                                                    key={lIdx}
                                                                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2 rounded-md bg-muted/30 border border-border/50 text-xs"
                                                                >
                                                                    <div className="flex items-center gap-3">
                                                                        <span className="font-mono font-bold text-foreground">
                                                                            {lot.batch_no}
                                                                        </span>
                                                                        <Badge variant="outline" className="text-[10px] bg-background">
                                                                            QA: {lot.qa_status || "Passed"}
                                                                        </Badge>
                                                                        {lot.expiry_date && (
                                                                            <span className="text-[11px] text-muted-foreground">
                                                                                Exp: {lot.expiry_date}
                                                                            </span>
                                                                        )}
                                                                    </div>

                                                                    <div className="flex items-center gap-4">
                                                                        <div className="text-[11px] text-muted-foreground">
                                                                            Allocated: <strong className="font-mono text-foreground">{lot.allocated_quantity} {mat.uom}</strong>
                                                                        </div>
                                                                        <div className="text-[11px] text-muted-foreground">
                                                                            Bin: <code className="font-mono text-foreground font-semibold">{lot.staging_bin}</code>
                                                                        </div>
                                                                        <Badge
                                                                            variant="outline"
                                                                            className={
                                                                                lot.reservation_status === "HARD"
                                                                                    ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30 text-[10px]"
                                                                                    : "bg-amber-500/10 text-amber-500 border-amber-500/30 text-[10px]"
                                                                            }
                                                                        >
                                                                            {lot.reservation_status}
                                                                        </Badge>
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="sm"
                                                                            onClick={() => onOpenTransferModal(jobOrder, mat, lot)}
                                                                            disabled={isProcessing}
                                                                            className="h-6 text-[11px] px-2 text-primary hover:bg-primary/10"
                                                                        >
                                                                            Stage Lot
                                                                        </Button>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </TableBody>
                    </Table>
                )}
            </div>
        </div>
    );
}

export default StagingPickList;
