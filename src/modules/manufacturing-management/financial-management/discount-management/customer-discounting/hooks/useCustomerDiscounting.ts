// src/modules/financial-management/accounting/discount-management/customer-discounting/hooks/useCustomerDiscounting.ts
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { customerDiscountingApi } from "../providers/customerDiscountingApi";
import type {
  CustomerDiscountingCustomer,
  CustomerDiscountingModuleData,
  CustomerDiscountingRules,
} from "../types";

const emptyRules: CustomerDiscountingRules = {
  supplierCategoryRules: [],
  productRules: [],
};

/**
 * Coordinates customer selection, rule loading, and rule mutations for the module.
 */
export function useCustomerDiscounting(userId: number | null, initialModuleData: CustomerDiscountingModuleData) {
  const [moduleData, setModuleData] = useState<CustomerDiscountingModuleData>(initialModuleData);
  const [rules, setRules] = useState<CustomerDiscountingRules>(emptyRules);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerDiscountingCustomer | null>(null);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  /**
   * Loads the supplier/category and product rules for a selected customer code.
   */
  const loadRules = useCallback(async (customerCode: string) => {
    try {
      setRulesLoading(true);
      setRules(await customerDiscountingApi.getRules(customerCode));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load customer discounting rules";
      toast.error(message);
      setRules(emptyRules);
    } finally {
      setRulesLoading(false);
    }
  }, []);

  /**
   * Selects a customer and eagerly loads its rules for the configuration sheet.
   */
  const selectCustomer = useCallback((customer: CustomerDiscountingCustomer) => {
    setSelectedCustomer(customer);
    void loadRules(customer.customerCode);
  }, [loadRules]);

  const refreshSelectedCustomer = useCallback(async () => {
    if (!selectedCustomer) return;
    await loadRules(selectedCustomer.customerCode);
  }, [loadRules, selectedCustomer]);

  /**
   * Saves the customer's global discount and mirrors the change in local table state.
   */
  const updateGlobalDiscount = useCallback(async (discountTypeId: number | null) => {
    if (!selectedCustomer) return;
    try {
      setSaving(true);
      await customerDiscountingApi.updateGlobalDiscount({
        customerCode: selectedCustomer.customerCode,
        customerId: selectedCustomer.id,
        discountTypeId,
        updatedBy: userId,
      });
      const globalDiscount = discountTypeId
        ? moduleData.discountTypes.find((item) => item.id === discountTypeId) ?? null
        : null;
      setModuleData((current) => ({
        ...current,
        customers: current.customers.map((customer) =>
          customer.customerCode === selectedCustomer.customerCode
            ? { ...customer, globalDiscount }
            : customer,
        ),
      }));
      setSelectedCustomer((current) =>
        current?.customerCode === selectedCustomer.customerCode
          ? { ...current, globalDiscount }
          : current,
      );
      toast.success("Global customer discount updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update global customer discount");
    } finally {
      setSaving(false);
    }
  }, [moduleData.discountTypes, selectedCustomer, userId]);

  /**
   * Creates or updates a supplier/category rule and refreshes the selected customer's rules.
   */
  const addSupplierCategoryRule = useCallback(async (payload: {
    supplierId: number;
    categoryId: number | null;
    discountTypeId: number;
  }) => {
    if (!selectedCustomer) return false;
    try {
      setSaving(true);
      await customerDiscountingApi.addSupplierCategoryRule({
        customerCode: selectedCustomer.customerCode,
        ...payload,
        createdBy: userId,
      });
      toast.success("Supplier/category discount saved");
      await loadRules(selectedCustomer.customerCode);
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save supplier/category discount");
      return false;
    } finally {
      setSaving(false);
    }
  }, [loadRules, selectedCustomer, userId]);

  /**
   * Creates or updates a product-specific rule and refreshes the selected customer's rules.
   */
  const addProductRule = useCallback(async (payload: {
    productId: number;
    discountTypeId: number | null;
    unitPrice: number | null;
  }) => {
    if (!selectedCustomer) return false;
    try {
      setSaving(true);
      await customerDiscountingApi.addProductRule({
        customerCode: selectedCustomer.customerCode,
        ...payload,
        createdBy: userId,
      });
      toast.success("Product discount saved");
      await loadRules(selectedCustomer.customerCode);
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save product discount");
      return false;
    } finally {
      setSaving(false);
    }
  }, [loadRules, selectedCustomer, userId]);

  /**
   * Soft-deletes a supplier/category rule through the BFF.
   */
  const deleteSupplierCategoryRule = useCallback(async (id: number) => {
    if (!selectedCustomer) return;
    try {
      setSaving(true);
      await customerDiscountingApi.deleteSupplierCategoryRule(id, userId);
      setRules((current) => ({
        ...current,
        supplierCategoryRules: current.supplierCategoryRules.filter((rule) => rule.id !== id),
      }));
      toast.success("Supplier/category discount removed");
      await loadRules(selectedCustomer.customerCode);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete supplier/category discount");
    } finally {
      setSaving(false);
    }
  }, [loadRules, selectedCustomer, userId]);

  /**
   * Soft-deletes a product-specific rule through the BFF.
   */
  const deleteProductRule = useCallback(async (id: number) => {
    if (!selectedCustomer) return;
    try {
      setSaving(true);
      const result = await customerDiscountingApi.deleteProductRule(id, userId);
      setRules((current) => ({
        ...current,
        productRules: current.productRules.filter((rule) => rule.id !== id),
      }));
      toast.success("Product discount removed");
      if (!result.localOnly) {
        await loadRules(selectedCustomer.customerCode);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete product discount");
    } finally {
      setSaving(false);
    }
  }, [loadRules, selectedCustomer, userId]);

  return {
    moduleData,
    rules,
    selectedCustomer,
    setSelectedCustomer,
    selectCustomer,
    loading: false,
    rulesLoading,
    saving,
    error: null,
    refreshSelectedCustomer,
    updateGlobalDiscount,
    addSupplierCategoryRule,
    addProductRule,
    deleteSupplierCategoryRule,
    deleteProductRule,
  };
}
