"use client";

import { useRouter } from "next/navigation";
import { StockAdjustmentManualForm } from "./components/forms/StockAdjustmentManualForm";

interface StockAdjustmentManualRegistrationModuleProps {
  userFullName?: string;
}

export function StockAdjustmentRegistrationModule({
  userFullName
}: StockAdjustmentManualRegistrationModuleProps) {
  const router = useRouter();

  return (
    <div className="stock-adjustment-manual-registration-module">
      <StockAdjustmentManualForm
        id={null}
        onCancel={undefined}
        onSuccess={() => {
          router.push("/scm/inventory-management/stock-adjustment-summary");
        }}
        mode="creation"
        userFullName={userFullName}
      />
    </div>
  );
}

export default StockAdjustmentRegistrationModule;
