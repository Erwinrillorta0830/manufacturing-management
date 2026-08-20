import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { DisbursementDashboardData, DashboardFilters } from "../types";
import { toast } from "sonner";

export async function generateReportExcel(data: DisbursementDashboardData | null, filters: DashboardFilters) {
    if (!data || !data.vouchers || data.vouchers.length === 0) {
        toast.error("No disbursement data to export");
        return;
    }

    try {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet("Disbursements Report");

        // Set up thin border style
        const borderStyle: Partial<ExcelJS.Borders> = {
            top: { style: "thin", color: { argb: "FFD9D9D9" } },
            left: { style: "thin", color: { argb: "FFD9D9D9" } },
            bottom: { style: "thin", color: { argb: "FFD9D9D9" } },
            right: { style: "thin", color: { argb: "FFD9D9D9" } },
        };

        const totalCols = 9;

        // 1. BRANDING TITLE BANNER
        const titleRow = worksheet.addRow(["DISBURSEMENT ANALYSIS REPORT"]);
        titleRow.height = 35;
        worksheet.mergeCells(1, 1, 1, totalCols);
        titleRow.font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
        titleRow.alignment = { horizontal: "center", vertical: "middle" };
        titleRow.eachCell((c) => {
            c.fill = {
                type: "pattern",
                pattern: "solid",
                fgColor: { argb: "FF1E3A8A" }, // Dark Blue Primary
            };
        });

        // 2. FILTERS / METADATA INFO
        worksheet.addRow([]);
        const rangeText = `Date Range: ${filters.startDate || "N/A"} to ${filters.endDate || "N/A"}`;
        const generatedText = `Generated On: ${new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" })}`;
        
        const filterRow = worksheet.addRow([rangeText, "", "", "", "", "", "", generatedText]);
        worksheet.mergeCells(filterRow.number, 1, filterRow.number, 4);
        worksheet.mergeCells(filterRow.number, 8, filterRow.number, 9);
        filterRow.font = { bold: true, size: 10, color: { argb: "FF4B5563" } };
        
        worksheet.addRow([]);

        // 3. KPI METRICS SUMMARY BOX
        const kpiHeaderRow = worksheet.addRow(["TREASURY METRIC SUMMARY"]);
        kpiHeaderRow.height = 22;
        worksheet.mergeCells(kpiHeaderRow.number, 1, kpiHeaderRow.number, 4);
        kpiHeaderRow.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
        kpiHeaderRow.alignment = { horizontal: "left", vertical: "middle" };
        kpiHeaderRow.eachCell((c) => {
            c.fill = {
                type: "pattern",
                pattern: "solid",
                fgColor: { argb: "FF2563EB" }, // Blue
            };
        });

        const rate = data.totalDisbursed > 0 ? (data.totalPaid / data.totalDisbursed) * 100 : 0;
        
        const kpiRow1 = worksheet.addRow(["Total Liabilities Incurred:", data.totalDisbursed, "Treasury Payout Rate:", rate / 100]);
        kpiRow1.getCell(2).numFmt = "₱#,##0.00";
        kpiRow1.getCell(4).numFmt = "0.0%";
        kpiRow1.eachCell((c, i) => {
            c.border = borderStyle;
            if (i === 1 || i === 3) c.font = { bold: true };
        });

        const kpiRow2 = worksheet.addRow(["Total Cash Outflow (Paid):", data.totalPaid, "Outstanding Backlog:", data.totalUnpaidPayables]);
        kpiRow2.getCell(2).numFmt = "₱#,##0.00";
        kpiRow2.getCell(4).numFmt = "₱#,##0.00";
        kpiRow2.eachCell((c, i) => {
            c.border = borderStyle;
            if (i === 1 || i === 3) c.font = { bold: true };
        });

        worksheet.addRow([]);
        worksheet.addRow([]);

        // 4. MAIN DETAILS REGISTER
        const headerRow = worksheet.addRow([
            "VOUCHER NO",
            "TRANS DATE",
            "PAYEE / SUPPLIER",
            "STATUS",
            "TOTAL AMOUNT",
            "PAID AMOUNT",
            "BANKS",
            "CHECK NUMBERS",
            "EXPENSE ACCOUNTS ALLOCATED"
        ]);
        headerRow.height = 25;
        headerRow.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
        headerRow.alignment = { horizontal: "left", vertical: "middle" };
        headerRow.eachCell((c, idx) => {
            c.fill = {
                type: "pattern",
                pattern: "solid",
                fgColor: { argb: "FF374151" }, // Gray-700
            };
            if (idx === 5 || idx === 6) {
                c.alignment = { horizontal: "right", vertical: "middle" };
            } else if (idx === 4) {
                c.alignment = { horizontal: "center", vertical: "middle" };
            }
        });

        // Add records
        data.vouchers.forEach((v) => {
            const row = worksheet.addRow([
                v.docNo,
                v.transactionDate,
                v.payeeName.toUpperCase(),
                v.status.toUpperCase(),
                v.totalAmount,
                v.paidAmount,
                v.bankNames || "N/A",
                v.checkNumbers || "N/A",
                v.expenseAccountsHit || "N/A"
            ]);
            row.height = 20;
            
            // Format money columns
            row.getCell(5).numFmt = "₱#,##0.00";
            row.getCell(6).numFmt = "₱#,##0.00";

            row.eachCell((c, idx) => {
                c.border = borderStyle;
                c.font = { size: 9 };
                if (idx === 5 || idx === 6) {
                    c.alignment = { horizontal: "right" };
                } else if (idx === 4) {
                    c.alignment = { horizontal: "center" };
                }
            });
        });

        // Add Total row
        const totalRow = worksheet.addRow([
            "TOTALS",
            "",
            "",
            "",
            data.vouchers.reduce((s, v) => s + v.totalAmount, 0),
            data.vouchers.reduce((s, v) => s + v.paidAmount, 0),
            "",
            "",
            ""
        ]);
        totalRow.height = 22;
        totalRow.font = { bold: true, size: 10 };
        worksheet.mergeCells(totalRow.number, 1, totalRow.number, 4);
        totalRow.getCell(5).numFmt = "₱#,##0.00";
        totalRow.getCell(6).numFmt = "₱#,##0.00";
        totalRow.eachCell((c, idx) => {
            c.border = borderStyle;
            c.fill = {
                type: "pattern",
                pattern: "solid",
                fgColor: { argb: "FFF3F4F6" }, // Gray-100
            };
            if (idx === 5 || idx === 6) {
                c.alignment = { horizontal: "right" };
            }
        });

        // Set column widths
        worksheet.getColumn(1).width = 15; // docNo
        worksheet.getColumn(2).width = 12; // date
        worksheet.getColumn(3).width = 30; // payee
        worksheet.getColumn(4).width = 12; // status
        worksheet.getColumn(5).width = 18; // totalAmount
        worksheet.getColumn(6).width = 18; // paidAmount
        worksheet.getColumn(7).width = 15; // bankNames
        worksheet.getColumn(8).width = 18; // checkNumbers
        worksheet.getColumn(9).width = 35; // expenseAccountsHit

        const buffer = await workbook.xlsx.writeBuffer();
        const dateSuffix = new Date().toISOString().split("T")[0];
        saveAs(new Blob([buffer]), `Disbursements_Report_${dateSuffix}.xlsx`);
        toast.success("Excel report exported successfully");
    } catch (err: unknown) {
        console.error("Failed to generate excel report", err);
        toast.error("Failed to export Excel report");
    }
}
