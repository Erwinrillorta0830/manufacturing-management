"use client";

import {useState, useCallback, useEffect, useRef} from "react";
import {Disbursement, DisbursementPayload, DisbursementStatusResult, DisbursementSubmitResult, PaymentLine, SupplierDto, DivisionDto, DepartmentDto} from "../types";
import {disbursementProvider, DisbursementRequestError} from "../providers/fetchProvider";
import {toast} from "sonner";

type AppliedListFilters = {
    supplierSearch: string;
    startDate: string;
    endDate: string;
    statusFilter: string;
    divisionFilter: string;
    departmentFilter: string;
    docNoSearch: string;
};

export function useCashIssuance(initialStatusFilter = "All") {
    const [data, setData] = useState<Disbursement[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const createRequestLockRef = useRef(false);
    const listRequestIdRef = useRef(0);

    const [page, setPage] = useState(0);
    const [size, setSize] = useState(20);
    const [totalPages, setTotalPages] = useState(0);
    const [activeType, setActiveType] = useState<string>("All");

    const [supplierSearch, setSupplierSearch] = useState("");
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");

    // 🚀 NEW FILTER STATES
    const [statusFilter, setStatusFilter] = useState(initialStatusFilter);
    const [divisionFilter, setDivisionFilter] = useState("");
    const [departmentFilter, setDepartmentFilter] = useState("");
    const [docNoSearch, setDocNoSearch] = useState("");
    const [appliedFilters, setAppliedFilters] = useState<AppliedListFilters>(() => ({
        supplierSearch: "",
        startDate: "",
        endDate: "",
        statusFilter: initialStatusFilter,
        divisionFilter: "",
        departmentFilter: "",
        docNoSearch: "",
    }));

    const [filterSuppliers, setFilterSuppliers] = useState<SupplierDto[]>([]);
    const [divisions, setDivisions] = useState<DivisionDto[]>([]);
    const [departments, setDepartments] = useState<DepartmentDto[]>([]);

    useEffect(() => {
        const fetchFilterData = async () => {
            try {
                const [trade, nonTrade, divs, depts] = await Promise.all([
                    disbursementProvider.getSuppliers("Trade"),
                    disbursementProvider.getSuppliers("Non-Trade"),
                    disbursementProvider.getDivisions().catch(() => []),
                    disbursementProvider.getDepartments().catch(() => [])
                ]);
                setFilterSuppliers([...trade, ...nonTrade].sort((a, b) => a.supplier_name.localeCompare(b.supplier_name)));
                setDivisions(divs);
                setDepartments(depts);
            } catch {
                console.error("Failed to load filter data");
            }
        };
        fetchFilterData();
    }, []);

    const fetchList = useCallback(async (
        pageNum: number, type: string, search: string, start: string, end: string,
        status: string, divId: string, deptId: string, docNo: string
    ) => {
        const requestId = ++listRequestIdRef.current;
        setLoading(true);
        try {
            const response = await disbursementProvider.getDisbursements(pageNum, size, type, search, start, end, status, divId, deptId, docNo);
            if (requestId !== listRequestIdRef.current) return;
            setData(response.content);
            setTotalPages(response.totalPages);
        } catch {
            if (requestId !== listRequestIdRef.current) return;
            toast.error("Failed to load disbursements");
        } finally {
            if (requestId === listRequestIdRef.current) {
                setLoading(false);
            }
        }
    }, [size]);

    useEffect(() => {
        fetchList(
            page,
            activeType,
            appliedFilters.supplierSearch,
            appliedFilters.startDate,
            appliedFilters.endDate,
            appliedFilters.statusFilter,
            appliedFilters.divisionFilter,
            appliedFilters.departmentFilter,
            appliedFilters.docNoSearch,
        );
    }, [activeType, appliedFilters, fetchList, page]);

    const applyFilters = () => {
        setPage(0);
        setAppliedFilters({
            supplierSearch,
            startDate,
            endDate,
            statusFilter,
            divisionFilter,
            departmentFilter,
            docNoSearch,
        });
    };

    const clearFilters = (resetStatus = initialStatusFilter) => {
        setSupplierSearch("");
        setStartDate("");
        setEndDate("");
        setStatusFilter(resetStatus);
        setDivisionFilter("");
        setDepartmentFilter("");
        setDocNoSearch("");
        setPage(0);
        setAppliedFilters({
            supplierSearch: "",
            startDate: "",
            endDate: "",
            statusFilter: resetStatus,
            divisionFilter: "",
            departmentFilter: "",
            docNoSearch: "",
        });
    };

    const handleTabChange = (type: string) => {
        setActiveType(type);
        setPage(0);
    };

    const create = async (payload: DisbursementPayload): Promise<DisbursementSubmitResult> => {
        if (createRequestLockRef.current) return {success: false};
        createRequestLockRef.current = true;
        setActionLoading(true);
        try {
            await disbursementProvider.createDisbursement(payload);
            toast.success("Voucher created successfully");
            applyFilters();
            return {success: true};
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Creation failed";
            toast.error(message);
            return {success: false, message};
        } finally {
            createRequestLockRef.current = false;
            setActionLoading(false);
        }
    };

    const update = async (id: number, payload: DisbursementPayload): Promise<DisbursementSubmitResult> => {
        setActionLoading(true);
        try {
            await disbursementProvider.updateDisbursement(id, payload);
            toast.success("Voucher updated successfully");
            applyFilters();
            return {success: true};
        } catch (error: unknown) { // 🚀 FIX: Replaced 'any'
            const msg = error instanceof Error ? error.message : "Update failed";
            toast.error(msg);
            return {success: false, message: msg};
        } finally {
            setActionLoading(false);
        }
    };

    const updatePaymentAllocation = async (id: number, payments: PaymentLine[]): Promise<DisbursementSubmitResult> => {
        setActionLoading(true);
        try {
            await disbursementProvider.updatePaymentAllocation(id, payments);
            toast.success("Payment allocation saved successfully");
            applyFilters();
            return {success: true};
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : "Payment allocation update failed";
            toast.error(msg);
            return {success: false, message: msg};
        } finally {
            setActionLoading(false);
        }
    };

    const changeStatus = async (id: number, status: string): Promise<DisbursementStatusResult> => {
        setActionLoading(true);
        try {
            await disbursementProvider.updateStatus(id, status);
            toast.success(`Status updated to ${status}`);
            applyFilters();
            return {success: true};
        } catch (error: unknown) {
            const message = error instanceof DisbursementRequestError
                ? error.message
                : error instanceof Error
                    ? error.message
                    : "Status update failed";
            const detail = error instanceof DisbursementRequestError ? error.detail : undefined;

            if (detail) {
                toast.error(message, {description: detail});
            } else {
                toast.error(message);
            }

            return {success: false, message, detail};
        } finally {
            setActionLoading(false);
        }
    };

    const changeSize = (newSize: number) => {
        setSize(newSize);
        setPage(0);
    };

    return {
        data,
        loading,
        actionLoading,
        page,
        setPage,
        size,
        changeSize,
        totalPages,
        activeType,
        handleTabChange,
        supplierSearch,
        setSupplierSearch,
        startDate,
        setStartDate,
        endDate,
        setEndDate,
        statusFilter,
        setStatusFilter,
        divisionFilter,
        setDivisionFilter,
        departmentFilter,
        setDepartmentFilter,
        docNoSearch,
        setDocNoSearch,
        filterSuppliers,
        divisions,
        departments,
        applyFilters,
        clearFilters,
        refresh: applyFilters,
        create,
        update,
        updatePaymentAllocation,
        changeStatus
    };
}
