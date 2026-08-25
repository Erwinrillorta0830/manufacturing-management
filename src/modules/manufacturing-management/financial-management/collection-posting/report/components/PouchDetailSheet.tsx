import React, { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import {
    ArrowRight,
    Banknote,
    CheckCircle2,
    ChevronDown,
    ChevronUp,
    Clock,
    CornerDownRight,
    FileText,
    Landmark,
    Printer,
    Scale,
    Search,
    Wallet,
} from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PouchReportDto } from "../hooks/useCollectionReport";

interface PouchDetailSheetProps {
    pouch: PouchReportDto | null;
    isOpen: boolean;
    onClose: () => void;
    onPrint: (pouch: PouchReportDto) => void | Promise<void>;
    isPrinting?: boolean;
}

type SortKey = "invoiceNo" | "actualInvoiceTotal" | "grossAmount" | "remainingBalance";

const PESO = "\u20B1";
const displayIdentifier = (value?: string | null) => value?.trim() || "\u2014";
const displayCustomer = (value?: string | null) => {
    const customer = value?.trim();
    return customer && !/^chk-/i.test(customer) ? customer : "N/A";
};
const formatMoney = (value?: number | null) =>
    `${PESO}${Number(value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
const formatCheckDate = (value?: string | null) => value ? format(parseISO(value), "MM/dd/yyyy") : "—";

export function PouchDetailSheet({ pouch, isOpen, onClose, onPrint, isPrinting = false }: PouchDetailSheetProps) {
    const [inlineSearch, setInlineSearch] = useState("");
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: "asc" | "desc" }>({
        key: "invoiceNo",
        direction: "asc",
    });

    const handleSort = (key: SortKey) => {
        setSortConfig((previous) => ({
            key,
            direction: previous.key === key && previous.direction === "asc" ? "desc" : "asc",
        }));
    };

    const processedInvoices = useMemo(() => {
        if (!pouch?.invoices) return [];

        const term = inlineSearch.toLowerCase();
        const filtered = pouch.invoices.filter((invoice) =>
            invoice.invoiceNo.toLowerCase().includes(term) ||
            invoice.customerName.toLowerCase().includes(term)
        );

        return [...filtered].sort((a, b) => {
            if (sortConfig.key === "invoiceNo") {
                const comparison = a.invoiceNo.localeCompare(b.invoiceNo, undefined, {
                    numeric: true,
                    sensitivity: "base",
                });
                return sortConfig.direction === "asc" ? comparison : -comparison;
            }

            const comparison = Number(a[sortConfig.key] ?? 0) - Number(b[sortConfig.key] ?? 0);
            return sortConfig.direction === "asc" ? comparison : -comparison;
        });
    }, [inlineSearch, pouch, sortConfig]);

    const renderSortIcon = (key: SortKey) => {
        if (sortConfig.key !== key) return <ChevronUp size={12} className="ml-1 inline opacity-20" />;
        return sortConfig.direction === "asc"
            ? <ChevronUp size={12} className="ml-1 inline text-primary" />
            : <ChevronDown size={12} className="ml-1 inline text-primary" />;
    };

    if (!pouch) return null;

    const checks = pouch.checks ?? [];
    const variances = pouch.variances ?? [];
    const netVariance = pouch.overage - pouch.shortage;

    return (
        <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <SheetContent
                side="right"
                className="w-full overflow-hidden border-l border-border bg-background/95 p-0 shadow-2xl backdrop-blur-xl sm:w-[65vw] sm:max-w-[900px]"
            >
                <div className="relative shrink-0 overflow-hidden border-b border-border/60 bg-card p-6">
                    <div className="pointer-events-none absolute right-0 top-0 h-64 w-64 translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-3xl" />
                    <SheetHeader className="relative z-10">
                        <div className="flex items-start justify-between">
                            <div className="space-y-1.5">
                                <SheetTitle className="flex items-center gap-3 font-mono text-3xl font-black tracking-tight text-foreground">
                                    <div className="rounded-xl bg-primary/10 p-2.5 text-primary"><Wallet size={24} /></div>
                                    {pouch.docNo}
                                </SheetTitle>
                                <SheetDescription className="ml-14 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                    Collection Date:
                                    <strong className="text-foreground">
                                        {pouch.date ? format(parseISO(pouch.date), "MMMM do, yyyy") : "N/A"}
                                    </strong>
                                </SheetDescription>
                            </div>
                            <div className="flex items-center gap-2 pt-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-8 gap-1.5 px-3 text-[10px] font-black uppercase tracking-widest"
                                    onClick={() => void onPrint(pouch)}
                                    disabled={isPrinting}
                                >
                                    <Printer size={13} />
                                    {isPrinting ? "Preparing..." : "Print Record"}
                                </Button>
                                {pouch.isPosted ? (
                                    <Badge className="border-none bg-emerald-500/15 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-emerald-700">
                                        <CheckCircle2 size={14} className="mr-1.5" /> Posted
                                    </Badge>
                                ) : (
                                    <Badge className="border-none bg-orange-500/15 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-orange-700">
                                        <Clock size={14} className="mr-1.5" /> Draft
                                    </Badge>
                                )}
                            </div>
                        </div>
                    </SheetHeader>
                </div>

                <div className="flex-1 overflow-hidden bg-slate-50/50 p-6 dark:bg-zinc-950/50">
                    <Tabs defaultValue="settled" className="flex h-full flex-col">
                        <TabsList className="mb-6 grid h-12 w-full shrink-0 grid-cols-3 rounded-xl border border-border/50 bg-muted/60 p-1.5 shadow-sm">
                            <TabsTrigger value="assets" className="rounded-lg text-xs font-bold uppercase tracking-wider">
                                <Landmark size={14} className="mr-2" /> Assets
                            </TabsTrigger>
                            <TabsTrigger value="settled" className="rounded-lg text-xs font-bold uppercase tracking-wider">
                                <FileText size={14} className="mr-2" /> Settled
                            </TabsTrigger>
                            <TabsTrigger value="variances" className="rounded-lg text-xs font-bold uppercase tracking-wider">
                                <Scale size={14} className="mr-2" /> Variances
                            </TabsTrigger>
                        </TabsList>

                        <div className="scrollbar-thin flex-1 overflow-y-auto pb-8 pr-2">
                            <TabsContent value="assets" className="m-0 space-y-5">
                                <Card className="overflow-hidden rounded-2xl border-border/60 bg-gradient-to-br from-emerald-50/80 to-background shadow-sm dark:from-emerald-950/30">
                                    <div className="flex items-center justify-between p-5">
                                        <div className="flex items-center gap-3">
                                            <div className="rounded-lg bg-emerald-100 p-2 text-emerald-600 dark:bg-emerald-900 dark:text-emerald-400">
                                                <Banknote size={20} />
                                            </div>
                                            <h3 className="text-xs font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-400">Physical Cash</h3>
                                        </div>
                                        <span className="font-mono text-2xl font-black tracking-tight text-emerald-700 dark:text-emerald-400">{formatMoney(pouch.totalCash)}</span>
                                    </div>
                                </Card>

                                <Card className="overflow-hidden rounded-2xl border-border/60 bg-background shadow-sm">
                                    <div className="flex items-center justify-between border-b border-border/50 bg-blue-50/50 px-5 py-3 dark:bg-blue-950/20">
                                        <div className="flex items-center gap-2.5">
                                            <Landmark size={16} className="text-blue-600" />
                                            <h3 className="text-xs font-black uppercase tracking-widest text-blue-700 dark:text-blue-400">Deposits (Checks)</h3>
                                        </div>
                                        <span className="font-mono text-sm font-black text-blue-700 dark:text-blue-400">Total: {formatMoney(pouch.totalCheck)}</span>
                                    </div>
                                    <table className="w-full border-collapse text-xs">
                                        <thead className="bg-muted/30">
                                            <tr>
                                                <th className="pl-5 text-left font-medium">Bank</th>
                                                <th className="text-left font-medium">Check No.</th>
                                                <th className="text-left font-medium">Check Date</th>
                                                <th className="text-left font-medium">Customer</th>
                                                <th className="pr-5 text-right font-medium">Amount</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {checks.length === 0 ? (
                                                <tr><td colSpan={5} className="py-10 text-center italic text-muted-foreground">No checks recorded.</td></tr>
                                            ) : checks.map((check, index) => (
                                                <tr key={index} className="border-b border-border/40 transition-colors hover:bg-muted/40">
                                                    <td className="pl-5 font-bold">{check.bankName}</td>
                                                    <td className="font-mono text-muted-foreground">{check.checkNo}</td>
                                                    <td className="font-mono text-muted-foreground">{formatCheckDate(check.chequeDate)}</td>
                                                    <td className="text-muted-foreground">{displayCustomer(check.customerName)}</td>
                                                    <td className="pr-5 text-right font-mono font-bold">{formatMoney(check.amount)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </Card>

                                <Card className="overflow-hidden rounded-2xl border-primary/20 bg-primary/5 shadow-sm">
                                    <div className="flex items-center justify-between p-5">
                                        <div>
                                            <p className="text-[10px] font-black uppercase tracking-widest text-primary">Total Assets / Total Remittance</p>
                                            <p className="mt-1 text-xs text-muted-foreground">Physical cash plus deposited checks</p>
                                        </div>
                                        <span className="font-mono text-2xl font-black text-primary">{formatMoney(pouch.totalCash + pouch.totalCheck)}</span>
                                    </div>
                                </Card>
                            </TabsContent>

                            <TabsContent value="settled" className="m-0 flex h-full flex-col space-y-4">
                                <div className="relative shrink-0">
                                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                    <Input
                                        placeholder="Filter by Invoice Number or Customer Name..."
                                        value={inlineSearch}
                                        onChange={(event) => setInlineSearch(event.target.value)}
                                        className="h-11 rounded-xl border-border/60 bg-background pl-9 text-xs font-medium shadow-sm"
                                    />
                                </div>

                                <Card className="flex flex-1 flex-col overflow-hidden rounded-2xl border-border/60 bg-background shadow-sm">
                                    <div className="flex shrink-0 items-center justify-between border-b border-primary/10 bg-primary/5 px-5 py-4">
                                        <div className="flex items-center gap-2.5">
                                            <div className="rounded-md bg-primary/20 p-1.5 text-primary"><FileText size={16} /></div>
                                            <h3 className="text-xs font-black uppercase tracking-widest text-primary">Accounts Settled Breakdown</h3>
                                        </div>
                                        <div className="flex flex-col text-right">
                                            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Net Receivable Generated</span>
                                            <span className="mt-1 font-mono text-xl font-black leading-none tracking-tight text-primary">{formatMoney(pouch.invoiceNetTotal)}</span>
                                        </div>
                                    </div>

                                    <div className="scrollbar-thin flex-1 overflow-y-auto">
                                        <table className="w-full border-collapse text-xs">
                                            <thead className="sticky top-0 z-10 border-b border-border/60 bg-muted/90 shadow-sm backdrop-blur-md">
                                                <tr>
                                                    <th className="cursor-pointer select-none pl-5 text-left text-[10px] font-bold uppercase tracking-wider hover:bg-muted/50" onClick={() => handleSort("invoiceNo")}>Invoice / Customer {renderSortIcon("invoiceNo")}</th>
                                                    <th className="cursor-pointer select-none text-right text-[10px] font-bold uppercase tracking-wider hover:bg-muted/50" onClick={() => handleSort("actualInvoiceTotal")}>Actual Invoice Total {renderSortIcon("actualInvoiceTotal")}</th>
                                                    <th className="cursor-pointer select-none text-right text-[10px] font-bold uppercase tracking-wider hover:bg-muted/50" onClick={() => handleSort("grossAmount")}>Amount Applied {renderSortIcon("grossAmount")}</th>
                                                    <th className="cursor-pointer select-none pr-5 text-right text-[10px] font-bold uppercase tracking-wider hover:bg-muted/50" onClick={() => handleSort("remainingBalance")}>Remaining Balance {renderSortIcon("remainingBalance")}</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {processedInvoices.length === 0 ? (
                                                    <tr><td colSpan={4} className="py-10 text-center italic text-muted-foreground">No matching invoices found.</td></tr>
                                                ) : processedInvoices.map((invoice, index) => {
                                                    const hasCreditMemo = invoice.memoAmount > 0;
                                                    const isSettled = invoice.remainingBalance <= 0.01;
                                                    const isPartiallySettled = !isSettled && invoice.grossAmount > 0;

                                                    return (
                                                        <React.Fragment key={`${invoice.invoiceNo}-${index}`}>
                                                            <tr className="border-b border-border/40 bg-muted/10 transition-colors hover:bg-muted/20">
                                                                <td className="pl-5 pt-4">
                                                                    <div className="font-mono text-sm font-black tracking-tight text-foreground">{invoice.invoiceNo}</div>
                                                                    <div className="mt-0.5 text-[11px] font-medium text-muted-foreground">{invoice.customerName}</div>
                                                                    <div className={`mt-1 text-[9px] font-bold uppercase tracking-wider ${isSettled ? "text-emerald-600" : isPartiallySettled ? "text-amber-600" : "text-muted-foreground"}`}>
                                                                        {isSettled ? "Settled" : isPartiallySettled ? "Partially Settled" : "Outstanding"}
                                                                    </div>
                                                                </td>
                                                                <td className="pt-4 text-right align-top font-mono font-bold text-muted-foreground">{formatMoney(invoice.actualInvoiceTotal)}</td>
                                                                <td className="pt-4 text-right align-top font-mono font-bold text-primary">{formatMoney(invoice.grossAmount)}</td>
                                                                <td className="pr-5 pt-4 text-right align-top font-mono font-bold text-foreground">{formatMoney(invoice.remainingBalance)}</td>
                                                            </tr>

                                                            {invoice.memoAmount !== 0 && (
                                                                <tr className="border-none hover:bg-transparent">
                                                                    <td colSpan={3} className="py-2 pl-5">
                                                                        <div className={`ml-4 flex items-center gap-2.5 border-l-2 pl-3 text-[11px] font-semibold ${hasCreditMemo ? "border-indigo-200 text-indigo-600" : "border-orange-200 text-orange-600"}`}>
                                                                            <CornerDownRight size={14} className="opacity-60" /> {hasCreditMemo ? "Credit Memo Applied" : "Debit Memo Applied"}
                                                                        </div>
                                                                    </td>
                                                                    <td className={`py-2 pr-5 text-right font-mono text-[11px] font-medium ${hasCreditMemo ? "text-indigo-600" : "text-orange-600"}`}>
                                                                        {hasCreditMemo ? "- " : "+ "}{formatMoney(Math.abs(invoice.memoAmount))}
                                                                    </td>
                                                                </tr>
                                                            )}

                                                            {invoice.returnAmount > 0 && (
                                                                <tr className="border-none hover:bg-transparent">
                                                                    <td colSpan={3} className="py-2 pl-5">
                                                                        <div className="ml-4 flex items-center gap-2.5 border-l-2 border-pink-200 pl-3 text-[11px] font-semibold text-pink-600">
                                                                            <CornerDownRight size={14} className="opacity-60" /> Sales Return Applied
                                                                        </div>
                                                                    </td>
                                                                    <td className="py-2 pr-5 text-right font-mono text-[11px] font-medium text-pink-600">- {formatMoney(invoice.returnAmount)}</td>
                                                                </tr>
                                                            )}

                                                            <tr className="border-b border-border/60">
                                                                <td colSpan={3} className="py-3 pl-5">
                                                                    <div className="ml-4 flex items-center gap-2.5 border-l-2 border-emerald-300 pl-3 text-[11px] font-black text-emerald-700">
                                                                        <ArrowRight size={14} className="opacity-80" /> Net Receivable Generated
                                                                    </div>
                                                                </td>
                                                                <td className="bg-emerald-50/30 py-3 pr-5 text-right font-mono font-black text-emerald-700">{formatMoney(invoice.netAmount)}</td>
                                                            </tr>
                                                        </React.Fragment>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </Card>
                            </TabsContent>

                            <TabsContent value="variances" className="m-0 space-y-5">
                                <Card className="overflow-hidden rounded-2xl border-border/60 bg-background shadow-sm">
                                    <div className="flex items-center justify-between border-b border-border/50 bg-muted/40 px-5 py-4">
                                        <div className="flex items-center gap-2.5">
                                            <Scale size={16} className="text-muted-foreground" />
                                            <h3 className="text-xs font-black uppercase tracking-widest text-foreground">Adjustments & Variances</h3>
                                        </div>
                                        <div className="flex flex-col text-right">
                                            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Net Impact</span>
                                            <span className={`mt-0.5 font-mono text-lg font-black tracking-tight ${netVariance < 0 ? "text-red-600" : netVariance > 0 ? "text-purple-600" : "text-foreground"}`}>
                                                {netVariance < 0 ? "-" : netVariance > 0 ? "+" : ""}{formatMoney(Math.abs(netVariance))}
                                            </span>
                                        </div>
                                    </div>
                                    <table className="w-full border-collapse text-xs">
                                        <thead className="bg-muted/20">
                                            <tr>
                                                <th className="pl-5 text-left font-medium">Type</th>
                                                <th className="text-left font-medium">Customer</th>
                                                <th className="text-left font-medium">Invoice No.</th>
                                                <th className="text-left font-medium">Account / Reason</th>
                                                <th className="pr-5 text-right font-medium">Amount</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {variances.length === 0 ? (
                                                <tr><td colSpan={5} className="py-10 text-center italic text-muted-foreground">No variances logged.</td></tr>
                                            ) : variances.map((variance, index) => (
                                                <tr key={index} className="border-b border-border/40 transition-colors hover:bg-muted/40">
                                                    <td className="pl-5">
                                                        <Badge variant="secondary" className={`border-none px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest ${variance.type.includes("Shortage") ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" : "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"}`}>
                                                            {variance.type}
                                                        </Badge>
                                                    </td>
                                                    <td className="font-medium text-foreground">{displayIdentifier(variance.customerName)}</td>
                                                    <td className="font-mono text-muted-foreground">{displayIdentifier(variance.invoiceNo)}</td>
                                                    <td>
                                                        <div className="font-bold text-foreground">{variance.accountTitle}</div>
                                                        <div className="mt-0.5 max-w-[300px] text-[11px] leading-relaxed text-muted-foreground">{variance.remarks}</div>
                                                    </td>
                                                    <td className="pr-5 text-right font-mono font-black text-foreground">{formatMoney(variance.amount)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </Card>
                            </TabsContent>
                        </div>
                    </Tabs>
                </div>
            </SheetContent>
        </Sheet>
    );
}
