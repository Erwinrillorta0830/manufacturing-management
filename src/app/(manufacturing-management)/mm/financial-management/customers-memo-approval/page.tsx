// src/app/(financial-management)/fm/accounting/customers-memo-approval/page.tsx

import React from "react";
import CustomersMemoApprovalModule from "@/modules/manufacturing-management/financial-management/customers-memo/components/CustomersMemoApprovalModule";
import { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "Customer Credit Memo Approval | Financial Management",
    description: "Approve pending Customer Credit Memos within the authorization queue.",
};

export default function CustomersMemoApprovalPage() {
    return <CustomersMemoApprovalModule />;
}
