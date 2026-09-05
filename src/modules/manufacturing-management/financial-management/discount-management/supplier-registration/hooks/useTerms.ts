import { useState, useEffect } from "react";
import { Term } from "@/modules/manufacturing-management/financial-management/discount-management/supplier-registration/services/terms";

export function usePaymentTerms() {
  const [paymentTerms, setPaymentTerms] = useState<Term[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function getTerms() {
      try {
        const response = await fetch("/api/manufacturing/financial-management/discount-management/supplier-registration/payment-terms");
        if (!response.ok) throw new Error("Failed to fetch payment terms");
        const result = await response.json();
        setPaymentTerms(result.data || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setIsLoading(false);
      }
    }
    getTerms();
  }, []);

  return { paymentTerms, isLoading, error };
}

export function useDeliveryTerms() {
  const [deliveryTerms, setDeliveryTerms] = useState<Term[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function getTerms() {
      try {
        const response = await fetch("/api/manufacturing/financial-management/discount-management/supplier-registration/delivery-terms");
        if (!response.ok) throw new Error("Failed to fetch delivery terms");
        const result = await response.json();
        setDeliveryTerms(result.data || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setIsLoading(false);
      }
    }
    getTerms();
  }, []);

  return { deliveryTerms, isLoading, error };
}

