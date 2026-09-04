"use client";

import React, { useState, useEffect } from "react";
import { 
    History, 
    ArrowRight, 
    Calendar, 
    User, 
    CheckCircle2, 
    RotateCcw, 
    Clock, 
    Loader2,
    RefreshCw
} from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { JobOrder, JobOrderStatusHistory } from "../types";
import { fetchJobOrderStatusHistory } from "../services/qa-api";

interface JobOrderStatusHistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    jobOrder: JobOrder | null;
}

export function JobOrderStatusHistoryModal({
    isOpen,
    onClose,
    jobOrder
}: JobOrderStatusHistoryModalProps) {
    if (!jobOrder) return null;

    const joIdInt = Number(jobOrder.job_order_id || jobOrder.id || jobOrder.order_id);

    return (
        <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
            <DialogContent className="w-[calc(100vw-1rem)] max-w-lg max-h-[calc(100dvh-1rem)] overflow-hidden p-0 gap-0 flex flex-col">
                <JobOrderStatusHistoryContent
                    key={joIdInt}
                    joIdInt={joIdInt}
                    jobOrder={jobOrder}
                    onClose={onClose}
                />
            </DialogContent>
        </Dialog>
    );
}

function JobOrderStatusHistoryContent({
    joIdInt,
    jobOrder,
    onClose
}: {
    joIdInt: number;
    jobOrder: JobOrder;
    onClose: () => void;
}) {
    const [history, setHistory] = useState<JobOrderStatusHistory[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let isMounted = true;
        if (joIdInt) {
            fetchJobOrderStatusHistory(joIdInt)
                .then(data => {
                    if (isMounted) setHistory(data);
                })
                .catch(err => {
                    console.error("Error loading status history:", err);
                    if (isMounted) setError(err instanceof Error ? err.message : "Failed to load status history.");
                })
                .finally(() => {
                    if (isMounted) setLoading(false);
                });
        }
        return () => {
            isMounted = false;
        };
    }, [joIdInt]);

    const joNo = jobOrder.job_order_no || jobOrder.jo_id || "";

    return (
        <>
            <DialogHeader className="p-5 border-b bg-muted/20 sticky top-0 z-10 backdrop-blur-md">
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <History className="h-5 w-5" />
                    </div>
                    <div>
                        <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
                            Status Transition Audit Trail
                            <Badge variant="outline" className="font-mono text-xs">
                                {joNo}
                            </Badge>
                        </DialogTitle>
                        <DialogDescription className="text-xs text-muted-foreground mt-0.5 truncate max-w-sm">
                            Product: <span className="font-semibold text-foreground">{jobOrder.product_name}</span>
                        </DialogDescription>
                    </div>
                </div>
            </DialogHeader>

                <div className="min-h-0 flex-1 overflow-y-auto p-5 space-y-4 scrollbar-thin">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center p-12 text-muted-foreground">
                            <Loader2 className="h-6 w-6 animate-spin text-primary mb-2" />
                            <span className="text-xs font-semibold">Loading status transition logs...</span>
                        </div>
                    ) : error ? (
                        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center">
                            <p className="text-sm font-semibold text-destructive">{error}</p>
                            <Button type="button" variant="outline" className="min-h-11 gap-2" onClick={() => {
                                setError(null);
                                setLoading(true);
                                fetchJobOrderStatusHistory(joIdInt)
                                    .then(setHistory)
                                    .catch(err => setError(err instanceof Error ? err.message : "Failed to load status history."))
                                    .finally(() => setLoading(false));
                            }}>
                                <RefreshCw className="h-4 w-4" /> Retry
                            </Button>
                        </div>
                    ) : history.length === 0 ? (
                        <div className="flex flex-col items-center justify-center p-10 text-center border rounded-xl border-dashed">
                            <Clock className="h-8 w-8 text-muted-foreground/40 mb-2" />
                            <h4 className="text-xs font-bold text-foreground">No Historical Transitions</h4>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                                Current Job Order status: <Badge variant="secondary" className="text-[10px] ml-1">{jobOrder.status}</Badge>
                            </p>
                        </div>
                    ) : (
                        <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
                            {history.map((h, idx) => {
                                const isCompleted = h.new_status === "COMPLETED";
                                const isRework = h.new_status.includes("REWORK") || (h.remarks || "").includes("Rework");

                                return (
                                    <div key={h.history_id || idx} className="relative group">
                                        {/* Timeline Node Dot */}
                                        <div className={`absolute -left-6 top-1.5 h-5 w-5 rounded-full border-2 bg-background flex items-center justify-center ${
                                            isCompleted 
                                                ? "border-emerald-500 text-emerald-500" 
                                                : isRework 
                                                ? "border-amber-500 text-amber-500" 
                                                : "border-primary text-primary"
                                        }`}>
                                            {isCompleted ? (
                                                <CheckCircle2 className="h-3 w-3" />
                                            ) : isRework ? (
                                                <RotateCcw className="h-3 w-3" />
                                            ) : (
                                                <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                                            )}
                                        </div>

                                        {/* Content Box */}
                                        <div className="bg-card border rounded-xl p-3.5 space-y-2 shadow-2xs">
                                            {/* Status Badge Transition */}
                                            <div className="flex items-center justify-between gap-2 flex-wrap">
                                                <div className="flex items-center gap-1.5">
                                                    {h.old_status && (
                                                        <>
                                                            <Badge variant="outline" className="text-[10px] font-semibold">
                                                                {h.old_status}
                                                            </Badge>
                                                            <ArrowRight className="h-3 w-3 text-muted-foreground" />
                                                        </>
                                                    )}
                                                    <Badge 
                                                        variant={isCompleted ? "default" : isRework ? "destructive" : "secondary"}
                                                        className={`text-[10px] font-bold ${
                                                            isCompleted ? "bg-emerald-600 text-white" : ""
                                                        }`}
                                                    >
                                                        {h.new_status}
                                                    </Badge>
                                                </div>

                                                <span className="text-[10px] text-muted-foreground font-mono flex items-center gap-1">
                                                    <Calendar className="h-3 w-3" />
                                                    {h.changed_at ? new Date(h.changed_at).toLocaleString() : "N/A"}
                                                </span>
                                            </div>

                                            {/* Remarks */}
                                            {h.remarks && (
                                                <p className="text-xs text-foreground bg-muted/30 p-2 rounded-lg border leading-relaxed font-medium">
                                                    {h.remarks}
                                                </p>
                                            )}

                                            {/* Changed By User */}
                                            <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t border-dashed">
                                                <span className="flex items-center gap-1">
                                                    <User className="h-3 w-3" />
                                                    {h.changed_by_name || (h.changed_by ? `User #${h.changed_by}` : "System Admin")}
                                                </span>
                                                <span className="font-mono text-[10px]">
                                                    Log #{h.history_id || idx + 1}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                <DialogFooter className="sticky bottom-0 z-10 p-4 border-t bg-background/95 backdrop-blur">
                    <Button variant="outline" size="sm" onClick={onClose} className="min-h-11 text-sm">
                        Close
                    </Button>
                </DialogFooter>
            </>
        );
    }
