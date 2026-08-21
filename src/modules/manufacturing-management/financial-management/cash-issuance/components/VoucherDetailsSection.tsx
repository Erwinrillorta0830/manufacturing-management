"use client";

import React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SearchableDropdown } from "./SearchableDropdown";
import { Plus, DownloadCloud, Paperclip, Trash2, UploadCloud, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { SupplierDto, DepartmentDto } from "../types";
import { toast } from "sonner";

interface VoucherDetailsSectionProps {
    transactionTypeId: number | "";
    setTransactionTypeId: (val: number | "") => void;
    transactionDate: string;
    setTransactionDate: (val: string) => void;
    payeeId: number | "";
    handlePayeeSelect: (val: number) => void;
    suppliers: SupplierDto[];
    loadingData: boolean;
    payeeSupplierTypeLabel: string;
    isNonTradeVoucher: boolean;
    setIsPayeeRegistrationOpen: (open: boolean) => void;
    handleOpenPoModal: (supplierId: number) => void;
    departments: DepartmentDto[];
    departmentId: number | "";
    setDepartmentId: (val: number | "") => void;
    remarks: string;
    setRemarks: (val: string) => void;
    supportingDocumentsUrl: string;
    setSupportingDocumentsUrl: (val: string) => void;
    uploadingFile: boolean;
    setUploadingFile: (val: boolean) => void;
    totalAmount: number;
    disabled?: boolean;
}

export function VoucherDetailsSection({
    transactionTypeId,
    setTransactionTypeId,
    transactionDate,
    setTransactionDate,
    payeeId,
    handlePayeeSelect,
    suppliers,
    loadingData,
    payeeSupplierTypeLabel,
    isNonTradeVoucher,
    setIsPayeeRegistrationOpen,
    handleOpenPoModal,
    departments,
    departmentId,
    setDepartmentId,
    remarks,
    setRemarks,
    supportingDocumentsUrl,
    setSupportingDocumentsUrl,
    uploadingFile,
    setUploadingFile,
    disabled = false
}: VoucherDetailsSectionProps) {
    return (
        <div className="bg-card p-4 rounded-lg border border-border shadow-sm grid grid-cols-1 gap-3.5 text-foreground">
            <div className="flex items-center gap-2 border-b border-border pb-1.5">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Voucher Properties</span>
            </div>

            {/* Row 1: Transaction Type & Payee */}
            <div className="grid grid-cols-1 md:grid-cols-10 gap-3">
                <div className="space-y-1 md:col-span-2">
                    <Label className="text-[11px] font-semibold text-muted-foreground">Type <span className="text-destructive">*</span></Label>
                    <select
                        className="flex h-8 w-full rounded-sm border border-input bg-background px-2 py-1 text-xs font-medium text-foreground focus-visible:outline-none focus:ring-1 focus:ring-ring hover:border-accent-foreground/30 transition-colors disabled:bg-muted disabled:cursor-not-allowed"
                        value={transactionTypeId}
                        disabled={disabled}
                        onChange={e => {
                            setTransactionTypeId(e.target.value === "" ? "" : Number(e.target.value));
                        }}>
                        <option value="" disabled>-- Select --</option>
                        <option value={1}>Trade</option>
                        <option value={2}>Non-Trade</option>
                    </select>
                </div>

                <div className="space-y-1 md:col-span-8">
                    <Label className="text-[11px] font-semibold text-muted-foreground flex justify-between items-center">
                        <span>Payee <span className="text-destructive">*</span></span>
                        {loadingData && <Loader2 className="w-3 h-3 animate-spin text-primary"/>}
                    </Label>
                    <div className="flex gap-1">
                        <div className="flex-1 min-w-0">
                            <SearchableDropdown<number>
                                options={suppliers.map((s) => ({
                                    value: s.id ?? 0,
                                    label: s.supplier_name || `Supplier-${s.id}`
                                }))}
                                value={payeeId as number | ""} 
                                onSelect={handlePayeeSelect}
                                placeholder="Choose Payee..."
                                disabled={loadingData || !transactionTypeId || disabled}
                                className="h-8 w-full bg-background border-input hover:border-accent-foreground/30 text-xs text-foreground rounded-sm"
                                popoverWidth="w-[280px]"
                            />
                        </div>
                        <Button
                            type="button"
                            variant="outline"
                            disabled={disabled}
                            onClick={() => setIsPayeeRegistrationOpen(true)}
                            className="h-8 px-2 text-xs font-semibold border-input text-primary hover:bg-accent rounded-sm shrink-0 disabled:opacity-50"
                            title={`Register a ${payeeSupplierTypeLabel} payee`}
                        >
                            <Plus className="w-3.5 h-3.5"/>
                        </Button>
                        {!isNonTradeVoucher && (
                            <Button 
                                type="button" 
                                onClick={() => handleOpenPoModal(Number(payeeId))}
                                disabled={!payeeId || disabled}
                                className="h-8 px-2 bg-primary hover:bg-primary/95 text-primary-foreground rounded-sm shadow-sm shrink-0 disabled:opacity-50"
                                title="Pull Unpaid POs"
                            >
                                <DownloadCloud className="w-3.5 h-3.5"/>
                            </Button>
                        )}
                    </div>
                </div>
            </div>

            {/* Row 2: Department */}
            <div className="grid grid-cols-1 gap-3">
                <div className="space-y-1">
                    <Label className="text-[11px] font-semibold text-muted-foreground">Department <span className="text-destructive">*</span></Label>
                    <SearchableDropdown<number>
                        options={departments.map((d) => ({
                            value: d.departmentId ?? 0,
                            label: d.departmentName || `Department`
                        }))}
                        value={departmentId as number | ""} 
                        onSelect={(val) => setDepartmentId(val)}
                        placeholder="Choose Dept..."
                        disabled={disabled}
                        className="h-8 w-full bg-background border-input hover:border-accent-foreground/30 text-xs text-foreground rounded-sm disabled:bg-muted disabled:cursor-not-allowed"
                        popoverWidth="w-[280px]"
                    />
                </div>
            </div>

            {/* Row 3: Transaction Date & Remarks */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1 col-span-1">
                    <Label className="text-[11px] font-semibold text-muted-foreground">Date <span className="text-destructive">*</span></Label>
                    <Input 
                        type="date" 
                        value={transactionDate}
                        disabled={disabled}
                        onChange={e => setTransactionDate(e.target.value)}
                        className="h-8 text-xs font-medium border-input hover:border-accent-foreground/30 focus-visible:outline-none focus:ring-1 focus:ring-ring rounded-sm bg-background text-foreground disabled:bg-muted disabled:cursor-not-allowed"
                    />
                </div>

                <div className="space-y-1 col-span-2">
                    <Label className="text-[11px] font-semibold text-muted-foreground">Memo / Particulars</Label>
                    <Input 
                        value={remarks} 
                        disabled={disabled}
                        onChange={e => setRemarks(e.target.value)}
                        className="h-8 text-xs border-input hover:border-accent-foreground/30 focus-visible:outline-none focus:ring-1 focus:ring-ring rounded-sm bg-background text-foreground disabled:bg-muted disabled:cursor-not-allowed"
                        placeholder="Voucher description..."
                    />
                </div>
            </div>

            {/* Supporting Documents */}
            <div className="space-y-1 pt-1.5">
                <Label className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1.5">
                    <Paperclip className="w-3.5 h-3.5 text-primary"/> Attachments
                </Label>
                {supportingDocumentsUrl ? (
                    <div className="flex items-center justify-between p-2 rounded-sm border border-border bg-muted shadow-sm">
                        <div className="flex items-center gap-2 truncate max-w-[80%]">
                            <Paperclip className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-500 shrink-0" />
                            <a 
                                href={supportingDocumentsUrl.startsWith("http") ? supportingDocumentsUrl : `${(process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "")}/assets/${supportingDocumentsUrl}`} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="text-xs font-semibold text-primary hover:underline truncate"
                            >
                                {supportingDocumentsUrl.split("/").pop() || "View document"}
                            </a>
                        </div>
                        <Button 
                            type="button" 
                            variant="ghost" 
                            size="icon" 
                            disabled={disabled}
                            onClick={() => setSupportingDocumentsUrl("")} 
                            className="h-7 w-7 text-destructive hover:bg-destructive/10 rounded-full disabled:opacity-50"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                    </div>
                ) : (
                    <div className={cn(
                        "relative border border-dashed border-border rounded-sm p-3 transition-colors flex flex-col items-center justify-center gap-1 bg-muted/40",
                        disabled ? "cursor-not-allowed opacity-60" : "hover:border-primary/50"
                    )}>
                        {uploadingFile ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin text-primary" />
                                <span className="text-[10px] font-bold text-muted-foreground uppercase">Uploading...</span>
                            </>
                        ) : (
                            <>
                                <UploadCloud className="w-5 h-5 text-muted-foreground" />
                                <span className="text-[11px] font-semibold text-foreground text-center">Attach supporting documents</span>
                                <span className="text-[9px] text-muted-foreground font-medium">PDF, Images (Max 5MB)</span>
                                {!disabled && (
                                    <input 
                                        type="file" 
                                        accept="image/*,application/pdf"
                                        onChange={async (e) => {
                                            const file = e.target.files?.[0];
                                            if (!file) return;
                                            try {
                                                setUploadingFile(true);
                                                const formData = new FormData();
                                                formData.append("file", file);
                                                const res = await fetch("/api/manufacturing/financial-management/cash-issuance/disbursements/upload", {
                                                    method: "POST",
                                                    body: formData
                                                });
                                                if (!res.ok) throw new Error("Upload failed");
                                                const result = await res.json();
                                                const fileId = result?.data?.id;
                                                if (fileId) {
                                                    setSupportingDocumentsUrl(fileId);
                                                    toast.success("Attachment uploaded successfully!");
                                                } else {
                                                    toast.error("Upload succeeded but returned no ID.");
                                                }
                                            } catch (err) {
                                                toast.error("Failed to upload file.");
                                                console.error(err);
                                            } finally {
                                                setUploadingFile(false);
                                            }
                                        }}
                                        className="absolute inset-0 opacity-0 cursor-pointer" 
                                    />
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
