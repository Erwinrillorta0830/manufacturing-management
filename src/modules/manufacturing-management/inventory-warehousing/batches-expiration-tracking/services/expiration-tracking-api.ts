import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import {
    BatchExpirationApiResponse,
    BatchExpirationFilters,
    BatchExpirationItem,
} from "../types";

export async function fetchBatchExpirations(
    filters: BatchExpirationFilters
): Promise<BatchExpirationApiResponse> {
    const params = new URLSearchParams();

    if (filters.branch_id !== "ALL") {
        params.set("branch", String(filters.branch_id));
    }
    if (filters.status !== "ALL") {
        params.set("status", filters.status);
    }
    if (filters.product_type !== "ALL") {
        params.set("product_type", filters.product_type);
    }
    params.set("only_on_hand", String(filters.only_with_on_hand));
    params.set("_t", String(Date.now()));

    const res = await fetch(
        `/api/manufacturing/inventory-warehousing/batches-expiration-tracking?${params.toString()}`,
        { cache: "no-store" }
    );

    if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${res.status}: Failed to fetch batch expirations`);
    }

    return await res.json();
}

/**
 * Client-side Excel (.xlsx) export generator for auditability & management reporting
 */
export function exportBatchExpirationsToExcel(items: BatchExpirationItem[]): void {
    if (!items || items.length === 0) {
        throw new Error("No batch records available to export");
    }

    const totalExposure = items.reduce((acc, curr) => acc + curr.inventory_value, 0);

    const headers = [
        "Expiration Status",
        "Days Left",
        "Item Code",
        "Product Name / Description",
        "Category",
        "Batch / Lot No",
        "Storage Bin / Lot",
        "Branch Location",
        "On-Hand Quantity",
        "UOM",
        "Unit Cost (PHP)",
        "Inventory Value (PHP)",
        "Manufacturing Date",
        "Expiry Date",
        "QA Status",
        "Registry Status",
    ];

    const defaultMinWidths = [18, 12, 16, 36, 18, 18, 18, 20, 16, 10, 16, 20, 16, 16, 12, 14];

    const dataRows = items.map((i) => [
        i.expiration_status,
        i.days_remaining !== null ? i.days_remaining : "N/A",
        i.product_code || "-",
        i.product_name,
        i.product_type_name || "-",
        i.batch_no || "-",
        i.lot_name || "-",
        i.branch_name || "-",
        Number(i.on_hand_quantity.toFixed(2)),
        i.unit_shortcut || i.unit_name || "PCS",
        Number(i.unit_cost.toFixed(2)),
        Number(i.inventory_value.toFixed(2)),
        i.manufacturing_date || "-",
        i.expiry_date || "-",
        i.qa_status || "GOOD",
        i.status || "ACTIVE",
    ]);

    // Calculate auto-fit column widths
    const colWidths = headers.map((header, colIdx) => {
        let maxLen = header.length;
        dataRows.forEach((row) => {
            const cellVal = row[colIdx];
            const str = cellVal != null ? String(cellVal) : "";
            if (str.length > maxLen) {
                maxLen = str.length;
            }
        });
        const minW = defaultMinWidths[colIdx] || 12;
        return { wch: Math.max(maxLen + 3, minW) };
    });

    const metaRows = [
        ["BATCH EXPIRATION & SHELF-LIFE AUDIT REPORT"],
        [`Generated On: ${new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}`],
        [`Total Batches Monitored: ${items.length}`],
        [`Total Inventory Value Exposure: PHP ${totalExposure.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
        [], // blank separator row before table headers
    ];

    const aoa = [...metaRows, headers, ...dataRows];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // Set auto-fit column widths
    ws["!cols"] = colWidths;

    XLSX.utils.book_append_sheet(wb, ws, "Batches Expiration");

    const dateSuffix = new Date().toISOString().split("T")[0];
    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([wbout], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    saveAs(blob, `Batch_Expiration_Tracking_${dateSuffix}.xlsx`);
}

/**
 * Backward compatibility fallback for CSV
 */
export function exportBatchExpirationsToCsv(items: BatchExpirationItem[]): void {
    exportBatchExpirationsToExcel(items);
}
