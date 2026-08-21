import { CustomerDiscount, CustomerDiscountModuleData } from "../types";

export async function fetchModuleData(): Promise<CustomerDiscountModuleData> {
  const res = await fetch("/api/manufacturing/financial-management/discount-management/customer-discount");
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to fetch module data");
  }
  return res.json();
}

export async function fetchCustomerDiscounts(customerCode: string): Promise<CustomerDiscount[]> {
  const res = await fetch(`/api/manufacturing/financial-management/discount-management/customer-discount/discounts?customer_code=${customerCode}`);
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to fetch customer discounts");
  }
  return res.json();
}

export async function addCustomerDiscount(data: Partial<CustomerDiscount>): Promise<CustomerDiscount> {
  const res = await fetch("/api/manufacturing/financial-management/discount-management/customer-discount/discounts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to add customer discount");
  }
  return res.json();
}

export async function deleteCustomerDiscount(id: number, userId: number | null): Promise<void> {
  const res = await fetch(`/api/manufacturing/financial-management/discount-management/customer-discount/discounts?id=${id}&userId=${userId}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to delete customer discount");
  }
}
