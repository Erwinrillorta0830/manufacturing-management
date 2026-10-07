"use client";

import React, { useSyncExternalStore, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Printer,
  X,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LotTransfer } from "../types";

const emptySubscribe = () => () => {};

interface LotTransferPrintModalProps {
  open: boolean;
  onClose: () => void;
  transfer: LotTransfer | null;
}

const formatDate = (val?: string | null): string => {
  if (!val) return "-";
  const str = String(val).trim();
  if (!str) return "-";
  return str.split("T")[0];
};

const formatDateTime = (val?: string | null): string => {
  if (!val) return "-";
  const str = String(val).trim();
  if (!str) return "-";
  const match = str.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})/);
  if (match) {
    return `${match[1]} ${match[2]}`;
  }
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }
  return str;
};

export const LotTransferPrintModal: React.FC<LotTransferPrintModalProps> = ({
  open,
  onClose,
  transfer,
}) => {
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  // Handle escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        onClose();
      }
    },
    [open, onClose]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (!mounted || !open || !transfer) return null;

  const handlePrint = () => {
    window.print();
  };

  const branchDisplay =
    transfer.branchName && transfer.branchName !== "-"
      ? transfer.branchName
      : transfer.branchId
      ? `Branch #${transfer.branchId}`
      : "-";

  const sourceLotDisplay =
    transfer.sourceLotName || (transfer.sourceLotId ? `Lot #${transfer.sourceLotId}` : "-");

  const targetLotDisplay =
    transfer.targetLotName || (transfer.targetLotId ? `Lot #${transfer.targetLotId}` : "-");

  const lineItems = transfer.details || [];
  const totalUnits =
    lineItems.length > 0
      ? lineItems.reduce((acc, curr) => acc + (Number(curr.quantity) || 0), 0)
      : transfer.quantity || 0;

  const printedAtStr = formatDateTime(new Date().toISOString());

  const modalContent = (
    <div
      id="printable-lot-transfer-root"
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs overflow-y-auto print:p-0 print:m-0 print:bg-white print:static print:block print:overflow-visible"
    >
      <style jsx global>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 8mm;
          }
          html,
          body {
            background: white !important;
            color: black !important;
            height: auto !important;
            overflow: visible !important;
          }
          body > *:not(#printable-lot-transfer-root) {
            display: none !important;
          }
          #printable-lot-transfer-root {
            position: static !important;
            display: block !important;
            width: 100% !important;
            height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            overflow: visible !important;
          }
          #printable-lot-transfer-paper {
            position: static !important;
            display: block !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
            border: none !important;
            background: white !important;
            color: black !important;
            overflow: visible !important;
          }
          .print-hidden-bar {
            display: none !important;
          }
          tr,
          table,
          .page-break-avoid {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
        }
      `}</style>

      {/* Floating Action Toolbar (Hidden during print) */}
      <div className="fixed top-4 right-4 z-50 flex items-center gap-2 print-hidden-bar">
        <Button
          onClick={handlePrint}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground font-semibold text-xs rounded-lg shadow-lg hover:opacity-90 transition-all cursor-pointer"
        >
          <Printer className="h-4 w-4" />
          Print Transfer Slip
        </Button>
        <Button
          variant="outline"
          onClick={onClose}
          className="p-2 rounded-lg bg-card border border-border text-foreground hover:bg-muted shadow-lg transition-all cursor-pointer"
          title="Close Preview (Esc)"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Paper Document Container (A4 portrait proportion on screen, full printable page in print) */}
      <div
        id="printable-lot-transfer-paper"
        className="bg-white text-black w-full max-w-4xl p-8 rounded-xl shadow-2xl print:shadow-none print:p-0 print:m-0 my-auto text-xs font-sans border border-neutral-200 print:border-none"
      >
        {/* Company & Document Header */}
        <div className="border-b-2 border-black pb-4 mb-4 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-extrabold tracking-widest text-neutral-600 uppercase">
                Manufacturing Operations
              </span>
            </div>
 
            <h2 className="text-sm font-bold text-neutral-800 tracking-tight mt-0.5 uppercase">
              LOT TRANSFER SLIP
            </h2>
 
          </div>

          <div className="text-right font-mono">
            <div className="text-base font-black text-black">
              {transfer.requestNo || "-"}
            </div>
          </div>
        </div>

        {/* Transfer Routing & Details Grid */}
        <div className="grid grid-cols-3 gap-3 border border-neutral-300 rounded-lg p-3 mb-4 text-[11px] bg-neutral-50/80 print:bg-transparent">
          <div>
            <span className="font-bold text-neutral-500 block uppercase text-[9px]">
              Facility / Branch
            </span>
            <span className="font-extrabold text-black">{branchDisplay}</span>
          </div>

          <div>
            <span className="font-bold text-neutral-500 block uppercase text-[9px]">
              Transfer Date
            </span>
            <span className="font-bold font-mono text-black">
              {formatDate(transfer.transferDate)}
            </span>
          </div>

          <div>
            <span className="font-bold text-neutral-500 block uppercase text-[9px]">
              Total Volume / Units
            </span>
            <span className="font-extrabold font-mono text-black">
              {totalUnits.toLocaleString()}
              {transfer.unitName ? ` ${transfer.unitName}` : " PCS"}
            </span>
          </div>

          <div className="col-span-2">
            <span className="font-bold text-neutral-500 block uppercase text-[9px]">
              Transfer Route (Source → Target Lot)
            </span>
            <div className="flex items-center gap-2 font-bold text-black mt-0.5">
              <span className="bg-neutral-200/80 px-2 py-0.5 rounded text-[10px] font-mono">
                {sourceLotDisplay}
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-neutral-600 shrink-0" />
              <span className="bg-neutral-200/80 px-2 py-0.5 rounded text-[10px] font-mono">
                {targetLotDisplay}
              </span>
            </div>
          </div>

          <div>
            <span className="font-bold text-neutral-500 block uppercase text-[9px]">
              Total Line Items
            </span>
            <span className="font-bold font-mono text-black">
              {lineItems.length} {lineItems.length === 1 ? "Line Item" : "Line Items"}
            </span>
          </div>

          <div className="col-span-3 border-t border-neutral-200 pt-2 mt-1">
            <span className="font-bold text-neutral-500 block uppercase text-[9px]">
              Operational Justification / Reason
            </span>
            <span className="text-neutral-800 italic">
              {transfer.reason || "Standard operational manufacturing transfer"}
            </span>
          </div>
        </div>

        {/* Line Items Table */}
        <div className="mb-5 border border-neutral-300 rounded-lg overflow-hidden page-break-avoid">
          <div className="bg-neutral-900 text-white px-3 py-1.5 flex items-center justify-between border-b border-neutral-800 text-[11px] font-bold uppercase tracking-wider">
            <span>Products &amp; Batch Allocations</span>
            <span className="font-mono text-[9px] text-neutral-300">
              {lineItems.length} SKU Allocation(s)
            </span>
          </div>

          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="bg-neutral-100 text-neutral-800 font-bold uppercase border-b border-neutral-300 text-[9px]">
                <th className="py-1.5 px-2 text-center w-8 border-r border-neutral-300">#</th>
                <th className="py-1.5 px-2 text-left border-r border-neutral-300 min-w-[170px]">Product SKU &amp; Description</th>
                <th className="py-1.5 px-2 text-left border-r border-neutral-300 w-24">Source Batch</th>
                <th className="py-1.5 px-2 text-left border-r border-neutral-300 w-24">Target Batch</th>
                <th className="py-1.5 px-2 text-center border-r border-neutral-300 w-20">Mfg Date</th>
                <th className="py-1.5 px-2 text-center border-r border-neutral-300 w-20">Expiry Date</th>
                <th className="py-1.5 px-2 text-right border-r border-neutral-300 w-15">Qty</th>
                <th className="py-1.5 px-2 text-left min-w-[130px]">Remarks</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-neutral-500 italic">
                    No individual batch lines recorded for this transfer.
                  </td>
                </tr>
              ) : (
                lineItems.map((item, idx) => {
                  const pDesc = item.productDescription;
 
                  const pCode = item.productCode && item.productCode !== "-" ? item.productCode : "";
                  const primaryTitle = pDesc || "-";
                  const mfgDate = formatDate(item.sourceManufacturingDate);
                  const expDate = formatDate(item.sourceExpiryDate);
                  const lineRemarks = item.lineRemarks || "-";

                  return (
                    <tr
                      key={item.detailId || idx}
                      className="border-b last:border-b-0 border-neutral-200 hover:bg-neutral-50/50"
                    >
                      <td className="py-1.5 px-2 text-center font-mono border-r border-neutral-200">
                        {item.lineNo || idx + 1}
                      </td>
                      <td className="py-1.5 px-2 border-r border-neutral-200">
                        <div className="font-bold text-black leading-tight">{primaryTitle}</div>
                        <div className="text-[9px] text-neutral-600 font-mono flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                          {pCode && <span>SKU: {pCode}</span>}
                           
                        </div>
                      </td>
                      <td className="py-1.5 px-2 font-mono font-semibold border-r border-neutral-200">
                        {item.sourceBatchNo || "-"}
                      </td>
                      <td className="py-1.5 px-2 font-mono font-semibold border-r border-neutral-200">
                        {item.targetBatchNo || "-"}
                      </td>
                      <td className="py-1.5 px-2 text-center font-mono text-neutral-700 border-r border-neutral-200">
                        {mfgDate}
                      </td>
                      <td className="py-1.5 px-2 text-center font-mono text-neutral-700 border-r border-neutral-200">
                        {expDate}
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono font-black text-black border-r border-neutral-200">
                        {(Number(item.quantity) || 0).toLocaleString()}
                       
                      </td>
                      <td className="py-1.5 px-2 text-[10px] text-neutral-800 break-words whitespace-normal leading-tight">
                        {lineRemarks}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {lineItems.length > 0 && (
              <tfoot>
                <tr className="bg-neutral-100 font-bold border-t-2 border-neutral-400">
                  <td colSpan={6} className="py-1.5 px-2 text-right uppercase text-[9px] border-r border-neutral-300">
                    Grand Total Transferred:
                  </td>
                  <td className="py-1.5 px-2 text-right font-mono font-black text-black border-r border-neutral-300">
                    {totalUnits.toLocaleString()}
                    
                  </td>
                  <td className="py-1.5 px-2 text-[9px] text-neutral-500 font-mono">
                    {lineItems.length} line(s)
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* 3-Party Verification & Sign-Off Matrix */}
        <div className="grid grid-cols-3 gap-4 pt-3 border-t-2 border-black page-break-avoid text-[10px]">
          {/* Box 1: Requested By */}
          <div className="space-y-4 border border-neutral-300 rounded-lg p-2.5">
            <div>
              <span className="font-bold text-neutral-600 block uppercase text-[8px] tracking-wider">
                1. Requested By
              </span>
              <div className="font-bold text-black mt-0.5">
                {transfer.requestedByName || "—"}
              </div>
              <div className="text-[9px] text-neutral-500 font-mono">
                {transfer.requestedAt
                  ? formatDateTime(transfer.requestedAt)
                  : formatDate(transfer.transferDate)}
              </div>
            </div>
            <div className="pt-4 border-b border-dashed border-neutral-400"></div>
            <div className="text-[8px] text-center text-neutral-400 uppercase">
              Signature &amp; Date
            </div>
          </div>

          {/* Box 2: QA Approved By */}
          <div className="space-y-4 border border-neutral-300 rounded-lg p-2.5">
            <div>
              <span className="font-bold text-neutral-600 block uppercase text-[8px] tracking-wider">
                2. QA Approved By
              </span>
              <div className="font-bold text-black mt-0.5">
                {transfer.approvedByName ||
                  (transfer.status === "Approved" || transfer.status === "Posted"
                    ? "-"
                    : "Pending QA Inspection")}
              </div>
              <div className="text-[9px] text-neutral-500 font-mono">
                {transfer.approvedAt ? formatDateTime(transfer.approvedAt) : "-"}
              </div>
            </div>
            <div className="pt-4 border-b border-dashed border-neutral-400"></div>
            <div className="text-[8px] text-center text-neutral-400 uppercase">
              Signature &amp; Date
            </div>
          </div>

          {/* Box 3: Posted By */}
          <div className="space-y-4 border border-neutral-300 rounded-lg p-2.5">
            <div>
              <span className="font-bold text-neutral-600 block uppercase text-[8px] tracking-wider">
                3. Posted By
              </span>
              <div className="font-bold text-black mt-0.5">
                {transfer.postedByName ||
                  (transfer.status === "Posted"
                    ? "-"
                    : "Pending Floor Posting")}
              </div>
              <div className="text-[9px] text-neutral-500 font-mono">
                {transfer.postedAt ? formatDateTime(transfer.postedAt) : "-"}
              </div>
            </div>
            <div className="pt-4 border-b border-dashed border-neutral-400"></div>
            <div className="text-[8px] text-center text-neutral-400 uppercase">
              Signature &amp; Date
            </div>
          </div>
        </div>

        {/* System & Audit Note Footer */}
        <div className="mt-4 pt-2 border-t border-neutral-200 flex items-center justify-between text-[8px] text-neutral-500">
          <span>
           Manufacturing Management System  
          </span>
          <span>
            {printedAtStr}
          </span>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
