import { AssetFormValues } from "../types";
import { formatDateTimeForDB } from "../utils/lib";

const API_ROUTE = "/api/manufacturing/asset-management";

async function apiRequest(url: string, options?: RequestInit) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Request failed");
  }
  return res.json();
}

export interface AssetDepreciationFilterParams {
  type?: string;
  assetType?: string;
  department?: number | string;
  employee?: number | string;
  depreciationMethod?: string;
  productionUnit?: string;
  jobOrder?: string;
  product?: string;
  acquisitionDateFrom?: string;
  acquisitionDateTo?: string;
  depreciationStartDateFrom?: string;
  depreciationStartDateTo?: string;
  acquisitionCostMin?: number;
  acquisitionCostMax?: number;
  residualValueMin?: number;
  residualValueMax?: number;
}

export const assetService = {
  getDepartments: () => apiRequest(`${API_ROUTE}?type=departments`),

  getUsers: () => apiRequest(`${API_ROUTE}?type=users`),

  getItemTypes: () => apiRequest(`${API_ROUTE}?type=item_types`),

  getItemClassifications: () =>
    apiRequest(`${API_ROUTE}?type=item_classifications`),

  getItems: () => apiRequest(`${API_ROUTE}?type=items`),

  getUnits: () => apiRequest(`${API_ROUTE}?type=units`),

  getAssets: (filters?: AssetDepreciationFilterParams) => {
    if (!filters) return apiRequest(API_ROUTE);
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== null && String(v).trim() !== "") {
        params.set(k, String(v));
      }
    });
    const queryString = params.toString() ? `?${params.toString()}` : "";
    return apiRequest(`${API_ROUTE}${queryString}`);
  },

  getDepreciationSummary: (filters?: AssetDepreciationFilterParams) => {
    const params = new URLSearchParams({ type: "depreciation_summary" });
    if (filters) {
      Object.entries(filters).forEach(([k, v]) => {
        if (v !== undefined && v !== null && String(v).trim() !== "") {
          params.set(k, String(v));
        }
      });
    }
    return apiRequest(`${API_ROUTE}?${params.toString()}`);
  },

  getDepreciationDetails: (assetId?: number, filters?: AssetDepreciationFilterParams) => {
    const params = new URLSearchParams({ type: "depreciation_details" });
    if (assetId) params.set("asset_id", String(assetId));
    if (filters) {
      Object.entries(filters).forEach(([k, v]) => {
        if (v !== undefined && v !== null && String(v).trim() !== "") {
          params.set(k, String(v));
        }
      });
    }
    return apiRequest(`${API_ROUTE}?${params.toString()}`);
  },

  createAsset: (values: AssetFormValues, encoderId: number) => {
    const acqDate = formatDateTimeForDB(values.date_acquired);
    const depDate = values.depreciation_start_date
      ? formatDateTimeForDB(values.depreciation_start_date).split(" ")[0]
      : acqDate.split(" ")[0];

    return apiRequest(API_ROUTE, {
      method: "POST",
      body: JSON.stringify({
        ...values,
        encoder: encoderId,
        date_acquired: acqDate,
        depreciation_start_date: depDate,
        acquisition_cost:
          values.acquisition_cost != null
            ? Number(values.acquisition_cost)
            : Number(values.cost_per_item) * Number(values.quantity || 1),
        residual_value: Number(values.residual_value || 0),
        useful_life_months:
          values.useful_life_months != null
            ? Number(values.useful_life_months)
            : Number(values.life_span || 1) * 12,
        maximum_unit_produced_capacity:
          values.maximum_unit_produced_capacity != null
            ? Number(values.maximum_unit_produced_capacity)
            : null,
        production_unit_id: values.production_unit_id
          ? Number(values.production_unit_id)
          : null,
      }),
    });
  },

  updateAsset: (
    id: number,
    itemId: number,
    values: AssetFormValues,
    imageId: string | null,
  ) => {
    const acqDate = values.date_acquired
      ? formatDateTimeForDB(values.date_acquired)
      : undefined;
    const depDate = values.depreciation_start_date
      ? formatDateTimeForDB(values.depreciation_start_date).split(" ")[0]
      : (acqDate ? acqDate.split(" ")[0] : undefined);

    return apiRequest(API_ROUTE, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        item_id: itemId,
        item_name: values.item_name,
        item_type_name: values.item_type,
        classification_name: values.item_classification,
        asset_type: values.asset_type,
        depreciation_method: values.depreciation_method,
        condition: values.condition,
        cost_per_item: Number(values.cost_per_item),
        quantity: Number(values.quantity),
        acquisition_cost:
          values.acquisition_cost != null
            ? Number(values.acquisition_cost)
            : Number(values.cost_per_item) * Number(values.quantity || 1),
        residual_value: Number(values.residual_value || 0),
        life_span: Number(values.life_span),
        useful_life_months:
          values.useful_life_months != null
            ? Number(values.useful_life_months)
            : Number(values.life_span || 1) * 12,
        maximum_unit_produced_capacity:
          values.maximum_unit_produced_capacity != null
            ? Number(values.maximum_unit_produced_capacity)
            : null,
        production_unit_id: values.production_unit_id
          ? Number(values.production_unit_id)
          : null,
        date_acquired: acqDate,
        depreciation_start_date: depDate,
        department: Number(values.department),
        employee: values.employee ? Number(values.employee) : null,
        item_image: imageId,
        barcode: values.barcode,
        rfid_code: values.rfid_code,
        serial: values.serial,
        is_active_warning: values.is_active_warning,
      }),
    });
  },
};
