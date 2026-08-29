export type SalesOrderStatus =
    | "Draft"
    | "Pending"
    | "For Approval"
    | "For Production"
    | "On Hold"
    | "For Invoicing"
    | "For Consolidation"
    | "In Production"
    | "For Picking"
    | "For Loading"
    | "For Shipping"
    | "En Route"
    | "Partially Delivered"
    | "Delivered"
    | "Not Fulfilled"
    | "For Cancellation"
    | "Cancelled";

export const SALES_ORDER_TRANSITIONS: Record<SalesOrderStatus, SalesOrderStatus[]> = {
    Draft: ["For Approval", "Cancelled"],
    Pending: ["Draft", "Cancelled"],
    "For Approval": ["For Invoicing", "On Hold", "Draft", "Cancelled"],
    "For Production": ["In Production", "Cancelled"],
    "On Hold": ["For Approval", "Draft", "Cancelled"],
    "For Invoicing": ["For Consolidation", "Cancelled"],
    "For Consolidation": ["For Picking", "Cancelled"],
    "In Production": ["For Invoicing"],
    "For Picking": ["For Loading", "Cancelled"],
    "For Loading": ["For Shipping", "Cancelled"],
    "For Shipping": ["En Route", "Cancelled"],
    "En Route": ["Delivered", "Partially Delivered"],
    "Partially Delivered": ["Delivered", "Cancelled"],
    Delivered: [],
    "Not Fulfilled": [],
    "For Cancellation": ["Cancelled"],
    Cancelled: [],
};

export const LEGACY_STATUS_MAP: Record<string, SalesOrderStatus> = {
    Pending: "Draft",
    Approved: "For Invoicing",
    Invoiced: "For Invoicing",
    "Ready for Dispatch": "For Loading",
    "Delivery Failed": "Not Fulfilled",
    Returned: "Not Fulfilled",
    "Partially Returned": "Partially Delivered",
};

export function mapStatus(raw: string): SalesOrderStatus {
    return LEGACY_STATUS_MAP[raw] ?? (raw as SalesOrderStatus);
}
