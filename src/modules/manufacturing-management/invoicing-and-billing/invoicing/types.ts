export interface InvoicingCandidate {
    order_id: number;
    order_no: string;
    po_no: string;
    customer_code: string;
    customer_name: string;
    branch_id: number;
    branch_name?: string;
    order_status: string;
    order_date: string;
    net_amount?: number;
    total_amount?: number;
    details: InvoicingLine[];
    stockStatus?: StockStatus;
}

export interface InvoicingLine {
    detail_id: number;
    product_id: number | { product_id: number; product_name: string; product_code: string; description?: string; uom?: string };
    ordered_quantity: number;
    unit_price: number;
    net_amount: number;
    bom_version_name?: string;
}

export interface CreateInvoicePayload {
    salesOrderId: number;
    invoiceNo: string;
    invoiceTypeId: number;
    invoiceDate: string;
    dueDate: string;
    remarks?: string;
}

export interface ReceiptType {
    id: number;
    type: string;
    isOfficial: boolean;
    maxLength: number;
}

export interface CreatedInvoiceResult {
    invoiceId: number;
    invoiceNo: string;
    transactionStatus: "Prepared";
    itemCount?: number;
    reservationCount?: number;
}

export interface PrintableInvoiceLine {
    detailId: number;
    productCode: string;
    productName: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    discountAmount: number;
    grossAmount: number;
    netAmount: number;
}

export interface ORFieldConfig {
    x: number;
    y: number;
    fontSize?: number;
    fontFamily?: 'courier' | 'helvetica' | 'times';
    fontWeight?: 'normal' | 'bold';
    label?: string;
    charSpacing?: number;
    scaleX?: number;
    maxWidth?: number;
    lineHeight?: number;
    hidden?: boolean;
    barcodeHeight?: number;
    barcodeModuleWidth?: number;
    hideBarcodeText?: boolean;
}

export interface ORTableSettings {
    startY: number;
    rowHeight: number;
    fontSize: number;
    product_name_width?: number;
    columns?: {
        barcode?: { x: number };
        product_name?: { x: number };
        quantity?: { x: number };
        unit_price?: { x: number };
        discount?: { x: number };
        net_amount?: { x: number };
    };
}

export interface ORTemplate {
    id?: string;
    name?: string;
    width: number;
    height: number;
    backgroundImage?: string;
    fields: Record<string, ORFieldConfig>;
    tableSettings: ORTableSettings;
}

export interface PrintableInvoice {
    invoiceId: number;
    invoiceNo: string;
    invoiceDate: string;
    dueDate: string;
    transactionStatus: string;
    receiptType: ReceiptType;
    orderNo: string;
    poNo: string;
    customerName: string;
    storeName: string;
    customerTin: string;
    customerAddress: string;
    salesmanName: string;
    paymentTermName: string;
    lines: PrintableInvoiceLine[];
    totals: { gross: number; discount: number; vat: number; net: number };
    templateConfig?: ORTemplate;
}

export interface CustomerGroup {
    customer_code: string;
    customer_name: string;
    order_count: number;
    total_amount: number;
    orders: InvoicingCandidate[];
}

export interface InvoicingFilters {
    search: string;
    customerCode: string;
    branchId: string;
    dateFrom: string;
    dateTo: string;
}

export interface BatchItem {
    inventoryLotId?: number;
    lotId: number;
    lotName?: string | null;
    batchNo: string;
    inventoryCondition: string;
    manufacturingDate?: string | null;
    expirationDate?: string | null;
    onhandQuantity: number;
}

export interface LineAvailability {
    productId: number;
    productName: string;
    productCode: string;
    unitId?: number;
    requiredQuantity: number;
    onhandQuantity: number;
    isAvailable: boolean;
    batches: BatchItem[];
}

export interface SalesOrderAvailability {
    salesOrderId: number;
    branchId: number;
    isFullyAvailable: boolean;
    lines: LineAvailability[];
}

export type StockStatus = "Available" | "Partial" | "Unavailable";

export interface Branch {
    id: number;
    branchName?: string;
    branch_name?: string;
    branchCode?: string;
    branch_code?: string;
}
