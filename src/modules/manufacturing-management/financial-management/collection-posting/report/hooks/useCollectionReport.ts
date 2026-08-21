"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { fetchProvider } from "../../providers/fetchProvider";
import { fetchCompanyProfile } from "../../company-profile";
import type { CompanyProfile, CompanyProfileStatus } from "../../company-profile";

export interface CheckDetailDto {
    date: string;
    chequeDate: string | null;
    docNo: string;
    bankName: string;
    checkNo: string;
    customerName: string | null;
    amount: number;
}

export interface VarianceDetailDto {
    docNo?: string;
    type: string;
    customerName?: string | null;
    invoiceNo?: string | null;
    accountTitle: string;
    remarks: string;
    amount: number;
}

// 🚀 NEW: Hierarchical Invoice Structure
export interface SettledInvoiceDto {
    invoiceNo: string;
    customerName: string;
    invoiceTotal: number; // Existing net-of-discount document value.
    actualInvoiceTotal: number; // Original gross invoice amount before discounts.
    remainingBalance: number; // Persisted AR balance after settlement applications.
    grossAmount: number;
    memoAmount: number;
    returnAmount: number;
    netAmount: number;
}

export interface PouchReportDto {
    id: number;
    docNo: string; date: string; isPosted: boolean;
    totalCash: number; totalCheck: number;
    shortage: number; overage: number;
    totalInvoices: number; totalMemos: number; totalReturns: number;
    invoiceNetTotal: number;
    checks: CheckDetailDto[]; variances: VarianceDetailDto[]; invoices: SettledInvoiceDto[];
}

export interface CollectionReportSalesman {
    id: number;
    salesmanName: string;
}

export interface CollectionSummaryReportDto {
    startDate: string; endDate: string; generatedBy: string;
    globalCash: number; globalChecks: number;
    globalShortages: number; globalOverages: number; globalNetInvoice: number;
    pouches: PouchReportDto[];
}

export function useCollectionReport() {
    const [reportData, setReportData] = useState<CollectionSummaryReportDto | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [companyProfile, setCompanyProfile] = useState<CompanyProfile | null>(null);
    const [companyProfileStatus, setCompanyProfileStatus] = useState<CompanyProfileStatus>("unavailable");
    const [salesmen, setSalesmen] = useState<CollectionReportSalesman[]>([]);
    const requestSequence = useRef(0);
    const didInitialFetch = useRef(false);

    const today = new Date().toISOString().split('T')[0];
    const [startDate, setStartDate] = useState<string>(today);
    const [endDate, setEndDate] = useState<string>(today);

    const fetchReport = useCallback(async () => {
        const requestId = ++requestSequence.current;
        setIsLoading(true);
        setCompanyProfileStatus("loading");
        try {
            const [data, profileResult, salesmenResult] = await Promise.all([
                fetchProvider.get<CollectionSummaryReportDto>(
                    `/api/fm/treasury/collections/report?startDate=${startDate}&endDate=${endDate}`
                ),
                fetchCompanyProfile().catch((error: unknown) => {
                    console.warn("Company profile is unavailable for Collection Report", error);
                    return { profile: null, status: "error" as const };
                }),
                fetchProvider.get<CollectionReportSalesman[]>("/api/fm/treasury/salesmen").catch((error: unknown) => {
                    console.warn("Salesman lookup is unavailable for Collection Report", error);
                    return [];
                }),
            ]);
            if (requestId === requestSequence.current && data) {
                setReportData(data);
                setCompanyProfile(profileResult.profile);
                setCompanyProfileStatus(profileResult.status);
                setSalesmen(salesmenResult ?? []);
            }
        } catch (error) {
            console.error("Failed to load collection report:", error);
            if (requestId === requestSequence.current) {
                setCompanyProfile(null);
                setCompanyProfileStatus("error");
                setSalesmen([]);
            }
        } finally {
            if (requestId === requestSequence.current) {
                setIsLoading(false);
            }
        }
    }, [startDate, endDate]);

    useEffect(() => {
        if (didInitialFetch.current) return;
        didInitialFetch.current = true;
        void fetchReport();
    }, [fetchReport]);

    return {
        reportData,
        isLoading,
        startDate,
        setStartDate,
        endDate,
        setEndDate,
        fetchReport,
        companyProfile,
        companyProfileStatus,
        salesmen,
    };
}
