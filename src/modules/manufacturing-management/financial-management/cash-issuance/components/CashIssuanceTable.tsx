"use client";

import React from "react";
import { Disbursement } from "../types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { FileText, Building2, Wallet, Lock } from "lucide-react";
import { StickyTableWrapper } from "./StickyTableWrapper";
import { formatCurrency, getPaymentStateLabel, getStatusColor } from "../utils/disbursement-utils";

interface CashIssuanceTableProps {
    data: Disbursement[];
    loading: boolean;
    onView: (d: Disbursement) => void;
}

export function CashIssuanceTable({ data, loading, onView }: CashIssuanceTableProps) {

    return (
        <StickyTableWrapper className="rounded-md border border-border bg-card shadow-sm overflow-auto max-h-[65vh]">
            <Table>
                <TableHeader className="bg-muted/80 backdrop-blur-md sticky top-0 z-10 shadow-[0_1px_0_0_hsl(var(--border))]">
                    <TableRow className="border-border">
                        <TableHead className="text-[10px] font-black uppercase tracking-widest text-muted-foreground w-[180px]">Voucher Info</TableHead>
                        <TableHead className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Payee & Particulars</TableHead>
                        <TableHead className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Cost Center</TableHead>
                        <TableHead className="text-[10px] font-black uppercase tracking-widest text-muted-foreground text-right">Financials</TableHead>
                        <TableHead className="text-[10px] font-black uppercase tracking-widest text-muted-foreground text-center w-[120px]">Status</TableHead>
                        <TableHead className="w-[80px]"></TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {loading ? (
                        <TableRow><TableCell colSpan={6} className="h-48 text-center text-sm font-medium text-muted-foreground">Loading vouchers...</TableCell></TableRow>
                    ) : data.length === 0 ? (
                        <TableRow><TableCell colSpan={6} className="h-48 text-center text-sm font-medium text-muted-foreground">No disbursements found in this category.</TableCell></TableRow>
                    ) : (
                        data.map((d) => (
                            <TableRow key={d.id} className="group hover:bg-primary/[0.04] transition-all duration-200 border-border even:bg-muted/20">
                                <TableCell className="align-top py-4">
                                    <div className="flex flex-col gap-1">
                                        <div className="flex items-center gap-1.5 text-foreground">
                                            <FileText className={`w-3.5 h-3.5 ${d.isPosted === 1 ? 'text-foreground' : 'text-primary'} opacity-70`} />
                                            <span className="font-bold text-xs uppercase">{d.docNo}</span>
                                            {d.isPosted === 1 && (
                                                <span title="Locked & Posted"><Lock className="w-3 h-3 text-destructive ml-1" /></span>
                                            )}
                                        </div>
                                        <span className="text-[10px] font-bold text-muted-foreground uppercase">
                                            {d.transactionDate ? format(new Date(d.transactionDate), "MMM dd, yyyy") : "No Date"}
                                        </span>
                                    </div>
                                </TableCell>
                                <TableCell className="align-top py-4">
                                    <div className="flex flex-col gap-1 max-w-[300px]">
                                        <span className="text-xs font-black text-foreground uppercase truncate">{d.payeeName || "UNKNOWN PAYEE"}</span>
                                        <span className="text-[10px] font-medium text-muted-foreground truncate" title={d.remarks}>{d.remarks || "No particulars provided"}</span>
                                    </div>
                                </TableCell>
                                <TableCell className="align-top py-4">
                                    <div className="flex flex-col gap-1">
                                        {d.divisionName && (
                                            <div className="flex items-center gap-1.5 text-foreground/80">
                                                <Building2 className="w-3 h-3 opacity-50" />
                                                <span className="text-[10px] font-bold uppercase truncate">{d.divisionName}</span>
                                            </div>
                                        )}
                                        <span className={`text-[9px] font-bold text-muted-foreground uppercase ${d.divisionName ? "ml-4.5" : ""} truncate`}>{d.departmentName || "No Department"}</span>
                                    </div>
                                </TableCell>
                                <TableCell className="align-top py-4 text-right">
                                    <div className="flex flex-col gap-1 items-end">
                                        <span className="text-xs font-black text-foreground">{formatCurrency(d.totalAmount)}</span>
                                        <div className="flex items-center gap-1 text-[9px] font-bold text-emerald-600 dark:text-emerald-500">
                                            <Wallet className="w-3 h-3" /> {getPaymentStateLabel(d.paymentState, d.paidAmount)}: {formatCurrency(d.paidAmount || 0)}
                                        </div>
                                    </div>
                                </TableCell>
                                <TableCell className="align-top py-4 text-center">
                                    <Badge variant="outline" className={`text-[9px] font-black uppercase px-2 py-0.5 ${getStatusColor(d.status)}`}>{d.status}</Badge>
                                </TableCell>
                                <TableCell className="align-top py-4 text-right pr-4">
                                    <Button variant="ghost" size="sm" className="h-8 text-[10px] font-black uppercase text-primary hover:bg-primary/10" onClick={() => onView(d)}>View</Button>
                                </TableCell>
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>
        </StickyTableWrapper>
    );
}
