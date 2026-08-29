"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
    AlertTriangle,
    ArrowRight,
    ArrowRightLeft,
    CheckCircle2,
    ClipboardCheck,
    Eye,
    RefreshCw,
    Save,
    Send,
    ShieldCheck,
    Trash2,
    XCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useLotTransfer } from "./hooks/useLotTransfer";
import type { BatchOption, LotTransferMode } from "./types";

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

function formatQuantity(value: number | null | undefined) {
    if (value === null || value === undefined || !Number.isFinite(value)) return "-";
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 }).format(value);
}

function formatDate(value: string | null | undefined) {
    if (!value) return "-";
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString();
}

function statusClass(status: string) {
    if (status === "Approved") return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300";
    if (status === "Rejected") return "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300";
    if (status === "For Approval") return "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300";
    return "bg-muted text-muted-foreground";
}

function StatusBadge({ status }: { status: string }) {
    return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${statusClass(status)}`}>{status}</span>;
}

function FieldLabel({ children, required = false }: { children: ReactNode; required?: boolean }) {
    return <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">{children}{required ? " *" : ""}</span>;
}

function EmptyState({ message }: { message: string }) {
    return <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{message}</div>;
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

function RequestList({ controller, onCreate, onEdit, onDelete }: {
    controller: LotTransferController;
    onCreate: () => void;
    onEdit: (record: LotTransferController["records"][number]) => void;
    onDelete: (record: LotTransferController["records"][number]) => void;
}) {
    return (
        <section className={panelClassName} aria-labelledby="lot-transfer-drafts-heading">
            <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                    <h2 id="lot-transfer-drafts-heading" className="font-semibold">Draft requests</h2>
                    <p className="text-xs text-muted-foreground">Only Draft records can be changed or submitted.</p>
                </div>
                <div className="flex gap-2">
                    <Button type="button" size="sm" onClick={onCreate}>New Request</Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => void controller.refresh()} disabled={controller.isLoading}>
                        <RefreshCw className={controller.isLoading ? "animate-spin" : ""} />
                        Refresh
                    </Button>
                </div>
            </div>
            {controller.records.length === 0 ? <EmptyState message="No Draft lot-transfer requests found." /> : (
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
                                    <td className="px-3 py-2.5 font-semibold">{record.requestNo}<br /><StatusBadge status={record.status} /></td>
                                    <td className="px-3 py-2.5">Lot #{record.sourceLotId}<br /><span className="text-xs text-muted-foreground">{record.sourceBatchNo}</span></td>
                                    <td className="px-3 py-2.5">Lot #{record.targetLotId}<br /><span className="text-xs text-muted-foreground">{record.targetBatchNo}</span></td>
                                    <td className="px-3 py-2.5 font-medium">{formatQuantity(record.quantity)}</td>
                                    <td className="px-3 py-2.5"><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" onClick={() => onEdit(record)}>Edit</Button><Button type="button" variant="destructive" size="sm" onClick={() => onDelete(record)} disabled={controller.isActionLoading}><Trash2 />Delete</Button></div></td>
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
        <SearchableSelect
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
    const sourceBatch = controller.sourceBatches.find((batch) => String(batch.batchId) === form.sourceInventoryLotId);
    const targetBatch = controller.targetBatches.find((batch) => String(batch.batchId) === form.targetInventoryLotId);
    const activeLots = useMemo(() => controller.lots.filter((lot) => {
        const branchMatches = !form.branchId || lot.branchId === 0 || lot.branchId === Number(form.branchId);
        return branchMatches && lot.status.toUpperCase() === "ACTIVE";
    }), [controller.lots, form.branchId]);
    const sourceBatches = controller.sourceBatches;
    const targetBatches = controller.targetBatches;

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
                        <SearchableSelect
                            value={form.branchId}
                            onValueChange={(value) => controller.setField("branchId", value)}
                            options={controller.branches.map((branch) => ({ value: String(branch.id), label: `${branch.branchName} (${branch.branchCode})` }))}
                            placeholder="Select branch..."
                            className={selectClassName}
                        />
                    </label>
                )}
                <label>
                    <FieldLabel required>Product</FieldLabel>
                    <SearchableSelect
                        value={form.productId}
                        onValueChange={controller.handleProductChange}
                        options={controller.products.map((product) => ({
                            value: String(product.productId),
                            label: `${product.productName}${product.skuCode ? ` | ${product.skuCode}` : ""}`
                        }))}
                        placeholder="Select product..."
                        className={selectClassName}
                    />
                </label>
            </div>
            <div className="mt-4 grid gap-4 rounded-lg border bg-muted/20 p-3 md:grid-cols-2">
                <div>
                    <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-800 dark:bg-red-950/40 dark:text-red-300">SOURCE</span>Move out</div>
                    <label className="block"><FieldLabel required>Source lot</FieldLabel><SearchableSelect value={form.sourceLotId} onValueChange={controller.handleSourceLotChange} options={activeLots.map((lot) => ({ value: String(lot.lotId), label: `${lot.lotName || `Lot #${lot.lotId}`} | capacity ${lot.maxBatchCapacity > 0 ? formatQuantity(lot.maxBatchCapacity) : "not configured"}` }))} placeholder="Select source lot..." disabled={!form.productId} className={selectClassName} /></label>
                    <label className="mt-3 block"><FieldLabel required>Source batch</FieldLabel><BatchSelect batches={sourceBatches} value={form.sourceInventoryLotId} onChange={(value) => controller.handleBatchChange("source", value)} disabled={!form.sourceLotId} source /></label>
                    {sourceBatch && <div className="mt-3 grid grid-cols-2 gap-2 rounded-md bg-background p-2 text-xs"><span>Available<br /><strong>{formatQuantity(sourceBatch.quantity)}</strong></span><span>Expiry<br /><strong>{formatDate(sourceBatch.expirationDate)}</strong></span><span>QA<br /><strong>{sourceBatch.qaStatus}</strong></span><span>Batch ID<br /><strong>{sourceBatch.batchId}</strong></span></div>}
                </div>
                <div>
                    <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">TARGET</span>Move in</div>
                    <label className="block"><FieldLabel required>Target lot</FieldLabel><SearchableSelect value={form.targetLotId} onValueChange={controller.handleTargetLotChange} options={activeLots.map((lot) => ({ value: String(lot.lotId), label: `${lot.lotName || `Lot #${lot.lotId}`} | capacity ${lot.maxBatchCapacity > 0 ? formatQuantity(lot.maxBatchCapacity) : "not configured"}` }))} placeholder="Select target lot..." disabled={!form.productId} className={selectClassName} /></label>
                    <label className="mt-3 block"><FieldLabel required>Target batch</FieldLabel><BatchSelect batches={targetBatches} value={form.targetInventoryLotId} onChange={(value) => controller.handleBatchChange("target", value)} disabled={!form.targetLotId} source={false} /></label>
                    {targetBatch && <div className="mt-3 grid grid-cols-2 gap-2 rounded-md bg-background p-2 text-xs"><span>Current on hand<br /><strong>{formatQuantity(targetBatch.quantity)}</strong></span><span>Expiry<br /><strong>{formatDate(targetBatch.expirationDate)}</strong></span><span>QA<br /><strong>{targetBatch.qaStatus}</strong></span><span>Batch ID<br /><strong>{targetBatch.batchId}</strong></span></div>}
                </div>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_240px]">
                <label><FieldLabel required>Transfer quantity</FieldLabel><input className={inputClassName} type="number" min="0.000001" step="any" value={form.quantity} onChange={(event) => controller.setField("quantity", event.currentTarget.value)} placeholder="Enter quantity" /></label>
                <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground"><strong className="text-foreground">Server checks on submit</strong><br />On-hand, reservations, branch/product identity, QA status, UOM, expiry, capacity, and allergen compatibility are reloaded before approval.</div>
            </div>
            <label className="mt-4 block"><FieldLabel required>Transfer reason</FieldLabel><textarea className={textAreaClassName} value={form.reason} onChange={(event) => controller.setField("reason", event.currentTarget.value)} placeholder="Explain why the stock is being moved..." /></label>
            {notice && <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">{notice}</div>}
            <div className="mt-4 flex flex-wrap justify-end gap-2">
                <Button type="button" variant="outline" onClick={onClose} disabled={controller.isActionLoading}>Cancel</Button>
                <Button type="button" variant="outline" onClick={() => { controller.clearSelection(); setNotice(null); }} disabled={controller.isActionLoading}><XCircle />Clear</Button>
                {controller.selectedId && controller.selectedRecord?.status === "Draft" && <Button type="button" variant="destructive" onClick={() => void handleDelete()} disabled={controller.isActionLoading}><Trash2 />Delete Draft</Button>}
                <Button type="button" variant="outline" onClick={() => void handleSave()} disabled={controller.isActionLoading || controller.isLookupLoading}><Save />Save Draft</Button>
                <Button type="button" onClick={() => void handleSubmit()} disabled={controller.isActionLoading || !controller.selectedId || controller.selectedRecord?.status !== "Draft"}><Send />Submit for QA</Button>
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
            <div className="mb-3 flex items-center justify-between gap-3"><div><h2 id="lot-transfer-approval-queue-heading" className="font-semibold">QA approval queue</h2><p className="text-xs text-muted-foreground">A request must pass every server check before posting.</p></div><Button type="button" variant="outline" size="sm" onClick={() => void controller.refresh()} disabled={controller.isLoading}><RefreshCw className={controller.isLoading ? "animate-spin" : ""} /></Button></div>
            {controller.records.length === 0 ? <EmptyState message="No lot-transfer requests are waiting for QA approval." /> : <div className="space-y-2">{controller.records.map((row) => <button type="button" key={row.id} onClick={() => onReview(row)} className={`w-full rounded-lg border p-3 text-left transition hover:border-primary ${controller.selectedId === row.id ? "border-primary bg-primary/5" : ""}`}><div className="flex items-center justify-between gap-2"><strong>{row.requestNo}</strong><StatusBadge status={row.status} /></div><div className="mt-2 text-xs text-muted-foreground">Lot #{row.sourceLotId} / {row.sourceBatchNo} <ArrowRight className="mx-1 inline h-3 w-3" /> Lot #{row.targetLotId} / {row.targetBatchNo}</div><div className="mt-1 text-sm">Quantity: <strong>{formatQuantity(row.quantity)}</strong></div></button>)}</div>}
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
        if (approved) setNotice(`${approved.requestNo} approved and paired inventory movements were posted.`);
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
            {!record ? <EmptyState message="Select a For Approval request to review its QA checks." /> : <>
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><h2 id="lot-transfer-qa-review-heading" className="font-semibold">{record.requestNo}</h2><p className="text-xs text-muted-foreground">Requested {formatDate(record.requestedAt)} by {record.requestedByName || "System"}</p></div><StatusBadge status={record.status} /></div>
                <div className="mb-4 rounded-lg border bg-muted/20 px-3 py-2 text-sm"><strong>{productLabel(record.productId, controller.products)}</strong><span className="text-muted-foreground"> | {branchLabel(record.branchId, controller.branches)}</span></div>
                <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-lg border p-3 text-sm"><p className="text-xs font-semibold text-muted-foreground">Source</p><strong>Lot #{record.sourceLotId} | {record.sourceBatchNo}</strong><p className="mt-1 text-xs">Before: {formatQuantity(preview?.source.onHandBefore)} | Available: {formatQuantity(preview?.source.availableQuantity)}</p><p className="text-xs">Expiry: {formatDate(preview?.source.expiryDate)}</p></div><div className="rounded-lg border p-3 text-sm"><p className="text-xs font-semibold text-muted-foreground">Target</p><strong>Lot #{record.targetLotId} | {record.targetBatchNo}</strong><p className="mt-1 text-xs">Before: {formatQuantity(preview?.target.onHandBefore)} | After: {formatQuantity(preview?.target.onHandAfter)}</p><p className="text-xs">Effective expiry: {formatDate(preview?.effectiveExpiryDate)}</p></div></div>
                <div className="mt-4"><h3 className="mb-2 text-sm font-semibold">QA validation</h3><Checks preview={preview} /></div>
                <div className="mt-4 rounded-lg border bg-muted/20 p-3 text-sm"><strong>Reason</strong><p className="mt-1 whitespace-pre-wrap text-muted-foreground">{record.reason}</p></div>
                {notice && <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">{notice}</div>}
                {record.status === "For Approval" && <><label className="mt-4 block"><FieldLabel>Rejection reason</FieldLabel><textarea className={textAreaClassName} value={rejectionReason} onChange={(event) => setRejectionReason(event.currentTarget.value)} placeholder="Required when rejecting..." /></label><div className="mt-4 flex flex-wrap justify-end gap-2"><Button type="button" variant="destructive" onClick={() => void handleReject()} disabled={controller.isActionLoading}><XCircle />Reject</Button><Button type="button" onClick={() => void handleApprove()} disabled={controller.isActionLoading || !preview?.canApprove}><ShieldCheck />Approve and post</Button></div></>}
            </>}
        </section>
    );
}

function SummaryTable({ controller, onView }: {
    controller: LotTransferController;
    onView: (record: LotTransferController["records"][number]) => void;
}) {
    return (
        <section className={panelClassName} aria-labelledby="lot-transfer-summary-heading">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><h2 id="lot-transfer-summary-heading" className="font-semibold">Master LOT Transfer Summary</h2><p className="text-xs text-muted-foreground">Immutable approved and rejected transfer history.</p></div><div className="flex gap-2"><input className={`${inputClassName} w-52`} value={controller.search} onChange={(event) => controller.setSearch(event.currentTarget.value)} placeholder="Search requests..." aria-label="Search lot-transfer requests" /><Button type="button" variant="outline" size="sm" onClick={() => void controller.refresh()} disabled={controller.isLoading}><RefreshCw className={controller.isLoading ? "animate-spin" : ""} /></Button></div></div>
            {controller.records.length === 0 ? <EmptyState message="No approved or rejected lot-transfer records found." /> : <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr><th className="px-3 py-2.5">Request</th><th className="px-3 py-2.5">Product / branch</th><th className="px-3 py-2.5">Source -&gt; target</th><th className="px-3 py-2.5">Qty</th><th className="px-3 py-2.5">Decision</th><th className="px-3 py-2.5">Audit</th></tr></thead><tbody className="divide-y">{controller.records.map((row) => <tr key={row.id} className={controller.selectedId === row.id ? "bg-primary/5" : ""}><td className="px-3 py-2.5 font-semibold">{row.requestNo}<br /><span className="text-xs text-muted-foreground">{formatDate(row.requestedAt)}</span></td><td className="px-3 py-2.5">{productLabel(row.productId, controller.products)}<br /><span className="text-xs text-muted-foreground">{branchLabel(row.branchId, controller.branches)}</span></td><td className="px-3 py-2.5">{row.sourceBatchNo} <ArrowRight className="mx-1 inline h-3 w-3" /> {row.targetBatchNo}<br /><span className="text-xs text-muted-foreground">Lot #{row.sourceLotId} -&gt; Lot #{row.targetLotId}</span></td><td className="px-3 py-2.5">{formatQuantity(row.quantity)}</td><td className="px-3 py-2.5"><StatusBadge status={row.status} /></td><td className="px-3 py-2.5"><Button type="button" variant="outline" size="sm" onClick={() => onView(row)}><Eye />View</Button></td></tr>)}</tbody></table></div>}
        </section>
    );
}

function SummaryAudit({ controller }: { controller: LotTransferController }) {
    const record = controller.selectedRecord;
    return (
        <section className={panelClassName} aria-labelledby="lot-transfer-audit-heading">
            {!record ? <EmptyState message="Select a terminal request to view its audit record." /> : <><div className="mb-4 flex items-center justify-between gap-3"><div><h2 id="lot-transfer-audit-heading" className="font-semibold">{record.requestNo}</h2><p className="text-xs text-muted-foreground">Read-only audit details</p></div><StatusBadge status={record.status} /></div><dl className="grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-xs text-muted-foreground">Source movement</dt><dd className="font-semibold">{record.sourceMovementId || "Not posted"}</dd></div><div><dt className="text-xs text-muted-foreground">Target movement</dt><dd className="font-semibold">{record.targetMovementId || "Not posted"}</dd></div><div><dt className="text-xs text-muted-foreground">Source balance</dt><dd>{formatQuantity(record.sourceBalanceBefore)} -&gt; {formatQuantity(record.sourceBalanceAfter)}</dd></div><div><dt className="text-xs text-muted-foreground">Target balance</dt><dd>{formatQuantity(record.targetBalanceBefore)} -&gt; {formatQuantity(record.targetBalanceAfter)}</dd></div><div><dt className="text-xs text-muted-foreground">Effective expiry</dt><dd>{formatDate(record.effectiveExpiryDate)}</dd></div><div><dt className="text-xs text-muted-foreground">Approved at</dt><dd>{formatDate(record.approvedAt)}</dd></div></dl><div className="mt-4 rounded-lg border bg-muted/20 p-3 text-sm"><strong>Reason</strong><p className="mt-1 whitespace-pre-wrap text-muted-foreground">{record.reason}</p>{record.rejectionReason && <><strong className="mt-3 block">Rejection reason</strong><p className="mt-1 whitespace-pre-wrap text-muted-foreground">{record.rejectionReason}</p></>}{record.postingError && <><strong className="mt-3 block text-red-700">Posting error</strong><p className="mt-1 whitespace-pre-wrap text-red-700">{record.postingError}</p></>}</div></>}
        </section>
    );
}

export default function LotTransferModule({ mode, userBranchId }: LotTransferModuleProps) {
    const controller = useLotTransfer({ mode, userBranchId });
    const [requestDialogOpen, setRequestDialogOpen] = useState(false);
    const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
    const [summaryDialogOpen, setSummaryDialogOpen] = useState(false);
    const title = mode === "request" ? "Lot Transfer Request" : mode === "approval" ? "Lot Transfer QA Approval" : "Master LOT Transfer Summary";

    const closeRequestDialog = () => {
        setRequestDialogOpen(false);
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
            {mode === "request" && <RequestList controller={controller} onCreate={openNewRequest} onEdit={(record) => void openRequestEditor(record)} onDelete={(record) => void handleDeleteRequest(record)} />}
            {mode === "approval" && <ApprovalQueue controller={controller} onReview={(record) => void openApprovalReview(record)} />}
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
            {mode === "approval" && <Dialog open={approvalDialogOpen} onOpenChange={(open) => open ? setApprovalDialogOpen(true) : closeApprovalDialog()}>
                <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>QA approval review</DialogTitle>
                        <DialogDescription>Review the server-side inventory and compatibility checks before approving or rejecting the transfer.</DialogDescription>
                    </DialogHeader>
                    <ApprovalReview controller={controller} />
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
            <div className="mt-auto flex items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2 text-xs text-muted-foreground"><ClipboardCheck className="h-4 w-4" />Draft and rejection operations do not change inventory. Approval posts one source OUT and one target IN movement only after the server preview passes.</div>
        </main>
    );
}
