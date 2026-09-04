import React from "react";
import { Forklift, Search, RefreshCw, CheckCircle2, TrendingUp } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { JobOrder } from "../types";
import { ResponsiveDataView } from "./ResponsiveDataView";

interface PendingHold {
    jo_id: string | number;
}

interface YieldClosingQueueProps {
    loadingJobOrders: boolean;
    activeJobOrders: JobOrder[];
    joSearch: string;
    setJoSearch: (q: string) => void;
    getBranchName: (branchId?: number | null) => string;
    handleOpenYieldDialog: (jo: JobOrder) => void;
    pendingHolds?: PendingHold[];
}

export function YieldClosingQueue({
    loadingJobOrders,
    activeJobOrders,
    joSearch,
    setJoSearch,
    getBranchName,
    handleOpenYieldDialog,
    pendingHolds = []
}: YieldClosingQueueProps) {
    const renderCard = (jo: JobOrder) => {
        const isHeld = pendingHolds.some((h: PendingHold) => String(h.jo_id) === String(jo.jo_id));
        const blocked = isHeld || jo.status === "On Hold" || jo.status === "QA Hold";
        return (
            <Card key={jo.jo_id} className="border p-4 shadow-xs">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                        <p className="font-mono text-base font-bold text-foreground">{jo.jo_id}</p>
                        <p className="mt-1 truncate text-sm font-semibold">{jo.product_name}</p>
                    </div>
                    <Badge variant={blocked ? "destructive" : "secondary"} className="min-h-7 text-sm">{isHeld ? "QA Quarantine" : jo.status}</Badge>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                    <div><dt className="text-muted-foreground">Target quantity</dt><dd className="font-mono font-semibold">{Number(jo.quantity || 0).toLocaleString()}</dd></div>
                    <div><dt className="text-muted-foreground">Branch</dt><dd className="truncate font-semibold">{getBranchName(jo.branch_id)}</dd></div>
                    <div><dt className="text-muted-foreground">Due date</dt><dd className="font-mono font-semibold">{jo.due_date ? new Date(jo.due_date).toLocaleDateString() : "N/A"}</dd></div>
                </dl>
                <Button className="mt-4 min-h-11 w-full gap-2" onClick={() => handleOpenYieldDialog(jo)} disabled={blocked} title={blocked ? "Unlock quarantine hold first" : "Close yield"}>
                    <TrendingUp className="h-4 w-4" />
                    Close Yield
                </Button>
            </Card>
        );
    };

    return (
        <Card>
            <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <CardTitle className="text-xl flex items-center gap-2">
                        <Forklift className="h-5 w-5 text-primary" />
                        Active Job Orders Awaiting Yield Closing
                    </CardTitle>
                    <CardDescription>
                        Select an ongoing or finished Job Order to finalize packaging yield receipt and deduct component inventory scoped per branch.
                    </CardDescription>
                </div>
                <div className="relative w-full md:w-80 shrink-0">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input 
                        placeholder="Search JO # or Product..."
                        value={joSearch}
                        onChange={e => setJoSearch(e.target.value)}
                        className="pl-8 min-h-11 text-sm"
                    />
                </div>
            </CardHeader>
            <CardContent>
                {loadingJobOrders ? (
                    <div className="flex flex-col items-center justify-center p-12 text-muted-foreground">
                        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground/60" />
                        <span className="text-sm mt-3">Loading active Job Orders...</span>
                    </div>
                ) : activeJobOrders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-16 border rounded-lg border-dashed text-center">
                        <CheckCircle2 className="h-10 w-10 text-emerald-500 mb-3" />
                        <h3 className="font-semibold text-lg text-foreground">All Job Orders Closed</h3>
                        <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                            No active or released job orders require yield closing in the ledger at the moment.
                        </p>
                    </div>
                ) : (
                    <ResponsiveDataView
                        table={(
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Job Order No</TableHead>
                                    <TableHead>Product Name</TableHead>
                                    <TableHead className="text-right">Target Quantity</TableHead>
                                    <TableHead>Target Branch</TableHead>
                                    <TableHead>End / Due Date</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {activeJobOrders.map((jo) => (
                                    <TableRow key={jo.jo_id} className="hover:bg-muted/40 transition-colors">
                                        <TableCell className="font-bold text-foreground">
                                            {jo.jo_id}
                                        </TableCell>
                                        <TableCell className="font-medium max-w-[240px] truncate">
                                            {jo.product_name}
                                        </TableCell>
                                        <TableCell className="text-right font-mono">{jo.quantity.toLocaleString()}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className="font-medium text-xs">
                                                {getBranchName(jo.branch_id)}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-muted-foreground text-xs font-mono">
                                            {jo.due_date ? new Date(jo.due_date).toLocaleDateString() : "N/A"}
                                        </TableCell>
                                        <TableCell>
                                            {(() => {
                                                const isHeld = pendingHolds.some((h: PendingHold) => String(h.jo_id) === String(jo.jo_id));
                                                return (
                                                    <Badge 
                                                        variant={
                                                            isHeld ? "destructive" :
                                                            jo.status === "Proceed" || jo.status === "Released" ? "secondary" :
                                                            jo.status === "Ongoing" || jo.status === "In Progress" ? "default" :
                                                            jo.status === "On Hold" || jo.status === "QA Hold" ? "destructive" :
                                                            "outline"
                                                        }
                                                    >
                                                        {isHeld ? "QA Quarantine" : jo.status}
                                                    </Badge>
                                                );
                                            })()}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {(() => {
                                                const isHeld = pendingHolds.some((h: PendingHold) => String(h.jo_id) === String(jo.jo_id));
                                                return (
                                                    <Button 
                                                        variant="default" 
                                                        size="sm" 
                                                        className="min-h-11 font-semibold text-sm transition-all"
                                                        onClick={() => handleOpenYieldDialog(jo)}
                                                        disabled={isHeld || jo.status === "On Hold" || jo.status === "QA Hold"}
                                                        title={isHeld ? "Unlock quarantine hold first" : jo.status === "On Hold" || jo.status === "QA Hold" ? "Unlock override hold first" : ""}
                                                    >
                                                        <TrendingUp className="h-3.5 w-3.5 mr-1" />
                                                        Close Yield
                                                    </Button>
                                                );
                                            })()}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                        )}
                        cards={(
                            <div className="space-y-3">
                                {activeJobOrders.map(renderCard)}
                            </div>
                        )}
                    />
                )}
            </CardContent>
        </Card>
    );
}
