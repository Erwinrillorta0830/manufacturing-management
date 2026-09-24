"use client";

import { motion } from "framer-motion";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getCardColor } from "@/modules/manufacturing-management/invoicing-and-billing/invoice-cancellation/lib/utils";
import {
  AlertCircleIcon,
  CheckCircle,
  ListChecks,
  ShieldAlert,
} from "lucide-react";

interface ApprovalSummaryCardsProps {
  stats: {
    approved: number;
    pending: number;
    highValue: number;
  };
}

export function InvoiceSummaryApprovalCard({
  stats,
}: ApprovalSummaryCardsProps) {
  const cards = [
    {
      title: "Approved Invoices",
      value: stats.approved,
      subtitle: "Voided & processed by auditor",
      icon: CheckCircle,
      iconColor: "text-emerald-600 dark:text-emerald-400",
      iconBg: "bg-emerald-500/10",
      borderColor: "border-emerald-500/20",
    },
    {
      title: "Pending Invoices",
      value: stats.pending,
      subtitle: "Invoices awaiting audit review",
      icon: ListChecks,
      iconColor: "text-amber-600 dark:text-amber-400",
      iconBg: "bg-amber-500/10",
      borderColor: "border-amber-500/20",
    },
    {
      title: "High Value Alerts",
      value: stats.highValue,
      subtitle: "Invoices exceeding > ₱20,000",
      icon: AlertCircleIcon,
      iconColor: "text-rose-600 dark:text-rose-400",
      iconBg: "bg-rose-500/10",
      borderColor: "border-rose-500/20",
    },
    {
      title: "Audit Protocol",
      value: null,
      subtitle:
        "Approving voids the invoice and returns Sales Order to 'For Invoicing'.",
      icon: ShieldAlert,
      iconColor: "text-blue-600 dark:text-blue-400",
      iconBg: "bg-blue-500/10",
      borderColor: "border-blue-500/20",
    },
  ];

  return (
    <div className="grid grid-cols-2 auto-rows-min gap-4 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4">
      {cards.map((card, index) => {
        const Icon = card.icon;
        return (
          <motion.div
            key={card.title}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.3,
              delay: index * 0.06,
              ease: "easeOut",
            }}
            whileHover={{ y: -3, transition: { duration: 0.2 } }}
            className="col-span-1"
          >
            <Card
              className={`@container/card h-full bg-linear-to-t ${getCardColor(
                index,
              )} ${card.borderColor} shadow-xs relative transition-shadow hover:shadow-md backdrop-blur-xs`}
            >
              <CardHeader className="p-4 sm:p-5">
                <div className="flex items-start justify-between gap-2">
                  <CardDescription className="text-xs sm:text-sm font-medium text-muted-foreground">
                    {card.title}
                  </CardDescription>
                  <div
                    className={`rounded-lg p-2 ${card.iconBg} ${card.iconColor} shrink-0`}
                  >
                    <Icon className="size-4 sm:size-5" />
                  </div>
                </div>

                <CardTitle className="mt-1 text-xl sm:text-2xl font-bold tabular-nums tracking-tight text-foreground @[250px]/card:text-3xl">
                  {card.value !== null ? (
                    card.value
                  ) : (
                    <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                      Protected
                    </span>
                  )}
                </CardTitle>

                <CardDescription className="text-[11px] sm:text-xs text-muted-foreground/90 mt-1 line-clamp-2">
                  {card.subtitle}
                </CardDescription>
              </CardHeader>
            </Card>
          </motion.div>
        );
      })}
    </div>
  );
}
