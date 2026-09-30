"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import type {
  MachineDepreciationFilters,
  OverviewData,
  MachineRow,
  JobOrderAllocationData,
  DetailRow,
  FilterOptions,
} from "../types";
import {
  fetchDepreciationOverview,
  fetchDepreciationMachines,
  fetchDepreciationJobOrders,
  fetchDepreciationDetails,
  fetchDepreciationFilters,
} from "../services/depreciation-api";

export type DepreciationTab = "overview" | "machines" | "job-orders" | "details";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function firstOfYearStr() {
  return `${new Date().getFullYear()}-01-01`;
}

const DEFAULT_FILTERS: MachineDepreciationFilters = {
  dateFrom: firstOfYearStr(),
  dateTo: todayStr(),
  branchId: "",
  departmentId: "",
  assetId: "",
};

export interface UseMachineDepreciationOverheadReturn {
  filters: MachineDepreciationFilters;
  setFilters: React.Dispatch<React.SetStateAction<MachineDepreciationFilters>>;
  pendingFilters: MachineDepreciationFilters;
  setPendingFilters: React.Dispatch<React.SetStateAction<MachineDepreciationFilters>>;
  applyFilters: () => void;
  resetFilters: () => void;
  activeTab: DepreciationTab;
  setActiveTab: (tab: DepreciationTab) => void;
  // Overview
  overviewData: OverviewData | null;
  overviewLoading: boolean;
  overviewError: string | null;
  refetchOverview: () => void;
  // Machines
  machinesData: { rows: MachineRow[] } | null;
  machinesLoading: boolean;
  machinesError: string | null;
  refetchMachines: () => void;
  // Job Orders
  jobOrdersData: JobOrderAllocationData | null;
  jobOrdersLoading: boolean;
  jobOrdersError: string | null;
  refetchJobOrders: () => void;
  // Details
  detailsData: { rows: DetailRow[]; total: number } | null;
  detailsLoading: boolean;
  detailsError: string | null;
  detailsPage: number;
  setDetailsPage: (page: number) => void;
  refetchDetails: () => void;
  // Filters
  filterOptions: FilterOptions | null;
  filterOptionsLoading: boolean;
}

export function useMachineDepreciationOverhead(): UseMachineDepreciationOverheadReturn {
  const [filters, setFilters] = useState<MachineDepreciationFilters>(DEFAULT_FILTERS);
  const [pendingFilters, setPendingFilters] = useState<MachineDepreciationFilters>(DEFAULT_FILTERS);
  const [activeTab, setActiveTab] = useState<DepreciationTab>("overview");

  // Overview state
  const [overviewData, setOverviewData] = useState<OverviewData | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  // Machines state
  const [machinesData, setMachinesData] = useState<{ rows: MachineRow[] } | null>(null);
  const [machinesLoading, setMachinesLoading] = useState(false);
  const [machinesError, setMachinesError] = useState<string | null>(null);

  // Job Orders state
  const [jobOrdersData, setJobOrdersData] = useState<JobOrderAllocationData | null>(null);
  const [jobOrdersLoading, setJobOrdersLoading] = useState(false);
  const [jobOrdersError, setJobOrdersError] = useState<string | null>(null);

  // Details state
  const [detailsData, setDetailsData] = useState<{ rows: DetailRow[]; total: number } | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [detailsPage, setDetailsPage] = useState(1);

  // Filter options
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null);
  const [filterOptionsLoading, setFilterOptionsLoading] = useState(false);

  // Refetch triggers
  const [overviewTrigger, setOverviewTrigger] = useState(0);
  const [machinesTrigger, setMachinesTrigger] = useState(0);
  const [jobOrdersTrigger, setJobOrdersTrigger] = useState(0);
  const [detailsTrigger, setDetailsTrigger] = useState(0);

  const applyFilters = useCallback(() => {
    setFilters(pendingFilters);
    setDetailsPage(1);
  }, [pendingFilters]);

  const resetFilters = useCallback(() => {
    setPendingFilters(DEFAULT_FILTERS);
    setFilters(DEFAULT_FILTERS);
    setDetailsPage(1);
  }, []);

  const refetchOverview = useCallback(() => setOverviewTrigger((n) => n + 1), []);
  const refetchMachines = useCallback(() => setMachinesTrigger((n) => n + 1), []);
  const refetchJobOrders = useCallback(() => setJobOrdersTrigger((n) => n + 1), []);
  const refetchDetails = useCallback(() => setDetailsTrigger((n) => n + 1), []);

  // Load filter options once on mount
  useEffect(() => {
    const ctrl = new AbortController();
    setFilterOptionsLoading(true);
    fetchDepreciationFilters(ctrl.signal)
      .then(setFilterOptions)
      .catch((err) => {
        if (err?.name !== "AbortError") {
          toast.error("Failed to load filter options.");
        }
      })
      .finally(() => setFilterOptionsLoading(false));
    return () => ctrl.abort();
  }, []);

  // Overview
  useEffect(() => {
    if (activeTab !== "overview" && overviewTrigger === 0) return;
    const ctrl = new AbortController();
    setOverviewLoading(true);
    setOverviewError(null);
    fetchDepreciationOverview(filters, ctrl.signal)
      .then(setOverviewData)
      .catch((err) => {
        if (err?.name === "AbortError") return;
        setOverviewError(err.message ?? "Failed to load overview data.");
        toast.error("Failed to load depreciation data.");
      })
      .finally(() => setOverviewLoading(false));
    return () => ctrl.abort();
  }, [filters, overviewTrigger, activeTab]);

  // Machines
  useEffect(() => {
    if (activeTab !== "machines" && machinesTrigger === 0) return;
    const ctrl = new AbortController();
    setMachinesLoading(true);
    setMachinesError(null);
    fetchDepreciationMachines(filters, ctrl.signal)
      .then(setMachinesData)
      .catch((err) => {
        if (err?.name === "AbortError") return;
        setMachinesError(err.message ?? "Failed to load machine data.");
        toast.error("Failed to load depreciation data.");
      })
      .finally(() => setMachinesLoading(false));
    return () => ctrl.abort();
  }, [filters, machinesTrigger, activeTab]);

  // Job Orders
  useEffect(() => {
    if (activeTab !== "job-orders" && jobOrdersTrigger === 0) return;
    const ctrl = new AbortController();
    setJobOrdersLoading(true);
    setJobOrdersError(null);
    fetchDepreciationJobOrders(filters, ctrl.signal)
      .then(setJobOrdersData)
      .catch((err) => {
        if (err?.name === "AbortError") return;
        setJobOrdersError(err.message ?? "Failed to load job order data.");
        toast.error("Failed to load depreciation data.");
      })
      .finally(() => setJobOrdersLoading(false));
    return () => ctrl.abort();
  }, [filters, jobOrdersTrigger, activeTab]);

  // Details
  useEffect(() => {
    if (activeTab !== "details" && detailsTrigger === 0) return;
    const ctrl = new AbortController();
    setDetailsLoading(true);
    setDetailsError(null);
    fetchDepreciationDetails(filters, detailsPage, 20, ctrl.signal)
      .then(setDetailsData)
      .catch((err) => {
        if (err?.name === "AbortError") return;
        setDetailsError(err.message ?? "Failed to load detail data.");
        toast.error("Failed to load depreciation data.");
      })
      .finally(() => setDetailsLoading(false));
    return () => ctrl.abort();
  }, [filters, detailsPage, detailsTrigger, activeTab]);

  return {
    filters,
    setFilters,
    pendingFilters,
    setPendingFilters,
    applyFilters,
    resetFilters,
    activeTab,
    setActiveTab,
    overviewData,
    overviewLoading,
    overviewError,
    refetchOverview,
    machinesData,
    machinesLoading,
    machinesError,
    refetchMachines,
    jobOrdersData,
    jobOrdersLoading,
    jobOrdersError,
    refetchJobOrders,
    detailsData,
    detailsLoading,
    detailsError,
    detailsPage,
    setDetailsPage,
    refetchDetails,
    filterOptions,
    filterOptionsLoading,
  };
}
