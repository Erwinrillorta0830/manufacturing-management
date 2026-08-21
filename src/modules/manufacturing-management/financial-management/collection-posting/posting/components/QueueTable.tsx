import { CheckCircle2, AlertTriangle, Eye, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PostingQueueItem } from "../hooks/usePosting";

interface QueueTableProps {
    queue: PostingQueueItem[];
    onReview: (id: number) => void;
    sortField: keyof PostingQueueItem;
    sortDir: "asc" | "desc";
    onSort: (field: keyof PostingQueueItem) => void;
}

export function QueueTable({ queue, onReview, sortField, sortDir, onSort }: QueueTableProps) {

    const renderSortIcon = (field: keyof PostingQueueItem) => {
        if (sortField !== field) return <ArrowUpDown size={12} className="opacity-40 ml-1.5" />;
        return sortDir === "asc" ? <ArrowUp size={12} className="ml-1.5 text-primary" /> : <ArrowDown size={12} className="ml-1.5 text-primary" />;
    };

    return (
        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
            <Table>
                <TableHeader className="bg-muted/30">
                    <TableRow>
                        <TableHead className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => onSort("docNo")}>
                            <div className="flex items-center text-[10px] font-black uppercase tracking-widest py-4">
                                Document / Date {renderSortIcon("docNo")}
                            </div>
                        </TableHead>
                        <TableHead className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => onSort("salesmanName")}>
                            <div className="flex items-center text-[10px] font-black uppercase tracking-widest">
                                Personnel {renderSortIcon("salesmanName")}
                            </div>
                        </TableHead>
                        <TableHead className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => onSort("pouchAmount")}>
                            <div className="flex items-center justify-end text-[10px] font-black uppercase tracking-widest">
                                Physical Pouch {renderSortIcon("pouchAmount")}
                            </div>
                        </TableHead>
                        <TableHead className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => onSort("totalAppliedAmount")}>
                            <div className="flex items-center justify-end text-[10px] font-black uppercase tracking-widest">
                                AR Target / Net {renderSortIcon("totalAppliedAmount")}
                            </div>
                        </TableHead>
                        <TableHead className="text-[10px] font-black uppercase tracking-widest text-right">Adj. Debit (Shortage)</TableHead>
                        <TableHead className="text-[10px] font-black uppercase tracking-widest text-right">Adj. Credit (Overage)</TableHead>
                        <TableHead className="text-[10px] font-black uppercase tracking-widest text-right pr-4">Action</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {queue.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={7} className="text-center py-16 text-muted-foreground font-bold uppercase tracking-widest text-xs">
                                <div className="flex flex-col items-center justify-center gap-2">
                                    <CheckCircle2 size={40} className="opacity-20 text-emerald-500" />
                                    <span>No pending pouches match the active filters.</span>
                                </div>
                            </TableCell>
                        </TableRow>
                    ) : queue.map((item) => {
                        const hasShortage = item.adjustmentDebit > 0;
                        const hasOverage = item.adjustmentCredit > 0;
                        const netTarget = item.totalAppliedAmount - item.creditAppliedAmount; // 🚀 Calculate Net Target

                        return (
                            <TableRow key={item.id} className="hover:bg-muted/50 transition-colors group">
                                <TableCell className="align-top pt-4 pl-4">
                                    <div className="font-mono font-black text-primary">{item.docNo}</div>
                                    <div className="text-[10px] font-bold text-muted-foreground uppercase mt-0.5">{item.collectionDate}</div>
                                </TableCell>

                                <TableCell className="align-top pt-4">
                                    <div className="text-[11px] font-black uppercase flex flex-col gap-1">
                                        <span className="flex gap-2"><span className="text-[9px] text-muted-foreground w-14">RTE CODE:</span> {item.salesmanName}</span>
                                        <span className="flex gap-2"><span className="text-[9px] text-muted-foreground w-14">CASHIER:</span> {item.encoderName}</span>
                                    </div>
                                </TableCell>

                                <TableCell className="text-right align-top pt-4">
                                    <span className="font-mono font-black text-emerald-600 text-sm">
                                        ₱{item.pouchAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </span>
                                </TableCell>

                                <TableCell className="text-right align-top pt-4">
                                    <div className="flex flex-col items-end gap-0.5">
                                        <span className="font-mono font-black text-blue-600 text-sm">
                                            ₱{netTarget.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </span>
                                        {item.creditAppliedAmount > 0 && (
                                            <span className="text-[9px] font-bold text-amber-600 uppercase">
                                                (Gross: ₱{item.totalAppliedAmount.toLocaleString()} - Memo: ₱{item.creditAppliedAmount.toLocaleString()})
                                            </span>
                                        )}
                                    </div>
                                </TableCell>

                                <TableCell className="text-right align-top pt-4">
                                    {hasShortage ? (
                                        <Badge variant="destructive" className="bg-red-50 text-red-700 border-red-200 shadow-sm gap-1 text-[11px] font-mono px-2 py-0.5 ml-auto">
                                            <AlertTriangle size={10} /> ₱{item.adjustmentDebit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </Badge>
                                    ) : <span className="font-mono font-black text-muted-foreground/30">—</span>}
                                </TableCell>

                                <TableCell className="text-right align-top pt-4">
                                    {hasOverage ? (
                                        <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 shadow-sm text-[11px] font-mono px-2 py-0.5 ml-auto">
                                            ₱{item.adjustmentCredit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </Badge>
                                    ) : <span className="font-mono font-black text-muted-foreground/30">—</span>}
                                </TableCell>

                                <TableCell className="text-right align-top pt-3 pr-4">
                                    <Button
                                        onClick={() => onReview(item.id)}
                                        size="sm"
                                        variant={hasShortage ? "destructive" : "outline"}
                                        className={`h-8 font-black uppercase tracking-widest text-[10px] shadow-sm transition-all ${hasShortage ? 'hover:bg-red-700' : 'hover:bg-primary hover:text-primary-foreground border-border'}`}
                                    >
                                        <Eye size={12} className="mr-1.5 opacity-70 group-hover:opacity-100" /> Review
                                    </Button>
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </div>
    );
}