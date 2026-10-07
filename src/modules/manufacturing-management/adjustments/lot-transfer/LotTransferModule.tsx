"use client";

import React from "react";
import LotTransferRequestModule from "./LotTransferRequestModule";
import LotTransferApprovalModule from "./LotTransferApprovalModule";
import LotTransferPostingModule from "./LotTransferPostingModule";
import LotTransferSummaryModule from "./LotTransferSummaryModule";
import type { LotTransferMode } from "./types";

export interface LotTransferModuleProps {
  mode?: LotTransferMode | "create" | "edit" | "detail";
  userBranchId?: number | null;
  transferId?: number | null;
  backHref?: string;
  initialCreating?: boolean;
}

export const LotTransferModule: React.FC<LotTransferModuleProps> = ({
  mode = "request",
  userBranchId,
  transferId,
  backHref,
  initialCreating,
}) => {
  const branchId = userBranchId || null;
  const numTransferId = transferId ? Number(transferId) : undefined;

  switch (mode) {
    case "approval":
      return <LotTransferApprovalModule userBranchId={branchId} transferId={numTransferId} />;
    case "posting":
      return <LotTransferPostingModule userBranchId={branchId} transferId={numTransferId} />;
    case "summary":
      return <LotTransferSummaryModule userBranchId={branchId} transferId={numTransferId} />;
    case "create":
      return (
        <LotTransferRequestModule
          userBranchId={branchId}
          initialCreating={true}
          backHref={backHref}
        />
      );
    case "detail":
    case "edit":
      return (
        <LotTransferRequestModule
          userBranchId={branchId}
          transferId={numTransferId}
          backHref={backHref}
        />
      );
    case "request":
    default:
      return (
        <LotTransferRequestModule
          userBranchId={branchId}
          transferId={numTransferId}
          initialCreating={initialCreating}
          backHref={backHref}
        />
      );
  }
};

export default LotTransferModule;
