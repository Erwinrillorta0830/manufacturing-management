import React from "react";
import { ChevronRight, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import { LedgerItem } from "../types/inventory.types";

interface LedgerTabProps {
    filteredLedger: LedgerItem[];
    expandedLedgers: Record<number, boolean>;
    toggleLedgerExpand: (ledgerId: number) => void;
}

export function LedgerTab({
    filteredLedger,
    expandedLedgers,
    toggleLedgerExpand
}: LedgerTabProps) {
    return (
        <table className="w-full border-collapse text-left text-xs">
            <thead>
                <tr className="border-b border-input text-muted-foreground">
                    <th className="py-3 px-4 font-bold">Tx Date</th>
                    <th className="py-3 px-4 font-bold hidden sm:table-cell">Doc No</th>
                    <th className="py-3 px-4 font-bold">Product</th>
                    <th className="py-3 px-4 font-bold hidden sm:table-cell">Document Type</th>
                    <th className="py-3 px-4 font-bold hidden md:table-cell">Description</th>
                    <th className="py-3 px-4 font-bold hidden sm:table-cell">Branch</th>
                    <th className="py-3 px-4 font-bold text-right">Movement</th>
                </tr>
            </thead>
            <tbody>
                {filteredLedger.map((log, idx) => {
                    const qty = Number(log.quantity) || 0;
                    const isAddition = qty > 0;
                    const isExpanded = !!expandedLedgers[Number(log.id)];

                    return (
                        <React.Fragment key={log.id || idx}>
                            <tr
                                className="border-b border-input/60 hover:bg-muted/10 cursor-pointer select-none"
                                onClick={() => toggleLedgerExpand(Number(log.id))}
                            >
                                <td className="py-3.5 px-4 font-semibold text-muted-foreground">
                                    <div className="flex items-center gap-1.5">
                                        <ChevronRight className={`h-3 w-3 text-muted-foreground transition-transform duration-200 ${isExpanded ? "rotate-90 text-primary" : ""}`} />
                                        {log.documentDate || log.date_added || log.created_date}
                                    </div>
                                </td>
                                <td className="py-3.5 px-4 font-extrabold text-foreground hidden sm:table-cell">{log.documentNo || log.reference_no || "ADJ"}</td>
                                <td className="py-3.5 px-4">
                                    <div>
                                        <span className="font-bold text-foreground block">{log.productName || `Product #${log.productId || log.product_id}`}</span>
                                        <span className="text-[10px] text-muted-foreground">{log.productCode}</span>
                                    </div>
                                </td>
                                <td className="py-3.5 px-4 font-semibold text-muted-foreground hidden sm:table-cell">{log.documentType || log.transaction_type}</td>
                                <td className="py-3.5 px-4 text-muted-foreground max-w-[200px] truncate hidden md:table-cell">{log.documentDescription || log.remarks}</td>
                                <td className="py-3.5 px-4 font-semibold text-foreground hidden sm:table-cell">{log.branchName}</td>
                                <td className="py-3.5 px-4 text-right">
                                    <span className={`inline-flex items-center gap-1 font-extrabold ${isAddition ? "text-emerald-500" : "text-rose-500"}`}>
                                        {isAddition ? (
                                            <>
                                                <ArrowUpRight className="h-3 w-3" /> +{qty.toLocaleString()} {log.unitName || "Units"}
                                            </>
                                        ) : (
                                            <>
                                                <ArrowDownLeft className="h-3 w-3" /> {qty.toLocaleString()} {log.unitName || "Units"}
                                            </>
                                        )}
                                    </span>
                                </td>
                            </tr>
                            {isExpanded && (
                                <tr className="bg-muted/5 border-b border-input">
                                    <td colSpan={7} className="p-4">
                                        <div className="border-l-4 border-primary pl-4 py-1.5 space-y-2">
                                            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Transaction Ledger Details</div>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                                                <div className="p-2 rounded-lg bg-card border border-input">
                                                    <div className="text-[9px] text-muted-foreground uppercase font-bold">Document Number</div>
                                                    <div className="text-xs font-semibold text-foreground mt-0.5">{log.documentNo || log.reference_no || "ADJ"}</div>
                                                </div>
                                                <div className="p-2 rounded-lg bg-card border border-input">
                                                    <div className="text-[9px] text-muted-foreground uppercase font-bold">Document Type</div>
                                                    <div className="text-xs font-semibold text-foreground mt-0.5">{log.documentType || log.transaction_type}</div>
                                                </div>
                                                <div className="p-2 rounded-lg bg-card border border-input">
                                                    <div className="text-[9px] text-muted-foreground uppercase font-bold">Branch Location</div>
                                                    <div className="text-xs font-semibold text-foreground mt-0.5">{log.branchName}</div>
                                                </div>
                                                <div className="p-2 rounded-lg bg-card border border-input">
                                                    <div className="text-[9px] text-muted-foreground uppercase font-bold">Description / Remarks</div>
                                                    <div className="text-xs font-semibold text-foreground mt-0.5 whitespace-pre-wrap">{log.documentDescription || log.remarks || "No details provided."}</div>
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </React.Fragment>
                    );
                })}

                {filteredLedger.length === 0 && (
                    <tr>
                        <td colSpan={7} className="py-8 text-center text-muted-foreground border border-dashed rounded-xl bg-card">
                            No transaction history entries.
                        </td>
                    </tr>
                )}
            </tbody>
        </table>
    );
}
