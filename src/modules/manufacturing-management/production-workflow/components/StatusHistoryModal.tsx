/* eslint-disable */
import React, { useState, useEffect } from "react";
import {
    History,
    Clock,
    User,
    Building2,
    CheckCircle2,
    ArrowRight,
    Loader2
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { JobOrder, JobOrderStatusHistoryRecord } from "../types";
import { fetchJobOrderStatusHistory } from "../services/production-api";
import { toast } from "sonner";

interface StatusHistoryModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    selectedJobOrder: JobOrder;
}

export function StatusHistoryModal({
    open,
    onOpenChange,
    selectedJobOrder
}: StatusHistoryModalProps) {
    const [history, setHistory] = useState<JobOrderStatusHistoryRecord[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (open && selectedJobOrder && (selectedJobOrder.order_id || selectedJobOrder.job_order_id)) {
            setLoading(true);
            const joId = selectedJobOrder.order_id || selectedJobOrder.job_order_id;
            fetchJobOrderStatusHistory(joId!)
                .then((data) => setHistory(data || []))
                .catch((err) => toast.error(err.message || "Failed to load status history"))
                .finally(() => setLoading(false));
        }
    }, [open, selectedJobOrder]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-[96vw] md:w-full md:max-w-[750px] max-h-[88vh] flex flex-col bg-background border border-border/80 shadow-2xl rounded-2xl p-0 overflow-hidden">
                <div className="bg-gradient-to-r from-primary/15 via-primary/5 to-background p-4 sm:p-5 border-b border-border/50 shrink-0">
                    <DialogHeader>
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-primary/10 rounded-2xl text-primary border border-primary/20 shadow-sm">
                                <History className="h-6 w-6" />
                            </div>
                            <div>
                                <DialogTitle className="font-extrabold text-lg sm:text-xl tracking-tight text-foreground">
                                    Station Check-in & Status History
                                </DialogTitle>
                                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                                    Audit trail of station scans and status transitions recorded in <code className="font-mono text-primary font-bold">manufacturing_job_order_status_history</code>.
                                </DialogDescription>
                            </div>
                        </div>
                    </DialogHeader>
                </div>

                <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 min-h-0">
                    {loading ? (
                        <div className="py-12 text-center text-xs text-muted-foreground">
                            <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2 text-primary" /> Loading status history...
                        </div>
                    ) : history.length === 0 ? (
                        <div className="p-8 text-center bg-muted/10 border border-dashed rounded-2xl text-muted-foreground text-xs space-y-1">
                            <Clock className="h-6 w-6 mx-auto text-muted-foreground/60 mb-2" />
                            <p className="font-medium">No status history records found for this Job Order yet.</p>
                            <p className="text-[11px]">Station scans and status transitions will automatically record events here.</p>
                        </div>
                    ) : (
                        <div className="relative border-l-2 border-primary/30 ml-4 pl-4 space-y-6">
                            {history.map((rec, index) => (
                                <div key={rec.history_id || rec.id || index} className="relative group">
                                    {/* Timeline node */}
                                    <div className="absolute -left-[25px] top-1.5 h-4 w-4 rounded-full bg-background border-2 border-primary group-hover:scale-125 transition-transform" />

                                    <div className="p-3.5 bg-card border border-border/80 rounded-xl space-y-2 hover:border-primary/40 transition-colors shadow-sm">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <div className="flex items-center gap-2">
                                                {rec.previous_status && (
                                                    <>
                                                        <Badge variant="outline" className="text-[10px] font-semibold">
                                                            {rec.previous_status}
                                                        </Badge>
                                                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                                                    </>
                                                )}
                                                <Badge className="bg-primary text-primary-foreground text-[10px] font-bold">
                                                    {rec.status}
                                                </Badge>
                                            </div>
                                            <span className="text-[11px] font-mono text-muted-foreground font-semibold">
                                                {new Date(rec.changed_at).toLocaleString()}
                                            </span>
                                        </div>

                                        {rec.remarks && (
                                            <p className="text-xs font-medium text-foreground bg-muted/20 p-2 rounded-lg border border-border/40">
                                                {rec.remarks}
                                            </p>
                                        )}

                                        <div className="flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground pt-1 border-t border-border/30 font-medium">
                                            {rec.work_center_name && (
                                                <span className="flex items-center gap-1">
                                                    <Building2 className="h-3.5 w-3.5 text-primary/80" /> Station: <strong className="text-foreground">{rec.work_center_name}</strong>
                                                </span>
                                            )}
                                            <span className="flex items-center gap-1">
                                                <User className="h-3.5 w-3.5 text-primary/80" /> Operator: <strong className="text-foreground">{rec.changed_by_name || `User #${rec.changed_by}`}</strong>
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <DialogFooter className="p-4 border-t border-border/50 bg-muted/5 flex justify-end">
                    <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="text-xs font-semibold">
                        Close
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
