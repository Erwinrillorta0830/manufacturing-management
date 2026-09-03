import type { MMInventoryMovement } from "../types";
import { formatPhtDate, formatPhtTimestamp } from "../../shared/pht-date";

export type PrintProductTracingArgs = {
    movements: MMInventoryMovement[];
    branchName?: string;
    productTypeName?: string;
    startDate?: string | null;
    endDate?: string | null;
};

function escapeHtml(value: string | undefined | null): string {
    return (value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function fmtNumber(value: number): string {
    return value.toLocaleString("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

export function generateProductTracingHtml(args: PrintProductTracingArgs): string {
    const {
        movements,
        branchName = "All Branches",
        productTypeName = "All Categories",
        startDate,
        endDate
    } = args;

    const startStr = startDate ? formatPhtDate(startDate) : "Earliest";
    const endStr = endDate ? formatPhtDate(endDate) : "Present";

    let totalIn = 0;
    let totalOut = 0;
    let totalInVal = 0;
    let totalOutVal = 0;

    const rowsHtml = movements.map((m) => {
        const qIn = Number(m.quantityIn || 0);
        const qOut = Number(m.quantityOut || 0);
        const cost = Number(m.unitCost || 0);
        const isOut = m.movementDirection === "OUT" || qOut > 0;

        totalIn += qIn;
        totalOut += qOut;
        totalInVal += qIn * cost;
        totalOutVal += qOut * cost;

        const dateStr = formatPhtTimestamp(m.transactionDate);

        return `
            <tr>
                <td class="pl-4 py-2 tabular-nums">${dateStr}</td>
                <td>
                    <div style="font-weight:700; font-family:monospace;">${escapeHtml(m.referenceNo)}</div>
                    <div style="font-size:8px; color:#64748b; font-family:monospace;">${escapeHtml(m.movementKey)}</div>
                </td>
                <td>
                    <span class="badge ${isOut ? "badge-out" : "badge-in"}">
                        ${escapeHtml(m.transactionType?.replace(/_/g, " "))}
                    </span>
                </td>
                <td>
                    <div style="font-weight:600;">${escapeHtml(m.productName)}</div>
                    <div style="font-size:8px; color:#64748b;">${escapeHtml(m.productCode || "")}</div>
                </td>
                <td>
                    <div style="font-family:monospace; font-weight:700;">${escapeHtml(m.batchNo || "—")}</div>
                    <span class="badge-condition">${escapeHtml(m.inventoryCondition || "GOOD")}</span>
                </td>
                <td class="text-center font-bold ${isOut ? "text-rose-600" : "text-emerald-600"}">
                    ${escapeHtml(m.movementDirection || (isOut ? "OUT" : "IN"))}
                </td>
                <td class="text-right font-bold text-emerald-600">
                    ${qIn > 0 ? `+${fmtNumber(qIn)}` : "—"}
                </td>
                <td class="text-right font-bold text-rose-600">
                    ${qOut > 0 ? `-${fmtNumber(qOut)}` : "—"}
                </td>
                <td class="text-right font-bold text-primary bg-muted">
                    ${m.runningBalance !== undefined ? fmtNumber(m.runningBalance) : "—"}
                </td>
                <td class="text-right font-mono text-slate-500">
                    ₱${fmtNumber(cost)}
                </td>
                <td class="text-right pr-4 font-bold text-slate-700">
                    ₱${fmtNumber(Number(m.differenceCost || 0))}
                </td>
            </tr>
        `;
    }).join("");

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <title>Product Tracing Ledger Report</title>
    <style>
        @page { size: A4 landscape; margin: 8mm; }
        * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        body { font-family: 'Inter', system-ui, -apple-system, sans-serif; font-size: 9px; color: #1e293b; margin: 0; padding: 16px; }
        .header { margin-bottom: 20px; border-bottom: 2px solid #e2e8f0; padding-bottom: 12px; display: flex; justify-content: space-between; align-items: flex-end; }
        .title-section h1 { font-size: 18px; font-weight: 800; margin: 0; color: #0f172a; text-transform: uppercase; letter-spacing: -0.025em; }
        .title-section p { margin: 3px 0 0; color: #64748b; font-weight: 500; font-size: 10px; }
        .meta-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 18px; background: #f8fafc; padding: 12px; border: 1px solid #e2e8f0; border-radius: 8px; }
        .meta-item label { display: block; font-size: 8px; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 2px; }
        .meta-item span { display: block; font-size: 11px; font-weight: 700; color: #334155; }
        table { width: 100%; border-collapse: collapse; border-spacing: 0; }
        th { background: #f1f5f9; color: #475569; font-weight: 800; text-transform: uppercase; font-size: 8.5px; letter-spacing: 0.05em; padding: 8px 6px; border-bottom: 2px solid #cbd5e1; text-align: left; }
        td { padding: 6px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
        .text-right { text-align: right; }
        .text-center { text-align: center; }
        .font-bold { font-weight: 700; }
        .text-primary { color: #2563eb; }
        .text-emerald-600 { color: #059669; }
        .text-rose-600 { color: #dc2626; }
        .badge { padding: 2px 5px; border-radius: 4px; font-size: 8px; font-weight: 800; text-transform: uppercase; display: inline-block; }
        .badge-in { background: #d1fae5; color: #065f46; }
        .badge-out { background: #fee2e2; color: #991b1b; }
        .badge-condition { font-size: 7.5px; font-weight: 700; color: #475569; background: #e2e8f0; padding: 1px 4px; border-radius: 3px; }
        .bg-muted { background-color: #f8fafc; }
        .footer { margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 12px; display: flex; justify-content: space-between; font-size: 8px; color: #94a3b8; font-weight: 600; }
        .summary-box { margin-top: 16px; display: flex; justify-content: flex-end; gap: 20px; font-size: 10px; font-weight: 700; }
        @media print {
            .no-print { display: none; }
            tr { break-inside: avoid; }
            thead { display: table-header-group; }
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="title-section">
            <h1>Product Movement & Provenance Ledger</h1>
            <p>Comprehensive historical audit trail of manufacturing inventory movements</p>
        </div>
        <div class="text-right">
            <p style="margin:0; font-weight:800; color:#2563eb;">MANUFACTURING AUDIT</p>
            <p style="margin:2px 0 0; color:#64748b;">Generated on ${formatPhtTimestamp(new Date())}</p>
        </div>
    </div>

    <div class="meta-grid">
        <div class="meta-item">
            <label>Branch / Warehouse</label>
            <span>${escapeHtml(branchName)}</span>
        </div>
        <div class="meta-item">
            <label>Product Scope</label>
            <span>${escapeHtml(productTypeName)}</span>
        </div>
        <div class="meta-item">
            <label>Date Range</label>
            <span>${startStr} — ${endStr}</span>
        </div>
        <div class="meta-item">
            <label>Total Records</label>
            <span>${movements.length} transactions</span>
        </div>
    </div>

    <table>
        <thead>
            <tr>
                <th style="width:105px;">Timestamp</th>
                <th style="width:130px;">Reference / Key</th>
                <th>Type</th>
                <th>Product Name</th>
                <th>Batch / Condition</th>
                <th class="text-center">Dir</th>
                <th class="text-right">Qty In</th>
                <th class="text-right">Qty Out</th>
                <th class="text-right">Run. Balance</th>
                <th class="text-right">Unit Cost</th>
                <th class="text-right pr-4">Difference Cost</th>
            </tr>
        </thead>
        <tbody>
            ${rowsHtml || `<tr><td colspan="11" class="text-center py-6 text-slate-400">No records to display.</td></tr>`}
        </tbody>
    </table>

    <div class="summary-box">
        <div>Total Inbound: <span class="text-emerald-600">+${fmtNumber(totalIn)} (₱${fmtNumber(totalInVal)})</span></div>
        <div>Total Outbound: <span class="text-rose-600">-${fmtNumber(totalOut)} (₱${fmtNumber(totalOutVal)})</span></div>
        <div>Net Delta: <span class="text-primary">${fmtNumber(totalIn - totalOut)}</span></div>
    </div>

    <div class="footer">
        <div>Manufacturing Management System • Inventory Movements Ledger</div>
        <div>Page 1 of Continuous Document</div>
    </div>
</body>
</html>
    `;
}

export function printProductTracingReport(args: PrintProductTracingArgs): void {
    const html = generateProductTracingHtml(args);
    const printWindow = window.open("", "_blank", "width=1200,height=900");
    if (!printWindow) {
        alert("Please allow pop-ups to print this report.");
        return;
    }
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    setTimeout(() => {
        printWindow.focus();
        printWindow.print();
    }, 500);
}
