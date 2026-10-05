import React from "react";
import { FileText, Search, RefreshCw, Archive, Check, XCircle } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { QALog } from "../types";
import { formatPhtTimestamp } from "../../shared/pht-date";

interface CheckpointLogsTableProps {
    loadingLogs: boolean;
    filteredQALogs: QALog[];
    logSearch: string;
    setLogSearch: (q: string) => void;
    logStatusFilter: string;
    setLogStatusFilter: (status: string) => void;
}

export function CheckpointLogsTable({
    loadingLogs,
    filteredQALogs,
    logSearch,
    setLogSearch,
    logStatusFilter,
    setLogStatusFilter
}: CheckpointLogsTableProps) {
    return (
        <Card>
            <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <CardTitle className="text-xl flex items-center gap-2">
                        <FileText className="h-5 w-5 text-primary" />
                        Active QA Checklist Inspection logs
                    </CardTitle>
                    <CardDescription>
                        Historical audit trail logs recorded during routing steps verification completions.
                    </CardDescription>
                </div>
                <div className="flex flex-col sm:flex-row items-center gap-2 w-full md:w-auto">
                    <div className="relative w-full sm:w-60">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input 
                            placeholder="Search JO # or Comments..."
                            value={logSearch}
                            onChange={e => setLogSearch(e.target.value)}
                            className="pl-8 h-9 text-sm"
                        />
                    </div>
                    <Select value={logStatusFilter} onValueChange={setLogStatusFilter}>
                        <SelectTrigger className="w-full sm:w-36 h-9 text-xs font-semibold">
                            <SelectValue placeholder="All Status" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Checked</SelectItem>
                            <SelectItem value="passed">Passed Logs</SelectItem>
                            <SelectItem value="failed">Failed Logs</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </CardHeader>
            <CardContent>
                {loadingLogs ? (
                    <div className="flex flex-col items-center justify-center p-12 text-muted-foreground">
                        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground/60" />
                        <span className="text-sm mt-3">Loading checkpoint logs...</span>
                    </div>
                ) : filteredQALogs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-16 border rounded-lg border-dashed text-center">
                        <Archive className="h-10 w-10 text-muted-foreground/55 mb-3" />
                        <h3 className="font-semibold text-lg text-foreground">No Logs Found</h3>
                        <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                            No checkpoint log records matches your filters. Make sure operator terminal logging is recording steps.
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto border rounded-lg">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Log ID</TableHead>
                                    <TableHead>Job Order No</TableHead>
                                    <TableHead>Station / Routing Task</TableHead>
                                    <TableHead className="text-right">Expected</TableHead>
                                    <TableHead className="text-right">Actual</TableHead>
                                    <TableHead className="text-right">Deviation</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Comments</TableHead>
                                    <TableHead>Inspection Time</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredQALogs.map((log) => {
                                    const stepName = typeof log.task_id === "object" ? log.task_id?.operation_name || log.task_id?.name || "Routing Step" : `Step #${log.task_id}`;
                                    const joNo = typeof log.task_id === "object" ? log.task_id?.jo_id || "N/A" : "N/A";
                                    
                                    return (
                                        <TableRow key={log.id} className="hover:bg-muted/40 transition-colors">
                                            <TableCell className="font-semibold text-muted-foreground font-mono text-xs">
                                                #{log.id}
                                            </TableCell>
                                            <TableCell className="font-bold text-foreground">
                                                {joNo}
                                            </TableCell>
                                            <TableCell className="font-medium">{stepName}</TableCell>
                                            <TableCell className="text-right font-mono text-xs">{log.expected_quantity.toLocaleString()}</TableCell>
                                            <TableCell className="text-right font-mono text-xs font-semibold">{log.actual_quantity.toLocaleString()}</TableCell>
                                            <TableCell className={`text-right font-mono text-xs ${log.deviation_quantity > 0 ? 'text-destructive font-bold' : 'text-emerald-500'}`}>
                                                {log.deviation_quantity > 0 ? `+${log.deviation_quantity.toLocaleString()}` : log.deviation_quantity.toLocaleString()}
                                            </TableCell>
                                            <TableCell>
                                                <Badge 
                                                    variant={log.qa_status === "Passed" ? "secondary" : "destructive"}
                                                    className="gap-1 text-[10px] font-bold"
                                                >
                                                    {log.qa_status === "Passed" ? (
                                                        <Check className="h-3 w-3" />
                                                    ) : (
                                                        <XCircle className="h-3 w-3" />
                                                    )}
                                                    {log.qa_status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="max-w-[180px] truncate text-xs text-muted-foreground" title={log.comments}>
                                                {log.comments || "No remarks logged."}
                                            </TableCell>
                                            <TableCell className="text-muted-foreground text-[11px] font-mono whitespace-nowrap">
                                                {formatPhtTimestamp(log.recorded_at)}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
