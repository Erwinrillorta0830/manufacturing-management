/* eslint-disable */
import React, { useState, useEffect } from "react";
import {
    GitBranch,
    Layers,
    FileText,
    ArrowDownRight,
    Tag,
    Calendar,
    User,
    CheckCircle2,
    Loader2,
    Printer,
    Search
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { JobOrder, MaterialGenealogyRecord } from "../types";
import { fetchGenealogyAndMovements } from "../services/production-api";
import { toast } from "sonner";

interface GenealogyAuditModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    selectedJobOrder: JobOrder;
}

export function GenealogyAuditModal({
    open,
    onOpenChange,
    selectedJobOrder
}: GenealogyAuditModalProps) {
    const [loading, setLoading] = useState(false);
    const [genealogy, setGenealogy] = useState<MaterialGenealogyRecord[]>([]);
    const [movements, setMovements] = useState<any[]>([]);
    const [searchFilter, setSearchFilter] = useState("");

    useEffect(() => {
        if (open && selectedJobOrder && (selectedJobOrder.order_id || selectedJobOrder.job_order_id)) {
            setLoading(true);
            const joId = selectedJobOrder.order_id || selectedJobOrder.job_order_id;
            fetchGenealogyAndMovements(joId!)
                .then((data) => {
                    setGenealogy(data.genealogy || []);
                    setMovements(data.movements || []);
                })
                .catch((err) => toast.error(err.message || "Failed to load genealogy records"))
                .finally(() => setLoading(false));
        }
    }, [open, selectedJobOrder]);

    const filteredGenealogy = genealogy.filter((g) => {
        const query = searchFilter.toLowerCase();
        return (
            g.finished_batch_no.toLowerCase().includes(query) ||
            g.raw_product_name.toLowerCase().includes(query) ||
            g.raw_batch_no.toLowerCase().includes(query)
        );
    });

    const handlePrintGenealogy = () => {
        const rowsHtml = filteredGenealogy.length === 0
            ? "<tr><td colspan='5' style='text-align: center; padding: 15px; color: #888;'>No genealogy records found.</td></tr>"
            : filteredGenealogy.map((g) => `
                <tr>
                    <td style="padding: 10px; border-bottom: 1px solid #eee; font-family: monospace; font-weight: bold;">${g.finished_batch_no}</td>
                    <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: 600;">${g.raw_product_name}</td>
                    <td style="padding: 10px; border-bottom: 1px solid #eee; font-family: monospace; color: #0284c7; font-weight: bold;">${g.raw_batch_no}</td>
                    <td style="padding: 10px; border-bottom: 1px solid #eee; font-family: monospace; text-align: right;">${Number(g.quantity_consumed).toLocaleString()} ${g.unit_shortcut || "units"}</td>
                    <td style="padding: 10px; border-bottom: 1px solid #eee; font-size: 11px; color: #666;">${new Date(g.created_at).toLocaleString()}</td>
                </tr>
            `).join("");

        const printWindow = window.open("", "_blank");
        if (!printWindow) return;

        printWindow.document.write(`
            <html>
            <head>
                <title>Material Genealogy & Traceability Certificate - JO #${selectedJobOrder.order_no || selectedJobOrder.jo_id}</title>
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 40px; color: #1e293b; }
                    .header { border-bottom: 2px solid #0f172a; padding-bottom: 15px; margin-bottom: 20px; }
                    .header h1 { margin: 0; font-size: 22px; text-transform: uppercase; }
                    .header p { margin: 4px 0 0 0; color: #64748b; font-size: 12px; }
                    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; background: #f8fafc; padding: 15px; border-radius: 8px; margin-bottom: 25px; font-size: 13px; }
                    table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 15px; }
                    th { background: #f1f5f9; text-align: left; padding: 10px; font-weight: 700; border-bottom: 2px solid #cbd5e1; font-size: 11px; text-transform: uppercase; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>Point-of-Use Material Genealogy Certificate</h1>
                    <p>Antigravity Manufacturing Management System • Real-Time Backflushing Audit</p>
                </div>
                <div class="meta-grid">
                    <div>
                        <div><strong>Job Order No:</strong> ${selectedJobOrder.order_no || selectedJobOrder.jo_id}</div>
                        <div><strong>Finished Product:</strong> ${selectedJobOrder.product_name}</div>
                    </div>
                    <div>
                        <div><strong>Target Quantity:</strong> ${selectedJobOrder.quantity.toLocaleString()} pcs</div>
                        <div><strong>Audit Date:</strong> ${new Date().toLocaleString()}</div>
                    </div>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>Output Finished Batch</th>
                            <th>Raw Material Component</th>
                            <th>Component Source Batch</th>
                            <th style="text-align: right;">Quantity Backflushed</th>
                            <th>Timestamp</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml}
                    </tbody>
                </table>
                <script>
                    window.onload = function() { window.print(); window.onafterprint = function() { window.close(); }; };
                </script>
            </body>
            </html>
        `);
        printWindow.document.close();
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-[96vw] md:w-full md:max-w-[1100px] max-h-[92vh] flex flex-col bg-background border border-border/80 shadow-2xl rounded-2xl p-0 overflow-hidden">
                <div className="bg-gradient-to-r from-primary/15 via-primary/5 to-background p-4 sm:p-5 border-b border-border/50 shrink-0">
                    <DialogHeader>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-primary/10 rounded-2xl text-primary border border-primary/20 shadow-sm">
                                    <GitBranch className="h-6 w-6" />
                                </div>
                                <div>
                                    <DialogTitle className="font-extrabold text-lg sm:text-xl tracking-tight text-foreground">
                                        Material Genealogy & Backflushing Audit
                                    </DialogTitle>
                                    <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                                        Immutable point-of-use consumption ledger linking component raw lots to finished goods for <strong className="text-foreground">Job Order #{selectedJobOrder?.order_no || selectedJobOrder?.jo_id}</strong>.
                                    </DialogDescription>
                                </div>
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handlePrintGenealogy}
                                className="hidden sm:flex items-center gap-1.5 text-xs font-bold"
                            >
                                <Printer className="h-4 w-4" /> Print Certificate
                            </Button>
                        </div>
                    </DialogHeader>
                </div>

                <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 min-h-0">
                    {/* Search filter */}
                    <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                            <input
                                type="text"
                                placeholder="Filter by Finished Batch, Raw Material, or Lot Code..."
                                value={searchFilter}
                                onChange={(e) => setSearchFilter(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
                            />
                        </div>
                        <Badge variant="outline" className="font-mono text-xs px-2.5 py-1">
                            {filteredGenealogy.length} Records
                        </Badge>
                    </div>

                    {loading ? (
                        <div className="py-16 text-center text-muted-foreground text-xs">
                            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-primary" />
                            Loading genealogy and backflushing movements...
                        </div>
                    ) : filteredGenealogy.length === 0 ? (
                        <div className="p-8 text-center bg-muted/10 border border-dashed rounded-2xl text-muted-foreground text-xs space-y-2">
                            <Layers className="h-8 w-8 mx-auto text-muted-foreground/60" />
                            <p className="font-medium">No point-of-use material consumption records found for this Job Order yet.</p>
                            <p className="text-[11px]">Records are automatically created when shift yields and staging component consumptions are logged.</p>
                        </div>
                    ) : (
                        <div className="border border-border/80 rounded-2xl overflow-hidden shadow-sm">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs">
                                    <thead className="bg-muted/40 border-b border-border/60 text-muted-foreground font-bold uppercase tracking-wider text-[10px]">
                                        <tr>
                                            <th className="p-3">Finished Batch No</th>
                                            <th className="p-3">Raw Component Material</th>
                                            <th className="p-3">Staging Source Lot / Batch</th>
                                            <th className="p-3 text-right">Backflushed Qty</th>
                                            <th className="p-3">Logged By</th>
                                            <th className="p-3">Timestamp</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border/40">
                                        {filteredGenealogy.map((rec, index) => (
                                            <tr key={rec.genealogy_id || rec.id || index} className="hover:bg-muted/10 transition-colors">
                                                <td className="p-3 font-mono font-bold text-foreground">
                                                    <span className="bg-primary/10 text-primary px-2 py-0.5 rounded border border-primary/20">
                                                        {rec.finished_batch_no}
                                                    </span>
                                                </td>
                                                <td className="p-3 font-semibold text-foreground">
                                                    {rec.raw_product_name}
                                                </td>
                                                <td className="p-3 font-mono text-cyan-600 dark:text-cyan-400 font-bold">
                                                    {rec.raw_batch_no}
                                                </td>
                                                <td className="p-3 text-right font-mono font-bold text-foreground">
                                                    {Number(rec.quantity_consumed).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })} {rec.unit_shortcut || "units"}
                                                </td>
                                                <td className="p-3 text-muted-foreground font-medium">
                                                    {rec.created_by_name || "Operator"}
                                                </td>
                                                <td className="p-3 text-muted-foreground font-mono text-[11px]">
                                                    {new Date(rec.created_at).toLocaleString()}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter className="p-4 border-t border-border/50 bg-muted/5 flex justify-between items-center">
                    <span className="text-[11px] text-muted-foreground font-mono">
                        Source Document: JO #{selectedJobOrder.order_no || selectedJobOrder.jo_id}
                    </span>
                    <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="text-xs font-semibold">
                        Close
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
