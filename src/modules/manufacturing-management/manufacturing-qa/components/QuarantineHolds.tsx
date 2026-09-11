import React from "react";
import { Lock, RefreshCw, CheckCircle2, XCircle, Unlock, Search, ClipboardCheck } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DispositionRecord } from "../types";
import { ResponsiveDataView } from "./ResponsiveDataView";

interface QuarantineHoldsProps {
    loadingDispositions: boolean;
    pendingHolds: DispositionRecord[];
    dispositions: DispositionRecord[];
    statusFilter: "pending" | "resolved" | "all";
    onStatusFilterChange: (filter: "pending" | "resolved" | "all") => void;
    handleOpenOverrideDialog: (disp: DispositionRecord) => void;
    onFiltersChange?: (search: string) => void;
    onFinalize?: (jobOrderId: number) => void;
}

export function QuarantineHolds({
    loadingDispositions,
    pendingHolds,
    dispositions,
    statusFilter,
    onStatusFilterChange,
    handleOpenOverrideDialog,
    onFiltersChange,
    onFinalize
}: QuarantineHoldsProps) {
    const [searchQuery, setSearchQuery] = React.useState("");
    const statusRecords = React.useMemo(() => {
        if (statusFilter === "pending") return pendingHolds;
        if (statusFilter === "resolved") return dispositions.filter((hold) => hold.disposition_status !== "Pending");
        return dispositions;
    }, [statusFilter, pendingHolds, dispositions]);
    const visibleHolds = React.useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return statusRecords;
        return statusRecords.filter((hold) => `${hold.jo_id} ${hold.product_name} ${hold.station_name || ""} ${hold.task_name} ${hold.inspection_remarks || ""}`.toLowerCase().includes(query));
    }, [statusRecords, searchQuery]);

    const renderCard = (hold: DispositionRecord) => (
        <div key={hold.id} className="rounded-lg border border-destructive/20 bg-card p-4 shadow-xs">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="font-mono text-base font-bold text-destructive">{hold.jo_id}</p>
                    <p className="mt-1 truncate text-sm font-semibold">{hold.product_name}</p>
                </div>
                <Badge variant="destructive" className="min-h-7 text-sm">{hold.disposition_status}</Badge>
            </div>
            <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <div><dt className="text-muted-foreground">Station / task</dt><dd className="font-semibold">{hold.station_name || (hold.station_id ? `Station #${hold.station_id}` : "Station unavailable")} · {hold.task_name}</dd></div>
                <div><dt className="text-muted-foreground">Expected / actual</dt><dd className="font-mono font-semibold">{hold.expected_quantity.toLocaleString()} / <span className="text-destructive">{hold.actual_quantity.toLocaleString()}</span></dd></div>
                <div className="sm:col-span-2"><dt className="text-muted-foreground">Failed parameters</dt><dd className="mt-1 flex flex-wrap gap-1.5">{hold.failed_parameters.map((parameter, index) => <Badge key={`${hold.id}-${parameter.parameter_id}-${index}`} variant="destructive" className="min-h-7 gap-1 text-sm"><XCircle className="h-3.5 w-3.5" />{parameter.test_name}: {parameter.value}{parameter.is_critical ? " (Critical)" : ""}</Badge>)}</dd></div>
                <div className="sm:col-span-2 break-words"><dt className="text-muted-foreground">Remarks</dt><dd>{hold.inspection_remarks || "No remarks recorded."}</dd></div>
            </dl>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Button variant="outline" className="min-h-11 flex-1 gap-2 border-destructive/30 hover:bg-destructive hover:text-destructive-foreground" onClick={() => handleOpenOverrideDialog(hold)}><Unlock className="h-4 w-4" />Override Hold</Button>
                {onFinalize && hold.disposition_status === "Pending" && Number(hold.job_order_id) > 0 && (
                    <Button variant="outline" className="min-h-11 flex-1 gap-2 border-primary/40 text-primary hover:bg-primary/10" onClick={() => onFinalize(Number(hold.job_order_id))}><ClipboardCheck className="h-4 w-4" />Finalize / Partial Yield</Button>
                )}
            </div>
        </div>
    );

    return (
        <Card>
            <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <CardTitle className="text-xl flex items-center gap-2">
                    <Lock className="h-5 w-5 text-destructive" />
                    Quarantined Batches & Override Locks
                </CardTitle>
                <CardDescription>
                    Critical checklist failures that blocked step completion, plus previously resolved override decisions.
                </CardDescription>
                <div className="flex w-full flex-wrap items-center gap-2 md:w-auto">
                    <div className="flex items-center gap-0.5 rounded-lg border bg-muted/40 p-0.5" role="group" aria-label="Filter holds by status">
                        {([
                            { value: "pending", label: "Pending" },
                            { value: "resolved", label: "Resolved" },
                            { value: "all", label: "All" },
                        ] as const).map((option) => (
                            <Button
                                key={option.value}
                                type="button"
                                variant={statusFilter === option.value ? "default" : "ghost"}
                                size="sm"
                                className="min-h-9 rounded-md px-3 text-xs font-bold"
                                onClick={() => onStatusFilterChange(option.value)}
                            >
                                {option.label}
                            </Button>
                        ))}
                    </div>
                    <div className="relative min-w-0 flex-1 md:w-64 md:flex-none">
                        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input value={searchQuery} onChange={(event) => { const search = event.target.value; setSearchQuery(search); onFiltersChange?.(search); }} placeholder="Search holds..." aria-label="Search quarantine holds" className="h-11 pl-9 text-sm" />
                    </div>
                    {searchQuery && <Button type="button" variant="outline" className="min-h-11" onClick={() => { setSearchQuery(""); onFiltersChange?.(""); }}>Clear</Button>}
                </div>
            </CardHeader>
            <CardContent>
                {loadingDispositions ? (
                    <div className="flex flex-col items-center justify-center p-12 text-muted-foreground">
                        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground/60" />
                        <span className="text-sm mt-3">Loading active hold list...</span>
                    </div>
                ) : visibleHolds.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-16 border rounded-lg border-dashed text-center">
                        <CheckCircle2 className={`h-10 w-10 mb-3 ${statusFilter === "resolved" ? "text-muted-foreground" : "text-emerald-500"}`} />
                        <h3 className="font-semibold text-lg text-foreground">
                            {statusFilter === "pending" ? "Zero Active Holds" : statusFilter === "resolved" ? "No Resolved Holds" : "No Holds Recorded"}
                        </h3>
                        <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                            {statusFilter === "pending"
                                ? "All production lines are currently passing critical parameter ranges. No quarantined batches require overrides."
                                : statusFilter === "resolved"
                                ? "No quarantine holds have been resolved yet. Resolved decisions appear here for audit."
                                : "No quarantine holds match the current search."}
                        </p>
                    </div>
                ) : (
                    <ResponsiveDataView
                        table={(
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Job Order No</TableHead>
                                    <TableHead>Station</TableHead>
                                    <TableHead>Routing Task</TableHead>
                                    <TableHead>Product</TableHead>
                                    <TableHead>Inspection Remarks</TableHead>
                                    <TableHead className="text-right">Expected Qty</TableHead>
                                    <TableHead className="text-right">Actual Qty</TableHead>
                                    <TableHead>Failed Parameter Check</TableHead>
                                    <TableHead>Recorded At</TableHead>
                                    <TableHead className="text-right">Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {visibleHolds.map((hold) => (
                                    <TableRow key={hold.id} className="hover:bg-muted/40 transition-colors">
                                        <TableCell className="font-bold text-destructive">
                                            {hold.jo_id}
                                        </TableCell>
                                        <TableCell className="font-medium">{hold.station_name || (hold.station_id ? `Station #${hold.station_id}` : "Station unavailable")}</TableCell>
                                        <TableCell className="font-medium">{hold.task_name}</TableCell>
                                        <TableCell className="max-w-[200px] truncate">{hold.product_name}</TableCell>
                                        <TableCell className="max-w-[240px] truncate text-muted-foreground" title={hold.inspection_remarks || ""}>
                                            {hold.inspection_remarks || "No remarks recorded."}
                                        </TableCell>
                                        <TableCell className="text-right font-mono">{hold.expected_quantity.toLocaleString()}</TableCell>
                                        <TableCell className="text-right font-mono font-bold text-destructive">{hold.actual_quantity.toLocaleString()}</TableCell>
                                        <TableCell>
                                            <div className="flex flex-wrap gap-1.5">
                                                {hold.failed_parameters.map((p, idx) => (
                                                    <Badge key={idx} variant="destructive" className="gap-1 text-[11px]">
                                                        <XCircle className="h-3 w-3 shrink-0" />
                                                        {p.test_name}: {p.value} {p.is_critical && "(Critical)"}
                                                    </Badge>
                                                ))}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-muted-foreground text-xs font-mono">
                                            {new Date(hold.recorded_at).toLocaleString()}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex flex-col items-end gap-2 sm:flex-row sm:justify-end">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="min-h-11 font-semibold text-sm border-destructive/30 hover:bg-destructive hover:text-destructive-foreground transition-all"
                                                    onClick={() => handleOpenOverrideDialog(hold)}
                                                >
                                                    <Unlock className="h-3 w-3 mr-1.5" />
                                                    Override Hold
                                                </Button>
                                                {onFinalize && hold.disposition_status === "Pending" && Number(hold.job_order_id) > 0 && (
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="min-h-11 font-semibold text-sm border-primary/40 text-primary hover:bg-primary/10 transition-all"
                                                        onClick={() => onFinalize(Number(hold.job_order_id))}
                                                    >
                                                        <ClipboardCheck className="h-3 w-3 mr-1.5" />
                                                        Finalize / Partial Yield
                                                    </Button>
                                                )}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                        )}
                        cards={(
                            <div className="space-y-3">
                                {visibleHolds.map(renderCard)}
                            </div>
                        )}
                        minTableWidth="extraWide"
                    />
                )}
            </CardContent>
        </Card>
    );
}
