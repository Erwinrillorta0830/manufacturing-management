import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_NAME = "vos_access_token";

interface APInsightSummary {
  recordCount: number;
  totalPayable: number;
  totalPaid: number;
  totalOutstanding: number;
  overdueCount: number;
  totalOverdue: number;
  categories: Array<{
    category: "Trade" | "Non-Trade";
    count: number;
    payable: number;
    paid: number;
    outstanding: number;
    overdue: number;
  }>;
  aging: Array<{ bucket: string; outstanding: number; note: string }>;
  topSuppliers: Array<{ name: string; outstanding: number }>;
}

interface APInsightRequest {
  summary: APInsightSummary;
}

interface APInsight {
  summary: string;
  healthStatus: "healthy" | "caution" | "critical";
  keyFindings: string[];
  risks: string[];
  recommendations: string[];
  focusAreas: Array<{
    category: "Trade" | "Non-Trade";
    headline: string;
    observations: string[];
  }>;
  topSupplier: { name: string; outstanding: number } | null;
  aging: Array<{ bucket: string; outstanding: number; note: string }>;
  generatedBy: "openai" | "anthropic" | "gemini" | "rules-engine";
  generatedAt: string;
}

type CategoryStats = APInsightSummary["categories"][number];

function asNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === "") return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(value);
}

function validSummary(value: unknown): value is APInsightSummary {
  if (!value || typeof value !== "object") return false;
  const summary = value as Partial<APInsightSummary>;
  return Number.isFinite(Number(summary.recordCount))
    && Array.isArray(summary.categories)
    && Array.isArray(summary.aging)
    && Array.isArray(summary.topSuppliers);
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json(
      { success: false, message: "Unauthorized" },
      { status: 401 },
    );
  }

  let body: APInsightRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, message: "Invalid JSON body" },
      { status: 400 },
    );
  }

  if (!validSummary(body?.summary)) {
    return NextResponse.json(
      { success: false, message: "Missing required field: summary" },
      { status: 400 },
    );
  }

  if (process.env.AI_PROVIDER && process.env.AI_API_KEY) {
    try {
      const insight = await callExternalAI(body.summary);
      return NextResponse.json({ success: true, data: insight });
    } catch (error) {
      console.error(
        "[AP AI-Insights] External provider failed, falling back to rules engine:",
        error,
      );
    }
  }

  return NextResponse.json({
    success: true,
    data: generateRulesBasedInsights(body.summary),
  });
}

async function callExternalAI(summary: APInsightSummary): Promise<APInsight> {
  const apiKey = process.env.AI_API_KEY;
  const apiUrl = process.env.AI_API_URL || "https://api.openai.com/v1/chat/completions";
  const model = process.env.AI_MODEL || "gpt-4o-mini";
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are a senior AP / treasury analyst. Respond with ONLY valid JSON of this shape:\n" +
            '{"summary":"","healthStatus":"healthy|caution|critical","keyFindings":[""],"risks":[""],"recommendations":[""],' +
            '"focusAreas":[{"category":"Trade|Non-Trade","headline":"","observations":[""]}],' +
            '"topSupplier":{"name":"","outstanding":0}|null,' +
            '"aging":[{"bucket":"0-30|31-60|61-90|91+","outstanding":0,"note":""}]}',
        },
        { role: "user", content: buildAIPrompt(summary) },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `AI provider error (${response.status}): ${await response.text().catch(() => "Unknown error")}`,
    );
  }

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content;
  if (!content) throw new Error("No response content from AI provider");

  try {
    return JSON.parse(content) as APInsight;
  } catch {
    const match = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (match) return JSON.parse(match[1]) as APInsight;
    throw new Error("Failed to parse AI response as JSON");
  }
}

function buildAIPrompt(summary: APInsightSummary): string {
  const trade = categoryStats(summary, "Trade");
  const nonTrade = categoryStats(summary, "Non-Trade");
  return [
    "Accounts Payable Analysis Request",
    "Headline metrics:",
    `- Records analyzed: ${summary.recordCount}`,
    `- Total payable: ${formatCurrency(summary.totalPayable)}`,
    `- Total paid: ${formatCurrency(summary.totalPaid)}`,
    `- Outstanding: ${formatCurrency(summary.totalOutstanding)}`,
    `- Overdue invoices: ${summary.overdueCount}`,
    "Trade vs Non-Trade:",
    `- Trade: ${trade.count} records, ${formatCurrency(trade.outstanding)} outstanding, ${trade.overdue} overdue`,
    `- Non-Trade: ${nonTrade.count} records, ${formatCurrency(nonTrade.outstanding)} outstanding, ${nonTrade.overdue} overdue`,
    "Aging buckets (outstanding):",
    ...summary.aging.map(
      (bucket) =>
        `- ${bucket.bucket}: ${formatCurrency(bucket.outstanding)} (${bucket.note})`,
    ),
    "Top suppliers by outstanding:",
    ...summary.topSuppliers.map(
      (supplier) =>
        `- ${supplier.name}: ${formatCurrency(supplier.outstanding)}`,
    ),
    "Provide detailed analysis.",
  ].join("\n");
}

function categoryStats(
  summary: APInsightSummary,
  category: "Trade" | "Non-Trade",
): CategoryStats {
  return summary.categories.find((item) => item.category === category) ?? {
    category,
    count: 0,
    payable: 0,
    paid: 0,
    outstanding: 0,
    overdue: 0,
  };
}

function buildFocusArea(
  category: "Trade" | "Non-Trade",
  stats: CategoryStats,
): APInsight["focusAreas"][number] {
  const settlementRate = stats.payable > 0
    ? (stats.paid / stats.payable) * 100
    : 0;
  const observations = [
    `${stats.count} record${stats.count === 1 ? "" : "s"} totalling ${formatCurrency(stats.outstanding)} outstanding.`,
    `Settlement rate: ${settlementRate.toFixed(1)}% (${formatCurrency(stats.paid)} paid of ${formatCurrency(stats.payable)}).`,
  ];

  if (stats.overdue > 0) {
    observations.push(
      `${stats.overdue} invoice${stats.overdue === 1 ? "" : "s"} currently past due.`,
    );
  } else if (stats.count > 0) {
    observations.push("No past-due invoices in this category.");
  }

  return {
    category,
    headline: category === "Trade"
      ? "Trade payables - operational supplier exposure"
      : "Non-Trade payables - overhead, services and expenses",
    observations,
  };
}

function generateRulesBasedInsights(summaryData: APInsightSummary): APInsight {
  const totalPayable = asNumber(summaryData.totalPayable);
  const totalPaid = asNumber(summaryData.totalPaid);
  const totalOutstanding = asNumber(
    summaryData.totalOutstanding,
    Math.max(0, totalPayable - totalPaid),
  );
  const overdueCount = asNumber(summaryData.overdueCount);
  const totalOverdue = asNumber(summaryData.totalOverdue);
  const settlementRate = totalPayable > 0
    ? (totalPaid / totalPayable) * 100
    : 0;
  const trade = categoryStats(summaryData, "Trade");
  const nonTrade = categoryStats(summaryData, "Non-Trade");
  const topSupplier = summaryData.topSuppliers[0] ?? null;
  const overdueRatio = totalPayable > 0 ? totalOverdue / totalPayable : 0;

  let healthStatus: APInsight["healthStatus"] = "healthy";
  if (
    overdueRatio > 0.5
    || overdueCount >= Math.max(5, summaryData.recordCount * 0.4)
  ) {
    healthStatus = "critical";
  } else if (overdueRatio > 0.2 || overdueCount > 0) {
    healthStatus = "caution";
  }

  const summary = [
    `Across ${summaryData.recordCount} AP records (${formatCurrency(totalPayable)} total payable, ${formatCurrency(totalPaid)} paid,`,
    `${formatCurrency(totalOutstanding)} outstanding), settlement is at ${settlementRate.toFixed(1)}% with`,
    `${overdueCount} invoice${overdueCount === 1 ? "" : "s"} past due totalling ${formatCurrency(totalOverdue)}.`,
    healthStatus === "healthy"
      ? "Cash position is healthy - keep current payment cadence."
      : healthStatus === "caution"
        ? "Watch the overdue queue: prioritize the largest exposures first to avoid late-payment penalties."
        : "Liquidity risk: a large share of payables are past due - escalate payments and renegotiate terms with the largest creditors.",
  ].join(" ");

  const keyFindings = [
    `Total payable: ${formatCurrency(totalPayable)} - settlement rate ${settlementRate.toFixed(1)}%.`,
    `Outstanding: ${formatCurrency(totalOutstanding)} across ${summaryData.recordCount} record${summaryData.recordCount === 1 ? "" : "s"}.`,
    `Past-due: ${overdueCount} invoice${overdueCount === 1 ? "" : "s"} (${formatCurrency(totalOverdue)}).`,
    `Trade share: ${trade.outstanding > 0 || nonTrade.outstanding > 0
      ? ((trade.outstanding / (trade.outstanding + nonTrade.outstanding || 1)) * 100).toFixed(1)
      : "0.0"}% of outstanding exposure.`,
  ];
  if (topSupplier) {
    keyFindings.push(
      `Largest exposure: ${topSupplier.name} at ${formatCurrency(topSupplier.outstanding)}.`,
    );
  }

  const risks: string[] = [];
  if (overdueCount > 0) {
    risks.push(
      `${overdueCount} invoice${overdueCount === 1 ? " is" : "s are"} past due, totalling ${formatCurrency(totalOverdue)} - late-payment penalties and supplier relationship strain are likely.`,
    );
  }
  const criticalBucket = summaryData.aging.find(
    (bucket) => bucket.bucket === "91+",
  );
  if (criticalBucket && criticalBucket.outstanding > 0) {
    risks.push(
      `${formatCurrency(criticalBucket.outstanding)} sits in the 91+ day bucket - escalate payments and review disputed items.`,
    );
  }
  if (
    topSupplier
    && totalOutstanding > 0
    && topSupplier.outstanding / totalOutstanding > 0.4
  ) {
    risks.push(
      `Supplier concentration risk: ${topSupplier.name} accounts for ${((topSupplier.outstanding / totalOutstanding) * 100).toFixed(1)}% of outstanding exposure.`,
    );
  }
  if (risks.length === 0) {
    risks.push("No significant risks identified in the current snapshot.");
  }

  const recommendations = [
    "Run an aging report weekly to catch newly-overdue invoices early.",
    "Concentrate payment runs on the largest creditors with the longest overdue balances first.",
  ];
  if (criticalBucket && criticalBucket.outstanding > 0) {
    recommendations.unshift(
      `Open a payment task for the ${formatCurrency(criticalBucket.outstanding)} in 91+ day invoices and review disputed items.`,
    );
  }
  if (
    topSupplier
    && totalOutstanding > 0
    && topSupplier.outstanding / totalOutstanding > 0.4
  ) {
    recommendations.unshift(
      `Negotiate extended payment terms with ${topSupplier.name} - they represent a large share of exposure.`,
    );
  }
  if (settlementRate < 60) {
    recommendations.push(
      "Settlement rate is below 60% - review payment discipline and approval bottlenecks.",
    );
  }
  recommendations.push(
    "Schedule a monthly review of supplier terms to align payment cycles with the cash-flow forecast.",
  );

  const focusAreas: APInsight["focusAreas"] = [];
  if (trade.count > 0) focusAreas.push(buildFocusArea("Trade", trade));
  if (nonTrade.count > 0) {
    focusAreas.push(buildFocusArea("Non-Trade", nonTrade));
  }

  return {
    summary,
    healthStatus,
    keyFindings,
    risks,
    recommendations,
    focusAreas,
    topSupplier,
    aging: summaryData.aging,
    generatedBy: process.env.AI_PROVIDER
      ? (process.env.AI_PROVIDER as APInsight["generatedBy"])
      : "rules-engine",
    generatedAt: new Date().toISOString(),
  };
}
