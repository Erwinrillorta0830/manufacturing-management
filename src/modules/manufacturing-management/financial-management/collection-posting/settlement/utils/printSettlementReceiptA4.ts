import { format } from "date-fns";
import type { SettlementAllocation } from "../../types";
import type { CompanyProfile } from "../../company-profile";
import type { SettlementPrintableWalletItem } from "./settlement-printable-data";

function esc(v: unknown): string {
    return String(v ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function fmtNum(amount: number | string | null | undefined): string {
    const val = Number(amount) || 0;
    return val.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(dateStr: string | null | undefined): string {
    if (!dateStr) return "—";
    try {
        return format(new Date(dateStr), "yyyy-MM-dd");
    } catch {
        return dateStr;
    }
}

function displayCustomer(value: string | null | undefined): string {
    const customer = value?.trim();
    return customer && !/^chk-/i.test(customer) ? customer : "N/A";
}

export function printSettlementReceiptA4(
    wallet: readonly SettlementPrintableWalletItem[],
    allocations: readonly SettlementAllocation[],
    docNo: string,
    salesmanName: string,
    collectionDate: string,
    isPosted: boolean,
    companyProfile?: CompanyProfile | null,
    targetWindow?: Window | null,
): void {
    const printedAt = format(new Date(), "yyyy-MM-dd HH:mm");
    const companyName = companyProfile?.companyName?.trim() || "MEN2 MARKETING CORPORATION";
    const companyDetails = [
        companyProfile?.address?.trim(),
        companyProfile?.tin?.trim() ? `TIN: ${companyProfile.tin.trim()}` : null,
    ].filter(Boolean) as string[];
    const logoHtml = companyProfile?.logoDataUrl
        ? `<img class="companyLogo" src="${esc(companyProfile.logoDataUrl)}" alt="Company logo" />`
        : "";
    const companyDetailsHtml = companyDetails.length > 0
        ? `<div class="companyDetails">${companyDetails.map((detail) => esc(detail)).join(" &bull; ")}</div>`
        : "";

    // 1. Linked Invoices list
    // Get unique list of invoices that have allocations
    const invoiceMap = new Map<number, { invoiceNo: string; customerName: string; openBalance: number; applied: number }>();
    allocations.forEach(alloc => {
        if (!invoiceMap.has(alloc.invoiceId)) {
            invoiceMap.set(alloc.invoiceId, {
                invoiceNo: alloc.invoiceNo,
                customerName: alloc.customerName,
                openBalance: alloc.remainingBalance + alloc.amountApplied, // approximate original open balance before this session
                applied: 0
            });
        }
        const entry = invoiceMap.get(alloc.invoiceId)!;
        entry.applied += alloc.amountApplied;
    });

    const invoiceRowsHtml = Array.from(invoiceMap.entries()).map(([, inv]) => `
        <tr>
            <td class="bold font-mono">${esc(inv.invoiceNo)}</td>
            <td>${esc(displayCustomer(inv.customerName))}</td>
            <td class="num">${esc(fmtNum(inv.openBalance))}</td>
            <td class="num bold text-emerald-600">${esc(fmtNum(inv.applied))}</td>
        </tr>
    `).join("");

    const totalInvoiceApplied = Array.from(invoiceMap.values()).reduce((sum, i) => sum + i.applied, 0);

    // 2. Payments (Cash & Check)
    const payments = wallet.filter(w => w.type === "CASH" || w.type === "CHECK");
    const paymentRowsHtml = payments.map(p => `
        <tr>
            <td class="bold">${esc(p.type)}</td>
            <td>${esc(p.label)}</td>
            <td class="num bold">${esc(fmtNum(p.originalAmount))}</td>
        </tr>
    `).join("");
    const totalPayments = payments.reduce((sum, p) => sum + p.originalAmount, 0);

    // 3. Returns and Memos linked to invoices
    const creditAllocations = allocations.filter(alloc => 
        alloc.allocationType === "MEMO" || alloc.allocationType === "RETURN"
    );
    const creditRowsHtml = creditAllocations.map(alloc => {
        return `
            <tr>
                <td class="bold">${esc(alloc.allocationType)}</td>
                <td class="font-mono">${esc(alloc.sourceTempId)}</td>
                <td class="font-mono">${esc(alloc.invoiceNo)}</td>
                <td>${esc(displayCustomer(alloc.customerName))}</td>
                <td class="num bold">${esc(fmtNum(alloc.amountApplied))}</td>
            </tr>
        `;
    }).join("");
    const totalCreditsApplied = creditAllocations.reduce((sum, a) => sum + a.amountApplied, 0);

    // 4. Adjustments
    const adjustments = wallet.filter(w => w.type === "ADJUSTMENT" || w.type === "EWT");
    const adjustmentRowsHtml = adjustments.map(adj => {
        const alloc = allocations.find(a => a.sourceTempId === adj.id);
        const refNo = alloc ? alloc.invoiceNo : "—";
        return `
            <tr>
                <td class="bold">${esc(adj.type === "EWT" ? "EWT Adjustment" : adj.label)}</td>
                <td>${esc(displayCustomer(adj.customerName))}</td>
                <td class="font-mono">${esc(refNo)}</td>
                <td class="num bold">${esc(fmtNum(adj.originalAmount))}</td>
            </tr>
        `;
    }).join("");
    const totalAdjustments = adjustments.reduce((sum, a) => sum + a.originalAmount, 0);

    const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Settlement printable - ${esc(docNo)}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 20px; color: #333; background: #fff; line-height: 1.4; }
  .page { max-width: 800px; margin: 0 auto; }
  
  .companyBar { display: flex; justify-content: space-between; border-bottom: 2px solid #1a1a2e; padding-bottom: 12px; margin-bottom: 20px; }
  .companyIdentity { display: flex; align-items: flex-start; gap: 10px; }
  .companyLogo { width: 34px; height: 34px; object-fit: contain; }
  .companyName { font-size: 16px; font-weight: 800; color: #1a1a2e; text-transform: uppercase; letter-spacing: .05em; }
  .companySub { font-size: 10px; color: #666; margin-top: 2px; }
  .companyDetails { font-size: 9px; color: #64748b; margin-top: 3px; }
  
  .docInfo { text-align: right; }
  .docTitle { font-size: 14px; font-weight: 800; color: #1a1a2e; text-transform: uppercase; letter-spacing: .05em; }
  .docNo { font-family: "Courier New", monospace; font-size: 13px; font-weight: 700; color: #2563eb; margin: 2px 0; }
  .docDate { font-size: 10px; color: #555; }
  
  .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; margin-bottom: 20px; font-size: 11px; }
  .meta-item { display: flex; }
  .meta-lbl { width: 100px; font-weight: 600; color: #64748b; text-transform: uppercase; font-size: 9px; letter-spacing: .03em; }
  .meta-val { font-weight: 700; color: #0f172a; }
  
  .section-heading { font-size: 10.5px; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; color: #1e293b; padding: 4px 0; border-bottom: 1.5px solid #cbd5e1; margin-top: 25px; margin-bottom: 8px; }
  
  .data-table { width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 10.5px; }
  .data-table th { text-align: left; padding: 6px 8px; font-weight: 700; text-transform: uppercase; font-size: 9px; color: #475569; background: #f1f5f9; border-bottom: 1.5px solid #cbd5e1; }
  .data-table td { padding: 6px 8px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
  .data-table tr:last-child td { border-bottom: 1.5px solid #cbd5e1; }
  
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .bold { font-weight: 700; }
  .font-mono { font-family: "Courier New", monospace; font-size: 10px; }
  .text-emerald-600 { color: #059669; }
  .empty-msg { text-align: center; color: #94a3b8; font-style: italic; padding: 12px !important; }
  
  .tfoot-row td { background: #f8fafc; font-weight: 700; border-top: 1.5px solid #cbd5e1; border-bottom: none; }
  
  .doc-footer { margin-top: 40px; padding-top: 10px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; font-size: 8.5px; color: #94a3b8; }
  
  @media print {
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    body { padding: 0; margin: 0; }
  }
</style>
</head>
<body>
<div class="page">

  <!-- COMPANY HEADER -->
  <div class="companyBar">
    <div class="companyIdentity">
      ${logoHtml}
      <div>
      <div class="companyName">${esc(companyName)}</div>
      <div class="companySub">Treasury Department &bull; Collection Settlement printable</div>
      ${companyDetailsHtml}
      </div>
    </div>
    <div class="docInfo">
      <div class="docTitle">Settlement Receipt</div>
      <div class="docNo">${esc(docNo)}</div>
      <div class="docDate">Status: <span class="bold">${isPosted ? "POSTED" : "DRAFT"}</span></div>
    </div>
  </div>

  <!-- META DETAILS -->
  <div class="meta-grid">
    <div class="meta-item">
      <span class="meta-lbl">Collector:</span>
      <span class="meta-val">${esc(salesmanName)}</span>
    </div>
    <div class="meta-item">
      <span class="meta-lbl">Collection Date:</span>
      <span class="meta-val">${esc(fmtDate(collectionDate))}</span>
    </div>
    <div class="meta-item">
      <span class="meta-lbl">Total Allocated:</span>
      <span class="meta-val">PHP ${esc(fmtNum(totalInvoiceApplied))}</span>
    </div>
    <div class="meta-item">
      <span class="meta-lbl">Printed On:</span>
      <span class="meta-val">${esc(printedAt)}</span>
    </div>
  </div>

  <!-- 1. LINKED INVOICES -->
  <div class="section-heading">Invoices Linked &amp; Settled</div>
  <table class="data-table">
    <thead>
      <tr>
        <th style="width: 25%">Invoice No</th>
        <th style="width: 45%">Customer</th>
        <th class="num" style="width: 15%">Open Balance</th>
        <th class="num" style="width: 15%">Amount Settled</th>
      </tr>
    </thead>
    <tbody>
      ${invoiceRowsHtml || `<tr><td colspan="4" class="empty-msg">No invoices linked in this settlement.</td></tr>`}
    </tbody>
    ${invoiceRowsHtml ? `
    <tfoot>
      <tr class="tfoot-row">
        <td colspan="3" class="num">Total Settled Invoices</td>
        <td class="num text-emerald-600 bold">PHP ${esc(fmtNum(totalInvoiceApplied))}</td>
      </tr>
    </tfoot>` : ""}
  </table>

  <!-- 2. PAYMENT DATA -->
  <div class="section-heading">Payment Data</div>
  <table class="data-table">
    <thead>
      <tr>
        <th style="width: 25%">Payment Type</th>
        <th style="width: 50%">Details (Bank / Check or Ref #)</th>
        <th class="num" style="width: 25%">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${paymentRowsHtml || `<tr><td colspan="3" class="empty-msg">No physical payments registered.</td></tr>`}
    </tbody>
    ${paymentRowsHtml ? `
    <tfoot>
      <tr class="tfoot-row">
        <td colspan="2" class="num">Total Payments</td>
        <td class="num bold">PHP ${esc(fmtNum(totalPayments))}</td>
      </tr>
    </tfoot>` : ""}
  </table>

  <!-- 3. RETURNS & MEMOS LINKED TO INVOICES -->
  <div class="section-heading">Returns &amp; Memos Linked to Invoices</div>
  <table class="data-table">
    <thead>
      <tr>
        <th style="width: 20%">Type</th>
        <th style="width: 25%">Doc Number</th>
        <th style="width: 20%">Applied Invoice</th>
        <th style="width: 20%">Customer</th>
        <th class="num" style="width: 15%">Amount Applied</th>
      </tr>
    </thead>
    <tbody>
      ${creditRowsHtml || `<tr><td colspan="5" class="empty-msg">No credit memos or returns applied.</td></tr>`}
    </tbody>
    ${creditRowsHtml ? `
    <tfoot>
      <tr class="tfoot-row">
        <td colspan="4" class="num">Total Credits Applied</td>
        <td class="num bold">PHP ${esc(fmtNum(totalCreditsApplied))}</td>
      </tr>
    </tfoot>` : ""}
  </table>

  <!-- 4. ADJUSTMENTS -->
  <div class="section-heading">Adjustments (Shortages / EWT / Adjustments)</div>
  <table class="data-table">
    <thead>
      <tr>
        <th style="width: 30%">Adjustment Type</th>
        <th style="width: 35%">Remarks / Customer</th>
        <th style="width: 20%">Applied Invoice</th>
        <th class="num" style="width: 15%">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${adjustmentRowsHtml || `<tr><td colspan="4" class="empty-msg">No adjustments recorded.</td></tr>`}
    </tbody>
    ${adjustmentRowsHtml ? `
    <tfoot>
      <tr class="tfoot-row">
        <td colspan="3" class="num">Total Adjustments</td>
        <td class="num bold">PHP ${esc(fmtNum(totalAdjustments))}</td>
      </tr>
    </tfoot>` : ""}
  </table>

  <!-- DOCUMENT FOOTER -->
  <div class="doc-footer">
    <span>This is a system-generated Settlement printable report.</span>
    <span>Printed by Antigravity AI Systems &bull; ${esc(printedAt)}</span>
  </div>

</div>
<script>setTimeout(() => window.print(), 300);</script>
</body>
</html>
    `;

    const w = targetWindow ?? window.open("", "_blank");
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
}
