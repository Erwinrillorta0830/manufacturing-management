import { AssetFormValues } from "../types";
import { format } from "date-fns";

const API_ROUTE = "/api/manufacturing/asset-management";

async function apiRequest(url: string, options?: RequestInit) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Request failed");
  }
  return res.json();
}

export const assetService = {
  getDepartments: () => apiRequest(`${API_ROUTE}?type=departments`),

  getUsers: () => apiRequest(`${API_ROUTE}?type=users`),

  getItemTypes: () => apiRequest(`${API_ROUTE}?type=item_types`),

  getItemClassifications: () =>
    apiRequest(`${API_ROUTE}?type=item_classifications`),

  getItems: () => apiRequest(`${API_ROUTE}?type=items`),

  getAssets: () => apiRequest(API_ROUTE),

  createAsset: (values: AssetFormValues, encoderId: number) =>
    apiRequest(API_ROUTE, {
      method: "POST",
      body: JSON.stringify({
        ...values,
        encoder: encoderId,
        date_acquired: format(values.date_acquired, "yyyy-MM-dd"),
      }),
    }),

  updateAsset: (
    id: number,
    itemId: number,
    values: AssetFormValues,
    imageId: string | null,
  ) =>
    apiRequest(API_ROUTE, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        item_id: itemId,
        item_name: values.item_name,
        item_type_name: values.item_type,
        classification_name: values.item_classification,
        condition: values.condition,
        cost_per_item: Number(values.cost_per_item),
        quantity: Number(values.quantity),
        life_span: Number(values.life_span),
        date_acquired: format(values.date_acquired, "yyyy-MM-dd"),
        department: Number(values.department),
        employee: values.employee ? Number(values.employee) : null,
        item_image: imageId,
        barcode: values.barcode,
        rfid_code: values.rfid_code,
        serial: values.serial,
        is_active_warning: values.is_active_warning,
      }),
    }),
};
