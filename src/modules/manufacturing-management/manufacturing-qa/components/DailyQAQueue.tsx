/* eslint-disable */
import React from "react";
import { Loader2, ClipboardCheck, AlertCircle, CheckCircle2, ChevronRight } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatPhtTimestamp } from "../../shared/pht-date";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { deriveDailyQAOutcome, getDailyQAAuditStatus } from "../daily-qa-outcome";

interface DailyQAQueueProps {
    yieldLedger: any[];
    dailyInspections: any[];
    loadingDailyQA: boolean;
    isDailyAuditOpen: boolean;
    setIsDailyAuditOpen: (open: boolean) => void;
    selectedLedgerEntry: any | null;
    moisturePct: string;
    setMoisturePct: (val: string) => void;
    acidityPh: string;
    setAcidityPh: (val: string) => void;
    sensoryStatus: "Passed" | "Failed";
    setSensoryStatus: (val: "Passed" | "Failed") => void;
    weightCheckPassed: boolean;
    setWeightCheckPassed: (val: boolean) => void;
    dailyLabStatus: "Pending" | "Passed" | "Failed";
    setDailyLabStatus: (val: "Pending" | "Passed" | "Failed") => void;
    dailyActionTaken: "Released" | "Quarantined" | "Scrapped";
    setDailyActionTaken: (val: "Released" | "Quarantined" | "Scrapped") => void;
    dailyRemarks: string;
    setDailyRemarks: (val: string) => void;
    handleOpenDailyAuditDialog: (entry: any) => void;
    handleSubmitDailyAudit: () => void;
    actionLoading: boolean;
    qaLogs: any[];
    selectedRouteId: number | null;
    setSelectedRouteId: (id: number | null) => void;
    routes: any[];
    jobOrders: any[];
    qaTemplates: any[];
    qaParamValues: Record<number, string>;
    setQaParamValues: (val: Record<number, string>) => void;
}

export function DailyQAQueue({
    yieldLedger,
    dailyInspections,
    loadingDailyQA,
    isDailyAuditOpen,
    setIsDailyAuditOpen,
    selectedLedgerEntry,
    moisturePct,
    setMoisturePct,
    acidityPh,
    setAcidityPh,
    sensoryStatus,
    setSensoryStatus,
    weightCheckPassed,
    setWeightCheckPassed,
    dailyLabStatus,
    setDailyLabStatus,
    dailyActionTaken,
    setDailyActionTaken,
    dailyRemarks,
    setDailyRemarks,
    handleOpenDailyAuditDialog,
    handleSubmitDailyAudit,
    actionLoading,
    qaLogs,
    selectedRouteId,
    setSelectedRouteId,
    routes,
    jobOrders,
    qaTemplates,
    qaParamValues,
    setQaParamValues
}: DailyQAQueueProps) {

    // Filter qaLogs to find matching operator checklist parameter entries for selected yield ledger entry's job_order_id, shift, and selectedRouteId
    const matchingLogs = React.useMemo(() => {
        if (!selectedLedgerEntry || !qaLogs) return [];
        return qaLogs.filter((log: any) => {
            const taskId = log.task_id;
            if (!taskId || typeof taskId !== "object") return false;

            // Match Job Order
            const logJoId = String(taskId.jo_id || "").toLowerCase();
            const ledgerJoId = String(selectedLedgerEntry.job_order_id || "").toLowerCase();
            const ledgerJoNo = String(selectedLedgerEntry.job_order_no || "").toLowerCase();
            const matchesJO = (ledgerJoNo && logJoId.includes(ledgerJoNo)) || 
                              (ledgerJoId && logJoId.includes(ledgerJoId)) || 
                              (logJoId && (ledgerJoNo.includes(logJoId) || ledgerJoId.includes(logJoId)));

            // Match Shift
            const logComments = String(log.comments || "").toLowerCase();
            const ledgerShift = String(selectedLedgerEntry.shift_name || "").toLowerCase();
            const matchesShift = ledgerShift && (
                logComments.includes(ledgerShift) ||
                ledgerShift.split(" ").some(word => word.length > 2 && logComments.includes(word))
            );

            // Match Route Step
            const matchesRoute = selectedRouteId ? Number(taskId.jo_route_id || taskId.id || log.jo_route_id) === Number(selectedRouteId) : true;

            return matchesJO && matchesShift && matchesRoute;
        });
    }, [qaLogs, selectedLedgerEntry, selectedRouteId]);

    // Build routes map to resolve jo_route_id to step name
    const routesMap = React.useMemo(() => {
        const map = new Map<number, string>();
        jobOrders.forEach((jo: any) => {
            const tasks = jo.routing_tasks || jo.routingTasks || [];
            tasks.forEach((t: any) => {
                if (t.id) {
                    map.set(Number(t.id), t.name || `Step #${t.id}`);
                }
            });
        });
        return map;
    }, [jobOrders]);

    const activeTemplate = React.useMemo(() => {
        if (!selectedRouteId || !routes) return null;
        const task = routes.find((r: any) => Number(r.id) === Number(selectedRouteId));
        if (!task || !task.qa_template_id) return null;
        return qaTemplates.find((t: any) => Number(t.template_id) === Number(task.qa_template_id)) || null;
    }, [selectedRouteId, routes, qaTemplates]);

    const activeParameters = React.useMemo(() => {
        return activeTemplate ? activeTemplate.parameters || [] : [];
    }, [activeTemplate]);

    const hasFailedParam = React.useMemo(() => {
        return activeParameters.some((param: any) => {
            const val = qaParamValues[param.parameter_id];
            if (!val) return false;
            if (param.test_type === "Numeric") {
                const num = parseFloat(val);
                if (!isNaN(num)) {
                    if (param.min_value !== null && num < Number(param.min_value)) return true;
                    if (param.max_value !== null && num > Number(param.max_value)) return true;
                }
            } else if (param.test_type === "Boolean" || param.test_type === "Pass/Fail" || param.test_type === "Yes/No") {
                if (val === "Fail" || val === "false" || val === "No") return true;
            }
            return false;
        });
    }, [qaParamValues, activeParameters]);

    if (loadingDailyQA) {
        return (
            <div className="flex justify-center items-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="rounded-xl border bg-card shadow-sm">
                <div className="p-4 border-b">
                    <h3 className="font-bold text-base">Shift Yield Progress Logs</h3>
                    <p className="text-xs text-muted-foreground">List of all yields logged. Record in-process daily QA inspections to authorize releases.</p>
                </div>

                {yieldLedger.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground italic text-sm">
                        No yields recorded in the ledger yet. Daily shift yields will display here once logged from WIP terminals.
                    </div>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="font-mono text-xs">Job Order No</TableHead>
                                <TableHead className="text-xs">Shift Details</TableHead>
                                <TableHead className="text-xs font-mono">Yield Qty</TableHead>
                                <TableHead className="text-xs">Logged At</TableHead>
                                <TableHead className="text-xs text-center">Process QA Status</TableHead>
                                <TableHead className="text-xs text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {yieldLedger.map((entry: any, idx: number) => {
                                const audits = dailyInspections.filter((ins: any) => Number(ins.ledger_id) === Number(entry.ledger_id || entry.id));
                                const rowJo = jobOrders.find((j: any) => Number(j.job_order_id || j.id) === Number(entry.job_order_id));
                                const rowRoutes = rowJo 
                                    ? [...(rowJo.routing_tasks || rowJo.routingTasks || [])].sort((a, b) => Number(a.sequence_order || 0) - Number(b.sequence_order || 0))
                                    : [];
                                const outcome = deriveDailyQAOutcome(
                                    audits,
                                    rowRoutes.map((route: any) => route.id)
                                );

                                return (
                                    <TableRow key={entry.id || entry.ledger_id || idx}>
                                        <TableCell className="font-mono font-bold text-xs">{entry.job_order_no || `JO #${entry.job_order_id}`}</TableCell>
                                        <TableCell className="text-xs font-medium text-muted-foreground">{entry.shift_name}</TableCell>
                                        <TableCell className="text-xs font-mono font-bold">{Number(entry.yield_quantity || 0).toLocaleString()} pcs</TableCell>
                                        <TableCell className="text-xs text-muted-foreground">{formatPhtTimestamp(entry.logged_at)}</TableCell>
                                        <TableCell className="text-xs text-center">
                                            <div className="flex flex-wrap justify-center items-center gap-1">
                                                {rowRoutes.length > 0 ? (
                                                    rowRoutes.map((r: any, rIdx: number) => {
                                                        const audit = audits.find((a: any) => Number(a.jo_route_id) === Number(r.id));
                                                        const stepName = r.name || `Step #${r.id}`;
                                                        
                                                        let badgeColor = "border-amber-500/30 text-amber-400 bg-amber-500/5";
                                                        let labelText = `${r.sequence_order}. ${stepName}`;
                                                        
                                                        if (audit) {
                                                            const hasPh = audit.acidity_ph !== undefined && audit.acidity_ph !== null && audit.acidity_ph !== "N/A" && audit.acidity_ph !== "";
                                                            const hasMoisture = audit.moisture_percentage !== undefined && audit.moisture_percentage !== null && audit.moisture_percentage !== "N/A" && audit.moisture_percentage !== "";
                                                            let specText = "";
                                                            if (hasPh || hasMoisture) {
                                                                const parts = [];
                                                                if (hasPh) parts.push(`pH ${audit.acidity_ph}`);
                                                                if (hasMoisture) parts.push(`M: ${audit.moisture_percentage}%`);
                                                                specText = `: ${parts.join(" | ")}`;
                                                                }
                                                                labelText = `${r.sequence_order}. ${stepName}${specText}`;
                                                            const auditStatus = getDailyQAAuditStatus(audit);
                                                            badgeColor = auditStatus === "Passed"
                                                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                                                : auditStatus === "QA Hold"
                                                                    ? "bg-red-500/10 text-red-400 border border-red-500/20"
                                                                    : "bg-amber-500/10 text-amber-400 border border-amber-500/20";
                                                        }
                                                        
                                                        return (
                                                            <React.Fragment key={r.id}>
                                                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border ${badgeColor}`}>
                                                                    {labelText}
                                                                </span>
                                                                {rIdx < rowRoutes.length - 1 && (
                                                                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/45 shrink-0 mx-0.5" />
                                                                )}
                                                            </React.Fragment>
                                                        );
                                                    })
                                                ) : audits.length > 0 ? (
                                                    audits.map((audit: any, auditIdx: number) => {
                                                        const stepName = audit.jo_route_id 
                                                            ? (routesMap.get(Number(audit.jo_route_id)) || `Step #${audit.jo_route_id}`) 
                                                            : "General";
                                                        
                                                        const hasPh = audit.acidity_ph !== undefined && audit.acidity_ph !== null && audit.acidity_ph !== "N/A" && audit.acidity_ph !== "";
                                                        const hasMoisture = audit.moisture_percentage !== undefined && audit.moisture_percentage !== null && audit.moisture_percentage !== "N/A" && audit.moisture_percentage !== "";
                                                        let specText = "";
                                                        if (hasPh || hasMoisture) {
                                                            const parts = [];
                                                            if (hasPh) parts.push(`pH ${audit.acidity_ph}`);
                                                            if (hasMoisture) parts.push(`M: ${audit.moisture_percentage}%`);
                                                            specText = `: ${parts.join(" | ")}`;
                                                        }
                                                        const labelText = `${stepName}${specText}`;
                                                        const auditStatus = getDailyQAAuditStatus(audit);
                                                        const badgeColor = auditStatus === "Passed"
                                                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                                            : auditStatus === "QA Hold"
                                                                ? "bg-red-500/10 text-red-400 border-red-500/20"
                                                                : "bg-amber-500/10 text-amber-400 border-amber-500/20";
                                                            
                                                        return (
                                                            <span 
                                                                key={audit.id || audit.inspection_id || auditIdx} 
                                                                className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border ${badgeColor}`}
                                                            >
                                                                {labelText}
                                                            </span>
                                                        );
                                                    })
                                                ) : (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border border-amber-500/30 text-amber-400 bg-amber-500/5 animate-pulse">
                                                        Pending Process Audit
                                                    </span>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {outcome.status !== "Pending" ? (
                                                <div className={`flex items-center justify-end gap-1.5 text-xs font-semibold pr-2 ${outcome.status === "Passed" ? "text-emerald-400" : "text-destructive"}`}>
                                                    {outcome.status === "Passed" ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                                                    {outcome.status}
                                                </div>
                                            ) : (
                                                <Button 
                                                    size="xs" 
                                                    onClick={() => handleOpenDailyAuditDialog(entry)}
                                                    className="bg-primary hover:bg-primary/90 text-white font-bold h-7 text-[11px]"
                                                >
                                                    Perform Audit
                                                </Button>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                )}
            </div>

            {/* DIALOG: Record Daily Yield QA Audit */}
            <Dialog open={isDailyAuditOpen} onOpenChange={setIsDailyAuditOpen}>
                <DialogContent className="w-[95vw] sm:max-w-[850px] max-h-[90vh] overflow-y-auto bg-background border border-border text-foreground scrollbar-thin">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-primary font-bold text-base">
                            <ClipboardCheck className="h-5 w-5" /> Record In-Process QA Audit
                        </DialogTitle>
                        <DialogDescription className="text-muted-foreground text-xs">
                            Record physicochemical specifications and sensory audits for {selectedLedgerEntry?.job_order_no || `JO #${selectedLedgerEntry?.job_order_id}`} ({selectedLedgerEntry?.shift_name}).
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={(e) => { e.preventDefault(); handleSubmitDailyAudit(); }} className="space-y-4 py-2 text-xs">
                        
                        {/* Operator Logged Checklist Parameters (Collapsible) */}
                        <div className="border-b pb-2 mb-1 border-border">
                            <details className="group cursor-pointer">
                                <summary className="flex justify-between items-center text-foreground font-bold text-xs select-none">
                                    <span>Operator Checklist Parameter Entries (Read-Only)</span>
                                    <span className="text-[10px] text-primary group-open:hidden font-semibold">Show logs</span>
                                    <span className="text-[10px] text-primary hidden group-open:inline font-semibold">Hide logs</span>
                                </summary>
                                <div className="mt-2 space-y-2">
                                    {matchingLogs.length === 0 ? (
                                        <div className="text-[10px] text-muted-foreground italic p-2 bg-muted/45 rounded-md border border-border">
                                            No matching operator checklist logs found for this shift.
                                        </div>
                                    ) : (
                                        <div className="space-y-1.5 max-h-24 overflow-y-auto pr-1">
                                            {matchingLogs.map((log: any) => {
                                                const stepName = typeof log.task_id === "object" ? log.task_id?.operation_name || log.task_id?.name || "Routing Task" : "Routing Task";
                                                return (
                                                    <div key={log.id} className="p-2 bg-muted/50 border border-border rounded-md text-[10px] space-y-1">
                                                        <div className="flex justify-between items-center">
                                                            <span className="font-semibold text-foreground">{stepName}</span>
                                                            <Badge variant={log.qa_status === "Passed" ? "secondary" : "destructive"} className="text-[8px] py-0 px-1 h-3.5 leading-none">
                                                                {log.qa_status}
                                                            </Badge>
                                                        </div>
                                                        <p className="text-muted-foreground font-medium">{log.comments || "No comments recorded."}</p>
                                                        <div className="text-[9px] text-muted-foreground/80 font-mono">
                                                            Qty: Expected {log.expected_quantity.toLocaleString()} | Actual {log.actual_quantity.toLocaleString()} | Defect {log.deviation_quantity.toLocaleString()}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </details>
                        </div>

                        {/* Full Paper-Based QA Checklist */}
                        <div className="space-y-2 border-b pb-2 mb-1 border-border">
                            <Label className="text-foreground font-bold text-[12px] block border-b pb-1">
                                Daily Quality Control Sheet (All Routing Steps)
                            </Label>

                            {/* Sequential Step Progress Bar (Arrows per Step) */}
                            <div className="flex flex-wrap items-center gap-1.5 p-2 bg-muted/20 border border-border rounded-xl mb-3 text-[10px] font-bold">
                                {routes.map((r: any, idx: number) => {
                                    const stepAudited = dailyInspections.some((ins: any) => 
                                        Number(ins.ledger_id) === Number(selectedLedgerEntry?.ledger_id || selectedLedgerEntry?.id) && 
                                        Number(ins.jo_route_id) === Number(r.id)
                                    );
                                    return (
                                        <React.Fragment key={r.id}>
                                            <div className={`flex items-center gap-1 px-2 py-0.5 rounded-md border ${
                                                stepAudited 
                                                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
                                                    : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                            }`}>
                                                <span>{r.sequence_order}. {r.name}</span>
                                            </div>
                                            {idx < routes.length - 1 && (
                                                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[300px] sm:max-h-[420px] overflow-y-auto pr-1 scrollbar-thin">
                                {routes.map((r: any) => {
                                    const activeTemplate = qaTemplates.find((t: any) => Number(t.template_id) === Number(r.qa_template_id));
                                    const activeParameters = activeTemplate ? activeTemplate.parameters || [] : [];
                                    const stepAudited = dailyInspections.some((ins: any) => 
                                        Number(ins.ledger_id) === Number(selectedLedgerEntry?.ledger_id || selectedLedgerEntry?.id) && 
                                        Number(ins.jo_route_id) === Number(r.id)
                                    );

                                    return (
                                        <div key={r.id} className="space-y-1.5 p-2 sm:p-2.5 border border-border rounded-xl bg-muted/10 flex flex-col justify-between">
                                            <div className="flex justify-between items-center border-b pb-1 border-border/60">
                                                <span className="font-bold text-foreground text-xs">
                                                    Step {r.sequence_order}: {r.name || `Step #${r.id}`}
                                                </span>
                                                {stepAudited ? (
                                                    <Badge variant="secondary" className="text-[8px] py-0 px-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                                        Audited
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="outline" className="text-[8px] py-0 px-1 border-amber-500/30 text-amber-400">
                                                        Pending
                                                    </Badge>
                                                )}
                                            </div>

                                            {activeParameters.length > 0 ? (
                                                <div className="space-y-1.5 pt-1">
                                                    {activeParameters.map((param: any) => {
                                                        const val = qaParamValues[param.parameter_id] || "";
                                                        let isOutOfRange = false;

                                                        if (param.test_type === "Numeric" && val) {
                                                            const num = parseFloat(val);
                                                            if (!isNaN(num)) {
                                                                if (param.min_value !== null && num < Number(param.min_value)) isOutOfRange = true;
                                                                if (param.max_value !== null && num > Number(param.max_value)) isOutOfRange = true;
                                                            }
                                                        }

                                                        return (
                                                            <div key={param.parameter_id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-1.5 border-b border-border/40 last:border-b-0">
                                                                {/* Left side: Test name & Critical badge */}
                                                                <div className="flex flex-col">
                                                                    <span className="font-semibold text-foreground/90 text-[11px] flex items-center gap-1">
                                                                        {param.test_name}
                                                                        {param.is_critical && (
                                                                            <span className="bg-red-500/10 text-red-500 text-[8px] font-bold px-1 py-0.2 rounded border border-red-500/20 scale-90 origin-left">
                                                                                CRITICAL
                                                                            </span>
                                                                        )}
                                                                    </span>
                                                                    {param.test_type === "Numeric" && (
                                                                        <span className="text-[9px] text-muted-foreground font-medium">
                                                                            Limit: [{param.min_value ?? "-∞"} – {param.max_value ?? "+∞"}]
                                                                        </span>
                                                                    )}
                                                                </div>

                                                                {/* Right side: Input field & PASS/FAIL badge */}
                                                                <div className="flex items-center gap-2 shrink-0">
                                                                    {val && (
                                                                        <span className={`text-[8px] font-bold px-1 py-0.5 rounded ${isOutOfRange ? "bg-red-500/10 text-red-400 border border-red-500/20" : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"}`}>
                                                                            {isOutOfRange ? "FAIL" : "PASS"}
                                                                        </span>
                                                                    )}

                                                                    {param.test_type === "Numeric" ? (
                                                                        <Input
                                                                            type="number"
                                                                            step="any"
                                                                            required
                                                                            placeholder={`Target: ${param.target_value || "N/A"}`}
                                                                            className="h-6 text-[11px] font-mono w-[85px] bg-background border-border text-foreground py-0"
                                                                            value={val}
                                                                            onChange={(e) => setQaParamValues({
                                                                                ...qaParamValues,
                                                                                [param.parameter_id]: e.target.value
                                                                            })}
                                                                        />
                                                                    ) : param.test_type === "Boolean" || param.test_type === "Pass/Fail" || param.test_type === "Yes/No" ? (
                                                                        <div className="flex gap-2.5 text-[10px]">
                                                                            <label className="flex items-center gap-1 cursor-pointer text-foreground">
                                                                                <input
                                                                                    type="radio"
                                                                                    name={`param-${param.parameter_id}`}
                                                                                    className="h-3 w-3 text-primary bg-background border-border"
                                                                                    checked={val === "Pass"}
                                                                                    onChange={() => setQaParamValues({
                                                                                        ...qaParamValues,
                                                                                        [param.parameter_id]: "Pass"
                                                                                    })}
                                                                                />
                                                                                Pass
                                                                            </label>
                                                                            <label className="flex items-center gap-1 cursor-pointer text-foreground">
                                                                                <input
                                                                                    type="radio"
                                                                                    name={`param-${param.parameter_id}`}
                                                                                    className="h-3 w-3 text-primary bg-background border-border"
                                                                                    checked={val === "Fail"}
                                                                                    onChange={() => setQaParamValues({
                                                                                        ...qaParamValues,
                                                                                        [param.parameter_id]: "Fail"
                                                                                    })}
                                                                                />
                                                                                Fail
                                                                            </label>
                                                                        </div>
                                                                    ) : (
                                                                        <Input
                                                                            type="text"
                                                                            required
                                                                            placeholder="Reading..."
                                                                            className="h-6 text-[11px] w-[110px] bg-background border-border text-foreground py-0"
                                                                            value={val}
                                                                            onChange={(e) => setQaParamValues({
                                                                                ...qaParamValues,
                                                                                [param.parameter_id]: e.target.value
                                                                            })}
                                                                        />
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            ) : (
                                                <div className="text-[9px] text-muted-foreground/80 italic pt-1 pl-1">
                                                    No parameter checklist needed.
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                            {/* Sensory Status */}
                            <div className="space-y-1.5">
                                <Label htmlFor="sensory" className="text-foreground font-bold">Sensory Status</Label>
                                <select
                                    id="sensory"
                                    value={sensoryStatus}
                                    onChange={(e) => setSensoryStatus(e.target.value as any)}
                                    className="flex h-9 w-full rounded-md border border-border bg-background text-foreground px-3 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary cursor-pointer"
                                >
                                    <option value="Passed">Passed (Color/Texture Pass)</option>
                                    <option value="Failed">Failed (Deviation/Reject)</option>
                                </select>
                            </div>

                            {/* Action Taken */}
                            <div className="space-y-1.5">
                                <Label htmlFor="action" className="text-foreground font-bold">QA Disposition Action</Label>
                                <select
                                    id="action"
                                    value={dailyActionTaken}
                                    onChange={(e) => setDailyActionTaken(e.target.value as any)}
                                    className="flex h-9 w-full rounded-md border border-border bg-background text-foreground px-3 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary cursor-pointer"
                                >
                                    <option value="Released">Release Shift Yield</option>
                                    <option value="Quarantined">Hold / Quarantine Yield</option>
                                    <option value="Scrapped">Scrap Yield Lot</option>
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                            {/* Laboratory Status */}
                            <div className="space-y-1.5">
                                <Label htmlFor="lab" className="text-foreground font-bold">Lab status</Label>
                                <select
                                    id="lab"
                                    value={dailyLabStatus}
                                    onChange={(e) => setDailyLabStatus(e.target.value as any)}
                                    className="flex h-9 w-full rounded-md border border-border bg-background text-foreground px-3 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary cursor-pointer"
                                >
                                    <option value="Passed">Passed (Lab Verified)</option>
                                    <option value="Pending">Pending Analysis</option>
                                    <option value="Failed">Failed (Contamination)</option>
                                </select>
                            </div>

                            {/* Warning or details */}
                            <div className="space-y-1.5 flex flex-col justify-end pb-1">
                                {hasFailedParam && (
                                    <div className="p-2 bg-destructive/10 border border-destructive/20 rounded-md text-destructive flex items-center gap-1.5 text-[11px] font-semibold">
                                        <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-500 animate-pulse" />
                                        Warning: Parameters out of range!
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Inspector Remarks */}
                        <div className="space-y-1.5">
                            <Label htmlFor="remarks" className="text-foreground font-bold">Inspector remarks / Lab Comments</Label>
                            <textarea
                                id="remarks"
                                value={dailyRemarks}
                                onChange={(e) => setDailyRemarks(e.target.value)}
                                className="flex min-h-[60px] w-full rounded-md border border-border bg-background text-foreground px-3 py-2 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                                placeholder="Details about moisture logs, physicochemical traits or sensory notes..."
                            />
                        </div>

                        <DialogFooter className="pt-2 border-t border-border gap-2 flex items-center justify-end">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setIsDailyAuditOpen(false)}
                                className="border-border hover:bg-muted text-foreground h-8 text-xs font-semibold"
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                disabled={actionLoading}
                                className="bg-primary hover:bg-primary/95 text-white font-bold h-8 text-xs px-4"
                            >
                                {actionLoading ? "Saving Audit..." : "Save Audit & Authorize"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
