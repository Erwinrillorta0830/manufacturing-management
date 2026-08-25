import { useState, useEffect, useCallback } from "react";
import { CustomerDiscountModuleData, CustomerDiscount, Customer } from "../types";
import { fetchModuleData, fetchCustomerDiscounts, addCustomerDiscount, deleteCustomerDiscount } from "../services/customer-discount";
import { toast } from "sonner";

export function useCustomerDiscount(userId: number | null) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CustomerDiscountModuleData | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerDiscounts, setCustomerDiscounts] = useState<CustomerDiscount[]>([]);
  const [loadingDiscounts, setLoadingDiscounts] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetchModuleData();
      setData(res);
      setError(null);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "An error occurred");
      toast.error("Failed to load module data");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCustomerDiscounts = useCallback(async (customerCode: string) => {
    try {
      setLoadingDiscounts(true);
      const res = await fetchCustomerDiscounts(customerCode);
      setCustomerDiscounts(res);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load customer discounts");
    } finally {
      setLoadingDiscounts(false);
    }
  }, []);

  const handleAddDiscount = async (discountData: Partial<CustomerDiscount>) => {
    try {
      await addCustomerDiscount({ ...discountData, created_by: userId });
      toast.success("Discount added successfully");
      if (selectedCustomer) {
        await loadCustomerDiscounts(selectedCustomer.customer_code);
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to add discount");
    }
  };

  const handleDeleteDiscount = async (id: number) => {
    try {
      await deleteCustomerDiscount(id, userId);
      toast.success("Discount deleted successfully");
      if (selectedCustomer) {
        await loadCustomerDiscounts(selectedCustomer.customer_code);
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete discount");
    }
  };

  useEffect(() => {
    loadData();
  }, [loadData]);

  return {
    loading,
    error,
    data,
    selectedCustomer,
    setSelectedCustomer,
    customerDiscounts,
    loadingDiscounts,
    loadCustomerDiscounts,
    handleAddDiscount,
    handleDeleteDiscount,
    refreshData: loadData,
  };
}
