"use client";

import { useMemo, useState } from "react";
import { GitCompareArrows } from "lucide-react";
import type { IncomingShipment, ShipmentLineItem, Supplier } from "../../procurement/types";
import type { PurchaseOrderApprovalDetail, PurchaseOrderApprovalHistory } from "../../purchase-order/types";
import { parsePurchaseOrderRevisionSnapshot, type RevisionSnapshotRecord } from "../../purchase-order/revision-snapshot";

interface RevisionSnapshotComparisonProps {
    detail: PurchaseOrderApprovalDetail;
    selectedShipment: IncomingShipment;
    currentLines: ShipmentLineItem[];
    suppliers: Supplier[];
}

type ComparisonLine = {
    identity: string;
    productId: string;
    productLabel: string;
    quantity: string;
    unitPricePhp: string;
    unitPriceForeign: string;
    discountMode: string;
    discountPercent: string;
    discountAmountForeign: string;
    vatPercent: string;
    withholdingPercent: string;
    purchaseIntent: string;
    jobOrderId: string;
    received: string;
};

type LineDiff = {
    status: "Added" | "Removed" | "Changed";
    prior: ComparisonLine | null;
    current: ComparisonLine | null;
    changes: string[];
};

const HEADER_FIELDS = [
    { key: "purchase_order_no", label: "PO Number" },
    { key: "reference", label: "Reference" },
    { key: "supplier_name", label: "Supplier" },
    { key: "branch_id", label: "Branch" },
    { key: "payment_type", label: "Payment Arrangement" },
    { key: "payment_mode", label: "Payment Type" },
    { key: "payment_terms", label: "Payment Terms" },
    { key: "price_type", label: "Price Type" },
    { key: "currency_code", label: "Currency" },
    { key: "exchange_rate", label: "FX Rate" },
    { key: "gross_amount", label: "Gross Total (PHP)" },
    { key: "total_amount", label: "Net Total (PHP)" },
    { key: "total_foreign_currency", label: "Foreign Total" },
    { key: "remark", label: "Remarks" }
] as const;

const LINE_FIELDS = [
    { key: "quantity", label: "Qty" },
    { key: "unitPricePhp", label: "PHP Unit Price" },
    { key: "unitPriceForeign", label: "Foreign Unit Price" },
    { key: "discountMode", label: "Discount Mode" },
    { key: "discountPercent", label: "Discount %" },
    { key: "discountAmountForeign", label: "Discount Amount" },
    { key: "vatPercent", label: "VAT %" },
    { key: "withholdingPercent", label: "Withholding %" },
    { key: "purchaseIntent", label: "Purchase Intent" },
    { key: "jobOrderId", label: "Job Order" },
    { key: "received", label: "Received" }
] as const;

function relationId(value: unknown): string {
    if (value && typeof value === "object") {
        const record = value as Record<string, unknown>;
        return String(record.product_id ?? record.id ?? record.user_id ?? "");
    }
    return value === null || value === undefined ? "" : String(value);
}

function scalar(value: unknown, fallback = "Not specified"): string {
    if (value === null || value === undefined || value === "") return fallback;
    return String(value);
}

function numeric(value: unknown): string {
    if (value === null || value === undefined || value === "") return "";
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed.toFixed(4) : String(value);
}

function money(value: unknown, currency: string): string {
    if (value === null || value === undefined || value === "") return "Not specified";
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return String(value);
    return new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency,
        maximumFractionDigits: 2
    }).format(parsed);
}

function currentHeader(detail: PurchaseOrderApprovalDetail, shipment: IncomingShipment): Record<string, unknown> {
    const supplierId = shipment.supplier_id && typeof shipment.supplier_id === "object"
        ? shipment.supplier_id.id
        : shipment.supplier_id;
    return {
        ...shipment,
        ...detail.order,
        purchase_order_no: detail.order.purchase_order_no || shipment.purchase_order_no,
        reference: detail.order.reference || shipment.reference_number,
        supplier_name: detail.order.supplier_name ?? supplierId,
        branch_id: detail.order.branch_id ?? shipment.branch_id,
        payment_type: detail.order.payment_type ?? shipment.payment_type,
        payment_mode: detail.order.payment_mode ?? shipment.payment_mode,
        payment_terms: detail.order.payment_terms ?? shipment.payment_terms,
        price_type: detail.order.price_type ?? shipment.price_type,
        remark: detail.order.remark ?? shipment.remark,
        currency_code: detail.order.currency_code ?? shipment.currency_code,
        exchange_rate: detail.order.exchange_rate ?? shipment.exchange_rate,
        total_foreign_currency: detail.order.total_foreign_currency ?? shipment.total_foreign_currency,
        total_amount: detail.order.total_amount ?? shipment.total_php_value
    };
}

function formatHeaderValue(
    key: string,
    value: unknown,
    currency: string,
    suppliers: Supplier[]
): string {
    if (key === "supplier_name") {
        const id = Number(relationId(value));
        return suppliers.find(supplier => supplier.id === id)?.supplier_name || (id > 0 ? `Supplier #${id}` : "Not specified");
    }
    if (["gross_amount", "total_amount"].includes(key)) return money(value, "PHP");
    if (key === "total_foreign_currency") return money(value, currency);
    if (key === "exchange_rate") return numeric(value);
    return scalar(value);
}

function normalizeLine(line: RevisionSnapshotRecord | ShipmentLineItem): ComparisonLine {
    const rawProduct = line.product_id;
    const productId = relationId(rawProduct);
    const product = rawProduct && typeof rawProduct === "object"
        ? rawProduct as { product_name?: string; product_code?: string }
        : null;
    const purchaseIntent = scalar(line.purchase_intent, "Buffer_Stock");
    const jobOrderId = relationId(line.job_order_id);
    return {
        identity: `${productId}|${purchaseIntent}|${jobOrderId}`,
        productId,
        productLabel: product?.product_name || (productId ? `Product #${productId}` : "Unknown product"),
        quantity: numeric((line as RevisionSnapshotRecord).ordered_quantity ?? (line as ShipmentLineItem).quantity_ordered),
        unitPricePhp: numeric((line as RevisionSnapshotRecord).unit_price ?? (line as ShipmentLineItem).base_unit_cost_php),
        unitPriceForeign: numeric((line as RevisionSnapshotRecord).unit_price_foreign ?? (line as ShipmentLineItem).unit_price_foreign),
        discountMode: scalar(line.discount_mode, "Percentage"),
        discountPercent: numeric(line.discount_percent),
        discountAmountForeign: numeric((line as RevisionSnapshotRecord).discount_amount_foreign ?? (line as ShipmentLineItem).discount_amount_foreign),
        vatPercent: numeric(line.vat_percent),
        withholdingPercent: numeric(line.withholding_percent),
        purchaseIntent,
        jobOrderId: jobOrderId || "Not specified",
        received: numeric((line as RevisionSnapshotRecord).received ?? (line as ShipmentLineItem).quantity_received)
    };
}

function changedFields(prior: ComparisonLine, current: ComparisonLine): string[] {
    return LINE_FIELDS
        .filter(field => prior[field.key] !== current[field.key])
        .map(field => `${field.label}: ${prior[field.key] || "Not specified"} -> ${current[field.key] || "Not specified"}`);
}

function compareLines(priorLines: RevisionSnapshotRecord[], currentLines: ShipmentLineItem[]): LineDiff[] {
    const prior = priorLines.map(normalizeLine);
    const current = currentLines.map(normalizeLine);
    const matchedCurrent = new Set<number>();
    const differences: LineDiff[] = [];

    prior.forEach(priorLine => {
        const currentIndex = current.findIndex((currentLine, index) =>
            !matchedCurrent.has(index) && currentLine.identity === priorLine.identity
        );
        if (currentIndex < 0) {
            differences.push({ status: "Removed", prior: priorLine, current: null, changes: [] });
            return;
        }

        matchedCurrent.add(currentIndex);
        const currentLine = current[currentIndex];
        const changes = changedFields(priorLine, currentLine);
        if (changes.length) differences.push({ status: "Changed", prior: priorLine, current: currentLine, changes });
    });

    current.forEach((currentLine, index) => {
        if (!matchedCurrent.has(index)) differences.push({ status: "Added", prior: null, current: currentLine, changes: [] });
    });
    return differences;
}

function lineSummary(line: ComparisonLine | null, currency: string): string {
    if (!line) return "-";
    return `${line.quantity || "0"} qty | ${money(line.unitPriceForeign || line.unitPricePhp, currency)} | ${line.discountMode}`;
}

function SnapshotStatus({ entry }: { entry: PurchaseOrderApprovalHistory }) {
    return entry.revision_snapshot
        ? <span className="rounded border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">Snapshot available</span>
        : <span className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">Legacy revision</span>;
}

export default function RevisionSnapshotComparison({ detail, selectedShipment, currentLines, suppliers }: RevisionSnapshotComparisonProps) {
    const resubmissions = useMemo(
        () => detail.history.filter(entry => entry.action === "Resubmitted"),
        [detail.history]
    );
    const snapshotEntries = useMemo(
        () => resubmissions.filter(entry => parsePurchaseOrderRevisionSnapshot(entry.revision_snapshot)),
        [resubmissions]
    );
    const [selectedHistoryId, setSelectedHistoryId] = useState<number | null>(null);

    const selectedEntry = snapshotEntries.find(entry => entry.history_id === selectedHistoryId)
        || snapshotEntries[snapshotEntries.length - 1]
        || null;
    const snapshot = selectedEntry ? parsePurchaseOrderRevisionSnapshot(selectedEntry.revision_snapshot) : null;
    const latestHeader = currentHeader(detail, selectedShipment);
    const currency = String(latestHeader.currency_code || "PHP");
    const lineDiffs = snapshot ? compareLines(snapshot.lines, currentLines) : [];

    if (!resubmissions.length) return null;

    return (
        <section className="space-y-3 rounded-md border bg-muted/10 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h3 className="flex items-center gap-1.5 text-xs font-bold"><GitCompareArrows className="h-4 w-4 text-primary" /> Revision audit comparison</h3>
                    <p className="mt-1 text-[11px] text-muted-foreground">Prior revision values compared with the current latest purchase order.</p>
                </div>
                {snapshotEntries.length > 0 && (
                    <label className="flex items-center gap-2 text-[10px] font-semibold text-muted-foreground">
                        Revision entry
                        <select
                            value={selectedEntry?.history_id || ""}
                            onChange={event => setSelectedHistoryId(Number(event.target.value))}
                            className="h-8 rounded-md border bg-background px-2 text-xs text-foreground"
                        >
                            {snapshotEntries.map(entry => (
                                <option key={entry.history_id} value={entry.history_id}>
                                    Revision {entry.revision_before} to {entry.revision_after}
                                </option>
                            ))}
                        </select>
                    </label>
                )}
            </div>

            {snapshot && selectedEntry ? (
                <>
                    <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                        <SnapshotStatus entry={selectedEntry} />
                        <span>Captured {new Date(snapshot.capturedAt).toLocaleString("en-PH")}</span>
                        <span>Revision {snapshot.revisionBefore} to current revision {detail.order.workflow_revision || 0}</span>
                    </div>

                    <div className="overflow-x-auto rounded-md border bg-background">
                        <table className="w-full min-w-[680px] text-xs">
                            <thead className="border-b bg-muted/50 text-left text-[10px] uppercase text-muted-foreground">
                                <tr><th className="p-2">Header field</th><th className="p-2">Prior version</th><th className="p-2">Current version</th></tr>
                            </thead>
                            <tbody className="divide-y">
                                {HEADER_FIELDS.map(field => {
                                    const priorValue = formatHeaderValue(field.key, snapshot.header[field.key], currency, suppliers);
                                    const currentValue = formatHeaderValue(field.key, latestHeader[field.key], currency, suppliers);
                                    const changed = priorValue !== currentValue;
                                    return (
                                        <tr key={field.key} className={changed ? "bg-amber-50/60" : ""}>
                                            <th className="p-2 text-left font-semibold text-muted-foreground">{field.label}</th>
                                            <td className="max-w-[280px] whitespace-pre-wrap p-2 align-top">{priorValue}</td>
                                            <td className="max-w-[280px] whitespace-pre-wrap p-2 align-top">{currentValue}{changed && <span className="ml-1 text-[9px] font-bold uppercase text-amber-700">Changed</span>}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    <div>
                        <h4 className="mb-2 text-[10px] font-bold uppercase text-muted-foreground">Line-item changes</h4>
                        {lineDiffs.length === 0 ? (
                            <p className="rounded-md border bg-background p-3 text-xs text-muted-foreground">No line-item changes detected.</p>
                        ) : (
                            <div className="space-y-2">
                                {lineDiffs.map((difference, index) => {
                                    const line = difference.current || difference.prior;
                                    if (!line) return null;
                                    const badgeClass = difference.status === "Added"
                                        ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                                        : difference.status === "Removed"
                                            ? "border-red-300 bg-red-50 text-red-700"
                                            : "border-amber-300 bg-amber-50 text-amber-700";
                                    return (
                                        <div key={`${difference.status}-${line.identity}-${index}`} className="rounded-md border bg-background p-2 text-xs">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <span className="font-semibold">{line.productLabel} <span className="font-normal text-muted-foreground">(Product #{line.productId || "?"})</span></span>
                                                <span className={`rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase ${badgeClass}`}>{difference.status}</span>
                                            </div>
                                            <div className="mt-1 text-[11px] text-muted-foreground">
                                                Prior: {lineSummary(difference.prior, currency)} | Current: {lineSummary(difference.current, currency)}
                                            </div>
                                            {difference.changes.length > 0 && <div className="mt-1 text-[10px] text-amber-700">{difference.changes.join("; ")}</div>}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </>
            ) : (
                <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">Snapshot unavailable for legacy revision.</p>
            )}
        </section>
    );
}
