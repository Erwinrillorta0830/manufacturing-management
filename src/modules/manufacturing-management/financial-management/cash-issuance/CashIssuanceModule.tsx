"use client";

import React, { useState } from "react";
import { useCashIssuance } from "./hooks/useCashIssuance";
import { CashIssuanceTable } from "./components/CashIssuanceTable";
import { CashIssuanceApprovalTable } from "./components/CashIssuanceApprovalTable";
import { CashIssuanceCreateDialog } from "./components/CashIssuanceCreateDialog";
import { CashIssuanceViewDialog } from "./components/CashIssuanceViewDialog";
import { CashIssuanceDashboardTab } from "./components/CashIssuanceDashboardTab";
import { Disbursement } from "./types";
import { disbursementProvider } from "./providers/fetchProvider";
import { SearchableDropdown } from "./components/SearchableDropdown";
import { AddPayeeModal } from "@/modules/manufacturing-management/financial-management/payee-registration/components/modals/add-payee-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import {
    Plus, RefreshCw, Search, Check, ChevronsUpDown,
    X, UserPlus, SlidersHorizontal
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type CashIssuanceSubModule = "preparation" | "approval" | "releasing" | "posting" | "all" | "dashboard";

const SUBMODULE_STATUS_FILTERS: Record<CashIssuanceSubModule, string> = {
    preparation: "Draft,Submitted,Returned for Revision",
    approval: "Submitted",
    releasing: "Approved,Partially Released",
    posting: "Released",
    all: "All",
    dashboard: "All",
};

interface CashIssuanceModuleProps {
    initialSubModule?: CashIssuanceSubModule;
}

export default function CashIssuanceModule({ initialSubModule = "preparation" }: CashIssuanceModuleProps) {
    const initialStatusFilter = SUBMODULE_STATUS_FILTERS[initialSubModule];
    const {
        data, loading, page, setPage, size, changeSize, totalPages,
        activeType, handleTabChange, refresh,
        create, update, updatePaymentAllocation, changeStatus, actionLoading,
        supplierSearch, setSupplierSearch, startDate, setStartDate, endDate, setEndDate,
        statusFilter, setStatusFilter, divisionFilter, setDivisionFilter, departmentFilter, setDepartmentFilter, docNoSearch, setDocNoSearch,
        applyFilters, clearFilters, filterSuppliers, divisions, departments
    } = useCashIssuance(initialStatusFilter);

    const [subModule, setSubModule] = useState<CashIssuanceSubModule>(initialSubModule);

    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [isViewOpen, setIsViewOpen] = useState(false);
    const [isAddPayeeOpen, setIsAddPayeeOpen] = useState(false);
    const [isComboboxOpen, setIsComboboxOpen] = useState(false);
    const [selectedDisbursement, setSelectedDisbursement] = useState<Disbursement | null>(null);
    const [formMode, setFormMode] = useState<"create" | "edit">("create");

    // 🚀 State to toggle the advanced filters!
    const [showFilters, setShowFilters] = useState(false);

    // Batch approval states
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [batchLoading, setBatchLoading] = useState(false);

    const handleBatchApprove = async () => {
        if (selectedIds.length === 0) return;
        setBatchLoading(true);
        try {
            await Promise.all(selectedIds.map(id => disbursementProvider.updateStatus(id, "Approved")));
            toast.success(`Successfully approved ${selectedIds.length} vouchers`);
            setSelectedIds([]);
            refresh();
        } catch {
            toast.error("Failed to approve some vouchers");
            refresh();
        } finally {
            setBatchLoading(false);
        }
    };

    const handleBatchReject = async () => {
        if (selectedIds.length === 0) return;
        setBatchLoading(true);
        try {
            await Promise.all(selectedIds.map(id => disbursementProvider.updateStatus(id, "Returned for Revision")));
            toast.success(`Successfully returned ${selectedIds.length} vouchers for revision`);
            setSelectedIds([]);
            refresh();
        } catch {
            toast.error("Failed to return some vouchers");
            refresh();
        } finally {
            setBatchLoading(false);
        }
    };

    // Sync subModule to hook's statusFilter
    React.useEffect(() => {
        setStatusFilter(SUBMODULE_STATUS_FILTERS[subModule]);
        setPage(0);
        setSelectedIds([]); // Clear selection when subModule changes
    }, [subModule, setStatusFilter, setPage]);

    // Sync initialSubModule prop changes to state
    React.useEffect(() => {
        setSubModule(initialSubModule);
    }, [initialSubModule]);

    const addPayeeSupplierType = activeType === "Non-Trade" ? "NON-TRADE" : "TRADE";

    const handleView = (d: Disbursement) => { setSelectedDisbursement(d); setIsViewOpen(true); };
    const handleEdit = (d: Disbursement) => { setSelectedDisbursement(d); setFormMode("edit"); setIsViewOpen(false); setIsCreateOpen(true); };
    const handleNewVoucherClick = () => { setSelectedDisbursement(null); setFormMode("create"); setIsCreateOpen(true); };

    const handleAddPayeeSuccess = () => {
        refresh();
        toast.success("Payee created successfully");
        setIsAddPayeeOpen(false);
    };

    return (
        <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden bg-background w-full h-full">
                {/* PAGE HEADER */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 p-6 border-b border-border bg-card shrink-0 shadow-sm z-10">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2.5">
                            <span className="text-[10px] font-black uppercase tracking-widest text-primary px-2 py-0.5 rounded-full bg-primary/10">
                                {subModule === "dashboard" ? "BI Analytics" : "Disbursement Module"}
                            </span>
                            {subModule !== "dashboard" && (
                                <Badge variant="outline" className={cn("text-[9px] font-black uppercase px-2 py-0.5", 
                                    subModule === "preparation" ? "bg-amber-50 text-amber-700 border-amber-200" :
                                    subModule === "approval" ? "bg-blue-50 text-blue-700 border-blue-200" :
                                    subModule === "releasing" ? "bg-purple-50 text-purple-700 border-purple-200" :
                                    subModule === "posting" ? "bg-rose-50 text-rose-700 border-rose-200" :
                                    "bg-muted text-muted-foreground"
                                )}>
                                    {subModule === "preparation" ? "Preparation" :
                                     subModule === "approval" ? "Approval" :
                                     subModule === "releasing" ? "Releasing" :
                                     subModule === "posting" ? "Posting" :
                                     "Ledger"}
                                </Badge>
                            )}
                        </div>
                        <h1 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-foreground mt-1.5 truncate">
                            {subModule === "preparation" ? "Voucher Preparation" :
                             subModule === "approval" ? "Verification & Approval" :
                             subModule === "releasing" ? "Check Releasing" :
                             subModule === "posting" ? "Treasury Posting" :
                             subModule === "all" ? "Cash Issuance Ledger" :
                             "Analytics & Reports"}
                        </h1>
                        <p className="text-[10px] sm:text-xs text-muted-foreground font-semibold mt-0.5 tracking-wider uppercase">
                            {subModule === "preparation" ? "Draft, revise, and manage trade/non-trade voucher voucher-preparation" :
                             subModule === "approval" ? "Verify accounts and approve submitted vouchers for check processing" :
                             subModule === "releasing" ? "Issue and release bank checks for approved voucher payments" :
                             subModule === "posting" ? "Review balanced voucher entries and post transactions to General Ledger" :
                             subModule === "all" ? "Audit log cash-issuance-ledger of all prepared, approved, released, and posted cash issuance vouchers" :
                             "Visualize cash outflows, division expense distributions, and payment bi-analytics"}
                        </p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                        {subModule === "approval" && selectedIds.length > 0 && (
                            <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-2 duration-300">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleBatchReject}
                                    disabled={batchLoading || loading}
                                    className="h-9 px-3 text-[10px] font-black uppercase tracking-widest text-destructive hover:bg-destructive/10"
                                >
                                    {batchLoading ? <RefreshCw className="w-3.5 h-3.5 mr-2 animate-spin" /> : <X className="w-3.5 h-3.5 mr-2" />}
                                    Return Selected ({selectedIds.length})
                                </Button>
                                <Button
                                    size="sm"
                                    onClick={handleBatchApprove}
                                    disabled={batchLoading || loading}
                                    className="h-9 px-4 text-[10px] font-black uppercase tracking-widest bg-emerald-600 hover:bg-emerald-700 text-white shadow-md"
                                >
                                    {batchLoading ? <RefreshCw className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-2" />}
                                    Approve Selected ({selectedIds.length})
                                </Button>
                            </div>
                        )}

                        <Button
                            variant="outline"
                            size="sm"
                            onClick={refresh}
                            disabled={loading}
                            className="h-9 px-3 text-[10px] font-black uppercase tracking-widest bg-background border-border/80 hover:bg-muted/50 transition-all"
                        >
                            <RefreshCw className={cn("w-3.5 h-3.5 mr-2", loading && "animate-spin")} />
                            Refresh
                        </Button>

                        {subModule === "preparation" && (
                            <>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setIsAddPayeeOpen(true)}
                                    className="h-9 px-3 font-bold uppercase tracking-wider text-[10px]"
                                >
                                    <UserPlus className="w-3.5 h-3.5 mr-2" /> New Payee
                                </Button>
                                <Button
                                    size="sm"
                                    onClick={handleNewVoucherClick}
                                    className="h-9 px-4 font-black uppercase tracking-widest text-[10px] shadow-md shadow-primary/10 hover:shadow-lg hover:shadow-primary/20 transition-all active:scale-95 animate-pulse"
                                >
                                    <Plus className="w-3.5 h-3.5 mr-2" /> New Voucher
                                </Button>
                            </>
                        )}
                    </div>
                </div>

                {/* MODULE WORKSPACE AREA */}
                <div className="flex-1 overflow-y-auto min-w-0 bg-muted/5 p-6 scrollbar-thin flex flex-col gap-6">
                    {subModule === "dashboard" ? (
                        <CashIssuanceDashboardTab />
                    ) : (
                        <>
                            {/* 🔍 FILTER BAR */}
                            <div className="flex flex-col bg-card rounded-2xl border border-border shadow-sm shadow-black/5 overflow-hidden transition-all duration-300">
                                {/* Primary Search Row */}
                                <div className="flex flex-col sm:flex-row items-center justify-between p-3 gap-3">
                                    <div className="flex items-center flex-1 w-full relative group">
                                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                                        <Input
                                            placeholder="Search by Voucher No... (Press Enter)"
                                            value={docNoSearch}
                                            onChange={e => setDocNoSearch(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && applyFilters()}
                                            className="pl-11 h-10 text-xs font-bold uppercase bg-muted/30 border-none shadow-none focus-visible:ring-1 focus-visible:ring-primary/30 focus-visible:bg-background rounded-xl w-full transition-all"
                                        />
                                    </div>

                                    <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                                        <Button
                                            variant={showFilters ? "secondary" : "ghost"}
                                            size="sm"
                                            onClick={() => setShowFilters(!showFilters)}
                                            className={cn(
                                                "h-10 px-4 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all",
                                                showFilters ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
                                            )}
                                        >
                                            <SlidersHorizontal className="w-4 h-4 mr-2" />
                                            {showFilters ? "Hide Filters" : "Advanced"}
                                        </Button>

                                        <div className="h-6 w-px bg-border mx-1 hidden sm:block"></div>

                                        <Button
                                            onClick={applyFilters}
                                            size="sm"
                                            className="h-10 px-6 text-[10px] font-black uppercase tracking-widest bg-foreground text-background hover:bg-foreground/90 shadow-sm rounded-xl"
                                        >
                                            Apply
                                        </Button>
                                        <Button
                                    onClick={() => clearFilters(SUBMODULE_STATUS_FILTERS[subModule])}
                                            variant="ghost"
                                            size="icon"
                                            className="h-10 w-10 text-destructive hover:bg-destructive/10 hover:text-destructive rounded-xl"
                                            title="Clear All Filters"
                                        >
                                            <X className="w-4 h-4"/>
                                        </Button>
                                    </div>
                                </div>

                                {/* Secondary Row (Advanced Filters) */}
                                <div className={cn(
                                    "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5 px-5 pb-5 border-t border-border/50 bg-muted/10 transition-all duration-300 ease-in-out overflow-hidden",
                                    showFilters ? "pt-5 opacity-100 max-h-[500px]" : "pt-0 opacity-0 max-h-0 border-transparent pb-0"
                                )}>
                                    {/* Supplier Combobox */}
                                    <div className="space-y-2">
                                        <Label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/80">Supplier / Payee</Label>
                                        <Popover open={isComboboxOpen} onOpenChange={setIsComboboxOpen}>
                                            <PopoverTrigger asChild>
                                                <Button variant="outline" role="combobox" aria-expanded={isComboboxOpen} className="w-full h-9 text-xs font-bold justify-between bg-background hover:bg-muted/50 px-3 rounded-lg border-border/50 shadow-sm">
                                                    <span className="truncate text-foreground uppercase">{supplierSearch || "All Suppliers"}</span>
                                                    <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-[300px] p-0 shadow-xl border-border rounded-xl" align="start">
                                                <Command>
                                                    <CommandInput placeholder="Type to filter..." className="h-10 text-xs font-medium" />
                                                    <CommandList className="max-h-[250px] scrollbar-thin">
                                                        <CommandEmpty className="py-6 text-center text-xs text-muted-foreground font-medium">No supplier found.</CommandEmpty>
                                                        <CommandGroup>
                                                            <CommandItem onSelect={() => { setSupplierSearch(""); setIsComboboxOpen(false); }} className="text-[10px] font-black uppercase text-muted-foreground cursor-pointer py-2">-- Clear Selection --</CommandItem>
                                                            {filterSuppliers.map((sup) => (
                                                                <CommandItem key={sup.id} value={sup.supplier_name} onSelect={() => { setSupplierSearch(sup.supplier_name); setIsComboboxOpen(false); }} className="text-xs font-bold uppercase cursor-pointer py-2">
                                                                    <Check className={cn("mr-2 h-4 w-4 text-primary", supplierSearch === sup.supplier_name ? "opacity-100" : "opacity-0")} />
                                                                    {sup.supplier_name}
                                                                </CommandItem>
                                                            ))}
                                                        </CommandGroup>
                                                    </CommandList>
                                                </Command>
                                            </PopoverContent>
                                        </Popover>
                                    </div>

                                    {/* Date Range */}
                                    <div className="space-y-2 col-span-1 sm:col-span-2 lg:col-span-1">
                                        <Label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/80">Transaction Date</Label>
                                        <div className="flex items-center gap-2">
                                            <Input type="date" className="h-9 text-xs font-bold uppercase bg-background border-border/50 shadow-sm flex-1 px-2 rounded-lg" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                                            <span className="text-[9px] font-black text-muted-foreground/50 uppercase">TO</span>
                                            <Input type="date" className="h-9 text-xs font-bold uppercase bg-background border-border/50 shadow-sm flex-1 px-2 rounded-lg" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                                        </div>
                                    </div>

                                    {/* Status */}
                                    {subModule === "all" && (
                                        <div className="space-y-2">
                                            <Label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/80">Approval Status</Label>
                                            <select className="h-9 w-full rounded-lg border border-border/50 bg-background px-3 text-xs font-bold uppercase text-foreground shadow-sm focus:ring-1 focus:ring-primary/30 transition-all outline-none" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                                                <option value="All">All Statuses</option>
                                                <option value="Draft">Draft</option>
                                                <option value="Submitted">Submitted</option>
                                                <option value="Approved">Approved</option>
                                                <option value="Partially Released">Partially Released</option>
                                                <option value="Released">Released</option>
                                                <option value="Posted">Posted</option>
                                                <option value="Returned for Revision">Returned</option>
                                            </select>
                                        </div>
                                    )}

                                    {/* Division */}
                                    <div className="space-y-2">
                                        <Label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/80">Cost Division</Label>
                                        <SearchableDropdown<string>
                                            options={[
                                                { value: "", label: "All Divisions" },
                                                ...divisions.map((d, idx) => ({
                                                    value: String(d.divisionId),
                                                    label: d.divisionName || `Division-${d.divisionId || idx}`,
                                                })),
                                            ]}
                                            value={divisionFilter}
                                            onSelect={setDivisionFilter}
                                            placeholder="All Divisions"
                                            className="h-9 w-full rounded-lg border border-border/50 bg-background px-3 text-xs font-bold uppercase text-foreground shadow-sm focus:ring-1 focus:ring-primary/30 transition-all outline-none"
                                            popoverWidth="w-[280px]"
                                        />
                                    </div>

                                    {/* Department */}
                                    <div className="space-y-2">
                                        <Label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/80">Cost Department</Label>
                                        <select className="h-9 w-full rounded-lg border border-border/50 bg-background px-3 text-xs font-bold uppercase text-foreground shadow-sm focus:ring-1 focus:ring-primary/30 transition-all outline-none" value={departmentFilter} onChange={e => setDepartmentFilter(e.target.value)}>
                                            <option value="">All Departments</option>
                                            {departments.map((d, idx) => (
                                                <option key={`f-dept-${d.departmentId || idx}`} value={d.departmentId}>
                                                    {d.departmentName}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* 📊 DATA TABLE */}
                            <div className="flex flex-col gap-4 flex-1 min-h-0">
                                <Tabs value={activeType} onValueChange={handleTabChange} className="w-full flex-1 flex flex-col min-h-0">
                                    <div className="flex items-center justify-between mb-2 shrink-0">
                                        <TabsList className="bg-muted/50 p-1 rounded-xl h-10 shadow-inner">
                                            <TabsTrigger value="All" className="rounded-lg text-[10px] font-black uppercase tracking-widest data-[state=active]:bg-background data-[state=active]:shadow-sm px-4">All Types</TabsTrigger>
                                            <TabsTrigger value="Trade" className="rounded-lg text-[10px] font-black uppercase tracking-widest data-[state=active]:bg-background data-[state=active]:shadow-sm px-4">Trade</TabsTrigger>
                                            <TabsTrigger value="Non-Trade" className="rounded-lg text-[10px] font-black uppercase tracking-widest data-[state=active]:bg-background data-[state=active]:shadow-sm px-4">Non-Trade</TabsTrigger>
                                            <TabsTrigger value="WER" className="rounded-lg text-[10px] font-black uppercase tracking-widest data-[state=active]:bg-background data-[state=active]:shadow-sm px-4">WER</TabsTrigger>
                                        </TabsList>
                                    </div>

                                    <div className="bg-card border border-border shadow-sm rounded-2xl overflow-hidden flex-1 min-h-0 relative flex flex-col">
                                        {subModule === "approval" ? (
                                            <CashIssuanceApprovalTable
                                                data={data}
                                                loading={loading}
                                                onView={handleView}
                                                selectedIds={selectedIds}
                                                onSelectChange={setSelectedIds}
                                            />
                                        ) : (
                                            <CashIssuanceTable 
                                                 data={subModule === "posting" ? data.filter(d => {
                                                     const debit = d.totalDebit ?? d.payables?.reduce((sum, p) => sum + (Number(p.amount) || 0), 0) ?? 0;
                                                     const credit = d.totalCredit ?? d.payments?.reduce((sum, p) => sum + (Number(p.amount) || 0), 0) ?? 0;
                                                     return Math.abs(debit - credit) < 0.01 && debit > 0;
                                                 }) : data} 
                                                 loading={loading} 
                                                 onView={handleView} 
                                            />
                                        )}
                                    </div>
                                </Tabs>

                                {/* Pagination */}
                                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-2 pt-2 shrink-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Rows per page:</span>
                                        <select 
                                            className="h-9 rounded-xl border border-border/50 bg-background px-3 text-[10px] font-black uppercase text-foreground shadow-sm focus:ring-1 focus:ring-primary/30 transition-all outline-none cursor-pointer hover:bg-muted/50"
                                            value={size}
                                            onChange={(e) => changeSize(Number(e.target.value))}
                                        >
                                            <option value={10}>10 rows</option>
                                            <option value={20}>20 rows</option>
                                            <option value={50}>50 rows</option>
                                            <option value={100}>100 rows</option>
                                        </select>
                                    </div>

                                    <div className="flex items-center gap-3">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-9 px-4 rounded-xl text-[10px] font-bold uppercase tracking-widest border-border/50 hover:bg-muted/50"
                                            disabled={page === 0 || loading}
                                            onClick={() => setPage(p => p - 1)}
                                        >
                                            Previous
                                        </Button>
                                        <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest px-4 py-1.5 rounded-full bg-muted/50 border border-border/30">
                                            Page {page + 1} of {totalPages || 1}
                                        </span>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-9 px-4 rounded-xl text-[10px] font-bold uppercase tracking-widest border-border/50 hover:bg-muted/50"
                                            disabled={page >= totalPages - 1 || loading || totalPages === 0}
                                            onClick={() => setPage(p => p + 1)}
                                        >
                                            Next
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>

            {/* GLOBAL DIALOGS & MODALS */}
            <CashIssuanceCreateDialog
                open={isCreateOpen}
                onOpenChange={setIsCreateOpen}
                onSubmit={(payload) => formMode === "edit" ? update(selectedDisbursement!.id, payload) : create(payload)}
                onPaymentAllocationSubmit={updatePaymentAllocation}
                editData={formMode === "edit" ? selectedDisbursement : null}
                paymentEditingMode={subModule === "releasing" ? "releasing" : "preparation"}
                loading={actionLoading}
            />

            <CashIssuanceViewDialog
                open={isViewOpen}
                onOpenChange={setIsViewOpen}
                disbursement={selectedDisbursement}
                onUpdateStatus={changeStatus}
                onEdit={handleEdit}
                loading={actionLoading}
                subModule={subModule}
            />

            <AddPayeeModal
                open={isAddPayeeOpen}
                onClose={() => setIsAddPayeeOpen(false)}
                onSuccess={handleAddPayeeSuccess}
                supplierType={addPayeeSupplierType}
                allowSupplierTypeSelect
            />
        </div>
    );
}
