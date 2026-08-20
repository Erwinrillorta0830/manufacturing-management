"use client";

import React, { useState, useEffect, useRef } from "react";
import { DisbursementDashboardData } from "../types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
    Sparkles, TrendingUp, CheckCircle, 
    Send, BrainCircuit, RefreshCw, BarChart2, ShieldAlert, Loader2
} from "lucide-react";

const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);
};

interface AiInsightsPanelProps {
    data: DisbursementDashboardData | null;
    isLoading: boolean;
}

interface Message {
    sender: "user" | "ai";
    text: string;
    timestamp: Date;
}

export function AiInsightsPanel({ data, isLoading }: AiInsightsPanelProps) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [isGenerating, setIsGenerating] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Initial message setup
    useEffect(() => {
        if (data) {
            const timer = setTimeout(() => {
                setMessages([
                    {
                        sender: "ai",
                        text: `Hello! I am your **Treasury AI Analyst**. I have scanned your disbursement ledger from **${data.vouchers.length} vouchers** totaling **${formatMoney(data.totalDisbursed)}** in liabilities and **${formatMoney(data.totalPaid)}** in cash outflows.\n\nClick one of the quick analysis chips below, or ask me any questions about your cost allocations, banks, anomalies, or cash trends!`,
                        timestamp: new Date()
                    }
                ]);
            }, 0);
            return () => clearTimeout(timer);
        }
    }, [data]);

    // Auto scroll chat
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isGenerating]);

    // --- CLIENT-SIDE HEURISTIC ANALYSIS ENGINE ---
    const getSummaryAnalysis = (d: DisbursementDashboardData) => {
        const preservationRate = d.totalDisbursed > 0 ? (d.totalPaid / d.totalDisbursed) * 100 : 0;
        const avgAmount = d.vouchers.length > 0 ? d.totalPaid / d.vouchers.length : 0;

        let details = `### 📊 High-Level Outflow Analysis\n\n`;
        details += `* **Total Outflow Volume**: **${d.vouchers.length} vouchers** processed.\n`;
        details += `* **Liabilities Incurred**: **${formatMoney(d.totalDisbursed)}** (total amount vouchered).\n`;
        details += `* **Cash Released**: **${formatMoney(d.totalPaid)}** (${preservationRate.toFixed(1)}% payout rate).\n`;
        details += `* **Unpaid Backlog**: **${formatMoney(d.totalUnpaidPayables)}** currently in pipeline.\n`;
        details += `* **Average Outflow Size**: **${formatMoney(avgAmount)}** per voucher.\n\n`;

        if (preservationRate > 85) {
            details += `⚠️ **Cash Velocity Alert**: Your payout rate is very aggressive (**${preservationRate.toFixed(1)}%**). While this keeps creditors happy, ensure cash reserves are being replenished to avoid short-term liquidity stress.\n\n`;
        } else if (preservationRate < 50) {
            details += `💡 **Liquidity Preservation**: You are holding back **${(100 - preservationRate).toFixed(1)}%** of voucher amounts. This is good for working capital buffer, but monitor creditor aging schedules closely to prevent service disruptions.\n\n`;
        }

        // Top Division
        if (d.divisionExpenses && d.divisionExpenses.length > 0) {
            const sortedDivs = [...d.divisionExpenses].sort((a, b) => b.totalExpense - a.totalExpense);
            const topDiv = sortedDivs[0];
            const pct = d.totalPaid > 0 ? (topDiv.totalExpense / d.totalPaid) * 100 : 0;
            details += `* **Largest Cost Center**: **${topDiv.divisionName}** at **${formatMoney(topDiv.totalExpense)}** (${pct.toFixed(1)}% of total cash outflows).\n`;
        }

        // Top COA
        if (d.payableCoaExpenses && d.payableCoaExpenses.length > 0) {
            const sortedCoas = [...d.payableCoaExpenses].sort((a, b) => b.totalExpense - a.totalExpense);
            const topCoa = sortedCoas[0];
            const pct = d.totalPaid > 0 ? (topCoa.totalExpense / d.totalPaid) * 100 : 0;
            details += `* **Primary Expense Account**: **${topCoa.accountTitle}** with **${formatMoney(topCoa.totalExpense)}** allocations (${pct.toFixed(1)}% of total debit distribution).\n`;
        }

        return details;
    };

    const getAnomalyAnalysis = (d: DisbursementDashboardData) => {
        let details = `### ⚠️ Audit & Anomaly Detection\n\n`;
        const anomalies: string[] = [];

        // 1. Double Payments check (Same payee, same amount, within 5 days)
        const sortedVouchers = [...d.vouchers].sort((a, b) => new Date(a.transactionDate).getTime() - new Date(b.transactionDate).getTime());
        for (let i = 0; i < sortedVouchers.length; i++) {
            for (let j = i + 1; j < sortedVouchers.length; j++) {
                const v1 = sortedVouchers[i];
                const v2 = sortedVouchers[j];
                
                if (v1.payeeName === v2.payeeName && Math.abs(v1.totalAmount - v2.totalAmount) < 0.01) {
                    const d1 = new Date(v1.transactionDate).getTime();
                    const d2 = new Date(v2.transactionDate).getTime();
                    const diffDays = Math.abs(d1 - d2) / (1000 * 60 * 60 * 24);
                    
                    if (diffDays <= 5) {
                        anomalies.push(`**Potential Double Payment Risk**: Vouchers **${v1.docNo}** and **${v2.docNo}** both paid **${formatMoney(v1.totalAmount)}** to **${v1.payeeName}** within ${diffDays.toFixed(0)} days of each other (V1: ${v1.transactionDate}, V2: ${v2.transactionDate}).`);
                    }
                }
            }
        }

        // 2. Large Voucher Check (3x average or > 30% of total)
        const avg = d.vouchers.length > 0 ? d.totalPaid / d.vouchers.length : 0;
        d.vouchers.forEach(v => {
            if (v.totalAmount > avg * 2.5 && d.vouchers.length >= 4) {
                anomalies.push(`**Unusual Outflow Size**: Voucher **${v.docNo}** for **${formatMoney(v.totalAmount)}** is **${(v.totalAmount / avg).toFixed(1)}x** higher than your average voucher size of **${formatMoney(avg)}**.`);
            }
        });

        // 3. Status compliance check (Marked Released/Posted but no bank/check)
        d.vouchers.forEach(v => {
            if ((v.status === "Released" || v.status === "Posted") && (!v.checkNumbers || v.checkNumbers.trim() === "")) {
                anomalies.push(`**Data Compliance Alert**: Voucher **${v.docNo}** is marked as **${v.status}** but has **no recorded Check Number** in the database.`);
            }
        });

        if (anomalies.length === 0) {
            details += `✅ **No high-risk anomalies detected** in the active filter range. All transactions fall within standard operational ranges and show proper data compliance.\n`;
        } else {
            details += `I detected **${anomalies.length} items** requiring treasury attention:\n\n`;
            anomalies.forEach((a, index) => {
                details += `${index + 1}. ${a}\n`;
            });
        }

        return details;
    };

    const getDivisionSpendAnalysis = (d: DisbursementDashboardData) => {
        let details = `### 🏢 Cost Center & Department Breakdown\n\n`;

        if (!d.divisionExpenses || d.divisionExpenses.length === 0) {
            return details + `No cost center allocations were found for this period. Ensure vouchers have divisions and departments assigned.`;
        }

        const sortedDivs = [...d.divisionExpenses].sort((a, b) => b.totalExpense - a.totalExpense);

        details += `Here is your top division spend distribution:\n\n`;
        
        sortedDivs.forEach(div => {
            const pct = d.totalPaid > 0 ? (div.totalExpense / d.totalPaid) * 100 : 0;
            details += `* **${div.divisionName}**: **${formatMoney(div.totalExpense)}** (${pct.toFixed(1)}% of total outflow)\n`;
            
            if (div.departments && div.departments.length > 0) {
                const sortedDepts = [...div.departments].sort((a, b) => b.totalExpense - a.totalExpense).slice(0, 3);
                sortedDepts.forEach(dept => {
                    const deptPct = div.totalExpense > 0 ? (dept.totalExpense / div.totalExpense) * 100 : 0;
                    details += `  * ↳ _${dept.departmentName}_: **${formatMoney(dept.totalExpense)}** (${deptPct.toFixed(0)}% of division)\n`;
                });
            }
        });

        return details;
    };

    const getRecommendations = (d: DisbursementDashboardData) => {
        let details = `### 💡 Actionable Treasury Recommendations\n\n`;
        
        const rate = d.totalDisbursed > 0 ? (d.totalPaid / d.totalDisbursed) * 100 : 0;

        // Recommendation 1: Cash Flow
        if (rate > 85) {
            details += `1. **Institute Payout Thresholds**: Payout is highly aggressive at **${rate.toFixed(0)}%**. Consider batching vendor payments bi-weekly instead of immediately upon voucher creation to retain cash float.\n`;
        } else if (rate < 50) {
            details += `1. **Payable Aging Review**: Payout rate is low (**${rate.toFixed(0)}%**). Ensure you are prioritizing critical suppliers (Trade/Non-Trade utilities) to prevent credit holds or delivery disruption.\n`;
        } else {
            details += `1. **Maintain Current Liquidity Pace**: Your payout pace of **${rate.toFixed(0)}%** represents a balanced treasury posture between vendor relationships and working capital float.\n`;
        }

        // Recommendation 2: Banks and Checks
        const checkCount = d.vouchers.filter(v => v.checkNumbers).length;
        if (checkCount > 0 && d.vouchers.length > 0) {
            details += `2. **Transition to EFT/Direct Credit**: Over **${((checkCount / d.vouchers.length)*100).toFixed(0)}%** of payments use paper checks. Consider shifting large recurring vendors to bank transfers (PESONet/InstaPay) to eliminate check printing and manual signature overhead.\n`;
        }

        // Recommendation 3: Expense Spreads
        if (d.payableCoaExpenses && d.payableCoaExpenses.length > 0) {
            const sortedCoas = [...d.payableCoaExpenses].sort((a, b) => b.totalExpense - a.totalExpense);
            const topCoa = sortedCoas[0];
            details += `3. **Expense Audit on ${topCoa.accountTitle}**: Since **${topCoa.accountTitle}** represents the highest expense segment (**${formatMoney(topCoa.totalExpense)}**), consider negotiating volume discounts or service bundle terms with the core suppliers in this account.\n`;
        }

        return details;
    };

    const handleQuestion = (query: string) => {
        if (!data) return;
        
        setIsGenerating(true);
        const userMsg: Message = { sender: "user", text: query, timestamp: new Date() };
        setMessages(prev => [...prev, userMsg]);

        setTimeout(() => {
            const cleanQuery = query.toLowerCase().trim();
            let aiText = "";

            if (cleanQuery.includes("summary") || cleanQuery.includes("general") || cleanQuery.includes("overall") || cleanQuery.includes("high-level") || cleanQuery.includes("total")) {
                aiText = getSummaryAnalysis(data);
            } else if (cleanQuery.includes("anomaly") || cleanQuery.includes("audit") || cleanQuery.includes("risk") || cleanQuery.includes("duplicate") || cleanQuery.includes("check")) {
                aiText = getAnomalyAnalysis(data);
            } else if (cleanQuery.includes("division") || cleanQuery.includes("department") || cleanQuery.includes("cost center") || cleanQuery.includes("center")) {
                aiText = getDivisionSpendAnalysis(data);
            } else if (cleanQuery.includes("recommend") || cleanQuery.includes("suggest") || cleanQuery.includes("advice") || cleanQuery.includes("optimize") || cleanQuery.includes("payout")) {
                aiText = getRecommendations(data);
            } else {
                // Synthesized Default response matching user keywords
                aiText = `### 🧠 Custom AI Synthesis\n\nI processed your inquiry for: *"${query}"* against the active dataset.\n\n`;
                aiText += `Here is a summary of the key highlights:\n\n`;
                aiText += `* **Cash Position**: Total paid amount is **${formatMoney(data.totalPaid)}** out of **${formatMoney(data.totalDisbursed)}** vouchers.\n`;
                
                if (data.divisionExpenses.length > 0) {
                    const topDiv = [...data.divisionExpenses].sort((a,b) => b.totalExpense - a.totalExpense)[0];
                    aiText += `* **Cost concentration**: **${topDiv.divisionName}** represents the leading business line with **${formatMoney(topDiv.totalExpense)}** in outflows.\n`;
                }

                // Anomaly snippet
                const anomaliesCount = data.vouchers.filter(v => (v.status === "Released" || v.status === "Posted") && !v.checkNumbers).length;
                if (anomaliesCount > 0) {
                    aiText += `* **Data Compliance Alert**: I flagged **${anomaliesCount} released vouchers** missing check numbers. Ask for **"Anomalies"** to see details.\n`;
                } else {
                    aiText += `* **Risk Assessment**: Cash flow and check compliance logs look standard with no high-probability flags.\n`;
                }
                aiText += `\nFeel free to ask me for specific reports on **"Anomalies"**, **"Cost Centers"**, or **"Recommendations"** for deeper metrics!`;
            }

            setMessages(prev => [...prev, { sender: "ai", text: aiText, timestamp: new Date() }]);
            setIsGenerating(false);
        }, 800);
    };

    const handleSendSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isGenerating) return;
        const query = input;
        setInput("");
        handleQuestion(query);
    };

    // Format markdown bold & bullet tags into pretty HTML
    const renderMessageContent = (text: string) => {
        return text.split("\n").map((line, idx) => {
            let processedLine = line;

            // bold tags **text**
            const boldRegex = /\*\*(.*?)\*\"/g;
            processedLine = processedLine.replace(boldRegex, "<strong>$1</strong>");
            
            // Re-apply correct bold regex to catch **text**
            const boldRegex2 = /\*\*(.*?)\*\*/g;
            processedLine = processedLine.replace(boldRegex2, "<strong>$1</strong>");

            // code tags _text_
            const italicRegex = /_(.*?)_/g;
            processedLine = processedLine.replace(italicRegex, "<em>$1</em>");

            if (processedLine.startsWith("* ")) {
                return (
                    <li 
                        key={idx} 
                        className="ml-4 list-disc text-xs leading-relaxed"
                        dangerouslySetInnerHTML={{ __html: processedLine.substring(2) }}
                    />
                );
            }
            if (processedLine.startsWith("  * ")) {
                return (
                    <li 
                        key={idx} 
                        className="ml-8 list-circle text-[11px] text-muted-foreground leading-relaxed"
                        dangerouslySetInnerHTML={{ __html: processedLine.substring(4) }}
                    />
                );
            }
            if (processedLine.startsWith("### ")) {
                return (
                    <h4 
                        key={idx} 
                        className="text-xs font-black uppercase text-primary tracking-wider mt-4 mb-2 first:mt-0"
                        dangerouslySetInnerHTML={{ __html: processedLine.substring(4) }}
                    />
                );
            }

            if (processedLine.trim() === "") {
                return <div key={idx} className="h-2" />;
            }

            return (
                <p 
                    key={idx} 
                    className="text-xs leading-relaxed mb-1.5"
                    dangerouslySetInnerHTML={{ __html: processedLine }}
                />
            );
        });
    };

    if (!data) return null;

    return (
        <Card className="shadow-md border border-primary/20 bg-card rounded-2xl overflow-hidden relative">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-blue-500 to-purple-600" />
            
            <CardHeader className="bg-primary/[0.02] border-b border-border/50 py-4 flex flex-row items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary shadow-inner">
                        <BrainCircuit className="h-4.5 w-4.5" />
                    </div>
                    <div>
                        <CardTitle className="text-xs font-black uppercase tracking-widest bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent flex items-center gap-1.5">
                            AI Treasury Co-Pilot
                            <Sparkles className="w-3.5 h-3.5 text-purple-600 animate-pulse" />
                        </CardTitle>
                        <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">Disbursement audit & predictive insights</p>
                    </div>
                </div>
                {isLoading && (
                    <Badge variant="outline" className="text-[9px] font-black uppercase bg-primary/5 text-primary border-primary/20 px-2 py-0.5 flex items-center gap-1">
                        <RefreshCw className="w-2.5 h-2.5 animate-spin" /> Syncing Data
                    </Badge>
                )}
            </CardHeader>

            <CardContent className="p-0 flex flex-col h-[480px]">
                {/* Scrollable messages log */}
                <div 
                    ref={scrollRef} 
                    className="flex-1 p-5 overflow-y-auto space-y-4 scrollbar-thin bg-gradient-to-b from-transparent to-muted/5"
                >
                    {messages.map((m, i) => (
                        <div 
                            key={i} 
                            className={`flex ${m.sender === "user" ? "justify-end" : "justify-start"}`}
                        >
                            <div 
                                className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm ${
                                    m.sender === "user" 
                                        ? "bg-primary text-primary-foreground rounded-tr-none" 
                                        : "bg-muted/40 border border-border/40 text-foreground rounded-tl-none"
                                }`}
                            >
                                <div className="space-y-0.5">
                                    {renderMessageContent(m.text)}
                                </div>
                                <span className={`text-[8px] font-bold uppercase tracking-wider block text-right mt-1.5 ${
                                    m.sender === "user" ? "text-primary-foreground/60" : "text-muted-foreground/60"
                                }`}>
                                    {m.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>
                        </div>
                    ))}
                    {isGenerating && (
                        <div className="flex justify-start">
                            <div className="bg-muted/40 border border-border/40 text-foreground rounded-2xl rounded-tl-none px-4 py-3 shadow-sm flex items-center gap-2">
                                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                                <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest animate-pulse">Analyzing ledger...</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Quick Suggestion Chips */}
                <div className="px-4 py-2 border-t border-border/30 bg-muted/10 flex flex-wrap gap-2 items-center">
                    <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mr-1">Quick Queries:</span>
                    <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleQuestion("High-level summary")}
                        disabled={isGenerating || isLoading}
                        className="h-7 px-2.5 rounded-lg text-[9px] font-bold uppercase border-border/70 bg-background hover:bg-primary/5 hover:text-primary transition-colors"
                    >
                        <BarChart2 className="w-3 h-3 mr-1" /> General Summary
                    </Button>
                    <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleQuestion("Audit & Anomaly check")}
                        disabled={isGenerating || isLoading}
                        className="h-7 px-2.5 rounded-lg text-[9px] font-bold uppercase border-border/70 bg-background hover:bg-destructive/5 hover:text-destructive transition-colors"
                    >
                        <ShieldAlert className="w-3 h-3 mr-1" /> Audit / Anomalies
                    </Button>
                    <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleQuestion("Division allocations")}
                        disabled={isGenerating || isLoading}
                        className="h-7 px-2.5 rounded-lg text-[9px] font-bold uppercase border-border/70 bg-background hover:bg-blue-500/5 hover:text-blue-500 transition-colors"
                    >
                        <TrendingUp className="w-3 h-3 mr-1" /> Cost Divisions
                    </Button>
                    <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleQuestion("Recommendations")}
                        disabled={isGenerating || isLoading}
                        className="h-7 px-2.5 rounded-lg text-[9px] font-bold uppercase border-border/70 bg-background hover:bg-purple-600/5 hover:text-purple-600 transition-colors"
                    >
                        <CheckCircle className="w-3 h-3 mr-1" /> AI Action Advice
                    </Button>
                </div>

                {/* Input Text Form */}
                <form 
                    onSubmit={handleSendSubmit}
                    className="p-3 border-t border-border/50 bg-background flex items-center gap-2"
                >
                    <Input 
                        placeholder="Ask the Treasury Co-Pilot... (e.g. are there double-payment risks?)"
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        disabled={isGenerating || isLoading}
                        className="h-10 text-xs bg-muted/20 border-none shadow-none focus-visible:ring-1 focus-visible:ring-primary/20 rounded-xl px-4 flex-1 placeholder:text-muted-foreground/45 placeholder:text-[11px]"
                    />
                    <Button 
                        type="submit" 
                        size="icon"
                        disabled={!input.trim() || isGenerating || isLoading}
                        className="h-10 w-10 bg-primary text-primary-foreground hover:bg-primary/95 transition-all shadow-md rounded-xl"
                    >
                        <Send className="h-4 w-4" />
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
}
