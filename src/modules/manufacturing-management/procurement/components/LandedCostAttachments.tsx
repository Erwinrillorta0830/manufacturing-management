"use client";

import { useCallback, useEffect, useState } from "react";
import { FileText, Loader2, Paperclip, Trash2, Upload } from "lucide-react";
import {
    deleteLandedCostAttachment,
    fetchLandedCostDraft,
    saveLandedCostDraft,
    uploadLandedCostAttachment
} from "../services/procurement-api";
import type {
    LandedCostAllocationRule,
    LandedCostAttachmentRecord,
    LandedCostExpenseDraft
} from "../types";
import { landedCostMethodLabel } from "../landed-cost-methods";
import type { ExpenseTypeOption } from "./purchase-amount/types";

interface LandedCostAttachmentsProps {
    purchaseOrderId: number;
    allocationRule: LandedCostAllocationRule | "";
    expenses: LandedCostExpenseDraft[];
    expenseTypes: ExpenseTypeOption[];
    exchangeRate?: number;
    sourceFlow: string;
    disabled?: boolean;
    onComputationChange?: (computationId: number | null, status?: string) => void;
}

const DOCUMENT_TYPES: Array<{ value: LandedCostAttachmentRecord["document_type"]; label: string }> = [
    { value: "CARRIER_INVOICE", label: "Carrier Invoice" },
    { value: "FREIGHT_BILL", label: "Freight Bill" },
    { value: "BROKER_ASSESSMENT_SHEET", label: "Broker Assessment Sheet" },
    { value: "OTHER", label: "Other" }
];

function formatFileSize(size: number | null | undefined): string {
    if (!size || size < 1024) return `${size || 0} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export default function LandedCostAttachments({
    purchaseOrderId,
    allocationRule,
    expenses,
    expenseTypes,
    exchangeRate,
    sourceFlow,
    disabled = false,
    onComputationChange
}: LandedCostAttachmentsProps) {
    const [computationId, setComputationId] = useState<number | null>(null);
    const [computationStatus, setComputationStatus] = useState<string | undefined>();
    const [attachments, setAttachments] = useState<LandedCostAttachmentRecord[]>([]);
    const [documentType, setDocumentType] = useState<LandedCostAttachmentRecord["document_type"]>("OTHER");
    const [expenseTypeId, setExpenseTypeId] = useState<number | "">("");
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const updateComputation = useCallback((id: number | null, status?: string) => {
        setComputationId(id);
        setComputationStatus(status);
        onComputationChange?.(id, status);
    }, [onComputationChange]);

    useEffect(() => {
        let active = true;
        setLoading(true);
        setError(null);
        setAttachments([]);
        setExpenseTypeId("");
        updateComputation(null);
        void fetchLandedCostDraft(purchaseOrderId)
            .then(data => {
                if (!active) return;
                setAttachments(data.attachments || []);
                updateComputation(data.computation?.id || null, data.computation?.status);
            })
            .catch((err: unknown) => {
                if (active) setError(err instanceof Error ? err.message : "Failed to load landed-cost documents.");
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [purchaseOrderId, updateComputation]);

    const ensureDraft = async (): Promise<number> => {
        if (!allocationRule) throw new Error("Select an allocation rule before uploading computation documents.");
        const result = await saveLandedCostDraft(purchaseOrderId, allocationRule, expenses, sourceFlow, exchangeRate);
        const id = result.computation?.id || computationId;
        if (!id) throw new Error("The landed-cost draft did not return a computation identifier.");
        updateComputation(id, result.computation?.status);
        return id;
    };

    const handleUpload = async (file: File | undefined) => {
        if (!file) return;
        setBusy(true);
        setError(null);
        try {
            if (!expenseTypeId) throw new Error("Select an expense type/document tag before uploading a computation document.");
            const id = await ensureDraft();
            const uploaded = await uploadLandedCostAttachment(purchaseOrderId, id, documentType, expenseTypeId, file);
            setAttachments(previous => [...previous, uploaded]);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Failed to upload landed-cost document.");
        } finally {
            setBusy(false);
        }
    };

    const handleDelete = async (attachment: LandedCostAttachmentRecord) => {
        setBusy(true);
        setError(null);
        try {
            await deleteLandedCostAttachment(purchaseOrderId, attachment.id);
            setAttachments(previous => previous.filter(item => item.id !== attachment.id));
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Failed to delete landed-cost document.");
        } finally {
            setBusy(false);
        }
    };

    const locked = disabled || computationStatus === "FINALIZED" || computationStatus === "FINALIZING";

    return (
        <div className="rounded-xl border bg-card p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                        <Paperclip className="h-4 w-4 text-primary" />
                        Computation Documents
                    </h4>
                    <p className="text-[11px] text-muted-foreground mt-1">
                        Attach carrier invoices, freight bills, or broker assessment sheets. PDF and XLSX files up to 25 MB are supported.
                    </p>
                </div>
                {computationStatus && (
                    <span className="rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wide">
                        {computationStatus}
                    </span>
                )}
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
                <div className={`self-center rounded-md border px-2.5 py-1.5 text-[11px] font-bold ${allocationRule ? "border-primary/30 bg-primary/5 text-primary" : "border-amber-500/30 bg-amber-500/5 text-amber-700"}`}>
                    Selected rule: {landedCostMethodLabel(allocationRule)}
                </div>
                <select
                    value={expenseTypeId === "" ? "" : String(expenseTypeId)}
                    onChange={event => setExpenseTypeId(event.target.value ? Number(event.target.value) : "")}
                    disabled={locked || loading || expenseTypes.length === 0}
                    aria-label="Expense Type / Document Tag"
                    className="h-9 min-w-52 rounded-md border bg-background px-2 text-xs font-semibold"
                >
                    <option value="">Select Expense Type / Document Tag</option>
                    {expenseTypes.map(type => <option key={type.id} value={type.id}>{type.label}</option>)}
                </select>
                <select
                    value={documentType}
                    onChange={event => setDocumentType(event.target.value as LandedCostAttachmentRecord["document_type"])}
                    disabled={locked || loading}
                    className="h-9 rounded-md border bg-background px-2 text-xs font-semibold"
                >
                    {DOCUMENT_TYPES.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
                </select>
                <label
                    aria-disabled={locked || loading || !allocationRule || !expenseTypeId}
                    className={`h-9 px-3 rounded-md border text-xs font-bold inline-flex items-center justify-center gap-1.5 ${locked || loading || !allocationRule || !expenseTypeId ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:bg-muted"}`}
                >
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                    Upload document
                    <input
                        type="file"
                        accept=".pdf,.xlsx,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                        disabled={locked || loading || !allocationRule || !expenseTypeId || busy}
                        className="sr-only"
                        onChange={event => {
                            void handleUpload(event.target.files?.[0]);
                            event.currentTarget.value = "";
                        }}
                    />
                </label>
                {!allocationRule && <span className="self-center text-[11px] text-amber-600">Select an allocation rule first.</span>}
                {allocationRule && !expenseTypeId && <span className="self-center text-[11px] text-amber-600">Select an expense tag before uploading.</span>}
            </div>

            {error && <p className="text-[11px] text-red-600 font-semibold">{error}</p>}
            {loading ? (
                <div className="text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading documents...</div>
            ) : attachments.length === 0 ? (
                <div className="border border-dashed rounded-lg p-4 text-center text-xs text-muted-foreground">No computation documents attached.</div>
            ) : (
                <div className="space-y-2">
                    {attachments.map(attachment => (
                        <div key={attachment.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs">
                            <div className="min-w-0 flex items-center gap-2">
                                <FileText className="h-4 w-4 shrink-0 text-primary" />
                                <a
                                    href={`/api/manufacturing/files?id=${encodeURIComponent(attachment.directus_file_id)}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="truncate font-semibold hover:underline"
                                >
                                    {attachment.file_name}
                                </a>
                                <span className="shrink-0 text-muted-foreground">{formatFileSize(attachment.file_size)}</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <span className="text-[10px] text-muted-foreground uppercase">
                                    {attachment.expense_type_label || "Unclassified (legacy)"} · {attachment.document_type.replaceAll("_", " ")}
                                </span>
                                {!locked && (
                                    <button type="button" onClick={() => void handleDelete(attachment)} disabled={busy} className="text-red-600 hover:bg-red-500/10 rounded p-1" aria-label={`Delete ${attachment.file_name}`}>
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
