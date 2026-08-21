"use client";

// 🚀 FIX: Added COADto to the imports!
import {
    Disbursement,
    DisbursementPayload,
    PaymentAllocationPayload,
    PaginatedResponse,
    SupplierDto,
    COADto,
    BankAccountDto,
    UnpaidPoDto,
    MemoDto,
    DivisionDto,
    DepartmentDto,
    DisbursementDashboardData,
    DashboardFilters
} from "../types";

const API_BASE = "/api/manufacturing/financial-management/cash-issuance/disbursements";
const SUPPLIER_API_BASE = "/api/manufacturing/financial-management/cash-issuance/suppliers";

export class DisbursementRequestError extends Error {
    readonly code?: string;
    readonly detail?: string;
    readonly nextDocNo?: string;
    readonly statusCode?: number;

    constructor(message: string, code?: string, nextDocNo?: string, detail?: string, statusCode?: number) {
        super(message);
        this.name = "DisbursementRequestError";
        this.code = code;
        this.detail = detail;
        this.nextDocNo = nextDocNo;
        this.statusCode = statusCode;
    }
}

const toStoredSupplierType = (type: string) =>
    type.toUpperCase().startsWith("NON") ? "NON-TRADE" : "TRADE";

export const disbursementProvider = {
    getDisbursements: async (
        page: number = 0, size: number = 20, type: string = "All",
        supplier: string = "", startDate: string = "", endDate: string = "",
        status: string = "All", divisionId: string = "", departmentId: string = "", docNo: string = ""
    ): Promise<PaginatedResponse<Disbursement>> => {
        const isWerFilter = type.trim().toUpperCase() === "WER";
        const transactionType = isWerFilter ? "All" : type;
        let url = `${API_BASE}?page=${page}&size=${size}&type=${encodeURIComponent(transactionType)}&status=${encodeURIComponent(status)}`;
        if (isWerFilter) url += "&source=WER";
        if (supplier) url += `&supplier=${encodeURIComponent(supplier)}`;
        if (startDate) url += `&startDate=${encodeURIComponent(startDate)}`;
        if (endDate) url += `&endDate=${encodeURIComponent(endDate)}`;
        if (divisionId) url += `&divisionId=${divisionId}`;
        if (departmentId) url += `&departmentId=${departmentId}`;
        const normalizedDocNo = docNo.trim();
        if (normalizedDocNo) url += `&docNo=${encodeURIComponent(normalizedDocNo)}`;

        const res = await fetch(url);
        if (!res.ok) throw new Error("Failed to fetch disbursements");
        return res.json();
    },

    createDisbursement: async (payload: DisbursementPayload): Promise<Disbursement> => {
        const res = await fetch(API_BASE, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify(payload),
        });
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new DisbursementRequestError(
                errData.detail || errData.message || "Failed to create disbursement",
                typeof errData.code === "string" ? errData.code : undefined,
                typeof errData.nextDocNo === "string" ? errData.nextDocNo : undefined,
            );
        }
        return res.json();
    },

    updateStatus: async (id: number, status: string): Promise<Disbursement> => {
        const res = await fetch(`${API_BASE}/${id}/status?status=${encodeURIComponent(status)}`, {
            method: "PATCH",
        });
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            const message = typeof errData.message === "string"
                ? errData.message
                : typeof errData.error === "string"
                    ? errData.error
                    : "Failed to update status";
            const detail = typeof errData.detail === "string" ? errData.detail : undefined;

            throw new DisbursementRequestError(message, undefined, undefined, detail, res.status);
        }
        return res.json();
    },

    // 🚀 Fetch Suppliers for the Dropdown
    getSuppliers: async (type: string = "Trade"): Promise<SupplierDto[]> => {
        const res = await fetch(`${SUPPLIER_API_BASE}?type=${encodeURIComponent(toStoredSupplierType(type))}`);
        if (!res.ok) throw new Error("Failed to fetch suppliers");
        return res.json();
    },

    createPayee: async (payload: {
        supplier_name: string;
        supplier_type: "TRADE" | "NON-TRADE";
        tin_number: string;
        bank_details?: string;
        email_address?: string;
        phone_number?: string;
    }): Promise<SupplierDto> => {
        const res = await fetch("/api/manufacturing/financial-management/cash-issuance/payees", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify(payload),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || "Failed to create payee");
        return json.data as SupplierDto;
    },

    // 🚀 Fetch COAs for the Line Items
    getCOAs: async (): Promise<COADto[]> => {
        const res = await fetch("/api/manufacturing/financial-management/cash-issuance/coas");
        if (!res.ok) throw new Error("Failed to fetch COAs");
        return res.json();
    },

    // 🚀 Fetch COAs restricted to payable account types (3,4,7,8,9,10)
    getPayableCOAs: async (): Promise<COADto[]> => {
        const res = await fetch("/api/manufacturing/financial-management/cash-issuance/coas?forPayable=true");
        if (!res.ok) throw new Error("Failed to fetch payable COAs");
        return res.json();
    },

    getBanks: async (): Promise<BankAccountDto[]> => {
        const res = await fetch("/api/manufacturing/financial-management/cash-issuance/bank-accounts/active");
        if (!res.ok) throw new Error("Failed to fetch banks");
        return res.json();
    },

    updateDisbursement: async (id: number, payload: DisbursementPayload): Promise<Disbursement> => {
        const res = await fetch(`${API_BASE}/${id}`, {
            method: "PUT",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify(payload),
        });
        if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            throw new Error(errorData.detail || errorData.message || "Failed to update disbursement");
        }
        return res.json();
    },

    updatePaymentAllocation: async (id: number, payments: PaymentAllocationPayload["payments"]): Promise<Disbursement> => {
        const payload: PaymentAllocationPayload = {
            saveScope: "RELEASING_PAYMENT",
            payments,
        };
        const res = await fetch(`${API_BASE}/${id}`, {
            method: "PUT",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify(payload),
        });
        if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            throw new Error(errorData.detail || errorData.message || "Failed to save payment allocation");
        }
        return res.json();
    },

    getUnpaidPos: async (supplierId: number, signal?: AbortSignal): Promise<UnpaidPoDto[]> => {
        const res = await fetch(`${API_BASE}/unpaid-pos/${supplierId}`, {
            cache: "no-store",
            signal,
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
            throw new Error(data?.detail || data?.message || "Failed to fetch unpaid POs");
        }
        if (!Array.isArray(data)) throw new Error("Pending Records returned an invalid response");
        return data as UnpaidPoDto[];
    },

    getSupplierMemos: async (supplierId: number, signal?: AbortSignal): Promise<MemoDto[]> => {
        const res = await fetch(`${API_BASE}/memos/${supplierId}`, { signal });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.detail || data?.message || "Failed to fetch supplier memos");
        if (!Array.isArray(data)) throw new Error("Supplier memos returned an invalid response");
        return (data as MemoDto[]).filter((memo) => Number(memo.supplier_id) === Number(supplierId));
    },

    getDivisions: async (): Promise<DivisionDto[]> => {
        // Replace with your actual division API route if different
        const res = await fetch("/api/manufacturing/financial-management/cash-issuance/setup/divisions");
        if (!res.ok) throw new Error("Failed to fetch divisions");
        return res.json();
    },

    getDepartments: async (): Promise<DepartmentDto[]> => {
        // Replace with your actual department API route if different
        const res = await fetch("/api/manufacturing/financial-management/cash-issuance/setup/departments");
        if (!res.ok) throw new Error("Failed to fetch departments");
        return res.json();
    },

    getDashboardData: async (filters: DashboardFilters): Promise<DisbursementDashboardData> => {
        const params = new URLSearchParams();
        if (filters.startDate) params.append("startDate", filters.startDate);
        if (filters.endDate) params.append("endDate", filters.endDate);
        if (filters.status) params.append("status", filters.status);
        if (filters.payeeId) params.append("payeeId", filters.payeeId.toString());
        if (filters.transactionType) params.append("transactionType", filters.transactionType.toString()); // 🚀 NEW
        if (filters.encoderId) params.append("encoderId", filters.encoderId.toString());
        if (filters.coaId) params.append("coaId", filters.coaId.toString());
        if (filters.amount) params.append("amount", filters.amount.toString());
        if (filters.remarks) params.append("remarks", filters.remarks);
        if (filters.divisionId) params.append("divisionId", filters.divisionId.toString()); // 🚀 NEW

        const res = await fetch(`${API_BASE}/dashboard?${params.toString()}`);
        if (!res.ok) throw new Error("Failed to fetch dashboard data");
        return res.json();
    },

    getNextDocNo: async (supplierType: string = "Trade"): Promise<string> => {
        const res = await fetch(`${API_BASE}?nextDocNo=true&supplierType=${encodeURIComponent(supplierType)}`);
        if (!res.ok) throw new Error("Failed to fetch next doc no");
        const data = await res.json();
        return data.nextDocNo;
    }
};
