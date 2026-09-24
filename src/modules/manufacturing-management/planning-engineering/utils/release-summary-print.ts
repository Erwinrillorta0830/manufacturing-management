import { formatProductionValue } from "./production-timing";
import { formatManufacturingUnitCostForDisplay } from "./cogs-helper";

export interface ReleaseSummaryComponent {
    name: string;
    code: string;
    category: string;
    uom: string;
    kilogramsPerUnit?: number | null;
    needed: number;
    demandNeeded: number;
    available: number;
    sufficient: boolean;
}

export interface ReleaseSummaryRoutingStep {
    sequence: number;
    operation: string;
    workCenter: string;
    hours: number;
    operators: string[];
}

export interface ReleaseSummaryFinancials {
    materials: number;
    directLabor: number;
    machineOverhead: number;
    configuredOverhead: number;
    configuredOverheadBasis: string;
    baseCogs: number;
    adjustedCogs: number;
}

export interface ReleaseSummaryPrintData {
    joNumber: string;
    productName: string;
    recipeVersion: string;
    branchName: string;
    targetQuantity: number;
    uom: string;
    plannedDate: string;
    dueDate: string;
    shiftHours: string;
    targetDurationHours: number;
    consolidatedOrders: string[];
    remarks: string;
    components: ReleaseSummaryComponent[];
    routingSteps: ReleaseSummaryRoutingStep[];
    financials: ReleaseSummaryFinancials | null;
    allChecksPassed: boolean;
}

function formatQuantity(value: number): string {
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatComponentQuantity(value: number, uom: string, kilogramsPerUnit?: number | null): string {
    const primary = `${formatQuantity(value)} ${uom}`;
    const factor = Number(kilogramsPerUnit);
    const normalizedUom = uom.trim().toLowerCase();
    if (!Number.isFinite(factor) || factor <= 0 || normalizedUom === "kg" || normalizedUom.includes("kilogram")) {
        return primary;
    }
    return `${primary} (≈ ${formatQuantity(value * factor)} kg)`;
}

function formatMoney(value: number): string {
    return `₱${formatProductionValue(value)}`;
}

function formatUnitCost(value: number): string {
    return `₱${formatManufacturingUnitCostForDisplay(value)}`;
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

/**
 * Builds the printable Release Production Run summary sheet. Mirrors the
 * existing print-window markup used by the JO procurement request so the
 * review step can print without a dedicated PDF service.
 */
export function buildReleaseSummaryHtml(data: ReleaseSummaryPrintData): string {
    const componentRows = data.components.length === 0
        ? `<tr><td colspan="6" style="padding: 10px 8px; text-align: center; color: #64748b;">No raw material requirements specified.</td></tr>`
        : data.components.map(component => `
                            <tr>
                                <td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; font-weight: bold;">
                                    ${escapeHtml(component.name)}
                                    ${component.code ? `<div style="font-size: 9px; color: #64748b; font-weight: normal; margin-top: 1px;">${escapeHtml(component.code)}</div>` : ""}
                                </td>
                                <td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; color: #475569;">${escapeHtml(component.category)}</td>
                                <td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; text-align: right;">${escapeHtml(formatComponentQuantity(component.demandNeeded, component.uom, component.kilogramsPerUnit))}</td>
                                <td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; text-align: right;">${escapeHtml(formatComponentQuantity(component.needed, component.uom, component.kilogramsPerUnit))}</td>
                                <td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; text-align: right; color: #64748b;">${escapeHtml(formatComponentQuantity(component.available, component.uom, component.kilogramsPerUnit))}</td>
                                <td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; text-align: center; font-weight: bold; color: ${component.sufficient ? "#059669" : "#e11d48"};">
                                    ${component.sufficient ? "Sufficient" : "Insufficient"}
                                </td>
                            </tr>`).join("");

    const routingRows = data.routingSteps.length === 0
        ? `<tr><td colspan="5" style="padding: 10px 8px; text-align: center; color: #64748b;">No routing steps defined.</td></tr>`
        : data.routingSteps.map(step => `
                            <tr>
                                <td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; font-weight: bold;">Step ${step.sequence}</td>
                                <td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0;">${escapeHtml(step.operation)}</td>
                                <td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; color: #475569;">${escapeHtml(step.workCenter)}</td>
                                <td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; text-align: right;">${formatProductionValue(step.hours)} hrs</td>
                                <td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; color: #475569;">${step.operators.length > 0 ? escapeHtml(step.operators.join(", ")) : "—"}</td>
                            </tr>`).join("");

    const financialRows = data.financials
        ? `
                            <tr>
                                <td style="padding: 5px 8px;">Direct Materials / unit</td>
                                <td style="padding: 5px 8px; text-align: right;">${formatMoney(data.financials.materials)}</td>
                            </tr>
                            <tr>
                                <td style="padding: 5px 8px;">Direct Labor / unit</td>
                                <td style="padding: 5px 8px; text-align: right;">${formatMoney(data.financials.directLabor)}</td>
                            </tr>
                            <tr>
                                <td style="padding: 5px 8px;">Machine &amp; Routing Overhead / unit</td>
                                <td style="padding: 5px 8px; text-align: right;">${formatMoney(data.financials.machineOverhead)}</td>
                            </tr>
                            <tr>
                                <td style="padding: 5px 8px;">Configured Factory Overhead / unit <span style="font-size: 9px; color: #64748b;">(${escapeHtml(data.financials.configuredOverheadBasis)})</span></td>
                                <td style="padding: 5px 8px; text-align: right;">${formatMoney(data.financials.configuredOverhead)}</td>
                            </tr>
                            <tr>
                                <td style="padding: 5px 8px; font-weight: bold;">Est. Unit COGS (Base)</td>
                                <td style="padding: 5px 8px; text-align: right; font-weight: bold;">${formatUnitCost(data.financials.baseCogs)}</td>
                            </tr>
                            <tr>
                                <td style="padding: 5px 8px; font-weight: bold; color: #0369a1;">Est. Unit COGS (Yield-Adjusted)</td>
                                <td style="padding: 5px 8px; text-align: right; font-weight: bold; color: #0369a1;">${formatUnitCost(data.financials.adjustedCogs)}</td>
                            </tr>`
        : `<tr><td colspan="2" style="padding: 8px; text-align: center; color: #64748b;">Costing data unavailable.</td></tr>`;

    const statusLine = data.allChecksPassed
        ? `<span style="color: #059669; font-weight: bold;">All checks passed. Ready for picking.</span>`
        : `<span style="color: #b45309; font-weight: bold;">Shortfalls detected — child job orders / procurement requests will be generated.</span>`;

    return `
            <html>
                <head>
                    <title>Release Production Run Summary - ${escapeHtml(data.joNumber)}</title>
                    <style>
                        @page { size: portrait; margin: 10mm; }
                        body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; margin: 0; padding: 10px; line-height: 1.4; font-size: 11px; }
                        .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #334155; padding-bottom: 12px; margin-bottom: 15px; }
                        .title { font-size: 18px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px; }
                        .meta-info { font-size: 11px; line-height: 1.5; text-align: right; color: #475569; }
                        .jo-summary { background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 15px; margin-bottom: 15px; }
                        .jo-summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; font-size: 11px; }
                        .jo-summary-label { font-weight: bold; color: #64748b; font-size: 9px; text-transform: uppercase; margin-bottom: 2px; }
                        .jo-summary-value { font-weight: 700; color: #0f172a; font-size: 12px; }
                        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 11px; }
                        th { background-color: #f1f5f9; color: #1e293b; padding: 6px 8px; font-weight: bold; text-transform: uppercase; font-size: 9px; letter-spacing: 0.5px; border-bottom: 2px solid #cbd5e1; }
                        .footer { border-top: 1px solid #e2e8f0; padding-top: 10px; font-size: 9px; color: #64748b; display: flex; justify-content: space-between; margin-top: 25px; }
                        @media print {
                            body { padding: 0; margin: 0; font-size: 10px; }
                            .no-print { display: none !important; }
                            * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                            tr { page-break-inside: avoid; }
                        }
                    </style>
                </head>
                <body onload="window.print(); window.close()">
                    <div class="header">
                        <div>
                            <div class="title">Release Production Run Summary</div>
                            <div style="font-size: 11px; color: #64748b; margin-top: 3px;">Generated by Quality &amp; Production Planning Console</div>
                        </div>
                        <div class="meta-info">
                            <div><strong>Generated:</strong> ${new Date().toLocaleString()}</div>
                            <div><strong>Target Branch:</strong> ${escapeHtml(data.branchName)}</div>
                            <div><strong>Job Order:</strong> ${escapeHtml(data.joNumber)}</div>
                        </div>
                    </div>

                    <div class="jo-summary">
                        <div class="jo-summary-grid">
                            <div>
                                <div class="jo-summary-label">Product</div>
                                <div class="jo-summary-value">${escapeHtml(data.productName)}</div>
                            </div>
                            <div>
                                <div class="jo-summary-label">Recipe Version</div>
                                <div class="jo-summary-value">${escapeHtml(data.recipeVersion)}</div>
                            </div>
                            <div>
                                <div class="jo-summary-label">Target Quantity</div>
                                <div class="jo-summary-value">${data.targetQuantity.toLocaleString()} ${escapeHtml(data.uom)}</div>
                            </div>
                            <div>
                                <div class="jo-summary-label">Planned / Due Date</div>
                                <div class="jo-summary-value">${escapeHtml(data.plannedDate || "Not set")} / ${escapeHtml(data.dueDate || "Not set")}</div>
                            </div>
                            <div>
                                <div class="jo-summary-label">Target Duration</div>
                                <div class="jo-summary-value">${formatProductionValue(data.targetDurationHours)} hrs (Shift: ${escapeHtml(data.shiftHours)} hrs)</div>
                            </div>
                            <div>
                                <div class="jo-summary-label">Consolidated Orders</div>
                                <div class="jo-summary-value">${data.consolidatedOrders.length > 0 ? escapeHtml(data.consolidatedOrders.join(", ")) : "—"}</div>
                            </div>
                        </div>
                        ${data.remarks ? `<div style="margin-top: 10px; font-size: 10px; color: #475569;"><strong>Remarks:</strong> ${escapeHtml(data.remarks)}</div>` : ""}
                    </div>

                    <h3 style="font-size: 12px; text-transform: uppercase; border-bottom: 2px solid #e2e8f0; padding-bottom: 5px; margin-bottom: 10px; color: #0f172a;">Component Sufficiency Summary</h3>
                    <table>
                        <thead>
                            <tr>
                                <th style="text-align: left; padding: 6px 8px;">Component</th>
                                <th style="text-align: left; padding: 6px 8px;">Category</th>
                                <th style="width: 14%; text-align: right; padding: 6px 8px;">Demand Qty</th>
                                <th style="width: 14%; text-align: right; padding: 6px 8px;">Planned Qty</th>
                                <th style="width: 16%; text-align: right; padding: 6px 8px;">Available</th>
                                <th style="width: 14%; text-align: center; padding: 6px 8px;">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${componentRows}
                        </tbody>
                    </table>

                    <h3 style="font-size: 12px; text-transform: uppercase; border-bottom: 2px solid #e2e8f0; padding-bottom: 5px; margin-bottom: 10px; color: #0f172a;">Routing Steps &amp; Financial Sanity Check</h3>
                    <table>
                        <thead>
                            <tr>
                                <th style="width: 10%; text-align: left; padding: 6px 8px;">Step</th>
                                <th style="text-align: left; padding: 6px 8px;">Operation</th>
                                <th style="text-align: left; padding: 6px 8px;">Work Center</th>
                                <th style="width: 14%; text-align: right; padding: 6px 8px;">Est. Hours</th>
                                <th style="width: 26%; text-align: left; padding: 6px 8px;">Assigned Operators</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${routingRows}
                        </tbody>
                    </table>

                    <table style="width: 60%; margin-left: auto;">
                        <tbody>
                            ${financialRows}
                        </tbody>
                    </table>

                    <div class="footer">
                        <span>${statusLine}</span>
                        <span>Step 4 of 4 · Review &amp; Confirm</span>
                    </div>
                </body>
            </html>
        `;
}
