"use client";

import { useCallback, useMemo, useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { useApprovals } from "./hooks/use-approval";
import { columns as pendingColumns } from "./components/data-table/columns";
import { approvedColumns } from "./components/data-table/approvedColumn";
import { ApprovalDataTable } from "./components/data-table";
import { InvoiceSummaryApprovalCard } from "./components/cards/InvoiceSummaryApprovalCard";
import { ActionConfirmationModal } from "./components/confirmation-modal";
import { mapRequestsToInvoiceRows } from "./lib/mapping";
import { ApprovalAction, InvoiceRow, ApprovalParams } from "./types";

export default function InvoiceCancellationApprovalPage() {
  const {
    allRequests,
    isLoading,
    isProcessing,
    handleAction,
  } = useApprovals();

  const pendingRequests = useMemo(() => {
    return (allRequests || []).filter((r) => r.status === "PENDING");
  }, [allRequests]);

  const approvedRequests = useMemo(() => {
    return (allRequests || []).filter((r) => r.status === "APPROVED");
  }, [allRequests]);

  const [activeTab, setActiveTab] = useState<string>("PENDING");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<{
    type: ApprovalAction;
    data: InvoiceRow | InvoiceRow[];
  } | null>(null);

  const isMountedRef = useRef(false);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const mappedRequests = useMemo(
      () => mapRequestsToInvoiceRows(pendingRequests, approvedRequests),
      [pendingRequests, approvedRequests],
  );

  // 🚀 Perfectly typed! TS knows 'total_amount' exists now.
  const stats = useMemo(
      () => ({
        approved: approvedRequests.length,
        pending: pendingRequests.length,
        highValue: pendingRequests.filter((r) => (r.total_amount || 0) > 20000).length,
      }),
      [pendingRequests, approvedRequests],
  );

  const triggerActionConfirmation = useCallback(
      (type: ApprovalAction, data: InvoiceRow | InvoiceRow[]) => {
        setPendingAction({ type, data });
        setConfirmOpen(true);
      },
      [],
  );

  const confirmAndExecute = async () => {
    if (!pendingAction?.data) return;

    const itemsToProcess = Array.isArray(pendingAction.data)
        ? pendingAction.data
        : [pendingAction.data];

    // Dynamically resolve current user ID from session token
    let currentUserId = 0;
    if (typeof document !== "undefined") {
      const match = document.cookie.match(/vos_access_token=([^;]+)/);
      const token = match ? match[1] : (typeof localStorage !== "undefined" ? localStorage.getItem("token") : null);
      if (token) {
        try {
          const parts = token.split(".");
          if (parts.length >= 2) {
            const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
            const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
            const payload = JSON.parse(atob(padded));
            const idVal = payload.user_id ?? payload.userId ?? payload.id ?? payload.sub;
            if (idVal) currentUserId = Number(idVal) || 0;
          }
        } catch {
          // ignore parsing error
        }
      }
    }

    // Maps the UI Row to the ApprovalParams interface with genuine auditorId
    const paramsArray: ApprovalParams[] = itemsToProcess.map((item) => ({
      requestId: item.id,
      auditorId: currentUserId,
      rejectionReason: pendingAction.type === "REJECT" ? "Rejected via Audit UI" : undefined,
    }));

    await handleAction(pendingAction.type, paramsArray);
    setConfirmOpen(false);
    setPendingAction(null);
  };

  const columns = useMemo(() => {
    return activeTab === "APPROVED"
        ? approvedColumns
        : pendingColumns;
  }, [activeTab]);

  return (
      <div className="flex flex-1 flex-col px-4">
        <div className="@container/main flex flex-1 flex-col gap-4 py-4">
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            <InvoiceSummaryApprovalCard stats={stats} />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.15, ease: "easeOut" }}
          >
            <ApprovalDataTable
                columns={columns}
                data={mappedRequests}
                isLoading={isLoading}
                onBulkAction={triggerActionConfirmation}
                currentTab={activeTab}
                onTabChange={(tab) => isMountedRef.current && setActiveTab(tab)}
            />
          </motion.div>

          <ActionConfirmationModal
              open={confirmOpen}
              onOpenChange={setConfirmOpen}
              pendingAction={pendingAction}
              isProcessing={isProcessing}
              onConfirm={confirmAndExecute}
          />
        </div>
      </div>
  );
}