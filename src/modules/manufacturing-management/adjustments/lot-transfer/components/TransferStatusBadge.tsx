"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";
import {
  Clock,
  Send,
  CheckCircle2,
  FileCheck2,
  XCircle,
  Ban,
  RotateCcw,
} from "lucide-react";
import type { LotTransferStatus } from "../types";
import { cn } from "@/lib/utils";

interface TransferStatusBadgeProps {
  status: LotTransferStatus;
  className?: string;
}

export const TransferStatusBadge: React.FC<TransferStatusBadgeProps> = ({
  status,
  className,
}) => {
  switch (status) {
    case "Draft":
      return (
        <Badge
          variant="outline"
          className={cn("bg-slate-50 text-slate-700 border-slate-300 dark:bg-slate-900/50 dark:text-slate-300 dark:border-slate-700 gap-1", className)}
        >
          <Clock className="w-3 h-3 text-slate-500" />
          Draft
        </Badge>
      );
    case "Submitted":
      return (
        <Badge
          variant="outline"
          className={cn("bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800 gap-1", className)}
        >
          <Send className="w-3 h-3 text-amber-600 dark:text-amber-400" />
          Submitted
        </Badge>
      );
    case "Approved":
      return (
        <Badge
          variant="outline"
          className={cn("bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800 gap-1", className)}
        >
          <CheckCircle2 className="w-3 h-3 text-blue-600 dark:text-blue-400" />
          Approved
        </Badge>
      );
    case "Posted":
      return (
        <Badge
          variant="outline"
          className={cn("bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800 gap-1", className)}
        >
          <FileCheck2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
          Posted
        </Badge>
      );
    case "Rejected":
      return (
        <Badge
          variant="outline"
          className={cn("bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800 gap-1", className)}
        >
          <XCircle className="w-3 h-3 text-rose-600 dark:text-rose-400" />
          Rejected
        </Badge>
      );
    case "Cancelled":
      return (
        <Badge
          variant="outline"
          className={cn("bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-900/40 dark:text-gray-400 dark:border-gray-700 gap-1", className)}
        >
          <Ban className="w-3 h-3 text-gray-500" />
          Cancelled
        </Badge>
      );
    case "Reversed":
      return (
        <Badge
          variant="outline"
          className={cn("bg-purple-50 text-purple-700 border-purple-300 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800 gap-1", className)}
        >
          <RotateCcw className="w-3 h-3 text-purple-600 dark:text-purple-400" />
          Reversed
        </Badge>
      );
    default:
      return <Badge variant="outline" className={className}>-</Badge>;
  }
};
