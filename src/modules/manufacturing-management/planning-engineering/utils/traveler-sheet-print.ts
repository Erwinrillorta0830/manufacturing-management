import JsBarcode from "jsbarcode";
import QRCode from "qrcode";
import type {
    JobOrder,
    JobOrderAllocation,
    JobOrderMaterial,
    JobOrderOperation,
} from "../types";
import { displayJobOrderStatus } from "../../job-order-status";

export interface TravelerSheetPrintSheet {
    jobOrder: JobOrder;
    materials: JobOrderMaterial[];
    operations: JobOrderOperation[];
    isSubAssembly?: boolean;
}

export interface TravelerSheetPrintData {
    sheets: TravelerSheetPrintSheet[];
    branchName: string;
    issuedAt?: string;
}

function escapeHtml(value: unknown): string {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function formatQuantity(value: unknown, maximumFractionDigits = 3): string {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed)
        ? parsed.toLocaleString(undefined, { maximumFractionDigits })
        : "0";
}

/** Render a CODE128 barcode to an SVG string. Falls back to plain text. */
function barcodeSvg(value: string, height: number): string {
    try {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        JsBarcode(svg, value || "JO-000000", {
            format: "CODE128",
            height,
            width: 1.2,
            fontSize: 10,
            margin: 0,
            displayValue: false,
        });
        return svg.outerHTML;
    } catch {
        return `<div class="mono strong">${escapeHtml(value)}</div>`;
    }
}

async function qrDataUrl(value: string): Promise<string | null> {
    try {
        return await QRCode.toDataURL(value, { width: 112, margin: 1 });
    } catch {
        return null;
    }
}

interface ResolvedSheet extends TravelerSheetPrintSheet {
    joNo: string;
    productName: string;
    productCode: string;
    targetQty: number;
    uom: string;
    batchNo: string;
    shiftHours: string;
    status: string;
    versionName: string;
    parentJoNo: string | null;
    qrPayload: string;
}

function resolveSheet(sheet: TravelerSheetPrintSheet): ResolvedSheet {
    const currentJo = sheet.jobOrder;
    const joNo = String(
        currentJo.job_order_no || currentJo.jo_id || `JO-${currentJo.job_order_id || currentJo.id || "000000"}`,
    ).trim();
    const targetQty = Number(currentJo.target_quantity || currentJo.quantity || 0);
    const productCode = currentJo.product_code || `SKU-${currentJo.product_id}`;
    return {
        ...sheet,
        joNo,
        productName: currentJo.product_name || `Product #${currentJo.product_id}`,
        productCode,
        targetQty,
        uom: currentJo.unit_of_measurement || "PCS",
        batchNo: `LOT-${joNo}`,
        shiftHours: currentJo.shift_option || "8",
        status: displayJobOrderStatus(currentJo.status || "Planned"),
        versionName: currentJo.version_name || (currentJo.version_id ? `v${currentJo.version_id}` : "Standard"),
        parentJoNo: currentJo.parent_job_order_id != null
            ? String(currentJo.parent_job_order_id)
            : (joNo.includes("-SUB") ? joNo.split("-SUB")[0] : null),
        qrPayload: `JO:${joNo}|PROD:${productCode}|QTY:${targetQty}`,
    };
}

function materialRows(materials: JobOrderMaterial[]): string {
    if (materials.length === 0) {
        return `<tr><td colspan="7" class="center muted italic">No raw material requirements specified for this operation.</td></tr>`;
    }
    return materials.map((mat, idx) => {
        const reqQty = Number(mat.allocated_quantity || mat.required_quantity || 0);
        const resQty = Number(mat.reserved_quantity || reqQty);
        const matName = mat.product_name || `Component #${mat.product_id}`;
        const matCode = mat.product_code || `SKU-${mat.product_id}`;
        const matUom = mat.unit_of_measurement || "pcs";
        const lotAllocations = mat.allocations || [];
        const lotText = lotAllocations.length > 0
            ? lotAllocations.map((a: JobOrderAllocation) => a.batch_no || `LOT-${a.lot_id}`).join(", ")
            : (mat.batch_no || "FIFO / General Stock");
        return `<tr>
            <td class="center mono dim"><strong>${idx + 1}</strong></td>
            <td><strong>${escapeHtml(matName)}</strong><div class="mono tiny dim">${escapeHtml(matCode)}</div></td>
            <td class="right mono"><strong>${formatQuantity(reqQty)} ${escapeHtml(matUom)}</strong></td>
            <td class="right mono">${formatQuantity(resQty)} ${escapeHtml(matUom)}</td>
            <td class="mono small">${escapeHtml(lotText)}</td>
            <td class="center mono small">${escapeHtml(mat.staging_bin || "A-01-STG")}</td>
            <td class="center"><span class="checkbox"></span></td>
        </tr>`;
    }).join("");
}

function operationRows(operations: JobOrderOperation[]): string {
    if (operations.length === 0) {
        return `<tr><td colspan="12" class="center muted italic">Standard single-step manufacturing execution flow.</td></tr>`;
    }
    return operations.map((op, idx) => {
        const seq = op.sequence_order || (idx + 1) * 10;
        const opName = op.operation_name || `Operation #${op.operation_id || op.id || idx + 1}`;
        const wcName = op.work_center_name || `Work Center #${op.work_center_id || 1}`;
        const setupHrs = Number(op.planned_setup_hours || 0);
        const runHrs = Number(op.planned_run_hours || 0);
        const stepCode = `OP-${seq}-${op.operation_id || op.id || idx + 1}`;
        return `<tr>
            <td class="center mono strong shaded">${seq}</td>
            <td><strong>${escapeHtml(opName)}</strong><div class="mono tiny dim">${escapeHtml(stepCode)}</div></td>
            <td>${escapeHtml(wcName)}</td>
            <td class="right mono">${setupHrs.toFixed(1)}h</td>
            <td class="right mono"><strong>${runHrs.toFixed(1)}h</strong></td>
            <td class="center">${barcodeSvg(stepCode, 36)}</td>
            <td class="center mono small dim">_______</td>
            <td class="center mono small dim">___:___</td>
            <td class="center mono small dim">___:___</td>
            <td class="center mono small dim">_______</td>
            <td class="center mono small dim">_______</td>
            <td class="center mono small dim">_______</td>
        </tr>`;
    }).join("");
}

async function sheetHtml(resolved: ResolvedSheet, branchName: string, issuedAt: string): Promise<string> {
    const qrUrl = await qrDataUrl(resolved.qrPayload);
    return `<section class="traveler-sheet">
        <div class="banner">
            <div>
                <div class="company">VERTEX TECH CORP &bull; VOS ERP</div>
                ${resolved.isSubAssembly ? `<span class="sub-badge">Sub-Assembly Run</span>` : ""}
                <h2>Shop Floor Job Order Production Traveler &amp; Route Sheet</h2>
                <p class="subtitle">Official Factory Execution Traveler &bull; Maintain physical attachment with batch cart / tote at all times</p>
            </div>
            <div class="codes">
                <div class="barcode">${barcodeSvg(resolved.joNo, 64)}</div>
                <div class="mono strong large">${escapeHtml(resolved.joNo)}</div>
                <div class="small">Status: <strong>${escapeHtml(resolved.status)}</strong></div>
                ${qrUrl ? `<img class="qr" src="${qrUrl}" alt="Traveler QR code" />` : ""}
            </div>
        </div>

        <div class="matrix">
            <div><span class="label">Finished Product / SKU</span><div class="strong">${escapeHtml(resolved.productName)}</div><div class="mono tiny dim">${escapeHtml(resolved.productCode)}</div></div>
            <div><span class="label">Target Production Qty</span><div class="strong mono big">${formatQuantity(resolved.targetQty, 0)} <span class="small normal">${escapeHtml(resolved.uom)}</span></div><div class="tiny">BOM: <strong>${escapeHtml(resolved.versionName)}</strong></div></div>
            <div><span class="label">Batch / Lot Tracking #</span><div class="mono strong">${escapeHtml(resolved.batchNo)}</div><div class="tiny">Shift: <strong>${escapeHtml(resolved.shiftHours)} hrs</strong></div></div>
            <div><span class="label">Facility / Issue Details</span><div class="strong">${escapeHtml(branchName)}</div><div class="tiny">Issued: <span class="mono">${escapeHtml(issuedAt)}</span></div></div>
            ${resolved.isSubAssembly && resolved.parentJoNo ? `<div class="sub-link span-all"><strong>Linked to Parent Master JO:</strong> <span class="mono strong">${escapeHtml(resolved.parentJoNo)}</span></div>` : ""}
        </div>

        <h3>1. Bill of Materials &amp; Staged Component Pick-List <span class="count">${resolved.materials.length} Materials Required</span></h3>
        <table>
            <thead><tr><th class="w-8">#</th><th>Component Item &amp; Description</th><th class="w-20">Req Qty</th><th class="w-20">Alloc / Staged</th><th class="w-32">Lot / Batch #</th><th>Location Bin</th><th>Picker Sign-off</th></tr></thead>
            <tbody>${materialRows(resolved.materials)}</tbody>
        </table>

        <h3>2. Routing Operation Sequence &amp; Step Sign-Off <span class="count">${resolved.operations.length} Sequential Steps</span></h3>
        <table>
            <thead><tr><th>Seq</th><th>Operation Name</th><th>Work Center</th><th>Plan Setup</th><th>Plan Run</th><th>Step Barcode</th><th>Operator</th><th>Start Time</th><th>End Time</th><th>Good Qty</th><th>Scrap</th><th>QA Sign</th></tr></thead>
            <tbody>${operationRows(resolved.operations)}</tbody>
        </table>

        <div class="two-col">
            <div class="panel">
                <h4>3. In-Process Quality Checkpoints</h4>
                <div class="check"><span>&bull; Raw Material Verification &amp; Weight Check</span><span class="mono">[ ] PASS [ ] FAIL</span></div>
                <div class="check"><span>&bull; Operating Temperature &amp; Pressure Check</span><span class="mono">[ ] PASS [ ] FAIL</span></div>
                <div class="check"><span>&bull; First Article Inspection (Color / Texture)</span><span class="mono">[ ] PASS [ ] FAIL</span></div>
                <div class="check"><span>&bull; Final Packaging &amp; Barcode Labeling</span><span class="mono">[ ] PASS [ ] FAIL</span></div>
            </div>
            <div class="panel">
                <h4>4. Final Yield Disposition</h4>
                <div class="yield-grid">
                    <div class="yield-box"><span class="label">Accepted Good</span><div class="mono big">______</div></div>
                    <div class="yield-box"><span class="label">Scrap / Defect</span><div class="mono big">______</div></div>
                    <div class="yield-box"><span class="label">Yield %</span><div class="mono big">_____%</div></div>
                </div>
            </div>
        </div>

        <div class="signatures">
            <div><div class="line"></div><strong>Machine Lead / Operator</strong><span>Execution Sign &amp; Date</span></div>
            <div><div class="line"></div><strong>Quality Assurance (QA)</strong><span>Inspection &amp; Release Stamp</span></div>
            <div><div class="line"></div><strong>Shift Production Supervisor</strong><span>Floor Authorization</span></div>
            <div><div class="line"></div><strong>Warehouse Stock Custodian</strong><span>Finished Goods Receipt</span></div>
        </div>
    </section>`;
}

/**
 * Builds a standalone printable Traveler Sheet document, mirroring the
 * on-screen JobOrderTraveler. Rendered into an isolated print window so
 * app layout, dialog stacking, and print CSS cannot suppress it.
 */
export async function buildTravelerSheetHtml(data: TravelerSheetPrintData): Promise<string> {
    const issuedAt = data.issuedAt || new Date().toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
    const resolved = data.sheets.map(resolveSheet);
    const titleJoNo = resolved[0]?.joNo || "JO";
    const sheetsHtml = (await Promise.all(
        resolved.map((sheet) => sheetHtml(sheet, data.branchName, issuedAt)),
    )).join("");

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8" />
    <title>Job Order Traveler - ${escapeHtml(titleJoNo)}</title>
    <style>
        @page { size: portrait; margin: 10mm; }
        body { font-family: 'Segoe UI', Arial, sans-serif; color: #171717; margin: 0; padding: 10px; font-size: 11px; line-height: 1.4; }
        .traveler-sheet { border: 1px solid #d4d4d4; border-radius: 12px; padding: 24px; margin-bottom: 24px; page-break-after: always; }
        .traveler-sheet:last-child { page-break-after: auto; }
        .banner { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 2px solid #171717; padding-bottom: 14px; margin-bottom: 16px; }
        .company { font-weight: 900; font-size: 15px; letter-spacing: 1px; text-transform: uppercase; }
        .sub-badge { display: inline-block; font-size: 10px; background: #e0f2fe; color: #075985; border: 1px solid #7dd3fc; padding: 2px 8px; border-radius: 4px; font-weight: 800; text-transform: uppercase; margin-top: 4px; }
        h2 { font-size: 13px; margin: 6px 0 2px 0; text-transform: uppercase; }
        .subtitle { font-size: 11px; color: #525252; margin: 0; }
        .codes { text-align: right; }
        .qr { width: 56px; height: 56px; margin-top: 6px; }
        .matrix { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; background: #fafafa; border: 1px solid #d4d4d4; border-radius: 8px; padding: 12px; margin-bottom: 18px; font-size: 11px; }
        .label { display: block; font-size: 9px; font-weight: 800; text-transform: uppercase; color: #737373; }
        .strong { font-weight: 700; }
        .mono { font-family: Consolas, monospace; }
        .big { font-size: 14px; }
        .large { font-size: 15px; }
        .small { font-size: 10px; }
        .tiny { font-size: 10px; color: #525252; }
        .normal { font-weight: normal; }
        .dim { color: #737373; }
        .center { text-align: center; }
        .right { text-align: right; }
        .muted { color: #a3a3a3; }
        .italic { font-style: italic; }
        .shaded { background: #fafafa; }
        .span-all { grid-column: 1 / -1; }
        .sub-link { border-top: 1px solid #e5e5e5; margin-top: 4px; padding: 4px 8px; background: #f0f9ff; border-radius: 4px; font-size: 11px; color: #0c4a6e; }
        h3 { font-size: 12px; font-weight: 900; text-transform: uppercase; border-bottom: 1px solid #d4d4d4; padding-bottom: 6px; margin: 0 0 8px 0; }
        h3 .count { float: right; font-size: 10px; font-weight: 600; color: #737373; }
        h4 { font-size: 11px; font-weight: 900; text-transform: uppercase; margin: 0 0 8px 0; }
        table { width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 20px; }
        th { background: #f5f5f5; font-weight: 700; text-transform: uppercase; border: 1px solid #d4d4d4; padding: 6px; }
        td { border: 1px solid #d4d4d4; padding: 6px; vertical-align: top; }
        .checkbox { display: inline-block; width: 14px; height: 14px; border: 1px solid #a3a3a3; border-radius: 2px; }
        .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
        .panel { border: 1px solid #d4d4d4; border-radius: 8px; padding: 12px; background: #fafafa; font-size: 10px; }
        .check { display: flex; justify-content: space-between; border-bottom: 1px solid #e5e5e5; padding: 4px 0; }
        .check:last-child { border-bottom: none; }
        .yield-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; text-align: center; padding-top: 4px; }
        .yield-box { border: 1px solid #d4d4d4; background: #fff; padding: 8px; border-radius: 4px; }
        .signatures { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; text-align: center; font-size: 10px; border-top: 2px solid #171717; padding-top: 16px; margin-top: 20px; }
        .signatures .line { height: 40px; border-bottom: 1px solid #a3a3a3; margin-bottom: 4px; }
        .signatures strong { display: block; font-weight: 900; text-transform: uppercase; }
        .signatures span { font-size: 9px; color: #737373; }
        .no-print { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
        .no-print button { background: #171717; color: #fff; border: none; padding: 10px 20px; border-radius: 6px; font-weight: bold; cursor: pointer; }
        @media print {
            body { padding: 0; margin: 0; font-size: 10px; }
            .no-print { display: none !important; }
            * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            tr { page-break-inside: avoid; }
        }
    </style>
</head>
<body onload="window.print()">
    <div class="no-print"><strong>Job Order Traveler - ${escapeHtml(titleJoNo)}</strong><button onclick="window.print()">Print Traveler Sheet</button></div>
    ${sheetsHtml}
</body>
</html>`;
}
