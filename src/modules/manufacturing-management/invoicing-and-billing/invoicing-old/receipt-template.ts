import { ORTemplate } from "./types";

export const DEFAULT_RECEIPT_TEMPLATE: ORTemplate = {
    id: "default-official-receipt",
    name: "Default Official Receipt",
    width: 210,
    height: 265,
    fields: {
        customer_name: { x: 33, y: 30, fontSize: 11, fontFamily: "courier", fontWeight: "normal", label: "Customer Name" },
        date: { x: 180, y: 30, fontSize: 11, fontFamily: "courier", fontWeight: "normal", label: "Date" },
        store_name: { x: 45, y: 38, fontSize: 11, fontFamily: "courier", fontWeight: "normal", label: "Store Name" },
        payment_name: { x: 180, y: 38, fontSize: 11, fontFamily: "courier", fontWeight: "normal", label: "Terms" },
        customer_tin: { x: 20, y: 46, fontSize: 11, fontFamily: "courier", fontWeight: "normal", label: "TIN" },
        address: { x: 33, y: 55, fontSize: 11, fontFamily: "courier", fontWeight: "normal", label: "Address", maxWidth: 145 },
        vatable_sales: { x: 180, y: 145, fontSize: 10, fontFamily: "courier", fontWeight: "normal", label: "Vatable Sales" },
        vat_amount: { x: 180, y: 151, fontSize: 10, fontFamily: "courier", fontWeight: "normal", label: "VAT Amount" },
        gross_total: { x: 180, y: 157, fontSize: 11, fontFamily: "courier", fontWeight: "normal", label: "Gross Total" },
        discount_total: { x: 180, y: 163, fontSize: 10, fontFamily: "courier", fontWeight: "normal", label: "Discount Total" },
        net_total: { x: 180, y: 175, fontSize: 12, fontFamily: "courier", fontWeight: "bold", label: "Net Total" },
        po_no: { x: 10, y: 185, fontSize: 10, fontFamily: "courier", fontWeight: "normal", label: "PO Number" },
        salesman: { x: 10, y: 191, fontSize: 10, fontFamily: "courier", fontWeight: "normal", label: "Salesman" },
        total_amount_due: { x: 180, y: 200, fontSize: 12, fontFamily: "courier", fontWeight: "bold", label: "Total Amount Due" },
        barcode: { x: 155, y: 5, fontSize: 8, fontFamily: "courier", fontWeight: "normal", label: "Barcode", barcodeHeight: 9, barcodeModuleWidth: 0.35 },
    },
    tableSettings: {
        startY: 65,
        rowHeight: 12.2,
        fontSize: 10,
        product_name_width: 65,
        columns: {
            barcode: { x: 10 },
            product_name: { x: 35 },
            quantity: { x: 105 },
            unit_price: { x: 126 },
            discount: { x: 153 },
            net_amount: { x: 184 },
        },
    },
};

export function normalizeReceiptTemplate(template?: ORTemplate | null): ORTemplate {
    if (!template) return structuredClone(DEFAULT_RECEIPT_TEMPLATE);
    return {
        ...DEFAULT_RECEIPT_TEMPLATE,
        ...template,
        fields: { ...DEFAULT_RECEIPT_TEMPLATE.fields, ...template.fields },
        tableSettings: {
            ...DEFAULT_RECEIPT_TEMPLATE.tableSettings,
            ...template.tableSettings,
            columns: { ...DEFAULT_RECEIPT_TEMPLATE.tableSettings.columns, ...template.tableSettings?.columns },
        },
    };
}
