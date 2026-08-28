// src/modules/financial-management/accounting/customers-memo/utils/printCustomerMemoA4.ts
import { DetailedMemo, CompanyProfile } from "../types";

function esc(v: unknown): string {
    return String(v ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function safeText(v: unknown): string {
    return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

function companyLineJoin(parts: Array<string | null | undefined>, sep = " • "): string {
    return parts.map((p) => safeText(p)).filter(Boolean).join(sep);
}

function fmtNum(amount: number | string | null | undefined): string {
    const val = Number(amount) || 0;
    return val.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(dateStr: string | null | undefined): string {
    if (!dateStr) return "—";
    try {
        return new Date(dateStr).toLocaleDateString("en-PH", {
            year: "numeric", month: "short", day: "2-digit"
        });
    } catch {
        return dateStr;
    }
}

function fmtDateTime(dateStr: string | null | undefined): string {
    if (!dateStr) return "—";
    try {
        return new Date(dateStr).toLocaleString("en-PH", {
            year: "numeric", month: "short", day: "2-digit",
            hour: "2-digit", minute: "2-digit"
        });
    } catch {
        return dateStr;
    }
}

export function printCustomerMemoA4(details: DetailedMemo, company: CompanyProfile | null = null): void {
    const header = details.header;

    const memoNo   = safeText(header.memo_number) || "—";
    const memoType = header.type === 1 ? "Customer Credit Memo"
                   : header.type === 2 ? "Customer Debit Memo"
                   : "Customer Memo";

    const customer  = safeText(header.customer_id?.customer_name) || "—";
    const supplier  = safeText(header.supplier_id?.supplier_name)  || "—";
    const salesman  = header.salesman_id
        ? `${header.salesman_id.salesman_code} — ${header.salesman_id.salesman_name}`
        : "—";
    const glAccount = safeText(header.chart_of_account?.account_title) || "—";
    const reason    = safeText(header.reason) || "—";

    const createdAt = fmtDateTime(header.created_at);
    const printedAt = fmtDateTime(new Date().toISOString());

    let encoder = "—";
    if (header.encoder_id && typeof header.encoder_id === "object" && header.encoder_id.user_fname) {
        encoder = `${header.encoder_id.user_fname} ${header.encoder_id.user_lname || ""}`.trim();
    }

    // Applied-to-Invoices amount (sum of all invoice applications)
    const appliedToInvoices = (details.invoices || []).reduce((s, i) => s + (i.amount ?? 0), 0);
    const linkedToCollections = header.applied_amount ?? 0;
    const unappliedBalance = header.amount - header.applied_amount;

    // ── Company Data Formatting ──────────────────────────────────────────────────
    const companyName = safeText(company?.company_name) || "—";
    const companyAddress = companyLineJoin(
        [
            company?.company_address,
            company?.company_brgy,
            company?.company_city,
            company?.company_province,
            company?.company_zipCode,
        ],
        ", "
    );

    const companyLegal = companyLineJoin(
        [
            safeText(company?.company_tin) ? `TIN: ${safeText(company?.company_tin)}` : "",
            safeText(company?.company_registrationNumber)
                ? `Reg No: ${safeText(company?.company_registrationNumber)}`
                : "",
        ],
        " • "
    );

    const companyContact = companyLineJoin(
        [
            safeText(company?.company_contact) ? `Tel: ${safeText(company?.company_contact)}` : "",
            safeText(company?.company_email),
        ],
        " • "
    );

    // ── Invoice rows ────────────────────────────────────────────────────────────
    const invoiceRowsHtml = (details.invoices || []).length > 0
        ? (details.invoices || []).map((inv, idx) => {
            const bg = idx % 2 === 1 ? ' style="background:#f9f9f9;"' : "";
            return `<tr${bg}>
              <td class="mono">${esc(inv.invoice_id?.invoice_no || "—")}</td>
              <td>${esc(fmtDate(inv.invoice_id?.invoice_date))}</td>
              <td>${esc(fmtDate(inv.invoice_id?.due_date))}</td>
              <td class="num">${esc(fmtNum(inv.invoice_id?.net_amount))}</td>
              <td class="num muted">—</td>
              <td class="num bold">${esc(fmtNum(inv.amount))}</td>
            </tr>`;
          }).join("")
        : `<tr><td colspan="6" class="empty-row">No invoices applied to this memo.</td></tr>`;

    // ── Collection rows ─────────────────────────────────────────────────────────
    const collectionRowsHtml = (details.collections || []).length > 0
        ? (details.collections || []).map((c, idx) => {
            const bg = idx % 2 === 1 ? ' style="background:#f9f9f9;"' : "";
            const colRef = esc(c.collection_id?.docNo || "—");
            const linked = esc(fmtNum(c.amount));
            return `<tr${bg}>
              <td class="muted">—</td>
              <td class="mono">${colRef}</td>
              <td class="num muted">—</td>
              <td class="num muted">—</td>
              <td class="num bold">${linked}</td>
            </tr>`;
          }).join("")
        : `<tr><td colspan="5" class="empty-row">No collections linked to this memo.</td></tr>`;

    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(memoType)} · ${esc(memoNo)}</title>
<style>
  @page { size: A4 portrait; margin: 14mm 14mm 16mm 14mm; }

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: "Segoe UI", Arial, Helvetica, sans-serif;
    font-size: 11px;
    color: #1a1a1a;
    background: #fff;
    line-height: 1.45;
  }

  /* ── Page wrapper ── */
  .page { width: 100%; max-width: 182mm; margin: 0 auto; }

  /* ── Company Header Bar ── */
  .companyBar {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 20px;
    align-items: start;
    padding-bottom: 12px;
    border-bottom: 2.5px solid #1a1a2e;
    margin-bottom: 20px;
  }
  .companyInfo .companyName {
    font-size: 18px;
    font-weight: 900;
    letter-spacing: .2px;
    line-height: 1.2;
    color: #1a1a2e;
    text-transform: uppercase;
  }
  .companyInfo .line { margin-top: 3px; color:#444; font-size: 10px; line-height: 1.3; }
  .companyInfo .muted { color:#777; }

  .docInfo { text-align: right; }
  .docTitle { font-size: 16px; font-weight: 900; color: #1a1a2e; text-transform: uppercase; }
  .docNo { font-size: 14px; font-weight: 700; color: #1a1a2e; font-family: "Courier New", monospace; margin-top: 2px; }
  .docSub { margin-top: 4px; color:#555; font-size: 9.5px; }

  /* ── Two-column info block ── */
  .info-block {
    display: flex;
    gap: 20px;
    margin-bottom: 20px;
  }
  .info-left { flex: 1; }
  .info-right { width: 220px; flex-shrink: 0; }

  .info-table { width: 100%; border-collapse: collapse; }
  .info-table td { padding: 3px 0; vertical-align: top; }
  .info-table td.lbl {
    width: 88px;
    color: #666;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: .04em;
    white-space: nowrap;
    padding-right: 8px;
  }
  .info-table td.val { font-weight: 600; font-size: 11px; color: #1a1a1a; }

  /* ── Summary box (right) ── */
  .summary-box {
    border: 1px solid #d0d0d0;
    border-radius: 4px;
    overflow: hidden;
  }
  .summary-box .box-title {
    background: #1a1a2e;
    color: #fff;
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .08em;
    padding: 5px 10px;
  }
  .summary-box table { width: 100%; border-collapse: collapse; }
  .summary-box td { padding: 5px 10px; font-size: 11px; }
  .summary-box td.lbl { color: #444; }
  .summary-box td.val { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
  .summary-box tr.total-row { border-top: 1.5px solid #ccc; background: #f5f5f5; }
  .summary-box tr.total-row td { font-weight: 700; font-size: 12px; }
  .summary-box tr + tr td { border-top: 1px solid #eee; }

  /* ── Section heading ── */
  .section-heading {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .06em;
    color: #1a1a2e;
    padding: 0 0 5px 0;
    border-bottom: 2px solid #1a1a2e;
    margin-bottom: 10px;
  }

  /* ── Data tables ── */
  .data-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 10.5px; }
  .data-table thead tr { background: #f0f0f5; }
  .data-table th {
    text-align: left;
    padding: 6px 8px;
    font-size: 9.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .05em;
    color: #333;
    border-bottom: 1.5px solid #c0c0c0;
    white-space: nowrap;
  }
  .data-table td { padding: 6px 8px; border-bottom: 1px solid #ebebeb; vertical-align: top; }
  .data-table tbody tr:last-child td { border-bottom: 2px solid #c0c0c0; }
  .data-table .num { text-align: right; font-variant-numeric: tabular-nums; }
  .data-table .mono { font-family: "Courier New", monospace; font-size: 10px; }
  .data-table .bold { font-weight: 700; }
  .data-table .muted { color: #aaa; }

  .empty-row { text-align: center; color: #888; font-style: italic; padding: 14px 8px !important; }

  /* ── Totals footer row ── */
  .tfoot-row td {
    background: #f0f0f5;
    font-weight: 700;
    font-size: 11px;
    padding: 6px 8px;
    border-top: 2px solid #c0c0c0;
    border-bottom: none;
  }

  /* ── Signature area ── */
  .sign-section {
    margin-top: 36px;
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 24px;
  }
  .sign-label { font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: #555; margin-bottom: 36px; }
  .sign-name { font-size: 11px; font-weight: 600; color: #1a1a1a; min-height: 14px; }
  .sign-line { border-top: 1px solid #555; margin-top: 4px; padding-top: 4px; }
  .sign-role { font-size: 9px; color: #777; }

  /* ── Footer ── */
  .doc-footer {
    margin-top: 24px;
    padding-top: 8px;
    border-top: 1px solid #ddd;
    display: flex;
    justify-content: space-between;
    font-size: 8.5px;
    color: #aaa;
  }

  @media print {
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  }
</style>
</head>
<body>
<div class="page">

  <!-- ── COMPANY HEADER ── -->
  <div class="companyBar">
    <div class="companyInfo">
      <div class="companyName">${esc(companyName)}</div>
      ${companyAddress ? `<div class="line">${esc(companyAddress)}</div>` : ``}
      ${companyLegal ? `<div class="line muted">${esc(companyLegal)}</div>` : ``}
      ${companyContact ? `<div class="line muted">${esc(companyContact)}</div>` : ``}
    </div>
    <div class="docInfo">
      <div class="docTitle">${esc(memoType)}</div>
      <div class="docNo">${esc(memoNo)}</div>
      <div class="docSub">Date: ${esc(createdAt)}</div>
      <div class="docSub">GL Account: ${esc(glAccount)}</div>
    </div>
  </div>

  <!-- ── INFO + SUMMARY ── -->
  <div class="info-block">
    <div class="info-left">
      <table class="info-table">
        <tr><td class="lbl">Customer</td><td class="val">${esc(customer)}</td></tr>
        <tr><td class="lbl">Supplier</td><td class="val">${esc(supplier)}</td></tr>
        <tr><td class="lbl">Salesman</td><td class="val">${esc(salesman)}</td></tr>
        <tr><td class="lbl">Encoder</td><td class="val">${esc(encoder)}</td></tr>
        <tr><td class="lbl">Reason</td><td class="val">${esc(reason)}</td></tr>
      </table>
    </div>

    <div class="info-right">
      <div class="summary-box">
        <div class="box-title">Memo Summary</div>
        <table>
          <tr>
            <td class="lbl">Memo Amount</td>
            <td class="val">${esc(fmtNum(header.amount))}</td>
          </tr>
          <tr>
            <td class="lbl">Applied to Invoices</td>
            <td class="val">${esc(fmtNum(appliedToInvoices))}</td>
          </tr>
          <tr>
            <td class="lbl">Linked to Collections</td>
            <td class="val">${esc(fmtNum(linkedToCollections))}</td>
          </tr>
          <tr class="total-row">
            <td class="lbl">Unapplied Balance</td>
            <td class="val">${esc(fmtNum(unappliedBalance))}</td>
          </tr>
        </table>
      </div>
    </div>
  </div>

  <!-- ── APPLIED TO INVOICES ── -->
  <div class="section-heading">Applied to Invoices</div>
  <table class="data-table">
    <thead>
      <tr>
        <th style="width:22%">Invoice #</th>
        <th style="width:14%">Invoice Date</th>
        <th style="width:14%">Due Date</th>
        <th class="num" style="width:16%">Original Amt</th>
        <th class="num" style="width:14%">Open Balance</th>
        <th class="num" style="width:16%">Applied Amt</th>
      </tr>
    </thead>
    <tbody>
      ${invoiceRowsHtml}
    </tbody>
    ${(details.invoices || []).length > 0 ? `
    <tfoot>
      <tr class="tfoot-row">
        <td colspan="5" style="text-align:right;">Total Applied to Invoices</td>
        <td class="num">${esc(fmtNum(appliedToInvoices))}</td>
      </tr>
    </tfoot>` : ""}
  </table>

  <!-- ── LINKED TO COLLECTIONS ── -->
  <div class="section-heading">Linked to Collections</div>
  <table class="data-table">
    <thead>
      <tr>
        <th style="width:18%">Collection Date</th>
        <th style="width:22%">Ref / Check #</th>
        <th class="num" style="width:20%">Total Collected</th>
        <th class="num" style="width:18%">Unused Bal</th>
        <th class="num" style="width:22%">Linked Amt</th>
      </tr>
    </thead>
    <tbody>
      ${collectionRowsHtml}
    </tbody>
    ${(details.collections || []).length > 0 ? `
    <tfoot>
      <tr class="tfoot-row">
        <td colspan="4" style="text-align:right;">Total Linked to Collections</td>
        <td class="num">${esc(fmtNum(linkedToCollections))}</td>
      </tr>
    </tfoot>` : ""}
  </table>

  <!-- ── SIGNATURES ── -->
  <div class="sign-section">
    <div class="sign-block">
      <div class="sign-label">Prepared By</div>
      <div class="sign-name">${esc(encoder)}</div>
      <div class="sign-line"></div>
      <div class="sign-role">Signature over Printed Name / Date</div>
    </div>
    <div class="sign-block">
      <div class="sign-label">Checked By</div>
      <div class="sign-name">&nbsp;</div>
      <div class="sign-line"></div>
      <div class="sign-role">Signature over Printed Name / Date</div>
    </div>
    <div class="sign-block">
      <div class="sign-label">Approved By</div>
      <div class="sign-name">&nbsp;</div>
      <div class="sign-line"></div>
      <div class="sign-role">Signature over Printed Name / Date</div>
    </div>
  </div>

  <!-- ── DOCUMENT FOOTER ── -->
  <div class="doc-footer">
    <span>This document is system-generated and valid without a wet signature unless otherwise stated.</span>
    <span>Printed: ${esc(printedAt)}</span>
  </div>

</div>
<script>setTimeout(() => window.print(), 300);</script>
</body>
</html>`;

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const w    = window.open(url, "_blank");
    if (!w) return;
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
