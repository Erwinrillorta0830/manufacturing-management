// src/modules/financial-management/accounting/customers-memo/components/HeaderForm.tsx

"use client";

import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Supplier, Customer, Salesman, ChartOfAccount } from "../types";
import { SearchableSelect } from "./SearchableSelect";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface HeaderFormProps {
    suppliers: Supplier[];
    customers: Customer[];
    salesmen: Salesman[];
    coas: ChartOfAccount[];

    selectedSupplier: string;
    onSupplierChange: (val: string) => void;

    selectedCustomer: string;
    onCustomerChange: (val: string) => void;

    selectedSalesman: string;
    onSalesmanChange: (val: string) => void;

    selectedCOA: string;
    onCOAChange: (val: string) => void;

    balanceType: number;
    onBalanceTypeChange: (val: number) => void;

    amount: number;
    onAmountChange: (val: number) => void;

    memoNumber: string;

    reason: string;
    onReasonChange: (val: string) => void;


}

export const HeaderForm = React.memo(function HeaderForm({
    suppliers, customers, salesmen, coas,
    selectedSupplier, onSupplierChange,
    selectedCustomer, onCustomerChange,
    selectedSalesman, onSalesmanChange,
    selectedCOA, onCOAChange,
    balanceType, onBalanceTypeChange,
    amount, onAmountChange,
    memoNumber,
    reason, onReasonChange,
}: HeaderFormProps) {
    // Memoize options for search performance
    const supplierOptions = useMemo(() =>
        suppliers.map(s => ({ value: String(s.id), label: s.supplier_name })),
        [suppliers]);

    const customerOptions = useMemo(() =>
        customers.map(c => {
            const address = [c.brgy, c.city].filter(Boolean).join(", ");
            const storeInfo = c.store_name && c.store_name !== c.customer_name ? c.store_name : "";
            const subLabel = [storeInfo, address].filter(Boolean).join(" | ");
            return {
                value: String(c.id),
                label: c.customer_name,
                subLabel: subLabel
            };
        }),
        [customers]);

    const salesmanOptions = useMemo(() =>
        salesmen.map(sl => ({
            value: String(sl.id),
            label: sl.salesman_name,
            subLabel: sl.salesman_code
        })),
        [salesmen]);

    const coaOptions = useMemo(() =>
        coas.map(c => ({
            value: String(c.coa_id),
            label: c.account_title,
            subLabel: c.gl_code
        })),
        [coas]);

    return (
        <Card className="shadow-xl border-t-4 border-t-blue-500 h-fit">
            <CardHeader className="pb-3">
                <CardTitle className="text-xl flex items-center gap-2">
                    Header Information
                </CardTitle>
                <CardDescription>Define basic memo parameters</CardDescription>
            </CardHeader>
            <CardContent className="p-8">
                <div className="mb-8 flex flex-col gap-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/70">Memo Type <span className="text-red-500">*</span></Label>
                    <div className="flex bg-muted/40 p-1.5 rounded-[1rem] w-full max-w-sm border border-muted">
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => {
                                onBalanceTypeChange(1);
                                onCOAChange("");
                            }}
                            className={cn("flex-1 h-12 font-black rounded-xl transition-all", balanceType === 1 ? "bg-white shadow-md text-blue-700" : "text-muted-foreground hover:text-foreground hover:bg-white/50")}
                        >
                            Credit Memo
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => {
                                onBalanceTypeChange(2);
                                onCOAChange("");
                            }}
                            className={cn("flex-1 h-12 font-black rounded-xl transition-all", balanceType === 2 ? "bg-white shadow-md text-red-700" : "text-muted-foreground hover:text-foreground hover:bg-white/50")}
                        >
                            Debit Memo
                        </Button>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                    {/* Primary Relations */}
                    <div className="space-y-6">
                        <div className="space-y-1.5">
                            <Label htmlFor="supplier" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/70">Supplier Relationship <span className="text-red-500">*</span></Label>
                            <SearchableSelect
                                options={supplierOptions}
                                value={selectedSupplier}
                                onValueChange={onSupplierChange}
                                placeholder="Select Supplier..."
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="customer" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/70">Target Customer <span className="text-red-500">*</span></Label>
                            <SearchableSelect
                                options={customerOptions}
                                value={selectedCustomer}
                                onValueChange={onCustomerChange}
                                placeholder="Select Customer..."
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="salesman" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/70">Assigned Salesman <span className="text-red-500">*</span></Label>
                            <SearchableSelect
                                options={salesmanOptions}
                                value={selectedSalesman}
                                onValueChange={onSalesmanChange}
                                placeholder="Select Salesman..."
                            />
                        </div>
                    </div>

                    {/* Memo Technical Details */}
                    <div className="space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="memo-number" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/70">Memo ID</Label>
                                <Input id="memo-number" value={memoNumber} readOnly className="h-10 bg-muted/30 font-black text-blue-600 border-dashed" />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="amount" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/70">Memo Amount <span className="text-red-500">*</span></Label>
                                <div className="relative">
                                    <span className="absolute left-3 top-2.5 text-xs font-bold text-muted-foreground">₱</span>
                                    <Input
                                        id="amount"
                                        type="number"
                                        className="h-10 pl-7 text-sm font-black shadow-inner"
                                        value={amount || ""}
                                        onChange={e => onAmountChange(Number(e.target.value))}
                                        placeholder="0.00"
                                    />
                                </div>
                            </div>
                        </div>


                        <div className="space-y-1.5">
                            <Label htmlFor="coa" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/70">Chart of Account Link <span className="text-red-500">*</span></Label>
                            <SearchableSelect
                                options={coaOptions}
                                value={selectedCOA}
                                onValueChange={onCOAChange}
                                placeholder="Select GL Account..."
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="reason" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/70">Reason / Description</Label>
                            <Input id="reason" className="h-10 text-xs" placeholder="Describe the purpose of this memo..." value={reason} onChange={e => onReasonChange(e.target.value)} />
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
});
