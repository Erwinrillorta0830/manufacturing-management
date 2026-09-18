// utils/ai.ts
// Client-side AI Simulation for Receivables Risk Analysis & Collection Drafts

import type { Invoice, ARMetrics } from '../types';

export interface AIInsights {
  summary: string;
  risks: string[];
  recommendations: string[];
}

export function generateAIInsights(invoices: Invoice[], metrics: ARMetrics): AIInsights {
  const overdueCount = metrics.overdueInvoices.length;
  const overdueTotal = metrics.overdueInvoices.reduce((s, i) => s + i.outstanding, 0);
  const outstandingTotal = metrics.totalOutstanding;
  const unpostedTotal = metrics.totalUnposted || 0;
  const realOutstanding = metrics.realOutstanding || Math.max(0, outstandingTotal - unpostedTotal);

  // Find top outstanding customer
  const customerMap: Record<string, number> = {};
  invoices.forEach(inv => {
    customerMap[inv.customer] = (customerMap[inv.customer] || 0) + inv.outstanding;
  });
  const sortedCustomers = Object.entries(customerMap).sort((a, b) => b[1] - a[1]);
  const topCustomer = sortedCustomers[0]?.[0] || 'N/A';
  const topCustomerAmount = sortedCustomers[0]?.[1] || 0;

  // Find top overdue salesman
  const salesmanMap: Record<string, number> = {};
  metrics.overdueInvoices.forEach(inv => {
    salesmanMap[inv.salesman] = (salesmanMap[inv.salesman] || 0) + inv.outstanding;
  });
  const sortedSalesmen = Object.entries(salesmanMap).sort((a, b) => b[1] - a[1]);
  const topSalesman = sortedSalesmen[0]?.[0] || 'N/A';

  const riskRatio = outstandingTotal > 0 ? (overdueTotal / outstandingTotal) * 100 : 0;

  let summary = `Currently, the Accounts Receivable outstanding balance stands at ₱${outstandingTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}. `;
  if (riskRatio > 40) {
    summary += `A critical concern is that ${riskRatio.toFixed(1)}% of your receivables (₱${overdueTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}) are overdue, indicating significant payment collection risks. `;
  } else if (riskRatio > 15) {
    summary += `Approximately ${riskRatio.toFixed(1)}% of receivables are overdue. Collection metrics are moderate but require active follow-ups. `;
  } else {
    summary += `Receivables are in healthy status with only ${riskRatio.toFixed(1)}% overdue. Active collection processes are working effectively. `;
  }

  if (unpostedTotal > 0) {
    summary += `Additionally, there is ₱${unpostedTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })} sitting in unposted collection pouches. Once fully cleared and committed to the ledger, your net AR exposure will decrease to ₱${realOutstanding.toLocaleString('en-PH', { minimumFractionDigits: 2 })}.`;
  }

  const risks: string[] = [];
  if (riskRatio > 30) {
    risks.push(`High exposure to default: ₱${overdueTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })} is currently past due across ${overdueCount} accounts.`);
  }
  if (topCustomerAmount > outstandingTotal * 0.25) {
    risks.push(`Concentration Risk: Client "${topCustomer}" holds ₱${topCustomerAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })} (${((topCustomerAmount / (outstandingTotal || 1)) * 100).toFixed(0)}% of total AR).`);
  }
  if (metrics.avgOverdue > 45) {
    risks.push(`Slow turnover: Average days overdue is ${metrics.avgOverdue} days, significantly higher than standard 30-day terms.`);
  }
  if (unpostedTotal > 0.05 * outstandingTotal) {
    risks.push(`Liquidation Bottleneck: ₱${unpostedTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })} in cash/checks remains unposted, delaying ledger reconciliation and cash flow recognition.`);
  }

  if (risks.length === 0) {
    risks.push("No major exposure or concentration risk detected in the current portfolio.");
  }

  const recommendations: string[] = [];
  if (unpostedTotal > 0) {
    recommendations.push(`Clear the ₱${unpostedTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })} unposted backlog. Direct the AR team to utilize the Settlement "Smart Match" tool to auto-allocate payment references and post the outstanding pouches.`);
  }
  if (overdueTotal > 0) {
    recommendations.push(`Initiate structured follow-up for the ${overdueCount} accounts currently in overdue status.`);
  }
  if (topCustomerAmount > 0) {
    recommendations.push(`Reach out to "${topCustomer}"'s account manager to discuss a structured payment schedule for their ₱${topCustomerAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })} outstanding balance.`);
  }
  if (topSalesman !== 'N/A') {
    recommendations.push(`Collaborate with Sales Representative "${topSalesman}" to address collection hurdles in their portfolio.`);
  }
  if (metrics.avgOverdue > 30) {
    recommendations.push("Offer a 1.5% to 2.0% early payment discount to clients with balances 0-30 days to accelerate cash conversion.");
  }

  return { summary, risks, recommendations };
}

export function getInvoiceRiskScore(invoice: Invoice): { score: number; level: 'Low' | 'Medium' | 'High'; reason: string } {
  if (invoice.status === 'Paid' || invoice.outstanding <= 0) {
    return { score: 0, level: 'Low', reason: 'Invoice is fully paid.' };
  }

  const overdueDays = invoice.overdue ?? -1;

  if (overdueDays < 0) {
    return { score: 15, level: 'Low', reason: 'Invoice is within standard credit terms and not yet due.' };
  }

  if (overdueDays <= 30) {
    const score = 40 + Math.round((overdueDays / 30) * 15);
    return { score, level: 'Medium', reason: `Invoice is past due by ${overdueDays} days. Moderate collection delay.` };
  }

  if (overdueDays <= 90) {
    const score = 60 + Math.round(((overdueDays - 30) / 60) * 20);
    return { score, level: 'High', reason: `Invoice is past due by ${overdueDays} days. High default risk.` };
  }

  return { score: 95, level: 'High', reason: `Critical delay: Invoice is past due by over 90 days (${overdueDays} days). Severe default risk.` };
}

export function generateCollectionTemplate(
  invoice: Invoice,
  tone: 'polite' | 'standard' | 'urgent',
  channel: 'email' | 'sms'
): string {
  const customer = invoice.customer;
  const invNo = invoice.invoiceNo;
  const amt = invoice.outstanding;
  const formattedAmt = `₱${amt.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
  const due = invoice.due ? new Date(invoice.due).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A';
  const overdueDays = invoice.overdue ?? 0;

  if (channel === 'sms') {
    if (tone === 'polite') {
      return `Hi ${customer}, this is a gentle reminder that invoice #${invNo} for ${formattedAmt} was due on ${due}. We appreciate your business and kindly ask you to settle it when possible. Thank you!`;
    }
    if (tone === 'urgent') {
      return `URGENT: Hi ${customer}, invoice #${invNo} for ${formattedAmt} is now ${overdueDays} days overdue. Please settle this immediately to prevent service disruption or credit hold. Contact us at finance@vos.com.`;
    }
    return `Hi ${customer}, reminder that invoice #${invNo} for ${formattedAmt} remains unpaid. It was due on ${due}. Please coordinate payment at your earliest convenience. Thank you.`;
  }

  // Email Templates
  if (tone === 'polite') {
    return `Subject: Courtesy Reminder: Invoice #${invNo} - ${customer}

Dear ${customer} Team,

I hope this email finds you well. 

We are writing to provide a quick courtesy update regarding your account. According to our records, Invoice #${invNo} for the amount of ${formattedAmt}, which was due on ${due}, remains open.

We value our partnership with you and would appreciate it if you could look into the status of this payment. If payment has already been sent, please disregard this email or share the transfer confirmation details.

For any questions, or if you need another copy of the invoice, feel free to reply to this message.

Best regards,
Finance Department
VOS System`;
  }

  if (tone === 'urgent') {
    return `Subject: URGENT NOTICE: Overdue Payment Required for Invoice #${invNo}

Dear ${customer} Management,

We are writing to bring your urgent attention to Invoice #${invNo} (Amount: ${formattedAmt}), which is now ${overdueDays} days overdue.

Despite our previous reminders, we have not received payment or a schedule update. Please be advised that continued delay may result in a temporary suspension of credit terms, delivery holds, or escalation.

We ask that you process this payment immediately or contact us today to discuss credit settlement. Please send the payment reference to finance@vos.com.

Sincerely,
Credit Operations
VOS System`;
  }

  // Standard Tone Email
  return `Subject: Statement of Account: Unpaid Invoice #${invNo}

Dear ${customer} Accounts Payable,

This is a reminder that Invoice #${invNo} (Outstanding: ${formattedAmt}) remains outstanding. This invoice was due on ${due} and is now past due.

Kindly verify the status of this invoice with your team. Please arrange for the settlement of this balance as soon as possible to maintain a clear account status.

Payment options and banking details can be provided upon request. If payment has already been made, please reply with the remittance advice.

Thank you for your prompt attention to this matter.

Regards,
Billing & Collections
VOS System`;
}
