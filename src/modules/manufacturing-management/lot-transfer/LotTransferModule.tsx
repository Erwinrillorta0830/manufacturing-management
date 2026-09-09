"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
    AlertTriangle,
    ArrowRight,
    ArrowRightLeft,
    Ban,
    CheckCircle2,
    ClipboardCheck,
    Eye,
    Plus,
    RefreshCw,
    Save,
    Send,
    ShieldCheck,
    Trash2,
    Undo2,
    Upload,
    XCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLotTransfer } from "./hooks/useLotTransfer";
import { LotTransferSearchableSelect } from "./components/LotTransferSearchableSelect";
import type { BatchOption, LotBalanceSnapshot, LotOption, LotTransferMode, LotTransferStatus } from "./types";

interface LotTransferModuleProps {
    mode: LotTransferMode;
    userBranchId?: number | null;
}

type LotTransferController = ReturnType<typeof useLotTransfer>;

const inputClassName = "h-9 w-full rounded-md border bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60";
const selectClassName = "h-9 w-full min-w-0 justify-between overflow-hidden text-left font-normal";
const textAreaClassName = "min-h-20 w-full resize-y rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60";
const panelClassName = "rounded-xl border bg-card p-4 shadow-sm";

function productLabel(productId: number, products: LotTransferController["products"]) {
    const product = products.find((item) => item.productId === productId);
    return product?.productName || `Product #${productId}`;
}

function branchLabel(branchId: number, branches: LotTransferController["branches"]) {
    const branch = branches.find((item) => item.id === branchId);
    if (!branch) return `Branch #${branchId}`;
    return branch.branchCode ? `${branch.branchName} (${branch.branchCode})` : branch.branchName;
}

function lotLabel(lotId: number, lots: LotOption[]) {
    return lots.find((lot) => lot.lotId === lotId)?.lotName || `Lot #${lotId}`;
}

function formatQuantity(value: number | null | undefined) {
    if (value === null || value === undefined || !Number.isFinite(value)) return "-";
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 }).format(value);
}

function formatDate(value: string | null | undefined) {
    if (!value) return "-";
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString();
}

function uomLabel(unitId: number | null | undefined, lots: LotOption[]) {
    if (!unitId) return "Not recorded";
    return lots.find((lot) => lot.uomId === unitId)?.uomName || `UOM #${unitId}`;
}

function statusClass(status: string) {
    if (status === "Posted") return "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300";
    if (status === "Approved") return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300";
    if (status === "Rejected") return "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300";
    if (status === "Cancelled") return "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200";
    if (status === "Reversed") return "bg-violet-100 text-violet-800 dark:bg-violet-950/40 dark:text-violet-300";
    if (status === "Submitted") return "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300";
    return "bg-muted text-muted-foreground";
}

function StatusBadge({ status }: { status: string }) {
    return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${statusClass(status)}`}>{status}</span>;
}

function canCancelTransfer(status: LotTransferStatus) {
    return status === "Draft" || status === "Submitted" || status === "Approved" || status === "Rejected";
}

function canReverseTransfer(record: LotTransferController["records"][number]) {
    return record.status === "Posted" && !record.linkedReversalId;
}

function CancelTransferAction({
    controller,
    record,
    onSuccess
}: {
    controller: LotTransferController;
    record: LotTransferController["records"][number];
    onSuccess?: () => void;
}) {
    const [open, setOpen] = useState(false);
    const [reason, setReason] = useState("");
    const [localError, setLocalError] = useState<string | null>(null);

    if (!canCancelTransfer(record.status)) return null;

    const handleCancel = async () => {
        const cleanReason = reason.trim();
        if (!cleanReason) {
            setLocalError("A cancellation reason is required.");
            return;
        }
        setLocalError(null);
        const cancelled = await controller.cancel(record.id, cleanReason);
        if (!cancelled) {
            setLocalError("The transfer could not be cancelled. Review the page error and retry if appropriate.");
            return;
        }
        setReason("");
        setOpen(false);
        onSuccess?.();
    };

    return <>
        <Button type="button" variant="destructive" size="sm" onClick={() => { setLocalError(null); setOpen(true); }} disabled={controller.isActionLoading}>
            <Ban />Cancel transfer
        </Button>
        <Dialog open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (!nextOpen) { setReason(""); setLocalError(null); } }}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Cancel {record.requestNo}?</DialogTitle>
                    <DialogDescription>This preserves the transfer audit record and does not create inventory movements. Posted transfers cannot be cancelled.</DialogDescription>
                </DialogHeader>
                {localError && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">{localError}</div>}
                <label>
                    <FieldLabel required>Cancellation reason</FieldLabel>
                    <textarea className={textAreaClassName} value={reason} onChange={(event) => setReason(event.currentTarget.value)} maxLength={5000} placeholder="Explain why this transfer is being cancelled..." />
                </label>
                <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={controller.isActionLoading}>Keep request</Button>
                    <Button type="button" variant="destructive" onClick={() => void handleCancel()} disabled={controller.isActionLoading}><Ban />{controller.isActionLoading ? "Cancelling..." : "Cancel transfer"}</Button>
                </div>
            </DialogContent>
        </Dialog>
    </>;
}

function ReverseTransferAction({
    controller,
    record,
    onSuccess
}: {
    controller: LotTransferController;
    record: LotTransferController["records"][number];
    onSuccess?: () => void;
}) {
    const [open, setOpen] = useState(false);
    const [reason, setReason] = useState("");
    const [localError, setLocalError] = useState<string | null>(null);

    if (!canReverseTransfer(record)) return null;

    const handleReverse = async () => {
        const cleanReason = reason.trim();
        if (!cleanReason) {
            setLocalError("A reversal reason is required.");
            return;
        }
        setLocalError(null);
        const reversed = await controller.reverse(record.id, cleanReason);
        if (!reversed) {
            setLocalError("The transfer could not be reversed. Review the page error and retry if appropriate.");
            return;
        }
        setReason("");
        setOpen(false);
        onSuccess?.();
    };

    return <>
        <Button type="button" variant="outline" size="sm" onClick={() => { setLocalError(null); setOpen(true); }} disabled={controller.isActionLoading}>
            <Undo2 />Reverse transfer
        </Button>
        <Dialog open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (!nextOpen) { setReason(""); setLocalError(null); } }}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Reverse {record.requestNo}?</DialogTitle>
                    <DialogDescription>The posted transfer remains immutable. This creates one linked Reversed record with compensating movements from the posted destination back to the posted source.</DialogDescription>
                </DialogHeader>
                {localError && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">{localError}</div>}
                <label>
                    <FieldLabel required>Reversal reason</FieldLabel>
                    <textarea className={textAreaClassName} value={reason} onChange={(event) => setReason(event.currentTarget.value)} maxLength={5000} placeholder="Explain why the posted transfer must be fully reversed..." />
                </label>
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">The server revalidates destination availability, source capacity, UOM, QA, and every original movement pair before posting the reversal.</div>
                <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={controller.isActionLoading}>Keep posted</Button>
                    <Button type="button" onClick={() => void handleReverse()} disabled={controller.isActionLoading}><Undo2 />{controller.isActionLoading ? "Reversing..." : "Reverse transfer"}</Button>
                </div>
            </DialogContent>
        </Dialog>
    </>;
}

function FieldLabel({ children, required = false }: { children: ReactNode; required?: boolean }) {
    return <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">{children}{required ? " *" : ""}</span>;
}

function EmptyState({ message }: { message: string }) {
    return <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{message}</div>;
}

function ProtectedAllocationBreakdown({ snapshot }: { snapshot?: LotBalanceSnapshot }) {
    if (!snapshot) return null;
    const sourceLabels: Record<string, string> = {
        SALES_ORDER: "Sales order",
        SALES_INVOICE: "Sales invoice",
        JOB_ORDER_MATERIAL: "Job-order material",
        STOCK_TRANSFER: "Stock transfer",
        LOT_TRANSFER: "Lot transfer"
    };
    return <div className="mt-1 text-xs">
        <p>Reserved for availability: <strong>{formatQuantity(snapshot.reservedQuantity)}</strong></p>
        <p className="text-muted-foreground">Explicit allocations: {formatQuantity(snapshot.protectedAllocationQuantity)}</p>
        {snapshot.legacyReservedQuantity > 0 && <p className="text-muted-foreground">Legacy aggregate: {formatQuantity(snapshot.legacyReservedQuantity)}</p>}
        {snapshot.protectedAllocations.length > 0 && <ul className="mt-1 space-y-0.5 text-muted-foreground">
            {snapshot.protectedAllocations.map((allocation) => <li key={`${allocation.source}-${allocation.allocationId}`}>
                {sourceLabels[allocation.source] || allocation.source}: {formatQuantity(allocation.quantity)}{allocation.reference ? ` (${allocation.reference})` : ""}
            </li>)}
        </ul>}
        {!snapshot.protectedAllocationResolutionComplete && <p role="alert" className="mt-1 font-medium text-red-700 dark:text-red-300">Some protected allocation identities require reconciliation.</p>}
    </div>;
}

function LineSummary({ record, controller }: { record: LotTransferController["records"][number]; controller: LotTransferController }) {
    return <div className="rounded-lg border bg-muted/20 p-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
            <strong>Transfer lines</strong>
            <span className="text-xs text-muted-foreground">{record.lineCount} line(s) · Total quantity: {formatQuantity(record.totalQuantity)}</span>
        </div>
        <div className="mt-2 space-y-1 text-xs text-muted-foreground">
            {record.details.map((detail) => <div key={detail.detailId || `line-${detail.lineNo}`} className="flex flex-wrap items-center justify-between gap-2">
                <span>Line {detail.lineNo}: {productLabel(detail.productId, controller.products)} · {detail.sourceBatchNo} <ArrowRight className="mx-1 inline h-3 w-3" /> {detail.targetBatchNo}</span>
                <span className="font-semibold text-foreground">{formatQuantity(detail.quantity)}</span>
            </div>)}
        </div>
    </div>;
}

function ErrorBanner({ message }: { message: string | null }) {
    if (!message) return null;
    return (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{message}</span>
        </div>
    );
}

function RequestList({ controller, onCreate, onEdit, onViewStatus, onDelete }: {
    controller: LotTransferController;
    onCreate: () => void;
    onEdit: (record: LotTransferController["records"][number]) => void;
    onViewStatus: (record: LotTransferController["records"][number]) => void;
    onDelete: (record: LotTransferController["records"][number]) => void;
}) {
    return (
        <section className={panelClassName} aria-labelledby="lot-transfer-drafts-heading">
            <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                    <h2 id="lot-transfer-drafts-heading" className="font-semibold">Lot transfer requests</h2>
                    <p className="text-xs text-muted-foreground">All workflow records remain visible with their current status. Only Draft records can be changed or submitted.</p>
                </div>
                <div className="flex gap-2">
                    <Button type="button" size="sm" onClick={onCreate}>New Request</Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => void controller.refresh()} disabled={controller.isLoading}>
                        <RefreshCw className={controller.isLoading ? "animate-spin" : ""} />
                        Refresh
                    </Button>
                </div>
            </div>
            {controller.records.length === 0 ? <EmptyState message="No lot-transfer requests found." /> : (
                <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full min-w-[720px] text-left text-sm">
                        <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                            <tr>
                                <th className="px-3 py-2.5">Request</th>
                                <th className="px-3 py-2.5">Source</th>
                                <th className="px-3 py-2.5">Target</th>
                                <th className="px-3 py-2.5">Qty</th>
                                <th className="px-3 py-2.5">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {controller.records.map((record) => (
                                <tr key={record.id} className={controller.selectedId === record.id ? "bg-primary/5" : ""}>
                                    <td className="px-3 py-2.5 font-semibold">{record.requestNo}<br /><StatusBadge status={record.status} /><br /><span className="text-xs font-normal text-muted-foreground">Transfer: {formatDate(record.transferDate)} · {uomLabel(record.unitId, controller.lots)} · {record.lineCount} line(s)</span></td>
                                    <td className="px-3 py-2.5">{lotLabel(record.sourceLotId, controller.lots)}<br /><span className="text-xs text-muted-foreground">{record.sourceBatchNo}</span></td>
                                    <td className="px-3 py-2.5">{lotLabel(record.targetLotId, controller.lots)}<br /><span className="text-xs text-muted-foreground">{record.targetBatchNo}</span></td>
                                    <td className="px-3 py-2.5 font-medium">{formatQuantity(record.totalQuantity)}</td>
                                    <td className="px-3 py-2.5"><div className="flex flex-wrap gap-2">{record.status === "Draft" ? <><Button type="button" variant="outline" size="sm" onClick={() => onEdit(record)}>Edit</Button><Button type="button" variant="destructive" size="sm" onClick={() => onDelete(record)} disabled={controller.isActionLoading}><Trash2 />Delete</Button></> : <Button type="button" variant="outline" size="sm" onClick={() => onViewStatus(record)}>View status</Button>}</div></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}

function BatchSelect({
    batches,
    value,
    onChange,
    disabled,
    source
}: {
    batches: BatchOption[];
    value: string;
    onChange: (value: string) => void;
    disabled: boolean;
    source: boolean;
}) {
    const filtered = batches.filter((batch) => {
        const active = batch.status.toUpperCase() === "ACTIVE";
        return active && (!source || batch.quantity > 0 || String(batch.batchId) === value);
    });
    return (
        <LotTransferSearchableSelect
            value={value}
            onValueChange={onChange}
            options={filtered.map((batch) => ({
                value: String(batch.batchId),
                label: `${batch.batchNumber} | ${source ? `available ${formatQuantity(batch.quantity)}` : `on hand ${formatQuantity(batch.quantity)}`}`
            }))}
            placeholder={source ? "Select source batch..." : "Select target batch..."}
            disabled={disabled}
            className={selectClassName}
        />
    );
}

function RequestEditor({ controller, onClose }: { controller: LotTransferController; onClose: () => void }) {
    const { form } = controller;
    const [notice, setNotice] = useState<string | null>(null);
    const activeLots = useMemo(() => controller.lots.filter((lot) => {
        const branchMatches = !form.branchId || lot.branchId === 0 || lot.branchId === Number(form.branchId);
        return branchMatches && lot.status.toUpperCase() === "ACTIVE";
    }), [controller.lots, form.branchId]);
    const selectedSourceLot = activeLots.find((lot) => String(lot.lotId) === form.sourceLotId);
    const sourceUomConfigured = !selectedSourceLot || selectedSourceLot.uomId !== null;
    const targetLots = useMemo(
        () => activeLots.filter((lot) => {
            if (String(lot.lotId) === form.sourceLotId) return false;
            return !form.sourceLotId || (selectedSourceLot?.uomId !== null && selectedSourceLot?.uomId === lot.uomId);
        }),
        [activeLots, form.sourceLotId, selectedSourceLot?.uomId]
    );
    const selectedTargetLot = targetLots.find((lot) => String(lot.lotId) === form.targetLotId);
    const targetCapacityConfigured = !selectedTargetLot || selectedTargetLot.maxBatchCapacity > 0;
    const totalQuantity = form.details.reduce((sum, detail) => sum + (Number(detail.quantity) || 0), 0);
    const currentPreview = controller.draftValidationIsCurrent ? controller.preview : null;
    const destinationCapacity = currentPreview?.targetLotCapacity ?? (selectedTargetLot && selectedTargetLot.maxBatchCapacity > 0 ? selectedTargetLot.maxBatchCapacity : null);
    const destinationOccupiedBefore = currentPreview?.targetLotOccupiedBefore;
    const projectedDestinationOccupancy = destinationOccupiedBefore === undefined ? null : destinationOccupiedBefore + totalQuantity;
    const projectedDestinationRemaining = destinationCapacity === null || projectedDestinationOccupancy === null ? null : destinationCapacity - projectedDestinationOccupancy;

    const handleSave = async () => {
        const saved = await controller.saveDraft();
        if (saved) setNotice(`${saved.requestNo} saved as Draft.`);
    };

    const handleSubmit = async () => {
        const submitted = await controller.submit();
        if (submitted) {
            setNotice(`${submitted.requestNo} submitted for QA approval.`);
            onClose();
        }
    };

    const handleDelete = async () => {
        if (!controller.selectedId || !window.confirm("Delete this Draft lot-transfer request? This cannot be undone.")) return;
        if (await controller.deleteDraft(controller.selectedId)) onClose();
    };

    return (
        <section className={panelClassName} aria-labelledby="lot-transfer-editor-heading">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 id="lot-transfer-editor-heading" className="font-semibold">{controller.selectedRecord ? `Edit ${controller.selectedRecord.requestNo}` : "New lot-transfer request"}</h2>
                    <p className="text-xs text-muted-foreground">Select the exact inventory-lot identity. Inventory is unchanged until QA approval.</p>
                </div>
                {controller.selectedRecord && <StatusBadge status={controller.selectedRecord.status} />}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
                {!controller.userBranchId && (
                    <label>
                        <FieldLabel required>Branch</FieldLabel>
                        <LotTransferSearchableSelect
                            value={form.branchId}
                            onValueChange={(value) => controller.setField("branchId", value)}
                            options={controller.branches.map((branch) => ({ value: String(branch.id), label: `${branch.branchName} (${branch.branchCode})` }))}
                            placeholder="Select branch..."
                            className={selectClassName}
                        />
                    </label>
                )}
            </div>
            <div className="mt-4 grid gap-4 rounded-lg border bg-muted/20 p-3 md:grid-cols-2">
                <div>
                    <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-800 dark:bg-red-950/40 dark:text-red-300">SOURCE</span>Move out</div>
                    <label className="block"><FieldLabel required>Source lot</FieldLabel><LotTransferSearchableSelect value={form.sourceLotId} onValueChange={controller.handleSourceLotChange} options={activeLots.map((lot) => ({ value: String(lot.lotId), label: `${lot.lotName || `Lot #${lot.lotId}`} | UOM ${lot.uomName || (lot.uomId === null ? "not configured" : `#${lot.uomId}`)} | capacity ${lot.maxBatchCapacity > 0 ? formatQuantity(lot.maxBatchCapacity) : "not configured"}` }))} placeholder="Select source lot..." className={selectClassName} />{selectedSourceLot && !sourceUomConfigured && <p role="alert" className="mt-2 text-xs font-medium text-red-700 dark:text-red-300">Source lot UOM is not configured. Assign an explicit UOM before submitting this transfer.</p>}</label>
                </div>
                <div>
                    <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">TARGET</span>Move in</div>
                    <label className="block"><FieldLabel required>Target lot</FieldLabel><LotTransferSearchableSelect value={form.targetLotId} onValueChange={controller.handleTargetLotChange} options={targetLots.map((lot) => ({ value: String(lot.lotId), label: `${lot.lotName || `Lot #${lot.lotId}`} | UOM ${lot.uomName || (lot.uomId === null ? "not configured" : `#${lot.uomId}`)} | capacity ${lot.maxBatchCapacity > 0 ? formatQuantity(lot.maxBatchCapacity) : "not configured"}` }))} placeholder={form.sourceLotId && !sourceUomConfigured ? "Source UOM required first..." : "Select target lot..."} disabled={!form.sourceLotId || !sourceUomConfigured} className={selectClassName} /><p className="mt-1 text-xs text-muted-foreground">Choose an active destination lot with the same explicit UOM as the source.</p>{selectedTargetLot && !targetCapacityConfigured && <p role="alert" className="mt-2 text-xs font-medium text-red-700 dark:text-red-300">Destination lot capacity is not configured. A positive capacity is required before this transfer can be submitted.</p>}</label>
                </div>
            </div>
            <div className="mt-4 rounded-lg border p-3">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-sm font-semibold">Transfer detail lines</h3><p className="text-xs text-muted-foreground">Each line creates its own source OUT and destination IN movement pair.</p></div><Button type="button" size="sm" variant="outline" onClick={() => controller.addDetail()}><Plus />Add line</Button></div>
                <div className="space-y-3">
                    {form.details.map((detail, index) => {
                        const sourceRows = (controller.batchesByLot[Number(form.sourceLotId)] || []).filter((batch) => batch.productId === Number(detail.productId) && (batch.quantity > 0 || String(batch.batchId) === detail.sourceInventoryLotId));
                        const targetRows = (controller.batchesByLot[Number(form.targetLotId)] || []).filter((batch) => batch.productId === Number(detail.productId) && (batch.status.toUpperCase() === "ACTIVE" || String(batch.batchId) === detail.targetInventoryLotId));
                        const sourceBatch = sourceRows.find((batch) => String(batch.batchId) === detail.sourceInventoryLotId);
                        const targetBatch = targetRows.find((batch) => String(batch.batchId) === detail.targetInventoryLotId);
                        const linePreview = controller.preview?.linePreviews.find((line) => line.lineNo === detail.lineNo);
                        return <div key={detail.detailId || `new-${detail.lineNo}`} className="rounded-lg border bg-muted/10 p-3">
                            <div className="mb-3 flex items-center justify-between gap-2"><strong className="text-sm">Line {detail.lineNo}</strong><Button type="button" variant="ghost" size="sm" onClick={() => controller.removeDetail(index)} disabled={form.details.length === 1}><Trash2 />Remove</Button></div>
                            <div className="grid gap-3 lg:grid-cols-2">
                                <label><FieldLabel required>Product</FieldLabel><LotTransferSearchableSelect value={detail.productId} onValueChange={(value) => controller.handleProductChange(value, index)} options={controller.products.map((product) => ({ value: String(product.productId), label: `${product.productName}${product.skuCode ? ` | ${product.skuCode}` : ""}` }))} placeholder="Select product..." className={selectClassName} /></label>
                                <label><FieldLabel required>Quantity</FieldLabel><input className={inputClassName} type="number" min="0.000001" step="any" value={detail.quantity} onChange={(event) => controller.updateDetail(index, { quantity: event.currentTarget.value })} placeholder="Enter quantity" /></label>
                                <label><FieldLabel required>Source batch</FieldLabel><BatchSelect batches={sourceRows} value={detail.sourceInventoryLotId} onChange={(value) => controller.handleBatchChange(index, "source", value)} disabled={!form.sourceLotId || !detail.productId} source /></label>
                                <label><FieldLabel required>Target batch</FieldLabel><BatchSelect batches={targetRows} value={detail.targetInventoryLotId} onChange={(value) => controller.handleBatchChange(index, "target", value)} disabled={!form.targetLotId || !detail.productId} source={false} /></label>
                            </div>
                            {(sourceBatch || targetBatch || linePreview) && <div className="mt-3 grid gap-2 rounded-md bg-background p-2 text-xs sm:grid-cols-4"><span>Source available<br /><strong>{formatQuantity(linePreview?.source.availableQuantity ?? sourceBatch?.quantity)}</strong></span><span>Target on hand<br /><strong>{formatQuantity(linePreview?.target.onHandBefore ?? targetBatch?.quantity)}</strong></span><span>Source expiry<br /><strong>{formatDate(linePreview?.source.expiryDate ?? sourceBatch?.expirationDate)}</strong></span><span>Target expiry<br /><strong>{formatDate(linePreview?.target.expiryDate ?? targetBatch?.expirationDate)}</strong></span></div>}
                            <label className="mt-3 block"><FieldLabel>Line remarks</FieldLabel><textarea className={textAreaClassName} value={detail.lineRemarks} onChange={(event) => controller.updateDetail(index, { lineRemarks: event.currentTarget.value })} placeholder="Optional line-specific context..." /></label>
                            {linePreview && <div className="mt-3 space-y-1">{linePreview.checks.filter((check) => !check.passed).map((check) => <p key={check.key} role="alert" className="text-xs font-medium text-red-700 dark:text-red-300">{check.label}: {check.message}</p>)}</div>}
                        </div>;
                    })}
                </div>
                <div className="mt-3 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground"><span>{form.details.length} line(s)</span><span>Total quantity: <strong className="text-foreground">{formatQuantity(totalQuantity)}</strong></span></div>
                <div className="mt-3 grid gap-2 rounded-md border bg-muted/20 p-2 text-xs sm:grid-cols-3" aria-label="Aggregate destination capacity summary">
                    <span>Aggregate incoming<br /><strong className="text-foreground">{formatQuantity(totalQuantity)}</strong></span>
                    <span>Destination capacity<br /><strong className="text-foreground">{formatQuantity(destinationCapacity)}</strong></span>
                    <span>Projected destination occupancy<br /><strong className={projectedDestinationRemaining !== null && projectedDestinationRemaining < 0 ? "text-red-700 dark:text-red-300" : "text-foreground"}>{projectedDestinationOccupancy === null ? "Validate to calculate" : `${formatQuantity(projectedDestinationOccupancy)}${projectedDestinationRemaining === null ? "" : ` (${formatQuantity(projectedDestinationRemaining)} remaining)`}`}</strong></span>
                </div>
            </div>
            <div className="mt-4 rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground"><strong className="text-foreground">Live server validation</strong><br />Each product, batch, source availability, repeated-source aggregate, destination capacity, UOM, expiry, QA, and allergen check runs against the current detail lines. Save and submission require a complete detail set; submission is blocked when any line fails.</div>
            <label className="mt-4 block"><FieldLabel required>Transfer reason</FieldLabel><textarea className={textAreaClassName} value={form.reason} onChange={(event) => controller.setField("reason", event.currentTarget.value)} placeholder="Explain why the stock is being moved..." /></label>
            <div className="mt-4 rounded-lg border p-3" aria-live="polite">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong className="text-sm">Draft validation</strong>
                    <span className="text-xs font-semibold text-muted-foreground">
                        {controller.draftValidationStatus === "loading" ? "Checking..." : controller.draftValidationStatus === "valid" && controller.draftValidationIsCurrent ? "Ready to submit" : controller.draftValidationStatus === "invalid" && controller.draftValidationIsCurrent ? "Action required" : controller.draftValidationStatus === "error" ? "Retry required" : controller.isDraftFormComplete ? "Validation pending" : "Complete required fields"}
                    </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                    {controller.draftValidationMessage || (controller.isDraftFormComplete ? "Server validation will run shortly." : "Complete the branch, product, lot, batch, quantity, and reason fields to run all checks.")}
                </p>
                {controller.draftValidationIsCurrent && controller.preview && <>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <div className="rounded-lg border bg-muted/20 p-3 text-xs">
                            <strong>Source availability</strong>
                            <p className="mt-1">On-hand: {formatQuantity(controller.preview.source.onHandBefore)} | Available: {formatQuantity(controller.preview.source.availableQuantity)}</p>
                            <ProtectedAllocationBreakdown snapshot={controller.preview.source} />
                        </div>
                        <div className="rounded-lg border bg-muted/20 p-3 text-xs">
                            <strong>Destination occupancy</strong>
                            <p className="mt-1">On-hand: {formatQuantity(controller.preview.target.onHandBefore)} | After: {formatQuantity(controller.preview.target.onHandAfter)}</p>
                            <ProtectedAllocationBreakdown snapshot={controller.preview.target} />
                        </div>
                    </div>
                    <div className="mt-3"><Checks preview={controller.preview} /></div>
                </>}
            </div>
            {notice && <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">{notice}</div>}
            <div className="mt-4 flex flex-wrap justify-end gap-2">
                <Button type="button" variant="outline" onClick={onClose} disabled={controller.isActionLoading}>Cancel</Button>
                <Button type="button" variant="outline" onClick={() => { controller.clearSelection(); setNotice(null); }} disabled={controller.isActionLoading}><XCircle />Clear</Button>
                {controller.selectedRecord && <CancelTransferAction controller={controller} record={controller.selectedRecord} onSuccess={onClose} />}
                {controller.selectedId && controller.selectedRecord?.status === "Draft" && <Button type="button" variant="destructive" onClick={() => void handleDelete()} disabled={controller.isActionLoading}><Trash2 />Delete Draft</Button>}
                <Button type="button" variant="outline" onClick={() => void handleSave()} disabled={controller.isActionLoading || controller.isLookupLoading || !controller.isDraftFormComplete}><Save />Save Draft</Button>
                <Button type="button" onClick={() => void handleSubmit()} disabled={controller.isActionLoading || !controller.selectedId || controller.selectedRecord?.status !== "Draft" || !controller.draftValidationIsCurrent || controller.draftValidationStatus !== "valid" || !controller.preview?.canApprove}><Send />Submit for QA</Button>
            </div>
        </section>
    );
}

function Checks({ preview }: { preview: LotTransferController["preview"] }) {
    if (!preview) return <EmptyState message="Run the server QA preview to see validation checks." />;
    return (
        <div className="space-y-2">
            {preview.checks.map((check) => (
                <div key={check.key} className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${check.passed ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/20" : "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/20"}`}>
                    {check.passed ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />}
                    <span><strong>{check.label}</strong><br /><span className="text-xs text-muted-foreground">{check.message}</span></span>
                </div>
            ))}
        </div>
    );
}

function ApprovalQueue({ controller, onReview }: {
    controller: LotTransferController;
    onReview: (record: LotTransferController["records"][number]) => void;
}) {
    return (
        <section className={panelClassName} aria-labelledby="lot-transfer-approval-queue-heading">
            <div className="mb-3 flex items-center justify-between gap-3"><div><h2 id="lot-transfer-approval-queue-heading" className="font-semibold">Lot transfer QA status</h2><p className="text-xs text-muted-foreground">All transfer statuses remain visible. Submitted requests can be approved or rejected; other statuses are read-only.</p></div><Button type="button" variant="outline" size="sm" onClick={() => void controller.refresh()} disabled={controller.isLoading}><RefreshCw className={controller.isLoading ? "animate-spin" : ""} /></Button></div>
            {controller.records.length === 0 ? <EmptyState message="No lot-transfer records found." /> : <div className="space-y-2">{controller.records.map((row) => <button type="button" key={row.id} onClick={() => onReview(row)} className={`w-full rounded-lg border p-3 text-left transition hover:border-primary ${controller.selectedId === row.id ? "border-primary bg-primary/5" : ""}`}><div className="flex items-center justify-between gap-2"><strong>{row.requestNo}</strong><StatusBadge status={row.status} /></div><div className="mt-2 text-xs text-muted-foreground">Transfer date: {formatDate(row.transferDate)} · UOM: {uomLabel(row.unitId, controller.lots)} · {row.lineCount} line(s)</div><div className="mt-1 text-xs text-muted-foreground">{lotLabel(row.sourceLotId, controller.lots)} / {row.sourceBatchNo} <ArrowRight className="mx-1 inline h-3 w-3" /> {lotLabel(row.targetLotId, controller.lots)} / {row.targetBatchNo}</div><div className="mt-1 text-sm">Total quantity: <strong>{formatQuantity(row.totalQuantity)}</strong></div></button>)}</div>}
        </section>
    );
}

function ApprovalReview({ controller }: { controller: LotTransferController }) {
    const [rejectionReason, setRejectionReason] = useState("");
    const [notice, setNotice] = useState<string | null>(null);
    const record = controller.selectedRecord;
    const preview = controller.preview;
    const handleApprove = async () => {
        const approved = await controller.approve();
        if (approved) setNotice(`${approved.requestNo} approved and is ready for posting.`);
    };
    const handleReject = async () => {
        if (!rejectionReason.trim()) {
            setNotice("A rejection reason is required.");
            return;
        }
        const rejected = await controller.reject(rejectionReason);
        if (rejected) {
            setNotice(`${rejected.requestNo} rejected. No inventory movements were posted.`);
            setRejectionReason("");
        }
    };
    return (
        <section className={panelClassName} aria-labelledby="lot-transfer-qa-review-heading">
            {!record ? <EmptyState message="Select a transfer request to review its status and QA checks." /> : <>
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><h2 id="lot-transfer-qa-review-heading" className="font-semibold">{record.requestNo}</h2><p className="text-xs text-muted-foreground">Transfer date {formatDate(record.transferDate)} · Requested {formatDate(record.requestedAt)} by {record.requestedByName || "System"}</p></div><StatusBadge status={record.status} /></div>
                <div className="mb-4 rounded-lg border bg-muted/20 px-3 py-2 text-sm"><strong>{productLabel(record.productId, controller.products)}</strong><span className="text-muted-foreground"> | {branchLabel(record.branchId, controller.branches)} | UOM {uomLabel(record.unitId, controller.lots)}</span></div>
                <LineSummary record={record} controller={controller} />
                <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-lg border p-3 text-sm"><p className="text-xs font-semibold text-muted-foreground">Source</p><strong>{lotLabel(record.sourceLotId, controller.lots)} | {record.sourceBatchNo}</strong><p className="mt-1 text-xs">Before: {formatQuantity(preview?.source.onHandBefore)} | Available: {formatQuantity(preview?.source.availableQuantity)}</p><ProtectedAllocationBreakdown snapshot={preview?.source} /><p className="text-xs">Expiry: {formatDate(preview?.source.expiryDate)}</p></div><div className="rounded-lg border p-3 text-sm"><p className="text-xs font-semibold text-muted-foreground">Target</p><strong>{lotLabel(record.targetLotId, controller.lots)} | {record.targetBatchNo}</strong><p className="mt-1 text-xs">Before: {formatQuantity(preview?.target.onHandBefore)} | After: {formatQuantity(preview?.target.onHandAfter)}</p><ProtectedAllocationBreakdown snapshot={preview?.target} /><p className="text-xs">Effective expiry: {formatDate(preview?.effectiveExpiryDate)}</p></div></div>
                <div className="mt-4"><h3 className="mb-2 text-sm font-semibold">QA validation</h3><Checks preview={preview} /></div>
                <div className="mt-4 rounded-lg border bg-muted/20 p-3 text-sm"><strong>Reason</strong><p className="mt-1 whitespace-pre-wrap text-muted-foreground">{record.reason}</p></div>
                {notice && <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">{notice}</div>}
                {record.status === "Submitted" && <><label className="mt-4 block"><FieldLabel>Rejection reason</FieldLabel><textarea className={textAreaClassName} value={rejectionReason} onChange={(event) => setRejectionReason(event.currentTarget.value)} placeholder="Required when rejecting..." /></label><div className="mt-4 flex flex-wrap justify-end gap-2"><Button type="button" variant="destructive" onClick={() => void handleReject()} disabled={controller.isActionLoading}><XCircle />Reject</Button><Button type="button" onClick={() => void handleApprove()} disabled={controller.isActionLoading || !preview?.canApprove}><ShieldCheck />Approve</Button></div></>}
                <div className="mt-4 flex justify-end"><CancelTransferAction controller={controller} record={record} /></div>
            </>}
        </section>
    );
}

function PostingQueue({ controller, onReview }: {
    controller: LotTransferController;
    onReview: (record: LotTransferController["records"][number]) => void;
}) {
    return (
        <section className={panelClassName} aria-labelledby="lot-transfer-posting-queue-heading">
            <div className="mb-3 flex items-center justify-between gap-3"><div><h2 id="lot-transfer-posting-queue-heading" className="font-semibold">Lot transfer posting status</h2><p className="text-xs text-muted-foreground">All transfer statuses remain visible. Approved requests can be posted; other statuses are read-only.</p></div><Button type="button" variant="outline" size="sm" onClick={() => void controller.refresh()} disabled={controller.isLoading}><RefreshCw className={controller.isLoading ? "animate-spin" : ""} /></Button></div>
            {controller.records.length === 0 ? <EmptyState message="No lot-transfer records found." /> : <div className="space-y-2">{controller.records.map((row) => <button type="button" key={row.id} onClick={() => onReview(row)} className={`w-full rounded-lg border p-3 text-left transition hover:border-primary ${controller.selectedId === row.id ? "border-primary bg-primary/5" : ""}`}><div className="flex items-center justify-between gap-2"><strong>{row.requestNo}</strong><StatusBadge status={row.status} /></div><div className="mt-2 text-xs text-muted-foreground">Transfer date: {formatDate(row.transferDate)} · UOM: {uomLabel(row.unitId, controller.lots)} · {row.lineCount} line(s)</div><div className="mt-1 text-xs text-muted-foreground">{lotLabel(row.sourceLotId, controller.lots)} / {row.sourceBatchNo} <ArrowRight className="mx-1 inline h-3 w-3" /> {lotLabel(row.targetLotId, controller.lots)} / {row.targetBatchNo}</div><div className="mt-1 text-sm">Total quantity: <strong>{formatQuantity(row.totalQuantity)}</strong></div></button>)}</div>}
        </section>
    );
}

function PostingReview({ controller }: { controller: LotTransferController }) {
    const [notice, setNotice] = useState<string | null>(null);
    const record = controller.selectedRecord;
    const preview = controller.preview;
    const handlePost = async () => {
        const posted = await controller.post();
        if (posted) setNotice(`${posted.requestNo} posted. The paired inventory movements were created.`);
    };

    return (
        <section className={panelClassName} aria-labelledby="lot-transfer-posting-review-heading">
            {!record ? <EmptyState message="Select a transfer request to review its status and posting details." /> : <>
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><h2 id="lot-transfer-posting-review-heading" className="font-semibold">{record.requestNo}</h2><p className="text-xs text-muted-foreground">Transfer date {formatDate(record.transferDate)} · Approved {formatDate(record.approvedAt)} by {record.approvedByName || "System"}</p></div><StatusBadge status={record.status} /></div>
                <div className="mb-4 rounded-lg border bg-muted/20 px-3 py-2 text-sm"><strong>{productLabel(record.productId, controller.products)}</strong><span className="text-muted-foreground"> | {branchLabel(record.branchId, controller.branches)} | UOM {uomLabel(record.unitId, controller.lots)}</span></div>
                <LineSummary record={record} controller={controller} />
                <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-lg border p-3 text-sm"><p className="text-xs font-semibold text-muted-foreground">Source OUT</p><strong>{lotLabel(record.sourceLotId, controller.lots)} | {record.sourceBatchNo}</strong><p className="mt-1 text-xs">Before: {formatQuantity(preview?.source.onHandBefore)} | After: {formatQuantity(preview?.source.onHandAfter)}</p><ProtectedAllocationBreakdown snapshot={preview?.source} /><p className="text-xs">Movement: {record.sourceMovementId || "Not posted"}</p></div><div className="rounded-lg border p-3 text-sm"><p className="text-xs font-semibold text-muted-foreground">Target IN</p><strong>{lotLabel(record.targetLotId, controller.lots)} | {record.targetBatchNo}</strong><p className="mt-1 text-xs">Before: {formatQuantity(preview?.target.onHandBefore)} | After: {formatQuantity(preview?.target.onHandAfter)}</p><ProtectedAllocationBreakdown snapshot={preview?.target} /><p className="text-xs">Movement: {record.targetMovementId || "Not posted"}</p></div></div>
                <div className="mt-4"><h3 className="mb-2 text-sm font-semibold">Posting validation</h3><Checks preview={preview} /></div>
                <div className="mt-4 rounded-lg border bg-muted/20 p-3 text-sm"><strong>Reason</strong><p className="mt-1 whitespace-pre-wrap text-muted-foreground">{record.reason}</p></div>
                {notice && <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">{notice}</div>}
                <div className="mt-4 flex justify-end gap-2"><ReverseTransferAction controller={controller} record={record} /><CancelTransferAction controller={controller} record={record} />{record.status === "Approved" && <Button type="button" onClick={() => void handlePost()} disabled={controller.isActionLoading || !preview?.canPost}><Upload />Post transfer</Button>}</div>
            </>}
        </section>
    );
}

function FilterSelect({
    label,
    value,
    onChange,
    options,
    placeholder
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    options: { value: string; label: string }[];
    placeholder: string;
}) {
    return <label className="min-w-0"><FieldLabel>{label}</FieldLabel><LotTransferSearchableSelect value={value} onValueChange={onChange} options={[{ value: "", label: placeholder }, ...options]} placeholder={placeholder} className={selectClassName} /></label>;
}

function SummaryReportFilters({ controller }: { controller: LotTransferController }) {
    const { reportFilters } = controller;
    const allStatusesSelected = reportFilters.statuses.length === 0;
    const setFilter = controller.setReportFilter;
    const statusOptions: LotTransferStatus[] = ["Draft", "Submitted", "Approved", "Posted", "Rejected", "Cancelled", "Reversed"];
    const productOptions = controller.products.map((product) => ({
        value: String(product.productId),
        label: `${product.productName}${product.skuCode ? ` | ${product.skuCode}` : ""}`
    }));
    const lotOptions = controller.lots.map((lot) => ({
        value: String(lot.lotId),
        label: `${lot.lotName || `Lot #${lot.lotId}`} | ${branchLabel(lot.branchId, controller.branches)}`
    }));
    const userOptions = controller.users.map((user) => ({ value: String(user.id), label: user.name }));

    const toggleStatus = (status: LotTransferStatus) => {
        if (allStatusesSelected) {
            setFilter("statuses", [status]);
            return;
        }
        const nextStatuses = reportFilters.statuses.includes(status)
            ? reportFilters.statuses.filter((selectedStatus) => selectedStatus !== status)
            : [...reportFilters.statuses, status];
        setFilter("statuses", nextStatuses.length > 0 ? nextStatuses : []);
    };

    return <div className="mb-4 rounded-lg border bg-muted/20 p-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
                <h3 className="text-sm font-semibold">Report filters</h3>
                <p className="text-xs text-muted-foreground">Transfer-date filters use the business date; requested timestamps remain available for audit compatibility.</p>
            </div>
            <span className="text-xs text-muted-foreground">{controller.totalCount} record(s)</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="sm:col-span-2 lg:col-span-3"><FieldLabel>Search</FieldLabel><input className={inputClassName} value={reportFilters.search} onChange={(event) => setFilter("search", event.currentTarget.value)} placeholder="Request number, reason, or batch..." aria-label="Search lot-transfer report" /></label>
            <label><FieldLabel>Transfer date from</FieldLabel><input type="date" className={inputClassName} value={reportFilters.transferDateFrom} onChange={(event) => setFilter("transferDateFrom", event.currentTarget.value)} /></label>
            <label><FieldLabel>Transfer date to</FieldLabel><input type="date" className={inputClassName} value={reportFilters.transferDateTo} onChange={(event) => setFilter("transferDateTo", event.currentTarget.value)} /></label>
            <label><FieldLabel>Requested audit from</FieldLabel><input type="date" className={inputClassName} value={reportFilters.requestedFrom} onChange={(event) => setFilter("requestedFrom", event.currentTarget.value)} /></label>
            <label><FieldLabel>Requested audit to</FieldLabel><input type="date" className={inputClassName} value={reportFilters.requestedTo} onChange={(event) => setFilter("requestedTo", event.currentTarget.value)} /></label>
            {!controller.userBranchId && <FilterSelect label="Branch" value={reportFilters.branchId} onChange={(value) => setFilter("branchId", value)} options={controller.branches.map((branch) => ({ value: String(branch.id), label: `${branch.branchName} (${branch.branchCode})` }))} placeholder="All branches" />}
            <FilterSelect label="Product" value={reportFilters.productId} onChange={(value) => setFilter("productId", value)} options={productOptions} placeholder="All products" />
            <FilterSelect label="Source lot" value={reportFilters.sourceLotId} onChange={(value) => setFilter("sourceLotId", value)} options={lotOptions} placeholder="All source lots" />
            <FilterSelect label="Destination lot" value={reportFilters.targetLotId} onChange={(value) => setFilter("targetLotId", value)} options={lotOptions} placeholder="All destination lots" />
            <label><FieldLabel>Source batch</FieldLabel><input className={inputClassName} value={reportFilters.sourceBatchNo} onChange={(event) => setFilter("sourceBatchNo", event.currentTarget.value)} placeholder="Any source batch" /></label>
            <label><FieldLabel>Destination batch</FieldLabel><input className={inputClassName} value={reportFilters.targetBatchNo} onChange={(event) => setFilter("targetBatchNo", event.currentTarget.value)} placeholder="Any destination batch" /></label>
            <FilterSelect label="Creator" value={reportFilters.requestedBy} onChange={(value) => setFilter("requestedBy", value)} options={userOptions} placeholder="All creators" />
            <FilterSelect label="Approver" value={reportFilters.approvedBy} onChange={(value) => setFilter("approvedBy", value)} options={userOptions} placeholder="All approvers" />
            <FilterSelect label="Poster" value={reportFilters.postedBy} onChange={(value) => setFilter("postedBy", value)} options={userOptions} placeholder="All posters" />
            <fieldset className="sm:col-span-2 lg:col-span-3">
                <legend className="mb-1.5 text-xs font-semibold text-muted-foreground">Status</legend>
                <div className="flex flex-wrap gap-2 rounded-lg border bg-background p-2" role="group" aria-label="Filter lot-transfer report by status">
                    <button type="button" aria-pressed={allStatusesSelected} onClick={() => setFilter("statuses", [])} className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${allStatusesSelected ? "border-primary bg-primary text-primary-foreground shadow-sm" : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground"}`}>All statuses</button>
                    {statusOptions.map((status) => {
                        const selected = !allStatusesSelected && reportFilters.statuses.includes(status);
                        return <button key={status} type="button" aria-pressed={selected} onClick={() => toggleStatus(status)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${selected ? statusClass(status) : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground"}`}>{status}</button>;
                    })}
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">Choose one or more statuses, or select All statuses.</p>
            </fieldset>
        </div>
        <div className="mt-3 flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => controller.clearReportFilters()}>Clear filters</Button>
            <Button type="button" size="sm" onClick={() => controller.applyReportFilters()}>Apply filters</Button>
        </div>
    </div>;
}

function SummaryTable({ controller, onView }: {
    controller: LotTransferController;
    onView: (record: LotTransferController["records"][number]) => void;
}) {
    return (
        <section className={panelClassName} aria-labelledby="lot-transfer-summary-heading">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><h2 id="lot-transfer-summary-heading" className="font-semibold">Master LOT Transfer Summary</h2><p className="text-xs text-muted-foreground">Searchable audit history for lot-transfer lifecycle records.</p></div><Button type="button" variant="outline" size="sm" onClick={() => void controller.refresh()} disabled={controller.isLoading}><RefreshCw className={controller.isLoading ? "animate-spin" : ""} />Refresh</Button></div>
            <SummaryReportFilters controller={controller} />
            {controller.records.length === 0 ? <EmptyState message="No lot-transfer records match the selected report filters." /> : <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr><th className="px-3 py-2.5">Request</th><th className="px-3 py-2.5">Product / branch</th><th className="px-3 py-2.5">Source -&gt; target</th><th className="px-3 py-2.5">Qty</th><th className="px-3 py-2.5">Decision</th><th className="px-3 py-2.5">Audit</th></tr></thead><tbody className="divide-y">{controller.records.map((row) => <tr key={row.id} className={controller.selectedId === row.id ? "bg-primary/5" : ""}><td className="px-3 py-2.5 font-semibold">{row.requestNo}<br /><span className="text-xs text-muted-foreground">Transfer: {formatDate(row.transferDate)}<br />Requested: {formatDate(row.requestedAt)}<br />{row.lineCount} line(s)</span></td><td className="px-3 py-2.5">{productLabel(row.productId, controller.products)}<br /><span className="text-xs text-muted-foreground">{branchLabel(row.branchId, controller.branches)} · UOM {uomLabel(row.unitId, controller.lots)}</span></td><td className="px-3 py-2.5">{row.sourceBatchNo} <ArrowRight className="mx-1 inline h-3 w-3" /> {row.targetBatchNo}<br /><span className="text-xs text-muted-foreground">{lotLabel(row.sourceLotId, controller.lots)} -&gt; {lotLabel(row.targetLotId, controller.lots)}</span></td><td className="px-3 py-2.5">{formatQuantity(row.totalQuantity)}</td><td className="px-3 py-2.5"><StatusBadge status={row.status} /></td><td className="px-3 py-2.5"><Button type="button" variant="outline" size="sm" onClick={() => onView(row)}><Eye />View</Button></td></tr>)}</tbody></table></div>}
        </section>
    );
}

function SummaryAudit({ controller, allowCancel = false }: { controller: LotTransferController; allowCancel?: boolean }) {
    const record = controller.selectedRecord;
    return (
        <section className={panelClassName} aria-labelledby="lot-transfer-audit-heading">
            {!record ? <EmptyState message="Select a terminal request to view its audit record." /> : <>
                <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                        <h2 id="lot-transfer-audit-heading" className="font-semibold">{record.requestNo}</h2>
                        <p className="text-xs text-muted-foreground">Read-only audit details</p>
                    </div>
                    <StatusBadge status={record.status} />
                </div>
                {record.reversalOfId !== null && <div className="mb-4 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-800 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-200">
                    This is a linked reversal of transfer #{record.reversalOfId}. The compensating movements are shown below.
                </div>}
                {record.linkedReversalId !== null && <div className="mb-4 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-800 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-200">
                    Reversed by {record.linkedReversalRequestNo || `transfer #${record.linkedReversalId}`} ({record.linkedReversalStatus || "Reversal pending"}).
                </div>}
                <LineSummary record={record} controller={controller} />
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                    <div><dt className="text-xs text-muted-foreground">Transfer date</dt><dd className="font-semibold">{formatDate(record.transferDate)}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">UOM</dt><dd className="font-semibold">{uomLabel(record.unitId, controller.lots)}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Source movement</dt><dd className="font-semibold">{record.sourceMovementId || "Not posted"}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Target movement</dt><dd className="font-semibold">{record.targetMovementId || "Not posted"}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Source balance</dt><dd>{formatQuantity(record.sourceBalanceBefore)} -&gt; {formatQuantity(record.sourceBalanceAfter)}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Target balance</dt><dd>{formatQuantity(record.targetBalanceBefore)} -&gt; {formatQuantity(record.targetBalanceAfter)}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Effective expiry</dt><dd>{formatDate(record.effectiveExpiryDate)}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Submitted by</dt><dd>{record.submittedBy || "System"}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Submitted at</dt><dd>{formatDate(record.submittedAt)}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Approved at</dt><dd>{formatDate(record.approvedAt)}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Posted at</dt><dd>{formatDate(record.postedAt)}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Posted by</dt><dd>{record.postedByName || record.postedBy || "Not posted"}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Cancelled at</dt><dd>{formatDate(record.cancelledAt)}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Cancelled by</dt><dd>{record.cancelledByName || record.cancelledBy || "Not cancelled"}</dd></div>
                    {record.reversalOfId !== null && <div><dt className="text-xs text-muted-foreground">Reversal of</dt><dd className="font-semibold">Transfer #{record.reversalOfId}</dd></div>}
                    {record.reversedAt && <div><dt className="text-xs text-muted-foreground">Reversed at</dt><dd>{formatDate(record.reversedAt)}</dd></div>}
                    {record.reversedAt && <div><dt className="text-xs text-muted-foreground">Reversed by</dt><dd>{record.reversedByName || record.reversedBy || "System"}</dd></div>}
                </dl>
                <div className="mt-4 rounded-lg border bg-muted/20 p-3 text-sm">
                    <strong>Reason</strong>
                    <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{record.reason}</p>
                    {record.rejectionReason && <><strong className="mt-3 block">Rejection reason</strong><p className="mt-1 whitespace-pre-wrap text-muted-foreground">{record.rejectionReason}</p></>}
                    {record.cancellationReason && <><strong className="mt-3 block">Cancellation reason</strong><p className="mt-1 whitespace-pre-wrap text-muted-foreground">{record.cancellationReason}</p></>}
                    {record.reversalReason && <><strong className="mt-3 block">Reversal reason</strong><p className="mt-1 whitespace-pre-wrap text-muted-foreground">{record.reversalReason}</p></>}
                    {record.postingError && <><strong className="mt-3 block text-red-700">Posting error</strong><p className="mt-1 whitespace-pre-wrap text-red-700">{record.postingError}</p></>}
                </div>
                <div className="mt-4 flex justify-end gap-2">
                    <ReverseTransferAction controller={controller} record={record} />
                    {allowCancel && <CancelTransferAction controller={controller} record={record} />}
                </div>
            </>}
        </section>
    );
}

export default function LotTransferModule({ mode, userBranchId }: LotTransferModuleProps) {
    const controller = useLotTransfer({ mode, userBranchId });
    const [requestDialogOpen, setRequestDialogOpen] = useState(false);
    const [requestStatusDialogOpen, setRequestStatusDialogOpen] = useState(false);
    const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
    const [postingDialogOpen, setPostingDialogOpen] = useState(false);
    const [summaryDialogOpen, setSummaryDialogOpen] = useState(false);
    const title = mode === "request" ? "Lot Transfer Request" : mode === "approval" ? "Lot Transfer QA Approval" : mode === "posting" ? "Lot Transfer Posting" : "Master LOT Transfer Summary";

    const closeRequestDialog = () => {
        setRequestDialogOpen(false);
        controller.clearSelection();
    };

    const closeRequestStatusDialog = () => {
        setRequestStatusDialogOpen(false);
        controller.clearSelection();
    };

    const openNewRequest = () => {
        controller.clearSelection();
        setRequestDialogOpen(true);
    };

    const openRequestEditor = async (record: LotTransferController["records"][number]) => {
        await controller.selectRecord(record);
        setRequestDialogOpen(true);
    };

    const openRequestStatus = async (record: LotTransferController["records"][number]) => {
        await controller.selectRecord(record);
        setRequestStatusDialogOpen(true);
    };

    const handleDeleteRequest = async (record: LotTransferController["records"][number]) => {
        if (!window.confirm(`Delete ${record.requestNo}? This cannot be undone.`)) return;
        await controller.deleteDraft(record.id);
    };

    const closeApprovalDialog = () => {
        setApprovalDialogOpen(false);
        controller.clearSelection();
    };

    const openApprovalReview = async (record: LotTransferController["records"][number]) => {
        await controller.selectRecord(record);
        setApprovalDialogOpen(true);
    };

    const closePostingDialog = () => {
        setPostingDialogOpen(false);
        controller.clearSelection();
    };

    const openPostingReview = async (record: LotTransferController["records"][number]) => {
        await controller.selectRecord(record);
        setPostingDialogOpen(true);
    };

    const closeSummaryDialog = () => {
        setSummaryDialogOpen(false);
        controller.clearSelection();
    };

    const openSummaryAudit = async (record: LotTransferController["records"][number]) => {
        await controller.selectRecord(record);
        setSummaryDialogOpen(true);
    };

    return (
        <main className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4 md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2"><ArrowRightLeft className="h-5 w-5 text-primary" /><h1 className="text-xl font-semibold tracking-tight">{title}</h1></div><p className="mt-1 text-sm text-muted-foreground">QA-gated movement of an existing inventory batch between storage lots.</p></div></div>
            <ErrorBanner message={controller.error} />
            {controller.isLookupLoading && <div className="rounded-lg border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">Loading branch, product, lot, and batch options...</div>}
            {mode === "request" && <RequestList controller={controller} onCreate={openNewRequest} onEdit={(record) => void openRequestEditor(record)} onViewStatus={(record) => void openRequestStatus(record)} onDelete={(record) => void handleDeleteRequest(record)} />}
            {mode === "approval" && <ApprovalQueue controller={controller} onReview={(record) => void openApprovalReview(record)} />}
            {mode === "posting" && <PostingQueue controller={controller} onReview={(record) => void openPostingReview(record)} />}
            {mode === "summary" && <SummaryTable controller={controller} onView={(record) => void openSummaryAudit(record)} />}
            {mode === "request" && <Dialog open={requestDialogOpen} onOpenChange={(open) => open ? setRequestDialogOpen(true) : closeRequestDialog()}>
                <DialogContent className="max-h-[90vh] w-[95vw] overflow-y-auto sm:w-[90vw] sm:max-w-6xl">
                    <DialogHeader>
                        <DialogTitle>Lot transfer request</DialogTitle>
                        <DialogDescription>Enter the source and target batch details, then save the request before submitting it for QA approval.</DialogDescription>
                    </DialogHeader>
                    <RequestEditor controller={controller} onClose={closeRequestDialog} />
                </DialogContent>
            </Dialog>}
            {mode === "request" && <Dialog open={requestStatusDialogOpen} onOpenChange={(open) => open ? setRequestStatusDialogOpen(true) : closeRequestStatusDialog()}>
                <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Lot transfer status</DialogTitle>
                        <DialogDescription>Read-only status and audit details for the selected transfer request.</DialogDescription>
                    </DialogHeader>
                    <SummaryAudit controller={controller} allowCancel />
                </DialogContent>
            </Dialog>}
            {mode === "approval" && <Dialog open={approvalDialogOpen} onOpenChange={(open) => open ? setApprovalDialogOpen(true) : closeApprovalDialog()}>
                <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>QA approval review</DialogTitle>
                        <DialogDescription>Review the server-side inventory and compatibility checks before approving or rejecting the transfer.</DialogDescription>
                    </DialogHeader>
                    <ApprovalReview controller={controller} />
                </DialogContent>
            </Dialog>}
            {mode === "posting" && <Dialog open={postingDialogOpen} onOpenChange={(open) => open ? setPostingDialogOpen(true) : closePostingDialog()}>
                <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Post lot transfer</DialogTitle>
                        <DialogDescription>Post the approved request only after reviewing the final server-side checks. This creates one source OUT and one target IN movement.</DialogDescription>
                    </DialogHeader>
                    <PostingReview controller={controller} />
                </DialogContent>
            </Dialog>}
            {mode === "summary" && <Dialog open={summaryDialogOpen} onOpenChange={(open) => open ? setSummaryDialogOpen(true) : closeSummaryDialog()}>
                <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Lot transfer audit</DialogTitle>
                        <DialogDescription>Read-only details for the selected terminal transfer request.</DialogDescription>
                    </DialogHeader>
                    <SummaryAudit controller={controller} />
                </DialogContent>
            </Dialog>}
            <div className="mt-auto flex items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2 text-xs text-muted-foreground"><ClipboardCheck className="h-4 w-4" />Draft and rejection operations do not change inventory. Approval authorizes the request; posting creates one source OUT and one target IN movement.</div>
        </main>
    );
}
