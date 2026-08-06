// VOS ERP - Planning Directus API Service

export interface DirectusJobOrder {
    jo_id: string;
    due_date?: string | null;
    status: string;
    is_batched: boolean;
    procurement_status: string;
    branch_id?: number | null;
    assigned_personnel?: unknown;
    product_id?: number | null;
    product_name?: string | null;
    quantity?: number;
    bom?: unknown;
    components?: unknown;
    routings?: unknown;
    allocation_results?: unknown;
    products?: {
        product_id?: number | null;
        product_name?: string | null;
        quantity?: number;
        bom?: unknown;
        components?: unknown;
        routings?: unknown;
        allocation_results?: unknown;
    }[];
    sales_orders?: unknown[];
    [key: string]: unknown;
}

import {
    fetchJobOrders as _fetchJobOrders,
    createJobOrder as _createJobOrder,
    modifyJobOrder as _modifyJobOrder,
    deleteJobOrder as _deleteJobOrder
} from "../planning-engineering/planning-helper";

export {
    _fetchJobOrders as fetchJobOrders,
    _createJobOrder as createJobOrder,
    _modifyJobOrder as updateJobOrder,
    _modifyJobOrder as modifyJobOrder,
    _deleteJobOrder as deleteJobOrder
};
