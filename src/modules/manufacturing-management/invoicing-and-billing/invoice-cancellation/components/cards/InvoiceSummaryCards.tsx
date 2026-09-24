"use client";

import { motion } from "framer-motion";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getCardColor } from "@/modules/manufacturing-management/invoicing-and-billing/invoice-cancellation/lib/utils";
import { AlertCircle, Clock, FileText } from "lucide-react";

interface InvoiceSummaryCardsProps {
  stats: {
    totalEligible: number;
    pending: number;
  };
}

export function InvoiceSummaryCards({ stats }: InvoiceSummaryCardsProps) {
  const cards = [
    {
      title: "Eligible Invoices",
      value: stats.totalEligible,
      subtitle: "Current active booking invoices ready for review",
      icon: FileText,
      iconColor: "text-blue-600 dark:text-blue-400",
      iconBg: "bg-blue-500/10",
      borderColor: "border-blue-500/20",
    },
    {
      title: "Locked for Review",
      value: stats.pending,
      subtitle: "Invoices currently pending auditor approval",
      icon: Clock,
      iconColor: "text-amber-600 dark:text-amber-400",
      iconBg: "bg-amber-500/10",
      borderColor: "border-amber-500/20",
    },
    {
      title: "Cancellation Policy",
      value: null,
      subtitle:
        "Only 'Booking' type invoices can be cancelled. Voids reflect after Audit approval.",
      icon: AlertCircle,
      iconColor: "text-indigo-600 dark:text-indigo-400",
      iconBg: "bg-indigo-500/10",
      borderColor: "border-indigo-500/20",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {cards.map((card, index) => {
        const Icon = card.icon;
        return (
          <motion.div
            key={card.title}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.3,
              delay: index * 0.07,
              ease: "easeOut",
            }}
            whileHover={{ y: -3, transition: { duration: 0.2 } }}
            className={`col-span-1 ${index === 0 ? "col-span-2 lg:col-span-1" : ""}`}
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
                      Standard
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
