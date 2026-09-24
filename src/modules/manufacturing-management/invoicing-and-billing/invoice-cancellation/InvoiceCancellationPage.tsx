"use client";

import { useCallback, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { InvoiceSummaryCards } from "./components/cards/InvoiceSummaryCards";
import { InvoiceDataTable } from "./components/data-table";
import { RequestCancellationModal } from "./components/request-modal";
import { useInvoices } from "./hooks/use-invoices";
import { SalesInvoice } from "./types";
import { useApprovals } from "../invoice-cancellation-approval/hooks/use-approval";

export default function InvoiceCancellationPage() {
  // 🚀 FIX: Get allRequests and filter them locally for the stats
  const { allRequests } = useApprovals();
  const { invoices, refresh } = useInvoices();
  const [selectedInvoice, setSelectedInvoice] = useState<SalesInvoice | null>(
      null,
  );
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Optimized: Stable function reference for the child DataTable
  const handleRequestClick = useCallback((invoice: SalesInvoice) => {
    setSelectedInvoice(invoice);
    setIsModalOpen(true);
  }, []);

  // Optimized: Memoized stats calculation
  const stats = useMemo(() => {
    // 🚀 Filter the pending requests from the full list
    const pendingCount = allRequests.filter(req => req.status === "PENDING").length;

    return {
      totalEligible: invoices.length,
      pending: pendingCount,
    };
  }, [invoices, allRequests]);

  return (
      <div className="flex flex-1 flex-col px-4">
        <div className="@container/main flex flex-1 flex-col gap-4 py-4">
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            <InvoiceSummaryCards stats={stats} />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.15, ease: "easeOut" }}
          >
            <InvoiceDataTable data={invoices} onRequest={handleRequestClick} />
          </motion.div>

          {/* Action Modal */}
          <RequestCancellationModal
              isOpen={isModalOpen}
              onClose={() => setIsModalOpen(false)}
              invoice={selectedInvoice}
              onSuccess={() => {
                // Refresh both the eligible list and the pending stats
                refresh();
              }}
          />
        </div>
      </div>
  );
}