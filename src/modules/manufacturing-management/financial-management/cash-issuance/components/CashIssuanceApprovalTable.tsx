"use client";

import React, { useMemo } from "react";
import { Disbursement } from "../types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { FileText, Building2, AlertTriangle } from "lucide-react";
import { StickyTableWrapper } from "./StickyTableWrapper";
import { formatCurrency, getCookie, decodeToken } from "../utils/disbursement-utils";

interface CashIssuanceApprovalTableProps {
    data: Disbursement[];
    loading: boolean;
    onView: (d: Disbursement) => void;
    selectedIds: number[];
    onSelectChange: (ids: number[]) => void;
}

export function CashIssuanceApprovalTable({
    data,
    loading,
    onView,
    selectedIds,
    onSelectChange
}: CashIssuanceApprovalTableProps) {

    const token = getCookie("vos_access_token");
    const tokenPayload = useMemo(() => decodeToken(token), [token]);
    const currentUserId = tokenPayload?.sub;

    const selectables = useMemo(() => {
        return data.filter((d) => {
            const isEncoder = d.encoderId != null && currentUserId != null && String(d.encoderId) === String(currentUserId);
            return !isEncoder;
        });
    }, [data, currentUserId]);

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            onSelectChange(selectables.map((d) => d.id));
        } else {
            onSelectChange([]);
        }
    };

    const handleSelectRow = (id: number, checked: boolean) => {
        if (checked) {
            onSelectChange([...selectedIds, id]);
        } else {
            onSelectChange(selectedIds.filter((item) => item !== id));
        }
    };

    const isAllSelected = selectables.length > 0 && selectables.every((s) => selectedIds.includes(s.id));
    const isSomeSelected = selectedIds.length > 0 && !isAllSelected;

    return (
        <div className="flex flex-col gap-4">
            {/* MOBILE/TABLET VIEW (Card List) */}
            <div className="block md:hidden space-y-3 max-h-[65vh] overflow-y-auto pr-1">
                {loading ? (
                    <div className="p-8 text-center text-xs font-bold text-muted-foreground uppercase tracking-widest bg-card border rounded-xl">Loading pending vouchers...</div>
                ) : data.length === 0 ? (
                    <div className="p-8 text-center text-xs font-bold text-muted-foreground uppercase tracking-widest bg-card border rounded-xl">No disbursements pending approval.</div>
                ) : (
                    data.map((d) => {
                        const isEncoder = d.encoderId != null && currentUserId != null && String(d.encoderId) === String(currentUserId);
                        const isSelectable = !isEncoder;

                        return (
                            <div key={d.id} className="p-4 bg-card border border-border rounded-xl shadow-sm space-y-3 relative group hover:border-primary/30 transition-all">
                                {/* Header Row */}
                                <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-2.5">
                                        <Checkbox 
                                            checked={selectedIds.includes(d.id)} 
                                            onCheckedChange={(checked) => handleSelectRow(d.id, !!checked)} 
                                            disabled={!isSelectable}
                                            className="border-muted-foreground/50 disabled:opacity-30"
                                        />
                                        <div className="flex flex-col">
                                            <span className="font-black text-xs uppercase tracking-wider text-primary">{d.docNo}</span>
                                            <span className="text-[9px] font-bold text-muted-foreground uppercase mt-0.5">
                                                {d.transactionDate ? format(new Date(d.transactionDate), "MMM dd, yyyy") : "No Date"}
                                            </span>
                                        </div>
                                    </div>
                                    <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px] font-black uppercase text-primary hover:bg-primary/10" onClick={() => onView(d)}>View</Button>
                                </div>

                                {/* Payee & Cost Center */}
                                <div className="space-y-1 bg-muted/20 p-2 rounded-lg border border-border/30">
                                    <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Payee & Cost Center</p>
                                    <p className="text-xs font-black text-foreground uppercase truncate">{d.payeeName || "UNKNOWN PAYEE"}</p>
                                    {(d.divisionName || d.departmentName) && (
                                        <div className="flex items-center gap-1.5 text-[9px] font-bold text-muted-foreground/80 uppercase">
                                            <Building2 className="w-3 h-3 opacity-60" />
                                            <span>{[d.divisionName, d.departmentName].filter(Boolean).join(" | ")}</span>
                                        </div>
                                    )}
                                </div>

                                {/* Audit warnings */}
                                {isEncoder && (
                                    <div className="space-y-1.5">
                                        <Badge variant="destructive" className="text-[8px] uppercase tracking-wider px-1.5 py-0 bg-rose-50 text-rose-700 border-rose-200 w-full flex items-center gap-1.5">
                                            <AlertTriangle className="w-2.5 h-2.5" /> SoD violation: You encoded this
                                        </Badge>
                                    </div>
                                )}

                                {/* Bottom Row */}
                                <div className="flex items-center justify-between pt-2 border-t border-border/30">
                                    <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Voucher Amount</span>
                                    <span className="text-xs font-black text-foreground font-mono">{formatCurrency(d.totalAmount)}</span>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* DESKTOP VIEW (Table) */}
            <StickyTableWrapper className="hidden md:block rounded-md border border-border bg-card shadow-sm overflow-auto max-h-[65vh]">
                <Table>
                    <TableHeader className="bg-muted/80 backdrop-blur-md sticky top-0 z-10 shadow-[0_1px_0_0_hsl(var(--border))]">
                        <TableRow className="border-border">
                            <TableHead className="w-[50px] text-center">
                                <Checkbox 
                                    checked={isAllSelected ? true : isSomeSelected ? "indeterminate" : false} 
                                    onCheckedChange={handleSelectAll} 
                                    className="translate-y-[2px] border-muted-foreground/50"
                                />
                            </TableHead>
                            <TableHead className="text-[10px] font-black uppercase tracking-widest text-muted-foreground w-[180px]">Voucher Info</TableHead>
                            <TableHead className="text-[10px] font-black uppercase tracking-widest text-muted-foreground w-[220px]">Payee & Cost Center</TableHead>
                            <TableHead className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Payables / Debits</TableHead>
                            <TableHead className="text-[10px] font-black uppercase tracking-widest text-muted-foreground text-right w-[130px]">Voucher Amount</TableHead>
                            <TableHead className="w-[80px]"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow><TableCell colSpan={6} className="h-48 text-center text-sm font-medium text-muted-foreground">Loading pending vouchers...</TableCell></TableRow>
                        ) : data.length === 0 ? (
                            <TableRow><TableCell colSpan={6} className="h-48 text-center text-sm font-medium text-muted-foreground">No disbursements pending approval.</TableCell></TableRow>
                        ) : (
                            data.map((d) => {
                                const isEncoder = d.encoderId != null && currentUserId != null && String(d.encoderId) === String(currentUserId);
                                const isSelectable = !isEncoder;

                                return (
                                    <TableRow key={d.id} className="group hover:bg-primary/[0.04] transition-all duration-200 border-border even:bg-muted/15">
                                        <TableCell className="align-top py-4 text-center">
                                            <Checkbox 
                                                checked={selectedIds.includes(d.id)} 
                                                onCheckedChange={(checked) => handleSelectRow(d.id, !!checked)} 
                                                disabled={!isSelectable}
                                                className="translate-y-[2px] border-muted-foreground/50 disabled:opacity-30"
                                            />
                                        </TableCell>
                                        <TableCell className="align-top py-4">
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-center gap-1.5 text-foreground">
                                                    <FileText className="w-3.5 h-3.5 text-primary opacity-75" />
                                                    <span className="font-black text-xs uppercase tracking-wider">{d.docNo}</span>
                                                </div>
                                                <span className="text-[9px] font-bold text-muted-foreground uppercase">
                                                    Date: {d.transactionDate ? format(new Date(d.transactionDate), "MMM dd, yyyy") : "No Date"}
                                                </span>
                                                {isEncoder && (
                                                    <Badge variant="destructive" className="text-[8px] uppercase tracking-wider px-1.5 py-0 mt-1 bg-rose-50 text-rose-700 border-rose-200 w-fit flex items-center gap-1">
                                                        <AlertTriangle className="w-2.5 h-2.5" /> SoD: You Encoder
                                                    </Badge>
                                                )}

                                                {d.remarks && (
                                                    <span className="text-[9px] font-semibold text-muted-foreground/80 mt-1 uppercase max-w-[170px] truncate" title={d.remarks}>
                                                        Remarks: {d.remarks}
                                                    </span>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="align-top py-4">
                                            <div className="flex flex-col gap-1.5 max-w-[200px]">
                                                <span className="text-xs font-black text-foreground uppercase truncate" title={d.payeeName}>
                                                    {d.payeeName || "UNKNOWN PAYEE"}
                                                </span>
                                                <div className="flex flex-col gap-0.5">
                                                    {d.divisionName && (
                                                        <div className="flex items-center gap-1 text-[9px] font-bold text-muted-foreground uppercase">
                                                            <Building2 className="w-3 h-3 opacity-60" />
                                                            <span className="truncate">{d.divisionName}</span>
                                                        </div>
                                                    )}
                                                    {d.departmentName && (
                                                        <span className={`text-[8px] font-bold text-muted-foreground/70 uppercase ${d.divisionName ? "pl-4" : ""} truncate`}>
                                                            {d.departmentName}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell className="align-top py-4">
                                            <div className="flex flex-col gap-1.5 max-w-[450px]">
                                                {d.payables && d.payables.length > 0 ? (
                                                    d.payables.map((p, idx) => (
                                                        <div key={idx} className="flex items-start justify-between text-[10px] bg-muted/30 p-1.5 rounded-lg border border-border/40 gap-4">
                                                            <div className="min-w-0">
                                                                <span className="font-bold text-foreground block truncate max-w-[280px]">
                                                                    {p.accountTitle || `COA: ${p.coaId}`}
                                                                </span>
                                                                <span className="text-[8px] text-muted-foreground font-semibold block uppercase mt-0.5">
                                                                    Ref: {p.referenceNo || "N/A"} {p.remarks ? `| ${p.remarks}` : ""}
                                                                </span>
                                                            </div>
                                                            <span className="font-black text-foreground shrink-0">{formatCurrency(p.amount)}</span>
                                                        </div>
                                                    ))
                                                ) : (
                                                    <span className="text-[9px] text-muted-foreground italic font-semibold">No payables attached</span>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="align-top py-4 text-right">
                                            <span className="text-xs font-black text-foreground tracking-wide">
                                                {formatCurrency(d.totalAmount)}
                                            </span>
                                        </TableCell>
                                        <TableCell className="align-top py-4 text-right pr-4">
                                            <Button variant="ghost" size="sm" className="h-8 text-[10px] font-black uppercase text-primary hover:bg-primary/10" onClick={() => onView(d)}>View</Button>
                                        </TableCell>
                                    </TableRow>
                                );
                            })
                        )}
                    </TableBody>
                </Table>
            </StickyTableWrapper>
        </div>
    );
}
