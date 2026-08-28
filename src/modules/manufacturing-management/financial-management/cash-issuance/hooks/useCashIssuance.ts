"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Disbursement, SupplierDto, DivisionDto, DepartmentDto } from "../types";
import { disbursementProvider } from "../providers/fetchProvider";
import { toast } from "sonner";
import { useCashIssuanceDrafts } from "./useCashIssuanceDrafts";
import { useCashIssuanceApprovals } from "./useCashIssuanceApprovals";
import { useCashIssuanceReleasing } from "./useCashIssuanceReleasing";

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
    const listRequestIdRef = useRef(0);

    const [page, setPage] = useState(0);
    const [size, setSize] = useState(20);
    const [totalPages, setTotalPages] = useState(0);
    const [activeType, setActiveType] = useState<string>("All");

    const [supplierSearch, setSupplierSearch] = useState("");
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");

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

    const changeSize = (newSize: number) => {
        setSize(newSize);
        setPage(0);
    };

    // 🚀 Composer: Delegate mutations to sub-hooks
    const { create, update, draftsLoading } = useCashIssuanceDrafts(applyFilters);
    const { changeStatus, approvalsLoading } = useCashIssuanceApprovals(applyFilters);
    const { updatePaymentAllocation, releasingLoading } = useCashIssuanceReleasing(applyFilters);

    return {
        data,
        loading,
        actionLoading: draftsLoading || approvalsLoading || releasingLoading,
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
        
        // Composed mutations
        create,
        update,
        updatePaymentAllocation,
        changeStatus
    };
}
