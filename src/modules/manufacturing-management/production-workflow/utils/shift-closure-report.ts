export interface ShiftClosureReportRoute {
    sequence: number;
    operation: string;
    status: string;
    qaStatus: string;
    workCenterId: string;
    workCenterName: string;
    machineId: string;
    machineName: string;
    machineDetails: string;
    plannedSetupHours: number;
    plannedRunHours: number;
    actualSetupHours: number;
    actualRunHours: number;
}

export interface ShiftClosureReportOperator {
    name: string;
    role: string;
    route: string;
    workstation: string;
    timeIn: string;
    timeOut: string;
    durationHours: number;
    isActive: boolean;
}

export interface ShiftClosureReportMaterial {
    productName: string;
    unit: string;
    mmLot: string;
    inventoryLot: string;
    batchNo: string;
    standardQuantity: number;
    actualQuantity: number;
}

export interface ShiftClosureReportBreakdown {
    timestamp: string;
    step: string;
    workstation: string;
    machineId: string;
    reportedYield: number | null;
    reason: string;
    reportedBy: string;
    evidenceFiles: string[];
}

export interface ShiftClosureReportData {
    jobOrderNo: string;
    productName: string;
    branch: string;
    jobOrderStatus: string;
    printedAt: string;
    documentNo: string;
    revision: string;
    sessionKey: string;
    productionDay: string;
    shiftName: string;
    productionDate: string;
    targetQuantity: number;
    outputUnit: string;
    goodQuantity: number;
    rejectedQuantity: number;
    rejectionReason: string;
    rejectionRemarks: string;
    sessionRemarks: string;
    varianceReason: string;
    outputBatchStatus: string;
    currentEvidenceFiles: string[];
    routes: ShiftClosureReportRoute[];
    operators: ShiftClosureReportOperator[];
    materials: ShiftClosureReportMaterial[];
    breakdowns: ShiftClosureReportBreakdown[];
    workstationMetadataUnavailable: boolean;
}

function escapeHtml(value: unknown): string {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function text(value: unknown, fallback = "Not recorded"): string {
    const normalized = String(value ?? "").trim();
    return escapeHtml(normalized || fallback);
}

function quantity(value: number | null | undefined): string {
    const parsed = Number(value);
    return Number.isFinite(parsed)
        ? parsed.toLocaleString("en-PH", { maximumFractionDigits: 6 })
        : "Not recorded";
}

function duration(hours: number | null | undefined): string {
    const parsedHours = Number(hours);
    if (!Number.isFinite(parsedHours) || parsedHours < 0) return "Not recorded";
    const seconds = Math.round(parsedHours * 3600);
    const hh = String(Math.floor(seconds / 3600)).padStart(2, "0");
    const mm = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
    const ss = String(seconds % 60).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
}

function emptyRow(columns: number, message: string): string {
    return `<tr><td colspan="${columns}" class="empty">${escapeHtml(message)}</td></tr>`;
}

function buildRouteRows(routes: ShiftClosureReportRoute[]): string {
    if (routes.length === 0) return emptyRow(8, "No route steps are available for this Job Order.");
    return routes.map((route) => `
        <tr>
            <td class="center">${quantity(route.sequence)}</td>
            <td>${text(route.operation)}</td>
            <td>${text(route.status)}</td>
            <td>${text(route.workCenterName)}<div class="small muted">${text(route.workCenterId)}</div></td>
            <td>${text(route.machineName)}<div class="small muted">${text(route.machineId)}${route.machineDetails ? ` · ${text(route.machineDetails)}` : ""}</div></td>
            <td class="right">${duration(route.plannedSetupHours)} / ${duration(route.actualSetupHours)}</td>
            <td class="right">${duration(route.plannedRunHours)} / ${duration(route.actualRunHours)}</td>
            <td>${text(route.qaStatus)}</td>
        </tr>`).join("");
}

function buildOperatorRows(operators: ShiftClosureReportOperator[]): string {
    if (operators.length === 0) return emptyRow(8, "No operator timer records are available for this session.");
    return operators.map((operator) => `
        <tr>
            <td><strong>${text(operator.name)}</strong><div class="small muted">${text(operator.role)}</div></td>
            <td>${text(operator.route)}</td>
            <td>${text(operator.workstation)}</td>
            <td>${text(operator.timeIn)}</td>
            <td>${text(operator.timeOut, operator.isActive ? "Active at report time" : "Not recorded")}</td>
            <td class="center">${duration(operator.durationHours)}</td>
            <td class="signature-cell"></td>
            <td class="signature-cell"></td>
        </tr>`).join("");
}

function buildMaterialRows(materials: ShiftClosureReportMaterial[]): string {
    if (materials.length === 0) return emptyRow(8, "No raw materials were consumed.");
    return materials.map((material) => `
        <tr>
            <td>${text(material.productName)}</td>
            <td>${text(material.unit)}</td>
            <td>${text(material.mmLot)}</td>
            <td>${text(material.inventoryLot)}</td>
            <td>${text(material.batchNo)}</td>
            <td class="right">${quantity(material.standardQuantity)}</td>
            <td class="right">${quantity(material.actualQuantity)}</td>
            <td class="right">${quantity(material.actualQuantity - material.standardQuantity)}</td>
        </tr>`).join("");
}

function buildBreakdownRows(breakdowns: ShiftClosureReportBreakdown[]): string {
    if (breakdowns.length === 0) return emptyRow(8, "No workstation breakdown events were recorded for this Job Order.");
    return breakdowns.map((breakdown) => `
        <tr>
            <td>${text(breakdown.timestamp)}</td>
            <td>${text(breakdown.step)}</td>
            <td>${text(breakdown.workstation)}<div class="small muted">${text(breakdown.machineId)}</div></td>
            <td class="right">${breakdown.reportedYield === null ? "Not recorded" : quantity(breakdown.reportedYield)}</td>
            <td>${text(breakdown.reason)}</td>
            <td>${text(breakdown.reportedBy)}</td>
            <td colspan="2">${breakdown.evidenceFiles.length > 0 ? breakdown.evidenceFiles.map(escapeHtml).join("<br>") : "No evidence file recorded"}</td>
        </tr>`).join("");
}

function documentShell(title: string, body: string): string {
    return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
    @page { size: portrait; margin: 12mm; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 18px; color: #171717; font: 10px/1.4 'Segoe UI', Arial, sans-serif; }
    .preview-controls { display: flex; justify-content: flex-end; gap: 8px; margin-bottom: 14px; }
    .preview-controls button { border: 1px solid #cbd5e1; border-radius: 6px; background: #fff; padding: 8px 12px; color: #171717; font: inherit; font-weight: 700; cursor: pointer; }
    .company { font-size: 15px; font-weight: 900; letter-spacing: .6px; text-transform: uppercase; }
    .subtitle { margin-top: 3px; color: #525252; font-size: 11px; }
    .header { display: flex; justify-content: space-between; gap: 16px; border-bottom: 3px solid #1e40af; padding-bottom: 12px; }
    .job-order { text-align: right; }
    .job-order strong { display: block; font: 800 16px Consolas, monospace; }
    .doc-control { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px 18px; margin: 12px 0 16px; padding: 8px 10px; border: 1px solid #d1d5db; border-radius: 6px; background: #f9fafb; color: #374151; }
    .summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin-bottom: 16px; }
    .summary-item { min-height: 42px; padding: 7px 8px; border: 1px solid #d1d5db; border-radius: 5px; }
    .label { display: block; margin-bottom: 2px; color: #6b7280; font-size: 8px; font-weight: 800; text-transform: uppercase; }
    .value { font-weight: 700; }
    h2 { margin: 16px 0 7px; padding-bottom: 4px; border-bottom: 1px solid #9ca3af; font-size: 11px; font-weight: 900; text-transform: uppercase; break-after: avoid; }
    table { width: 100%; margin-bottom: 10px; border-collapse: collapse; font-size: 8px; }
    thead { display: table-header-group; }
    th, td { padding: 5px; border: 1px solid #d1d5db; vertical-align: top; }
    th { background: #f3f4f6; font-weight: 800; text-align: left; text-transform: uppercase; }
    tr { break-inside: avoid; }
    .small { font-size: 7px; }
    .muted { color: #6b7280; }
    .center { text-align: center; }
    .right { text-align: right; white-space: nowrap; }
    .empty { padding: 10px; color: #6b7280; font-style: italic; text-align: center; }
    .notes { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .note { min-height: 38px; padding: 7px; border: 1px solid #d1d5db; white-space: pre-wrap; }
    .signature-cell { min-width: 72px; height: 26px; }
    .approval-signatures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; margin-top: 20px; break-inside: avoid; }
    .approval-signature { padding-top: 24px; border-bottom: 1px solid #6b7280; text-align: center; }
    .approval-signature span { display: block; margin-top: 4px; color: #525252; font-size: 8px; font-weight: 700; text-transform: uppercase; }
    .warning { margin: 8px 0; padding: 7px; border: 1px solid #f59e0b; background: #fffbeb; color: #92400e; }
    @media print { body { padding: 0; } .preview-controls { display: none !important; } * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } }
</style></head><body>${body}</body></html>`;
}

export function buildShiftClosureReportHtml(data: ShiftClosureReportData): string {
    const title = `Shift Closure Report - ${data.jobOrderNo}`;
    const warning = data.workstationMetadataUnavailable
        ? `<div class="warning">Some workstation asset details could not be loaded. Route workstation names and IDs are shown where available.</div>`
        : "";
    const currentEvidence = data.currentEvidenceFiles.length > 0
        ? data.currentEvidenceFiles.map(escapeHtml).join("<br>")
        : "No shift evidence file attached";

    return documentShell(title, `
        <div class="preview-controls"><strong>Shift Closure Report Preview</strong><div><button type="button" onclick="window.print()">Print Report</button> <button type="button" onclick="window.close()">Close Preview</button></div></div>
        <header class="header">
            <div><div class="company">VERTEX TECH CORP · VOS ERP</div><div class="subtitle">Manufacturing Operations · Shift Run Closure &amp; Backflushing Report</div></div>
            <div class="job-order"><span class="label">Job Order</span><strong>${text(data.jobOrderNo)}</strong><span>${text(data.jobOrderStatus)}</span></div>
        </header>
        <div class="doc-control">
            <span>Document No.: <strong>${text(data.documentNo)}</strong></span><span>Revision: <strong>${text(data.revision)}</strong></span>
            <span>Branch: <strong>${text(data.branch)}</strong></span><span>Printed: <strong>${text(data.printedAt)}</strong></span>
        </div>
        <div class="summary">
            <div class="summary-item"><span class="label">Finished Good</span><span class="value">${text(data.productName)}</span></div>
            <div class="summary-item"><span class="label">Target Output</span><span class="value">${quantity(data.targetQuantity)} ${text(data.outputUnit)}</span></div>
            <div class="summary-item"><span class="label">Production Day / Shift</span><span class="value">Day ${text(data.productionDay)} · ${text(data.shiftName)}</span></div>
            <div class="summary-item"><span class="label">Production Date</span><span class="value">${text(data.productionDate)}</span></div>
            <div class="summary-item"><span class="label">Good Output</span><span class="value">${quantity(data.goodQuantity)} ${text(data.outputUnit)}</span></div>
            <div class="summary-item"><span class="label">Rejected Output</span><span class="value">${quantity(data.rejectedQuantity)} ${text(data.outputUnit)}</span></div>
            <div class="summary-item"><span class="label">Output Lot / Batch</span><span class="value">${text(data.outputBatchStatus)}</span></div>
            <div class="summary-item"><span class="label">Session Key</span><span class="value">${text(data.sessionKey)}</span></div>
        </div>
        ${warning}
        <h2>Route Execution &amp; Workstation Assignment</h2>
        <table><thead><tr><th>Step</th><th>Operation</th><th>Status</th><th>Workstation</th><th>Machine / Asset</th><th>Setup Planned / Actual</th><th>Run Planned / Actual</th><th>QA Status</th></tr></thead><tbody>${buildRouteRows(data.routes)}</tbody></table>
        <h2>Operator Timer Records &amp; Sign-Off</h2>
        <table><thead><tr><th>Operator / Role</th><th>Route Step</th><th>Workstation</th><th>Time In (PHT)</th><th>Time Out (PHT)</th><th>Consumed</th><th>Operator Signature</th><th>Date</th></tr></thead><tbody>${buildOperatorRows(data.operators)}</tbody></table>
        <h2>Exact WIP Reservation Consumption</h2>
        <table><thead><tr><th>Material</th><th>UOM</th><th>MM Lot</th><th>Inventory Lot</th><th>Batch No.</th><th>Standard Qty</th><th>Actual Qty</th><th>Variance</th></tr></thead><tbody>${buildMaterialRows(data.materials)}</tbody></table>
        <h2>Rejected Output Details</h2>
        <div class="notes"><div class="note"><span class="label">Rejection Reason</span>${text(data.rejectionReason, "No defect / standard run")}</div><div class="note"><span class="label">Rejection Remarks</span>${text(data.rejectionRemarks)}</div></div>
        <h2>Workstation Breakdown Log</h2>
        <table><thead><tr><th>Date / Time (PHT)</th><th>Route Step</th><th>Workstation / Machine</th><th>Reported Yield</th><th>Breakdown Reason</th><th>Reported By</th><th colspan="2">Evidence Files</th></tr></thead><tbody>${buildBreakdownRows(data.breakdowns)}</tbody></table>
        <h2>Session Notes &amp; Evidence</h2>
        <div class="notes"><div class="note"><span class="label">Session Remarks</span>${text(data.sessionRemarks)}</div><div class="note"><span class="label">Variance Reason</span>${text(data.varianceReason)}</div><div class="note"><span class="label">Shift Evidence Attachment</span>${currentEvidence}</div><div class="note"><span class="label">QA Traceability</span>Finished output lot/batch is assigned during In-Process QA when not recorded above.</div></div>
        <div class="approval-signatures"><div class="approval-signature"><span>Production Supervisor</span></div><div class="approval-signature"><span>QA Inspector</span></div><div class="approval-signature"><span>Warehouse Custodian</span></div></div>
    `);
}

export function buildShiftClosureReportLoadingHtml(jobOrderNo: string): string {
    return documentShell(`Shift Closure Report - ${jobOrderNo}`, `<div class="company">VERTEX TECH CORP · VOS ERP</div><h1>Preparing Shift Closure Report</h1><p>Loading required Job Order breakdown history. The report will be available when the audit data is ready.</p>`);
}

export function buildShiftClosureReportErrorHtml(jobOrderNo: string, message: string): string {
    return documentShell(`Shift Closure Report - ${jobOrderNo}`, `<div class="company">VERTEX TECH CORP · VOS ERP</div><h1>Shift Closure Report Unavailable</h1><p>${escapeHtml(message)}</p><p>Close this preview and retry Print Report from the terminal.</p><div class="preview-controls"><button type="button" onclick="window.close()">Close Preview</button></div>`);
}
