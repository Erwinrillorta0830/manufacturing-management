import { ScrapReportRow, ScrapSummaryKPIs, DefectCategorySummary } from "../types/scrap-rejection.types";
import { formatPHP } from "../services/scrap-rejection.helpers";

export function exportScrapPDF(
    rows: ScrapReportRow[],
    summary: ScrapSummaryKPIs,
    defectCategories: DefectCategorySummary[],
    activeFilterDescription?: string
) {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <title>Scrap & Rejection Analysis Report - ${new Date().toLocaleDateString()}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: #1e293b;
            margin: 0;
            padding: 24px;
            font-size: 11px;
        }
        h1 {
            font-size: 18px;
            margin: 0 0 4px 0;
            color: #0f172a;
        }
        .subtitle {
            font-size: 11px;
            color: #64748b;
            margin-bottom: 16px;
        }
        .kpi-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 12px;
            margin-bottom: 20px;
        }
        .kpi-card {
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            padding: 10px 12px;
            background: #f8fafc;
        }
        .kpi-title {
            font-size: 9px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: #64748b;
            font-weight: 600;
            margin-bottom: 4px;
        }
        .kpi-value {
            font-size: 15px;
            font-weight: 700;
            color: #0f172a;
        }
        .defect-section {
            margin-bottom: 20px;
        }
        .defect-title {
            font-size: 13px;
            font-weight: 600;
            margin-bottom: 8px;
        }
        .defect-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 10px;
            margin-bottom: 20px;
        }
        .defect-table th {
            background: #f1f5f9;
            padding: 6px 8px;
            text-align: left;
            border: 1px solid #cbd5e1;
        }
        .defect-table td {
            padding: 5px 8px;
            border: 1px solid #e2e8f0;
        }
        .main-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 9px;
        }
        .main-table th {
            background: #f1f5f9;
            padding: 6px 8px;
            text-align: left;
            border: 1px solid #cbd5e1;
            font-weight: 600;
        }
        .main-table td {
            padding: 5px 8px;
            border: 1px solid #e2e8f0;
        }
        .text-right {
            text-align: right;
        }
        .badge {
            display: inline-block;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 8px;
            font-weight: 600;
        }
        .badge-danger {
            background: #fee2e2;
            color: #991b1b;
        }
        .badge-warning {
            background: #fef3c7;
            color: #92400e;
        }
        .badge-success {
            background: #dcfce7;
            color: #166534;
        }
        @media print {
            body { padding: 0; }
            button { display: none; }
        }
    </style>
</head>
<body>
    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
        <div>
            <h1>Scrap & Rejection Analysis Report</h1>
            <div class="subtitle">Generated on ${new Date().toLocaleString()} ${activeFilterDescription ? `| ${activeFilterDescription}` : ""}</div>
        </div>
        <button onclick="window.print()" style="padding: 6px 14px; cursor: pointer; border-radius: 4px; border: 1px solid #cbd5e1; background: #fff; font-weight: 600;">Print / Save PDF</button>
    </div>

    <!-- Summary KPIs -->
    <div class="kpi-grid">
        <div class="kpi-card">
            <div class="kpi-title">Total Material Loss</div>
            <div class="kpi-value">${formatPHP(summary.total_material_loss_php)}</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-title">Overall Scrap Rate</div>
            <div class="kpi-value">${summary.overall_scrap_rate.toFixed(1)}% (${summary.total_scrapped_units.toLocaleString()} units)</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-title">Rework Hours & Cost</div>
            <div class="kpi-value">${summary.total_rework_hours.toFixed(1)} hrs (${formatPHP(summary.total_rework_labor_cost_php)})</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-title">Primary Defect Category</div>
            <div class="kpi-value">${summary.top_defect_category}</div>
        </div>
    </div>

    <!-- Top Defect Categories Table -->
    ${defectCategories.length > 0 ? `
    <div class="defect-section">
        <div class="defect-title">Top Defect Categories Breakdown</div>
        <table class="defect-table">
            <thead>
                <tr>
                    <th>Defect Category</th>
                    <th class="text-right">Inspection Incidents</th>
                    <th class="text-right">Rejected Units</th>
                    <th class="text-right">Share (%)</th>
                </tr>
            </thead>
            <tbody>
                ${defectCategories.map(c => `
                <tr>
                    <td><strong>${c.category}</strong></td>
                    <td class="text-right">${c.defectCount}</td>
                    <td class="text-right">${c.rejectedQuantity.toLocaleString()}</td>
                    <td class="text-right">${c.percentage.toFixed(1)}%</td>
                </tr>
                `).join("")}
            </tbody>
        </table>
    </div>
    ` : ""}

    <!-- Main Table -->
    <div>
        <div class="defect-title">Job Order Waste & Rework Summary (${rows.length} records)</div>
        <table class="main-table">
            <thead>
                <tr>
                    <th>JO #</th>
                    <th>Product</th>
                    <th>Branch</th>
                    <th>Status</th>
                    <th class="text-right">Produced Qty</th>
                    <th class="text-right">Scrap Qty</th>
                    <th class="text-right">Scrap Rate</th>
                    <th class="text-right">Material Loss</th>
                    <th class="text-right">Rework Hrs</th>
                    <th class="text-right">Rework Cost</th>
                    <th>Primary Defect Category</th>
                </tr>
            </thead>
            <tbody>
                ${rows.map(r => `
                <tr>
                    <td><strong>${r.job_order_no}</strong></td>
                    <td>${r.product_name} <br/><span style="color: #64748b;">${r.product_code}</span></td>
                    <td>${r.branch_name}</td>
                    <td>${r.status}</td>
                    <td class="text-right">${r.actual_quantity_produced.toLocaleString()}</td>
                    <td class="text-right">${r.scrap_quantity.toLocaleString()}</td>
                    <td class="text-right">
                        <span class="badge ${r.scrap_rate_percentage > 5 ? "badge-danger" : r.scrap_rate_percentage > 2 ? "badge-warning" : "badge-success"}">
                            ${r.scrap_rate_percentage.toFixed(1)}%
                        </span>
                    </td>
                    <td class="text-right"><strong>${formatPHP(r.material_loss_php)}</strong></td>
                    <td class="text-right">${r.rework_hours.toFixed(1)}</td>
                    <td class="text-right">${formatPHP(r.rework_labor_cost_php)}</td>
                    <td>${r.top_defect_category || "—"}</td>
                </tr>
                `).join("")}
            </tbody>
        </table>
    </div>
</body>
</html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
}
