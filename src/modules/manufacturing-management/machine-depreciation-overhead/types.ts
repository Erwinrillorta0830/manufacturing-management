export interface MachineDepreciationFilters {
  dateFrom: string; // 'YYYY-MM-DD'
  dateTo: string;
  branchId: string;
  departmentId: string;
  assetId: string;
}

export interface UomSummary {
  uoms: string[];
  isSingleUom: boolean;
  displayValue: number | null;
  displayUom: string | null;
}

export interface OverviewKPIs {
  uopMachineDepreciation: number;
  uopProductionOutput: number | null;
  outputUom: string; // e.g. "pcs" or "Multiple UOMs"
  avgUopDepreciationPerUnit: number | null;
  rateUom: string; // e.g. "₱10.00 / pcs" or "Multiple UOMs"
  attributedToJobs: number;
  attributionDifference: number;
  machinesWithOutputCount: number;
}

export interface MonthlyTrendPoint {
  month: string;
  depreciation: number;
}

export interface MachineDistributionPoint {
  machineName: string;
  assetId: number;
  depreciation: number;
}

export interface UopOutputVsDepreciationPoint {
  machineName: string;
  assetId: number;
  productionOutput: number;
  depreciation: number;
  uom: string;
  ratePerUnit: number;
}

export interface OverviewData {
  kpis: OverviewKPIs;
  monthlyTrend: MonthlyTrendPoint[];
  byMachine: MachineDistributionPoint[];
  uopOutputVsDepreciation: UopOutputVsDepreciationPoint[];
}

export interface MachineRow {
  assetId: number;
  machineName: string;
  serial: string | null;
  depreciableBase: number;
  lifetimeCapacity: number;
  productionOutput: number;
  uom: string;
  ratePerUnit: number;
  periodDepreciation: number;
  capacityUsedPercent: number;
  workCenterName: string | null;
}

export interface JobOrderAllocationKPIs {
  jobOrdersWithOutput: number;
  totalProductionOutput: number | null;
  totalOutputUom: string; // e.g. "pcs", or "Multiple UOMs"
  depreciationAttributed: number;
  avgDepreciationPerUnit: number | null; // null if multiple UOMs
  avgRateUom: string; // e.g. "₱10.00 / pcs", or "Multiple UOMs"
}

export interface JobOrderAllocationRow {
  jobOrderId: number;
  jobOrderNo: string;
  productName: string;
  machineName: string;
  productionOutput: number;
  uom: string;
  ratePerUnit: number;
  depreciationAttributed: number;
  cogm: string; // always "—"
}

export interface JobOrderAllocationData {
  kpis: JobOrderAllocationKPIs;
  rows: JobOrderAllocationRow[];
}

export interface DetailRow {
  date: string | null;
  machineName: string;
  assetSerial: string | null;
  jobOrderNo: string;
  productName: string;
  productionOutput: number;
  uom: string;
  ratePerUnit: number;
  depreciationAttributed: number;
}

export interface FilterOptions {
  branches: { id: number; name: string }[];
  departments: { id: number; name: string }[];
  machines: { assetId: number; name: string }[];
}
