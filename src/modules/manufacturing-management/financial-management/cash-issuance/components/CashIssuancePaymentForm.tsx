import React from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileText, Save, Trash2 } from "lucide-react";
import { PaymentLine, BankAccountDto } from "../types";
import { StickyTableWrapper } from "./StickyTableWrapper";
import { SearchableDropdown } from "./SearchableDropdown";
import { isPettyCashBankAccount } from "@/app/api/manufacturing/financial-management/cash-issuance/disbursements/_payment-method";
import { cn } from "@/lib/utils";

interface CashIssuancePaymentFormProps {
    payments: PaymentLine[];
    setPayments: React.Dispatch<React.SetStateAction<PaymentLine[]>>;
    banks: BankAccountDto[];
    paymentCoaOptions: { value: number; label: string }[];
    paymentValidationErrors: Set<string>;
    setPaymentValidationErrors: React.Dispatch<React.SetStateAction<Set<string>>>;
    handlePaymentChange: <K extends keyof PaymentLine>(index: number, key: K, value: PaymentLine[K]) => void;
    handleAddPayment: () => void;
    arePaymentFieldsLocked: boolean;
    paymentTotal: number;
    remainingPayment: number;
    formatCurrency: (val: number) => string;
}

export function CashIssuancePaymentForm({
    payments,
    setPayments,
    banks,
    paymentCoaOptions,
    paymentValidationErrors,
    setPaymentValidationErrors,
    handlePaymentChange,
    handleAddPayment,
    arePaymentFieldsLocked,
    paymentTotal,
    remainingPayment,
    formatCurrency
}: CashIssuancePaymentFormProps) {
    return (
        <div className="bg-card rounded-sm border border-border shadow-sm overflow-hidden text-foreground">
            <div className="bg-muted px-4 py-2.5 border-b border-border flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-600" />
                <span className="text-xs font-bold text-foreground">Payment details (Check / Cash distribution)</span>
                <span className="ml-auto text-[10px] font-semibold text-muted-foreground uppercase">
                    {payments.length} row{payments.length !== 1 ? "s" : ""}
                </span>
            </div>
            <div className="p-0.5">
                <StickyTableWrapper className="max-h-[360px] overflow-auto custom-scrollbar border-b border-border">
                    <Table className="border-collapse min-w-[900px]">
                        <TableHeader className="bg-muted sticky top-0 z-10 border-b border-border">
                            <TableRow className="border-border">
                                <TableHead className="text-[10px] font-bold text-muted-foreground uppercase h-9 py-1 px-3 min-w-[150px]">Check / Reference No.</TableHead>
                                <TableHead className="text-[10px] font-bold text-muted-foreground uppercase h-9 py-1 px-3 min-w-[145px]">Payment Date</TableHead>
                                <TableHead className="text-[10px] font-bold text-muted-foreground uppercase h-9 py-1 px-3 min-w-[240px]">Bank / Cash Account</TableHead>
                                <TableHead className="text-[10px] font-bold text-muted-foreground uppercase h-9 py-1 px-3 min-w-[260px]">GL Account (Credit) <span className="text-destructive">*</span></TableHead>
                                <TableHead className="text-[10px] font-bold text-muted-foreground uppercase h-9 py-1 px-3 min-w-[180px]">Memo Description</TableHead>
                                <TableHead className="text-[10px] font-bold text-muted-foreground uppercase h-9 py-1 px-3 w-[120px] text-right">Amount</TableHead>
                                <TableHead className="w-[40px]"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody className="divide-y divide-border bg-card">
                            {payments.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center text-xs text-muted-foreground py-8">
                                        No payment lines added. Click &quot;Add payment line&quot; to allocate.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                payments.map((line, index) => {
                                    const selectedBank = banks.find((bank) => bank.bankId === Number(line.bankId));
                                    const pettyCash = isPettyCashBankAccount(selectedBank);
                                    const isReleasedPaymentLine = !!(line.releasedDate || line.releasedBy);
                                    const isPaymentLineLocked = arePaymentFieldsLocked || isReleasedPaymentLine;

                                    return (
                                        <TableRow key={line.id ?? index} className={cn("hover:bg-muted/40 border-b border-border", isReleasedPaymentLine && "bg-muted/30")}>
                                            <TableCell className="p-1 align-middle">
                                                <Input
                                                    disabled={isPaymentLineLocked || pettyCash}
                                                    className={cn("h-7 text-xs uppercase bg-transparent border-transparent hover:border-input focus:border-primary focus:bg-background shadow-none px-2 text-foreground", paymentValidationErrors.has(`${index}:checkNo`) && "border-rose-500 bg-rose-50/30")}
                                                    placeholder={pettyCash ? "Not required for petty cash" : "CK-000000"}
                                                    value={line.checkNo || ""}
                                                    onChange={(event) => handlePaymentChange(index, "checkNo", event.target.value)}
                                                />
                                            </TableCell>
                                            <TableCell className="p-1 align-middle">
                                                <Input
                                                    type="date"
                                                    disabled={isPaymentLineLocked}
                                                    className={cn("h-7 text-xs bg-transparent border-transparent hover:border-input focus:border-primary focus:bg-background shadow-none px-2 text-foreground", paymentValidationErrors.has(`${index}:date`) && "border-rose-500 bg-rose-50/30")}
                                                    value={line.date || ""}
                                                    onChange={(event) => handlePaymentChange(index, "date", event.target.value)}
                                                />
                                            </TableCell>
                                            <TableCell className="p-1 align-middle">
                                                <SearchableDropdown<number>
                                                    options={banks.map((bank) => ({ value: bank.bankId, label: `${bank.bankName} - ${bank.accountNumber}` }))}
                                                    value={line.bankId || ""}
                                                    onSelect={(value) => handlePaymentChange(index, "bankId", value)}
                                                    placeholder="Select bank / cash account..."
                                                    disabled={isPaymentLineLocked}
                                                    className={cn("h-7 w-full bg-transparent border-transparent hover:border-input focus:border-primary focus:bg-background text-xs rounded-sm shadow-none px-2 text-foreground", paymentValidationErrors.has(`${index}:bankId`) && "border-rose-500 bg-rose-50/30")}
                                                    popoverWidth="w-[360px]"
                                                />
                                            </TableCell>
                                            <TableCell className="p-1 align-middle">
                                                <SearchableDropdown<number>
                                                    options={paymentCoaOptions}
                                                    value={line.coaId || ""}
                                                    onSelect={(value) => handlePaymentChange(index, "coaId", value)}
                                                    placeholder="Select GL Account (Credit)..."
                                                    disabled={isPaymentLineLocked}
                                                    className={cn("h-7 w-full bg-transparent border-transparent hover:border-input focus:border-primary focus:bg-background text-xs rounded-sm shadow-none px-2 text-foreground", paymentValidationErrors.has(`${index}:coaId`) && "border-rose-500 bg-rose-50/30")}
                                                    popoverWidth="w-[420px]"
                                                />
                                            </TableCell>
                                            <TableCell className="p-1 align-middle">
                                                <Input
                                                    disabled={isPaymentLineLocked}
                                                    className="h-7 text-xs bg-transparent border-transparent hover:border-input focus:border-primary focus:bg-background shadow-none px-2 text-foreground"
                                                    placeholder="Line payment info..."
                                                    value={line.remarks || ""}
                                                    onChange={(event) => handlePaymentChange(index, "remarks", event.target.value)}
                                                />
                                            </TableCell>
                                            <TableCell className="p-1 align-middle">
                                                <Input
                                                    type="number"
                                                    disabled={isPaymentLineLocked}
                                                    className={cn("h-7 text-xs font-bold text-right bg-transparent border-transparent hover:border-input focus:border-primary focus:bg-background shadow-none px-2 text-foreground", paymentValidationErrors.has(`${index}:amount`) && "border-rose-500 bg-rose-50/30")}
                                                    placeholder="0.00"
                                                    value={line.amount || ""}
                                                    onChange={(event) => handlePaymentChange(index, "amount", event.target.value === "" ? 0 : Number(event.target.value))}
                                                />
                                            </TableCell>
                                            <TableCell className="p-1 text-center align-middle">
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    onClick={() => {
                                                        setPayments((current) => current.filter((_, paymentIndex) => paymentIndex !== index));
                                                        setPaymentValidationErrors(new Set());
                                                    }}
                                                    disabled={isPaymentLineLocked}
                                                    className="h-7 w-7 text-destructive hover:bg-destructive/10 rounded-sm disabled:opacity-50"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>
                </StickyTableWrapper>
                <div className="px-3 py-2 flex items-center justify-between bg-muted/30">
                    <Button type="button" variant="outline" size="sm" onClick={handleAddPayment} disabled={arePaymentFieldsLocked} className="h-7 text-[10px] font-bold uppercase">
                        <Save className="w-3 h-3 mr-1" /> Add payment line
                    </Button>
                    <div className="flex items-center gap-4 text-[10px] font-black uppercase text-muted-foreground">
                        <span>Total Payments: {formatCurrency(paymentTotal)}</span>
                        <span className={remainingPayment < -0.01 ? "text-destructive" : "text-emerald-600"}>
                            Remaining: {formatCurrency(remainingPayment)}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
