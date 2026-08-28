"use client";

import { useRouter } from "next/navigation";
import { StockAdjustmentManualForm } from "@/modules/manufacturing-management/stock-adjustment-manual-registration/components/forms/StockAdjustmentManualForm";

interface StockAdjustmentManualRegistrationModuleProps {
  userFullName?: string;
}

export default function StockAdjustmentManualRegistrationModule({
  userFullName
}: StockAdjustmentManualRegistrationModuleProps) {
  const router = useRouter();

  return (
    <div className="stock-adjustment-manual-registration-module">
      <StockAdjustmentManualForm
        id={null}
        onCancel={undefined}
        onSuccess={() => {
          router.push("/mm/inventory-warehousing/adjustments/stock-adjustment/stock-adjustment-summary");
        }}
        mode="creation"
        userFullName={userFullName}
      />
    </div>
  );
}
